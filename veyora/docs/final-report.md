# Risk-Aware Project Plan for Development of a Smart Healthcare Application

## 1. Certificate Page

This is to certify that **Mange Krisha Ashok** (Roll No: TYCS_68, PRN:
125BTCS2004), student of Shah & Anchor Kutchhi Engineering College, has
completed the course assignment **"Risk-Aware Project Plan for Development of
a Smart Healthcare Application"** for the course *Software Engineering
Practices* under SDG 3 — Good Health and Well-being. The work is an
individual submission and the prototype, documentation and evidence presented
were produced by the student as described in this report.

Faculty Name: ______________________________

Faculty Signature & Date: ______________________________

*(Certificate approval, if required by the department: ____________________ )*

## 2. Title Page

**Risk-Aware Project Plan for Development of a Smart Healthcare Application**

A course assignment submission for *Software Engineering Practices*

Student: Mange Krisha Ashok
Roll No: TYCS_68 · PRN: 125BTCS2004
College: Shah & Anchor Kutchhi Engineering College
Work mode: Individual
Assigned SDG: SDG 3 — Good Health and Well-being
Academic year: 2026–27

*Planning note: the assignment brief lists two dates — written submission
5 October 2026 and portal due date 9 October 2026, 23:59. This discrepancy is
recorded here; work was planned against the earlier date. No submission or
completion dates are claimed in this report until the student actually
submits.*

## 3. Table of Contents

*(This document contains a real TOC field — refresh it in Word: References →
Update Table, or right-click → Update Field.)*

## 4. Introduction

VEYORA is a minimal, working smart healthcare prototype that demonstrates how
a solo student can run a genuinely **risk-aware** software project: a small
but real product (appointment booking, personal health logs, in-app
reminders), planned with JIRA, designed with standard diagrams, documented
with SRS/DDS, and verified with actually-executed tests.

The application serves three roles. A **patient** books and cancels in-clinic
appointments and keeps private health logs (heart rate, temperature, blood
pressure). A **doctor** manages the appointments assigned to them. A
**project manager** — the student herself, Krisha Mange — maintains a risk
register with a 5×5 heatmap, a lightweight plan, a small task board and a
verification-and-traceability view.

The prototype aligns with **SDG 3 (Good Health and Well-being)** by making
basic care coordination — booking a visit and tracking simple personal
readings — less complex, while deliberately excluding everything that would
require clinical certification (diagnosis, prescriptions, payments, remote
consultations). The visual identity is preserved from the supplied design
reference: warm ivory surfaces, teal accent, Manrope-style typography and the
floating-phone hero with the headline *"A little less complexity. A lot more
care."*

## 5. Problem Definition & Scope

### 5.1 Problem statement

Small clinics and student-led health projects often adopt either sprawling
hospital systems or ad-hoc spreadsheets. Both create friction: patients
struggle to book simple visits, and project work is planned without explicit
risk handling. The assignment asks for a **smart healthcare application**
delivered through a **risk-aware project plan** — the process is as important
as the product.

### 5.2 Scope

**In scope (implemented):**

* Authentication and role-based access (patient, doctor, project manager)
  with hashed passwords, server sessions and CSRF protection.
* In-clinic appointment booking with specialty filtering, runtime-generated
  future dates, slot availability, review/confirmation, cancellation and
  doctor status updates — protected against duplicate bookings by a database
  constraint that holds under concurrent requests (HTTP 409 on conflict).
* Personal health logs limited to heart rate, temperature and blood pressure,
  with dual validation and owner-only access.
* In-app appointment reminders derived live from upcoming visits.
* A persistent risk register with 5×5 heatmap, metrics, filters, close/reopen
  and links to requirements, tasks and verification records.
* Lightweight plan, task and verification views; JIRA used as the official
  planning tool with a prepared import package.

**Out of scope (deliberately excluded, and removed from UI copy):** video
consultations; prescriptions/medication advice; payments; SMS/email/WhatsApp/
push delivery; AI diagnosis; offline sync; hospital integrations; complex
administration; extra dashboards.

### 5.3 Constraints and recorded risks about the brief itself

* Individual delivery: one student performing design, backend, frontend,
  testing, documentation and project management.
* Deadline conflict in the brief (5 Oct written vs 9 Oct portal) — planned
  against the earlier date until clarified.
* The design-reference export was not present in the delivered workspace and
  the external design links required sign-in; the visual identity was
  reconstructed from the documented design tokens (see
  docs/design-reference-status.md).

