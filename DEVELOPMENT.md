# DevAtlas — Developer Guide

One file for both sides of the app: how the backend is built, how the frontend is built, how they meet, and what is still missing.

**DevAtlas** is an internal knowledge base for a .NET estate that runs two generations side by side — legacy .NET Framework 4.8 and modern .NET 8. It exists so an engineer can answer "how does this work, and what happens if I change it?" without asking a person.

---

## 1. Stack and conventions

| Layer | Choice |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind, shadcn/ui, TanStack Query, React Router |
| Backend | FastAPI (Python 3.11), Motor (async MongoDB), PyJWT + bcrypt |
| Database | MongoDB |
| Entrypoint | `backend/server.py` → `uvicorn server:app` on `0.0.0.0:8000` |
| Proxy | Express on 8080: `/api/*` → FastAPI, everything else → Vite |

Hard rules that will break the deploy if ignored:

- The FastAPI app object must be named `app` and live in `backend/server.py`.
- Every API route starts with `/api` (routers add the prefix; never write it twice).
- `@api_router.get("/")` must keep returning a health payload.
- Never hardcode `MONGO_URL`, `DB_NAME` or CORS origins — read them from the environment with no fallback.
- The three `<script>` tags in `index.html` stay in `<body>`, untouched.
- `vite.config.ts` is managed by the platform — never edit it.

---

## 2. Repository layout

```
/app/project
├── backend/
│   ├── server.py            # app, auth, all routes, seeding (1525 lines)
│   ├── seed_knowledge.py    # seeded content: articles, rules, path, projects (1622)
│   ├── datacontracts.py     # 8 data contracts + change policy (526)
│   ├── snippets.py          # 18 bad-vs-standard patterns (565)
│   ├── translations.py      # legacy→modern pattern translator (599)
│   ├── deployments.py       # IIS vs container deploy flows (307)
│   ├── ingest.py            # static analysis of an uploaded .NET folder (468)
│   ├── github_repo.py       # read a repo straight from GitHub (233)
│   ├── repo_sources.py      # zip upload, Bitbucket and any-Git-URL readers
│   ├── code_index.py        # deep code map: C# parser, call graph, views, AJAX links
│   ├── search.py            # ranked cross-collection search (341)
│   ├── impact.py            # contract impact graph (158)
│   ├── contract_export.py   # JSON Schema + T-SQL DDL (276)
│   ├── procedures.py        # stored procedures + modern equivalents (392)
│   ├── servicegraph.py      # modern service topology (265)
│   ├── coverage.py          # migration coverage % (165)
│   ├── checklists.py        # per-project guided checklists (241)
│   └── tests/               # conftest.py harness + test_api.py (55 tests)
├── frontend/
│   └── src/
│       ├── App.tsx          # 22 routes, RequireAuth guard
│       ├── pages/           # 21 screens
│       ├── components/kb/   # 12 domain components
│       ├── components/shell/AppShell.tsx
│       ├── components/ui/   # shadcn primitives
│       ├── lib/api.ts       # typed api() client + every response interface
│       ├── lib/auth.tsx     # AuthProvider, useAuth
│       └── index.css        # locked theme tokens
├── contracts.md             # API contract (source of truth for shapes)
├── context.md               # running build log / decisions
├── design_guidelines.md     # visual source of truth
└── DEVELOPMENT.md           # this file
```

**Precedence when sources disagree:** `contracts.md` → backend models → `context.md` → app structure → chat instructions. A change to a request/response shape starts in `contracts.md`, then the backend, then the frontend — never the other way around.

---

## 3. Backend

### 3.1 Module responsibilities

`server.py` owns the app, auth, and routes. Every non-route concern lives in its own module and is imported flat (`from search import run_search`, never `from backend.search import ...`).

| Module | Kind | What it does |
|---|---|---|
| `seed_knowledge.py` | static data | Articles, validation rules, glossary, learning path, projects, team, translations, deploys |
| `datacontracts.py` | static data | Contract registry + `CHANGE_POLICY` |
| `snippets.py` | static data | Bad-vs-standard learning patterns |
| `ingest.py` | pure function | Parses `.sln`/`.csproj`/`.cs`, detects stack signals and risk patterns, emits docs |
| `github_repo.py` | I/O | Resolves a repo, lists the tree, downloads source files |
| `search.py` | query layer | Fans out over 9 collections, scores, returns ranked hits + facets |
| `impact.py` | pure function | Legacy SQL/SOAP interfaces → consuming services, with risk tiers |
| `contract_export.py` | pure function | Contract → JSON Schema or T-SQL DDL |
| `procedures.py` | static data | Stored procedures paired with their modern replacement |
| `servicegraph.py` | static data | Modern service topology (HTTP vs event) |
| `coverage.py` | pure function | Weighted migration coverage % |
| `checklists.py` | pure function | Per-project onboarding checklist, system-aware |

