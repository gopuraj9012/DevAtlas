"""Owner-only admin: users and roles, invites, settings, audit log."""
import pytest

H = "headers"


@pytest.fixture
def reset_settings(client, owner):
    yield
    client.put("/api/admin/settings", json={"signup_mode": "open", "session_days": 7, "import_sources": ["folder", "archive", "github", "bitbucket", "git"]}, **{H: owner[H]})


def _signup(client, email, **extra):
    return client.post("/api/auth/signup", json={"email": email, "password": "Password1!", **extra})


def _login(client, email):
    r = client.post("/api/auth/login", json={"email": email, "password": "Password1!"})
    return r, {"Authorization": f"Bearer {r.json().get('token', '')}"}


@pytest.mark.parametrize("path", ["/api/admin/users", "/api/admin/settings", "/api/admin/invites", "/api/admin/audit", "/api/admin/summary"])
def test_admin_requires_owner(client, member, maintainer, path):
    assert client.get(path).status_code == 401
    assert client.get(path, **{H: member[H]}).status_code == 403
    assert client.get(path, **{H: maintainer[H]}).status_code == 403


def test_auth_config_is_public(client):
    r = client.get("/api/auth/config")
    assert r.status_code == 200 and set(r.json()) == {"signup_mode", "allowed_domains", "import_sources"}


def test_list_users_shape(client, owner, member):
    users = client.get("/api/admin/users", **{H: owner[H]}).json()
    me = next(u for u in users if u["email"] == "member@test.local")
    assert {"id", "email", "name", "role", "active", "created_at", "last_login_at", "origin"} <= set(me)
    assert "password_hash" not in me and "_id" not in me


def test_role_change_signs_user_out_and_is_audited(client, owner):
    data = _signup(client, "promote@test.local").json()
    old = {"Authorization": f"Bearer {data['token']}"}
    r = client.put(f"/api/admin/users/{data['user']['id']}", json={"role": "maintainer"}, **{H: owner[H]})
    assert r.status_code == 200 and r.json()["role"] == "maintainer"
    assert client.get("/api/auth/me", headers=old).status_code == 401  # old token revoked
    r, new = _login(client, "promote@test.local")
    assert client.get("/api/auth/me", headers=new).json()["role"] == "maintainer"
    log = client.get("/api/admin/audit?action=user.role", **{H: owner[H]}).json()
    assert log[0]["target"] == "promote@test.local" and log[0]["detail"] == {"from": "engineer", "to": "maintainer"}


def test_deactivate_blocks_login(client, owner):
    data = _signup(client, "leaver@test.local").json()
    uid = data["user"]["id"]
    assert client.put(f"/api/admin/users/{uid}", json={"active": False}, **{H: owner[H]}).json()["active"] is False
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {data['token']}"}).status_code == 401
    assert _login(client, "leaver@test.local")[0].status_code == 403
    client.put(f"/api/admin/users/{uid}", json={"active": True}, **{H: owner[H]})
    assert _login(client, "leaver@test.local")[0].status_code == 200


def test_owner_cannot_change_self_but_can_manage_other_owners(client, owner):
    assert client.put(f"/api/admin/users/{owner['user']['id']}", json={"role": "engineer"}, **{H: owner[H]}).status_code == 400
    assert client.put(f"/api/admin/users/{owner['user']['id']}", json={"active": False}, **{H: owner[H]}).status_code == 400
    data = _signup(client, "owner2@test.local").json()
    uid = data["user"]["id"]
    assert client.put(f"/api/admin/users/{uid}", json={"role": "owner"}, **{H: owner[H]}).json()["role"] == "owner"
    _, h2 = _login(client, "owner2@test.local")
    assert client.get("/api/admin/users", headers=h2).status_code == 200
    assert client.put(f"/api/admin/users/{uid}", json={"role": "engineer"}, **{H: owner[H]}).status_code == 200
    assert client.get("/api/admin/users", headers=h2).status_code == 401  # signed out by the change
    assert client.put("/api/admin/users/not-an-id", json={"role": "owner"}, **{H: owner[H]}).status_code == 404


