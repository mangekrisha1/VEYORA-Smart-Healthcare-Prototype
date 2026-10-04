from flask import Blueprint, g, jsonify, request

from ..auth import require_role
from ..extensions import db
from ..models import (LOG_BLOOD_PRESSURE, LOG_HEART_RATE, LOG_LIMITS,
                      LOG_TEMPERATURE, LOG_TYPES, HealthLog, ROLE_PATIENT)

bp = Blueprint("health_logs", __name__, url_prefix="/api/health-logs")


def _validate(data: dict) -> tuple[dict | None, str]:
    """Validate a health log payload. Technical input constraints only —
    the app never interprets readings clinically."""
    log_type = (data.get("type") or "").upper()
    if log_type not in LOG_TYPES:
        return None, f"type must be one of {', '.join(LOG_TYPES)}."

    out = {"type": log_type, "note": (data.get("note") or None)}
    if out["note"] and len(out["note"]) > 280:
        return None, "Note must be at most 280 characters."

    limits = LOG_LIMITS[log_type]
    if log_type in (LOG_HEART_RATE, LOG_TEMPERATURE):
        raw = data.get("value")
        try:
            value = float(raw)
        except (TypeError, ValueError):
            return None, "value must be a number."
        lo, hi = limits["value_min"], limits["value_max"]
        if not (lo <= value <= hi):
            unit = "bpm" if log_type == LOG_HEART_RATE else "°C"
            return None, f"value must be between {lo} and {hi} {unit} (input limit)."
        if log_type == LOG_HEART_RATE and not value.is_integer():
            return None, "Heart rate must be a whole number of bpm."
        out["value"] = value
        out["systolic"] = None
        out["diastolic"] = None
    else:  # BLOOD_PRESSURE
        try:
            systolic = int(data.get("systolic"))
            diastolic = int(data.get("diastolic"))
        except (TypeError, ValueError):
            return None, "systolic and diastolic must both be whole numbers (mmHg)."
        if not (limits["systolic_min"] <= systolic <= limits["systolic_max"]):
            return None, (f"systolic must be between {limits['systolic_min']} and "
                          f"{limits['systolic_max']} mmHg (input limit).")
        if not (limits["diastolic_min"] <= diastolic <= limits["diastolic_max"]):
            return None, (f"diastolic must be between {limits['diastolic_min']} and "
                          f"{limits['diastolic_max']} mmHg (input limit).")
        if systolic < diastolic:
            return None, "Systolic cannot be lower than diastolic."
        out["value"] = None
        out["systolic"] = systolic
        out["diastolic"] = diastolic
    return out, ""


@bp.get("")
@require_role(ROLE_PATIENT)
def list_logs():
    q = (db.select(HealthLog)
         .where(HealthLog.patient_id == g.user.id)  # owner only, always
         .order_by(HealthLog.taken_at.desc()))
    type_filter = request.args.get("type", "").upper()
    if type_filter in LOG_TYPES:
        q = q.where(HealthLog.type == type_filter)
    rows = db.session.execute(q).scalars().all()
    return jsonify(logs=[r.to_dict() for r in rows]), 200


@bp.post("")
@require_role(ROLE_PATIENT)
def create_log():
    data = request.get_json(silent=True) or {}
    clean, err = _validate(data)
    if clean is None:
        return jsonify(error="invalid", message=err), 400
    log = HealthLog(patient_id=g.user.id, **clean)
    db.session.add(log)
    db.session.commit()
    return jsonify(log=log.to_dict()), 201


@bp.delete("/<int:log_id>")
@require_role(ROLE_PATIENT)
def delete_log(log_id: int):
    log = db.session.get(HealthLog, log_id)
    if log is None or log.patient_id != g.user.id:
        # Same response for missing and not-owned: no information leak.
        return jsonify(error="not_found", message="Record not found."), 404
    db.session.delete(log)
    db.session.commit()
    return jsonify(ok=True), 200
