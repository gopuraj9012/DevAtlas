# DevAtlas — project context

## What this is
Internal .NET knowledge base ("DevAtlas") for a team maintaining two codebases:
a legacy .NET Framework 4.8 platform (IIS, Web Forms + MVC 5, WCF, ADO.NET/stored procedures)
and a modern .NET 8 platform (Clean Architecture, CQRS/MediatR, EF Core 8, minimal APIs).
Goal: a new hire can onboard without tribal knowledge.

## Stack
- Frontend: React + Vite + TS, Tailwind, shadcn/ui from `components/ui/`, lucide icons, react-router.
- Backend: `backend/server.py` (FastAPI, motor), `backend/seed_knowledge.py` (seed content).
- DB: MongoDB. Seeding runs on startup when collections are empty.
- Demo account: a local maintainer is seeded from `DEMO_EMAIL` / `DEMO_PASSWORD` in `backend/.env` (not committed).

## Routes
| Route | Access | Purpose |
|---|---|---|
| `/` | redirect | → `/dashboard` when signed in, else `/login` |
| `/login` | public | DevAtlas landing + sign in / sign up (hero + code card) |
| `/dashboard` | auth | Violet welcome card, projects grouped Legacy / Modern, new-project dialog |
| `/projects/:slug` | auth | Project hub: tabs (Overview / Architecture / Standards / Setup), doc list, onboarding card, stack |
| `/team` | auth | Owners and roles, who to ask before touching shared schema |
| `/standards` | auth | Tabs: coding standards (accordion) + validation rules summary (links to `/validation`) |
| `/validation` | auth | **Searchable validation repository**: 14 rules (shape 9 / policy 4 / invariant 1), filters by system/tier/severity, expand for legacy+modern implementation, add new rule |
| `/translations` | auth | **Legacy → modern pattern translator**: 12 curated patterns, search + category chips, side-by-side code, "what changes" steps and migration traps |
| `/snippets` | auth | **Bad vs standard trainer**: 18 interactive pairs, one per coding standard (CS-001…CS-018). Legacy-bad panel always visible with the reason list; modern standard hidden behind a per-card reveal (plus reveal-all), category/system filters, search, and a revealed-progress meter |
| `/feedback` | auth | **Standards feedback**: flag outdated standards or suggest improvements to architecture modules. Voting (per-user toggle), open/triaged/accepted/declined triage select, status + kind + target filters, search, counts, empty state. Dialog picks a real target from `/api/feedback/targets`; deep-linkable from the rulebook and article pages |
| `/contracts` | auth | **Data contracts registry**: 8 shared contracts (tables, views, HTTP, SOAP, event, file batch). Master-detail with kind/status filters, full-text field search, field table, compatibility rules, owner-vs-consumer code compare, breaking-change history, and the 5-rule change policy banner |
| `/deployments` | auth | **Deploy flows**: Legacy IIS vs container rollout runbooks. Modes: Legacy / Containers / Compare (default). 7 shared stages per flow with commands, checkpoints, warnings; per-flow cadence, duration, rollback window and downtime |
| `/glossary` | auth | Terms with split legacy/modern definitions |
| `/learning-path` | auth | 15-step onboarding with per-user progress |
| `/article/:slug` | auth | Doc reader with TOC scroll-spy, split compares, mark-read, edit |
| `/authoring` | auth | Create article / glossary term / standard |
| `/ingest` | auth | Import an existing .NET project folder: pick a folder, scan it, generate docs |

## Key components
- `components/shell/AppShell.tsx` — violet sidebar (collapsible 260↔56px, system groups with orange LEGACY / violet MODERN dots, pinned user block), 56px top bar with search field, dark status strip footer, optional `sidebar` + `toc` slots.
- `components/kb/Bits.tsx` — MicroLabel, SystemDot, FrameworkBadge, Pill, SystemTag, ProgressMeter, EmptyPanel, MetaRow, DottedRule.
- `components/kb/CodeBlock.tsx` (dark panel), `SplitCompare.tsx` (legacy vs modern signature), `BlockRenderer.tsx`, `Block.tsx`, `ArticleEditor.tsx`, `SearchDialog.tsx`.
- `lib/api.ts` (fetch + types), `lib/auth.tsx` (JWT context), `lib/markdown.ts` (md → blocks).

