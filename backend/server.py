"""DevAtlas API: app, auth, every route and startup seeding.

Run:  uvicorn server:app --host 0.0.0.0 --port 8000 --reload
Every route lives under /api. Routes on `api_router` require a bearer token;
only health, signup and login are on `public_router`.
"""
from __future__ import annotations

import os
import re
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal

import bcrypt
import jwt
from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

load_dotenv(Path(__file__).parent / ".env")

import checklists  # noqa: E402
import contract_export  # noqa: E402
import coverage as coverage_module  # noqa: E402
import procedures as procedures_module  # noqa: E402
import servicegraph  # noqa: E402
from datacontracts import CHANGE_POLICY, CONTRACT_KINDS, CONTRACTS, DIRECTIONS, owner_system  # noqa: E402
from deployments import FLOWS, STAGES, enrich_flow  # noqa: E402
from github_repo import GithubError, fetch_repo_files  # noqa: E402
from impact import build_graph  # noqa: E402
from ingest import analyze_upload  # noqa: E402
from md_blocks import blocks_to_md, md_to_blocks, read_minutes  # noqa: E402
from search import run_search  # noqa: E402
from seed_knowledge import (  # noqa: E402
    ARTICLES, CODING_STANDARDS, GLOSSARY, PATH, PROJECTS, SECTIONS, SYSTEMS, TEAM, VALIDATION_LIBRARY,
)
from snippets import SNIPPET_CATEGORIES, SNIPPETS  # noqa: E402
from translations import TRANSLATION_CATEGORIES, TRANSLATIONS  # noqa: E402

# Required configuration: no fallbacks, the app refuses to start without them.
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
CORS_ORIGINS = [o.strip() for o in os.environ["CORS_ORIGINS"].split(",") if o.strip()]

JWT_ALG = "HS256"
TOKEN_TTL = timedelta(days=7)
EDITOR_ROLES = {"maintainer", "owner"}
VERSION = "2.4"

state: dict[str, Any] = {}


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def get_db():
    return state["db"]


def format_doc(doc: dict | None) -> dict | None:
    """Mongo -> API: `_id` becomes `id`, datetimes become ISO strings."""
    if doc is None:
        return None
    doc = dict(doc)
    if "_id" in doc:
        doc["id"] = str(doc.pop("_id"))
    for k, v in list(doc.items()):
        if isinstance(v, datetime):
            doc[k] = iso(v)
    return doc


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")


# ---------------------------------------------------------------- seeding

async def seed_if_empty(db, name: str, docs: list[dict]) -> int:
    if not docs or await db[name].estimated_document_count() > 0:
        return 0
    stamp = now()
    rows = [{"origin": "SEED", "created_at": stamp, "updated": stamp, **d} for d in docs]
    await db[name].insert_many(rows)
    return len(rows)


def _article_seed() -> list[dict]:
    rows = []
    for order, a in enumerate(ARTICLES):
        blocks = md_to_blocks(a["source_md"])
        rows.append({**a, "blocks": blocks, "order": order, "read_minutes": read_minutes(blocks), "edited_by": "DevAtlas seed"})
    return rows


async def seed_all(db) -> None:
    await seed_if_empty(db, "projects", PROJECTS)
    await seed_if_empty(db, "team", TEAM)
    await seed_if_empty(db, "articles", _article_seed())
    await seed_if_empty(db, "glossary", [
        {"term": t, "system": s, "definition": d, "legacy_definition": ld, "modern_definition": md, "see_also": sa}
        for t, s, d, ld, md, sa in GLOSSARY
    ])
    coding = [
        {"rule_id": rid, "category": "coding", "topic": topic, "system": "both", "title": title, "rationale": why, "good": good, "bad": bad, "enforced": rid in {"CS-001", "CS-003", "CS-007"}}
        for rid, topic, title, why, good, bad in CODING_STANDARDS
    ]
    validation_view = [
        {"rule_id": v["rule_id"], "category": "validation", "topic": v["tier"], "system": v["system"], "title": v["name"], "rationale": v["constraint"], "good": v.get("message"), "bad": None, "enforced": v["enforced"]}
        for v in VALIDATION_LIBRARY
    ]
    await seed_if_empty(db, "rules", coding + validation_view)
    await seed_if_empty(db, "validation", [{**v, "version": "1.0", "reviewed": "2026-10-01"} for v in VALIDATION_LIBRARY])
    await seed_if_empty(db, "path", [{"step": n, "title": t, "detail": d, "article": a, "system": s} for n, t, d, a, s in PATH])
    await seed_if_empty(db, "snippets", SNIPPETS)
    await seed_if_empty(db, "translations", TRANSLATIONS)
    await seed_if_empty(db, "deployments", FLOWS)
    await seed_if_empty(db, "datacontracts", [{**c, "owner_system": owner_system(c)} for c in CONTRACTS])

    # Optional local demo maintainer: only when both env vars are set.
    demo_email, demo_password = os.environ.get("DEMO_EMAIL"), os.environ.get("DEMO_PASSWORD")
    if demo_email and demo_password and not await db.users.find_one({"email": demo_email.lower()}):
        await db.users.insert_one({
            "email": demo_email.lower(), "name": "Greta Lindqvist", "role": "maintainer",
            "password_hash": hash_password(demo_password), "created_at": now(), "origin": "SEED",
        })


