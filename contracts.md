# API contracts — Eng Handbook

Base: `${API_URL}/api`. Auth: `Authorization: Bearer <jwt>` (HS256, 7-day TTL, `JWT_SECRET`).
All documents expose `id` (never `_id`).

## Auth
- `POST /auth/signup` {email, password, name?} → `{token, user}` | 409 duplicate
- `POST /auth/login` {email, password} → `{token, user}` | 401
- `GET /auth/me` → `user` | 401

`user` = `{id, email, name, role}`

## Content (public read)
- `GET /overview` → `{systems[], start_here[], counts{articles,terms,rules,validation,steps}}`
- `GET /articles?section=&system=` → `ArticleSummary[]` (no blocks)
- `GET /articles/{slug}` → `ArticleDetail` = summary + `blocks[]`, `source_md`, `prev`, `next`, `sidebar[]` | 404
- `GET /glossary?q=` → `GlossaryEntry[]`
- `GET /rules?category=coding|validation` → `RuleEntry[]`
- `GET /path` → `PathStep[]` (ordered by `step`)
- `GET /search?q=` → `{type: article|term|rule, label, hint, slug?}[]`

## Writes (auth required)
- `POST /articles` {title, section, system, summary, tags[], blocks[], source_md} → `ArticleSummary`
- `PUT /articles/{slug}` {title?, summary?, tags?, blocks?, source_md?} → `ArticleSummary`
- `POST /glossary` {term, system, definition, legacy_definition?, modern_definition?, see_also[]} → entry | 409
- `POST /rules` {rule_id?, category, system, title, rationale?, good?, bad?} → rule

## Progress (auth required, per-user isolation)
- `GET /progress` → `{user_id, steps: int[], articles: string[]}`
- `POST /progress/step` {step:int} → toggles, returns progress
- `POST /progress/article` {slug:str} → toggles read state, returns progress

## Collections
`users` · `articles` (blocks + source_md) · `glossary` · `rules` (category coding|validation) · `path` · `progress`

## Block schema (article body)
`p` {text} · `h2` {text} · `ul`/`ol` {items[]} · `code` {lang, filename, code} ·
`callout` {tone: info|warn|danger, title, text} · `table` {columns[], rows[][]} ·
`figure` {caption, nodes[]} · `compare` {title, note?, legacy{filename,lang,code}, modern{...}}