def test_settings_validation_and_audit(client, owner, reset_settings):
    assert client.put("/api/admin/settings", json={"signup_mode": "domain", "allowed_domains": []}, **{H: owner[H]}).status_code == 400
    assert client.put("/api/admin/settings", json={"allowed_domains": ["not a domain"]}, **{H: owner[H]}).status_code == 400
    assert client.put("/api/admin/settings", json={"session_days": 0}, **{H: owner[H]}).status_code == 422
    s = client.put("/api/admin/settings", json={"signup_mode": "domain", "allowed_domains": ["@Corp.example.com"], "session_days": 3}, **{H: owner[H]}).json()
    assert s["signup_mode"] == "domain" and s["allowed_domains"] == ["corp.example.com"] and s["session_days"] == 3 and s["updated_by"] == "Olga Owner"
    assert client.get("/api/admin/audit?action=settings", **{H: owner[H]}).json()[0]["detail"]["signup_mode"] == {"from": "open", "to": "domain"}


def test_domain_signup(client, owner, reset_settings):
    client.put("/api/admin/settings", json={"signup_mode": "domain", "allowed_domains": ["corp.example.com"]}, **{H: owner[H]})
    assert _signup(client, "x@gmail.com").status_code == 403
    assert _signup(client, "dev@corp.example.com").status_code == 200


def test_invite_only_signup(client, owner, reset_settings):
    client.put("/api/admin/settings", json={"signup_mode": "invite"}, **{H: owner[H]})
    assert _signup(client, "nocode@test.local").status_code == 403
    inv = client.post("/api/admin/invites", json={"email": "lead@test.local", "role": "maintainer"}, **{H: owner[H]}).json()
    assert inv["status"] == "pending" and len(inv["code"]) >= 12
    assert _signup(client, "other@x.local", invite_code=inv["code"]).status_code == 403  # bound to an email
    r = _signup(client, "lead@test.local", invite_code=inv["code"])
    assert r.status_code == 200 and r.json()["user"]["role"] == "maintainer"
    assert _signup(client, "lead2@test.local", invite_code=inv["code"]).status_code == 403  # single use
    invites = client.get("/api/admin/invites", **{H: owner[H]}).json()
    assert next(i for i in invites if i["code"] == inv["code"])["status"] == "used"
    assert client.post("/api/admin/invites", json={"email": "lead@test.local"}, **{H: owner[H]}).status_code == 409


def test_invite_revoke(client, owner):
    inv = client.post("/api/admin/invites", json={"role": "engineer", "days": 1}, **{H: owner[H]}).json()
    assert client.delete(f"/api/admin/invites/{inv['id']}", **{H: owner[H]}).json()["status"] == "revoked"
    assert _signup(client, "late@test.local", invite_code=inv["code"]).status_code == 403


def test_session_days_setting_controls_token(client, owner, reset_settings):
    import jwt
    client.put("/api/admin/settings", json={"session_days": 1}, **{H: owner[H]})
    tok = client.post("/api/auth/login", json={"email": "member@test.local", "password": "Password1!"}).json()["token"]
    p = jwt.decode(tok, options={"verify_signature": False})
    assert p["exp"] - p["iat"] == 86400


def test_import_source_toggle(client, owner, maintainer, reset_settings):
    client.put("/api/admin/settings", json={"import_sources": ["folder"]}, **{H: owner[H]})
    assert client.get("/api/auth/config").json()["import_sources"] == ["folder"]
    assert client.post("/api/ingest/git", json={"url": "https://gitlab.com/a/b.git"}, **{H: maintainer[H]}).status_code == 403
    assert client.post("/api/ingest/github", json={"repo": "a/b"}, **{H: maintainer[H]}).status_code == 403


def test_summary(client, owner):
    s = client.get("/api/admin/summary", **{H: owner[H]}).json()
    assert s["users"] >= s["active"] >= 1 and set(s["by_role"]) == {"engineer", "maintainer", "owner"}
