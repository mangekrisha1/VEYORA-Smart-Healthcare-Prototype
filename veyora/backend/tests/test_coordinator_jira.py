"""Tests for Clinic Coordinator dashboard, appointment monitor, incident lifecycle,
and Jira Cloud integration.
"""
from datetime import timedelta
from unittest.mock import patch

from conftest import EMAILS, book, doctor_id_of, login, next_bookable_slot

from app.models import APPT_CONFIRMED, Appointment, Consultation, Incident, Risk
from app.schedule import today_ist


def test_coordinator_role_guards(client):
    """Ensure PATIENT and DOCTOR roles cannot access coordinator endpoints."""
    # Unauthenticated
    assert client.get("/api/coordinator/overview").status_code == 401
    assert client.get("/api/coordinator/appointments").status_code == 401
    assert client.get("/api/coordinator/incidents").status_code == 401

    # Patient
    csrf_patient = login(client, "patient")
    assert client.get("/api/coordinator/overview").status_code == 403
    assert client.get("/api/coordinator/appointments").status_code == 403
    assert client.get("/api/coordinator/incidents").status_code == 403
    client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf_patient})

    # Doctor
    csrf_doctor = login(client, "doctor")
    assert client.get("/api/coordinator/overview").status_code == 403
    assert client.get("/api/coordinator/appointments").status_code == 403
    assert client.get("/api/coordinator/incidents").status_code == 403
    client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf_doctor})

    # Coordinator (PROJECT_MANAGER)
    csrf_pm = login(client, "pm")
    assert client.get("/api/coordinator/overview").status_code == 200
    assert client.get("/api/coordinator/appointments").status_code == 200
    assert client.get("/api/coordinator/incidents").status_code == 200


def test_clinic_overview_metrics_mutually_exclusive(client, app):
    """Verify clinic overview metrics are mutually exclusive and reflect today's appointments."""
    csrf = login(client, "pm")
    today = today_ist()

    # Seed 3 appointments for today directly with different workflow states
    with app.app_context():
        from app.extensions import db
        doc_id = doctor_id_of(client, EMAILS["doctor"])
        patient_id = doctor_id_of(client, EMAILS["patient"])

        # 1. Confirmed (not started)
        a1 = Appointment(patient_id=patient_id, doctor_id=doc_id, date=today,
                         start_time="09:00", status="CONFIRMED")
        # 2. Confirmed (in progress with consultation started)
        a2 = Appointment(patient_id=patient_id, doctor_id=doc_id, date=today,
                         start_time="09:30", status="CONFIRMED")
        # 3. Completed
        a3 = Appointment(patient_id=patient_id, doctor_id=doc_id, date=today,
                         start_time="10:00", status="COMPLETED")
        # 4. Cancelled
        a4 = Appointment(patient_id=patient_id, doctor_id=doc_id, date=today,
                         start_time="10:30", status="CANCELLED")
        db.session.add_all([a1, a2, a3, a4])
        db.session.commit()

        c2 = Consultation(appointment_id=a2.id, started_at=today_ist())
        db.session.add(c2)
        db.session.commit()

    resp = client.get("/api/coordinator/overview")
    assert resp.status_code == 200
    body = resp.get_json()
    metrics = body["metrics"]

    assert metrics["total_today"] == 4
    assert metrics["confirmed_today"] == 1
    assert metrics["in_progress_today"] == 1
    assert metrics["completed_today"] == 1
    assert metrics["cancelled_today"] == 1
    assert (
        metrics["confirmed_today"]
        + metrics["in_progress_today"]
        + metrics["completed_today"]
        + metrics["cancelled_today"]
    ) == metrics["total_today"]

    # Verify schedule list contains zero patient identities
    for item in body["schedule"]:
        assert "patient" not in item
        assert "patient_id" not in item
        assert "notes" not in item
        assert "summary" not in item
        assert item["reference"].startswith("APT-")