async def ensure_indexes(db) -> None:
    await db.users.create_index("email", unique=True)
    await db.projects.create_index("slug", unique=True)
    await db.articles.create_index("slug", unique=True)
    await db.glossary.create_index("term", unique=True)
    await db.validation.create_index("rule_id", unique=True)
    await db.progress.create_index("user_id", unique=True)
    await db.checklist_progress.create_index([("user_id", 1), ("project_slug", 1)], unique=True)


@asynccontextmanager
async def lifespan(_: FastAPI):
    client = AsyncIOMotorClient(MONGO_URL, uuidRepresentation="standard", tz_aware=True)
    state["client"] = client
    state["db"] = client[DB_NAME]
    await ensure_indexes(state["db"])
    await seed_all(state["db"])
    yield
    client.close()


app = FastAPI(title="DevAtlas API", version=VERSION, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


# ---------------------------------------------------------------- auth

bearer = HTTPBearer(auto_error=False)


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except ValueError:
        return False


def make_token(user_id: str) -> str:
    return jwt.encode({"sub": user_id, "iat": now(), "exp": now() + TOKEN_TTL}, JWT_SECRET, algorithm=JWT_ALG)


def public_user(u: dict) -> dict:
    return {"id": str(u["_id"]), "email": u["email"], "name": u.get("name") or u["email"].split("@")[0], "role": u.get("role", "engineer")}


async def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    if not creds or creds.scheme.lower() != "bearer":
        raise HTTPException(401, "Sign in to continue.")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
        user = await get_db().users.find_one({"_id": ObjectId(payload["sub"])})
    except (jwt.PyJWTError, InvalidId, KeyError):
        raise HTTPException(401, "Your session is invalid or has expired. Sign in again.")
    if not user:
        raise HTTPException(401, "Your account no longer exists.")
    return public_user(user)


async def require_maintainer(user: dict = Depends(current_user)) -> dict:
    if user["role"] not in EDITOR_ROLES:
        raise HTTPException(403, "Only maintainers can change shared content. Suggest the change on the Feedback page instead.")
    return user


public_router = APIRouter(prefix="/api")
api_router = APIRouter(prefix="/api", dependencies=[Depends(current_user)])


class SignupIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(default=None, max_length=80)


class LoginIn(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=128)


EMAIL_RX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@public_router.get("/")
async def health():
    db_ok = True
    try:
        await get_db().command("ping")
    except Exception:  # pragma: no cover - reported, not raised
        db_ok = False
    return {"status": "ok", "service": "devatlas", "version": VERSION, "database": "up" if db_ok else "down"}


@public_router.post("/auth/signup")
async def signup(body: SignupIn):
    email = body.email.strip().lower()
    if not EMAIL_RX.match(email):
        raise HTTPException(400, "Enter a valid email address.")
    db = get_db()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "An account with that email already exists. Sign in instead.")
    doc = {"email": email, "name": (body.name or "").strip() or email.split("@")[0], "role": "engineer",
           "password_hash": hash_password(body.password), "created_at": now(), "origin": "TEAM"}
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    return {"token": make_token(str(res.inserted_id)), "user": public_user(doc)}


@public_router.post("/auth/login")
async def login(body: LoginIn):
    user = await get_db().users.find_one({"email": body.email.strip().lower()})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(401, "Email or password is incorrect.")
    return {"token": make_token(str(user["_id"])), "user": public_user(user)}


@api_router.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    return user


# ---------------------------------------------------------------- overview

@api_router.get("/overview")
async def overview():
    db = get_db()
    systems = []
    for s in SYSTEMS:
        systems.append({
            **s,
            "projects": await db.projects.count_documents({"system": s["key"]}),
            "articles": await db.articles.count_documents({"system": {"$in": [s["key"], "both"]}}),
        })
    start = await db.articles.find({"tags": "start-here"}, {"_id": 0, "blocks": 0, "source_md": 0}).sort("order", 1).to_list(6)
    return {
        "systems": systems,
        "start_here": start,
        "counts": {
            "articles": await db.articles.count_documents({}),
            "terms": await db.glossary.count_documents({}),
            "rules": await db.rules.count_documents({"category": "coding"}),
            "validation": await db.validation.count_documents({}),
            "steps": await db.path.count_documents({}),
            "projects": await db.projects.count_documents({}),
        },
    }


# ---------------------------------------------------------------- articles

SUMMARY_PROJECTION = {"blocks": 0, "source_md": 0}


class ArticleIn(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    section: str = Field(max_length=40)
    system: Literal["legacy", "modern", "both"]
    summary: str = Field(default="", max_length=400)
    tags: list[str] = Field(default_factory=list, max_length=12)
    blocks: list[dict] = Field(default_factory=list, max_length=400)
    source_md: str = Field(default="", max_length=200_000)
    project: str | None = Field(default=None, max_length=120)


class ArticleUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=160)
    summary: str | None = Field(default=None, max_length=400)
    tags: list[str] | None = Field(default=None, max_length=12)
    blocks: list[dict] | None = Field(default=None, max_length=400)
    source_md: str | None = Field(default=None, max_length=200_000)


