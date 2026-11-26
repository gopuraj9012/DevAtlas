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

   Then edit `backend/.env`: set `JWT_SECRET` to a long random string, and set `DEMO_EMAIL` / `DEMO_PASSWORD` if you want a local maintainer account seeded.

3. Run the API on port 8000 (seeds the database on first start):

   ```powershell
   cd backend; .\.venv\Scripts\python -m uvicorn server:app --host 127.0.0.1 --port 8000 --reload
   ```

4. Run the frontend on port 5173 (proxies `/api` to the backend):

   ```powershell
   cd frontend; npm install; npm run dev
   ```

5. Open http://localhost:5173. Sign in with the demo maintainer from your `.env`, or create an account (new accounts are `engineer`, read-only plus feedback). Promote someone with:

   ```powershell
   docker exec devatlas-mongo mongosh devatlas --quiet --eval "db.users.updateOne({email:'someone@company.com'},{`$set:{role:'maintainer'}})"
   ```

## Tests and checks

```powershell
cd backend; .\.venv\Scripts\python -m pytest -q tests/test_api.py
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
