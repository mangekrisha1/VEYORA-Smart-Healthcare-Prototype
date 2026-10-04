# Detailed Design Specification — VEYORA

**Student:** Mange Krisha Ashok · TYCS_68 · 125BTCS2004 · Shah & Anchor Kutchhi Engineering College
**Version:** 1.0 · Date: 2026-10-04

## 1. Architecture

Three logical tiers, deliberately simple:

1. **Presentation:** React 18 + Vite + TypeScript SPA. React Router for
   navigation. Motion for React for purposeful transitions (150–250 ms) with
   `MotionConfig reducedMotion="user"` honoring `prefers-reduced-motion`.
   Tokenized CSS (`tokens.css`, `global.css`, `app.css`) — one styling system.
   No CDN React and no runtime Babel: installed dependencies and a normal
   production build.
2. **Application/API:** Flask blueprints under `/api/*`. App factory
   (`create_app`) wires SQLAlchemy, a CSRF `before_request` guard, JSON error
   handlers and blueprint registration.
3. **Data:** SQLAlchemy ORM over a local SQLite file
   (`backend/veyora.db`, overridable via `VEYORA_DB_PATH`). Timestamps stored
   in UTC; appointment dates/times are Asia/Kolkata wall-clock values; the
   frontend displays everything in IST.

The Vite dev server proxies `/api` to `127.0.0.1:5000`, keeping cookies and
CSRF same-origin. Diagrams: `diagrams/architecture.{drawio,svg}`.

### Modules

| Module | Responsibility |
| --- | --- |
| `app/auth.py` | Session user lookup, CSRF token issue/verify, `require_auth` / `require_role` decorators |
| `app/schedule.py` | Weekly doctor rosters; slot generation from the runtime IST date; bookability checks |
| `app/api/auth_routes.py` | login / demo-login / logout / me |
| `app/api/doctors.py` | Doctor list + slot availability (patient role only) |
| `app/api/appointments.py` | Create (201/409), list (role-scoped), PATCH transitions |
| `app/api/health_logs.py` | Owner-scoped CRUD + dual validation |
| `app/api/reminders.py` | Live-computed reminders + mark-read |
| `app/api/pm_workspace.py` | Risks, tasks, milestones, verification, plan (PM role only) |
| `app/seed.py` | Idempotent seed (`--reset` explicit dev-only wipe) |
| `app/backup.py` | Copy-based DB backup (control for RISK-04) |

## 2. Data model

See `diagrams/er-diagram.{drawio,svg}`. Tables:

* **users** — id, name, email (unique), password_hash, role
  (PATIENT/DOCTOR/PROJECT_MANAGER), specialty (doctors), created_at (UTC).
* **appointments** — id, FK patient_id, FK doctor_id, date, start_time
  ("HH:MM" IST), status, created_at/updated_at (UTC). Partial unique index
  `uq_active_slot` on (doctor_id, date, start_time) WHERE status='CONFIRMED'.
* **health_logs** — id, FK patient_id, type, value, systolic, diastolic, note,
  taken_at (UTC).
* **reminder_reads** — composite PK (user_id, appointment_id), read_at.
* **risks** — id, code (RISK-01…), title, description, category, probability
  1–5 (CHECK), impact 1–5 (CHECK), score computed as P×I, owner, mitigation,
  contingency, status, control_status, review_date, linked_* fields.
* **tasks** — id, title, description, status (TODO/IN_PROGRESS/DONE),
  priority, owner, FK risk_id, jira_key, jira_url.
* **milestones** — id, title, due_date, status, notes.
* **verification_records** — id, req_id, req_text, risk_code, control,
  test_name, expected, result (PENDING/PASS/FAIL), kind (automated/manual),
  run_date, evidence_source.

Design decisions:

* **Duplicate booking safety** lives in the database, not application logic:
  the partial unique index holds across processes and threads; the API catches
  `IntegrityError`, rolls back and returns 409. Cancelled/completed rows do
  not block slots, so cancellation naturally releases them.
* **Reminders are derived, not stored**, eliminating stale-reminder drift
  (control for RISK-06).
* **Role data isolation** is enforced by query shape: every patient-scoped
  query filters by the session user's ID; doctor listings include patient
  names only for the treating doctor's own appointments; slot responses
  expose no identities.

## 3. API design

All endpoints are JSON; errors return `{error, message}` with proper status.