## Design
Locked by design_agent (violet DevAtlas SaaS): white surfaces, violet primary 263 70% 50%, accent lavender,
soft shadows, Inter throughout (mono for code only), orange dot = legacy, violet dot = modern.
See `design_guidelines.md`. Do not edit tokens; redesigns go through design_agent.

## Codebase import (feature added on request)
`/ingest` lets a signed-in engineer pick a real project folder (`webkitdirectory`). The browser reads text files only
(skips bin/obj/node_modules/.git/packages), posts `{path, content}` pairs to `POST /api/ingest`, and `backend/ingest.py`
(heuristics, no external deps) parses `.sln`/`.csproj` and greps sources for stack + risk signals.
Generated output: one `projects` doc per csproj (framework from `TargetFramework` *or* classic `TargetFrameworkVersion`,
system legacy|modern), two articles per project (architecture + setup) and one repo-wide scan article, all `origin: IMPORTED`
with `project: <name>` so the project hub lists them. Re-import is idempotent (upsert by slug).
Limits: 6000 files / 400 KB per file / ~7.5 MB total; larger folders get a clear inline message.

## Content (seeded, origin = SEED)5 projects (2 legacy: Atlas.Core, Billing.Integration · 3 modern: OrderPlatform.Api, OrderPlatform.Worker, Identity.Gateway),
6 team members, 15 articles (KB-0101…KB-0701), 35 glossary terms, 18 coding standards, 18 validation rules, 15 path steps.

## Deferred / known limits
- **Roles**: `maintainer`/`owner` can edit content; new signups are `engineer` (read + feedback + own progress). Promoted via the `users.role` field.
- Auth is email + password (SSO is copy-only, not implemented) — do not claim SSO works.
- No doc versioning; `updated` + `edited_by` are the only audit fields.
- Open items from the security review: self-signup is still open (no invite/domain allowlist), `DEMO_PASSWORD` is still seeded as a maintainer, no rate limiting, no length limits on models, unpinned dependencies.

