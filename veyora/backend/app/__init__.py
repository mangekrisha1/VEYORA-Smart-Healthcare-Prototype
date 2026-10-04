"""VEYORA backend — Flask application factory."""
from flask import Flask, jsonify

from config import Config

from .auth import csrf_guard
from .extensions import db


def create_app(config_object=Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_object)

    if app.config.get("SECRET_KEY_IS_DEFAULT"):
        app.logger.warning(
            "VEYORA is running with the insecure default secret key. "
            "Set VEYORA_SECRET_KEY for anything beyond local development.")

    db.init_app(app)

    # CSRF guard for all state-changing requests, before blueprints run.
    app.before_request(csrf_guard)

    from .api import (appointments, auth_routes, coordinator, doctors,
                      health_logs, pm_workspace, reminders)
    for module in (auth_routes, doctors, appointments, health_logs,
                   reminders, pm_workspace, coordinator):
        app.register_blueprint(module.bp)

    @app.get("/api/meta")
    def meta():
        return jsonify(app_name="VEYORA",
                       display_timezone=app.config["DISPLAY_TIMEZONE"],
                       demo_mode=app.config["DEMO_MODE"]), 200

    @app.errorhandler(404)
    def not_found(_e):
        if _is_api():
            return jsonify(error="not_found", message="Not found."), 404
        return "", 404

    @app.errorhandler(405)
    def bad_method(_e):
        return jsonify(error="method_not_allowed", message="Method not allowed."), 405

    @app.errorhandler(500)
    def server_error(_e):
        return jsonify(error="server", message="Unexpected server error."), 500

    with app.app_context():
        from . import models  # noqa: F401  (register models)
        db.create_all()
        _upgrade_schema()

    return app


def _upgrade_schema() -> None:
    """Non-destructive schema upgrade for existing SQLite database files."""
    from sqlalchemy import inspect, text
    inspector = inspect(db.engine)
    if inspector.has_table("risks"):
        existing = {c["name"] for c in inspector.get_columns("risks")}
        for col_name, col_type in [
            ("jira_id", "VARCHAR(40)"),
            ("jira_key", "VARCHAR(40)"),
            ("jira_url", "VARCHAR(255)"),
            ("jira_status", "VARCHAR(60)"),
            ("jira_updated_at", "DATETIME"),
        ]:
            if col_name not in existing:
                try:
                    db.session.execute(text(f"ALTER TABLE risks ADD COLUMN {col_name} {col_type}"))
                    db.session.commit()
                except Exception:
                    db.session.rollback()


def _is_api() -> bool:
    from flask import request
    return request.path.startswith("/api/")