## 6. Design & Methodology

### 6.1 Method

A small iterative plan executed in a fixed order: (1) inspect reference and
establish the project, (2) backend schema, authentication and permissions,
(3) appointment flow, (4) health logs and doctor view, (5) risk and planning
views, (6) animation and responsive polish, (7) testing and evidence,
(8) documentation and submission package. JIRA (prepared import package,
docs/jira-backlog.csv) structures the work into 5 epics and 16 issues with
acceptance criteria; the in-app task board is a supporting artifact only.

### 6.2 Architecture

React 18 + Vite + TypeScript SPA → same-origin `/api` proxy → Flask +
SQLAlchemy → SQLite file. Detailed in the DDS; diagrams in `diagrams/`
(use-case, architecture, ER, appointment activity, appointment sequence).

### 6.3 Risk-aware planning

The risk register (six seeded risks, RISK-01…RISK-06) was written **before**
implementation and drove concrete controls:

* RISK-01 unauthorized access → sessions, RBAC, CSRF (implemented).
* RISK-02 duplicate booking → partial unique index + transactional insert
  (implemented, verified with a race test).
* RISK-03 invalid data entry → dual validation (implemented).
* RISK-04 database loss → file-backed DB + explicit backup command (control
  Planned/verified as a command, restore not rehearsed).
* RISK-05 development delay → small scope, ordered plan, 6-hour buffer,
  planning against the earlier deadline.
* RISK-06 stale reminders → reminders computed live from appointments.

Scores are illustrative planning estimates (probability × impact, academic
bands 1–4 Low, 5–9 Moderate, 10–16 High, 17–25 Critical) — project-risk
priorities, **not** clinical classifications. Controls begin as "Planned" and
move to "Implemented"/"Verified" only when evidence exists.

### 6.4 Design decisions

Duplicate-booking safety lives in the database (partial unique index on
doctor+date+time where status=CONFIRMED), so it holds across processes and
threads; cancellation releases slots because cancelled rows fall outside the
index. Reminders are derived, never stored, eliminating stale state. Role
isolation is enforced by query shape, not UI hiding. Validation limits for
health readings are technical input constraints — the app never interprets
readings clinically.

## 7. Implementation & Results

### 7.1 Technology

* Frontend: React 18, Vite 5, TypeScript, React Router, Motion for React;
  tokenized CSS; production build with installed dependencies (no CDN React,
  no runtime Babel).
* Backend: Flask 3, Flask-SQLAlchemy, SQLite; app factory; blueprints;
  environment-based configuration; idempotent seed command.
* Testing: pytest (42 tests), isolated file-backed databases per test, plus a
  live-server fixture that races two authenticated clients for the
  concurrency requirement.

### 7.2 Results actually obtained (4 October 2026)

* **Backend test suite: 42 passed, 0 failed** in 31.4 s
  (evidence: docs/evidence/pytest-run-2026-10-04.txt). Covers login/
  logout/CSRF/demo-mode, role guards, cross-patient denial, valid booking,
  duplicate booking by another patient, **concurrent booking race** (one 201,
  one 409), past-slot rejection, cancellation releasing a slot, unauthorized
  updates, invalid health-log input, risk validation/scoring, persistence and
  seed idempotency.
* **Frontend production build: success** (tsc strict + vite build;
  evidence: docs/evidence/frontend-build-2026-10-04.txt).
* **Live API smoke test through the dev proxy:** login 200 with CSRF token;
  booking 201; second patient on same slot 409; POST without CSRF 403;
  unauthenticated 401; doctor sees the patient's name on their own list only.
* The application's Verification view shows each requirement row with the
  real run date (2026-10-04) and the evidence log path.

### 7.3 What is explicitly NOT claimed

No JIRA project has been created or screenshotted yet (student actions,
guide in docs/jira-setup-guide.md). No demonstration video has been recorded
or published. No latency or load figures are quoted. No clinical safety or
readiness is claimed. Reflective experience in Chapter 11 is the student's
own to write.

## 8. Analysis & Interpretation

The risk-first approach paid off where it mattered: the highest-impact
technical risks (unauthorized access, duplicate booking) became database-
level controls with executable tests rather than late-stage fixes. The
concurrent-booking test caught nothing to fix only because the constraint was
designed first — evidence that constraint-first design de-risks the hardest
requirement (REQ-BOOK-02).

