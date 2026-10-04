# Software Requirements Specification — VEYORA

**Project title:** Risk-Aware Project Plan for Development of a Smart Healthcare Application
**Student:** Mange Krisha Ashok · Roll: TYCS_68 · PRN: 125BTCS2004
**Institution:** Shah & Anchor Kutchhi Engineering College
**Course:** Software Engineering Practices · Work mode: Individual
**SDG alignment:** SDG 3 — Good Health and Well-being
**Version:** 1.0 · Date: 2026-10-04

## 1. Purpose

This SRS defines the requirements for VEYORA, an academic prototype of a smart
healthcare application. It is the agreement between the student developer and
the course faculty on what the prototype will and will not do, and provides the
requirement IDs used for traceability through design, implementation and
verification.

## 2. Scope

VEYORA is a minimal, risk-aware healthcare prototype with three roles:

* **Patient** — books in-clinic appointments, cancels own appointments, keeps
  personal health logs (heart rate, temperature, blood pressure), receives
  in-app appointment reminders.
* **Doctor** — views appointments assigned to them and updates visit status
  (Confirmed → Completed or Cancelled).
* **Project manager** — manages a persistent risk register with a 5×5 heatmap,
  a lightweight project plan, a small task board and a verification &
  traceability view.

**Explicitly out of scope** (UI and copy do not imply these work): video
consultations; prescriptions and medication advice; payments; SMS, email,
WhatsApp or push delivery; AI diagnosis; offline synchronization; hospital
system integrations; complex administrative management; extra dashboards.

The prototype supports the academic goal of demonstrating a risk-aware
development process (JIRA planning, SRS/DDS, diagrams, real testing evidence)
around SDG 3.

## 3. Stakeholders

| Stakeholder | Interest |
| --- | --- |
| Krisha Mange (student, developer, PM role) | Builds, tests, documents and demonstrates the prototype |
| Course faculty | Evaluates process maturity, evidence quality and rubric alignment |
| Patients (fictional seeded users) | Representative end users of booking and health logs |
| Doctors (fictional seeded users) | Representative end users of appointment management |

All clinical identities are fictional. The system is **not for clinical use**;
no requirement implies clinical readiness.

## 4. Functional requirements

### 4.1 Authentication and access (REQ-AUTH)

* **REQ-AUTH-01:** Users authenticate with email and password. Passwords are
  stored hashed (never plaintext). Sessions are server-managed HttpOnly
  cookies with SameSite=Lax; state-changing requests require a CSRF token.
* **REQ-AUTH-02:** Role-based access: a patient sees only their own
  appointments, health logs and reminders; a doctor sees only appointments
  assigned to them (never unrestricted patient health logs); the project
  manager sees only the project workspace (never unrestricted patient records).
* **REQ-AUTH-03:** Logout invalidates the session; subsequent API requests are
  rejected with 401.
* **REQ-AUTH-04 (optional):** Demo-account shortcuts authenticate through the
  backend and exist only when an explicit local demo-mode flag is enabled.

### 4.2 Appointments (REQ-BOOK)

* **REQ-BOOK-01:** A patient can book a future in-clinic appointment by
  choosing a doctor (with specialty filtering), a future date generated from
  the runtime date, and an available time slot from the doctor's weekly
  roster. Display timezone is Asia/Kolkata; stored timestamps are UTC.
* **REQ-BOOK-02:** A doctor's slot cannot have two active bookings. This must
  hold across different patients and concurrent requests, enforced by a
  database constraint (partial unique index) plus transactional handling;
  conflicts return HTTP 409 with a friendly message, keeping the selected
  doctor and date.
* **REQ-BOOK-03:** Past dates/times and same-day slots with less than 60
  minutes' notice are rejected.
* **REQ-BOOK-04:** A patient can cancel their own confirmed appointment;
  cancellation releases the slot for other patients.
* **REQ-BOOK-05:** Status model: Confirmed → Completed | Cancelled (terminal).
  Only the treating doctor marks Completed. Backend validates transitions and
  actor permissions; unauthorized updates are rejected.
* **REQ-BOOK-06:** Slot-availability responses never reveal other patients'
  identities.

### 4.3 Health logs (REQ-LOG)

* **REQ-LOG-01:** A patient can create, list, filter and delete personal
  health logs: heart rate (bpm, whole number, 20–250), temperature (°C,
  30–45), blood pressure (systolic 50–300 and diastolic 30–200 mmHg, systolic
  ≥ diastolic). Records carry patient ID, type, numeric fields, timestamp and
  optional note.
* **REQ-LOG-02:** Validation is enforced on both frontend and backend.
  Limits are documented as **technical input constraints, not clinical
  interpretation** — the app never diagnoses, recommends medicine, or labels
  readings safe/dangerous.
