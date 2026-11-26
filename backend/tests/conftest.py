"""Test harness: one app, one event loop, a throwaway <DB_NAME>_test database.

Use the `client`, `db`, `member` and `maintainer` fixtures. Do not build your
own TestClient or Motor client.
"""
import os
import sys
from pathlib import Path

import pytest
from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
load_dotenv(BACKEND / ".env")
os.environ["DB_NAME"] = f"{os.environ['DB_NAME']}_test"
for _var in ("DEMO_EMAIL", "DEMO_PASSWORD", "DEMO_ENGINEER_EMAIL", "DEMO_ENGINEER_PASSWORD"):
    os.environ.pop(_var, None)

from fastapi.testclient import TestClient  # noqa: E402
from pymongo import MongoClient  # noqa: E402

import server  # noqa: E402


@pytest.fixture(scope="session")
def db():
    """Synchronous handle on the test database for assertions and set-up."""
    mc = MongoClient(os.environ["MONGO_URL"])
    mc.drop_database(os.environ["DB_NAME"])
    yield mc[os.environ["DB_NAME"]]
    mc.drop_database(os.environ["DB_NAME"])
    mc.close()


@pytest.fixture(scope="session")
def client(db):
    with TestClient(server.app) as c:
        yield c


def _signup(client, email, name):
    res = client.post("/api/auth/signup", json={"email": email, "password": "Password1!", "name": name})
    assert res.status_code == 200, res.text
    return res.json()


@pytest.fixture(scope="session")
def member(client):
    data = _signup(client, "member@test.local", "Mia Member")
    return {"user": data["user"], "headers": {"Authorization": f"Bearer {data['token']}"}}


@pytest.fixture(scope="session")
def other_member(client):
    data = _signup(client, "other@test.local", "Oli Other")
    return {"user": data["user"], "headers": {"Authorization": f"Bearer {data['token']}"}}


@pytest.fixture(scope="session")
def owner(client, db):
    data = _signup(client, "owner@test.local", "Olga Owner")
    db.users.update_one({"email": "owner@test.local"}, {"$set": {"role": "owner"}})
    return {"user": {**data["user"], "role": "owner"}, "headers": {"Authorization": f"Bearer {data['token']}"}}


@pytest.fixture(scope="session")
def maintainer(client, db):
    data = _signup(client, "maint@test.local", "Max Maintainer")
    db.users.update_one({"email": "maint@test.local"}, {"$set": {"role": "maintainer"}})
    return {"user": {**data["user"], "role": "maintainer"}, "headers": {"Authorization": f"Bearer {data['token']}"}}