**Verification traceability** (Requirement → Risk → Control → Test →
Evidence) kept claims honest: prefilled "X tests passed"-style copy from the
design reference was replaced by rows that stay PENDING until a real run is
recorded, and estimated effort is structurally separated from actual hours.

**Limitations (honest):**

* Single-user Flask dev server and SQLite: fine for an academic prototype,
  not production-shaped for a real clinic.
* Timezones are handled by convention (UTC storage, IST display) rather than
  per-user timezone support.
* Browser-level checks (keyboard navigation, reduced motion in a real
  browser, mobile layout) were specified as a manual checklist rather than
  automated here; the student should run them before the demo (docs/testing-evidence.md §6).
* JIRA evidence and the demo video remain student actions; the rubric's
  "Implementation & Results" and "Report & Presentation" components depend on
  completing them.
* No claim of marks or grades is made; rubric alignment is documented, not
  guaranteed.

## 9. Conclusion & Future Scope

VEYORA meets the assignment's core demand: a **working**, deliberately small
healthcare prototype delivered through a **documented, risk-aware plan** with
real evidence. Booking is concurrency-safe; records are private by
construction; the project workspace ties requirements to risks to tests.

Future scope (not built, not claimed): patient self-service rescheduling;
doctor availability editing; a real notification channel if a delivery
provider is approved; a migration path to PostgreSQL for multi-user use; and
— only under clinical governance — any clinical interpretation features,
which would move the project into regulated territory beyond this course.

## 10. References

1. Assignment brief, Software Engineering Practices, Shah & Anchor Kutchhi
   Engineering College (2026) — including the recorded deadline discrepancy.
2. UN Sustainable Development Goal 3: Good Health and Well-being —
   https://sdgs.un.org/goals/goal3
3. Flask documentation — https://flask.palletsprojects.com/
4. SQLAlchemy documentation — https://docs.sqlalchemy.org/
5. React + Vite documentation — https://vitejs.dev/, https://react.dev/
6. Motion for React — https://motion.dev/
7. Atlassian JIRA CSV import documentation —
   https://support.atlassian.com/jira-cloud-administration/
8. OWASP CSRF Prevention Cheat Sheet — https://cheatsheetseries.owasp.org/
9. Python zoneinfo / IANA Time Zone Database (Asia/Kolkata) —
   https://docs.python.org/3/library/zoneinfo.html

## 11. Project Reflection

*(This section must be written by Krisha Mange in her own words, 400–500
words, describing her actual experience of planning, building, testing and
documenting the project. A question-by-question structure is provided in
docs/reflection-guide.md. Do not generate this section with AI and present it
as lived experience.)*

## 12. Report & Presentation Section

Submitted deliverables:

* This report (DOCX/PDF), SRS (docs/srs.md + DOCX), DDS (docs/dds.md + DOCX).
* Software design diagrams: diagrams/*.drawio with exported SVG images.
* JIRA planning package: docs/jira-backlog.csv + docs/jira-setup-guide.md.
* Classroom presentation: ~10 slides in VEYORA design language (PPTX).
* Demonstration script: docs/demo-script.md (3–5 minutes).

### Rubric alignment (evidence-based)

* **Problem Definition & Scope (15%):** Chapter 5, SRS scope, recorded
  deadline conflict, explicit exclusions.
* **Design & Methodology (20%):** Chapter 6, DDS, five design diagrams,
  risk-first controls.
* **Implementation & Results (25%):** working prototype, 42 passing tests
  with evidence logs, live smoke-test results, production build log.
* **Analysis & Interpretation (20%):** Chapter 8 including honest
  limitations; verification traceability; estimated-vs-actual separation.
* **Report & Presentation (20%):** this report with genuine heading styles
  and a real TOC field; PPTX; JIRA package; remaining student evidence listed
  below.

### Evidence of Completion

*(Student to complete before submission — placeholders must be replaced with
real artifacts.)*

1. JIRA backlog screenshot: [PLACEHOLDER — docs/evidence/jira/jira-01-backlog.png]
2. JIRA active sprint board: [PLACEHOLDER — docs/evidence/jira/jira-02-board-active.png]
3. JIRA completed work: [PLACEHOLDER — docs/evidence/jira/jira-03-board-done.png]
4. Demonstration video link (recorded and uploaded by Krisha Mange to
   LinkedIn/social media): [PLACEHOLDER — video link]
5. Test evidence log: docs/evidence/pytest-run-2026-10-04.txt (42 passed).
6. Frontend build log: docs/evidence/frontend-build-2026-10-04.txt.
