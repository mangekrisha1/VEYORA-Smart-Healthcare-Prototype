"""VEYORA backend configuration.

Secrets come from environment variables only. Never hard-code secrets.
The dev fallback SECRET_KEY prints a loud warning and must never be used
in anything resembling production.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# Explicit environment loading for local dev (.env in backend directory)
_env_path = BASE_DIR / ".env"
if _env_path.exists():
    try:
        with open(_env_path, "r", encoding="utf-8") as _f:
            for _line in _f:
                _line = _line.strip()
                if _line and not _line.startswith("#") and "=" in _line:
                    _k, _v = _line.split("=", 1)
                    _k = _k.strip()
                    _v = _v.strip().strip("'\"")
                    if _k and _k not in os.environ:
                        os.environ[_k] = _v
    except Exception:
        pass


class Config:
    SECRET_KEY = os.environ.get("VEYORA_SECRET_KEY")
    if not SECRET_KEY:
        SECRET_KEY = "dev-only-insecure-key-do-not-use-in-production"
        SECRET_KEY_IS_DEFAULT = True
    else:
        SECRET_KEY_IS_DEFAULT = False

    DB_PATH = os.environ.get("VEYORA_DB_PATH", str(BASE_DIR / "veyora.db"))
    SQLALCHEMY_DATABASE_URI = os.environ.get("VEYORA_DB_URI", f"sqlite:///{DB_PATH}")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # Generous lock timeout so concurrent writers queue instead of failing.
    SQLALCHEMY_ENGINE_OPTIONS = {"connect_args": {"timeout": 15}}

    # Demo-account shortcut logins are only available when explicitly enabled.
    DEMO_MODE = os.environ.get("VEYORA_DEMO_MODE", "0") == "1"

    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_NAME = "veyora_session"
    # Enable Secure cookies when served over HTTPS.
    SESSION_COOKIE_SECURE = os.environ.get("VEYORA_SECURE_COOKIES", "0") == "1"
    PERMANENT_SESSION_LIFETIME = 60 * 60 * 8  # 8 hours

    # Booking rules
    BOOKING_HORIZON_DAYS = 30          # bookable window from today
    BOOKING_LEAD_MINUTES = 60          # same-day slots must be >= 60 min away
    REMINDER_WINDOW_DAYS = 7           # reminders for appointments within 7 days

    DISPLAY_TIMEZONE = "Asia/Kolkata"  # display-only; storage is UTC