Everything except `github_repo.py` (network) and `server.py` (Mongo) is pure and synchronous — which is why the tests can exercise the data modules directly.

### 3.2 Database collections

| Collection | Contents |
|---|---|
| `users` | email, name, password_hash, role (`engineer` \| `maintainer` \| `owner`) |
| `projects` | slug, name, system (`legacy` \| `modern`), framework, stack[], repo, owner, origin |
| `articles` | slug, doc_id, title, section, system, blocks[], source_md, tags[], order |
| `glossary`, `rules`, `validation` | Terms, standards, validation rule library |
| `snippets` | Bad-vs-standard patterns |
| `translations` | Legacy→modern pattern pairs |
| `deployments` | Deploy flows with stages |
| `datacontracts` | 8 contracts (DC-01…DC-08) |
| `feedback` | Flags and improvement suggestions with votes |
| `team`, `path` | Directory and the global onboarding path |
| `progress` | Per-user global path/article completion |
| `checklist_progress` | Per-user, per-project checklist ticks |

Seeding runs once at startup and is idempotent per collection (`seed_if_empty`). Imported docs are tagged `origin: "IMPORTED"`; seeded content `origin: "SEED"`; hand-written content `origin: "TEAM"`. That tag is how you tell generated knowledge from authored knowledge.

### 3.3 Authentication and authorisation

```python
api_router    = APIRouter(prefix="/api", dependencies=[Depends(current_user)])  # auth on every route
public_router = APIRouter(prefix="/api")                                        # health + auth only
```

The default is *closed*. A new route is authenticated the moment it is declared on `api_router`; you have to opt out deliberately by using `public_router`. Mutations add a second gate:

```python
@api_router.post("/articles")
async def create_article(payload: ArticleIn, user: dict = Depends(require_maintainer)): ...
```

- `Depends(current_user)` → 401 without a valid bearer token.
- `Depends(require_maintainer)` → 403 for a plain `engineer`.
- Tokens are JWTs carrying `sub` (user id) with a 7-day TTL.
- Public signup always creates an `engineer`. Roles are never accepted from the client.

### 3.4 Response shapes

Mongo returns `ObjectId`, which Pydantic cannot serialise. Every document goes through:

```python
def format_doc(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc
```

The frontend only ever sees `id`. `_id` never crosses the wire.

### 3.5 Full API reference

All paths are prefixed with `/api`. "Auth" means a valid token; "Maint." means `maintainer`/`owner`.

Roughly ten groups:

**Public** — `GET /` (health) · `POST /auth/signup` · `POST /auth/login`
**Identity** — `GET /auth/me`
**Dashboard** — `GET /overview`
**Knowledge base** — `GET/POST /articles`, `GET/PUT /articles/{slug}`, `GET/POST /glossary`, `GET/POST /rules`, `GET /validation`, `GET /validation/{rule_id}`, `POST /validation`, `GET /snippets`, `GET /snippets/categories`, `GET /snippets/{code}`, `GET /translations`, `GET /translations/categories`, `GET /translations/{code}`, `GET /deployments`, `GET /deployments/{slug}`, `GET /team`
**Projects** — `GET /projects`, `POST /projects` (Maint.), `GET /projects/{slug}`
**Guided checklists** — `GET /projects/{slug}/checklist`, `POST /projects/{slug}/checklist/step`
**Stored procedures** — `GET /projects/{slug}/procedures`
**Data contracts** — `GET /contracts`, `GET /contracts/meta`, `GET /contracts/{code}`, `GET /contracts/graph`, `GET /contracts/{code}/schema.json`, `GET /contracts/{code}/schema.sql`
**Ingest** — `POST /ingest` (Maint., folder upload), `POST /ingest/archive` (Maint., zip upload), `POST /ingest/github`, `POST /ingest/bitbucket`, `POST /ingest/git` (Maint., repo reads)
**Search** — `GET /search?q=&limit=`
**Feedback** — `GET /feedback`, `GET /feedback/meta`, `GET /feedback/targets`, `POST /feedback`, `POST /feedback/{id}/vote`, `POST /feedback/{id}/status` (Maint.)
**Insight** — `GET /coverage/migration`, `GET /architecture/service-graph`
**Progress** — `GET /path`, `GET /progress`, `POST /progress/step`, `POST /progress/article`
**Code map** — `GET /projects/{slug}/code`, `/code/type?id=`, `/code/view?path=`, `/code/search?q=`, `/code/export.md`
**Admin** (owner only) — `GET /admin/users`, `PUT /admin/users/{id}`, `GET/PUT /admin/settings`, `GET/POST /admin/invites`, `DELETE /admin/invites/{id}`, `GET /admin/audit`, `GET /admin/summary`; public `GET /auth/config`

