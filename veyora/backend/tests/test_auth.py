"""Authentication: correct/incorrect login, logout, unauthenticated access."""
from conftest import EMAILS, PASSWORDS, login


def test_correct_login(client):
    resp = client.post("/api/auth/login", json={
        "email": EMAILS["patient"], "password": PASSWORDS["patient"]})
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["user"]["email"] == EMAILS["patient"]
    assert body["user"]["role"] == "PATIENT"
    assert body["csrf_token"]


def test_incorrect_password_rejected(client):
    resp = client.post("/api/auth/login", json={
        "email": EMAILS["patient"], "password": "wrong-password"})
    assert resp.status_code == 401
    assert resp.get_json()["error"] == "invalid"


def test_unknown_email_rejected(client):
    resp = client.post("/api/auth/login", json={
        "email": "nobody@veyora.demo", "password": "anything"})
    assert resp.status_code == 401


def test_missing_fields_rejected(client):
    assert client.post("/api/auth/login", json={}).status_code == 400
    assert client.post("/api/auth/login",
                       json={"email": EMAILS["patient"]}).status_code == 400


def test_logout_invalidates_session(client):
    csrf = login(client, "patient")
    assert client.get("/api/appointments").status_code == 200
    assert logout_ok(client, csrf)
    assert client.get("/api/appointments").status_code == 401


def logout_ok(client, csrf):
    return client.post("/api/auth/logout",
                       headers={"X-CSRF-Token": csrf}).status_code == 200


def test_unauthenticated_api_rejected(client):
    assert client.get("/api/appointments").status_code == 401
    assert client.get("/api/health-logs").status_code == 401
    assert client.get("/api/risks").status_code == 401
    assert client.get("/api/plan").status_code == 401


def test_state_change_requires_csrf(client):
    login(client, "patient")
    # No CSRF header -> rejected even with a valid session.
    resp = client.post("/api/health-logs", json={"type": "HEART_RATE", "value": 70})
    assert resp.status_code == 403
    assert resp.get_json()["error"] == "csrf"


def test_demo_login_only_in_demo_mode(app, client):
    app.config["DEMO_MODE"] = True
    csrf_resp = client.post("/api/auth/demo-login",
                            json={"email": EMAILS["patient"]})
    assert csrf_resp.status_code == 200
    client.post("/api/auth/logout", headers={
        "X-CSRF-Token": csrf_resp.get_json()["csrf_token"]})

    app.config["DEMO_MODE"] = False
    resp = client.post("/api/auth/demo-login", json={"email": EMAILS["patient"]})
    assert resp.status_code == 403
