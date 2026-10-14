"""Appointment booking, conflicts, cancellation, transitions."""
from datetime import timedelta

from conftest import (EMAILS, book, doctor_id_of, login, next_bookable_slot)

from app.schedule import today_ist


def test_valid_booking(client):
    csrf = login(client, "patient")
    doc_id = doctor_id_of(client, EMAILS["doctor"])
    date_iso, time_str = next_bookable_slot("Dr. Meera Iyer")
    resp = book(client, csrf, doc_id, date_iso, time_str)
    assert resp.status_code == 201, resp.get_data(as_text=True)
    appt = resp.get_json()["appointment"]
    assert appt["status"] == "CONFIRMED"
    assert appt["date"] == date_iso and appt["start_time"] == time_str

    # Refresh preserves the saved booking.
    listing = client.get("/api/appointments").get_json()["appointments"]
    assert any(a["id"] == appt["id"] for a in listing)


def test_duplicate_booking_by_other_patient(client):
    doc_id = doctor_id_of(client, EMAILS["doctor"])
    date_iso, time_str = next_bookable_slot("Dr. Meera Iyer")

    csrf1 = login(client, "patient")
    assert book(client, csrf1, doc_id, date_iso, time_str).status_code == 201
    client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf1})

    csrf2 = login(client, "patient2")
    resp = book(client, csrf2, doc_id, date_iso, time_str)
    assert resp.status_code == 409
    assert resp.get_json()["error"] == "slot_taken"


def test_same_patient_double_booking_also_conflicts(client):
    csrf = login(client, "patient")
    doc_id = doctor_id_of(client, EMAILS["doctor"])
    date_iso, time_str = next_bookable_slot("Dr. Meera Iyer")
    assert book(client, csrf, doc_id, date_iso, time_str).status_code == 201
    resp = book(client, csrf, doc_id, date_iso, time_str)
    assert resp.status_code == 409


def test_concurrent_booking_conflict(live_server):
    """Two patients race the same slot over a real HTTP server: exactly one
    succeeds, the other gets HTTP 409."""
    import concurrent.futures
    from conftest import HttpSession

    doc_email = EMAILS["doctor"]
    date_iso, time_str = next_bookable_slot("Dr. Meera Iyer")

    s1 = HttpSession(live_server)
    s2 = HttpSession(live_server)
    s1.login(EMAILS["patient"], "Patient@123")
    s2.login(EMAILS["patient2"], "Patient@123")

    # Resolve the doctor id through the API of session 1.
    import json
    import urllib.request
    req = urllib.request.Request(live_server + "/api/doctors")
    opener = s1.opener
    with opener.open(req) as resp:
        doctors = json.loads(resp.read())["doctors"]
    doc_id = next(d["id"] for d in doctors if d["name"] == "Dr. Meera Iyer")

    barrier = __import__("threading").Barrier(2)

    def attempt(session):
        barrier.wait(timeout=10)
        return session.post("/api/appointments", {
            "doctor_id": doc_id, "date": date_iso, "start_time": time_str})

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
        r1, r2 = list(ex.map(attempt, (s1, s2)))

    statuses = sorted((r1[0], r2[0]))
    assert statuses == [201, 409], f"expected one 201 and one 409, got {statuses}"


def test_past_slot_rejected(client):
    csrf = login(client, "patient")
    doc_id = doctor_id_of(client, EMAILS["doctor"])
    yesterday = (today_ist() - timedelta(days=1)).isoformat()
    resp = book(client, csrf, doc_id, yesterday, "09:00")
    assert resp.status_code == 400
    assert "past" in resp.get_json()["message"].lower()


def test_non_clinic_slot_rejected(client):
    csrf = login(client, "patient")
    doc_id = doctor_id_of(client, EMAILS["doctor"])
    date_iso, _ = next_bookable_slot("Dr. Meera Iyer")
    resp = book(client, csrf, doc_id, date_iso, "23:30")
    assert resp.status_code == 400


def test_cancellation_releases_slot(client):
    doc_id = doctor_id_of(client, EMAILS["doctor"])
    date_iso, time_str = next_bookable_slot("Dr. Meera Iyer")

    csrf1 = login(client, "patient")
    created = book(client, csrf1, doc_id, date_iso, time_str)
    assert created.status_code == 201
    appt_id = created.get_json()["appointment"]["id"]

    # Patient cancels their own appointment.
    resp = client.patch(f"/api/appointments/{appt_id}", json={"action": "cancel"},
                        headers={"X-CSRF-Token": csrf1})
    assert resp.status_code == 200
    assert resp.get_json()["appointment"]["status"] == "CANCELLED"
    client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf1})

    # Slot is free again: the other patient can now book it.
    csrf2 = login(client, "patient2")
    resp = book(client, csrf2, doc_id, date_iso, time_str)
    assert resp.status_code == 201


def test_completed_transition_only_by_doctor(client, monkeypatch):
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo
    import app.api.appointments as appointment_routes

    doc_id = doctor_id_of(client, EMAILS["doctor"])
    date_iso, time_str = next_bookable_slot("Dr. Meera Iyer")

    # Patient books an appointment.
    csrf_p = login(client, "patient")
    created = book(client, csrf_p, doc_id, date_iso, time_str)
    assert created.status_code == 201, created.get_data(as_text=True)
    appt_id = created.get_json()["appointment"]["id"]

    # Patient cannot complete an appointment.
    resp = client.patch(
        f"/api/appointments/{appt_id}",
        json={"status": "COMPLETED"},
        headers={"X-CSRF-Token": csrf_p},
    )
    assert resp.status_code == 403
    client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf_p})

    # Simulate the scheduled appointment time having arrived.
    scheduled_at = datetime.fromisoformat(
        f"{date_iso}T{time_str}"
    ).replace(tzinfo=ZoneInfo("Asia/Kolkata"))

    monkeypatch.setattr(
        appointment_routes,
        "now_ist",
        lambda: scheduled_at + timedelta(minutes=1),
    )

    # Doctor starts the consultation.
    csrf_d = login(client, "doctor")
    resp = client.patch(
        f"/api/appointments/{appt_id}",
        json={"action": "START"},
        headers={"X-CSRF-Token": csrf_d},
    )
    assert resp.status_code == 200, resp.get_data(as_text=True)

    # Doctor completes the consultation with a summary.
    resp = client.patch(
        f"/api/appointments/{appt_id}",
        json={
            "action": "COMPLETE",
            "summary": "Consultation completed for automated test.",
        },
        headers={"X-CSRF-Token": csrf_d},
    )
    assert resp.status_code == 200, resp.get_data(as_text=True)
    assert resp.get_json()["appointment"]["status"] == "COMPLETED"

    # A completed appointment cannot be cancelled.
    resp = client.patch(
        f"/api/appointments/{appt_id}",
        json={"status": "CANCELLED"},
        headers={"X-CSRF-Token": csrf_d},
    )
    assert resp.status_code == 409

def test_doctor_sees_only_own_appointments(client):
    doc_id = doctor_id_of(client, EMAILS["doctor"])
    date_iso, time_str = next_bookable_slot("Dr. Meera Iyer")
    csrf_p = login(client, "patient")
    book(client, csrf_p, doc_id, date_iso, time_str)
    client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf_p})

    csrf_d2 = login(client, "doctor2")  # different doctor
    listing = client.get("/api/appointments").get_json()["appointments"]
    assert listing == []


