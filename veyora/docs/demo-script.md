# Demonstration script (3–5 minutes)

**Status note:** the video has NOT been recorded or published. This script is
for Krisha to record herself. Do not publish anything without her explicit
authorization.

## Setup before recording

```powershell
cd backend
python -m app.seed                       # idempotent; safe to re-run
$env:VEYORA_SECRET_KEY = "demo-secret"
$env:VEYORA_DEMO_MODE = "1"
python wsgi.py                           # terminal 1 → :5000

cd ../frontend
npm run dev                              # terminal 2 → :5173
```

Open `http://localhost:5173` in a clean browser profile. Optional: enable
screen recording, 1080p, system audio off (voice-over later is fine).

## Script

**0:00–0:25 · Title & context.**
"VEYORA — a risk-aware smart healthcare prototype for SDG 3, built
individually for Software Engineering Practices. Three roles: patient,
doctor, and project manager. I'll show booking, a real conflict, doctor
management, health logs, and the risk evidence behind them."

**0:25–0:55 · Landing & login.**
Show the landing page (floating phones, headline). Sign in as the patient
demo account. Mention: hashed passwords, HttpOnly session cookie, CSRF token
issued on login.

**0:55–2:00 · Booking flow.**
Book with Dr. Meera Iyer: filter by specialty → pick a future date →
pick a slot → review → confirm. Show the success state and the reminder in
the overview. Then: log out, sign in as the *second* patient, try the same
doctor/date/time → show the friendly conflict message (HTTP 409) keeping
doctor + date. Say: "The database's partial unique index makes this safe even
under concurrent requests — there's an automated race test for it."

**2:00–2:40 · Doctor view.**
Sign in as the doctor. Show the appointment list with the patient name, mark
the visit Completed, and note that only the treating doctor can do that and
the state is terminal.

**2:40–3:20 · Health logs.**
Back as the patient: add a heart-rate reading, show validation inline,
filter, show the chart, mention owner-only access and that limits are
technical, not clinical.

**3:20–4:30 · Risk & evidence.**
Sign in as project manager (Krisha Mange). Show the risk register + 5×5
heatmap; open RISK-02 (duplicate booking) and point at its control and link
to REQ-BOOK-02. Switch to the Verification view: show the real pytest run
date and evidence path. Open `docs/evidence/pytest-run-2026-10-04.txt`
briefly: "42 tests passed — that's the evidence, not a claim."

**4:30–5:00 · Close.**
"One student, one risk register, real evidence. Thank you."

## Upload instructions (student action)

1. Record with any screen recorder (OBS, Windows Snipping Tool video, Loom).
2. Keep it 3–5 minutes; trim mistakes rather than re-claiming them.
3. Upload to LinkedIn (or another social platform) as required by the brief —
   visibility settings are Krisha's choice.
4. Paste the public link into the final report under **Evidence of
   Completion**, replacing the placeholder.
5. Keep the raw file safe in case faculty ask for a re-upload.
