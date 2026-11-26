"""API contract tests. Shapes follow contracts.md."""
import pytest

import checklists
import contract_export
import coverage
import procedures
import servicegraph
from datacontracts import CONTRACTS
from ingest import analyze_upload, is_candidate
from md_blocks import blocks_to_md, md_to_blocks
from seed_knowledge import CODING_STANDARDS
from snippets import SNIPPETS

H = "headers"


# ---------------------------------------------------------------- public + auth

def test_health_is_public(client):
    r = client.get("/api/")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["database"] == "up"


def test_signup_creates_engineer_and_ignores_role(client):
    r = client.post("/api/auth/signup", json={"email": "Role@Test.local", "password": "Password1!", "role": "owner"})
    assert r.status_code == 200
    user = r.json()["user"]
    assert user["role"] == "engineer"
    assert user["email"] == "role@test.local"
    assert "id" in user and "_id" not in user


def test_signup_duplicate_409(client, member):
    r = client.post("/api/auth/signup", json={"email": "member@test.local", "password": "Password1!"})
    assert r.status_code == 409


def test_signup_rejects_bad_email_and_short_password(client):
    assert client.post("/api/auth/signup", json={"email": "nope", "password": "Password1!"}).status_code == 400
    assert client.post("/api/auth/signup", json={"email": "a@b.co", "password": "short"}).status_code == 422


