"""Deployment runbooks: legacy IIS vs modern containers (origin = "SEED"). Read-only."""

STAGES = [
    {"key": "build", "label": "Build"},
    {"key": "artifacts", "label": "Artifacts"},
    {"key": "gate", "label": "Release gate"},
    {"key": "database", "label": "Database"},
    {"key": "deploy", "label": "Deploy"},
    {"key": "verify", "label": "Verify"},
    {"key": "rollback", "label": "Rollback"},
]
STAGE_LABELS = {s["key"]: s["label"] for s in STAGES}

FLOWS = [
    {
        "slug": "legacy-iis",
        "name": "Legacy IIS release",
        "system": "legacy",
        "stack": "MSBuild, Web Deploy, IIS 10, two load-balanced servers",
        "cadence": "Weekly, Tuesday 19:00",
        "duration": "About 90 minutes",
        "rollback_window": "Until Wednesday 09:00",
        "downtime": "None if both servers drain; 5 minutes for schema changes",
        "summary": "A manual, release-manager-run deployment of Atlas.Core and Billing.Integration to two IIS servers behind the load balancer.",
        "stages": [
            {"key": "build", "steps": [{"title": "Build the release branch", "detail": "Build in Release on the build agent.", "command": "msbuild Atlas.Core.sln /p:Configuration=Release /p:DeployOnBuild=true /p:PublishProfile=Package", "lang": "powershell"}]},
            {"key": "artifacts", "steps": [{"title": "Store the Web Deploy package", "detail": "Copy the zip and the SetParameters.xml to the release share, named with the build number.", "checkpoint": "Package and parameters file both present"}]},
            {"key": "gate", "steps": [{"title": "Change advisory sign-off", "detail": "Release manager confirms the change ticket is approved and the billing batch is not running."}]},
            {"key": "database", "steps": [{"title": "Run reviewed SQL scripts", "detail": "Lena runs the scripts in order against production.", "warn": "Any change to a shared table must be registered in the contract registry first."}]},
            {"key": "deploy", "steps": [
                {"title": "Drain server 1", "detail": "Take WEB01 out of the load balancer and wait for connections to drop."},
                {"title": "Deploy to server 1", "detail": "Apply the package with production parameters.", "command": "msdeploy -verb:sync -source:package=Atlas.Web.zip -dest:auto,computerName=WEB01 -setParamFile:SetParameters.Prod.xml", "lang": "powershell"},
                {"title": "Repeat for server 2", "detail": "Return WEB01 to the pool, then drain and deploy WEB02."},
            ]},
            {"key": "verify", "steps": [{"title": "Smoke test", "detail": "Log in, open an order, run the health page on each server.", "checkpoint": "/health.aspx returns OK on both servers"}]},
            {"key": "rollback", "steps": [{"title": "Redeploy the previous package", "detail": "Deploy last week's package from the release share. SQL changes are rolled back with their paired down scripts.", "warn": "Down scripts must be written before the release, not during an incident."}]},
        ],
    },
    {
        "slug": "modern-containers",
        "name": "Modern container rollout",
        "system": "modern",
        "stack": "GitHub Actions, container registry, Kubernetes, environment repo",
        "cadence": "On every merge to main (staging); production by PR, several times a week",
        "duration": "About 15 minutes",
        "rollback_window": "Any time; previous images are kept for 30 days",
        "downtime": "None (rolling update)",
        "summary": "Automated build and rolling deployment of the Order Platform and Identity.Gateway, promoted by changing an image tag in the environment repository.",
        "stages": [
            {"key": "build", "steps": [{"title": "Build and test", "detail": "CI restores, builds and runs unit and integration tests.", "command": "dotnet test --configuration Release", "lang": "bash"}]},
            {"key": "artifacts", "steps": [{"title": "Push the image", "detail": "Image is tagged with the commit sha and pushed to the registry.", "command": "docker build -t registry.internal/orderplatform-api:$SHA . && docker push registry.internal/orderplatform-api:$SHA", "lang": "bash"}]},
            {"key": "gate", "steps": [{"title": "Promotion PR", "detail": "Open a PR in the environment repo changing the tag. One approval from a code owner.", "checkpoint": "Staging has run the same sha for at least one hour"}]},
            {"key": "database", "steps": [{"title": "Apply EF Core migrations", "detail": "A migration job runs before the rollout, for modern-owned tables only.", "command": "dotnet ef database update --connection \"$ORDERS_CS\"", "lang": "bash", "warn": "Shared legacy tables are excluded from migrations; their changes go through the IIS release."}]},
            {"key": "deploy", "steps": [{"title": "Rolling update", "detail": "Argo syncs the new tag; pods are replaced two at a time.", "command": "kubectl rollout status deployment/orderplatform-api --timeout=5m", "lang": "bash"}]},
            {"key": "verify", "steps": [{"title": "Watch the dashboards", "detail": "Error rate, p95 latency and bridge lag for 15 minutes.", "checkpoint": "Error rate below 1% and bridge_lag_seconds under 60"}]},
            {"key": "rollback", "steps": [{"title": "Undo the rollout", "detail": "Revert the promotion PR, or undo directly in an emergency.", "command": "kubectl rollout undo deployment/orderplatform-api", "lang": "bash"}]},
        ],
    },
]


def enrich_flow(flow: dict) -> dict:
    """Attach the canonical stage label to each stage at read time."""
    flow = dict(flow)
    flow["stages"] = [{"key": s["key"], "label": STAGE_LABELS.get(s["key"], s["key"]), "steps": s.get("steps", [])} for s in flow.get("stages", [])]
    return flow
