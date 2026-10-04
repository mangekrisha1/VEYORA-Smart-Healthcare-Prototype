"""Idempotent seed for the VEYORA academic prototype.

Run:      python -m app.seed            (never overwrites existing records)
Reset:    python -m app.seed --reset    (DEV ONLY: wipes and recreates data)
"""
import sys
from datetime import date, timedelta

from werkzeug.security import generate_password_hash

from . import create_app
from .extensions import db
from .models import (LOG_HEART_RATE, LOG_TEMPERATURE, HealthLog, Milestone,
                     Risk, Task, User, VerificationRecord)

# Fictional healthcare identities. Passwords are for the local demo only.
SEED_USERS = [
    dict(name="Aarav Shah", email="aarav.shah@veyora.demo", password="Patient@123",
         role="PATIENT", specialty=None),
    dict(name="Priya Nair", email="priya.nair@veyora.demo", password="Patient@123",
         role="PATIENT", specialty=None),
    dict(name="Dr. Meera Iyer", email="meera.iyer@veyora.demo", password="Doctor@123",
         role="DOCTOR", specialty="Cardiology"),
    dict(name="Dr. Rohan Deshpande", email="rohan.deshpande@veyora.demo",
         password="Doctor@123", role="DOCTOR", specialty="General Medicine"),
    dict(name="Krisha Mange", email="krisha.mange@veyora.demo", password="Veyora@123",
         role="PROJECT_MANAGER", specialty=None),
]

# Illustrative planning estimates owned by the individual student (Krisha
# Mange). Controls start as "Planned"; they move to Implemented/Verified
# only when real evidence exists. Scores are P × I.
SEED_RISKS = [
    dict(code="RISK-01", title="Unauthorized access to patient data",
         description="An attacker or the wrong role could read or modify "
                     "another patient's appointments or health logs.",
         category="Security", probability=3, impact=5, owner="Krisha Mange",
         mitigation="Server-managed sessions, hashed passwords, CSRF tokens, "
                    "backend authorization checks on every endpoint.",
         contingency="Disable affected account, rotate session secret, review logs.",
         control_status="Implemented", linked_requirement="REQ-AUTH-01",
         linked_verification="VER-AUTH-01"),
    dict(code="RISK-02", title="Duplicate appointment booking",
         description="Two patients book the same doctor slot at the same time, "
                     "causing double booking.",
         category="Data integrity", probability=3, impact=4, owner="Krisha Mange",
         mitigation="Partial unique index on (doctor, date, time) for CONFIRMED "
                    "rows plus transactional insert; HTTP 409 on conflict.",
         contingency="Offer the patient the next free slot; reconcile manually.",
         control_status="Implemented", linked_requirement="REQ-BOOK-02",
         linked_verification="VER-BOOK-02"),
    dict(code="RISK-03", title="Invalid or misleading data entry",
         description="Out-of-range or malformed health readings corrupt logs "
                     "and charts.",
         category="Data integrity", probability=3, impact=3, owner="Krisha Mange",
         mitigation="Type and range validation on frontend and backend; "
                    "documented as technical input limits, not clinical advice.",
         contingency="Reject and explain the input; no partial writes.",
         control_status="Implemented", linked_requirement="REQ-LOG-01",
         linked_verification="VER-LOG-01"),
    dict(code="RISK-04", title="Database loss",
         description="The SQLite file is deleted or corrupted, losing all records.",
         category="Availability", probability=2, impact=4, owner="Krisha Mange",
         mitigation="File-backed SQLite kept in the project folder; explicit "
                    "backup command (app.backup) copying the database file.",
         contingency="Restore from the latest backup copy.",
         control_status="Planned", linked_requirement="REQ-DATA-01",
         linked_verification="VER-DATA-01"),
    dict(code="RISK-05", title="Development delay / resource shortage",
         description="A single student handles design, backend, frontend, "
                     "testing and documentation; illness or coursework could "
                     "delay delivery.",
         category="Schedule", probability=4, impact=3, owner="Krisha Mange",
         mitigation="Small scope, ordered implementation plan, 6h buffer in the "
                    "effort budget, plan against the earlier deadline (5 Oct).",
         contingency="Cut the lowest-priority polish items first; submit core "
                     "evidence on time.",
         control_status="Planned", linked_requirement=None,
         linked_verification=None),
    dict(code="RISK-06", title="Stale appointment reminders",
         description="Stored reminder records could drift out of sync with "
                     "appointments (moved/cancelled visits).",
         category="Data integrity", probability=2, impact=2, owner="Krisha Mange",
         mitigation="Reminders are computed live from confirmed appointments on "
                    "every request — nothing is stored, so nothing goes stale.",
         contingency="N/A — design removes the failure mode.",
         control_status="Implemented", linked_requirement="REQ-REM-01",
         linked_verification="VER-REM-01"),
]

