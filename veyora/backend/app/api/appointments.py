from datetime import date as date_cls, datetime, time

from flask import Blueprint, current_app, g, jsonify, request
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError

from ..auth import require_role
from ..extensions import db
from ..models import (
    APPT_CANCELLED,
    APPT_COMPLETED,
    APPT_CONFIRMED,
    Appointment,
    Consultation,
    ROLE_DOCTOR,
    ROLE_PATIENT,
    User,
    utcnow,
)
from ..schedule import TZ, is_slot_bookable, now_ist, today_ist

bp = Blueprint("appointments", __name__, url_prefix="/api/appointments")


def error_response(message, status=400, code="invalid"):
    db.session.rollback()
    return jsonify(error=code, message=message), status


@bp.post("")
@require_role(ROLE_PATIENT)
def create_appointment():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error_response("A JSON object is required.")

    doctor_id = data.get("doctor_id")
    raw_date = data.get("date")
    start_time = data.get("start_time")

    if (
        not str(doctor_id).isdigit()
        or not isinstance(raw_date, str)
        or not isinstance(start_time, str)
    ):
        return error_response(
            "doctor_id, date and start_time are required."
        )

    start_time = start_time.strip()
    doctor = db.session.get(User, int(doctor_id))

    if doctor is None or doctor.role != ROLE_DOCTOR:
        return error_response("Doctor not found.", 404, "not_found")

    try:
        day = date_cls.fromisoformat(raw_date)
    except ValueError:
        return error_response("Use date format YYYY-MM-DD.")

    cfg = current_app.config
    ok, reason = is_slot_bookable(
        doctor.name,
        day,
        start_time,
        cfg["BOOKING_HORIZON_DAYS"],
        cfg["BOOKING_LEAD_MINUTES"],
    )
    if not ok:
        return error_response(reason)

    appointment = Appointment(
        patient_id=g.user.id,
        doctor_id=doctor.id,
        date=day,
        start_time=start_time,
        status=APPT_CONFIRMED,
    )
    db.session.add(appointment)

    try:
        db.session.commit()
    except IntegrityError:
        return error_response(
            "That slot was just booked. Please select another time.",
            409,
            "slot_taken",
        )

    return jsonify(appointment=appointment.to_dict()), 201


@bp.get("")
@require_role(ROLE_PATIENT, ROLE_DOCTOR)
def list_appointments():
    query = db.select(Appointment).order_by(
        Appointment.date, Appointment.start_time, Appointment.id
    )

    include_patient = g.user.role == ROLE_DOCTOR

    if include_patient:
        query = query.where(Appointment.doctor_id == g.user.id)
    else:
        query = query.where(Appointment.patient_id == g.user.id)

    status = request.args.get("status")
    if status in (APPT_CONFIRMED, APPT_COMPLETED, APPT_CANCELLED):
        query = query.where(Appointment.status == status)

    rows = db.session.execute(query).scalars().all()

    return jsonify(
        appointments=[
            row.to_dict(include_patient=include_patient) for row in rows
        ]
    ), 200


