# VEYORA

**Risk-Aware Project Plan for Development of a Smart Healthcare Application**
Student: Mange Krisha Ashok · Roll: TYCS_68 · PRN: 125BTCS2004 ·
Shah & Anchor Kutchhi Engineering College · Software Engineering Practices ·
Individual · SDG 3 — Good Health and Well-being

> “A little less complexity. A lot more care.”

VEYORA is a minimal, working smart healthcare prototype with a genuinely
risk-aware project plan: real authentication, concurrency-safe appointment
booking, private health logs, in-app reminders, and a project workspace
(risk register with 5×5 heatmap, plan, tasks, verification & traceability)
backed by a real Flask + SQLite backend.

---

## What was built

| Module | Status |
| --- | --- |
| Auth (hashed passwords, HttpOnly SameSite sessions, CSRF) | ✅ implemented + tested |
| Role-based access (patient / doctor / project manager) | ✅ implemented + tested |
| Appointment booking (doctor → date → slot → review, 409 on conflict) | ✅ implemented + tested incl. a concurrency race |
| Cancellation + doctor status transitions | ✅ implemented + tested |
| Health logs (HR / temperature / BP) with dual validation | ✅ implemented + tested |
| In-app appointment reminders (live-derived, mark-read) | ✅ implemented + tested |
| Risk register + heatmap + metrics | ✅ implemented + tested |
| Plan / task board / verification views | ✅ implemented + tested |
| JIRA planning package (CSV + setup guide) | ✅ prepared — import/screenshots are student actions |
| SRS, DDS, final report (DOCX, real TOC field), PPTX | ✅ generated in `docs/out/` |
| 5 design diagrams (Draw.io + SVG) | ✅ in `diagrams/` |
| Automated tests | ✅ 42 passed (2026-10-04, evidence in `docs/evidence/`) |
| Demo video | ⬜ not recorded — script in `docs/demo-script.md` (student action) |

Explicitly **excluded** (and absent from UI copy): video consultations,
prescriptions, payments, SMS/email/WhatsApp/push, AI diagnosis, offline sync,
hospital integrations, complex administration.

## File structure

```
veyora/
├── backend/                  Flask + SQLAlchemy + SQLite
│   ├── app/                  app factory, models, auth, schedule, seed, backup
│   │   └── api/              auth, doctors, appointments, health-logs,
│   │                         reminders, pm-workspace blueprints
│   ├── tests/                42 pytest tests (isolated file DBs + live race)
│   ├── config.py             env-based configuration
│   ├── wsgi.py               dev entry point
│   └── requirements.txt
├── frontend/                 React 18 + Vite + TypeScript + Motion
│   └── src/
│       ├── components/       AppShell, ui primitives, RiskMatrix
│       ├── pages/            Landing, Login, patient/, doctor/, pm/
│       ├── state/            AuthContext, ToastContext
│       └── styles/           tokens.css, global.css, app.css
├── docs/
│   ├── srs.md · dds.md · final-report.md        Markdown sources
│   ├── jira-backlog.csv · jira-setup-guide.md   JIRA package
│   ├── demo-script.md · reflection-guide.md
│   ├── testing-evidence.md · design-reference-status.md
│   ├── evidence/             real run logs (pytest, build)
│   ├── generate_docs.py      regenerates all DOCX/PPTX
│   └── out/                  SRS.docx · DDS.docx · Final_Report.docx ·
│                             VEYORA_Presentation.pptx
├── diagrams/                 5 × .drawio + matching .svg exports
└── design-reference/         reserved for the original export (see status doc)
```

## Setup (Windows PowerShell)

Prereqs: Python 3.11+ and Node 18+ on PATH.

```powershell
# --- clone/copy the project, then ---
cd veyora\backend

python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# one-time environment (per shell session)
$env:VEYORA_SECRET_KEY = "change-me-to-a-long-random-string"
$env:VEYORA_DEMO_MODE  = "1"        # enables demo-login shortcuts (local only)

# idempotent seed — safe to re-run; never overwrites existing records
python -m app.seed

python wsgi.py                        # API on http://127.0.0.1:5000
```

Second terminal:

```powershell
cd veyora\frontend
npm install
npm run dev                           # UI on http://localhost:5173
```

Open http://localhost:5173. The dev server proxies `/api` to Flask, so the
browser only talks to one origin.

### Useful commands

```powershell
# backend tests (isolated file DBs; safe to run anytime)
cd backend ; python -m pytest -v

# production frontend build
cd frontend ; npm run build

# explicit DB backup (control for RISK-04)
cd backend ; python -m app.backup

# DEV-ONLY full reset (asks for typed confirmation)
cd backend ; python -m app.seed --reset

# regenerate all DOCX/PPTX deliverables
python docs\generate_docs.py
```

## Local demo credentials

