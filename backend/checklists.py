"""Per-project guided onboarding checklist, generated from the project record and its docs."""

PHASES = [
    ("architecture", "Understand the architecture", "architecture"),
    ("standards", "Learn the standards", "standards"),
    ("environment", "Set up your environment", "onboarding"),
]


def _docs(docs: list[dict], section: str) -> list[dict]:
    return [{"slug": d["slug"], "title": d["title"]} for d in docs if d.get("section") == section][:3]


def _steps(project: dict, docs: list[dict]) -> dict[str, list[dict]]:
    name = project["name"]
    legacy = project.get("system") == "legacy"
    slug = project["slug"]
    sln = f"{name}.sln"
    arch_docs = _docs(docs, "architecture")
    std_docs = _docs(docs, "standards")
    setup_docs = _docs(docs, "onboarding")
    return {
        "architecture": [
            {"key": "arch-overview", "title": f"Read the {name} architecture", "detail": "Learn the layers and where each kind of code lives.", "est": "20 min",
             "verify": "You can name the layers and the entry point.", "command": None, "links": [{"label": "Project overview", "to": f"/projects/{slug}"}], "docs": arch_docs},
            {"key": "arch-data", "title": "Find what it reads and writes" if legacy else "Trace one request end to end",
             "detail": "List the shared tables and stored procedures this project touches." if legacy else "Follow one endpoint through MediatR to the database and the outbox.",
             "est": "30 min", "verify": "You can point to the data contract for each shared table." if legacy else "You can name the handler, validator and event for one endpoint.",
             "command": None, "links": [{"label": "Data contracts", "to": "/contracts"}] + ([{"label": "Stored procedures", "to": f"/projects/{slug}?tab=procedures"}] if legacy else [{"label": "Service map", "to": "/service-map"}]), "docs": _docs(docs, "data") or arch_docs},
            {"key": "arch-seam", "title": "Understand the seam", "detail": "See where this project meets the other system and which contracts sit on the boundary.", "est": "15 min",
             "verify": "You know which consumers break if you change a shared shape.", "command": None, "links": [{"label": "Impact graph", "to": "/contracts?view=graph"}], "docs": _docs(docs, "integration")},
        ],
        "standards": [
            {"key": "std-rules", "title": "Read the coding standards", "detail": "The eighteen rules, and which ones the build enforces here.", "est": "15 min",
             "verify": "You can explain CS-001, CS-002 and CS-003.", "command": None, "links": [{"label": "Standards", "to": "/standards"}], "docs": std_docs},
            {"key": "std-snippets", "title": "Work through the bad-vs-standard trainer", "detail": "Reveal each standard after spotting what is wrong.", "est": "25 min",
             "verify": "You revealed every snippet for your system.", "command": None, "links": [{"label": "Snippets", "to": f"/snippets?system={project.get('system')}"}], "docs": []},
            {"key": "std-validation", "title": "Find the validation rules for this project", "detail": "Search the validation repository filtered to this project.", "est": "10 min",
             "verify": "You know where shape, policy and invariant rules live here.", "command": None, "links": [{"label": "Validation rules", "to": f"/validation?project={name}"}], "docs": []},
        ],
        "environment": [
            {"key": "env-restore", "title": "Restore dependencies", "detail": "Restore packages for the solution.", "est": "10 min", "verify": "Restore finishes with no errors.",
             "command": f"nuget restore {sln}" if legacy else "dotnet restore", "links": [], "docs": setup_docs},
            {"key": "env-build", "title": "Build the solution", "detail": "Build in Debug.", "est": "10 min", "verify": "Build succeeds with zero errors.",
             "command": f"msbuild {sln} /p:Configuration=Debug" if legacy else "dotnet build", "links": [], "docs": setup_docs},
            {"key": "env-run", "title": "Run it locally", "detail": "Start the app against your local SQL Server." if legacy else "Set your connection string in user-secrets and run.",
             "est": "15 min", "verify": "The home page or health endpoint responds.",
             "command": f"iisexpress /site:{name}" if legacy else 'dotnet user-secrets set "ConnectionStrings:Orders" "<your local connection>"\ndotnet run',
             "links": [{"label": "Team: who to ask", "to": "/team"}], "docs": setup_docs},
        ],
    }


def step_keys() -> set[str]:
    sample = _steps({"name": "x", "slug": "x", "system": "modern"}, [])
    return {s["key"] for steps in sample.values() for s in steps}


def build_checklist(project: dict, docs: list[dict], done: list[str]) -> dict:
    steps = _steps(project, docs)
    done_set = set(done)
    phases = []
    for key, title, _ in PHASES:
        rows = [{**s, "done": s["key"] in done_set} for s in steps[key]]
        phases.append({"key": key, "title": title, "steps": rows, "completed": sum(r["done"] for r in rows), "total": len(rows)})
    return {
        "project": {k: project.get(k) for k in ("slug", "name", "system", "framework", "repo", "stack")},
        "phases": phases,
        "progress": progress(done),
    }


def progress(done: list[str]) -> dict:
    keys = step_keys()
    valid = [d for d in done if d in keys]
    total = len(keys)
    return {"done": valid, "completed": len(valid), "total": total, "percent": round(len(valid) / total * 100) if total else 0}
