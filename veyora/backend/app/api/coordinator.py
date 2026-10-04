"""Clinic Coordinator API blueprint.

Access: PROJECT_MANAGER only (displayed as Clinic Coordinator).
Provides operational clinic overview, privacy-safe appointment monitoring,
incident management with audit activity, and real Jira Cloud integration.
Coordinator responses strictly exclude patient medical readings and clinical notes.
"""
from __future__ import annotations

from datetime import date as date_cls
from typing import Any

from flask import Blueprint, g, jsonify, request
from sqlalchemy import or_

from ..auth import require_role
from ..extensions import db
from ..jira_service import (
    create_issue,
    get_jira_config,
    refresh_issue_status,
    test_connection,
    verify_and_get_issue,
)
from ..models import (
    APPT_CANCELLED,
    APPT_COMPLETED,
    APPT_CONFIRMED,
    INCIDENT_CATEGORIES,
    INCIDENT_PRIORITIES,
    INCIDENT_STATUS_IN_PROGRESS,
    INCIDENT_STATUS_OPEN,
    INCIDENT_STATUS_RESOLVED,
    INCIDENT_STATUSES,
    Appointment,
    Incident,
    IncidentActivity,
    Risk,
    ROLE_DOCTOR,
    ROLE_PM,
    User,
    iso_utc,
    utcnow,
)
from ..schedule import today_ist

bp = Blueprint("coordinator", __name__, url_prefix="/api/coordinator")


# ---------------------------------------------------------------------------
# 1. Clinic Overview Dashboard
# ---------------------------------------------------------------------------

@bp.get("/overview")
@require_role(ROLE_PM)
def clinic_overview():
    """Operational dashboard for today's clinic appointments and active incidents."""
    today = today_ist()

    # Load today's appointments
    today_appts = db.session.execute(
        db.select(Appointment)
        .where(Appointment.date == today)
        .order_by(Appointment.start_time, Appointment.id)
    ).scalars().all()

    # Mutually exclusive status breakdown
    count_total = len(today_appts)
    count_completed = 0
    count_cancelled = 0
    count_in_progress = 0
    count_confirmed = 0

    schedule_list: list[dict[str, Any]] = []

    for a in today_appts:
        cons = a.consultation
        is_in_progress = (
            a.status == APPT_CONFIRMED
            and cons is not None
            and cons.started_at is not None
            and cons.completed_at is None
        )

        if a.status == APPT_COMPLETED:
            count_completed += 1
            wf_status = "COMPLETED"
        elif a.status == APPT_CANCELLED:
            count_cancelled += 1
            wf_status = "CANCELLED"
        elif is_in_progress:
            count_in_progress += 1
            wf_status = "IN_PROGRESS"
        else:
            count_confirmed += 1
            wf_status = "CONFIRMED"

        # Explicit minimal schema: NO patient identity or clinical content
        schedule_list.append({
            "id": a.id,
            "reference": f"APT-{a.id:04d}",
            "start_time": a.start_time,
            "doctor_id": a.doctor_id,
            "doctor_name": a.doctor.name if a.doctor else "Unknown",
            "doctor_specialty": a.doctor.specialty if a.doctor else "",
            "status": a.status,
            "workflow_status": wf_status,
        })

    # Incidents metrics & high/critical active alerts
    active_incidents = db.session.execute(
        db.select(Incident)
        .where(Incident.status.in_([INCIDENT_STATUS_OPEN, INCIDENT_STATUS_IN_PROGRESS]))
        .order_by(Incident.created_at.desc())
    ).scalars().all()

    count_open_incidents = len(active_incidents)

    critical_incidents = [
        inc.to_dict()
        for inc in active_incidents
        if inc.priority in ("High", "Critical")
    ]

    return jsonify(
        today=today.isoformat(),
        metrics={
            "total_today": count_total,
            "confirmed_today": count_confirmed,
            "in_progress_today": count_in_progress,
            "completed_today": count_completed,
            "cancelled_today": count_cancelled,
            "open_incidents": count_open_incidents,
        },
        schedule=schedule_list,
        urgent_incidents=critical_incidents,
    ), 200


