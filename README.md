# DevAtlas

Internal knowledge base for a team that runs a legacy .NET Framework 4.8 codebase and a modern .NET 8 codebase, so a new hire can onboard without asking colleagues.

- **Backend:** FastAPI (Python) + Motor, in `backend/`. Every route is under `/api`.
- **Database:** MongoDB 7 in Docker (`docker-compose.yml`).
- **Frontend:** React 19 + TypeScript + Vite + Tailwind, in `frontend/`.

Specs: [`DEVELOPMENT.md`](DEVELOPMENT.md) (developer guide), [`contracts.md`](contracts.md) (API shapes, source of truth), [`context.md`](context.md) (build log), [`design_guidelines.md`](design_guidelines.md) (look and feel).

## Run it locally (Windows, PowerShell)

Prerequisites: Docker Desktop, Python 3.11+, Node 20+.

1. Start MongoDB (data persists in the `devatlas_mongo_data` volume):

   ```powershell
   docker compose up -d
   ```

2. Backend, first time only:

   ```powershell
   cd backend; python -m venv .venv; .\.venv\Scripts\python -m pip install -r requirements.txt; Copy-Item .env.example .env
   ```

   Then edit `backend/.env` and set `JWT_SECRET` to a long random string. The demo logins below are already filled in.

3. Run the API on port 8000 (seeds the database on first start):

   ```powershell
   cd backend; .\.venv\Scripts\python -m uvicorn server:app --host 127.0.0.1 --port 8000 --reload
   ```

4. Run the frontend on port 5173 (proxies `/api` to the backend):

   ```powershell
   cd frontend; npm install; npm run dev
   ```

5. Open http://localhost:5173 and sign in with one of the demo logins below.

## Roles and demo logins

DevAtlas has three roles. Everyone who signs up gets **engineer**; nobody can choose their own role.

| Role | Who it is for | What they can do |
|---|---|---|
| `engineer` | Everyone, including new hires | Read everything, search, tick their own learning path and project checklists, mark docs read, flag or suggest changes on Feedback, and vote |
| `maintainer` | Leads who own the content | Everything an engineer can do, plus: write and edit docs, add glossary terms, coding standards and validation rules, create projects, import codebases (folder, zip, GitHub, Bitbucket, Git URL), and triage feedback |
| `owner` | Admins (engineering managers) | Everything a maintainer can do, plus the **Admin** screen: change anyone's role, deactivate or reactivate users, create invite links, choose who can sign up, set how long sessions last, turn import sources on or off, and read the audit log |

The server enforces these rules: a maintainer-only call from an engineer gets a 403, even if the button is visible.

**Demo logins** (local development only):

| Role | Email | Password |
|---|---|---|
| maintainer (owner if listed in `BOOTSTRAP_OWNERS`) | `greta@gmail.com` | `Greta@1234` |
| engineer | `priya@devatlas.local` | `Priya@1234` |

They come from `DEMO_EMAIL` / `DEMO_PASSWORD` and `DEMO_ENGINEER_EMAIL` / `DEMO_ENGINEER_PASSWORD` in `backend/.env`. They are created the first time the API starts with those values set.

**The first owner (admin).** Put one or more emails in `BOOTSTRAP_OWNERS` in `backend/.env` and restart the API. While DevAtlas has no active owner, those accounts are promoted to owner at startup. To try the Admin screen with the demo login, set `BOOTSTRAP_OWNERS=greta@gmail.com`. After that, manage roles from **Admin** in the sidebar.

> **These passwords are public.** Before running DevAtlas anywhere other people can reach, blank those four variables in `backend/.env` and drop the demo users (command below).

Owners change roles on **Admin → Users**. Changing someone's role or deactivating them signs them out immediately. Owners can't change their own role, so there is always at least one owner.

To remove the demo users:

```powershell
docker exec devatlas-mongo mongosh devatlas --quiet --eval "db.users.deleteMany({origin:'SEED'})"
```

## Importing a codebase

Maintainers can open **Import codebase** and pick a folder, upload a `.zip`, or read from GitHub, Bitbucket Cloud or any https Git URL (GitLab, Azure DevOps, Bitbucket Server). Public repositories need nothing; for private ones set the matching token in `backend/.env` (see `.env.example`) and restart the API. The Git options need `git` installed on the machine running the API.

## Tests and checks

```powershell
cd backend; .\.venv\Scripts\python -m pytest -q tests
```

```powershell
cd frontend; npm run typecheck
```

Backend tests use a throwaway `<DB_NAME>_test` database on the same MongoDB.

## Reset the seeded content

Seeding only fills empty collections. To start over, drop the database and restart the API:

```powershell
docker exec devatlas-mongo mongosh devatlas --quiet --eval "db.dropDatabase()"
```
