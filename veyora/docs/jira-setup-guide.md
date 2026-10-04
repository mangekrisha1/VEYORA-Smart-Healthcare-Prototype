# JIRA Setup Guide — VEYORA (student actions)

JIRA is the official academic planning tool for this submission. The in-app
task board in VEYORA is only a small supporting view; the real planning
evidence lives in JIRA.

> Status note (4 Oct 2026): authenticated JIRA access was not available in the
> build environment, so the package below is prepared and verified for import,
> but **creating the JIRA project, importing issues and taking screenshots are
> student actions**. Nothing in the report claims JIRA issues were created
> until these steps are completed.

## What is provided

| File | Purpose |
| --- | --- |
| `docs/jira-backlog.csv` | 5 epics + 16 issues with summary, type, priority, epic grouping, story points, labels, description and acceptance criteria |
| This guide | Step-by-step JIRA setup and evidence capture |

## 1. Create the project

1. Sign in to JIRA (Atlassian Cloud free plan is sufficient).
2. **Create project → Scrum** (classic or team-managed both work).
3. Name it `VEYORA — Smart Healthcare Prototype`, key `VEY`.
4. Add yourself (Krisha Mange) as the only team member.

## 2. Import the backlog

1. **Projects → VEY → Import issues** (top-right ⋯ menu on Cloud:
   *Import data → CSV*).
2. Upload `docs/jira-backlog.csv`.
3. Field mapping — CSV import supports only a subset of fields; map these:

   | CSV column | JIRA field | Notes |
   | --- | --- | --- |
   | Summary | Summary | direct |
   | Issue Type | Issue Type | Epic/Story/Task must exist in the project |
   | Priority | Priority | map High/Critical/Medium to project values |
   | Epic Name | Epic Link / Epic Name | team-managed projects may need manual epic linking after import |
   | Story Points | Story Points | may appear as a custom field; skip if unavailable |
   | Labels | Labels | direct |
   | Description | Description | acceptance criteria are embedded in the description text |
   | Acceptance Criteria | — | copy into the description manually if your instance has a dedicated field |

   Not every JIRA project template accepts identical import fields — skip any
   column your instance rejects and fix those issues manually afterwards.
4. After import, verify each issue shows its description and acceptance criteria.

## 3. Plan a short sprint

1. Open the **Backlog** view; ensure the 5 epics group the stories.
2. Create `Sprint 1` (suggest 2 weeks starting immediately).
3. Drag VEY-01…VEY-13 into the sprint (planning, implementation, testing).
4. Leave VEY-14…VEY-16 in the backlog initially; pull them in as work starts.
5. **Start sprint**.

## 4. Move work through the workflow

As each piece of real work is done, transition the issue
`To Do → In Progress → Done` **on the day it actually happens** — do not
backdate. Recommended order matches the implementation order:
VEY-04 → VEY-05 → VEY-06 → VEY-07 → VEY-08 → VEY-09 → VEY-10 → VEY-11 →
VEY-12 → VEY-02 (review) → VEY-13 → VEY-14.

## 5. Link risks and evidence inside JIRA

* On VEY-07 add a comment referencing `RISK-02` and the test file
  `backend/tests/test_appointments.py` (duplicate + concurrency tests).
* On VEY-04/VEY-05 comment `RISK-01` and the authorization tests.
* On VEY-13 attach `docs/evidence/pytest-run-2026-10-04.txt`.
* Link issues to each other (*blocks*, *relates to*) where obvious.

## 6. Capture evidence screenshots (required for the report)

Save each screenshot to `docs/evidence/jira/` with clear names:

1. `jira-01-backlog.png` — full backlog grouped by epics.
2. `jira-02-board-active.png` — active sprint board with issues in progress.
3. `jira-03-board-done.png` — board after moving completed work to Done.
4. `jira-04-issue-detail.png` — one issue detail showing acceptance criteria
   (VEY-07 is the best example).

Insert them into the final report under **Evidence of Completion** in the
marked placeholders. Never fake or edit screenshots, and never mark an issue
Done before the work is genuinely complete.
