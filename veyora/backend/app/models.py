"""VEYORA database models.

Timestamps use naive UTC internally.
Appointment dates and times represent Asia/Kolkata.
"""

from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, Index, text

from .extensions import db


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso_utc(value):
    return value.isoformat() + "Z" if value else None


ROLE_PATIENT = "PATIENT"
ROLE_DOCTOR = "DOCTOR"
ROLE_PM = "PROJECT_MANAGER"
ROLES = (ROLE_PATIENT, ROLE_DOCTOR, ROLE_PM)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(160), nullable=False, unique=True)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(20), nullable=False)
    specialty = db.Column(db.String(80), nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    def public_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "specialty": self.specialty,
        }


APPT_CONFIRMED = "CONFIRMED"
APPT_COMPLETED = "COMPLETED"
APPT_CANCELLED = "CANCELLED"
APPT_STATUSES = (APPT_CONFIRMED, APPT_COMPLETED, APPT_CANCELLED)

ALLOWED_TRANSITIONS = {
    APPT_CONFIRMED: {APPT_COMPLETED, APPT_CANCELLED},
    APPT_COMPLETED: set(),
    APPT_CANCELLED: set(),
}


class Appointment(db.Model):
    __tablename__ = "appointments"
    __table_args__ = (
        # Consultations in progress retain CONFIRMED booking status,
        # so the existing unique index continues protecting the slot.
        Index(
            "uq_active_slot",
            "doctor_id",
            "date",
            "start_time",
            unique=True,
            sqlite_where=text("status = 'CONFIRMED'"),
        ),
        CheckConstraint(
            "status IN ('CONFIRMED','COMPLETED','CANCELLED')",
            name="ck_appointment_status",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    doctor_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    date = db.Column(db.Date, nullable=False)
    start_time = db.Column(db.String(5), nullable=False)
    status = db.Column(
        db.String(12), nullable=False, default=APPT_CONFIRMED
    )
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )

    patient = db.relationship("User", foreign_keys=[patient_id])
    doctor = db.relationship("User", foreign_keys=[doctor_id])
    consultation = db.relationship(
        "Consultation",
        back_populates="appointment",
        uselist=False,
    )

    def to_dict(self, include_patient=False, include_doctor=True):
        consultation = self.consultation

        if self.status == APPT_COMPLETED:
            workflow_status = "COMPLETED"
        elif self.status == APPT_CANCELLED:
            workflow_status = "CANCELLED"
        elif consultation and consultation.started_at:
            workflow_status = "IN_PROGRESS"
        else:
            workflow_status = "CONFIRMED"

        result = {
            "id": self.id,
            "doctor_id": self.doctor_id,
            "date": self.date.isoformat(),
            "start_time": self.start_time,
            "status": self.status,
            "workflow_status": workflow_status,
            "created_at": iso_utc(self.created_at),
            "consultation": (
                consultation.to_dict(
                    include_draft=include_patient,
                    completed=self.status == APPT_COMPLETED,
                )
                if consultation else None
            ),
        }

        if include_patient and self.patient:
            result["patient"] = {
                "id": self.patient.id,
                "name": self.patient.name,
            }

        if include_doctor and self.doctor:
            result["doctor"] = {
                "id": self.doctor.id,
                "name": self.doctor.name,
                "specialty": self.doctor.specialty,
            }

        return result


class Consultation(db.Model):
    """One consultation record per appointment.

    A separate table avoids altering the existing appointments table.
    Draft notes are returned only to the assigned doctor.
    Completed summaries are also returned to the appointment's patient.
    """

    __tablename__ = "consultations"

    appointment_id = db.Column(
        db.Integer,
        db.ForeignKey("appointments.id"),
        primary_key=True,
    )
    summary = db.Column(db.Text, nullable=False, default="")
    follow_up_date = db.Column(db.Date, nullable=True)
    cancellation_reason = db.Column(db.String(500), nullable=True)
    started_at = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_by = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True
    )

    appointment = db.relationship(
        "Appointment", back_populates="consultation"
    )

    def to_dict(self, include_draft=False, completed=False):
        can_view_summary = include_draft or completed

        return {
            "summary": self.summary if can_view_summary else None,
            "follow_up_date": (
                self.follow_up_date.isoformat()
                if self.follow_up_date and can_view_summary else None
            ),
            "cancellation_reason": self.cancellation_reason,
            "started_at": iso_utc(self.started_at),
            "completed_at": iso_utc(self.completed_at),
            "updated_at": iso_utc(self.updated_at),
        }


