"""In-app appointment reminders: derived live, markable as read."""
from conftest import EMAILS, book, doctor_id_of, login, next_bookable_slot


def test_reminders_track_upcoming_appointment(client):
    csrf = login(client, "patient")
    doc_id = doctor_id_of(client, EMAILS["doctor"])
    date_iso, time_str = next_bookable_slot("Dr. Meera Iyer")
    created = book(client, csrf, doc_id, date_iso, time_str)
    appt_id = created.get_json()["appointment"]["id"]

    reminders = client.get("/api/reminders").get_json()["reminders"]
    match = [r for r in reminders if r["appointment_id"] == appt_id]
    assert len(match) == 1
    assert match[0]["read"] is False

    resp = client.post(f"/api/reminders/{appt_id}/read",
                       headers={"X-CSRF-Token": csrf})
    assert resp.status_code == 200
    reminders = client.get("/api/reminders").get_json()["reminders"]
    assert next(r for r in reminders if r["appointment_id"] == appt_id)["read"]


def test_cancelled_appointment_disappears_from_reminders(client):
    csrf = login(client, "patient")
    doc_id = doctor_id_of(client, EMAILS["doctor"])
    date_iso, time_str = next_bookable_slot("Dr. Meera Iyer")
    appt_id = book(client, csrf, doc_id, date_iso, time_str).get_json()[
        "appointment"]["id"]
    assert any(r["appointment_id"] == appt_id
               for r in client.get("/api/reminders").get_json()["reminders"])

    client.patch(f"/api/appointments/{appt_id}", json={"action": "cancel"},
                 headers={"X-CSRF-Token": csrf})
    assert all(r["appointment_id"] != appt_id
               for r in client.get("/api/reminders").get_json()["reminders"])


def test_other_patients_reminder_not_accessible(client):
    csrf1 = login(client, "patient")
    doc_id = doctor_id_of(client, EMAILS["doctor"])
    date_iso, time_str = next_bookable_slot("Dr. Meera Iyer")
    appt_id = book(client, csrf1, doc_id, date_iso, time_str).get_json()[
        "appointment"]["id"]
    client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf1})

    csrf2 = login(client, "patient2")
    resp = client.post(f"/api/reminders/{appt_id}/read",
                       headers={"X-CSRF-Token": csrf2})
    assert resp.status_code == 404