| Method & path | Role | Purpose | Key statuses |
| --- | --- | --- | --- |
| POST /api/auth/login | public | Authenticate, issue session + CSRF | 200 / 401 / 400 |
| POST /api/auth/demo-login | public (demo mode only) | Shortcut for seeded accounts | 200 / 403 / 404 |
| POST /api/auth/logout | auth | Clear session | 200 |
| GET /api/auth/me | any | Session state + CSRF token | 200 |
| GET /api/doctors | PATIENT | Doctors + working days | 200 |
| GET /api/doctors/:id/slots?date= | PATIENT | Slot availability (no identities) | 200 / 400 / 404 |
| POST /api/appointments | PATIENT | Book a slot | 201 / 409 / 400 |
| GET /api/appointments | PATIENT/DOCTOR | Own list (role-scoped) | 200 |
| PATCH /api/appointments/:id | PATIENT/DOCTOR | Cancel (owner) / COMPLETED, CANCELLED (treating doctor) | 200 / 400 / 403 / 404 |
| GET /api/reminders | PATIENT | Live upcoming-visit reminders | 200 |
| POST /api/reminders/:id/read | PATIENT | Mark reminder read | 200 / 404 |
| GET/POST/PATCH /api/health-logs | PATIENT | Owner-only logs CRUD | 200 / 201 / 400 / 404 |
| GET/POST/PATCH /api/risks | PM | Register + metrics | 200 / 201 / 400 |
| GET/POST/PATCH /api/tasks | PM | Task board | 200 / 201 / 400 |
| GET/PATCH /api/milestones | PM | Milestone status | 200 / 400 |
| GET /api/verification | PM | Traceability rows | 200 |
| POST /api/verification/:id/record | PM | Record real result + evidence | 200 / 400 |
| GET /api/plan | PM | Objectives, scope, WBS, effort, metrics | 200 |
| GET /api/meta | any | App name, timezone, demo flag | 200 |

CSRF: every state-changing route (except the two login routes, which are
password-protected and regenerate the session) requires an `X-CSRF-Token`
header matching the session token (constant-time compare). GET/HEAD/OPTIONS
are exempt.

## 4. Role permission matrix

| Capability | Patient | Doctor | PM |
| --- | --- | --- | --- |
| Own appointments: view/cancel | ✔ | ✔ (own only; may complete/cancel) | ✘ |
| Book appointments | ✔ | ✘ | ✘ |
| Health logs | ✔ (own only) | ✘ | ✘ |
| Slot availability | ✔ | ✘ | ✘ |
| Reminders | ✔ | ✘ | ✘ |
| Risk register / tasks / plan / verification | ✘ | ✘ | ✔ |

No role has unrestricted browsing of other users' records.

## 5. Frontend design

* **Routes:** `/` landing (dark hero #101C19, floating phones, headline
  "A little less complexity. A lot more care."), `/login`, `/app/*` inside an
  AppShell (sidebar + topbar, drawer nav on mobile) with per-role guards.
* **Components:** AppShell, Sidebar/NavList, Header/Topbar, Button, Card,
  Field, Modal, Drawer, Toast, StatusBadge, RiskMatrix, DataTable, EmptyState.
* **Design tokens:** background #F7F8F5; surfaces #FFFFFF; text #182521;
  muted #66756F; accent #096C60; sage #E8F1EC; borders #DEE5DF; hero #101C19;
  Manrope font stack; rounded cards; thin borders; restrained shadows.
* **Animation policy:** gentle hero float (paused offscreen via
  IntersectionObserver), one-time headline entrance, section reveals,
  dialog/drawer entrances, booking-success check draw — all 150–250 ms, all
  disabled under `prefers-reduced-motion`. No scroll hijacking, cursor trails,
  forced intros or animated clinical alarms.
* **Timezone display:** all timestamps rendered with `timeZone:
  'Asia/Kolkata'`; appointment dates are IST date strings from the server.

## 6. Validation & error handling

* Frontend validates before submit (type, ranges, required fields); backend
  re-validates everything and is authoritative.
* Validation limits are technical input constraints; no clinical meaning is
  attached or displayed.
* Errors: 400 (validation), 401 (unauthenticated), 403 (forbidden/CSRF), 404
  (missing or not-owned — indistinguishable to avoid information leaks),
  409 (slot conflict), 405/500 JSON fallbacks.
* Status transitions validated server-side against
  `ALLOWED_TRANSITIONS` (CONFIRMED → COMPLETED|CANCELLED only).

## 7. Security design summary

Hashed passwords (werkzeug scrypt); HttpOnly SameSite=Lax session cookies
(Secure flag available via `VEYORA_SECURE_COOKIES=1`); per-session CSRF token
in `X-CSRF-Token`; session regeneration on login; secrets via environment
(`VEYORA_SECRET_KEY`), never committed; dev proxy keeps API same-origin;
authorization checks on every endpoint; no secret material in source control
(`.env` files ignored; `.env.example` documents variables).

## 8. Testing design

pytest with an app factory over **isolated file-backed SQLite DBs** per test
(`tmp_path`). A `live_server` fixture runs the real WSGI server so the
concurrent-booking test races two authenticated HTTP clients at a barrier.
Suite: auth (login/logout/CSRF/demo), authorization (role + cross-patient),
appointments (valid, duplicate, concurrent, past, cancellation, transitions),
health logs, risks/tasks, reminders, persistence and seed idempotency.
Evidence logs: `docs/evidence/`.