Markdown subset (editing round-trip): `##`, `-`, `1.`, ```` ```lang file ````, `> [tone] Title`,
pipe tables, `:::figure Caption` + `A | B | C`, `:::compare Title` + two code fences.

## Validation library (canonical repository of rules)
`GET /api/validation?q=&system=&tier=&severity=&project=` → `ValidationRule[]`
- `system` filter is inclusive: `?system=legacy` returns rules scoped `legacy` **and** `both`.
- `q` searches `rule_id`, `name`, `field`, `constraint`, `message`, `tags`, `projects`, `tier`, `notes`.
- `GET /api/validation/{rule_id}` → single rule | 404
- `POST /api/validation` (auth) `{name, field, tier?, system?, constraint?, pattern?, message?, severity?, enforced?, projects?, tags?, notes?}`
  - 400 without name/field, 409 on duplicate name; auto `rule_id` = next `VR-0NN`; `origin: "TEAM"`.
  - Invalid `tier`/`severity`/`system` fall back to `shape`/`error`/`both`.

`ValidationRule` = `{id, rule_id, name, field, tier: shape|policy|invariant, system: legacy|modern|both, constraint, pattern?, message?, severity: error|warn|info, enforced, projects[], tags[], notes?, version?, reviewed?, legacy_impl?, modern_impl?, origin}` where an impl is `{filename, lang, code}`.

Collection `validation` is seeded from `VALIDATION_LIBRARY` in `backend/seed_knowledge.py` (14 rules — shape 9 / policy 4 / invariant 1 — `origin: "SEED"`). `/api/rules?category=validation` remains the thin standards-table view; the library is the source of truth.

## Data contracts (shared surface between the two systems)
`GET /api/contracts?q=&kind=&status=&direction=` → `DataContract[]` (sorted by `code`)
- `q` matches `code`, `name`, `summary`, `owner`, `kind`, `status`, `producers[]`, `consumers[]`, `rules[]`, and `fields[].name/type/notes`.
- `kind` ∈ `table | view | endpoint | soap | event | file`; `status` ∈ `stable | draft | deprecated`; `direction` ∈ `legacy_to_modern | modern_to_legacy | bidirectional`.
- `GET /api/contracts/meta` → `{kinds[{key,label,count}], statuses[{key,count}], directions[{key,label}], policy[{title,detail}], total}`
- `GET /api/contracts/{code}` → single contract | 404

`DataContract` = `{id, code, name, kind, direction, owner, status, version, updated, summary, producers[], consumers[], fields[{name,type,required,notes}], rules[], legacy{filename,lang,code}, modern{filename,lang,code}, changes[{version,date,summary,breaking}], origin}`.

Seeded from `backend/datacontracts.py` (`CONTRACTS` = 8 entries DC-01…DC-08, `CHANGE_POLICY`, `CONTRACT_KINDS`, `DIRECTIONS`; `origin: "SEED"`). Read-only by design — the registry is reviewed in source control, not edited in the browser.

## Guided project checklists (per project, per user)
`GET /api/projects/{slug}/checklist` → `{project{slug,name,system,framework,repo,stack}, phases[], progress{done[],completed,total,percent}}`
- Every project gets three fixed phases in order: `architecture`, `standards`, `environment` (3 steps each, 9 total). Steps are generated at request time from the project record + its docs, so hand-created and imported projects both get a checklist with no seeding.
- Step = `{key,title,detail,est,verify,command,links[{label,to}],docs[{slug,title}],done}`. `verify` is the completion criterion shown to the reader; `command` is the system-specific terminal snippet (legacy: nuget/msbuild/iisexpress · modern: dotnet restore/build/run).
- `docs` are real articles attached by section (`architecture`, `standards`, `onboarding`) — never invented links.
- `POST /api/projects/{slug}/checklist/step` body `{step, done?}` → `{step, done, progress}`. Omitting `done` toggles. Unknown step → 400; unknown project → 404.
- Progress is per user in `checklist_progress` `{user_id, project_slug, done[], created_at, updated_at}`; one member never sees or alters another's ticks.

## Import (`POST /api/ingest`, `POST /api/ingest/github`) — maintainer only
`POST /api/ingest` body `{files: [{path, content}]}` — browser folder upload (webkitdirectory), analysed in-process.
`POST /api/ingest/github` body `{repo, ref?, path?}` — reads the code from GitHub server-side, then reuses the exact same analysis + persistence path as the folder upload.
- `repo` accepts `owner/repo`, `https://github.com/owner/repo`, a `.git` suffix, or a `…/tree/<ref>/<folder>` URL (the ref and folder are extracted from the link). Invalid input → 400; unsupported host (e.g. GitLab) → 400; single-file `/blob/` link → 400.
- `ref` defaults to the repository's default branch. `path` limits the scan to one folder.
- Public repositories need no credentials: the tree comes from one `/git/trees/{ref}?recursive=1` call and file text from `raw.githubusercontent.com` (no API rate-limit cost). If `GITHUB_TOKEN` is set in the backend environment, files are read through the contents API instead, which supports private repositories and raises the ceiling to 5,000 requests/hour.
- Limits are shared with the folder upload: only analysable extensions, `bin/obj/node_modules/packages` skipped, ≤400 KB per file, ≤300 files per repo read, ≤14M characters total. Exceeding a cap sets `truncated: true` rather than failing.
- Errors: 404 repository/branch/folder not found (or private without a token) · 403 token rejected · 429 anonymous rate limit exhausted · 422 no .NET files found at that location · 502 GitHub returned an unexpected status.
- Success = the ingest response plus `source: {repo, ref, path, url, files_read, files_skipped, truncated, authenticated}`.

