from flask import Blueprint, current_app, g, jsonify, request, session
from werkzeug.security import check_password_hash

from ..auth import current_user, issue_csrf_token, require_auth
from ..extensions import db
from ..models import User

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _me_payload(user: User) -> dict:
    return {"user": user.public_dict(), "csrf_token": issue_csrf_token(),
            "demo_mode": current_app.config["DEMO_MODE"]}


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not email or not password:
        return jsonify(error="invalid", message="Email and password are required."), 400

    user = db.session.execute(db.select(User).filter_by(email=email)).scalar_one_or_none()
    if user is None or not check_password_hash(user.password_hash, password):
        return jsonify(error="invalid", message="Incorrect email or password."), 401

    session.clear()
    session.permanent = True
    session["user_id"] = user.id
    return jsonify(_me_payload(user)), 200


@bp.post("/demo-login")
def demo_login():
    """Passwordless shortcut for seeded demo accounts.

    Only available when VEYORA_DEMO_MODE=1 is explicitly set (local dev).
    The request still authenticates against the backend user table.
    """
    if not current_app.config["DEMO_MODE"]:
        return jsonify(error="disabled", message="Demo login is disabled."), 403
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    user = db.session.execute(db.select(User).filter_by(email=email)).scalar_one_or_none()
    if user is None:
        return jsonify(error="invalid", message="Unknown demo account."), 404
    session.clear()
    session.permanent = True
    session["user_id"] = user.id
    return jsonify(_me_payload(user)), 200


@bp.post("/logout")
@require_auth
def logout():
    session.clear()
    return jsonify(ok=True), 200


@bp.get("/me")
def me():
    user = current_user()
    if user is None:
        return jsonify(user=None, demo_mode=current_app.config["DEMO_MODE"]), 200
    return jsonify(_me_payload(user)), 200