async def next_doc_id(db, section: str) -> str:
    prefix = f"KB-{SECTIONS.get(section, '09')}"
    existing = await db.articles.find({"doc_id": {"$regex": f"^{prefix}"}}, {"doc_id": 1}).to_list(500)
    nums = [int(d["doc_id"][5:]) for d in existing if d.get("doc_id", "")[5:].isdigit()]
    return f"{prefix}{(max(nums) + 1) if nums else 1:02d}"


@api_router.get("/articles")
async def list_articles(section: str | None = None, system: str | None = None, project: str | None = None, tag: str | None = None):
    flt: dict = {}
    if section:
        flt["section"] = section
    if system:
        flt["system"] = {"$in": [system, "both"]} if system in {"legacy", "modern"} else system
    if project:
        flt["project"] = project
    if tag:
        flt["tags"] = tag
    docs = await get_db().articles.find(flt, SUMMARY_PROJECTION).sort([("section", 1), ("order", 1)]).to_list(1000)
    return [format_doc(d) for d in docs]


@api_router.get("/articles/{slug}")
async def get_article(slug: str):
    db = get_db()
    doc = await db.articles.find_one({"slug": slug})
    if not doc:
        raise HTTPException(404, "That document does not exist.")
    siblings = await db.articles.find({"section": doc["section"]}, {"slug": 1, "title": 1, "doc_id": 1, "order": 1, "system": 1}).sort("order", 1).to_list(200)
    allv = await db.articles.find({}, {"slug": 1, "title": 1, "doc_id": 1}).sort([("section", 1), ("order", 1)]).to_list(1000)
    ordered = sorted(allv, key=lambda d: (d.get("doc_id") or "KB-9999", d["slug"]))
    idx = next((i for i, d in enumerate(ordered) if d["slug"] == slug), -1)
    nav = lambda d: {"slug": d["slug"], "title": d["title"], "doc_id": d.get("doc_id")} if d else None  # noqa: E731
    out = format_doc(doc)
    out["prev"] = nav(ordered[idx - 1]) if idx > 0 else None
    out["next"] = nav(ordered[idx + 1]) if 0 <= idx < len(ordered) - 1 else None
    out["sidebar"] = [{"slug": s["slug"], "title": s["title"], "doc_id": s.get("doc_id"), "system": s.get("system")} for s in siblings]
    return out


@api_router.post("/articles")
async def create_article(body: ArticleIn, user: dict = Depends(require_maintainer)):
    db = get_db()
    slug = slugify(body.title)
    if await db.articles.find_one({"slug": slug}):
        raise HTTPException(409, "A document with that title already exists.")
    blocks = body.blocks or md_to_blocks(body.source_md)
    source_md = body.source_md or blocks_to_md(blocks)
    count = await db.articles.count_documents({"section": body.section})
    doc = {
        "slug": slug, "doc_id": await next_doc_id(db, body.section), "title": body.title.strip(), "section": body.section,
        "system": body.system, "summary": body.summary, "tags": body.tags, "blocks": blocks, "source_md": source_md,
        "order": 100 + count, "read_minutes": read_minutes(blocks), "origin": "TEAM", "edited_by": user["name"],
        "created_at": now(), "updated": now(),
    }
    if body.project:
        doc["project"] = body.project
    res = await db.articles.insert_one(doc)
    doc["_id"] = res.inserted_id
    return {k: v for k, v in format_doc(doc).items() if k not in SUMMARY_PROJECTION}


@api_router.put("/articles/{slug}")
async def update_article(slug: str, body: ArticleUpdate, user: dict = Depends(require_maintainer)):
    db = get_db()
    doc = await db.articles.find_one({"slug": slug})
    if not doc:
        raise HTTPException(404, "That document does not exist.")
    changes = {k: v for k, v in body.model_dump().items() if v is not None}
    if "source_md" in changes and "blocks" not in changes:
        changes["blocks"] = md_to_blocks(changes["source_md"])
    if "blocks" in changes and "source_md" not in changes:
        changes["source_md"] = blocks_to_md(changes["blocks"])
    if "blocks" in changes:
        changes["read_minutes"] = read_minutes(changes["blocks"])
    changes.update({"updated": now(), "edited_by": user["name"]})
    await db.articles.update_one({"_id": doc["_id"]}, {"$set": changes})
    fresh = await db.articles.find_one({"_id": doc["_id"]}, SUMMARY_PROJECTION)
    return format_doc(fresh)


# ---------------------------------------------------------------- glossary, rules, team, path

class GlossaryIn(BaseModel):
    term: str = Field(min_length=2, max_length=80)
    system: Literal["legacy", "modern", "both"]
    definition: str = Field(min_length=5, max_length=1000)
    legacy_definition: str | None = Field(default=None, max_length=1000)
    modern_definition: str | None = Field(default=None, max_length=1000)
    see_also: list[str] = Field(default_factory=list, max_length=10)


class RuleIn(BaseModel):
    rule_id: str | None = Field(default=None, max_length=12)
    category: Literal["coding", "validation"]
    system: Literal["legacy", "modern", "both"]
    title: str = Field(min_length=3, max_length=160)
    rationale: str | None = Field(default=None, max_length=1000)
    good: str | None = Field(default=None, max_length=2000)
    bad: str | None = Field(default=None, max_length=2000)
    topic: str | None = Field(default=None, max_length=40)