## Guided project checklists (added this session)
- `GET /api/projects/{slug}/checklist` + `POST /api/projects/{slug}/checklist/step` (auth required).
- Content is generated in `backend/checklists.py` from the project record + its docs, so hand-created and imported projects both get a checklist; three fixed phases (architecture, standards, environment), three steps each.
- Steps are system-aware: legacy gets nuget/msbuild/iisexpress and shared-table framing; modern gets dotnet restore/build/run, user-secrets and endpoint/event framing.
- Completion stored per user in `checklist_progress` (one member never sees another's ticks).
- UI: `frontend/src/components/kb/ProjectChecklist.tsx` rendered in a new "Checklist" tab on `/projects/:slug`; the sidebar card now shows real per-project progress (it previously showed the global `/path` progress, which was wrong per project).
- The global `/learning-path` page still exists and is unchanged; it is the team-wide ramp, not the per-project checklist.

## GitHub import (added this session)
- `POST /api/ingest/github` `{repo, ref?, path?}` (maintainer only). `backend/github_repo.py` resolves the repo, lists the tree in one API call, fetches source text in parallel, then hands the files to the EXISTING `ingest_repository` handler — analysis and persistence are shared with the folder upload, no duplicated logic.
- Public repos need no credentials (tree via REST API, text via raw.githubusercontent.com which costs no rate limit). `GITHUB_TOKEN` in backend env switches to the contents API for private repos and 5,000 req/hour. Token never reaches the frontend.
- Reuses ingest limits (`is_candidate`, <=400 KB/file, <=300 files, <=14M chars) and sets `truncated` instead of failing.
- Errors mapped to 400/403/404/422/429/502 with actionable detail strings.
- UI: `/ingest` gained a source switcher ("Upload a folder" | "Read from GitHub"); result rendering extracted to `components/kb/IngestResult.tsx`, the GitHub form lives in `components/kb/GithubIngest.tsx`.

## Developer documentation
- `DEVELOPMENT.md` is the single guide for both sides: stack, repo layout, every backend module, the 51-endpoint API map, auth model, collections, frontend routes/components, design rules, feature recipes, env vars, debugging map, honest security gaps, and the not-yet-built roadmap. Keep it updated when routes, modules or features change.

## Local rebuild (2026-11-26)
Rebuilt from these specs as a standalone repo on a Windows laptop.
- MongoDB 7 runs from `docker-compose.yml` (container `devatlas-mongo`, volume `devatlas_mongo_data`, bound to 127.0.0.1:27017).
- Backend: `backend/server.py` + the modules listed in DEVELOPMENT.md, plus `md_blocks.py` (markdown subset <-> blocks, mirrored by `frontend/src/lib/markdown.ts`). 52 `/api` routes; 65 tests in `backend/tests/test_api.py`.
- Frontend: Vite dev server on 5173 proxies `/api` to uvicorn on 8000 (replaces the platform's Express proxy locally). 22 routes, 21 screens.
- Security gaps closed in this build: `JWT_SECRET`, `MONGO_URL`, `DB_NAME` and `CORS_ORIGINS` are required with no fallback; the demo maintainer is seeded only when `DEMO_EMAIL`/`DEMO_PASSWORD` are set; request models carry length limits; dependencies are pinned; `python-jose` is not used; CORS is an explicit origin list without credentials; `.env` is gitignored. Still open: self-signup is open, no rate limiting, 7-day tokens without revocation.
- Design: built on white surfaces per the guidelines body (the "Mode: DARK" note in the theme block contradicts the rest of the file and was not applied). The landing page says email and password sign-in, not SSO, because SSO is not implemented.
- Search covers the nine content collections; stored procedures are not searchable yet (they are static data reached through each legacy project's Stored procs tab).

## More import sources (2026-11-26)
`/ingest` now offers five sources: Folder, Zip file, GitHub, Bitbucket, Git URL. Backend in `backend/repo_sources.py`; endpoints `POST /api/ingest/archive|bitbucket|git` (maintainer only), all feeding the same `ingest_repository`. Git sources shallow-clone over https only with credentials from env (see `.env.example`), never prompting and never following symlinks. Framework detection reads `Directory.Build.props`. Verified live: ardalis/CleanArchitecture via Git URL (6 projects, .NET 11) and a public Bitbucket Cloud repo (cloned, correctly 422 as it has no .NET code). Tests: `backend/tests/test_sources.py`.

## Admin screen (2026-11-26)
Owner-only `/admin` (sidebar "Admin") with Users (change role, deactivate/reactivate), Invites (single-use links that set the role), Settings (sign-up mode open/domain/invite, allowed domains, session length, import sources) and Audit log (role, invite, settings and import events). Backend `admin_router` in `server.py`; new collections `settings`, `invites`, `audit`. Tokens carry a session version so role changes and deactivation sign the user out. First owner comes from `BOOTSTRAP_OWNERS`. The sign-in page reads `/api/auth/config` and shows an invite-code field when needed; `/login?invite=<code>` pre-fills it. Tests: `backend/tests/test_admin.py`.

## Code map (2026-11-28)
Imports build a deep code map with a tree-sitter C# parser (`backend/code_index.py`): types, members, routes, call graph (resolved through fields, constructor-injected interfaces and their implementations), controller results (View/PartialView → .cshtml, RedirectToAction → action), layouts/_ViewStart/partials, Razor Pages, Web Forms markup (code-behind, control events, master pages, user controls, PageMethods) and JavaScript AJAX/fetch URLs matched to attribute or conventional routes. UI: "Code map" tab on the project page (`components/kb/CodeMap.tsx`) with search, layer filters, per-method callers/calls/front-end callers, view details and a Markdown deep-doc download. Checked against Microsoft's eShopOnWeb sample. Limitations: static analysis without a compiler (dynamic dispatch, reflection, DI registrations by convention and string-built URLs can be missed); VB.NET source is not parsed.
