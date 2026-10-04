"""Shared pytest fixtures: isolated, file-backed test databases.

Each test gets its own temporary SQLite *file* (not :memory:) so persistence
behaviour and the partial unique index are exercised exactly as in the app.
"""
import json
import sys
import threading
import urllib.request
from datetime import timedelta
from http.cookiejar import CookieJar
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import create_app  # noqa: E402
from app.schedule import is_slot_bookable, slots_for, today_ist  # noqa: E402
from app.seed import seed  # noqa: E402


class IsolatedConfig:
    """App config for tests: isolated file DB per fixture."""
    def __init__(self, db_path: str):
        self.SECRET_KEY = "test-secret-key"
        self.SECRET_KEY_IS_DEFAULT = False
        self.DB_PATH = db_path
        self.SQLALCHEMY_DATABASE_URI = f"sqlite:///{db_path}"
        self.SQLALCHEMY_TRACK_MODIFICATIONS = False
        self.SQLALCHEMY_ENGINE_OPTIONS = {"connect_args": {"timeout": 15}}
        self.DEMO_MODE = True
        self.SESSION_COOKIE_HTTPONLY = True
        self.SESSION_COOKIE_SAMESITE = "Lax"
        self.SESSION_COOKIE_SECURE = False
        self.SESSION_COOKIE_NAME = "veyora_session"
        self.PERMANENT_SESSION_LIFETIME = 3600
        self.BOOKING_HORIZON_DAYS = 30
        self.BOOKING_LEAD_MINUTES = 60
        self.REMINDER_WINDOW_DAYS = 7
        self.DISPLAY_TIMEZONE = "Asia/Kolkata"


@pytest.fixture()
def app(tmp_path):
    db_path = tmp_path / "veyora-test.db"
    application = create_app(IsolatedConfig(str(db_path)))
    with application.app_context():
        seed(verbose=False)
    yield application


@pytest.fixture()
def client(app):
    return app.test_client()


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

EMAILS = {
    "patient": "aarav.shah@veyora.demo",
    "patient2": "priya.nair@veyora.demo",
    "doctor": "meera.iyer@veyora.demo",
    "doctor2": "rohan.deshpande@veyora.demo",
    "pm": "krisha.mange@veyora.demo",
}
PASSWORDS = {"patient": "Patient@123", "patient2": "Patient@123",
             "doctor": "Doctor@123", "doctor2": "Doctor@123",
             "pm": "Veyora@123"}


def login(client, who: str):
    """Log in as a seeded account; returns the CSRF token."""
    resp = client.post("/api/auth/login", json={
        "email": EMAILS[who], "password": PASSWORDS[who]})
    assert resp.status_code == 200, resp.get_data(as_text=True)
    return resp.get_json()["csrf_token"]


def logout(client, csrf: str):
    return client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf})


def next_bookable_slot(doctor_name: str, skip_dates=()):
    """Find the earliest genuinely bookable future slot for a doctor."""
    day = today_ist()
    for i in range(1, 31):
        d = day + timedelta(days=i)
        if d in skip_dates:
            continue
        for t in slots_for(doctor_name, d):
            ok, _ = is_slot_bookable(doctor_name, d, t, 30, 60)
            if ok:
                return d.isoformat(), t
    raise RuntimeError("no bookable slot found")


def book(client, csrf, doctor_id, date_iso, time_str):
    return client.post("/api/appointments",
                       json={"doctor_id": doctor_id, "date": date_iso,
                             "start_time": time_str},
                       headers={"X-CSRF-Token": csrf})


def doctor_id_of(client, email):
    from app.extensions import db
    from app.models import User
    with client.application.app_context():
        u = db.session.execute(db.select(User).filter_by(email=email)).scalar_one()
        return u.id


# ---------------------------------------------------------------------------
# live-server fixture for the concurrency test
# ---------------------------------------------------------------------------

@pytest.fixture()
def live_server(app):
    """Run the real app on a local port so true concurrent requests race."""
    from werkzeug.serving import make_server
    server = make_server("127.0.0.1", 0, app, threaded=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    port = server.server_address[1]
    yield f"http://127.0.0.1:{port}"
    server.shutdown()


class HttpSession:
    """Minimal cookie-aware HTTP client for the live server."""
    def __init__(self, base_url: str):
        self.base = base_url
        self.jar = CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar))
        self.csrf = None

    def login(self, email, password):
        body = json.dumps({"email": email, "password": password}).encode()
        req = urllib.request.Request(self.base + "/api/auth/login", data=body,
                                     headers={"Content-Type": "application/json"})
        with self.opener.open(req) as resp:
            data = json.loads(resp.read())
        self.csrf = data["csrf_token"]
        return data

    def post(self, path, payload):
        body = json.dumps(payload).encode()
        req = urllib.request.Request(self.base + path, data=body,
                                     headers={"Content-Type": "application/json",
                                              "X-CSRF-Token": self.csrf or ""})
        try:
            with self.opener.open(req) as resp:
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")
