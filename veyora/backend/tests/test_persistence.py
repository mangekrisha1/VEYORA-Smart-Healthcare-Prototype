"""Persistence: records survive restarts in a file-backed database."""
from conftest import EMAILS, IsolatedConfig, book, doctor_id_of, login, next_bookable_slot

from app import create_app
from app.seed import seed


def test_data_survives_app_restart(tmp_path):
    db_path = tmp_path / "persist.db"
    app1 = create_app(IsolatedConfig(str(db_path)))
    with app1.app_context():
        seed(verbose=False)

    client1 = app1.test_client()
    csrf = login(client1, "patient")
    doc_id = doctor_id_of(client1, EMAILS["doctor"])
    date_iso, time_str = next_bookable_slot("Dr. Meera Iyer")
    assert book(client1, csrf, doc_id, date_iso, time_str).status_code == 201
    assert client1.post("/api/health-logs",
                        json={"type": "HEART_RATE", "value": 66},
                        headers={"X-CSRF-Token": csrf}).status_code == 201

    # A brand-new app instance on the same file sees the same records.
    app2 = create_app(IsolatedConfig(str(db_path)))
    client2 = app2.test_client()
    csrf2 = login(client2, "patient")
    appts = client2.get("/api/appointments").get_json()["appointments"]
    assert len(appts) == 1 and appts[0]["start_time"] == time_str
    logs = client2.get("/api/health-logs").get_json()["logs"]
    assert any(l["value"] == 66 for l in logs)


def test_seed_is_idempotent(tmp_path):
    db_path = tmp_path / "seed-twice.db"
    application = create_app(IsolatedConfig(str(db_path)))
    with application.app_context():
        seed(verbose=False)
        seed(verbose=False)  # second run must not duplicate or overwrite
        from app.extensions import db
        from app.models import Risk, User
        assert db.session.execute(db.select(db.func.count(User.id))).scalar() == 5
        assert db.session.execute(db.select(db.func.count(Risk.id))).scalar() == 6
