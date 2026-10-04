"""Role-based access and cross-user record protection."""
from conftest import EMAILS, book, doctor_id_of, login, next_bookable_slot


def test_patient_cannot_access_pm_workspace(client):
    csrf = login(client, "patient")
    assert client.get("/api/risks").status_code == 403
    assert client.get("/api/tasks").status_code == 403
    assert client.get("/api/plan").status_code == 403
    assert client.get("/api/verification").status_code == 403


def test_doctor_cannot_access_pm_workspace_or_book(client):
    csrf = login(client, "doctor")
    assert client.get("/api/risks").status_code == 403
    assert client.get("/api/doctors").status_code == 403  # booking is patient-only
    assert client.get("/api/health-logs").status_code == 403


def test_pm_cannot_browse_patient_records(client):
    csrf = login(client, "pm")
    assert client.get("/api/health-logs").status_code == 403
    assert client.get("/api/appointments").status_code == 403
    assert client.get("/api/doctors").status_code == 403
    assert client.get("/api/reminders").status_code == 403


def test_cross_patient_health_log_access_denied(client):
    csrf1 = login(client, "patient")
    created = client.post("/api/health-logs",
                          json={"type": "HEART_RATE", "value": 80},
                          headers={"X-CSRF-Token": csrf1})
    assert created.status_code == 201
    log_id = created.get_json()["log"]["id"]
    client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf1})

    csrf2 = login(client, "patient2")
    # The other patient sees neither the record nor can delete it.
    logs = client.get("/api/health-logs").get_json()["logs"]
    assert all(l["id"] != log_id for l in logs)
    resp = client.delete(f"/api/health-logs/{log_id}",
                         headers={"X-CSRF-Token": csrf2})
    assert resp.status_code == 404  # no information leak


def test_unauthorized_appointment_update(client):
    doc_id = doctor_id_of(client, EMAILS["doctor"])
    date_iso, time_str = next_bookable_slot("Dr. Meera Iyer")

    csrf1 = login(client, "patient")
    appt_id = book(client, csrf1, doc_id, date_iso, time_str).get_json()[
        "appointment"]["id"]
    client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf1})

    # Another patient cannot touch it.
    csrf2 = login(client, "patient2")
    resp = client.patch(f"/api/appointments/{appt_id}",
                        json={"action": "cancel"},
                        headers={"X-CSRF-Token": csrf2})
    assert resp.status_code == 403
    client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf2})

    # A doctor who is not the treating doctor cannot touch it either.
    csrf_d2 = login(client, "doctor2")
    resp = client.patch(f"/api/appointments/{appt_id}",
                        json={"status": "CANCELLED"},
                        headers={"X-CSRF-Token": csrf_d2})
    assert resp.status_code == 403


def test_doctor_slot_response_leaks_no_patient_identity(client):
    csrf = login(client, "patient")
    doc_id = doctor_id_of(client, EMAILS["doctor"])
    date_iso, time_str = next_bookable_slot("Dr. Meera Iyer")
    assert book(client, csrf, doc_id, date_iso, time_str).status_code == 201

    resp = client.get(f"/api/doctors/{doc_id}/slots?date={date_iso}")
    assert resp.status_code == 200
    body = resp.get_json()
    text = str(body)
    assert "Aarav" not in text and "Priya" not in text and "patient" not in body
    slot = next(s for s in body["slots"] if s["time"] == time_str)
    assert slot["available"] is False
