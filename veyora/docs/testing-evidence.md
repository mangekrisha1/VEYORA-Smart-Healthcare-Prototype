# Testing Evidence — VEYORA

All commands below were actually executed on **2026-10-04** (Linux sandbox,
Python 3.13, Node 20). Only results observed on that date are recorded.

## 1. Backend automated suite

Command (from `backend/`):

```
python -m pytest -v
```

Result: **42 passed in 31.42s** — full log saved to
`docs/evidence/pytest-run-2026-10-04.txt`.

| Area | Tests | Requirement covered |
| --- | --- | --- |
| Auth | correct/incorrect login, missing fields, logout invalidation, unauthenticated rejection, CSRF enforcement, demo-mode gating | REQ-AUTH-01…04 |
| Authorization | patient/doctor/PM cross-role denials, cross-patient log denial (no info leak), unauthorized appointment updates, slot response leaks no identity | REQ-AUTH-02, REQ-BOOK-06 |
| Appointments | valid booking, duplicate by other patient (409), same-patient double book (409), **concurrent race over live HTTP** (exactly one 201 + one 409), past slot 400, non-clinic slot 400, cancellation releases slot, COMPLETED only by doctor + terminal states, doctor sees only own | REQ-BOOK-01…05 |
| Health logs | create/list/filter all types, invalid type/range/type/value rejected, BP split fields + systolic≥diastolic, owner delete | REQ-LOG-01…03 |
| Risks & planning | seeded register, score = P×I, academic bands, invalid P/I rejected 400, close/reopen, search/filter, task workflow, plan metrics (actuals never fabricated), verification recording requires date + evidence | REQ-RISK-01, REQ-PLAN-01, REQ-VER-01 |
| Reminders | live derivation from appointments, mark-read, cancelled visit disappears, other patient's reminder 404 | REQ-REM-01 |
| Persistence | records survive app restart on file-backed DB; seed idempotency (no duplicates on re-run) | REQ-DATA-01 |

Test isolation: each test gets its own temporary **file-backed** SQLite DB
(`tmp_path`); the concurrency test runs a real WSGI server on a random port
and races two authenticated clients released by a barrier.

## 2. Frontend production build

Command (from `frontend/`):

```
npm run build     # tsc -b (strict) && vite build
```

Result: build succeeded — evidence in
`docs/evidence/frontend-build-2026-10-04.txt` (340.8 kB JS / 24 kB CSS,
gzip 106.8 kB / 5.5 kB). No CDN React or runtime Babel is used.

## 3. Live API smoke test (through the Vite /api proxy)

Executed with `curl` against `http://127.0.0.1:5173`:

| Check | Result |
| --- | --- |
| GET /api/meta | 200 `{app_name: VEYORA, display_timezone: Asia/Kolkata}` |
| Login patient (correct password) | 200 + CSRF token |
| GET /api/doctors | 200 with runtime-generated future working days |
| POST /api/appointments (valid future slot) | 201 CONFIRMED |
| Same slot, second patient | **409 slot_taken** |
| POST /api/health-logs without CSRF header | 403 csrf |
| GET /api/appointments without session | 401 |
| PM GET /api/health-logs | 403 |
| Doctor GET /api/appointments | 200, includes patient name for own appointment only |
| Demo-login with demo mode on | 200 |

## 4. Data recorded in the application

After the run above, the Verification view was updated with real results:
10 automated rows set to PASS with run date 2026-10-04 and evidence source
`docs/evidence/pytest-run-2026-10-04.txt (42 passed)`.

## 5. What was NOT done (honest limitations)

* No automated browser (Playwright/Puppeteer) run was performed in the build
  environment.
* No load/performance benchmarking; no latency figures quoted anywhere.
* JIRA-side actions (import, sprint, screenshots) are pending student work.

## 6. Manual browser checklist (student, before the demo video)

Run through the real UI and note pass/fail honestly:

1. Landing loads; headline animates once; phones float gently.
2. Sign in as each demo account; wrong password shows the error message.
3. Full booking flow: doctor → specialty filter → date → slot → review →
   success toast. Book the same slot as the other patient and confirm the
   friendly 409 message keeps doctor + date.
4. Save a heart-rate log, filter it, see the chart, delete it.
5. As the doctor: mark the visit completed; try to reopen it (should refuse).
6. As PM: edit a risk's probability; watch score/band/heatmap update;
   close and reopen it.
7. Mobile width (~390 px): sidebar becomes drawer; tables scroll; layout sane.
8. Keyboard-only pass: Tab through booking flow; Esc closes modals/drawers.
9. Enable OS "reduce motion": floats/transitions disappear, app still works.
10. Refresh after booking: appointments persist.