## Access control (enforced)
- `api_router` is constructed with `dependencies=[Depends(current_user)]`, so **every** `/api` route requires a bearer token unless it is declared on `public_router`. Public routes are exactly: `GET /api/` (health), `POST /api/auth/signup`, `POST /api/auth/login`.
- `require_maintainer` (role ∈ `maintainer | owner`, default role is `engineer`) guards all content mutations: `POST /validation`, `POST /articles`, `PUT /articles/{slug}`, `POST /glossary`, `POST /rules`, `POST /projects`, `POST /ingest`, and `POST /feedback/{id}/status` (triage). Returns 403 with an actionable message.
- Any authenticated member may: read all content, create feedback, vote, and manage their own progress.
- Frontend mirrors the rule for honesty: non-maintainers do not see Import / New project / Suggest an edit / the sidebar add buttons; the dashboard shows `read-only · suggest a change` linking to Feedback.

## Search (`GET /api/search?q=<term>`)
- Auth required (api_router guard). Fans out over all nine content collections in parallel and returns ranked hits.
- Ranking weights per collection: title/name 100, identifier (doc_id, rule_id, code) 90, summary/intent 45–55, tags 40–45, body or code 20–30. Exact match ×1.6, prefix ×1.25, substring ×1.0.
- Response: `{ query, took_ms, count, total, facets: [{key,label,count}], results: [{type,label,hint,slug,system,excerpt,score}] }`. `type` ∈ article | rule | validation | snippet | translation | contract | deployment | term | project. `total` is the pre-limit match count; `count` is what was returned (max 60).
- `excerpt` is a shortened window around the first match in the field that scored highest; facets let the UI filter types client-side without another round trip.
- Empty `q` returns an empty result set (no error).

## Feedback (flags and improvement suggestions — auth required)
`GET /api/feedback?status=&kind=&target_type=&q=` → `FeedbackItem[]`
- Requires auth (so each item can report `voted` for the caller).
- Ordering: triage order (`open → triaged → accepted → declined`), then by `vote_count` desc, newest first within a group.
- `q` matches `message`, `target_label`, `target_ref`, `category`, `author_name`, `author_email`.

- `GET /api/feedback/meta` → `{total, statuses[{key,count}], kinds[{key,count}], target_types[{key,count}]}`
- `GET /api/feedback/targets` → `{standards[{ref,label,hint}], architecture[{ref,label,hint}]}` (coding rules + all articles) — drives the flag dialog.
- `POST /api/feedback` `{kind, target_type, target_ref, target_label?, category?, message, severity?}` → item
  - `kind` ∈ `outdated | improvement`; `target_type` ∈ `standard | architecture`; 400 on unknown values, missing `target_ref`, or `message` shorter than 10 chars.
  - Author is auto-voted (`vote_count: 1`, `voted: true`); `status` starts `open`.
- `POST /api/feedback/{id}/vote` → toggles the caller's vote, returns the updated item (404 on unknown/invalid id). Votes are per-user and isolated.
- `POST /api/feedback/{id}/status` `{status, note?}` → triage; `status` ∈ open/triaged/accepted/declined (400 otherwise). Records `triaged_by` + `status_note`.

`FeedbackItem` = `{id, kind, target_type, target_ref, target_label, category?, message, severity?, status, status_note?, vote_count, voted, author_name, author_email, created_at}`.

Deep links: `/feedback?type=standard|architecture&ref=<rule_id|slug>&label=<title>` opens the dialog pre-filled (used by the "Flag this standard" link in the rulebook and "Flag as outdated" on every article).

