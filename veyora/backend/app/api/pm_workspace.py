"""Project-manager workspace: risks, tasks, milestones, verification, plan.

Access: PROJECT_MANAGER only. The PM manages the *project* — they have no
unrestricted access to patient health records through these endpoints.
"""
from datetime import date as date_cls
import math
from urllib.parse import urlparse

from flask import Blueprint, g, jsonify, request

from ..auth import require_role
from ..extensions import db
from ..models import (RISK_CATEGORIES, RISK_CLOSED, RISK_OPEN, RISK_STATUSES,
                      TASK_DONE, TASK_IN_PROGRESS, TASK_PRIORITIES, TASK_STATUSES,
                      TASK_TODO, VER_RESULTS, DeliveryPlan, Milestone, Risk, Task,
                      VerificationRecord, ROLE_PM, utcnow)
from ..schedule import today_ist

bp = Blueprint("pm", __name__, url_prefix="/api")


def _parse_date(value):
    if not value:
        return None
    try:
        return date_cls.fromisoformat(value)
    except ValueError:
        raise ValueError("Dates must use YYYY-MM-DD.")


# ---------------------------------------------------------------------------
# Risks
# ---------------------------------------------------------------------------

def _apply_risk_fields(risk: Risk, data: dict, partial: bool) -> str | None:
    if not partial or "title" in data:
        title = (data.get("title") or "").strip()
        if not title:
            return "Title is required."
        risk.title = title[:160]
    if not partial or "description" in data:
        risk.description = (data.get("description") or "").strip()
    if not partial or "category" in data:
        cat = data.get("category") or risk.category or "Schedule"
        if cat not in RISK_CATEGORIES:
            return f"category must be one of {', '.join(RISK_CATEGORIES)}."
        risk.category = cat
    for field in ("probability", "impact"):
        if not partial or field in data:
            raw = data.get(field)
            try:
                val = int(raw)
            except (TypeError, ValueError):
                return f"{field} must be an integer between 1 and 5."
            if not 1 <= val <= 5:
                return f"{field} must be between 1 and 5."
            setattr(risk, field, val)
    if not partial or "owner" in data:
        risk.owner = (data.get("owner") or risk.owner or "Krisha Mange").strip()[:120]
    if not partial or "mitigation" in data:
        risk.mitigation = (data.get("mitigation") or "").strip()
    if not partial or "contingency" in data:
        risk.contingency = (data.get("contingency") or "").strip()
    if not partial or "control_status" in data:
        cs = (data.get("control_status") or risk.control_status or "Planned").strip()
        if cs not in ("Planned", "Implemented", "Verified"):
            return "control_status must be Planned, Implemented or Verified."
        risk.control_status = cs
    if not partial or "review_date" in data:
        try:
            risk.review_date = _parse_date(data.get("review_date"))
        except ValueError as e:
            return str(e)
    for link_field in ("linked_requirement", "linked_task", "linked_verification"):
        if not partial or link_field in data:
            setattr(risk, link_field, (data.get(link_field) or "").strip()[:40] or None)
    if "status" in data:
        status = (data.get("status") or "").upper()
        if status not in RISK_STATUSES:
            return "status must be OPEN or CLOSED."
        risk.status = status
    return None


@bp.get("/risks")
@require_role(ROLE_PM)
def list_risks():
    q = db.select(Risk).order_by(Risk.code)
    status = (request.args.get("status") or "").upper()
    if status in RISK_STATUSES:
        q = q.where(Risk.status == status)
    category = request.args.get("category")
    if category in RISK_CATEGORIES:
        q = q.where(Risk.category == category)
    search = (request.args.get("q") or "").strip()
    if search:
        like = f"%{search}%"
        q = q.where(db.or_(Risk.title.ilike(like), Risk.description.ilike(like),
                           Risk.code.ilike(like)))
    rows = db.session.execute(q).scalars().all()
    open_rows = [r for r in db.session.execute(db.select(Risk)).scalars().all()
                 if r.status == RISK_OPEN]
    metrics = {
        "total": len(rows),
        "open": len(open_rows),
        "closed": sum(1 for r in rows if r.status == RISK_CLOSED),
        "critical": sum(1 for r in open_rows if r.score >= 17),
        "high": sum(1 for r in open_rows if 10 <= r.score <= 16),
        "moderate": sum(1 for r in open_rows if 5 <= r.score <= 9),
        "low": sum(1 for r in open_rows if r.score <= 4),
    }
    return jsonify(risks=[r.to_dict() for r in rows], metrics=metrics), 200