class ReminderRead(db.Model):
    __tablename__ = "reminder_reads"

    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), primary_key=True
    )
    appointment_id = db.Column(
        db.Integer, db.ForeignKey("appointments.id"), primary_key=True
    )
    read_at = db.Column(db.DateTime, nullable=False, default=utcnow)


LOG_HEART_RATE = "HEART_RATE"
LOG_TEMPERATURE = "TEMPERATURE"
LOG_BLOOD_PRESSURE = "BLOOD_PRESSURE"
LOG_TYPES = (LOG_HEART_RATE, LOG_TEMPERATURE, LOG_BLOOD_PRESSURE)

# Technical input limits, not clinical classifications.
LOG_LIMITS = {
    LOG_HEART_RATE: {"value_min": 20, "value_max": 250},
    LOG_TEMPERATURE: {"value_min": 30.0, "value_max": 45.0},
    LOG_BLOOD_PRESSURE: {
        "systolic_min": 50,
        "systolic_max": 300,
        "diastolic_min": 30,
        "diastolic_max": 200,
    },
}


class HealthLog(db.Model):
    __tablename__ = "health_logs"

    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    type = db.Column(db.String(20), nullable=False)
    value = db.Column(db.Float, nullable=True)
    systolic = db.Column(db.Integer, nullable=True)
    diastolic = db.Column(db.Integer, nullable=True)
    note = db.Column(db.String(280), nullable=True)
    taken_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "type": self.type,
            "value": self.value,
            "systolic": self.systolic,
            "diastolic": self.diastolic,
            "note": self.note,
            "taken_at": iso_utc(self.taken_at),
        }


RISK_OPEN = "OPEN"
RISK_CLOSED = "CLOSED"
RISK_STATUSES = (RISK_OPEN, RISK_CLOSED)
RISK_CATEGORIES = (
    "Security", "Data integrity", "Availability",
    "Schedule", "Compliance", "Usability",
)


def score_band(score: int) -> str:
    if score <= 4:
        return "Low"
    if score <= 9:
        return "Moderate"
    if score <= 16:
        return "High"
    return "Critical"


class Risk(db.Model):
    __tablename__ = "risks"
    __table_args__ = (
        CheckConstraint(
            "probability BETWEEN 1 AND 5", name="ck_risk_probability"
        ),
        CheckConstraint(
            "impact BETWEEN 1 AND 5", name="ck_risk_impact"
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(16), nullable=False, unique=True)
    title = db.Column(db.String(160), nullable=False)
    description = db.Column(db.Text, nullable=False, default="")
    category = db.Column(db.String(40), nullable=False, default="Schedule")
    probability = db.Column(db.Integer, nullable=False)
    impact = db.Column(db.Integer, nullable=False)
    owner = db.Column(
        db.String(120), nullable=False, default="Krisha Mange"
    )
    mitigation = db.Column(db.Text, nullable=False, default="")
    contingency = db.Column(db.Text, nullable=False, default="")
    status = db.Column(db.String(10), nullable=False, default=RISK_OPEN)
    control_status = db.Column(
        db.String(20), nullable=False, default="Planned"
    )
    review_date = db.Column(db.Date, nullable=True)
    linked_requirement = db.Column(db.String(40), nullable=True)
    linked_task = db.Column(db.String(40), nullable=True)
    linked_verification = db.Column(db.String(40), nullable=True)
    jira_id = db.Column(db.String(40), nullable=True)
    jira_key = db.Column(db.String(40), nullable=True)
    jira_url = db.Column(db.String(255), nullable=True)
    jira_status = db.Column(db.String(60), nullable=True)
    jira_updated_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    @property
    def score(self):
        return self.probability * self.impact

    def to_dict(self):
        return {
            "id": self.id,
            "code": self.code,
            "title": self.title,
            "description": self.description,
            "category": self.category,
            "probability": self.probability,
            "impact": self.impact,
            "score": self.score,
            "band": score_band(self.score),
            "owner": self.owner,
            "mitigation": self.mitigation,
            "contingency": self.contingency,
            "status": self.status,
            "control_status": self.control_status,
            "review_date": (
                self.review_date.isoformat() if self.review_date else None
            ),
            "linked_requirement": self.linked_requirement,
            "linked_task": self.linked_task,
            "linked_verification": self.linked_verification,
            "jira_id": self.jira_id,
            "jira_key": self.jira_key,
            "jira_url": self.jira_url,
            "jira_status": self.jira_status,
            "jira_updated_at": iso_utc(self.jira_updated_at),
        }


TASK_TODO = "TODO"
TASK_IN_PROGRESS = "IN_PROGRESS"
TASK_DONE = "DONE"
TASK_STATUSES = (TASK_TODO, TASK_IN_PROGRESS, TASK_DONE)
TASK_PRIORITIES = ("Low", "Medium", "High", "Critical")


class Task(db.Model):
    __tablename__ = "tasks"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(160), nullable=False)
    description = db.Column(db.Text, nullable=False, default="")
    status = db.Column(db.String(16), nullable=False, default=TASK_TODO)
    priority = db.Column(db.String(10), nullable=False, default="Medium")
    owner = db.Column(
        db.String(120), nullable=False, default="Krisha Mange"
    )
    risk_id = db.Column(
        db.Integer, db.ForeignKey("risks.id"), nullable=True
    )
    jira_key = db.Column(db.String(20), nullable=True)
    jira_url = db.Column(db.String(200), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    risk = db.relationship("Risk")

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "status": self.status,
            "priority": self.priority,
            "owner": self.owner,
            "risk_id": self.risk_id,
            "risk_code": self.risk.code if self.risk else None,
            "jira_key": self.jira_key,
            "jira_url": self.jira_url,
        }