51 endpoints total, 3 of them public. Exact request/response shapes belong in `contracts.md` — read it before changing any of them.

### 3.6 Ingestion pipeline

Both import paths converge on one analysis function, so folder upload and GitHub read can never drift apart:

```
POST /ingest            ─┐
POST /ingest/archive    ─┤
POST /ingest/github     ─┼→ analyze_upload(files) → projects + findings + articles → Mongo
POST /ingest/bitbucket  ─┤
POST /ingest/git        ─┘
```

- `is_candidate()` filters by extension and skips `bin/obj/node_modules/packages/.git`.
- `DETECTORS` is the signal table: framework, data access, auth, and explicit `RISK ·` patterns such as `HttpContext.Current`, `.Result`, SQL string concatenation.
- Generated docs are marked `IMPORTED` so a reader knows they were inferred, not authored.
- Shared caps: ≤400 KB per file, ≤6,000 files, ≤14M characters; exceeding them sets a truncation flag rather than failing the request.

### 3.7 Tests

```bash
cd backend && pytest -q tests/test_api.py                    # all 55
cd backend && pytest -q tests/test_api.py -k "coverage"      # focused
```

Tests use the `client` and `db` fixtures from `conftest.py` (one event loop, throwaway `<DB_NAME>_test` database) and the `member` / `maintainer` fixtures for auth. Do not build your own `TestClient` or Motor client. When a route's contract changes, update the matching test; when only styling changes, do not touch tests at all.

---

## 4. Frontend

### 4.1 Routing

`App.tsx` declares 22 routes. Everything except `/`, `/login` and `*` is wrapped in `RequireAuth`, which redirects to `/login` when there is no session and renders an empty shell while auth is still resolving (never a flash of the login screen).

| Route | Screen | Purpose |
|---|---|---|
| `/` | redirect | → `/dashboard` when signed in, `/login` otherwise |
| `/login` | `Landing` | Sign in / sign up |
| `/dashboard` | `Dashboard` | Welcome, project grid, create project |
| `/search` | `Search` | Ranked search across every source |
| `/service-map` | `ServiceMap` | Modern services: HTTP + event edges |
| `/coverage` | `Coverage` | Migration coverage % |
| `/ingest` | `Ingest` | Folder upload or GitHub read |
| `/feedback` | `Feedback` | Flags and suggestions |
| `/team` | `Team` | People and roles |
| `/projects/:slug` | `ProjectHub` | Tabs: Overview · Checklist · (Stored procs) · Architecture · Standards · Setup |
| `/article/:slug` | `Article` | Long-form doc with TOC |
| `/standards`, `/glossary`, `/learning-path`, `/authoring` | | Rulebook, terms, global path, doc editor |
| `/validation`, `/translations`, `/deployments`, `/contracts`, `/snippets` | | The five library surfaces |
| `/architecture` | `Architecture` | System architecture |
| `*` | `NotFound` | |

### 4.2 Data access

One client, one pattern. Never call `fetch` directly except when you need a header on a *download*:

```ts
import { api } from "@/lib/api";
import { API_URL } from "@/config";

const projects = await api<Project[]>("/projects");
await api<Project>("/projects", { method: "POST", body: { name, system } });
```

- `api()` attaches the bearer token, JSON-encodes the body, and throws `ApiError` carrying `status` and the server's `detail`.
- `API_URL` is empty in dev (proxied) and set automatically in production. Never write a bare `/api` URL.
- Every response type lives in `lib/api.ts`. Add the interface there before using it, so the compiler (not the browser) catches a shape mismatch.
- File downloads use `fetch` + `Blob` because the token must travel in a header: see `download()` in `pages/DataContracts.tsx`.