@api_router.get("/glossary")
async def list_glossary(q: str | None = None, system: str | None = None):
    flt: dict = {}
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        flt["$or"] = [{"term": rx}, {"definition": rx}, {"see_also": rx}]
    if system in {"legacy", "modern"}:
        flt["system"] = {"$in": [system, "both"]}
    docs = await get_db().glossary.find(flt).sort("term", 1).to_list(1000)
    return [format_doc(d) for d in docs]


@api_router.post("/glossary")
async def create_term(body: GlossaryIn, user: dict = Depends(require_maintainer)):
    db = get_db()
    if await db.glossary.find_one({"term": {"$regex": f"^{re.escape(body.term.strip())}$", "$options": "i"}}):
        raise HTTPException(409, "That term is already in the glossary.")
    doc = {**body.model_dump(), "term": body.term.strip(), "origin": "TEAM", "edited_by": user["name"], "created_at": now(), "updated": now()}
    res = await db.glossary.insert_one(doc)
    doc["_id"] = res.inserted_id
    return format_doc(doc)


@api_router.get("/rules")
async def list_rules(category: Literal["coding", "validation"] | None = None, system: str | None = None):
    flt: dict = {}
    if category:
        flt["category"] = category
    if system in {"legacy", "modern"}:
        flt["system"] = {"$in": [system, "both"]}
    docs = await get_db().rules.find(flt).sort("rule_id", 1).to_list(1000)
    return [format_doc(d) for d in docs]


@api_router.post("/rules")
async def create_rule(body: RuleIn, user: dict = Depends(require_maintainer)):
    db = get_db()
    rule_id = (body.rule_id or "").strip().upper()
    if not rule_id:
        prefix = "CS" if body.category == "coding" else "VR"
        existing = await db.rules.find({"rule_id": {"$regex": f"^{prefix}-"}}, {"rule_id": 1}).to_list(1000)
        nums = [int(r["rule_id"].split("-")[1]) for r in existing if r["rule_id"].split("-")[1].isdigit()]
        rule_id = f"{prefix}-{(max(nums) + 1) if nums else 1:03d}"
    if await db.rules.find_one({"rule_id": rule_id}):
        raise HTTPException(409, f"Rule {rule_id} already exists.")
    doc = {**body.model_dump(), "rule_id": rule_id, "enforced": False, "origin": "TEAM", "edited_by": user["name"], "created_at": now(), "updated": now()}
    res = await db.rules.insert_one(doc)
    doc["_id"] = res.inserted_id
    return format_doc(doc)


@api_router.get("/team")
async def list_team():
    docs = await get_db().team.find().sort("name", 1).to_list(200)
    return [format_doc(d) for d in docs]


@api_router.get("/path")
async def list_path():
    docs = await get_db().path.find().sort("step", 1).to_list(200)
    return [format_doc(d) for d in docs]


# ---------------------------------------------------------------- progress

class StepIn(BaseModel):
    step: int = Field(ge=1, le=200)


class ArticleReadIn(BaseModel):
    slug: str = Field(min_length=1, max_length=200)


async def _progress(user_id: str) -> dict:
    doc = await get_db().progress.find_one({"user_id": user_id})
    return {"user_id": user_id, "steps": sorted(doc.get("steps", [])) if doc else [], "articles": doc.get("articles", []) if doc else []}


async def _toggle(user_id: str, field: str, value) -> dict:
    db = get_db()
    cur = await _progress(user_id)
    op = "$pull" if value in cur[field] else "$addToSet"
    await db.progress.update_one({"user_id": user_id}, {op: {field: value}, "$set": {"updated_at": now()}}, upsert=True)
    return await _progress(user_id)


@api_router.get("/progress")
async def get_progress(user: dict = Depends(current_user)):
    return await _progress(user["id"])


@api_router.post("/progress/step")
async def toggle_step(body: StepIn, user: dict = Depends(current_user)):
    if not await get_db().path.find_one({"step": body.step}):
        raise HTTPException(400, "Unknown learning path step.")
    return await _toggle(user["id"], "steps", body.step)


@api_router.post("/progress/article")
async def toggle_article(body: ArticleReadIn, user: dict = Depends(current_user)):
    if not await get_db().articles.find_one({"slug": body.slug}):
        raise HTTPException(404, "That document does not exist.")
    return await _toggle(user["id"], "articles", body.slug)


# ---------------------------------------------------------------- validation library

TIERS = {"shape", "policy", "invariant"}
SEVERITIES = {"error", "warn", "info"}


class ValidationIn(BaseModel):
    name: str | None = Field(default=None, max_length=160)
    field: str | None = Field(default=None, max_length=160)
    tier: str | None = Field(default=None, max_length=20)
    system: str | None = Field(default=None, max_length=10)
    constraint: str | None = Field(default=None, max_length=1000)
    pattern: str | None = Field(default=None, max_length=500)
    message: str | None = Field(default=None, max_length=400)
    severity: str | None = Field(default=None, max_length=10)
    enforced: bool = False
    projects: list[str] = Field(default_factory=list, max_length=20)
    tags: list[str] = Field(default_factory=list, max_length=20)
    notes: str | None = Field(default=None, max_length=2000)