# ---------------------------------------------------------------------------
# 2. Appointment Monitor (Privacy-Safe)
# ---------------------------------------------------------------------------

@bp.get("/appointments")
@require_role(ROLE_PM)
def appointment_monitor():
    """Operational booking list with filters.
    
    Zero medical exposure: does not serialize patient names, emails,
    health readings, or consultation summaries.
    """
    query = db.select(Appointment).order_by(
        Appointment.date.desc(), Appointment.start_time.asc(), Appointment.id.desc()
    )

    date_str = (request.args.get("date") or "").strip()
    if date_str:
        try:
            filter_date = date_cls.fromisoformat(date_str)
            query = query.where(Appointment.date == filter_date)
        except ValueError:
            return jsonify(error="invalid", message="Use YYYY-MM-DD for date filter."), 400

    doc_id_str = (request.args.get("doctor_id") or "").strip()
    if doc_id_str and doc_id_str.isdigit():
        query = query.where(Appointment.doctor_id == int(doc_id_str))

    status_str = (request.args.get("status") or "").strip().upper()
    if status_str in (APPT_CONFIRMED, APPT_COMPLETED, APPT_CANCELLED):
        query = query.where(Appointment.status == status_str)

    search = (request.args.get("q") or "").strip()
    if search:
        # Search by reference number e.g. APT-0004 or 4
        clean_num = search.upper().replace("APT-", "").strip().lstrip("0")
        if clean_num.isdigit():
            query = query.where(
                or_(
                    Appointment.id == int(clean_num),
                    Appointment.doctor.has(User.name.ilike(f"%{search}%")),
                )
            )
        else:
            query = query.where(Appointment.doctor.has(User.name.ilike(f"%{search}%")))

    rows = db.session.execute(query).scalars().all()

    items = []
    for a in rows:
        cons = a.consultation
        if a.status == APPT_COMPLETED:
            wf_status = "COMPLETED"
        elif a.status == APPT_CANCELLED:
            wf_status = "CANCELLED"
        elif cons and cons.started_at and not cons.completed_at:
            wf_status = "IN_PROGRESS"
        else:
            wf_status = "CONFIRMED"

        # Explicit minimal fields
        items.append({
            "id": a.id,
            "reference": f"APT-{a.id:04d}",
            "doctor_id": a.doctor_id,
            "doctor_name": a.doctor.name if a.doctor else "Unknown",
            "doctor_specialty": a.doctor.specialty if a.doctor else "",
            "date": a.date.isoformat(),
            "start_time": a.start_time,
            "status": a.status,
            "workflow_status": wf_status,
            "created_at": iso_utc(a.created_at),
        })

    return jsonify(appointments=items), 200


@bp.get("/doctors")
@require_role(ROLE_PM)
def list_doctors_for_coordinator():
    """List doctors for appointment filters."""
    rows = db.session.execute(
        db.select(User).filter_by(role=ROLE_DOCTOR).order_by(User.name)
    ).scalars().all()
    return jsonify(
        doctors=[
            {"id": d.id, "name": d.name, "specialty": d.specialty or ""}
            for d in rows
        ]
    ), 200


# ---------------------------------------------------------------------------
# 3. Incident Management & History
# ---------------------------------------------------------------------------

@bp.get("/incidents")
@require_role(ROLE_PM)
def list_incidents():
    """List operational incidents with optional filtering."""
    query = db.select(Incident).order_by(Incident.created_at.desc())

    status = (request.args.get("status") or "").strip()
    if status in INCIDENT_STATUSES:
        query = query.where(Incident.status == status)

    priority = (request.args.get("priority") or "").strip()
    if priority in INCIDENT_PRIORITIES:
        query = query.where(Incident.priority == priority)

    category = (request.args.get("category") or "").strip()
    if category in INCIDENT_CATEGORIES:
        query = query.where(Incident.category == category)

    search = (request.args.get("q") or "").strip()
    if search:
        like = f"%{search}%"
        query = query.where(
            or_(
                Incident.title.ilike(like),
                Incident.description.ilike(like),
                Incident.reference.ilike(like),
            )
        )

    rows = db.session.execute(query).scalars().all()
    return jsonify(incidents=[r.to_dict() for r in rows]), 200