def test_login_and_me(client, member):
    r = client.post("/api/auth/login", json={"email": "member@test.local", "password": "Password1!"})
    assert r.status_code == 200
    token = r.json()["token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.json()["email"] == "member@test.local"


def test_login_wrong_password_401(client, member):
    assert client.post("/api/auth/login", json={"email": "member@test.local", "password": "wrong-pass"}).status_code == 401


@pytest.mark.parametrize("path", ["/api/auth/me", "/api/overview", "/api/articles", "/api/projects", "/api/search?q=order",
                                  "/api/contracts", "/api/feedback", "/api/coverage/migration", "/api/architecture/service-graph"])
def test_routes_require_auth(client, path):
    assert client.get(path).status_code == 401


def test_bad_token_401(client):
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-token"}).status_code == 401


# ---------------------------------------------------------------- overview + articles

def test_overview_counts(client, member):
    r = client.get("/api/overview", **{H: member[H]}).json()
    assert {s["key"] for s in r["systems"]} == {"legacy", "modern"}
    assert r["counts"]["articles"] >= 15
    assert r["counts"]["rules"] == 18
    assert r["counts"]["validation"] >= 14
    assert r["counts"]["steps"] == 15
    assert r["start_here"]


def test_articles_list_has_no_blocks(client, member):
    arts = client.get("/api/articles", **{H: member[H]}).json()
    assert len(arts) >= 15
    assert all("blocks" not in a and "_id" not in a for a in arts)


def test_articles_system_filter_inclusive(client, member):
    arts = client.get("/api/articles?system=legacy", **{H: member[H]}).json()
    assert {a["system"] for a in arts} <= {"legacy", "both"}


def test_article_detail(client, member):
    a = client.get("/api/articles/atlas-core-layered-architecture", **{H: member[H]}).json()
    assert a["blocks"] and a["source_md"]
    assert {b["type"] for b in a["blocks"]} >= {"p", "figure", "compare", "callout"}
    assert a["prev"] and a["next"] and a["sidebar"]


def test_article_404(client, member):
    assert client.get("/api/articles/nope", **{H: member[H]}).status_code == 404


def test_article_create_needs_maintainer(client, member):
    body = {"title": "Engineer attempt", "section": "onboarding", "system": "both", "source_md": "Hello"}
    assert client.post("/api/articles", json=body, **{H: member[H]}).status_code == 403


def test_article_create_and_update(client, maintainer):
    body = {"title": "Release checklist notes", "section": "deployment", "system": "legacy", "summary": "s", "tags": ["x"], "source_md": "## Heading\n\nSome text\n\n- a\n- b"}
    r = client.post("/api/articles", json=body, **{H: maintainer[H]})
    assert r.status_code == 200, r.text
    a = r.json()
    assert a["slug"] == "release-checklist-notes" and a["doc_id"].startswith("KB-06") and a["origin"] == "TEAM"
    assert client.post("/api/articles", json=body, **{H: maintainer[H]}).status_code == 409
    u = client.put(f"/api/articles/{a['slug']}", json={"source_md": "## New\n\nChanged"}, **{H: maintainer[H]})
    assert u.status_code == 200
    d = client.get(f"/api/articles/{a['slug']}", **{H: maintainer[H]}).json()
    assert d["blocks"][0] == {"type": "h2", "text": "New"}


# ---------------------------------------------------------------- glossary, rules, path, team

def test_glossary_search(client, member):
    r = client.get("/api/glossary?q=viewstate", **{H: member[H]}).json()
    assert any(t["term"] == "ViewState" for t in r)


def test_glossary_create_and_duplicate(client, maintainer):
    body = {"term": "Strangler fig", "system": "both", "definition": "Replace a system piece by piece.", "see_also": []}
    assert client.post("/api/glossary", json=body, **{H: maintainer[H]}).status_code == 200
    assert client.post("/api/glossary", json=body, **{H: maintainer[H]}).status_code == 409


def test_rules_by_category(client, member):
    coding = client.get("/api/rules?category=coding", **{H: member[H]}).json()
    assert [r["rule_id"] for r in coding][:3] == ["CS-001", "CS-002", "CS-003"]
    assert len(coding) == 18
    assert all(r["category"] == "validation" for r in client.get("/api/rules?category=validation", **{H: member[H]}).json())


def test_rule_create_autoid(client, maintainer):
    r = client.post("/api/rules", json={"category": "coding", "system": "modern", "title": "Prefer records for DTOs"}, **{H: maintainer[H]})
    assert r.status_code == 200 and r.json()["rule_id"] == "CS-019"


def test_path_ordered(client, member):
    steps = client.get("/api/path", **{H: member[H]}).json()
    assert [s["step"] for s in steps] == list(range(1, 16))


def test_team(client, member):
    assert len(client.get("/api/team", **{H: member[H]}).json()) == 6


# ---------------------------------------------------------------- progress

def test_progress_toggle_and_isolation(client, member, other_member):
    p = client.post("/api/progress/step", json={"step": 3}, **{H: member[H]}).json()
    assert 3 in p["steps"]
    p = client.post("/api/progress/article", json={"slug": "welcome-to-devatlas"}, **{H: member[H]}).json()
    assert "welcome-to-devatlas" in p["articles"]
    other = client.get("/api/progress", **{H: other_member[H]}).json()
    assert other["steps"] == [] and other["articles"] == []
    p = client.post("/api/progress/step", json={"step": 3}, **{H: member[H]}).json()
    assert 3 not in p["steps"]


def test_progress_unknown_step(client, member):
    assert client.post("/api/progress/step", json={"step": 99}, **{H: member[H]}).status_code == 400


# ---------------------------------------------------------------- validation

def test_validation_filters(client, member):
    allr = client.get("/api/validation", **{H: member[H]}).json()
    assert len(allr) >= 14
    legacy = client.get("/api/validation?system=legacy", **{H: member[H]}).json()
    assert {r["system"] for r in legacy} <= {"legacy", "both"}
    policy = client.get("/api/validation?tier=policy", **{H: member[H]}).json()
    assert len(policy) == 4
    assert client.get("/api/validation?q=postcode", **{H: member[H]}).json()[0]["rule_id"] == "VR-003"


def test_validation_detail_and_404(client, member):
    assert client.get("/api/validation/VR-014", **{H: member[H]}).json()["tier"] == "invariant"
    assert client.get("/api/validation/VR-999", **{H: member[H]}).status_code == 404


def test_validation_create(client, maintainer, member):
    assert client.post("/api/validation", json={"field": "x"}, **{H: maintainer[H]}).status_code == 400
    body = {"name": "SKU format", "field": "OrderLine.Sku", "tier": "bogus", "severity": "bogus", "system": "bogus"}
    assert client.post("/api/validation", json=body, **{H: member[H]}).status_code == 403
    r = client.post("/api/validation", json=body, **{H: maintainer[H]}).json()
    assert r["rule_id"] == "VR-015" and r["tier"] == "shape" and r["severity"] == "error" and r["system"] == "both" and r["origin"] == "TEAM"
    assert client.post("/api/validation", json=body, **{H: maintainer[H]}).status_code == 409


# ---------------------------------------------------------------- snippets, translations, deployments

def test_one_snippet_per_standard():
    assert sorted(s["rule"] for s in SNIPPETS) == sorted(r[0] for r in CODING_STANDARDS)


def test_snippets_api(client, member):
    assert len(client.get("/api/snippets", **{H: member[H]}).json()) == 18
    cats = client.get("/api/snippets/categories", **{H: member[H]}).json()
    assert sum(c["count"] for c in cats) == 18
    assert client.get("/api/snippets/SN-01", **{H: member[H]}).json()["rule"] == "CS-001"
    assert client.get("/api/snippets/SN-99", **{H: member[H]}).status_code == 404
    leg = client.get("/api/snippets?system=legacy", **{H: member[H]}).json()
    assert {s["system"] for s in leg} <= {"legacy", "both"}


def test_translations_api(client, member):
    assert len(client.get("/api/translations", **{H: member[H]}).json()) == 12
    assert client.get("/api/translations?q=wcf", **{H: member[H]}).json()
    assert client.get("/api/translations/TR-03", **{H: member[H]}).json()["category"] == "http"
    assert client.get("/api/translations/categories", **{H: member[H]}).json()


def test_deployments_api(client, member):
    r = client.get("/api/deployments", **{H: member[H]}).json()
    assert [s["key"] for s in r["stages"]] == ["build", "artifacts", "gate", "database", "deploy", "verify", "rollback"]
    assert [f["system"] for f in r["flows"]] == ["legacy", "modern"]
    assert all("label" in st for f in r["flows"] for st in f["stages"])
    assert client.get("/api/deployments/nope", **{H: member[H]}).status_code == 404


# ---------------------------------------------------------------- projects + checklists + procedures

def test_projects_list(client, member):
    ps = client.get("/api/projects", **{H: member[H]}).json()
    assert {p["slug"] for p in ps} >= {"atlas-core", "billing-integration", "orderplatform-api", "orderplatform-worker", "identity-gateway"}
    assert all("doc_count" in p and "checklist" in p for p in ps)


def test_project_detail_docs(client, member):
    p = client.get("/api/projects/atlas-core", **{H: member[H]}).json()
    assert p["system"] == "legacy"
    assert any(d["slug"] == "atlas-core-layered-architecture" for d in p["docs"])
    assert all(d.get("project") in (None, "Atlas.Core") and d["system"] in ("legacy", "both") for d in p["docs"])


def test_project_create(client, maintainer, member):
    body = {"name": "Reporting.Service", "system": "modern", "description": "Read models"}
    assert client.post("/api/projects", json=body, **{H: member[H]}).status_code == 403
    r = client.post("/api/projects", json=body, **{H: maintainer[H]})
    assert r.status_code == 200 and r.json()["framework"] == ".NET 8" and r.json()["slug"] == "reporting-service"
    assert client.post("/api/projects", json=body, **{H: maintainer[H]}).status_code == 409


def test_checklist_shape(client, member):
    c = client.get("/api/projects/atlas-core/checklist", **{H: member[H]}).json()
    assert [p["key"] for p in c["phases"]] == ["architecture", "standards", "environment"]
    assert sum(len(p["steps"]) for p in c["phases"]) == 9
    env = c["phases"][2]["steps"]
    assert "msbuild" in env[1]["command"]
    modern = client.get("/api/projects/orderplatform-api/checklist", **{H: member[H]}).json()
    assert modern["phases"][2]["steps"][1]["command"] == "dotnet build"


def test_checklist_tick_isolated(client, member, other_member):
    r = client.post("/api/projects/atlas-core/checklist/step", json={"step": "env-build"}, **{H: member[H]}).json()
    assert r["done"] is True and r["progress"]["completed"] == 1
    r = client.post("/api/projects/atlas-core/checklist/step", json={"step": "env-build", "done": True}, **{H: member[H]}).json()
    assert r["progress"]["completed"] == 1
    other = client.get("/api/projects/atlas-core/checklist", **{H: other_member[H]}).json()
    assert other["progress"]["completed"] == 0
    assert client.post("/api/projects/atlas-core/checklist/step", json={"step": "nope"}, **{H: member[H]}).status_code == 400
    assert client.post("/api/projects/nope/checklist/step", json={"step": "env-build"}, **{H: member[H]}).status_code == 404


def test_checklist_module_counts():
    assert len(checklists.step_keys()) == 9


def test_procedures(client, member):
    r = client.get("/api/projects/atlas-core/procedures", **{H: member[H]}).json()
    assert r["procedures"][0]["criticality"] == "critical"
    assert r["summary"]["total"] == len(r["procedures"])
    m = client.get("/api/projects/orderplatform-api/procedures", **{H: member[H]}).json()
    assert m["procedures"] == [] and m["note"]


def test_procedure_coverage_counts_partial_as_half():
    s = procedures.summary([{"status": "rewritten", "criticality": "high"}, {"status": "partial", "criticality": "high"}])
    assert s["coverage_percent"] == 75


# ---------------------------------------------------------------- contracts

def test_contracts_list_and_filters(client, member):
    allc = client.get("/api/contracts", **{H: member[H]}).json()
    assert [c["code"] for c in allc] == [f"DC-0{i}" for i in range(1, 9)]
    assert all(c["kind"] == "event" for c in client.get("/api/contracts?kind=event", **{H: member[H]}).json())
    assert client.get("/api/contracts?q=DeliveryWindow", **{H: member[H]}).json()[0]["code"] == "DC-01"


def test_contracts_meta(client, member):
    m = client.get("/api/contracts/meta", **{H: member[H]}).json()
    assert m["total"] == 8 and len(m["policy"]) == 5


def test_contract_detail_404(client, member):
    assert client.get("/api/contracts/DC-02", **{H: member[H]}).json()["name"] == "dbo.Customers"
    assert client.get("/api/contracts/DC-99", **{H: member[H]}).status_code == 404


def test_contract_graph(client, member):
    g = client.get("/api/contracts/graph", **{H: member[H]}).json()
    assert {i["kind"] for i in g["interfaces"]} <= {"table", "view", "soap"}
    risks = [i["risk"] for i in g["interfaces"]]
    assert risks == sorted(risks, key=["high", "medium", "low"].index)
    assert g["summary"]["edges"] == len(g["edges"])
    dc05 = next(i for i in g["interfaces"] if i["code"] == "DC-05")
    assert dc05["risk"] == "high"
    assert any(c["system"] == "unknown" for c in dc05["consumers"])


def test_contract_exports(client, member):
    j = client.get("/api/contracts/DC-01/schema.json", **{H: member[H]})
    assert j.headers["content-type"].startswith("application/schema+json")
    assert "attachment" in j.headers["content-disposition"]
    schema = j.json()
    assert schema["properties"]["Total"]["type"] == "number"
    assert schema["additionalProperties"] is False
    s = client.get("/api/contracts/DC-01/schema.sql", **{H: member[H]})
    assert s.status_code == 200 and "CREATE TABLE dbo.Orders" in s.text and "PRIMARY KEY" in s.text
    assert client.get("/api/contracts/DC-06/schema.sql", **{H: member[H]}).status_code == 400


def test_contract_export_types():
    c = next(c for c in CONTRACTS if c["code"] == "DC-02")
    props = contract_export.to_json_schema(c)["properties"]
    assert props["Name"] == {"type": "string", "maxLength": 160, "description": "VR-006", "x-sourceType": "nvarchar(160)"}
    assert contract_export.to_json_schema(next(c for c in CONTRACTS if c["code"] == "DC-06"))["additionalProperties"] is True


# ---------------------------------------------------------------- search

def test_search_ranked(client, member):
    r = client.get("/api/search?q=Atlas.Core", **{H: member[H]}).json()
    assert r["count"] > 0 and r["results"][0]["type"] == "project"
    assert r["facets"]
    scores = [x["score"] for x in r["results"]]
    assert scores == sorted(scores, reverse=True)


def test_search_empty_and_regex_safe(client, member):
    assert client.get("/api/search?q=", **{H: member[H]}).json()["count"] == 0
    assert client.get("/api/search?q=(.*", **{H: member[H]}).status_code == 200


# ---------------------------------------------------------------- feedback

def test_feedback_flow(client, member, other_member, maintainer):
    bad = client.post("/api/feedback", json={"kind": "x", "target_type": "standard", "target_ref": "CS-001", "message": "long enough"}, **{H: member[H]})
    assert bad.status_code == 400
    short = client.post("/api/feedback", json={"kind": "outdated", "target_type": "standard", "target_ref": "CS-001", "message": "short"}, **{H: member[H]})
    assert short.status_code == 400
    item = client.post("/api/feedback", json={"kind": "outdated", "target_type": "standard", "target_ref": "CS-001", "target_label": "Async", "message": "This example is outdated now."}, **{H: member[H]}).json()
    assert item["vote_count"] == 1 and item["voted"] is True and item["status"] == "open"
    v = client.post(f"/api/feedback/{item['id']}/vote", **{H: other_member[H]}).json()
    assert v["vote_count"] == 2 and v["voted"] is True
    assert client.get("/api/feedback", **{H: member[H]}).json()[0]["voted"] is True
    assert client.post(f"/api/feedback/{item['id']}/status", json={"status": "accepted"}, **{H: member[H]}).status_code == 403
    assert client.post(f"/api/feedback/{item['id']}/status", json={"status": "bogus"}, **{H: maintainer[H]}).status_code == 400
    t = client.post(f"/api/feedback/{item['id']}/status", json={"status": "triaged", "note": "Looking"}, **{H: maintainer[H]}).json()
    assert t["status"] == "triaged" and t["status_note"] == "Looking"
    assert client.post("/api/feedback/nope/vote", **{H: member[H]}).status_code == 404


def test_feedback_meta_and_targets(client, member):
    m = client.get("/api/feedback/meta", **{H: member[H]}).json()
    assert {s["key"] for s in m["statuses"]} == {"open", "triaged", "accepted", "declined"}
    t = client.get("/api/feedback/targets", **{H: member[H]}).json()
    assert t["standards"][0]["ref"] == "CS-001" and t["architecture"]


# ---------------------------------------------------------------- insight

def test_coverage(client, member):
    c = client.get("/api/coverage/migration", **{H: member[H]}).json()
    o = c["overall"]
    assert o["percent"] == round(o["weighted"] / o["total"] * 100)
    assert {a["key"] for a in c["by_area"]} == {"procedures", "interfaces"}
    assert all(i["status"] != "rewritten" for i in c["remaining"])


def test_coverage_module_has_no_invented_items():
    c = coverage.build([])
    assert len(c["items"]) == len(procedures.PROCEDURES) + len(coverage.INTERFACE_STATUS)


def test_service_graph(client, member):
    g = client.get("/api/architecture/service-graph", **{H: member[H]}).json()
    pairs = [(e["from"], e["to"], e["channel"]) for e in g["edges"]]
    assert len(pairs) == len(set(pairs))
    codes = {c["code"] for c in CONTRACTS}
    assert all(c["code"] in codes for c in g["summary"]["contracts"])
    assert any(e["external"] for e in g["edges"])


def test_service_graph_module_libraries_are_not_services():
    g = servicegraph.build()
    assert not {lib["name"] for lib in g["libraries"]} & {s["name"] for s in g["services"]}


# ---------------------------------------------------------------- ingest

LEGACY_CSPROJ = '<Project><PropertyGroup><TargetFrameworkVersion>v4.8</TargetFrameworkVersion></PropertyGroup><ItemGroup><Reference Include="System.Web.Mvc" /></ItemGroup></Project>'
MODERN_CSPROJ = '<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup><ItemGroup><PackageReference Include="MediatR" Version="12.0.0" /></ItemGroup></Project>'
FILES = [
    {"path": "Shop/Shop.sln", "content": "Microsoft Visual Studio Solution File"},
    {"path": "Shop/Legacy.Web/Legacy.Web.csproj", "content": LEGACY_CSPROJ},
    {"path": "Shop/Legacy.Web/OrderController.cs", "content": "using System.Web.Mvc;\nvar x = client.GetAsync(u).Result;\nvar s = HttpContext.Current.Session;\nvar sql = \"SELECT * FROM Orders WHERE Id = \" + id;"},
    {"path": "Shop/Modern.Api/Modern.Api.csproj", "content": MODERN_CSPROJ},
    {"path": "Shop/Modern.Api/Program.cs", "content": "var b = WebApplication.CreateBuilder(args);\napp.MapGet(\"/\", () => 1);"},
    {"path": "Shop/Modern.Api/bin/Debug/x.cs", "content": "ignored"},
]


def test_is_candidate():
    assert is_candidate("a/b/File.cs")
    assert not is_candidate("a/bin/File.cs")
    assert not is_candidate("a/b/image.png")


def test_analyze_upload():
    r = analyze_upload(FILES)
    assert r["stats"]["projects"] == 2 and r["stats"]["solutions"] == ["Shop.sln"]
    fw = {p["name"]: (p["framework"], p["system"]) for p in r["projects"]}
    assert fw["Legacy.Web"] == (".NET Framework 4.8", "legacy")
    assert fw["Modern.Api"] == (".NET 8", "modern")
    risks = {f["key"] for f in r["findings"] if f["risk"]}
    assert {"httpcontext", "blocking", "sqlconcat"} <= risks
    assert len(r["articles"]) == 5


def test_ingest_api(client, maintainer, member, db):
    assert client.post("/api/ingest", json={"files": FILES}, **{H: member[H]}).status_code == 403
    assert client.post("/api/ingest", json={"files": []}, **{H: maintainer[H]}).status_code == 400
    assert client.post("/api/ingest", json={"files": [{"path": "a.md", "content": "x"}]}, **{H: maintainer[H]}).status_code == 422
    r = client.post("/api/ingest", json={"files": FILES}, **{H: maintainer[H]})
    assert r.status_code == 200, r.text
    assert all(p["created"] for p in r.json()["projects"])
    again = client.post("/api/ingest", json={"files": FILES}, **{H: maintainer[H]}).json()
    assert not any(a["created"] for a in again["articles"])
    assert db.articles.count_documents({"origin": "IMPORTED"}) == 5
    p = client.get("/api/projects/legacy-web", **{H: member[H]}).json()
    assert any(d["slug"] == "legacy-web-architecture" for d in p["docs"])


def test_github_repo_validation(client, maintainer):
    assert client.post("/api/ingest/github", json={"repo": "https://gitlab.com/a/b"}, **{H: maintainer[H]}).status_code == 400
    assert client.post("/api/ingest/github", json={"repo": "https://github.com/a/b/blob/main/x.cs"}, **{H: maintainer[H]}).status_code == 400
    assert client.post("/api/ingest/github", json={"repo": "justone"}, **{H: maintainer[H]}).status_code == 400


# ---------------------------------------------------------------- markdown

def test_markdown_round_trip():
    md = "Intro text\n\n## Head\n\n- a\n- b\n\n1. one\n2. two\n\n```csharp File.cs\nvar x = 1;\n```\n\n> [warn] Careful\n> Body\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n:::figure Flow\nA | B | C\n:::\n\n:::compare Title\nA note\n```csharp L.cs\nold\n```\n```csharp M.cs\nnew\n```\n:::"
    blocks = md_to_blocks(md)
    assert [b["type"] for b in blocks] == ["p", "h2", "ul", "ol", "code", "callout", "table", "figure", "compare"]
    assert md_to_blocks(blocks_to_md(blocks)) == blocks