def test_appointment_monitor_zero_medical_exposure(client, app):
    """Verify appointment monitor has zero medical or clinical note exposure."""
    csrf = login(client, "pm")
    doc_id = doctor_id_of(client, EMAILS["doctor"])

    with app.app_context():
        from app.extensions import db
        patient_id = doctor_id_of(client, EMAILS["patient"])
        a = Appointment(patient_id=patient_id, doctor_id=doc_id, date=today_ist(),
                        start_time="11:00", status="CONFIRMED")
        db.session.add(a)
        db.session.commit()
        cons = Consultation(appointment_id=a.id, summary="CONFIDENTIAL CLINICAL RECORD")
        db.session.add(cons)
        db.session.commit()

    resp = client.get("/api/coordinator/appointments")
    assert resp.status_code == 200
    body = resp.get_json()
    text = str(body)

    # Must NOT contain clinical summary or patient name
    assert "CONFIDENTIAL CLINICAL RECORD" not in text
    assert "Aarav" not in text
    assert "patient" not in text

    # Filter by date works
    resp_date = client.get(f"/api/coordinator/appointments?date={today_ist().isoformat()}")
    assert resp_date.status_code == 200
    assert len(resp_date.get_json()["appointments"]) >= 1


def test_incident_lifecycle_and_audit_trail(client):
    """Test incident reporting, status transitions, mandatory resolution note, and reopen."""
    csrf = login(client, "pm")

    # 1. Report an incident
    resp = client.post(
        "/api/coordinator/incidents",
        json={
            "title": "Portal login latency spike",
            "category": "Availability",
            "priority": "High",
            "description": "Observed 3-second delay on authentication requests.",
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert resp.status_code == 201
    inc = resp.get_json()["incident"]
    inc_id = inc["id"]
    assert inc["reference"].startswith("INC-")
    assert inc["status"] == "Open"
    assert inc["priority"] == "High"
    assert inc["reported_by_name"] == "Krisha Mange"
    assert len(inc["activities"]) == 1
    assert inc["activities"][0]["action"] == "REPORTED"

    # 2. Transition to In progress
    resp = client.patch(
        f"/api/coordinator/incidents/{inc_id}",
        json={"status": "In progress"},
        headers={"X-CSRF-Token": csrf},
    )
    assert resp.status_code == 200
    inc = resp.get_json()["incident"]
    assert inc["status"] == "In progress"
    assert inc["activities"][0]["action"] == "STATUS_CHANGED"

    # 3. Resolve without resolution note -> 400 rejected
    resp = client.patch(
        f"/api/coordinator/incidents/{inc_id}",
        json={"status": "Resolved"},
        headers={"X-CSRF-Token": csrf},
    )
    assert resp.status_code == 400
    assert "resolution note is required" in resp.get_json()["message"].lower()

    # 4. Resolve with resolution note -> 200 success
    resp = client.patch(
        f"/api/coordinator/incidents/{inc_id}",
        json={
            "status": "Resolved",
            "resolution_note": "Redis connection pool was increased; latency back to normal under 120ms.",
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert resp.status_code == 200
    inc = resp.get_json()["incident"]
    assert inc["status"] == "Resolved"
    assert inc["resolution_note"] is not None
    assert inc["resolved_at"] is not None
    assert inc["activities"][0]["action"] == "RESOLVED"

    # 5. Reopen
    resp = client.patch(
        f"/api/coordinator/incidents/{inc_id}",
        json={"status": "Open", "reopen_reason": "Follow-up monitoring requested."},
        headers={"X-CSRF-Token": csrf},
    )
    assert resp.status_code == 200
    inc = resp.get_json()["incident"]
    assert inc["status"] == "Open"
    assert inc["resolved_at"] is None
    assert inc["activities"][0]["action"] == "REOPENED"


def test_jira_unconfigured_state(client, monkeypatch):
    """When Jira env vars are absent, returns configured=False without failing."""
    csrf = login(client, "pm")
    monkeypatch.delenv("JIRA_SITE_URL", raising=False)
    monkeypatch.delenv("JIRA_EMAIL", raising=False)
    monkeypatch.delenv("JIRA_API_TOKEN", raising=False)
    monkeypatch.delenv("JIRA_PROJECT_KEY", raising=False)

    resp = client.get("/api/coordinator/jira/status")
    assert resp.status_code == 200
    status = resp.get_json()["status"]
    assert status["configured"] is False
    assert "not configured" in status["message"].lower()


def test_jira_mocked_create_and_duplicate_protection(client, monkeypatch):
    """Mocked Jira issue creation and duplicate-link prevention."""
    csrf = login(client, "pm")
    monkeypatch.setenv("JIRA_SITE_URL", "https://veyora.atlassian.net")
    monkeypatch.setenv("JIRA_EMAIL", "coordinator@veyora.demo")
    monkeypatch.setenv("JIRA_API_TOKEN", "mock-token-xyz")
    monkeypatch.setenv("JIRA_PROJECT_KEY", "VEY")

    # Create local incident
    inc_resp = client.post(
        "/api/coordinator/incidents",
        json={"title": "Test Defect", "category": "Data accuracy", "priority": "Medium"},
        headers={"X-CSRF-Token": csrf},
    )
    inc_id = inc_resp.get_json()["incident"]["id"]

    # Mock Jira service calls
    with patch("app.api.coordinator.create_issue") as mock_create:
        mock_create.return_value = ({
            "jira_id": "10045",
            "jira_key": "VEY-42",
            "jira_url": "https://veyora.atlassian.net/browse/VEY-42",
            "jira_status": "To Do",
        }, None)

        resp = client.post(
            "/api/coordinator/jira/create-issue",
            json={
                "entity_type": "incident",
                "entity_id": inc_id,
                "summary": "[VEYORA: INC-01] Test Defect",
                "description": "Technical description of observed defect.",
                "issue_type": "Bug",
            },
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 201
        entity = resp.get_json()["entity"]
        assert entity["jira_key"] == "VEY-42"
        assert entity["jira_status"] == "To Do"
        assert entity["jira_url"] == "https://veyora.atlassian.net/browse/VEY-42"

    # Attempt duplicate creation on the already linked incident -> 409
    resp_dup = client.post(
        "/api/coordinator/jira/create-issue",
        json={
            "entity_type": "incident",
            "entity_id": inc_id,
            "summary": "Duplicate attempt",
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert resp_dup.status_code == 409
    assert "already linked" in resp_dup.get_json()["message"].lower()


def test_jira_mocked_refresh_status(client, monkeypatch):
    """Mocked Jira status refresh updates local record."""
    csrf = login(client, "pm")
    monkeypatch.setenv("JIRA_SITE_URL", "https://veyora.atlassian.net")
    monkeypatch.setenv("JIRA_EMAIL", "coordinator@veyora.demo")
    monkeypatch.setenv("JIRA_API_TOKEN", "mock-token-xyz")
    monkeypatch.setenv("JIRA_PROJECT_KEY", "VEY")

    # Create incident with pre-linked key
    inc_resp = client.post(
        "/api/coordinator/incidents",
        json={"title": "Status Sync Test", "category": "Other", "priority": "Low"},
        headers={"X-CSRF-Token": csrf},
    )
    inc_id = inc_resp.get_json()["incident"]["id"]

    # Link issue with mock
    with patch("app.api.coordinator.verify_and_get_issue") as mock_verify:
        mock_verify.return_value = ({
            "jira_id": "10099",
            "jira_key": "VEY-99",
            "jira_url": "https://veyora.atlassian.net/browse/VEY-99",
            "jira_status": "In Progress",
            "summary": "Status Sync Test",
        }, None)

        link_resp = client.post(
            "/api/coordinator/jira/link-issue",
            json={"entity_type": "incident", "entity_id": inc_id, "jira_key": "VEY-99"},
            headers={"X-CSRF-Token": csrf},
        )
        assert link_resp.status_code == 200
        assert link_resp.get_json()["entity"]["jira_status"] == "In Progress"

    # Refresh status to Done
    with patch("app.api.coordinator.refresh_issue_status") as mock_refresh:
        mock_refresh.return_value = ("Done", None)

        ref_resp = client.post(
            "/api/coordinator/jira/refresh-status",
            json={"entity_type": "incident", "entity_id": inc_id},
            headers={"X-CSRF-Token": csrf},
        )
        assert ref_resp.status_code == 200
        assert ref_resp.get_json()["entity"]["jira_status"] == "Done"