### 4.3 Screen anatomy

Every signed-in screen renders inside `<AppShell>`: 260px collapsible sidebar → 56px icon rail, 56px top bar with the ⌘K search trigger, a 28px status strip, and a content column capped at 1200px.

Shared domain components (`components/kb/`):

| Component | Role |
|---|---|
| `Bits.tsx` | `MicroLabel`, `SystemDot`, `FrameworkBadge`, `Pill`, `ProgressMeter`, `EmptyPanel`, `CanvasGrid` |
| `CodeBlock.tsx` | Dark mono panel with filename bar and copy |
| `SplitCompare.tsx` | The signature legacy-vs-modern two-column card |
| `SearchDialog.tsx` | ⌘K palette (links out to `/search`) |
| `ProjectChecklist.tsx` | Three-phase guided checklist with per-user ticks |
| `StoredProcedures.tsx` | Procedure ↔ modern equivalent cards |
| `ContractImpactGraph.tsx` | Legacy interface → consuming service flow |
| `GithubIngest.tsx` / `IngestResult.tsx` | Repo import form and result rendering |
| `BlockRenderer.tsx` / `Block.tsx` | Article block renderer |

### 4.4 Design system

`design_guidelines.md` is the source of truth and `index.css` holds locked tokens (violet primary, Inter, JetBrains Mono for code).

- Use semantic classes only: `bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`.
- Never hardcode a colour, never use `text-white`/`bg-gray-500`, never write `rgb()` — tokens are HSL triplets, so wrap them: `hsl(var(--primary))`.
- Legacy = orange dot, modern = violet dot. The dot always travels with a text label.
- One primary action per screen; secondary and ghost actions visibly lighter. Every interactive element needs hover, focus-visible and active states.
- Icons are lucide-react only. No emoji, no stock photography.
- Layout must hold at 375px and 1280px with no horizontal scroll.

To change the look, call `design_agent` — never edit the token block by hand.

---

## 5. Recipes

### 5.1 Add a read-only feature (the common case)

1. **Data module** — put the content or pure computation in `backend/<feature>.py`. No Mongo, no FastAPI imports.
2. **Route** — in `server.py`:
   ```python
   @api_router.get("/feature")
   async def get_feature():
       return feature_module.build()
   ```
   Declared on `api_router`, it is authenticated automatically.
3. **Contract** — add the response shape to `contracts.md` (this is the step people skip, and it is the one that matters).
4. **Type** — add the interface to `frontend/src/lib/api.ts`.
5. **Screen** — new file in `pages/`, `<AppShell>` wrapper, fetch with `api<T>()`, handle three states: loading skeleton, error banner with retry, empty panel with an icon and a CTA.
6. **Wire** — route in `App.tsx` inside `<RequireAuth>`; nav entry in `AppShell.tsx` if it belongs in the sidebar.
7. **Test** — happy path + auth denial in `tests/test_api.py`.
8. **Log** — append a section to `context.md`.

### 5.2 Add a mutation

Same as above, plus `user: dict = Depends(require_maintainer)` on the handler, a `<Button variant="primary">` gated on `canEdit` in the UI, and a toast for success and failure. Never rely on hiding the button as your only protection — the server check is the real one.

### 5.3 Change an existing shape

`contracts.md` → backend route + models → `lib/api.ts` → consuming screens → tests. Changing the UI first guarantees a silent mismatch.

### 5.4 Add a new collection

Seed it in `seed_if_empty()` with an `origin` tag, add `format_doc()` on the way out, expose it through a router, and add it to `search.py`'s fan-out so it is discoverable from ⌘K.

---

## 6. Environment

```bash
# backend/.env (never commit real values)
MONGO_URL=...        # injected in production — never hardcode
DB_NAME=...          # injected in production
CORS_ORIGINS=...
JWT_SECRET=...       # must be set in production
GITHUB_TOKEN=...     # optional: private repos + higher rate limit
BITBUCKET_USERNAME=... / BITBUCKET_APP_PASSWORD=... or BITBUCKET_TOKEN=...  # optional: private Bitbucket Cloud
GIT_HTTP_USERNAME=... / GIT_HTTP_TOKEN=...  # optional: private repos on any https Git host
GIT_ALLOWED_HOSTS=... # optional: restrict /ingest/git to these hosts

# frontend/.env
VITE_BACKEND_URL=    # managed by the platform, leave it alone
```

