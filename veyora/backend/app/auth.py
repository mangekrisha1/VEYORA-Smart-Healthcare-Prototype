"""Session auth helpers: login state, CSRF, role guards."""
import secrets
from functools import wraps

from flask import current_app, g, jsonify, request, session

from .extensions import db
from .models import ROLE_DOCTOR, ROLE_PATIENT, ROLE_PM, User

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

# Login is password-protected and regenerates the session on success, so a
# CSRF token is not required there (SameSite=Lax additionally blocks
# cross-site form posts). Every other state-changing route requires the token.
CSRF_EXEMPT_PATHS = {"/api/auth/login", "/api/auth/demo-login"}


def current_user() -> User | None:
    uid = session.get("user_id")
    if uid is None:
        return None
    return db.session.get(User, uid)


def issue_csrf_token() -> str:
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_urlsafe(32)
    return session["csrf_token"]


def csrf_guard():
    """Reject state-changing requests without a valid X-CSRF-Token header."""
    if request.method in SAFE_METHODS or request.path in CSRF_EXEMPT_PATHS:
        return None
    token = request.headers.get("X-CSRF-Token", "")
    expected = session.get("csrf_token")
    if not expected or not secrets.compare_digest(token, expected):
        return jsonify(error="csrf", message="Missing or invalid CSRF token."), 403
    return None


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return jsonify(error="unauthorized", message="Sign in required."), 401
        g.user = user
        return fn(*args, **kwargs)
    return wrapper


def require_role(*roles):
    def deco(fn):
        @wraps(fn)
        @require_auth
        def wrapper(*args, **kwargs):
            if g.user.role not in roles:
                return jsonify(error="forbidden",
                               message="You do not have access to this resource."), 403
            return fn(*args, **kwargs)
        return wrapper
    return deco


require_patient = lambda fn: require_role(ROLE_PATIENT)(fn)
require_doctor = lambda fn: require_role(ROLE_DOCTOR)(fn)
require_pm = lambda fn: require_role(ROLE_PM)(fn)
require_clinical = lambda fn: require_role(ROLE_PATIENT, ROLE_DOCTOR)(fn)