## Learning snippets (bad vs standard)
`GET /api/snippets?q=&category=&system=` → `LearnSnippet[]` (sorted by `code`)
- `q` matches `code`, `rule`, `title`, `category`, `instead`, `why_bad[]`, `tags[]`, and both code bodies.
- `system` is inclusive: `?system=legacy` returns `legacy` **and** `both`.
- `GET /api/snippets/categories` → `[{key, label, count}]`
- `GET /api/snippets/{code}` → single snippet | 404

`LearnSnippet` = `{id, code (SN-01…), rule (CS-0NN), title, category, system, why_bad[], instead, tags[], bad {filename,lang,code}, standard {filename,lang,code}, origin}`.

Seeded from `backend/snippets.py` (`SNIPPETS`, 18 pairs — **one per coding standard CS-001…CS-018**, enforced by test; `SNIPPET_CATEGORIES`, `origin: "SEED"`). Read-only: the UI withholds `standard` until the reader reveals it, but both bodies ship in the payload.

## Deployment flows (read-only runbooks)
`GET /api/deployments` → `{stages: [{key, label}], flows: DeploymentFlow[]}` — stages in canonical order: `build, artifacts, gate, database, deploy, verify, rollback`; flows sorted legacy then modern.
- `GET /api/deployments/{slug}` → single flow | 404
- Source of truth: `backend/deployments.py` (`STAGES`, `FLOWS` = `legacy-iis`, `modern-containers`). Read-only by design — a runbook is an engineering decision, edited in source.
- Flows store **only** stage keys; `_enrich_flow()` attaches the canonical `label` at read time, so a flow stage is always `{key, label, steps[]}`.

`DeploymentFlow` = `{id, slug, name, system: legacy|modern, stack, cadence, duration, rollback_window, downtime, summary, stages[]}` where a step is `{title, detail, command?, lang?, checkpoint?, warn?}`.

## Translation patterns (legacy → modern)
`GET /api/translations?q=&category=` → `Translation[]`
- `q` searches `code`, `pattern`, `intent`, `tags`, `category`, and both code bodies.
- `GET /api/translations/categories` → `[{key, label, count}]`
- `GET /api/translations/{code}` → single pattern | 404

`Translation` = `{id, code (TR-01…), pattern, category: ui|data|http|lifecycle|di|security|validation|state|async, intent, effort: S|M|L, risk: low|medium|high, tags[], legacy {filename, lang, code}, modern {filename, lang, code}, steps[], gotchas[], origin}`.

Seeded from `backend/translations.py` (`TRANSLATIONS`, 12 patterns, `origin: "SEED"`). Read-only by design — a translation is a curated engineering decision, edited in source.

## Codebase import (auth required)
- `POST /ingest` `{files: [{path, content}]}` → `{stats, findings[], projects[], articles[]}`
  - Browser reads a folder (`webkitdirectory`) and posts text files only (`.cs`, `.csproj`, `.sln`, `.config`, `.json`, `.cshtml`, `.aspx`, `.sql`, `.md`, `.xml`); `bin`, `obj`, `node_modules`, `.git`, `packages`, `dist`, `build` are skipped. Limits: 6000 files / 14M chars.
  - Returns 400 when no files are sent, 422 when nothing .NET-recognisable is found.
  - `stats` = `{files, source_files, lines, projects, solutions[], by_extension{}}`
  - `findings[]` = `{key, label, count, examples[], risk}` — `risk: true` marks documented failure patterns (HttpContext.Current, ViewState coupling, blocking async, SQL concatenation).
  - Side effects: upserts a `projects` doc per `.csproj` (framework from `TargetFramework`/`TargetFrameworkVersion`, system legacy|modern) and upserts generated `articles` (per project: architecture + setup; plus one repo-wide scan doc) with `origin: "IMPORTED"`, `project: <name>`, `doc_id: KB-8xxx`.
  - Idempotent: re-importing the same folder updates those docs in place (`created: false`) instead of duplicating.