SEED_TASKS = [
    dict(title="Finalize SRS and risk register", description="Requirements, "
         "scope, acceptance criteria and initial risk scores.", status="DONE",
         priority="High", risk_id=None, jira_key=None),
    dict(title="Implement auth + role guards", description="Sessions, CSRF, "
         "hashed passwords, RBAC on all endpoints.", status="DONE",
         priority="Critical", risk_id=1, jira_key=None),
    dict(title="Implement booking with duplicate-slot protection",
         description="Slots, transactions, partial unique index, 409 handling.",
         status="DONE", priority="Critical", risk_id=2, jira_key=None),
    dict(title="Implement health logs with validation", description="Create, "
         "list, filter, chart, delete with dual validation.", status="DONE",
         priority="High", risk_id=3, jira_key=None),
    dict(title="Doctor appointment management", description="Doctor list, "
         "complete/cancel transitions.", status="DONE", priority="High",
         risk_id=None, jira_key=None),
    dict(title="Risk workspace UI with heatmap", description="Register, matrix, "
         "metrics, filters.", status="DONE", priority="High", risk_id=None,
         jira_key=None),
    dict(title="Run full verification suite", description="pytest + manual "
         "checks; record real results in the traceability table.",
         status="IN_PROGRESS", priority="Critical", risk_id=None, jira_key=None),
    dict(title="JIRA backlog import + screenshots", description="Import "
         "docs/jira-backlog.csv and capture board evidence.", status="TODO",
         priority="High", risk_id=None, jira_key=None),
    dict(title="Final report, PPT and demo video", description="DOCX report, "
         "10-slide deck, 3–5 min demo recording for LinkedIn.", status="TODO",
         priority="High", risk_id=None, jira_key=None),
]

SEED_VERIFICATION = [
    dict(req_id="REQ-AUTH-01", req_text="Only the correct role can access its "
         "own data; wrong roles are rejected.", risk_code="RISK-01",
         control="Server sessions, CSRF tokens, per-endpoint role guards.",
         test_name="tests/test_authorization.py, tests/test_auth.py",
         expected="Login/logout enforced; cross-role and cross-patient access "
                  "denied with 401/403/404."),
    dict(req_id="REQ-BOOK-01", req_text="A patient can book a future in-clinic "
         "slot with a doctor.", risk_code=None,
         control="Slot generation from the live weekly roster; past slots rejected.",
         test_name="tests/test_appointments.py::test_valid_booking",
         expected="Booking created with status CONFIRMED."),
    dict(req_id="REQ-BOOK-02", req_text="A doctor's slot cannot have two active "
         "bookings (across patients, incl. concurrent requests).",
         risk_code="RISK-02",
         control="Partial unique index + transactional insert.",
         test_name="tests/test_appointments.py::test_duplicate_booking_by_other_patient, "
                   "::test_concurrent_booking_conflict",
         expected="One booking succeeds; the other receives HTTP 409."),
    dict(req_id="REQ-BOOK-03", req_text="Past dates/times are rejected.",
         risk_code=None, control="Server-side date validation against IST clock.",
         test_name="tests/test_appointments.py::test_past_slot_rejected",
         expected="HTTP 400 with a clear message."),
    dict(req_id="REQ-BOOK-04", req_text="Cancelling releases the slot for "
         "others to book.", risk_code=None,
         control="Cancellation sets CANCELLED; partial index ignores cancelled rows.",
         test_name="tests/test_appointments.py::test_cancellation_releases_slot",
         expected="After cancel, another patient books the same slot: 201."),
    dict(req_id="REQ-BOOK-05", req_text="Only the patient or treating doctor can "
         "change an appointment; only the doctor marks COMPLETED.",
         risk_code="RISK-01", control="Ownership + transition checks on PATCH.",
         test_name="tests/test_authorization.py::test_unauthorized_appointment_update",
         expected="Other users get 403; invalid transitions 400."),
    dict(req_id="REQ-LOG-01", req_text="Health logs accept only valid typed, "
         "in-range values; owners only.", risk_code="RISK-03",
         control="Dual frontend/backend validation; owner-scoped queries.",
         test_name="tests/test_health_logs.py",
         expected="Invalid payloads 400; valid ones persisted; cross-patient denied."),
    dict(req_id="REQ-RISK-01", req_text="Risk score = probability × impact with "
         "documented academic bands.", risk_code=None,
         control="Server-side computation; DB CHECK constraints (1–5).",
         test_name="tests/test_risks_tasks.py",
         expected="Out-of-range inputs 400; scores and bands computed correctly."),
    dict(req_id="REQ-DATA-01", req_text="Data persists across restarts in a "
         "file-backed SQLite database.", risk_code="RISK-04",
         control="File-backed database; explicit backup command.",
         test_name="tests/test_persistence.py",
         expected="Records survive engine disposal and app re-creation."),
    dict(req_id="REQ-REM-01", req_text="In-app reminders reflect upcoming "
         "confirmed appointments and can be marked read.", risk_code="RISK-06",
         control="Live computation from appointments (no stored copies).",
         test_name="tests/test_reminders.py",
         expected="Reminder list matches upcoming appointments; read flag works."),
]