@bp.post("/incidents")
@require_role(ROLE_PM)
def create_incident():
    """Report a new operational incident.
    
    Reporter identity is strictly assigned from the authenticated session.
    """
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="invalid", message="A JSON object is required."), 400

    title = (data.get("title") or "").strip()
    if not title:
        return jsonify(error="invalid", message="Title is required."), 400
    if len(title) > 160:
        return jsonify(error="invalid", message="Title must be 160 characters or fewer."), 400

    category = data.get("category", "Other")
    if category not in INCIDENT_CATEGORIES:
        return jsonify(
            error="invalid",
            message=f"Category must be one of: {', '.join(INCIDENT_CATEGORIES)}.",
        ), 400

    priority = data.get("priority", "Medium")
    if priority not in INCIDENT_PRIORITIES:
        return jsonify(
            error="invalid",
            message=f"Priority must be one of: {', '.join(INCIDENT_PRIORITIES)}.",
        ), 400

    description = (data.get("description") or "").strip()

    # Validate optional linked appointment
    appt_id = data.get("appointment_id")
    if appt_id not in (None, ""):
        try:
            appt_id = int(appt_id)
        except (TypeError, ValueError):
            return jsonify(error="invalid", message="Invalid appointment ID."), 400
        if db.session.get(Appointment, appt_id) is None:
            return jsonify(error="invalid", message="Linked appointment not found."), 400
    else:
        appt_id = None

    # Validate optional linked risk
    risk_id = data.get("risk_id")
    if risk_id not in (None, ""):
        try:
            risk_id = int(risk_id)
        except (TypeError, ValueError):
            return jsonify(error="invalid", message="Invalid risk ID."), 400
        if db.session.get(Risk, risk_id) is None:
            return jsonify(error="invalid", message="Linked risk not found."), 400
    else:
        risk_id = None

    # Generate sequential incident reference
    max_id = db.session.execute(db.select(db.func.max(Incident.id))).scalar() or 0
    ref = f"INC-{max_id + 1:02d}"

    incident = Incident(
        reference=ref,
        title=title,
        category=category,
        description=description,
        priority=priority,
        status=INCIDENT_STATUS_OPEN,
        appointment_id=appt_id,
        risk_id=risk_id,
        reported_by_id=g.user.id,  # From session
    )
    db.session.add(incident)
    db.session.flush()

    # Audit log
    activity = IncidentActivity(
        incident_id=incident.id,
        actor_id=g.user.id,
        action="REPORTED",
        details=f"Incident reported with priority {priority} in category {category}.",
    )
    db.session.add(activity)
    db.session.commit()

    return jsonify(incident=incident.to_dict(include_activities=True)), 201


@bp.get("/incidents/<int:inc_id>")
@require_role(ROLE_PM)
def get_incident(inc_id: int):
    """Retrieve full incident details including activity history."""
    incident = db.session.get(Incident, inc_id)
    if incident is None:
        return jsonify(error="not_found", message="Incident not found."), 404
    return jsonify(incident=incident.to_dict(include_activities=True)), 200


