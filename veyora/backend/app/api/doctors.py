from datetime import date as date_cls
from datetime import timedelta

from flask import Blueprint, g, jsonify, request

from ..auth import require_auth, require_role
from ..extensions import db
from ..models import APPT_CONFIRMED, Appointment, ROLE_DOCTOR, ROLE_PATIENT, User
from ..schedule import is_slot_bookable, slots_for, today_ist, works_on

bp = Blueprint("doctors", __name__, url_prefix="/api/doctors")


@bp.get("")
@require_role(ROLE_PATIENT)
def list_doctors():
    from flask import current_app
    rows = db.session.execute(
        db.select(User).filter_by(role=ROLE_DOCTOR).order_by(User.name)
    ).scalars().all()
    horizon = current_app.config["BOOKING_HORIZON_DAYS"]
    today = today_ist()
    out = []
    for d in rows:
        days = [(today + timedelta(days=i)) for i in range(1, horizon + 1)]
        out.append({
            "id": d.id, "name": d.name, "specialty": d.specialty,
            "working_days": [day.isoformat() for day in days if works_on(d.name, day)],
        })
    return jsonify(doctors=out), 200


@bp.get("/<int:doctor_id>/slots")
@require_role(ROLE_PATIENT)
def slots(doctor_id: int):
    """Slot availability for a date. Never exposes other patients' identities."""
    from flask import current_app
    doctor = db.session.get(User, doctor_id)
    if doctor is None or doctor.role != ROLE_DOCTOR:
        return jsonify(error="not_found", message="Doctor not found."), 404

    raw = request.args.get("date", "")
    try:
        day = date_cls.fromisoformat(raw)
    except ValueError:
        return jsonify(error="invalid", message="Use date format YYYY-MM-DD."), 400

    horizon = current_app.config["BOOKING_HORIZON_DAYS"]
    today = today_ist()
    if day < today or day > today + timedelta(days=horizon):
        return jsonify(error="invalid",
                       message="Choose a date between tomorrow and "
                               f"{horizon} days from today."), 400

    taken = set(db.session.execute(
        db.select(Appointment.start_time).where(
            Appointment.doctor_id == doctor.id,
            Appointment.date == day,
            Appointment.status == APPT_CONFIRMED,
        )
    ).scalars().all())

    lead = current_app.config["BOOKING_LEAD_MINUTES"]
    slot_list = []
    for st in slots_for(doctor.name, day):
        bookable, _reason = is_slot_bookable(doctor.name, day, st, horizon, lead)
        slot_list.append({"time": st, "available": bookable and st not in taken})
    return jsonify(doctor={"id": doctor.id, "name": doctor.name,
                           "specialty": doctor.specialty},
                   date=day.isoformat(), slots=slot_list), 200