## Project ↔ doc linkage
Articles may carry `project: <project name>`. `GET /projects/{slug}` returns docs where `project == name` OR (`project` missing AND `system ∈ {project.system, "both"}`), so seeded and imported docs coexist.

## Contract exports (local development downloads)
`GET /api/contracts/{code}/schema.json` → JSON Schema 2020-12 document, `Content-Type: application/schema+json`, `Content-Disposition: attachment`.
`GET /api/contracts/{code}/schema.sql` → T-SQL `CREATE TABLE` script, `Content-Type: application/sql`, `Content-Disposition: attachment`.
- Both are auth-guarded and generated in `backend/contract_export.py` from the stored contract record only, so an export can never drift from the documented shape.
- JSON Schema: `properties` per field with mapped type/format (`nvarchar(160)` → `string` + `maxLength`, `uniqueidentifier` → `string`/`uuid`, `decimal(18,2)` → `number`, `bit` → `boolean`, `yyyymmdd` → `string` + pattern), `required` from the field flags, notes become `description`, plus `x-sourceType` and an `x-devatlas` block (code, kind, status, version, owner, direction, producers, consumers, rules). `additionalProperties` is `true` for `endpoint`/`event`/`soap` (consumers must tolerate unknown fields) and `false` for `table`/`view`/`file`.
- SQL DDL: only for `table` and `view` → otherwise **400**. Table names are sanitised to valid identifiers (`Order / OrderLines` → `Order_OrderLines`). The first required `*Id` field becomes the PRIMARY KEY, `int IDENTITY` keeps its identity seed, `rowversion` is emitted without nullability, and column notes + compatibility rules are appended as comments. The drop statement ships commented out so nothing destructive runs by accident.
- Filenames: `{code}-{name-slug}.schema.json` / `{code}-{name-slug}.sql`.
- `CORS` now exposes `Content-Disposition` so the browser can use the server-provided filename cross-origin.
- The UI downloads via `fetch` + Blob (not a bare link) because the bearer token must travel in a header.

## Impact graph (`GET /api/contracts/graph`)
Auth required. Built in `backend/impact.py` from the contract registry plus the project catalogue.
- Scope: contracts of kind `table`, `view`, `soap` whose owner system is `legacy` or `both` (`direction` = `legacy_to_modern` / `bidirectional`). Modern-owned endpoints, events and file batches are excluded — this view is the legacy surface modern services read.
- Consumers are the contract's `consumers[]`, each classified `legacy | modern | unknown` by matching the name against `projects.name`. Unresolvable names are kept and reported as `unknown` — an unidentified consumer is still a consumer.
- Risk tier per interface: `high` = deprecated (frozen) or draft while already consumed · `medium` = stable but has a breaking change on record · `low` = stable and never re-shaped.
- Response: `{interfaces[], services[], edges[], summary}`. `interfaces[]` = `{code,name,kind,kind_label,status,version,owner,direction,owner_system,producers,legacy_producers,consumers[{name,system,slug}],modern_consumers,legacy_consumers,unknown_consumers,breaking_changes,risk,updated}`; `edges[]` = `{from(code),to(service),system,risk,breaking}` (one per consumer); `summary` = `{interfaces,services,modern_services,unclassified_services,edges,high_risk,breaking_changes,sql,soap}`.
- Interfaces are ordered high → medium → low risk, then by code, so the UI can render "review these first" without re-sorting.
- UI: a `Registry | Impact graph` toggle on `/contracts`; the graph renders as an SVG flow (legacy interface → consuming service) on large screens and as stacked cards below `lg`, with SQL/SOAP filters and click-through to the contract detail.