@api_router.get("/validation")
async def list_validation(q: str | None = None, system: str | None = None, tier: str | None = None, severity: str | None = None, project: str | None = None):
    flt: dict = {}
    if system in {"legacy", "modern"}:
        flt["system"] = {"$in": [system, "both"]}
    elif system == "both":
        flt["system"] = "both"
    if tier:
        flt["tier"] = tier
    if severity:
        flt["severity"] = severity
    if project:
        flt["projects"] = project
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        flt["$or"] = [{f: rx} for f in ("rule_id", "name", "field", "constraint", "message", "tags", "projects", "tier", "notes")]
    docs = await get_db().validation.find(flt).sort("rule_id", 1).to_list(1000)
    return [format_doc(d) for d in docs]


@api_router.get("/validation/{rule_id}")
async def get_validation(rule_id: str):
    doc = await get_db().validation.find_one({"rule_id": rule_id.upper()})
    if not doc:
        raise HTTPException(404, "No validation rule with that id.")
    return format_doc(doc)


@api_router.post("/validation")
async def create_validation(body: ValidationIn, user: dict = Depends(require_maintainer)):
    db = get_db()
    if not (body.name or "").strip() or not (body.field or "").strip():
        raise HTTPException(400, "A validation rule needs a name and a field.")
    name = body.name.strip()
    if await db.validation.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}):
        raise HTTPException(409, "A rule with that name already exists.")
    existing = await db.validation.find({}, {"rule_id": 1}).to_list(5000)
    nums = [int(r["rule_id"][3:]) for r in existing if r.get("rule_id", "")[3:].isdigit()]
    rule_id = f"VR-{(max(nums) + 1) if nums else 1:03d}"
    doc = {
        **body.model_dump(), "name": name, "field": body.field.strip(), "rule_id": rule_id,
        "tier": body.tier if body.tier in TIERS else "shape",
        "severity": body.severity if body.severity in SEVERITIES else "error",
        "system": body.system if body.system in {"legacy", "modern", "both"} else "both",
        "constraint": body.constraint or "", "version": "1.0", "origin": "TEAM", "edited_by": user["name"],
        "created_at": now(), "updated": now(),
    }
    res = await db.validation.insert_one(doc)
    doc["_id"] = res.inserted_id
    return format_doc(doc)


# ---------------------------------------------------------------- snippets, translations, deployments

def _text_filter(q: str, fields: list[str]) -> dict:
    rx = {"$regex": re.escape(q), "$options": "i"}
    return {"$or": [{f: rx} for f in fields]}


def _categories(defs: list[dict], docs: list[dict]) -> list[dict]:
    counts: dict[str, int] = {}
    for d in docs:
        counts[d["category"]] = counts.get(d["category"], 0) + 1
    return [{"key": c["key"], "label": c["label"], "count": counts.get(c["key"], 0)} for c in defs if counts.get(c["key"])]


@api_router.get("/snippets")
async def list_snippets(q: str | None = None, category: str | None = None, system: str | None = None):
    flt: dict = {}
    if q:
        flt.update(_text_filter(q, ["code", "rule", "title", "category", "instead", "why_bad", "tags", "bad.code", "standard.code"]))
    if category:
        flt["category"] = category
    if system in {"legacy", "modern"}:
        flt["system"] = {"$in": [system, "both"]}
    docs = await get_db().snippets.find(flt).sort("code", 1).to_list(500)
    return [format_doc(d) for d in docs]


@api_router.get("/snippets/categories")
async def snippet_categories():
    docs = await get_db().snippets.find({}, {"category": 1}).to_list(500)
    return _categories(SNIPPET_CATEGORIES, docs)


@api_router.get("/snippets/{code}")
async def get_snippet(code: str):
    doc = await get_db().snippets.find_one({"code": code.upper()})
    if not doc:
        raise HTTPException(404, "No snippet with that code.")
    return format_doc(doc)


@api_router.get("/translations")
async def list_translations(q: str | None = None, category: str | None = None):
    flt: dict = {}
    if q:
        flt.update(_text_filter(q, ["code", "pattern", "intent", "tags", "category", "legacy.code", "modern.code"]))
    if category:
        flt["category"] = category
    docs = await get_db().translations.find(flt).sort("code", 1).to_list(500)
    return [format_doc(d) for d in docs]


@api_router.get("/translations/categories")
async def translation_categories():
    docs = await get_db().translations.find({}, {"category": 1}).to_list(500)
    return _categories(TRANSLATION_CATEGORIES, docs)


@api_router.get("/translations/{code}")
async def get_translation(code: str):
    doc = await get_db().translations.find_one({"code": code.upper()})
    if not doc:
        raise HTTPException(404, "No translation pattern with that code.")
    return format_doc(doc)


@api_router.get("/deployments")
async def list_deployments():
    docs = await get_db().deployments.find().to_list(50)
    docs.sort(key=lambda d: (0 if d["system"] == "legacy" else 1, d["slug"]))
    return {"stages": STAGES, "flows": [enrich_flow(format_doc(d)) for d in docs]}


@api_router.get("/deployments/{slug}")
async def get_deployment(slug: str):
    doc = await get_db().deployments.find_one({"slug": slug})
    if not doc:
        raise HTTPException(404, "No deployment flow with that name.")
    return enrich_flow(format_doc(doc))


# ---------------------------------------------------------------- projects

class ProjectIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    system: Literal["legacy", "modern"]
    framework: str | None = Field(default=None, max_length=40)
    description: str = Field(default="", max_length=600)
    stack: list[str] = Field(default_factory=list, max_length=20)
    repo: str | None = Field(default=None, max_length=300)
    owner: str | None = Field(default=None, max_length=120)


def _project_docs_filter(project: dict) -> dict:
    return {"$or": [{"project": project["name"]}, {"project": {"$exists": False}, "system": {"$in": [project["system"], "both"]}}]}


async def _load_project(slug: str) -> dict:
    doc = await get_db().projects.find_one({"slug": slug})
    if not doc:
        raise HTTPException(404, "That project does not exist.")
    return doc


@api_router.get("/projects")
async def list_projects(user: dict = Depends(current_user)):
    db = get_db()
    docs = await db.projects.find().sort([("system", 1), ("name", 1)]).to_list(500)
    ticks = {c["project_slug"]: c.get("done", []) for c in await db.checklist_progress.find({"user_id": user["id"]}).to_list(500)}
    out = []
    for d in docs:
        p = format_doc(d)
        p["doc_count"] = await db.articles.count_documents(_project_docs_filter(d))
        p["checklist"] = checklists.progress(ticks.get(d["slug"], []))
        out.append(p)
    return out


@api_router.post("/projects")
async def create_project(body: ProjectIn, user: dict = Depends(require_maintainer)):
    db = get_db()
    slug = slugify(body.name)
    if not slug:
        raise HTTPException(400, "Project name needs at least one letter or digit.")
    if await db.projects.find_one({"slug": slug}):
        raise HTTPException(409, "A project with that name already exists.")
    doc = {
        **body.model_dump(), "slug": slug, "name": body.name.strip(),
        "framework": body.framework or (".NET Framework 4.8" if body.system == "legacy" else ".NET 8"),
        "owner": body.owner or user["name"], "repo": body.repo or "", "origin": "TEAM", "created_at": now(), "updated": now(),
    }
    res = await db.projects.insert_one(doc)
    doc["_id"] = res.inserted_id
    out = format_doc(doc)
    out["doc_count"] = 0
    out["checklist"] = checklists.progress([])
    return out


@api_router.get("/projects/{slug}")
async def get_project(slug: str):
    db = get_db()
    doc = await _load_project(slug)
    docs = await db.articles.find(_project_docs_filter(doc), SUMMARY_PROJECTION).sort([("section", 1), ("order", 1)]).to_list(500)
    owner = await db.team.find_one({"name": doc.get("owner")})
    out = format_doc(doc)
    out["docs"] = [format_doc(d) for d in docs]
    out["owner_profile"] = format_doc(owner) if owner else None
    return out


class ChecklistStepIn(BaseModel):
    step: str = Field(min_length=1, max_length=40)
    done: bool | None = None


@api_router.get("/projects/{slug}/checklist")
async def get_checklist(slug: str, user: dict = Depends(current_user)):
    db = get_db()
    project = await _load_project(slug)
    docs = await db.articles.find(_project_docs_filter(project), {"slug": 1, "title": 1, "section": 1}).sort("order", 1).to_list(500)
    row = await db.checklist_progress.find_one({"user_id": user["id"], "project_slug": slug})
    return checklists.build_checklist(project, docs, row.get("done", []) if row else [])


@api_router.post("/projects/{slug}/checklist/step")
async def tick_checklist(slug: str, body: ChecklistStepIn, user: dict = Depends(current_user)):
    db = get_db()
    await _load_project(slug)
    if body.step not in checklists.step_keys():
        raise HTTPException(400, "Unknown checklist step.")
    key = {"user_id": user["id"], "project_slug": slug}
    row = await db.checklist_progress.find_one(key)
    done = list(row.get("done", [])) if row else []
    target = (body.step not in done) if body.done is None else body.done
    if target and body.step not in done:
        done.append(body.step)
    if not target and body.step in done:
        done.remove(body.step)
    await db.checklist_progress.update_one(key, {"$set": {"done": done, "updated_at": now()}, "$setOnInsert": {"created_at": now()}}, upsert=True)
    return {"step": body.step, "done": target, "progress": checklists.progress(done)}


@api_router.get("/projects/{slug}/procedures")
async def get_procedures(slug: str):
    project = await _load_project(slug)
    return procedures_module.for_project(project)


# ---------------------------------------------------------------- data contracts

async def _contracts() -> list[dict]:
    return await get_db().datacontracts.find().sort("code", 1).to_list(200)


@api_router.get("/contracts")
async def list_contracts(q: str | None = None, kind: str | None = None, status: str | None = None, direction: str | None = None):
    flt: dict = {}
    if kind:
        flt["kind"] = kind
    if status:
        flt["status"] = status
    if direction:
        flt["direction"] = direction
    if q:
        flt.update(_text_filter(q, ["code", "name", "summary", "owner", "kind", "status", "producers", "consumers", "rules", "fields.name", "fields.type", "fields.notes"]))
    docs = await get_db().datacontracts.find(flt).sort("code", 1).to_list(200)
    return [format_doc(d) for d in docs]


@api_router.get("/contracts/meta")
async def contracts_meta():
    docs = await _contracts()
    kinds = [{"key": k["key"], "label": k["label"], "count": sum(1 for d in docs if d["kind"] == k["key"])} for k in CONTRACT_KINDS]
    statuses = [{"key": s, "count": sum(1 for d in docs if d["status"] == s)} for s in ("stable", "draft", "deprecated")]
    return {"kinds": kinds, "statuses": statuses, "directions": DIRECTIONS, "policy": CHANGE_POLICY, "total": len(docs)}