| Role | Email | Password |
| --- | --- | --- |
| Patient | aarav.shah@veyora.demo | Patient@123 |
| Patient | priya.nair@veyora.demo | Patient@123 |
| Doctor (Cardiology) | meera.iyer@veyora.demo | Doctor@123 |
| Doctor (General Medicine) | rohan.deshpande@veyora.demo | Doctor@123 |
| Project manager | krisha.mange@veyora.demo | Veyora@123 |

All identities are fictional. With `VEYORA_DEMO_MODE=1` the login page also
offers one-click demo sign-in that still authenticates through the backend.

## Actual verification results (2026-10-04)

* **Backend:** `python -m pytest -v` → **42 passed** in 31.4 s
  (`docs/evidence/pytest-run-2026-10-04.txt`). Includes a true race: two
  authenticated clients hit one slot concurrently → exactly one 201 and one 409.
* **Frontend:** `npm run build` (strict TS) → success
  (`docs/evidence/frontend-build-2026-10-04.txt`).
* **Live smoke via dev proxy:** login 200 + CSRF; booking 201; duplicate 409;
  no-CSRF POST 403; unauthenticated 401; PM blocked from patient endpoints 403.
* The in-app Verification view carries the same results with run date and
  evidence path. See `docs/testing-evidence.md` for commands and the manual
  browser checklist that remains for the student.

## Known limitations (honest)

* Academic prototype: Flask dev server + SQLite; not sized or hardened for
  real clinical use. No clinical interpretation of readings, ever.
* Timezone handling is by convention (UTC storage, IST display).
* Automated browser checks were not run in the build environment; a manual
  checklist is provided (docs/testing-evidence.md §6).
* The supplied design-reference export was missing from the workspace and the
  external design links require sign-in; the visual identity was rebuilt from
  the documented token set (docs/design-reference-status.md).
* Deadline conflict recorded: written submission 5 Oct 2026 vs portal
  9 Oct 2026 23:59 — planned against the earlier date until clarified.

## JIRA setup (student actions)

1. Create a Scrum project `VEY` in JIRA.
2. Import `docs/jira-backlog.csv` and map fields per
   `docs/jira-setup-guide.md` (not every JIRA template accepts every column).
3. Plan a short sprint, move issues as real work happens (no backdating).
4. Capture backlog / active-board / completed-work screenshots into
   `docs/evidence/jira/` and insert them under **Evidence of Completion**.

Nothing in this repository claims JIRA issues were created until those steps
are actually performed.

## Remaining student actions

1. ⬜ Import the JIRA backlog, run the sprint, take screenshots.
2. ⬜ Run the manual browser checklist (docs/testing-evidence.md §6).
3. ⬜ Write the 400–500-word personal reflection (docs/reflection-guide.md)
   into the report's Chapter 11.
4. ⬜ Record the 3–5-minute demo (docs/demo-script.md), upload it to
   LinkedIn/social media, paste the link under Evidence of Completion.
5. ⬜ Fill certificate/signature fields; open Final_Report.docx in Word and
   update the TOC field (F9).
6. ⬜ Submit by the clarified deadline (planned against 5 Oct 2026).

## Requirement → deliverable checklist

| Requirement | Deliverable | Where |
| --- | --- | --- |
| Working prototype | Flask + React app | `backend/`, `frontend/` |
| JIRA or similar PM tool | Backlog CSV + setup guide | `docs/jira-backlog.csv`, `docs/jira-setup-guide.md` |
| Software design diagrams | 5 Draw.io + SVG | `diagrams/` |
| SRS and DDS | Markdown + DOCX | `docs/srs.md`, `docs/dds.md`, `docs/out/` |
| Final report DOCX | Exact 12-chapter order, real TOC field | `docs/out/Final_Report.docx` |
| Actual testing evidence | 42-test run + build log + smoke log | `docs/evidence/`, `docs/testing-evidence.md` |
| Demonstration video | Script + upload instructions (not yet recorded) | `docs/demo-script.md` |
| Classroom PPT | 10-slide PPTX in VEYORA style | `docs/out/VEYORA_Presentation.pptx` |
| Personal reflection (400–500 words) | Guide for Krisha; text is hers to write | `docs/reflection-guide.md` |
| Deadline discrepancy recorded | Title page + report Ch. 5 | `docs/final-report.md` |
| SDG 3 alignment | Throughout SRS/report/PPT | — |

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `VEYORA_SECRET_KEY` | insecure dev fallback (warns loudly) | session signing — always set it |
| `VEYORA_DEMO_MODE` | `0` | `1` enables demo-login shortcuts locally |
| `VEYORA_DB_PATH` | `backend/veyora.db` | SQLite file location |
| `VEYORA_SECURE_COOKIES` | `0` | `1` when served over HTTPS |

Secrets live only in environment variables; `.env` files are git-ignored.