@bp.post("/risks")
@require_role(ROLE_PM)
def create_risk():
    data = request.get_json(silent=True) or {}
    last = db.session.execute(db.select(db.func.count(Risk.id))).scalar() or 0
    risk = Risk(code=f"RISK-{last + 1:02d}")
    err = _apply_risk_fields(risk, data, partial=False)
    if err:
        return jsonify(error="invalid", message=err), 400
    db.session.add(risk)
    db.session.commit()
    return jsonify(risk=risk.to_dict()), 201


@bp.patch("/risks/<int:risk_id>")
@require_role(ROLE_PM)
def update_risk(risk_id: int):
    risk = db.session.get(Risk, risk_id)
    if risk is None:
        return jsonify(error="not_found", message="Risk not found."), 404
    data = request.get_json(silent=True) or {}
    action = (data.get("action") or "").lower()
    if action == "close":
        risk.status = RISK_CLOSED
    elif action == "reopen":
        risk.status = RISK_OPEN
    else:
        err = _apply_risk_fields(risk, data, partial=True)
        if err:
            return jsonify(error="invalid", message=err), 400
    db.session.commit()
    return jsonify(risk=risk.to_dict()), 200


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------

@bp.get("/tasks")
@require_role(ROLE_PM)
def list_tasks():
    rows = db.session.execute(db.select(Task).order_by(Task.id)).scalars().all()
    return jsonify(tasks=[t.to_dict() for t in rows]), 200


@bp.post("/tasks")
@require_role(ROLE_PM)
def create_task():
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify(error="invalid", message="Title is required."), 400
    status = (data.get("status") or TASK_TODO).upper()
    if status not in TASK_STATUSES:
        return jsonify(error="invalid", message="Invalid status."), 400
    priority = data.get("priority") or "Medium"
    if priority not in TASK_PRIORITIES:
        return jsonify(error="invalid", message="Invalid priority."), 400
    risk_id = data.get("risk_id")
    if risk_id is not None:
        risk_id = int(risk_id)
        if db.session.get(Risk, risk_id) is None:
            return jsonify(error="invalid", message="Linked risk does not exist."), 400
    task = Task(title=title[:160], description=(data.get("description") or "").strip(),
                status=status, priority=priority,
                owner=(data.get("owner") or "Krisha Mange").strip()[:120],
                risk_id=risk_id, jira_key=(data.get("jira_key") or "").strip()[:20] or None,
                jira_url=(data.get("jira_url") or "").strip()[:200] or None)
    db.session.add(task)
    db.session.commit()
    return jsonify(task=task.to_dict()), 201


@bp.patch("/tasks/<int:task_id>")
@require_role(ROLE_PM)
def update_task(task_id: int):
    task = db.session.get(Task, task_id)
    if task is None:
        return jsonify(error="not_found", message="Task not found."), 404
    data = request.get_json(silent=True) or {}
    if "status" in data:
        status = (data.get("status") or "").upper()
        if status not in TASK_STATUSES:
            return jsonify(error="invalid", message="Invalid status."), 400
        task.status = status
    if "priority" in data and data["priority"] in TASK_PRIORITIES:
        task.priority = data["priority"]
    if "title" in data:
        title = (data.get("title") or "").strip()
        if not title:
            return jsonify(error="invalid", message="Title cannot be empty."), 400
        task.title = title[:160]
    if "description" in data:
        task.description = (data.get("description") or "").strip()
    if "jira_key" in data:
        task.jira_key = (data.get("jira_key") or "").strip()[:20] or None
    if "jira_url" in data:
        task.jira_url = (data.get("jira_url") or "").strip()[:200] or None
    db.session.commit()
    return jsonify(task=task.to_dict()), 200


# ---------------------------------------------------------------------------
# Milestones
# ---------------------------------------------------------------------------

@bp.get("/milestones")
@require_role(ROLE_PM)
def list_milestones():
    rows = db.session.execute(db.select(Milestone).order_by(Milestone.due_date)).scalars().all()
    return jsonify(milestones=[m.to_dict() for m in rows]), 200