@api_router.get("/contracts/graph")
async def contracts_graph():
    projects = await get_db().projects.find({}, {"name": 1, "slug": 1, "system": 1}).to_list(500)
    return build_graph(await _contracts(), projects)


async def _contract(code: str) -> dict:
    doc = await get_db().datacontracts.find_one({"code": code.upper()})
    if not doc:
        raise HTTPException(404, "No data contract with that code.")
    return doc


@api_router.get("/contracts/{code}")
async def get_contract(code: str):
    return format_doc(await _contract(code))


@api_router.get("/contracts/{code}/schema.json")
async def contract_schema_json(code: str):
    c = await _contract(code)
    return JSONResponse(
        contract_export.to_json_schema(c), media_type="application/schema+json",
        headers={"Content-Disposition": f'attachment; filename="{contract_export.filename(c, "schema.json")}"'},
    )


@api_router.get("/contracts/{code}/schema.sql")
async def contract_schema_sql(code: str):
    c = await _contract(code)
    try:
        sql = contract_export.to_sql(c)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return Response(sql, media_type="application/sql", headers={"Content-Disposition": f'attachment; filename="{contract_export.filename(c, "sql")}"'})


# ---------------------------------------------------------------- ingest

class IngestFile(BaseModel):
    path: str = Field(max_length=1000)
    content: str


class IngestIn(BaseModel):
    files: list[IngestFile] = Field(default_factory=list, max_length=6000)


class GithubIngestIn(BaseModel):
    repo: str = Field(max_length=400)
    ref: str | None = Field(default=None, max_length=200)
    path: str | None = Field(default=None, max_length=400)


async def ingest_repository(files: list[dict], user: dict) -> dict:
    if not files:
        raise HTTPException(400, "No files were sent. Pick a folder that contains a .NET solution.")
    result = analyze_upload(files)
    if not result["projects"]:
        raise HTTPException(422, "No .NET projects (.csproj) were found in those files.")
    db = get_db()
    stamp = now()
    saved_projects, saved_articles = [], []
    for p in result["projects"]:
        existing = await db.projects.find_one({"slug": p["slug"]})
        await db.projects.update_one(
            {"slug": p["slug"]},
            {"$set": {**p, "origin": existing.get("origin", "IMPORTED") if existing else "IMPORTED", "updated": stamp}, "$setOnInsert": {"created_at": stamp}},
            upsert=True,
        )
        saved_projects.append({**p, "created": existing is None})
    for a in result["articles"]:
        existing = await db.articles.find_one({"slug": a["slug"]})
        blocks = md_to_blocks(a["source_md"])
        fields = {**a, "blocks": blocks, "read_minutes": read_minutes(blocks), "origin": "IMPORTED", "edited_by": user["name"], "updated": stamp}
        if existing:
            await db.articles.update_one({"_id": existing["_id"]}, {"$set": fields})
            doc_id = existing.get("doc_id")
        else:
            doc_id = f"KB-8{await db.articles.count_documents({'origin': 'IMPORTED'}) + 1:03d}"
            await db.articles.insert_one({**fields, "doc_id": doc_id, "order": 800, "created_at": stamp})
        saved_articles.append({"slug": a["slug"], "title": a["title"], "doc_id": doc_id, "section": a["section"], "project": a["project"], "created": existing is None})
    return {"stats": result["stats"], "findings": result["findings"], "projects": saved_projects, "articles": saved_articles, "truncated": result["truncated"]}


@api_router.post("/ingest")
async def ingest(body: IngestIn, user: dict = Depends(require_maintainer)):
    return await ingest_repository([f.model_dump() for f in body.files], user)


@api_router.post("/ingest/github")
async def ingest_github(body: GithubIngestIn, user: dict = Depends(require_maintainer)):
    try:
        files, source = await fetch_repo_files(body.repo, body.ref, body.path)
    except GithubError as e:
        raise HTTPException(e.status, e.detail)
    if not files:
        raise HTTPException(422, "No .NET files were found at that location.")
    try:
        result = await ingest_repository(files, user)
    except HTTPException as e:
        if e.status_code == 422:
            raise HTTPException(422, "No .NET projects (.csproj) were found at that location.")
        raise
    result["source"] = source
    return result


# ---------------------------------------------------------------- search

@api_router.get("/search")
async def search(q: str = "", limit: int = Query(30, ge=1, le=60)):
    return await run_search(get_db(), q, limit)


# ---------------------------------------------------------------- feedback

FEEDBACK_STATUSES = ["open", "triaged", "accepted", "declined"]
FEEDBACK_KINDS = {"outdated", "improvement"}
TARGET_TYPES = {"standard", "architecture"}


class FeedbackIn(BaseModel):
    kind: str = Field(max_length=20)
    target_type: str = Field(max_length=20)
    target_ref: str = Field(default="", max_length=200)
    target_label: str | None = Field(default=None, max_length=200)
    category: str | None = Field(default=None, max_length=60)
    message: str = Field(default="", max_length=4000)
    severity: str | None = Field(default=None, max_length=10)