## Stored procedures (`GET /api/projects/{slug}/procedures`)
Auth required, generated at request time from `backend/procedures.py` — no seeding step, so every legacy project renders immediately.
- Returns `{project{slug,name,system}, procedures[], note, summary}`; unknown slug → 404.
- `procedures[]` = `{project_slug,name,purpose,criticality(critical|high|medium),status(rewritten|partial|not-started),called_by[],tables[],contract,parameters[{name,type,direction}],returns,legacy_lang,legacy_code,modern{service,entry,flow,note,lang,code},notes[]}`.
- `criticality` is ordered critical → high → medium so the most dangerous procedure is first; `contract` links to the data contract entry that owns the shape.
- `modern` is the replacement path: owning service, the request entry (endpoint or event), the internal flow, and the code that actually runs. `not-started` entries carry the current workaround instead of a rewrite.
- `summary` = `{total,critical,rewritten,partial,not_started,coverage_percent}`; coverage counts a `partial` rewrite as half done.
- Modern projects return `procedures: []` with a note that stored procedures belong to the legacy side — never a 404 or an error.
- UI: a `Stored procs` tab on `/projects/:slug`, shown only when `project.system === "legacy"`.

## Service graph (`GET /api/architecture/service-graph`)
Auth required. Static runtime topology from `backend/servicegraph.py` — no DB read, because service-to-service wiring is architecture, not content.
- Returns `{services[], edges[], libraries[], summary, note}`.
- `services[]` = `{key,name,kind(ui|api|worker|gateway|boundary),kind_label,column,row,stack,description,responsibilities[],external}`. `column`/`row` are explicit so the client renders a deterministic layout instead of a force simulation.
- `edges[]` = `{from,to,from_name,to_name,channel(endpoint|event),async,labels[],contract,contract_name,note,external}` — one row per service **pair**; a caller hitting two endpoints on the same service is one edge with two labels, never overlapping arrows.
- `external: true` marks an edge that leaves the modern estate (the legacy `Billing.Integration` consumer); the boundary is drawn as its own dashed node so the graph does not imply the event stops inside .NET 8.
- `libraries[]` = `{name,used_by[],note}` — compile-time project references (`ApplicationCore`, `Infrastructure`, `BlazorShared`). They are deliberately **not** service nodes: a project reference is not a network hop.
- `summary` = `{services,edges,sync,async,external,contracts[{code,name}]}`; summaries exclude external edges from the modern counts, and every cited contract code exists in the registry.
- UI: `/service-map` page (nav entry "Service map"). Solid violet = HTTP, dashed violet = event, dotted grey = crosses to legacy; hovering or focusing a service highlights its edges and fades the rest; selecting one opens a panel with callers, outbound calls and the contract on each edge. Below `lg` the graph becomes a stacked per-service connection list.

## Migration coverage (`GET /api/coverage/migration`)
Auth required. Aggregated by `backend/coverage.py` from the documented migration status of legacy assets — it invents nothing.
- An **asset** is a stored procedure (status from `procedures.py`) or a legacy interface with a recorded modern path.
- Scoring: `rewritten` = 1.0, `partial` = 0.5, `not-started` = 0.0. `overall.percent` = round(Σweight / total × 100); `weighted` exposes the raw sum so the number is auditable.
- Response: `{overall{percent,total,mapped,partial,not_started,weighted}, by_area[], items[], remaining[], note}`.
- `by_area[]` = `{key,label,total,mapped,partial,not_started,percent}` for `procedures` (Stored procedures) and `interfaces` (Legacy interfaces), ordered lowest coverage first.
- `items[]` = `{name,area,project_slug,project,status,status_label,weight,percent,contract,note,link}` ordered lowest weight first; `remaining[]` = the same rows filtered to anything not fully mapped, so gaps cannot be hidden inside an average.
- `contract` links an asset to the data contract that owns its shape; `link` deep-links to the project or contracts page.
- UI: `/coverage` page (nav entry "Migration coverage") — coverage ring for the headline %, per-area bars, a "still to migrate" list and a full asset table.

