"""Zip, Bitbucket and Git URL import paths."""
import io
import zipfile

import pytest

import repo_sources
from repo_sources import SourceError, parse_bitbucket, parse_git_url, read_tree, read_zip

from test_api import FILES

H = "headers"


def make_zip(files, root="Shop-main/"):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            zf.writestr(root + f["path"], f["content"])
        zf.writestr(root + "Shop/obj/x.cs", "ignored")
        zf.writestr("../evil.cs", "zip slip")
    return buf.getvalue()


# ---------------------------------------------------------------- pure

def test_read_zip_strips_root_and_skips_junk():
    files, source = read_zip(make_zip(FILES, root=""), "shop.zip")
    paths = {f["path"] for f in files}
    assert "Shop/Legacy.Web/Legacy.Web.csproj" in paths
    assert not any("obj/" in p or "evil" in p for p in paths)
    assert source["kind"] == "archive" and source["files_read"] == len(files)


def test_read_zip_common_root_removed():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("Repo-main/App/App.csproj", "<Project />")
        zf.writestr("Repo-main/App/Program.cs", "class P {}")
    files, _ = read_zip(buf.getvalue())
    assert {f["path"] for f in files} == {"App/App.csproj", "App/Program.cs"}


@pytest.mark.parametrize("data,status", [(b"", 400), (b"not a zip", 400)])
def test_read_zip_rejects_bad_input(data, status):
    with pytest.raises(SourceError) as e:
        read_zip(data)
    assert e.value.status == status


def test_read_zip_size_cap(monkeypatch):
    monkeypatch.setattr(repo_sources, "MAX_ARCHIVE_BYTES", 10)
    with pytest.raises(SourceError) as e:
        read_zip(b"x" * 11)
    assert e.value.status == 413


@pytest.mark.parametrize("url,status", [
    ("", 400), ("git@github.com:a/b.git", 400), ("http://git.local/a.git", 400),
    ("file:///c:/repo", 400), ("https://user:pw@gitlab.com/a/b.git", 400),
])
def test_parse_git_url_rejects(url, status):
    with pytest.raises(SourceError) as e:
        parse_git_url(url)
    assert e.value.status == status


def test_parse_git_url_ok_and_allowlist(monkeypatch):
    assert parse_git_url("https://gitlab.com/team/app.git/") == ("https://gitlab.com/team/app.git", "gitlab.com")
    monkeypatch.setenv("GIT_ALLOWED_HOSTS", "dev.azure.com")
    with pytest.raises(SourceError) as e:
        parse_git_url("https://gitlab.com/team/app.git")
    assert e.value.status == 403


def test_parse_bitbucket_forms():
    assert parse_bitbucket("acme/orders", None, None)[:4] == ("https://bitbucket.org/acme/orders.git", "acme", "orders", None)
    url, ws, name, ref, folder = parse_bitbucket("https://bitbucket.org/acme/orders/src/develop/src/Api", None, None)
    assert (ws, name, ref, folder) == ("acme", "orders", "develop", "src/Api")
    with pytest.raises(SourceError):
        parse_bitbucket("https://gitlab.com/acme/orders", None, None)
    with pytest.raises(SourceError):
        parse_bitbucket("justone", None, None)


def test_read_tree_folder_and_escape(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "A.csproj").write_text("<Project />")
    (tmp_path / "src" / "bin").mkdir()
    (tmp_path / "src" / "bin" / "x.cs").write_text("skip")
    (tmp_path / ".git").mkdir()
    (tmp_path / ".git" / "config.json").write_text("{}")
    files, skipped, _ = read_tree(tmp_path)
    assert [f["path"] for f in files] == ["src/A.csproj"]
    assert read_tree(tmp_path, "src")[0][0]["path"] == "src/A.csproj"
    with pytest.raises(SourceError):
        read_tree(tmp_path, "missing")
    with pytest.raises(SourceError):
        read_tree(tmp_path, "../")


def test_framework_from_directory_build_props():
    from ingest import analyze_upload
    files = [
        {"path": "Directory.Build.props", "content": "<Project><PropertyGroup><TargetFramework>net9.0</TargetFramework></PropertyGroup></Project>"},
        {"path": "src/Api/Api.csproj", "content": '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>'},
        {"path": "src/Lib/Lib.csproj", "content": '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>$(Tfm)</TargetFramework></PropertyGroup></Project>'},
    ]
    fw = {p["name"]: (p["framework"], p["system"]) for p in analyze_upload(files)["projects"]}
    assert fw == {"Api": (".NET 9", "modern"), "Lib": (".NET 9", "modern")}


# ---------------------------------------------------------------- api