class FeedbackStatusIn(BaseModel):
    status: str = Field(max_length=20)
    note: str | None = Field(default=None, max_length=1000)


def _feedback_out(doc: dict, user_id: str) -> dict:
    out = format_doc(doc)
    voters = out.pop("voters", [])
    out["vote_count"] = len(voters)
    out["voted"] = user_id in voters
    return out


async def _feedback_doc(fid: str) -> dict:
    try:
        oid = ObjectId(fid)
    except (InvalidId, TypeError):
        raise HTTPException(404, "That feedback item does not exist.")
    doc = await get_db().feedback.find_one({"_id": oid})
    if not doc:
        raise HTTPException(404, "That feedback item does not exist.")
    return doc


@api_router.get("/feedback")
async def list_feedback(status: str | None = None, kind: str | None = None, target_type: str | None = None, q: str | None = None, user: dict = Depends(current_user)):
    flt: dict = {}
    if status:
        flt["status"] = status
    if kind:
        flt["kind"] = kind
    if target_type:
        flt["target_type"] = target_type
    if q:
        flt.update(_text_filter(q, ["message", "target_label", "target_ref", "category", "author_name", "author_email"]))
    docs = await get_db().feedback.find(flt).to_list(2000)
    items = [_feedback_out(d, user["id"]) for d in docs]
    items.sort(key=lambda i: i["created_at"] or "", reverse=True)
    items.sort(key=lambda i: (FEEDBACK_STATUSES.index(i["status"]) if i["status"] in FEEDBACK_STATUSES else 9, -i["vote_count"]))
    return items


@api_router.get("/feedback/meta")
async def feedback_meta():
    docs = await get_db().feedback.find({}, {"status": 1, "kind": 1, "target_type": 1}).to_list(5000)

    def count(field, keys):
        return [{"key": k, "count": sum(1 for d in docs if d.get(field) == k)} for k in keys]

    return {"total": len(docs), "statuses": count("status", FEEDBACK_STATUSES), "kinds": count("kind", ["outdated", "improvement"]), "target_types": count("target_type", ["standard", "architecture"])}


@api_router.get("/feedback/targets")
async def feedback_targets():
    db = get_db()
    rules = await db.rules.find({"category": "coding"}, {"rule_id": 1, "title": 1, "topic": 1}).sort("rule_id", 1).to_list(500)
    arts = await db.articles.find({}, {"slug": 1, "title": 1, "doc_id": 1, "section": 1}).sort([("section", 1), ("order", 1)]).to_list(1000)
    return {
        "standards": [{"ref": r["rule_id"], "label": r["title"], "hint": f"{r['rule_id']} · {r.get('topic', '')}"} for r in rules],
        "architecture": [{"ref": a["slug"], "label": a["title"], "hint": f"{a.get('doc_id', '')} · {a.get('section', '')}"} for a in arts],
    }


@api_router.post("/feedback")
async def create_feedback(body: FeedbackIn, user: dict = Depends(current_user)):
    if body.kind not in FEEDBACK_KINDS:
        raise HTTPException(400, "kind must be 'outdated' or 'improvement'.")
    if body.target_type not in TARGET_TYPES:
        raise HTTPException(400, "target_type must be 'standard' or 'architecture'.")
    if not body.target_ref.strip():
        raise HTTPException(400, "Pick the standard or document this feedback is about.")
    if len(body.message.strip()) < 10:
        raise HTTPException(400, "Write at least 10 characters so the maintainer knows what to change.")
    doc = {
        **body.model_dump(), "message": body.message.strip(), "target_label": body.target_label or body.target_ref,
        "status": "open", "status_note": None, "voters": [user["id"]],
        "author_id": user["id"], "author_name": user["name"], "author_email": user["email"], "created_at": now(),
    }
    res = await get_db().feedback.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _feedback_out(doc, user["id"])


@api_router.post("/feedback/{fid}/vote")
async def vote_feedback(fid: str, user: dict = Depends(current_user)):
    doc = await _feedback_doc(fid)
    op = "$pull" if user["id"] in doc.get("voters", []) else "$addToSet"
    await get_db().feedback.update_one({"_id": doc["_id"]}, {op: {"voters": user["id"]}})
    return _feedback_out(await _feedback_doc(fid), user["id"])


@api_router.post("/feedback/{fid}/status")
async def triage_feedback(fid: str, body: FeedbackStatusIn, user: dict = Depends(require_maintainer)):
    if body.status not in FEEDBACK_STATUSES:
        raise HTTPException(400, f"status must be one of {', '.join(FEEDBACK_STATUSES)}.")
    doc = await _feedback_doc(fid)
    await get_db().feedback.update_one({"_id": doc["_id"]}, {"$set": {"status": body.status, "status_note": body.note, "triaged_by": user["name"], "triaged_at": now()}})
    return _feedback_out(await _feedback_doc(fid), user["id"])


# ---------------------------------------------------------------- insight

@api_router.get("/coverage/migration")
async def migration_coverage():
    projects = await get_db().projects.find({}, {"slug": 1, "name": 1}).to_list(500)
    return coverage_module.build(projects)


@api_router.get("/architecture/service-graph")
async def service_graph():
    return servicegraph.build()


app.include_router(public_router)
app.include_router(api_router)


@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException):
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code, headers=getattr(exc, "headers", None))