## More import sources (maintainer only)
All three reuse the exact analysis + persistence of `POST /api/ingest`; success is the ingest response plus `source`.
- `POST /api/ingest/archive` multipart field `file` = a `.zip` (≤25 MB, ≤20,000 entries). Read in memory, never extracted; a single shared top folder (GitHub/Bitbucket "Download ZIP") is stripped; `..` paths, encrypted entries and non-candidate files are skipped. 400 not a zip / wrong extension · 413 too large · 422 no .NET projects. `source = {kind: "archive", name, files_read, files_skipped, truncated}`.
- `POST /api/ingest/bitbucket` `{repo, ref?, path?}`. `repo` = `workspace/repo`, `https://bitbucket.org/workspace/repo`, or a `…/src/<ref>/<folder>` link. Shallow `git clone` over https. Private repos use `BITBUCKET_USERNAME` + `BITBUCKET_APP_PASSWORD`, or `BITBUCKET_TOKEN` (access token). Non-bitbucket.org hosts → 400 (use the Git URL source for Bitbucket Server).
- `POST /api/ingest/git` `{url, ref?, path?}`. Any `https://` clone URL (GitLab, Azure DevOps, Bitbucket Server, self-hosted). ssh/git/file/http URLs and URLs with embedded credentials → 400; host outside `GIT_ALLOWED_HOSTS` (when set) → 403. Private repos use `GIT_HTTP_TOKEN` (Bearer) or `GIT_HTTP_USERNAME` + `GIT_HTTP_TOKEN` (Basic).
- Clone rules (both git sources): depth 1, single branch, blobs >400 KB filtered, no credential prompts, symlinks not followed, 120 s timeout, temp folder always removed. `ref` must be a plain branch/tag name; `path` must be relative. A folder import still includes `Directory.Build.props` files above it.
- Errors: 404 repository/branch/folder not found or private without credentials · 403 credentials rejected or host not allowed · 422 no .NET projects · 502 other clone failure · 504 clone timeout.
- `source = {kind: "git" | "bitbucket", repo, host?, ref, path, url, files_read, files_skipped, truncated, authenticated}`. Credentials never appear in the response.
- Framework detection now also reads `Directory.Build.props` (nearest first); an SDK-style project with no resolvable TFM is reported as `.NET (SDK-style)`, system `modern`.

## Admin (owner only) and sign-up policy
Router `admin_router` (`/api/admin`, `Depends(require_owner)`): 401 without a token, 403 for engineer/maintainer.
- `GET /api/auth/config` (public) → `{signup_mode, allowed_domains[], import_sources[]}`. No secrets.
- `POST /api/auth/signup` accepts optional `invite_code`. `signup_mode`: `open` (anyone, role engineer) · `domain` (email domain in `allowed_domains`, or a valid invite) · `invite` (valid invite required). Invite rules: single use, not revoked or expired, and when the invite has an email it must match. The new account takes the invite's role; otherwise `engineer`. Policy failures → 403.
- `POST /api/auth/login` → 403 for a deactivated account; records `last_login_at`. Tokens carry `sv` (session version); `current_user` → 401 when the account is deactivated or `sv` no longer matches. Token lifetime = `session_days` from settings.
- `GET /admin/users?q=` → `AdminUser[]` = `user + {active, origin, created_at, last_login_at}` (never the password hash).
- `PUT /admin/users/{id}` `{role?, active?}` → `AdminUser`. Bumps the target's `session_version` (signs them out). 400 on yourself · 400 if it would leave no active owner · 404 unknown id. Audited as `user.role` `{from,to}` / `user.activate` / `user.deactivate`.
- `GET /admin/settings` → `{signup_mode, allowed_domains[], session_days (1-90), import_sources[], updated_at, updated_by}`; `PUT /admin/settings` with any subset. Domains are lower-cased and validated; `domain` mode needs at least one domain (400). Audited as `settings.update` with a `{field: {from,to}}` diff. Disabled `import_sources` make the matching `/api/ingest*` route return 403.
- `GET /admin/invites` → `Invite[]` = `{id, code, email|null, role, created_at, expires_at, created_by, used_at, used_by?, revoked_at, status: pending|used|revoked|expired}`. `POST /admin/invites` `{email?, role, days (1-30)}` → 409 if the email already has an account. `DELETE /admin/invites/{id}` revokes (400 if used). Audited `invite.create` / `invite.revoke`; sign-up with an invite logs `invite.accept`.
- `GET /admin/audit?action=<prefix>&limit=` → newest first, `{id, at, action, target, detail, actor_id, actor_name, actor_email}`. Imports are logged as `import.<folder|archive|github|bitbucket|git>` with project names and counts.
- `GET /admin/summary` → `{users, active, by_role{engineer,maintainer,owner}, pending_invites}`.
- Bootstrap: emails in `BOOTSTRAP_OWNERS` are promoted to owner at startup only while no active owner exists (`user.bootstrap_owner`).
Collections: `settings` (single doc `_id: "app"`), `invites`, `audit`; `users` gains `active`, `session_version`, `last_login_at`.