class Milestone(db.Model):
    __tablename__ = "milestones"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(160), nullable=False)
    due_date = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(16), nullable=False, default="Planned")
    notes = db.Column(db.String(280), nullable=False, default="")

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "due_date": self.due_date.isoformat(),
            "status": self.status,
            "notes": self.notes,
        }


VER_PENDING = "PENDING"
VER_PASS = "PASS"
VER_FAIL = "FAIL"
VER_RESULTS = (VER_PENDING, VER_PASS, VER_FAIL)


class VerificationRecord(db.Model):
    __tablename__ = "verification_records"

    id = db.Column(db.Integer, primary_key=True)
    req_id = db.Column(db.String(20), nullable=False)
    req_text = db.Column(db.String(280), nullable=False)
    risk_code = db.Column(db.String(16), nullable=True)
    control = db.Column(db.String(280), nullable=False)
    test_name = db.Column(db.String(160), nullable=False)
    expected = db.Column(db.String(280), nullable=False)
    result = db.Column(db.String(10), nullable=False, default=VER_PENDING)
    kind = db.Column(db.String(12), nullable=False, default="automated")
    run_date = db.Column(db.Date, nullable=True)
    evidence_source = db.Column(db.String(280), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "req_id": self.req_id,
            "req_text": self.req_text,
            "risk_code": self.risk_code,
            "control": self.control,
            "test_name": self.test_name,
            "expected": self.expected,
            "result": self.result,
            "kind": self.kind,
            "run_date": (
                self.run_date.isoformat() if self.run_date else None
            ),
            "evidence_source": self.evidence_source,
        }


class DeliveryPlan(db.Model):
    """Saved planning inputs for this individual project."""
    __tablename__ = "delivery_plans"
    id = db.Column(db.Integer, primary_key=True)
    deadline = db.Column(db.Date, nullable=False)
    available_hours = db.Column(db.Float, nullable=False)
    remaining_hours = db.Column(db.Float, nullable=False)
    buffer_hours = db.Column(db.Float, nullable=False)
    jira_url = db.Column(db.String(500), nullable=False, default="")
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    def to_dict(self):
        required = self.remaining_hours + self.buffer_hours
        return {
            "deadline": self.deadline.isoformat(),
            "available_hours": self.available_hours,
            "remaining_hours": self.remaining_hours,
            "buffer_hours": self.buffer_hours,
            "required_hours": round(required, 2),
            "capacity_gap": round(self.available_hours - required, 2),
            "jira_url": self.jira_url,
        }


