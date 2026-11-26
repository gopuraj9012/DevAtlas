"""Ranked search across every content collection.

Fans out over nine collections in parallel with an escaped, case-insensitive
regex, then scores each hit in Python:
    title/name 100, identifier 90, summary/intent 45-55, tags 40-45, body/code 20-30
    exact x1.6, prefix x1.25, substring x1.0
"""
from __future__ import annotations

import asyncio
import re
import time

MAX_RESULTS = 60

# type, collection, label, fields [(path, weight)], identifier field, hint builder, slug field, system field
SOURCES = [
    ("article", "articles", "Docs", [("title", 100), ("doc_id", 90), ("summary", 50), ("tags", 40), ("source_md", 20)], "slug", "system"),
    ("rule", "rules", "Standards", [("title", 100), ("rule_id", 90), ("rationale", 45), ("good", 25), ("bad", 25)], "rule_id", "system"),
    ("validation", "validation", "Validation", [("name", 100), ("rule_id", 90), ("field", 55), ("constraint", 45), ("tags", 40), ("message", 30)], "rule_id", "system"),
    ("snippet", "snippets", "Snippets", [("title", 100), ("code", 90), ("rule", 90), ("instead", 45), ("tags", 40), ("bad.code", 25), ("standard.code", 25)], "code", "system"),
    ("translation", "translations", "Translations", [("pattern", 100), ("code", 90), ("intent", 55), ("tags", 45), ("legacy.code", 25), ("modern.code", 25)], "code", None),
    ("contract", "datacontracts", "Contracts", [("name", 100), ("code", 90), ("summary", 50), ("owner", 45), ("fields.name", 30)], "code", None),
    ("deployment", "deployments", "Deployments", [("name", 100), ("slug", 90), ("summary", 50), ("stack", 40)], "slug", "system"),
    ("term", "glossary", "Glossary", [("term", 100), ("definition", 50), ("see_also", 40)], "term", "system"),
    ("project", "projects", "Projects", [("name", 100), ("slug", 90), ("description", 50), ("stack", 45), ("framework", 40)], "slug", "system"),
]
LABEL_FIELD = {"article": "title", "rule": "title", "validation": "name", "snippet": "title", "translation": "pattern", "contract": "name", "deployment": "name", "term": "term", "project": "name"}


def _values(doc: dict, path: str) -> list[str]:
    cur = [doc]
    for part in path.split("."):
        nxt = []
        for c in cur:
            if isinstance(c, dict):
                v = c.get(part)
            else:
                v = None
            if isinstance(v, list):
                nxt.extend(v)
            elif v is not None:
                nxt.append(v)
        cur = nxt
    return [str(v) for v in cur if isinstance(v, (str, int, float))]


def _excerpt(text: str, q: str, width: int = 140) -> str:
    flat = re.sub(r"\s+", " ", text)
    i = flat.lower().find(q.lower())
    if i < 0:
        return flat[:width]
    start = max(0, i - width // 3)
    end = min(len(flat), start + width)
    return ("…" if start else "") + flat[start:end] + ("…" if end < len(flat) else "")


def score_doc(doc: dict, fields: list[tuple[str, int]], q: str) -> tuple[float, str]:
    ql = q.lower()
    best, best_text = 0.0, ""
    for path, weight in fields:
        for v in _values(doc, path):
            vl = v.lower()
            if ql not in vl:
                continue
            mult = 1.6 if vl == ql else 1.25 if vl.startswith(ql) else 1.0
            s = weight * mult
            if s > best:
                best, best_text = s, v
    return best, best_text


def _hint(kind: str, d: dict) -> str:
    return {
        "article": f"{d.get('doc_id', '')} · {d.get('section', '')}",
        "rule": f"{d.get('rule_id', '')} · {d.get('category', '')}",
        "validation": f"{d.get('rule_id', '')} · {d.get('field', '')}",
        "snippet": f"{d.get('code', '')} · {d.get('rule', '')}",
        "translation": f"{d.get('code', '')} · {d.get('category', '')}",
        "contract": f"{d.get('code', '')} · {d.get('kind', '')}",
        "deployment": d.get("stack", ""),
        "term": (d.get("definition") or "")[:80],
        "project": d.get("framework", ""),
    }[kind].strip(" ·")


async def run_search(db, q: str, limit: int = 30) -> dict:
    started = time.perf_counter()
    q = (q or "").strip()
    limit = max(1, min(int(limit or 30), MAX_RESULTS))
    if not q:
        return {"query": q, "took_ms": 0, "count": 0, "total": 0, "facets": [], "results": []}
    rx = {"$regex": re.escape(q), "$options": "i"}

    async def one(src):
        kind, coll, label, fields, slug_field, system_field = src
        flt = {"$or": [{f: rx} for f, _ in fields]}
        docs = await db[coll].find(flt, {"_id": 0}).to_list(200)
        hits = []
        for d in docs:
            s, text = score_doc(d, fields, q)
            if s <= 0:
                continue
            hits.append({
                "type": kind, "label": str(d.get(LABEL_FIELD[kind], "")), "hint": _hint(kind, d),
                "slug": str(d.get(slug_field, "")), "system": d.get(system_field) if system_field else d.get("owner_system"),
                "excerpt": _excerpt(text, q), "score": round(s, 2),
            })
        return kind, label, hits

    groups = await asyncio.gather(*(one(s) for s in SOURCES))
    results = [h for _, _, hits in groups for h in hits]
    results.sort(key=lambda h: (-h["score"], h["label"]))
    facets = [{"key": k, "label": lbl, "count": len(h)} for k, lbl, h in groups if h]
    total = len(results)
    results = results[:limit]
    return {
        "query": q, "took_ms": round((time.perf_counter() - started) * 1000, 1),
        "count": len(results), "total": total, "facets": facets, "results": results,
    }