## Code map (deep code documentation)
Every import also builds a code map (`backend/code_index.py`, tree-sitter C# parser) for the imported codebase. Projects from that import carry `codebase`.
- `GET /api/projects/{slug}/code` → `{codebase, name, stats, generated_at, generated_by, types: CodeTypeSummary[], views: [{path,name,kind}]}` · 404 when the project has no code map yet.
  `stats = {files, view_files, script_files, types, methods, properties, actions, calls_resolved, calls_external, front_end_links, links_unresolved, ajax_calls, parse_errors, layers{}}`.
- `GET /api/projects/{slug}/code/type?id=<full name>` → `CodeType` = `{id, name, kind, namespace, file, files[], line, layer, bases[], base_types[], implemented_by[], attributes[], dependencies[], used_by[], controller?, area?, markup?, members[]}`.
  `layer` ∈ Controller | Razor page | Web Forms page | Service | BAL | DAL | Interface | Model | Validation | Infrastructure | Other.
  Member = `{id, kind, name, signature, line, params?, return_type?, type?, modifiers[], attributes[], is_action?, http?{verbs[],routes[]}, results?[], calls?[], called_by[], ui_callers[]}`.
  `results` (controller actions / Razor Pages): `{kind: view|partial|redirect_action|redirect_page|json|ok|…, view?, targets?[], target_label?, line}`.
  `calls`: `{label, line, targets[], confidence: exact|interface|likely|ambiguous|external, via?, creates?}`; `called_by`: `{id, label, line, confidence, kind: call|new|redirect}`;
  `ui_callers`: `{id (view path), label, line, kind: "ui", ui_kind: actionlink|url_action|form|tag_helper|page_link|href|ajax|fetch|page_method|event|lifecycle|page_handler|child_action|postback, view}`.
- `GET /api/projects/{slug}/code/view?path=` → `CodeView` with `kind` (view, partial, layout, viewstart, razor_page, component, webform, user_control, master_page, web_service, handler, script), `model`, `layout`/`layout_resolved`/`layout_source`, `partials[]`, `components[]`, `controls[]` (Web Forms Register Src), `links[]` (each with resolved `targets[]` or `view_target`), `events[]` (server control events → handler targets), `code_behind_type`, `rendered_by[]`, `used_as_layout_by[]`, `used_as_partial_by[]`.
- `GET /api/projects/{slug}/code/search?q=` → `[{type, member, view?, label, layer}]` (max 100).
- `GET /api/projects/{slug}/code/export.md` → the full deep doc as Markdown (attachment).
- Each import also writes the KB article `<codebase>-code-map` (layers + controller/action/view table).
- Storage: `code_types`, `code_views`, `code_meta` keyed by `codebase`, replaced on every re-import. Only names, signatures, line numbers and relationships are stored: no method bodies.
- Ingest now also reads `.master .asmx .ashx .razor .vbhtml` and your own `.js` (vendor libraries such as jquery*, bootstrap*, *.min.js, lib/ are skipped).