@bp.patch("/milestones/<int:ms_id>")
@require_role(ROLE_PM)
def update_milestone(ms_id: int):
    milestone = db.session.get(Milestone, ms_id)
    if milestone is None:
        return jsonify(error="not_found", message="Milestone not found."), 404
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="invalid", message="A JSON object is required."), 400
    status = data.get("status", milestone.status)
    if status not in ("Planned", "In progress", "Done"):
        return jsonify(error="invalid", message="Invalid milestone status."), 400
    raw_date = data.get("due_date", milestone.due_date.isoformat())
    try:
        if not isinstance(raw_date, str):
            raise ValueError()
        due_date = date_cls.fromisoformat(raw_date)
    except ValueError:
        return jsonify(error="invalid", message="Enter a valid due date."), 400
    notes = data.get("notes", milestone.notes)
    if not isinstance(notes, str) or len(notes.strip()) > 280:
        return jsonify(
            error="invalid",
            message="Notes must contain at most 280 characters."
        ), 400
    milestone.status = status
    milestone.due_date = due_date
    milestone.notes = notes.strip()
    db.session.commit()
    return jsonify(milestone=milestone.to_dict()), 200


# ---------------------------------------------------------------------------
# Verification & traceability
# ---------------------------------------------------------------------------

@bp.get("/verification")
@require_role(ROLE_PM)
def list_verification():
    rows = db.session.execute(db.select(VerificationRecord).order_by(VerificationRecord.req_id))\
        .scalars().all()
    return jsonify(records=[r.to_dict() for r in rows]), 200


@bp.post("/verification/<int:rec_id>/record")
@require_role(ROLE_PM)
def record_result(rec_id: int):
    record = db.session.get(VerificationRecord, rec_id)
    if record is None:
        return jsonify(error="not_found", message="Test record not found."), 404
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="invalid", message="A JSON object is required."), 400
    result = data.get("result")
    if result not in ("PENDING", "PASS", "FAIL"):
        return jsonify(error="invalid", message="Invalid test result."), 400
    kind = data.get("kind", record.kind)
    if kind not in ("automated", "manual"):
        return jsonify(error="invalid", message="Invalid evidence kind."), 400
    run_date = None
    evidence = None
    if result != "PENDING":
        raw_date = data.get("run_date")
        try:
            if not isinstance(raw_date, str):
                raise ValueError()
            run_date = date_cls.fromisoformat(raw_date)
        except ValueError:
            return jsonify(
                error="invalid",
                message="Enter the actual test date."
            ), 400
        if run_date > today_ist():
            return jsonify(
                error="invalid",
                message="Test date cannot be in the future."
            ), 400
        raw_evidence = data.get("evidence_source", "")
        if not isinstance(raw_evidence, str) or not raw_evidence.strip():
            return jsonify(
                error="invalid",
                message="Evidence reference is required for completed tests."
            ), 400
        evidence = raw_evidence.strip()
        if len(evidence) > 280:
            return jsonify(
                error="invalid",
                message="Evidence reference must contain at most 280 characters."
            ), 400
    record.result = result
    record.kind = kind
    record.run_date = run_date
    record.evidence_source = evidence
    db.session.commit()
    return jsonify(record=record.to_dict()), 200


# ---------------------------------------------------------------------------
# Plan (objectives, scope, WBS, effort) + DB-derived metrics
# ---------------------------------------------------------------------------