INCIDENT_CATEGORIES = (
    "Appointment",
    "Availability",
    "Privacy/access",
    "Data accuracy",
    "Other",
)
INCIDENT_PRIORITIES = ("Low", "Medium", "High", "Critical")
INCIDENT_STATUS_OPEN = "Open"
INCIDENT_STATUS_IN_PROGRESS = "In progress"
INCIDENT_STATUS_RESOLVED = "Resolved"
INCIDENT_STATUSES = (
    INCIDENT_STATUS_OPEN,
    INCIDENT_STATUS_IN_PROGRESS,
    INCIDENT_STATUS_RESOLVED,
)


class Incident(db.Model):
    """Operational incident recorded by clinic staff/coordinator."""
    __tablename__ = "incidents"

    id = db.Column(db.Integer, primary_key=True)
    reference = db.Column(db.String(20), nullable=False, unique=True)
    title = db.Column(db.String(160), nullable=False)
    category = db.Column(db.String(40), nullable=False, default="Other")
    description = db.Column(db.Text, nullable=False, default="")
    priority = db.Column(db.String(20), nullable=False, default="Medium")
    status = db.Column(db.String(20), nullable=False, default=INCIDENT_STATUS_OPEN)
    appointment_id = db.Column(
        db.Integer, db.ForeignKey("appointments.id"), nullable=True
    )
    risk_id = db.Column(
        db.Integer, db.ForeignKey("risks.id"), nullable=True
    )
    reported_by_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False
    )
    resolution_note = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )
    resolved_at = db.Column(db.DateTime, nullable=True)

    jira_id = db.Column(db.String(40), nullable=True)
    jira_key = db.Column(db.String(40), nullable=True)
    jira_url = db.Column(db.String(255), nullable=True)
    jira_status = db.Column(db.String(60), nullable=True)
    jira_updated_at = db.Column(db.DateTime, nullable=True)

    reported_by = db.relationship("User", foreign_keys=[reported_by_id])
    appointment = db.relationship("Appointment", foreign_keys=[appointment_id])
    risk = db.relationship("Risk", foreign_keys=[risk_id])
    activities = db.relationship(
        "IncidentActivity",
        back_populates="incident",
        cascade="all, delete-orphan",
        order_by="IncidentActivity.created_at.desc()",
    )

    def to_dict(self, include_activities=False):
        data = {
            "id": self.id,
            "reference": self.reference,
            "title": self.title,
            "category": self.category,
            "description": self.description,
            "priority": self.priority,
            "status": self.status,
            "appointment_id": self.appointment_id,
            "appointment_ref": (
                f"APT-{self.appointment_id:04d}" if self.appointment_id else None
            ),
            "risk_id": self.risk_id,
            "risk_code": self.risk.code if self.risk else None,
            "reported_by_id": self.reported_by_id,
            "reported_by_name": self.reported_by.name if self.reported_by else "Unknown",
            "resolution_note": self.resolution_note,
            "created_at": iso_utc(self.created_at),
            "updated_at": iso_utc(self.updated_at),
            "resolved_at": iso_utc(self.resolved_at),
            "jira_id": self.jira_id,
            "jira_key": self.jira_key,
            "jira_url": self.jira_url,
            "jira_status": self.jira_status,
            "jira_updated_at": iso_utc(self.jira_updated_at),
        }
        if include_activities:
            data["activities"] = [a.to_dict() for a in self.activities]
        return data


class IncidentActivity(db.Model):
    """Append-only audit trail for incident lifecycle events."""
    __tablename__ = "incident_activities"

    id = db.Column(db.Integer, primary_key=True)
    incident_id = db.Column(
        db.Integer, db.ForeignKey("incidents.id"), nullable=False, index=True
    )
    actor_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False
    )
    action = db.Column(db.String(40), nullable=False)
    details = db.Column(db.Text, nullable=False, default="")
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    actor = db.relationship("User", foreign_keys=[actor_id])
    incident = db.relationship("Incident", back_populates="activities")

    def to_dict(self):
        return {
            "id": self.id,
            "incident_id": self.incident_id,
            "actor_id": self.actor_id,
            "actor_name": self.actor.name if self.actor else "System",
            "action": self.action,
            "details": self.details,
            "created_at": iso_utc(self.created_at),
        }