@bp.patch("/incidents/<int:inc_id>")
@require_role(ROLE_PM)
def update_incident(inc_id: int):
    """Update incident status or metadata with validated transitions and audit logging."""
    incident = db.session.get(Incident, inc_id)
    if incident is None:
        return jsonify(error="not_found", message="Incident not found."), 404

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="invalid", message="A JSON object is required."), 400

    target_status = data.get("status")
    resolution_note = data.get("resolution_note")

    # Transition to Resolved
    if target_status == INCIDENT_STATUS_RESOLVED:
        if not resolution_note or not isinstance(resolution_note, str) or not resolution_note.strip():
            return jsonify(
                error="invalid",
                message="A resolution note is required when resolving an incident.",
            ), 400
        clean_note = resolution_note.strip()
        incident.status = INCIDENT_STATUS_RESOLVED
        incident.resolution_note = clean_note
        incident.resolved_at = utcnow()

        activity = IncidentActivity(
            incident_id=incident.id,
            actor_id=g.user.id,
            action="RESOLVED",
            details=f"Resolved with note: {clean_note[:200]}",
        )
        db.session.add(activity)

    # Transition to In progress
    elif target_status == INCIDENT_STATUS_IN_PROGRESS:
        if incident.status == INCIDENT_STATUS_RESOLVED:
            return jsonify(
                error="invalid",
                message="Cannot move directly from Resolved to In progress. Reopen the incident first.",
            ), 400
        incident.status = INCIDENT_STATUS_IN_PROGRESS
        activity = IncidentActivity(
            incident_id=incident.id,
            actor_id=g.user.id,
            action="STATUS_CHANGED",
            details="Status changed to In progress.",
        )
        db.session.add(activity)

    # Reopening a resolved incident
    elif target_status == INCIDENT_STATUS_OPEN:
        reopen_reason = (data.get("reopen_reason") or "Reopened for further review").strip()
        incident.status = INCIDENT_STATUS_OPEN
        incident.resolved_at = None
        activity = IncidentActivity(
            incident_id=incident.id,
            actor_id=g.user.id,
            action="REOPENED",
            details=reopen_reason[:200],
        )
        db.session.add(activity)

    # Metadata edits
    if "title" in data:
        new_title = (data["title"] or "").strip()
        if not new_title:
            return jsonify(error="invalid", message="Title cannot be empty."), 400
        incident.title = new_title[:160]

    if "description" in data:
        incident.description = (data["description"] or "").strip()

    if "category" in data and data["category"] in INCIDENT_CATEGORIES:
        incident.category = data["category"]

    if "priority" in data and data["priority"] in INCIDENT_PRIORITIES:
        if incident.priority != data["priority"]:
            old_p = incident.priority
            incident.priority = data["priority"]
            db.session.add(
                IncidentActivity(
                    incident_id=incident.id,
                    actor_id=g.user.id,
                    action="PRIORITY_CHANGED",
                    details=f"Priority changed from {old_p} to {incident.priority}.",
                )
            )

    incident.updated_at = utcnow()
    db.session.commit()

    return jsonify(incident=incident.to_dict(include_activities=True)), 200


# ---------------------------------------------------------------------------
# 4. Jira Cloud Integration Endpoints
# ---------------------------------------------------------------------------

@bp.get("/jira/status")
@require_role(ROLE_PM)
def jira_connection_status():
    """Test and verify Jira Cloud connectivity without exposing credentials."""
    result = test_connection()
    return jsonify(status=result), 200