def test_archive_api(client, maintainer, member):
    data = make_zip(FILES)
    up = lambda h, name="shop.zip", body=data: client.post("/api/ingest/archive", files={"file": (name, body, "application/zip")}, **{H: h})  # noqa: E731
    assert up(member[H]).status_code == 403
    assert up(maintainer[H], name="shop.tar").status_code == 400
    assert up(maintainer[H], body=b"junk").status_code == 400
    r = up(maintainer[H])
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["source"]["kind"] == "archive" and {p["name"] for p in j["projects"]} == {"Legacy.Web", "Modern.Api"}


def test_git_api_validation(client, maintainer, member):
    assert client.post("/api/ingest/git", json={"url": "https://gitlab.com/a/b.git"}, **{H: member[H]}).status_code == 403
    assert client.post("/api/ingest/git", json={"url": "git@gitlab.com:a/b.git"}, **{H: maintainer[H]}).status_code == 400
    assert client.post("/api/ingest/git", json={"url": "https://gitlab.com/a/b.git", "ref": "--upload-pack=x"}, **{H: maintainer[H]}).status_code == 400
    assert client.post("/api/ingest/git", json={"url": "https://gitlab.com/a/b.git", "path": "../etc"}, **{H: maintainer[H]}).status_code == 400
    assert client.post("/api/ingest/bitbucket", json={"repo": "https://github.com/a/b"}, **{H: maintainer[H]}).status_code == 400


def _fake_clone(calls):
    def clone(url, ref, dest, header):
        calls.append((url, ref, header))
        for f in FILES:
            p = dest / f["path"]
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(f["content"], encoding="utf-8")
    return clone


def test_git_api_with_fake_clone(client, maintainer, monkeypatch):
    calls = []
    monkeypatch.setattr(repo_sources, "_clone", _fake_clone(calls))
    monkeypatch.setenv("GIT_HTTP_TOKEN", "secret-token")
    r = client.post("/api/ingest/git", json={"url": "https://dev.azure.com/org/proj/_git/shop", "ref": "main", "path": "Shop"}, **{H: maintainer[H]})
    assert r.status_code == 200, r.text
    src = r.json()["source"]
    assert src["kind"] == "git" and src["ref"] == "main" and src["authenticated"] is True and src["path"] == "Shop"
    assert "secret-token" not in r.text
    assert calls[0][2] == "Authorization: Bearer secret-token"


def test_bitbucket_api_with_fake_clone(client, maintainer, monkeypatch):
    calls = []
    monkeypatch.setattr(repo_sources, "_clone", _fake_clone(calls))
    monkeypatch.setenv("BITBUCKET_USERNAME", "raj")
    monkeypatch.setenv("BITBUCKET_APP_PASSWORD", "app-pw")
    r = client.post("/api/ingest/bitbucket", json={"repo": "acme/shop", "ref": "develop"}, **{H: maintainer[H]})
    assert r.status_code == 200, r.text
    src = r.json()["source"]
    assert src["kind"] == "bitbucket" and src["repo"] == "acme/shop" and src["authenticated"] is True
    assert calls[0][0] == "https://bitbucket.org/acme/shop.git" and calls[0][2].startswith("Authorization: Basic ")
    assert "app-pw" not in r.text


def test_git_api_empty_repo_422(client, maintainer, monkeypatch):
    monkeypatch.setattr(repo_sources, "_clone", lambda url, ref, dest, header: dest.mkdir(parents=True))
    r = client.post("/api/ingest/git", json={"url": "https://gitlab.com/a/empty.git"}, **{H: maintainer[H]})
    assert r.status_code == 422


def test_import_into_created_project(client, maintainer, member):
    from test_api import LEGACY_CSPROJ
    p = client.post("/api/projects", json={"name": "Billing Portal", "system": "modern", "description": "Customer billing site"}, **{H: maintainer[H]}).json()
    files = [
        {"path": "BillingPortal/BillingPortal.sln", "content": "sln"},
        {"path": "BillingPortal/Web/Web.csproj", "content": LEGACY_CSPROJ},
        {"path": "BillingPortal/Web/HomeController.cs", "content": "using System.Web.Mvc;"},
    ]
    r = client.post("/api/ingest", json={"files": files, "project": p["slug"]}, **{H: maintainer[H]})
    assert r.status_code == 200, r.text
    proj = r.json()["projects"]
    assert len(proj) == 1 and proj[0]["slug"] == "billing-portal" and proj[0]["created"] is False
    hub = client.get("/api/projects/billing-portal", **{H: member[H]}).json()
    assert hub["framework"] == ".NET Framework 4.8" and hub["system"] == "legacy"
    assert hub["description"] == "Customer billing site" and hub["origin"] == "TEAM"
    assert {d["slug"] for d in hub["docs"]} >= {"web-architecture", "web-setup", "billingportal-repository-scan"}
    assert client.get("/api/projects/web", **{H: member[H]}).status_code == 404  # no duplicate project
    assert client.post("/api/ingest", json={"files": files, "project": "gone"}, **{H: maintainer[H]}).status_code == 404
