"""In-app appointment reminders.

Derived live from upcoming CONFIRMED appointments — nothing is stored or
scheduled, so reminders can never go stale. No SMS/email/push delivery.
"""
from datetime import timedelta

from flask import Blueprint, current_app, g, jsonify

from ..auth import require_role
from ..extensions import db
from ..models import (APPT_CONFIRMED, Appointment, ReminderRead, ROLE_PATIENT,
                      utcnow)
from ..schedule import today_ist

bp = Blueprint("reminders", __name__, url_prefix="/api/reminders")


@bp.get("")
@require_role(ROLE_PATIENT)
def list_reminders():
    window = current_app.config["REMINDER_WINDOW_DAYS"]
    today = today_ist()
    rows = db.session.execute(
        db.select(Appointment).where(
            Appointment.patient_id == g.user.id,
            Appointment.status == APPT_CONFIRMED,
            Appointment.date >= today,
            Appointment.date <= today + timedelta(days=window),
        ).order_by(Appointment.date, Appointment.start_time)
    ).scalars().all()
    read_ids = {r.appointment_id for r in db.session.execute(
        db.select(ReminderRead).where(ReminderRead.user_id == g.user.id)
    ).scalars().all()}
    reminders = [{
        "appointment_id": a.id,
        "date": a.date.isoformat(),
        "start_time": a.start_time,
        "doctor": {"id": a.doctor.id, "name": a.doctor.name} if a.doctor else None,
        "read": a.id in read_ids,
    } for a in rows]
    return jsonify(reminders=reminders,
                   note="In-app appointment reminders only. No SMS, email or "
                        "push notifications are sent."), 200


@bp.post("/<int:appt_id>/read")
@require_role(ROLE_PATIENT)
def mark_read(appt_id: int):
    appt = db.session.get(Appointment, appt_id)
    if appt is None or appt.patient_id != g.user.id:
        return jsonify(error="not_found", message="Reminder not found."), 404
    existing = db.session.get(ReminderRead, (g.user.id, appt_id))
    if existing is None:
        db.session.add(ReminderRead(user_id=g.user.id, appointment_id=appt_id,
                                    read_at=utcnow()))
        db.session.commit()
    return jsonify(ok=True), 200