@bp.post("/jira/create-issue")
@require_role(ROLE_PM)
def jira_create_issue():
    """Create a linked Jira issue for a Risk or Incident."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="invalid", message="A JSON object is required."), 400

    entity_type = (data.get("entity_type") or "").strip().lower()
    entity_id = data.get("entity_id")

    if entity_type not in ("risk", "incident") or not str(entity_id).isdigit():
        return jsonify(
            error="invalid", message="entity_type ('risk' or 'incident') and entity_id are required."
        ), 400

    entity_id = int(entity_id)
    if entity_type == "risk":
        entity = db.session.get(Risk, entity_id)
        default_type = "Task"
    else:
        entity = db.session.get(Incident, entity_id)
        default_type = "Bug" if getattr(entity, "category", "") == "Data accuracy" else "Task"

    if entity is None:
        return jsonify(error="not_found", message=f"{entity_type.capitalize()} not found."), 404

    # Duplicate check: enforce one active Jira link
    if entity.jira_key:
        return jsonify(
            error="already_linked",
            message=f"This {entity_type} is already linked to Jira issue {entity.jira_key}.",
        ), 409

    summary = (data.get("summary") or f"[VEYORA: {getattr(entity, 'code', getattr(entity, 'reference', ''))}] {entity.title}").strip()
    description = (data.get("description") or entity.description or "Created from VEYORA Clinic Coordinator.").strip()
    issue_type = (data.get("issue_type") or default_type).strip()

    concurrency_key = f"{entity_type}-{entity_id}"
    jira_info, err = create_issue(
        entity_key=concurrency_key,
        summary=summary,
        description=description,
        issue_type=issue_type,
    )

    if err or not jira_info:
        return jsonify(error="jira_error", message=err or "Failed to create Jira issue."), 400

    # Save reference
    entity.jira_id = jira_info["jira_id"]
    entity.jira_key = jira_info["jira_key"]
    entity.jira_url = jira_info["jira_url"]
    entity.jira_status = jira_info["jira_status"]
    entity.jira_updated_at = utcnow()

    if entity_type == "incident":
        db.session.add(
            IncidentActivity(
                incident_id=entity.id,
                actor_id=g.user.id,
                action="JIRA_CREATED",
                details=f"Created Jira issue {entity.jira_key} ({entity.jira_status}).",
            )
        )

    db.session.commit()
    return jsonify(entity=entity.to_dict()), 201


@bp.post("/jira/link-issue")
@require_role(ROLE_PM)
def jira_link_issue():
    """Link an existing verified Jira issue key to a Risk or Incident."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="invalid", message="A JSON object is required."), 400

    entity_type = (data.get("entity_type") or "").strip().lower()
    entity_id = data.get("entity_id")
    jira_key = (data.get("jira_key") or "").strip().upper()

    if entity_type not in ("risk", "incident") or not str(entity_id).isdigit() or not jira_key:
        return jsonify(
            error="invalid", message="entity_type, entity_id and valid jira_key are required."
        ), 400

    entity_id = int(entity_id)
    entity = db.session.get(Risk if entity_type == "risk" else Incident, entity_id)
    if entity is None:
        return jsonify(error="not_found", message=f"{entity_type.capitalize()} not found."), 404

    # Verify through Jira API that the issue exists in the configured project
    issue_info, err = verify_and_get_issue(jira_key)
    if err or not issue_info:
        return jsonify(error="invalid_issue", message=err or f"Issue {jira_key} not found."), 400

    entity.jira_id = issue_info["jira_id"]
    entity.jira_key = issue_info["jira_key"]
    entity.jira_url = issue_info["jira_url"]
    entity.jira_status = issue_info["jira_status"]
    entity.jira_updated_at = utcnow()

    if entity_type == "incident":
        db.session.add(
            IncidentActivity(
                incident_id=entity.id,
                actor_id=g.user.id,
                action="JIRA_LINKED",
                details=f"Linked to verified Jira issue {entity.jira_key} ({entity.jira_status}).",
            )
        )

    db.session.commit()
    return jsonify(entity=entity.to_dict()), 200


@bp.post("/jira/refresh-status")
@require_role(ROLE_PM)
def jira_refresh_status():
    """Refresh the current status of a linked Jira issue."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="invalid", message="A JSON object is required."), 400

    entity_type = (data.get("entity_type") or "").strip().lower()
    entity_id = data.get("entity_id")

    if entity_type not in ("risk", "incident") or not str(entity_id).isdigit():
        return jsonify(error="invalid", message="entity_type and entity_id are required."), 400

    entity_id = int(entity_id)
    entity = db.session.get(Risk if entity_type == "risk" else Incident, entity_id)
    if entity is None:
        return jsonify(error="not_found", message=f"{entity_type.capitalize()} not found."), 404

    if not entity.jira_key:
        return jsonify(error="not_linked", message=f"This {entity_type} does not have a linked Jira issue."), 400

    new_status, err = refresh_issue_status(entity.jira_key)
    if err or not new_status:
        return jsonify(error="jira_error", message=err or "Unable to refresh Jira status."), 400

    old_status = entity.jira_status
    entity.jira_status = new_status
    entity.jira_updated_at = utcnow()

    if entity_type == "incident" and old_status != new_status:
        db.session.add(
            IncidentActivity(
                incident_id=entity.id,
                actor_id=g.user.id,
                action="JIRA_STATUS_UPDATED",
                details=f"Jira issue {entity.jira_key} status updated from {old_status} to {new_status}.",
            )
        )

    db.session.commit()
    return jsonify(entity=entity.to_dict()), 200