SEED_MILESTONES = [
    dict(title="SRS, DDS and diagrams finalized", offset_days=6, status="Planned"),
    dict(title="Core backend (auth, booking, logs) working", offset_days=16,
         status="Planned"),
    dict(title="Frontend complete for all three roles", offset_days=24,
         status="Planned"),
    dict(title="Verification evidence recorded", offset_days=30, status="Planned"),
    dict(title="Written submission (report, PPT, JIRA evidence)", offset_days=32,
         status="Planned"),
]


def seed(verbose: bool = True) -> None:
    """Create seed records only when missing — safe to run repeatedly."""
    created = {"users": 0, "risks": 0, "tasks": 0, "verification": 0,
               "milestones": 0, "health_logs": 0}

    for spec in SEED_USERS:
        exists = db.session.execute(db.select(User).filter_by(email=spec["email"]))\
            .scalar_one_or_none()
        if exists is None:
            db.session.add(User(name=spec["name"], email=spec["email"],
                                password_hash=generate_password_hash(spec["password"]),
                                role=spec["role"], specialty=spec["specialty"]))
            created["users"] += 1

    for spec in SEED_RISKS:
        exists = db.session.execute(db.select(Risk).filter_by(code=spec["code"]))\
            .scalar_one_or_none()
        if exists is None:
            db.session.add(Risk(**spec, status="OPEN"))
            created["risks"] += 1

    if db.session.execute(db.select(db.func.count(Task.id))).scalar() == 0:
        for spec in SEED_TASKS:
            db.session.add(Task(owner="Krisha Mange", **spec))
        created["tasks"] = len(SEED_TASKS)

    if db.session.execute(db.select(db.func.count(VerificationRecord.id))).scalar() == 0:
        for spec in SEED_VERIFICATION:
            db.session.add(VerificationRecord(result="PENDING", kind="automated", **spec))
        created["verification"] = len(SEED_VERIFICATION)

    if db.session.execute(db.select(db.func.count(Milestone.id))).scalar() == 0:
        base = date.today()
        for spec in SEED_MILESTONES:
            db.session.add(Milestone(title=spec["title"], status=spec["status"],
                                     due_date=base + timedelta(days=spec["offset_days"]),
                                     notes=""))
        created["milestones"] = len(SEED_MILESTONES)

    # One small health-log sample for patient #1 only if none exist anywhere.
    if db.session.execute(db.select(db.func.count(HealthLog.id))).scalar() == 0:
        patient = db.session.execute(
            db.select(User).filter_by(email="aarav.shah@veyora.demo")
        ).scalar_one_or_none()
        if patient:
            db.session.add(HealthLog(patient_id=patient.id, type=LOG_HEART_RATE,
                                     value=72, note="Morning, resting"))
            db.session.add(HealthLog(patient_id=patient.id, type=LOG_TEMPERATURE,
                                     value=36.8, note=None))
            created["health_logs"] = 2

    db.session.commit()
    if verbose:
        print("Seed complete (idempotent) —", created)


def reset() -> None:
    """DEV ONLY: drop and recreate everything, then reseed."""
    db.drop_all()
    db.create_all()
    seed(verbose=True)
    print("Database was reset and reseeded.")


def main() -> None:
    app = create_app()
    with app.app_context():
        if "--reset" in sys.argv:
            confirm = input("This erases ALL local data. Type 'reset' to continue: ")
            if confirm.strip() == "reset":
                reset()
            else:
                print("Aborted.")
        else:
            seed()


if __name__ == "__main__":
    main()