@bp.patch("/<int:appt_id>")
@require_role(ROLE_PATIENT, ROLE_DOCTOR)
def update_appointment(appt_id):
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error_response("A JSON object is required.")

    raw_action = data.get("action") or data.get("status")
    if not isinstance(raw_action, str):
        return error_response("An action is required.")

    action = raw_action.strip().upper()
    action = {
        "COMPLETED": "COMPLETE",
        "CANCELLED": "CANCEL",
    }.get(action, action)

    if action not in {"START", "SAVE", "COMPLETE", "CANCEL"}:
        return error_response("Unsupported appointment action.")

    appointment = db.session.get(Appointment, appt_id)
    if appointment is None:
        return error_response("Appointment not found.", 404, "not_found")

    is_doctor = g.user.role == ROLE_DOCTOR
    owned = (
        appointment.doctor_id == g.user.id
        if is_doctor
        else appointment.patient_id == g.user.id
    )

    if not owned:
        return error_response("Not your appointment.", 403, "forbidden")

    if not is_doctor and action != "CANCEL":
        return error_response(
            "Only the assigned doctor can manage a consultation.",
            403,
            "forbidden",
        )

    # Obtain a database write lock before reading/updating consultation
    # details. The conditional update also rejects terminal bookings.
    result = db.session.execute(
        update(Appointment)
        .where(
            Appointment.id == appt_id,
            Appointment.status == APPT_CONFIRMED,
        )
        .values(updated_at=utcnow())
        .execution_options(synchronize_session=False)
    )

    if result.rowcount != 1:
        return error_response(
            "This appointment is already completed or cancelled.",
            409,
            "invalid_transition",
        )

    db.session.refresh(appointment)
    consultation = db.session.get(Consultation, appt_id)

    if action in {"START", "SAVE", "COMPLETE"}:
        scheduled_at = datetime.combine(
            appointment.date,
            time.fromisoformat(appointment.start_time),
            tzinfo=TZ,
        )
        if scheduled_at > now_ist():
            return error_response(
                "The consultation cannot start or finish before "
                "the scheduled appointment time."
            )

    if action == "START":
        if consultation and consultation.started_at:
            return error_response(
                "This consultation has already started.",
                409,
                "already_started",
            )

        if consultation is None:
            consultation = Consultation(appointment_id=appt_id)
            db.session.add(consultation)

        consultation.started_at = utcnow()

    elif action in {"SAVE", "COMPLETE"}:
        if consultation is None or consultation.started_at is None:
            return error_response("Start the consultation first.")

        summary = data.get("summary")
        if not isinstance(summary, str):
            return error_response("A visit summary must be text.")

        summary = summary.strip()
        if len(summary) > 3000:
            return error_response(
                "The visit summary must be 3,000 characters or fewer."
            )

        if action == "COMPLETE" and not summary:
            return error_response(
                "Write a visit summary before completing the consultation."
            )

        raw_follow_up = data.get("follow_up_date")
        follow_up = None

        if raw_follow_up not in (None, ""):
            if not isinstance(raw_follow_up, str):
                return error_response("Invalid follow-up date.")
            try:
                follow_up = date_cls.fromisoformat(raw_follow_up)
            except ValueError:
                return error_response(
                    "Use YYYY-MM-DD for the follow-up date."
                )

            if follow_up < today_ist():
                return error_response(
                    "The follow-up date cannot be in the past."
                )

        consultation.summary = summary
        consultation.follow_up_date = follow_up

        if action == "COMPLETE":
            consultation.completed_at = utcnow()
            appointment.status = APPT_COMPLETED

    elif action == "CANCEL":
        if not is_doctor and consultation and consultation.started_at:
            return error_response(
                "This visit has started. Contact the clinic to cancel.",
                409,
                "consultation_started",
            )

        reason = data.get("reason", "")
        if not isinstance(reason, str):
            return error_response("The cancellation reason must be text.")

        reason = reason.strip()
        if is_doctor and not reason:
            return error_response("Enter a cancellation reason.")
        if len(reason) > 500:
            return error_response(
                "The cancellation reason must be 500 characters or fewer."
            )

        if consultation is None:
            consultation = Consultation(appointment_id=appt_id)
            db.session.add(consultation)

        consultation.cancellation_reason = (
            reason or "Cancelled by the patient."
        )
        appointment.status = APPT_CANCELLED

    consultation.updated_at = utcnow()
    consultation.updated_by = g.user.id
    appointment.updated_at = utcnow()

    db.session.commit()
    db.session.refresh(appointment)

    return jsonify(
        appointment=appointment.to_dict(include_patient=is_doctor)
    ), 200


@bp.get("/today")
@require_role(ROLE_DOCTOR)
def today_appointments():
    query = (
        db.select(Appointment)
        .where(
            Appointment.doctor_id == g.user.id,
            Appointment.date == today_ist(),
            Appointment.status == APPT_CONFIRMED,
        )
        .order_by(Appointment.start_time)
    )
    rows = db.session.execute(query).scalars().all()

    return jsonify(
        appointments=[
            row.to_dict(include_patient=True) for row in rows
        ]
    ), 200