* **REQ-LOG-03:** Only the owner may access or delete their records.

### 4.4 In-app reminders (REQ-REM)

* **REQ-REM-01:** Patients see an in-app reminder list derived live from
  upcoming confirmed appointments (7-day window) and can mark reminders read.
  No SMS, email, WhatsApp or push delivery is claimed or implemented.

### 4.5 Risk-aware project workspace (REQ-RISK / REQ-PLAN / REQ-VER)

* **REQ-RISK-01:** The project manager maintains a persistent risk register:
  title, description, category, probability (1–5), impact (1–5), computed
  score = probability × impact, owner, mitigation, contingency, status
  (open/closed), review date and links to requirements/tasks/verification.
  Academic bands: 1–4 Low, 5–9 Moderate, 10–16 High, 17–25 Critical
  (project-risk priorities, not clinical classifications). A 5×5 heatmap and
  an accessible list alternative are provided; metrics are computed from
  database records.
* **REQ-PLAN-01:** A plan view shows objectives, in-scope/out-of-scope lists,
  work breakdown with estimated effort, available individual effort,
  milestones and risk contingency time. Estimated, planned and actual values
  are kept separate; actuals are never fabricated.
* **REQ-TASK-01:** A small task board (To Do → In Progress → Done) supports
  title, description, status, priority, owner, linked risk and optional JIRA
  key/link. It supports — not replaces — JIRA.
* **REQ-VER-01:** A traceability view connects Requirement → Risk → Control →
  Test → Evidence. Results are recorded only after real runs, with date and
  evidence source, distinguishing automated tests from manual observations.
  No endpoint executes arbitrary tests or shell commands.

## 5. Non-functional requirements

* **NFR-01 Security:** Hashed passwords; HttpOnly, SameSite=Lax session
  cookies (Secure when served over HTTPS); CSRF protection on state-changing
  routes; backend authorization checks on every endpoint; environment-based
  secrets; no role/ID trusted from the browser.
* **NFR-02 Reliability:** Bookings persist across restarts (file-backed
  SQLite); duplicate-slot protection holds under concurrent requests.
* **NFR-03 Usability:** Spacious, readable, responsive UI preserving the
  reference design language (warm ivory, teal accent, Manrope-style type,
  rounded cards). Ordinary transitions 150–250 ms; prefers-reduced-motion
  respected globally; offscreen continuous animation paused.
* **NFR-04 Maintainability:** React + Vite + TypeScript frontend; Flask +
  SQLAlchemy backend; tokenized CSS; pytest suite with isolated databases.
* **NFR-05 Performance (academic):** Local single-user prototype; no measured
  latency claims are made without actual evidence.
* **NFR-06 Honesty of evidence:** Tests are only reported as passed when
  actually run; documentation distinguishes estimated from actual values.

## 6. Constraints

* Individual student project; effort limited to ~14 h/week for ~5 weeks.
* Local academic prototype: SQLite file database, Flask dev server, Vite dev
  server with /api proxy. No cloud deployment required.
* Deadline discrepancy in the assignment brief: written submission says
  **5 Oct 2026**, portal says **9 Oct 2026, 23:59**. Work is planned against
  the earlier date until clarified.
* Design reference export (design-reference/index.html) was not present in
  the delivered workspace and the linked Stitch/Figma files require sign-in;
  the visual identity is reconstructed from the documented token set and
  screen descriptions (see docs/design-reference-status.md).

## 7. Acceptance criteria (summary)

| ID | Criterion | Verified by |
| --- | --- | --- |
| REQ-AUTH-01 | Wrong password → 401; logout invalidates; no-CSRF POST → 403 | tests/test_auth.py |
| REQ-AUTH-02 | Cross-role and cross-patient access denied (401/403/404) | tests/test_authorization.py |
| REQ-BOOK-02 | One of two racing patients succeeds; the other gets 409 | tests/test_appointments.py |
| REQ-BOOK-04 | After cancellation, another patient can book the slot (201) | tests/test_appointments.py |
| REQ-LOG-01 | Out-of-range / wrong-type inputs rejected with 400 | tests/test_health_logs.py |
| REQ-RISK-01 | Score = P×I computed server-side; out-of-range rejected | tests/test_risks_tasks.py |
| REQ-DATA-01 | Records survive app restart on a file-backed DB | tests/test_persistence.py |

## 8. Traceability

Requirement → Risk → Control → Test → Evidence is maintained in the
application's Verification view (database table `verification_records`) and in
docs/testing-evidence.md. Requirement IDs above are linked from seeded risks
(RISK-01…RISK-06) and from the JIRA backlog (docs/jira-backlog.csv).