Append env vars rather than rewriting the file, then restart the affected service:

```bash
printf '\nNEW_KEY=value\n' >> backend/.env
supervisorctl restart backend
```

Frontend and backend already run under supervisord with hot reload. Never start your own `uvicorn` or `vite` process; do not restart for code edits (only for new dependencies or env changes).

---

## 7. Debugging map

| Symptom | Look here first |
|---|---|
| 401 on a valid session | `lib/api.ts` `getToken`, then `current_user` in `server.py` |
| 403 on a save button | Role is `engineer`; `require_maintainer` is working as designed |
| Empty list on a screen that should have data | Did seeding run? Check `origin` tags and the collection count |
| `_id` leaking to the client | A document skipped `format_doc()` |
| Page renders blank, console error | Read the actual error; a bad import in a lazily-rendered route is the usual cause |
| 504 on a `.js` chunk | Clear the Vite cache and restart the frontend |
| Import finds nothing | Extension filter or the folder does not contain a `.sln`/`.csproj` |
| GitHub import 429 | Anonymous rate limit — set `GITHUB_TOKEN` |

For a bug you have already failed to fix twice, stop guessing and use `troubleshooter` instead of a third attempt.

---

## 8. Security posture (current, honest)

Implemented and verified:

- Router-level auth on all 48 non-public endpoints; 9 mutations additionally require `maintainer`.
- Roles are server-assigned; signup always creates `engineer`.
- Search terms are regex-escaped; no raw HTML is rendered (article blocks are structured data, not HTML).
- Contract exports are generated from stored records, so a download cannot drift from the documented shape.

Known gaps — deliberately documented, not silently ignored:

1. ~~Self-signup is open~~ Now an owner setting: open, company domains, or invite only (Admin → Settings).
2. **A seeded demo maintainer** exists with a published password, prefilled on the login screen.
3. **`JWT_SECRET` has a development fallback** in source.
4. **No rate limiting** on `/auth/*` or `/ingest`.
5. **No request body size cap** — ingestion limits are enforced inside the analyser, not before parsing.
6. ~~Tokens live 7 days with no revocation~~ Session length is an owner setting; role changes and deactivation revoke a user's tokens via `session_version`.
7. **CORS defaults to `*`** when `CORS_ORIGINS` is unset, with credentials allowed.
8. **Dependencies are mostly unpinned** and `python-jose` is declared but unused.

Fix order if you are taking this to production: 1 → 3 → 2 → 4/5 → 7 → 8.

---

## 9. Upcoming features (not built)

Marked clearly so nobody assumes they exist.

**Security hardening** — invite-only or domain-restricted signup; remove the seeded maintainer; require `JWT_SECRET`; short-lived tokens with a session version; rate limiting on auth and ingest; body-size middleware; `.gitignore` for dotenv files; pinned dependencies with `pip-audit` in CI.

**Contracts** — editable contracts from the UI (today the registry is reviewed in source control); generated OpenAPI specs for `endpoint` contracts; a machine-readable consumer-impact endpoint for CI to call before a schema change ships.

**Coverage** — add a second dimension measured from actual code (lines or procedures detected during import) next to today's documented-status score; per-team rollups; a trend line over time.

**Knowledge base** — saved searches and pins; a deprecation radar flagging legacy docs unreviewed for 90 days; CSV/Markdown export of the rulebook; change-diff on re-import instead of updating in place.

**Service map** — pull edges from real telemetry or OpenAPI rather than the curated table; per-edge latency and error budgets.

**Personalisation** — a dashboard progress figure driven by actual reading rather than the static meter.

---

## 10. Conventions checklist

Before you call a change done:

- [ ] Response shape recorded in `contracts.md`
- [ ] Interface added to `lib/api.ts`
- [ ] Loading, error and empty states handled
- [ ] Mobile (375px) and desktop (1280px) both hold
- [ ] Focus states present; nothing reachable only by hover
- [ ] Semantic tokens only — no hardcoded colours
- [ ] Mutations gated with `require_maintainer` server-side
- [ ] Focused test added or updated when behaviour changed
- [ ] `context.md` appended
- [ ] Frontend typecheck passes