@bp.get("/plan")
@require_role(ROLE_PM)
def get_plan():
    tasks = db.session.execute(db.select(Task)).scalars().all()
    risks = [r for r in db.session.execute(db.select(Risk)).scalars().all()
             if r.status == RISK_OPEN]
    milestones = db.session.execute(db.select(Milestone).order_by(Milestone.due_date))\
        .scalars().all()
    verification = db.session.execute(db.select(VerificationRecord)).scalars().all()
    return jsonify(
        objectives=[
            "Deliver a working, risk-aware smart healthcare prototype (VEYORA).",
            "Implement appointment booking with real concurrency-safe conflict handling.",
            "Keep patient data access strictly role-scoped and session-secure.",
            "Produce verifiable evidence: automated tests, diagrams, SRS/DDS, report.",
        ],
        in_scope=[
            "Authentication and role-based access (patient, doctor, project manager)",
            "In-clinic appointment booking, cancellation, doctor status updates",
            "Personal health logs (heart rate, temperature, blood pressure)",
            "In-app appointment reminders",
            "Risk register with 5×5 heatmap and traceability",
            "Lightweight plan, task board and verification views",
        ],
        out_of_scope=[
            "Video consultations", "Prescriptions and medication advice", "Payments",
            "SMS / email / WhatsApp / push delivery", "AI diagnosis", "Offline sync",
            "Hospital system integrations", "Complex administrative management",
        ],
        work_breakdown=[
            {"phase": "Requirements & risk planning", "estimated_hours": 8},
            {"phase": "Design (UI reference, SRS/DDS, diagrams)", "estimated_hours": 10},
            {"phase": "Backend: auth, appointments, logs, risks", "estimated_hours": 18},
            {"phase": "Frontend: app shell & role views", "estimated_hours": 16},
            {"phase": "Testing & fixes", "estimated_hours": 8},
            {"phase": "Report, JIRA package, presentation", "estimated_hours": 10},
        ],
        effort={"estimated_total_hours": 70,
                "available_hours_per_week": 14,
                "weeks_available": 5,
                "planned_buffer_hours": 6,
                "actual_hours": None},  # actuals are filled only when really worked
        risks_open=len(risks),
        risks_critical_or_high=sum(1 for r in risks if r.score >= 10),
        contingency_note=("Contingency time is reserved against open High/Critical "
                          "risks; see the risk register for current scores."),
        milestones=[m.to_dict() for m in milestones],
        task_progress={"todo": sum(1 for t in tasks if t.status == TASK_TODO),
                       "in_progress": sum(1 for t in tasks if t.status == TASK_IN_PROGRESS),
                       "done": sum(1 for t in tasks if t.status == TASK_DONE)},
        verification_progress={
            "total": len(verification),
            "passed": sum(1 for v in verification if v.result == "PASS"),
            "failed": sum(1 for v in verification if v.result == "FAIL"),
            "pending": sum(1 for v in verification if v.result == "PENDING"),
        },
    ), 200


@bp.get("/delivery-plan")
@require_role(ROLE_PM)
def get_delivery_plan():
    plan = db.session.get(DeliveryPlan, 1)
    return jsonify(plan=plan.to_dict() if plan else None), 200


@bp.put("/delivery-plan")
@require_role(ROLE_PM)
def save_delivery_plan():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="invalid", message="A JSON object is required."), 400

    raw_deadline = data.get("deadline")
    try:
        if not isinstance(raw_deadline, str):
            raise ValueError()
        deadline = date_cls.fromisoformat(raw_deadline)
    except ValueError:
        return jsonify(error="invalid", message="Enter a valid deadline date."), 400

    numbers = {}
    for field in ("available_hours", "remaining_hours", "buffer_hours"):
        value = data.get(field)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return jsonify(
                error="invalid",
                message=f"{field} must be a number."
            ), 400
        if not math.isfinite(value) or not 0 <= value <= 10000:
            return jsonify(
                error="invalid",
                message=f"{field} must be between 0 and 10,000."
            ), 400
        numbers[field] = float(value)

    jira_url = data.get("jira_url", "")
    if not isinstance(jira_url, str):
        return jsonify(error="invalid", message="Invalid Jira URL."), 400
    jira_url = jira_url.strip()
    if len(jira_url) > 500:
        return jsonify(error="invalid", message="Jira URL is too long."), 400
    if jira_url:
        try:
            parsed = urlparse(jira_url)
            valid = (
                parsed.scheme == "https"
                and bool(parsed.hostname)
                and not parsed.username
                and not parsed.password
                and not any(char.isspace() for char in jira_url)
            )
        except ValueError:
            valid = False
        if not valid:
            return jsonify(
                error="invalid",
                message="Enter a complete HTTPS Jira project or board URL."
            ), 400

    plan = db.session.get(DeliveryPlan, 1)
    if plan is None:
        plan = DeliveryPlan(id=1)
        db.session.add(plan)
    plan.deadline = deadline
    plan.available_hours = numbers["available_hours"]
    plan.remaining_hours = numbers["remaining_hours"]
    plan.buffer_hours = numbers["buffer_hours"]
    plan.jira_url = jira_url
    plan.updated_at = utcnow()
    db.session.commit()
    return jsonify(plan=plan.to_dict()), 200
