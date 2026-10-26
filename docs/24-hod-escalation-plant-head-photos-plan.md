# 24. HOD on every observation report, overdue-closure email alerts, Plant Head visibility, photographs in the weekly report

Implementation plan. It builds on [21](21-weekly-inspection-pdf-plan.md) and [23](23-reports-page-plan.md) (reports), [19](19-remove-tickets-plan.md) (closure workflow), [18](18-entra-sso-plan.md) (Entra accounts and their email addresses) and [20](20-dashboard-assignment-editing-plan.md) (dashboard). It follows the layering in [02-architecture.md](02-architecture.md), the conventions in `CLAUDE.md` and the visual rules in [20-ui-design-reference.md](20-ui-design-reference.md).

**Goal**

1. **Email alerts over SMTP** to HODs and Plant Heads, sent to the email address on their account, which for Entra users is their company address from the directory.
2. **An HOD on every observation report.** When the auditor files a report with observations, they **must** pick the auditee's HOD from a list of the plant's HOD users. HODs remain ordinary users in every other respect: they can be auditors and auditees.
   - If the auditee has not closed the observation report **15 days** after it was generated, its HOD gets an email naming the auditee, the observation report and the date it was generated.
   - At **30 days**, the location's Plant Head gets the same email.
3. **Plant Head visibility.** A Plant Head keeps every normal-user privilege and can also **see all data for their location** (every unit and zone), every dashboard and every report.
4. **Photographs in the weekly report.** The weekly report, both on the Report page and in the PDF, shows each zone's observation photographs.

## Answers from the business, and what changed in the plan (2026-10-26)

These came back after the plan was written and **override the decisions below where they differ**. All are implemented.

| # | Answer | Effect |
|---|---|---|
| A1 | **There is a set of HODs for each location.** | Confirms D4: the HOD list is the HODs of the patrol's own location, chosen by `users.plant_id` and the `HOD` role. |
| A2 | **HOD and Plant Head closures should be removed: that is the EHS Officer's responsibility.** (Q6) | `POST /api/closures/:id/approve`, `/reject` and `GET /api/closures/pending-approvals` are now `PLANNING_ROLES` only (EHS Officer, Admin), no longer `MANAGEMENT_ROLES`. D18 is replaced. HOD and Plant Head keep read access to a plant's closures (D17) but can never approve, reject or edit. |
| A3 | **Users (auditors and auditees) with pending closures or observation reports get an alert email every Monday for past closures.** | New **D24**: the Monday reminder, below. |
| A4 | **The year starts on 1 April: this year week 1 starts on Monday 6 April.** | New **D23**: the company year, below. |

**D23. The company year runs 1 April to 31 March.** Week 1 is the week starting on the **first Monday on or after 1 April** (Monday 6 April 2026, Monday 7 April 2025, Monday 5 April 2027). A year is named by the calendar year it starts in and written "2026-27". A week belongs to the year of its Monday, so the week starting Monday 30 March 2026 is the last week of 2025-26. Everything that was "ISO week" or "calendar year" is now this:

- **Week numbers** everywhere (the dashboard's "Week N", the week card, the observation form's "Week number", the zone-by-week spreadsheet's `W<n>` columns, the reports). One implementation: `backend/src/shared/fiscalYear.js`.
- **Reports:** the weekly report's period is "Week N, FY 2026-27"; the yearly report covers 1 April to today (current year) or to 31 March (past year), its `year` parameter is the start year (2026 means April 2026 to March 2027), and the "go to week" jump takes the week number and the start year. Week 53 exists only in a year whose week 1 is followed 53 weeks later by the next year's week 1 (2024-25 has one; 2026-27 has 52 weeks).
- **Year-to-date metrics** on the dashboard start on 1 April.
- **The roster** and **zone reassignment** run to 31 March, the end of the company year, instead of 31 December.
- **Unchanged:** the dashboard's month calendar (it browses calendar months), report numbers (`POR-<calendar year>-…`), and "reports are due by Thursday of the audit week".

**D24. Monday reminder to auditors and auditees.** Every Monday after `ALERT_SEND_TIME` (in `ALERT_TIMEZONE`), each active user with an email address who has work still open **from earlier weeks** gets **one** email listing it:

- as **auditor**: audits dated before this week's Monday that are still `SCHEDULED` or `IN_PROGRESS` with no observation report, with the days since the report was due (Thursday of the audit's week);
- as **auditee**: closures for reports generated before this week's Monday that are still `OPEN`, `IN_PROGRESS` or sent back for rework (`REEXAMINATION_REQUIRED`, legacy `REJECTED`), with the report number, generation date and days open, and a link.

Nothing is sent to someone with nothing open. One email per person per Monday, recorded in `weekly_digest_log (user_id, digest_date)`, so a restart or a second instance never repeats it. The same run and the same advisory lock as the escalation alerts.

**What was not built, because it was already there.** D17's new **"All of {plant}" tab** is not needed: `GET /api/observations/history` already returns **every report at the caller's plant** to a management user (`findReportHistory` with `managementScope`), so the Plant Head's, and the officer's and HOD's, existing **"Past 6 months"** tab is the plant-wide list. A Plant Head also reads any closure at their plant (D17, `findClosureByIdForViewer`), the officer's week card, every report and the zone-by-week spreadsheet.

**Also fixed on the way** (backlog 3.13): the management calendar and current-week queries now filter to the viewer's plant.

## Before you start

- Run `git status`. The last commits are `d7bc870` (Report page) and `0717aa8` (application proxy sign-in). Build on them.
- Host Node is v12 and cannot run this code. Build and verify in Docker, using the scratch-directory and `docker run … node:22-alpine` patterns from docs/21 and docs/23. A Playwright container (`mcr.microsoft.com/playwright:v1.49.1-noble`, `--network host`) was used to check docs/23's pages and works against `https://localhost`.
- There are no tests and no linter. Match the surrounding heavily line-broken style and comment density.
- What exists today, and what this plan relies on:
  - **Plant-level read access is already there:** `observation.repository.js` `findReportByIdForUser` and the item photograph query let a management user (`EHS_OFFICER`, `HOD`, `PLANT_HEAD`, `ADMIN`) at the **same plant** open any report and its photographs. `GET /api/observations/:reportId/items/:itemId/photograph` serves one observation's photograph.
  - **Closure reads are narrower:** `closure.repository.js` `findClosureByIdForUser` only admits the patrol's auditor, auditee and EHS Officer, with no plant-management branch (backlog 3.17).
  - **Dashboard:** `dashboard.service.js` gives every management role a plant-wide view, and only `EHS_OFFICER` gets `officerWeek`. The management calendar query may still lack a plant filter (backlog 3.13; check `findManagementMonthlyPatrols`).
  - **Report page:** `REPORT_ROLES` is `[EHS_OFFICER]`. The yearly `.xlsx` is `PLANNING_ROLES` at `/api/patrols/inspection-report`.
  - **File storage:** `shared/storage/storedFiles.js` can stream a stored file (`sendStoredFile`), and `sharePointClient.js` has `downloadFile(reference)`, but there is no read-to-buffer helper.
  - **Image decoding:** `sharp` is installed. `middleware/compressUploadedImages.js` restricts it to the JPEG and PNG decoders (`sharp.block`), so SVG cannot be rasterised.
  - **Email:** nothing sends email today, and there is no scheduler.

## Decisions

| # | Decision | Why |
|---|---|---|
| **Email** | | |
| D1 | **`nodemailer`** over SMTP, configured by environment variables (see [Configuration](#configuration)). Works with authenticated SMTP (user and password) and with an unauthenticated relay (an IP-allowed Exchange connector or an on-premises relay). Off by default: email is enabled only when `SMTP_HOST` is set. Setting some SMTP variables but not `SMTP_HOST` and `SMTP_FROM` fails at boot, like Entra's partial configuration. | It is what the requirement asks for and runs in the existing container. See Q1 on Microsoft 365. |
| D2 | **Recipients are `users.email`** of active accounts. For Entra users this is the address from the directory, refreshed at every sign-in. An account with no email, or an inactive one, is skipped and logged as a `warn`, never an error. | One source of truth for who someone is. |
| **HOD on the report** | | |
| D3 | **New column `observation_reports.hod_id`** (`BIGINT REFERENCES users(id)`, nullable), migration 020. Required by the API for a report **with observations**, filed through `POST /api/observations`. Not asked for, and left `NULL`, on a "no observation to record" report (nothing to close) and on every report filed before this change. | A report with nothing to close needs no escalation path. Old reports cannot be back-filled honestly. |
| D4 | **Who can be chosen:** an **active** user at the **patrol's plant** who holds the `HOD` role, and who is **not the patrol's auditee**. The auditor may be the HOD. Anything else is rejected with `400 INVALID_HOD`. The list comes from a new `GET /api/observations/hod-options?patrolId=`, which only the patrol's auditor may call. | Escalating an auditee's lateness to the auditee would achieve nothing. Plant scope keeps one plant's HODs out of another's reports. |
| D5 | **A plant with no HOD cannot file reports with observations.** The form shows "No HOD is set up for your location. Ask the EHS Officer or an administrator to assign the HOD role." and disables Submit. "No observation to record" still works. | The requirement makes the HOD mandatory. A silent bypass would break the escalation without anybody noticing. See Q2. |
| D6 | **The HOD is shown wherever the report is:** the observation detail, the closure page's observation summary, the weekly report (on screen and in the PDF) and the alert emails. It **cannot be changed** after filing in this change (Q3). | It is recorded metadata of the report. |
| **Escalation** | | |
| D7 | **"Closed by the auditee"** means the closure has reached `SUBMITTED_FOR_CLOSURE` or `APPROVED`. A closure still `OPEN` or `IN_PROGRESS`, or sent back (`REEXAMINATION_REQUIRED`, legacy `REJECTED`), is **not** closed. | The auditee's part ends when they send the action plans for approval. Waiting on the EHS Officer is not the auditee's delay. See Q4. |
| D8 | **Day count:** from the report's generation date, its `submitted_at` taken as a calendar date in `ALERT_TIMEZONE` (default `Asia/Kolkata`). A report is **due for the HOD alert** on the morning of day 15 (`generated date + 15 days <= today`) and **for the Plant Head alert** on day 30 (`+ 30`), while it is still not closed (D7). | Whole calendar days in the plant's time zone are what people count. |
| D9 | **Each alert level is sent once per report.** A new table `observation_alerts (observation_report_id, level, recipient_user_id, sent_at)` with `UNIQUE (observation_report_id, level, recipient_user_id)` records every successful send. A closure that is later sent back does not cause a second alert. | No repeated mail. The table is also the audit trail of who was told and when. See Q5 for reminders. |
| D10 | **Who gets level 2:** every active `PLANT_HEAD` at the report's plant (`users.plant_id`). If there is none, log a `warn` and record nothing, so the alert goes out once a Plant Head exists. | "The Plant Head" of the location. A plant may briefly have none or two. |
| D11 | **Only reports with an HOD escalate** (`hod_id IS NOT NULL`), which in practice means reports filed after this change. That includes level 2. | Otherwise the first run would email every Plant Head about every old open report at once. |
| D12 | **One digest email per recipient per run.** All of that person's newly due reports go in one email: a short table, one row per report, each with a link. The `observation_alerts` rows for the reports in a digest are written in the same transaction, only after the SMTP server accepts the message. | An HOD with eight overdue reports gets one email, not eight. A failed send is retried at the next tick, and a successful one is never repeated. |
| D13 | **Scheduler:** an in-process timer in the backend checks every `ALERT_CHECK_INTERVAL_MINUTES` (default 15). It does nothing until today's local `ALERT_SEND_TIME` (default `09:00` in `ALERT_TIMEZONE`). After that it sends whatever is due and unsent. Each run takes a PostgreSQL advisory lock (`pg_try_advisory_lock`), so a second backend instance never sends the same alert twice. The first check runs 60 seconds after start-up. | No cron, container or library to add. Alerts arrive in the morning, and a restart or failure catches up the same day. |
| D14 | **Email content** (plain text and simple HTML, no images, no attachments): <ul><li>**Subject:** "EHS: 3 observation reports not closed after 15 days" (or "…30 days").</li><li>**Opening:** "These observation reports at {plant} have not been closed by the auditee within {N} days of being generated."</li><li>**One row per report:** report number, auditee name, date generated, days open, unit and zone, number of observations, closure status in words, HOD (in the Plant Head email), and an "Open in EHS Inspection" link to `<FRONTEND_ORIGIN>/observations?reportId=<id>`.</li><li>**Footer:** "© {year} Sona Comstar · EHS Inspection. This is an automatic message; do not reply."</li></ul> | It answers the requirement (auditee, report, generation date), and the link takes a recipient straight to the report. HODs and Plant Heads at the plant may already open any report there. |
| **Plant Head** | | |
| D15 | **"All dashboards"**: the Plant Head gets the officer's week card as well, **read-only**. `GET /api/dashboard/officer-week` admits `PLANT_HEAD` and the dashboard returns `officerWeek` for a Plant Head too. `canEditAssignment` and `canEditZone` are always `false` for a caller without `PLANNING_ROLES`, and the card hides Edit. The management calendar is limited to the viewer's plant if it is not already. | They see what the officer sees, without being able to change the roster. The plant filter is what makes "under a location" true. |
| D16 | **"All reports"**: `REPORT_ROLES` becomes `[EHS_OFFICER, PLANT_HEAD]`, so the Report page and the weekly and yearly reports and PDFs are theirs, scoped to their own plant. The yearly **zone-by-week `.xlsx`** also becomes reachable from the Report page: a new `GET /api/reports/zone-weeks.xlsx` (`REPORT_ROLES`) calls the existing `patrols/inspectionReport.js` builder, and the Report page gets a "Download zone-by-week spreadsheet (.xlsx)" button. The Plan page keeps its own button. | The Plan page is planning, which stays `PLANNING_ROLES`. The spreadsheet is a report. |
| D17 | **"All data under a location"**: the Observations page gets a third tab, **"All of {plant}"**, for `PLANT_HEAD` (and `EHS_OFFICER`). It lists every report at the plant from the last 6 months with the same filters as "Past 6 months", from `GET /api/observations/history?scope=plant`. Opening a row uses the existing detail view, which already admits them (see [Before you start](#before-you-start)). Closure detail gains the plant-management read branch (backlog 3.17), so the detail can show the closure and the officer's week card progress detail works for them. Reading never grants writing: saving action plans, evidence, submitting, approving and rejecting keep their current checks. | Every unit and zone, reachable from the pages they already use, without a new "browse everything" page. |
| D18 | **No privilege is taken away.** A Plant Head can still be an auditor or auditee, and every normal-user route stays open to them. The API already lets `MANAGEMENT_ROLES` (which includes `PLANT_HEAD` and `HOD`) approve and reject closures, although the UI offers the approval queue only to `PLANNING_ROLES`. That is **left as is** (Q6). | This change adds visibility. Removing an existing permission needs its own decision. |
| **Photographs** | | |
| D19 | **Weekly report photographs are the observation photographs**, one per observation. Closure evidence photographs are **not** included (Q7). | That is what was asked for, and it keeps the PDF to at most ten images per inspection. |
| D20 | **On screen:** an expanded observation row shows a thumbnail (about 160 px wide), loaded through the existing `GET /api/observations/:reportId/items/:itemId/photograph`, fetched as a blob only when the row is expanded, with object URLs revoked on unmount. Clicking a thumbnail opens it full size in a simple dialog (`<dialog>`, Esc closes). | No new image endpoint, and access stays the existing one. Lazy loading keeps a week with 60 observations from downloading 60 images up front. |
| D21 | **In the PDF:** after an inspection's observation rows comes a **photograph block**: up to 4 photos per row, each fitted in 175 × 130 pt, labelled "Obs 1 · {area}", and page-broken by whole rows. <ul><li>The server reads each stored file through a new `readStoredFile(reference)` (local path or SharePoint), re-encodes it with `sharp` to a JPEG at most 800 px on its long side at quality 70, and embeds that.</li><li>SVG photographs, and any file that cannot be read or decoded, are drawn as a grey placeholder box: "Photograph not available in the PDF. Open report {number} in the app."</li><li>Files are fetched four at a time, with a 20 s timeout each.</li></ul> | It keeps the PDF small and readable: 60 photos at roughly 60 KB is about 4 MB. SVG cannot be decoded, because `sharp` is limited to JPEG and PNG on purpose. A missing file must not lose the whole report. |
| D22 | **Photographs are on by default**, with an **"Include photographs"** checkbox next to Download PDF. It sends `includePhotos=false` to `/api/reports/weekly/pdf`. The JSON report does not change size, since the screen loads images separately. | A text-only PDF is still useful for a quick print or a slow connection. |

Out of scope (add to [09-feature-refinement-backlog.md](09-feature-refinement-backlog.md)):
- changing a report's HOD after filing;
- reminder emails after the first alert;
- emails to auditees themselves;
- Microsoft Graph `sendMail` as an alternative to SMTP;
- closure evidence photographs in the report;
- an admin screen for alert settings;
- taking approval rights away from HOD and Plant Head (Q6).

## Configuration

New `.env` variables, passed through in `compose.yaml` as `${VAR:-}` and documented in `.env.example`, `SETUP-GUIDE.md` (new chapter, **"Email alerts"**) and `docs/07-environment-and-config.md`:

| Variable | Default | Meaning |
|---|---|---|
| `SMTP_HOST` | – | SMTP server. Empty disables email entirely. |
| `SMTP_PORT` | `587` | |
| `SMTP_SECURE` | `false` | `true` for implicit TLS (port 465). With `false`, nodemailer upgrades with STARTTLS when the server offers it, and `SMTP_REQUIRE_TLS` (default `true`) makes that upgrade compulsory. |
| `SMTP_USER`, `SMTP_PASSWORD` | – | Both or neither. Neither means an unauthenticated relay. |
| `SMTP_FROM` | – | Required when `SMTP_HOST` is set, e.g. `EHS Inspection <ehs-alerts@sonacomstar.com>`. |
| `SMTP_TLS_REJECT_UNAUTHORIZED` | `true` | `false` only for an internal relay with a private certificate. |
| `ALERTS_ENABLED` | `true` when `SMTP_HOST` is set | `false` stops the scheduler while leaving test email possible. |
| `ALERT_SEND_TIME` | `09:00` | Local time after which the day's alerts go out. |
| `ALERT_TIMEZONE` | `Asia/Kolkata` | IANA zone for `ALERT_SEND_TIME` and the day count (D8). |
| `ALERT_CHECK_INTERVAL_MINUTES` | `15` | |
| `HOD_ALERT_DAYS` | `15` | Validated as an integer from 1 to 365. |
| `PLANT_HEAD_ALERT_DAYS` | `30` | Must be greater than `HOD_ALERT_DAYS`. |

`config/environment.js` reads these into `environment.email` and `environment.alerts` (frozen) and validates them at boot. Use `Intl.DateTimeFormat` with the zone to reject an unknown `ALERT_TIMEZONE`, and check `ALERT_SEND_TIME` against `/^([01]\d|2[0-3]):[0-5]\d$/`. **Never log `SMTP_PASSWORD`.**

## Backend

### Dependency

`nodemailer` (pure JS). Install it inside a `node:22-alpine` container so `package.json` and `package-lock.json` update, as `pdfkit` was in docs/21.

### Migration `020_add_report_hod_and_alerts.sql` (idempotent)

```sql
ALTER TABLE observation_reports
ADD COLUMN IF NOT EXISTS hod_id BIGINT REFERENCES users (id);

CREATE INDEX IF NOT EXISTS observation_reports_hod_index
  ON observation_reports (hod_id);

CREATE TABLE IF NOT EXISTS observation_alerts (
  id BIGSERIAL PRIMARY KEY,
  observation_report_id BIGINT NOT NULL
    REFERENCES observation_reports (id) ON DELETE CASCADE,
  level VARCHAR(20) NOT NULL,
  recipient_user_id BIGINT NOT NULL REFERENCES users (id),
  recipient_email VARCHAR(255) NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT observation_alerts_level_check
    CHECK (level IN ('HOD', 'PLANT_HEAD')),
  CONSTRAINT observation_alerts_once
    UNIQUE (observation_report_id, level, recipient_user_id)
);
```

Give each part the same kind of explanatory comment the other migrations carry.

### `shared/email/mailer.js` (new)

- `isEmailConfigured()`.
- `sendEmail({ to, subject, text, html })`. It creates the nodemailer transport lazily, once, from `environment.email`, sets `from: SMTP_FROM`, and resolves when the server accepts the message. On failure it throws an `Error` carrying the SMTP response code, with no password in it.
- `verifyEmailConnection()` calls `transport.verify()`, for the admin script.

### `shared/storage/storedFiles.js`

Add `readStoredFile(reference)`, which returns `Promise<Buffer>`:

- **SharePoint reference** (`isSharePointReference`): `downloadFile`, then read the web stream to a Buffer, and throw `photoStorageUnavailableError()` on failure, with the same logging as `sendStoredFile`.
- **Local path:** `fs.promises.readFile(path.resolve(process.cwd(), reference))`, or the same absolute-path resolution `sendStoredFile`'s callers use. Find it in `observation.service.js` and reuse it. Do not invent a second rule.

### Observations module

**`observation.repository.js`:**

- **New `findHodOptionsForPatrol({ patrolId, auditorId })`:** a CTE that finds the patrol only when `auditor_id = $auditorId`, then selects the active users with role `HOD` at its unit's plant, excluding the patrol's `auditee_id`, ordered by `full_name`. It returns `{ found, hods: [{ id, fullName, email }] }`. `found: false` means the patrol does not exist or is not the caller's, and becomes a 404.
- **New `findValidHodForPatrol({ patrolId, hodId }, client)`:** the same rules for one user (D4). Returns the row or `null`.
- **Report insert:** whichever function inserts `observation_reports` gets a `hodId` parameter and writes `hod_id`.
- **Reads:**
  - `findReportByIdForUser`, the history and list queries, and anything the detail page reads gain `hod_id` and `hod.full_name AS hod_name` (`LEFT JOIN users AS hod`);
  - map them to `hodId` and `hodName`.
- **History with plant scope:** `findHistory…` (the function behind `GET /history`) gains a `scope` of `"mine"` (today's behaviour) or `"plant"`. With `plant`, it matches every report whose patrol's unit is at the caller's `plant_id`, instead of only those the caller audited. All the `filter` handling stays as it is.

**`observation.validator.js`:**

- On the submit rules (multipart body), add `body("hodId")`. It is required, but its rule must sit where the body is parsed. Because "no observation" is a separate route, `hodId` is simply required on `POST /`: `.exists({ checkFalsy: true }).withMessage("Select the HOD for the auditee.").bail().isInt({ min: 1 })`.
- Add `hodOptionsValidationRules`: `query("patrolId").isInt({ min: 1 })`.
- In `historyValidationRules`, add `query("scope").optional().isIn(["mine", "plant"])`.

**`observation.service.js`:**

- **`submitObservation`:** inside the existing transaction, **after** the patrol row lock, call `findValidHodForPatrol`. A `null` result is `AppError("Select an HOD from your location for the auditee. The auditee cannot be their own HOD.", 400, "INVALID_HOD")`, and the upload clean-up path already deletes the files. Pass `hodId` to the insert.
- **New `getHodOptions({ userId, patrolId })`:** 404 `PATROL_NOT_FOUND` (reuse the existing code if there is one) when `found` is false. Returns `{ message, hods }`.
- **History:** `scope=plant` is allowed only for `PLANT_HEAD` and `EHS_OFFICER`; otherwise `403 INSUFFICIENT_PERMISSIONS`. It needs the caller's `plant_id`; no plant gives `403 LOCATION_NOT_SET`.

**`observation.routes.js`:** `GET /hod-options` (`authenticate`, rules, `validate`) is declared **before** `/:reportId`.

### Closures module

- **`findClosureByIdForUser`:** add the plant-management `OR EXISTS (…)` branch used by `findReportByIdForUser` (roles `EHS_OFFICER`, `HOD`, `PLANT_HEAD`, `ADMIN` at the same plant). It applies **only to reads**:
  - grep every caller;
  - where the same function guards a write (save plan, evidence, submit), keep the write's own auditee or officer check, or add one if the write relied on this function alone;
  - list each caller and its guard in the PR description.
- Add `hodName` to the closure payload's observation summary. The closure page's `ObservationSummary` shows it.

### Escalation: `modules/alerts/` (new, the five-file layering where it applies)

| File | Contents |
|---|---|
| `alerts.repository.js` | `findDueAlerts({ level, days, today, timeZone })` and `recordAlertsSent(rows, client)` |
| `alerts.service.js` | `runEscalation({ referenceDate, dryRun })`, `buildDigest(recipient, rows, level)` |
| `alertEmail.js` | Pure: builds `{ subject, text, html }` from the digest (D14). HTML-escape every value. |
| `alertScheduler.js` | `startAlertScheduler()` and `stopAlertScheduler()` |

**`findDueAlerts({ level, days, today, timeZone })`.** One query, one row per report and recipient that is due and unsent:

- **Reports:** `hod_id IS NOT NULL`, and the closure (`JOIN closure_requests`) has a status not in `('SUBMITTED_FOR_CLOSURE', 'APPROVED')`.
- **Due:** `((report.submitted_at AT TIME ZONE $tz)::DATE + $days) <= $today::DATE`.
- **Recipients:**
  - `HOD` level: the report's `hod_id` user, active, with a non-empty email;
  - `PLANT_HEAD` level: every active user with role `PLANT_HEAD` and `plant_id` equal to the report's plant, with a non-empty email.
- **Unsent:** `NOT EXISTS` an `observation_alerts` row for that report, level and recipient.
- **Columns:** report id, `report_number`, `submitted_at` as a local date string, days open, plant, unit and zone names, auditee name, HOD name, observation count, closure status, recipient id, name and email.

Also log, once per run, how many due reports had **no** eligible recipient (no active HOD, or no Plant Head), using a second small query or a `LEFT JOIN` count. It is a `warn`.

**`runEscalation`:**

1. `SELECT pg_try_advisory_lock(<constant key>)` on a dedicated pool client. If it returns false, another instance is running, so return.
2. For each level (`HOD` with `HOD_ALERT_DAYS`, then `PLANT_HEAD` with `PLANT_HEAD_ALERT_DAYS`):
   - group the due rows by recipient;
   - per recipient, build the digest and `sendEmail`;
   - on success, `recordAlertsSent` the rows in one transaction, with `ON CONFLICT DO NOTHING`;
   - on failure, log an `error` (recipient email, report count, SMTP code) and continue with the next recipient.
3. Release the lock in `finally`.
4. Return a summary `{ level: { recipients, reports, failures } }` and log it as an `info`. With `dryRun`, build the digests and return them without sending or recording.

**`alertScheduler.js`.** `setTimeout` 60 s after start, then `setInterval(ALERT_CHECK_INTERVAL_MINUTES)`. Each tick:

- returns at once unless email and alerts are enabled;
- returns unless the current local time in `ALERT_TIMEZONE` is at or after `ALERT_SEND_TIME`;
- calls `runEscalation()`, with a guard so ticks never overlap within the process;
- catches and logs everything, so the timer never dies.

`server.js` calls `startAlertScheduler()` after `app.listen`, and `stopAlertScheduler()` in the existing shutdown path (find it). Skip both when `NODE_ENV=test`.

**`scripts/alerts.js`** (operator, mirrors `scripts/sharepoint.js`):

- `check` verifies the configuration and `verifyEmailConnection()`;
- `test-email <address>` sends one short branded test message;
- `due [--level HOD|PLANT_HEAD]` is a dry run that prints the due digests;
- `run` runs the escalation now, ignoring `ALERT_SEND_TIME` (it still takes the lock).

Add the commands to the `SETUP-GUIDE.md` operations table.

### Dashboard (Plant Head, D15)

- **Route:** in `dashboard.routes.js`, `GET /officer-week` uses a new `WEEK_VIEW_ROLES = [EHS_OFFICER, ADMIN, PLANT_HEAD]` (add it to `shared/constants/roles.js`, commented) instead of `PLANNING_ROLES`.
- **Service, `getDashboard`:** return `officerWeek` when the primary role is `EHS_OFFICER` **or** `PLANT_HEAD`, and the plant is known.
- **Service, `loadOfficerWeek` (or where `canEditAssignment` and `canEditZone` are set):** take a `canEdit` flag, true only when the caller holds a `PLANNING_ROLES` role, and AND it into both values.
- **Repository:** check `findManagementMonthlyPatrols` and `findManagementCurrentWeekPatrols`. If either has no plant filter (backlog 3.13), add `unit.plant_id = $plantId` when the viewer has a plant, keeping all plants when they have none (the current documented rule), and close 3.13.
- **Frontend `DashboardPage.jsx`:** render `OfficerWeekCard` when the primary role is `EHS_OFFICER` or `PLANT_HEAD`. `ZoneAssignmentRow` already hides Edit when both flags are false; confirm it.

### Reports (Plant Head and photographs, D16, D19–D22)

- **Roles:** `REPORT_ROLES = [EHS_OFFICER, PLANT_HEAD]` on both sides. Update the comment.
- **`reports.repository.js` `findReportItemsForReport`:** also return `item.id AS item_id`, `item.photograph_path` and `item.photograph_mime_type`. The service maps `itemId`, `reportId` and `photographMimeType` into each observation of the **JSON model**, and keeps `photographPath` **out of the JSON**, in a parallel map used only by the PDF path.
  - The weekly model's inspection also gains `reportId` and `hodName` (from the `findWeekPatrolsForReport` query: `LEFT JOIN users AS hod ON hod.id = report.hod_id`).
- **`reports.service.js` `getWeeklyReportPdf({ …, includePhotos })`:**
  - when true, collect every observation's photograph path;
  - load them with a small concurrency pool of 4, using `readStoredFile` and then `sharp(buffer).rotate().resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer()`;
  - skip SVG by MIME type or extension;
  - a failure or a 20 s timeout per file leaves that photo `null` and logs a `warn` with the report and item ids, never the path;
  - pass `photos: Map<itemId, Buffer | null>` to the builder.

  `sharp`'s decoder restriction lives in `compressUploadedImages.js`. Import `sharp` the same way so the block applies (check how it is set up; the restriction must not be loosened).
- **`reports.validator.js`:** `query("includePhotos").optional().isIn(["true", "false"])`.
- **`weeklyInspectionPdf.js`:**
  - add an **HOD** line under Auditor/Auditee in the people cell, "HOD: {name}", when present;
  - after an inspection's last observation row, when `photos` is given and the inspection has observations, draw the **photograph block** (D21):
    - a thin "Photographs" caption;
    - rows of up to 4 cells, each 175 × 130 pt plus a 12 pt label;
    - `doc.image(buffer, x, y, { fit: [175, 130], align: "center", valign: "center" })` inside a hairline frame;
    - a placeholder frame and text for `null`;
    - `ensureSpace(rowHeight)` before each row, and on a page break redraw the unit band "(continued)", **without** the column header, plus "{zone} (cont.) · Photographs".
  - Keep the existing pages unchanged when `includePhotos` is false: compare text against the current output, as docs/23's acceptance check 2 did.
- **New `GET /api/reports/zone-weeks.xlsx`** (`REPORT_ROLES`): its controller calls `patrolService.getInspectionReport({ userId })` and sends it with the existing spreadsheet headers. That service already scopes to the caller's plant and only needs a location. Importing from the patrols service is acceptable here; note it in a comment.

## Frontend

### Observation form (HOD, D3–D5)

- **`observation.service.js`:** `fetchHodOptions(patrolId)`.
- **`useObservations.js` `useObservationForm(assignment)`:**
  - load the options on mount (`cancelled` flag pattern) into `hodOptions`, `hodLoading` and `hodError`;
  - add `hodId` to the form values, reset with the form;
  - `validate()` adds "Select the HOD for the auditee." when it is empty;
  - the submit `FormData` appends `hodId`.
- **`ObservationCard.jsx`:** a required **"HOD of the auditee"** select, in the form section above the first observation fieldset, using the existing `form-field` markup and the required marker:
  - placeholder option "Select the HOD";
  - each option is the HOD's full name;
  - help text "Gets an email if the auditee has not closed this report within 15 days."
  - With no options, show the D5 message as an `Alert type="warning"` and disable Submit. The "No observation to record" action on the list is unaffected.
- **Detail views:**
  - `ObservationDetail.jsx`: add a read-only "HOD" field to the report's field grid;
  - `features/closures/ObservationSummary.jsx`: the same.

### Observations page (Plant Head and officer, D17)

- A third tab, **"All of {plant name}"**, shown when `hasAnyRole(user, ["PLANT_HEAD", "EHS_OFFICER"])`. Add a `canViewPlantData` helper in `constants/roles.js`.
- It is driven by `?view=plant&filter=…` in the query string, like `view=history`.
- `ObservationHistory` takes a `scope` prop, `useObservationHistory(filter, scope)` passes `scope=plant`, and the rows show auditor and auditee as well.
- Opening a row is the existing `?reportId=` detail.

### Dashboard

`DashboardPage.jsx`: `OfficerWeekCard` for `EHS_OFFICER` or `PLANT_HEAD`, as above. Check that the card shows no Edit, Save or assignment controls when no row is editable.

### Report page

- **Sidebar and route:** they follow `REPORT_ROLES` already, through `canViewReports`, once the constant changes.
- **Toolbar:**
  - an **"Include photographs"** checkbox next to Download PDF, Weekly tab only, default on, passed as `includePhotos`;
  - a **"Download zone-by-week spreadsheet (.xlsx)"** secondary button, on the Yearly tab, through a new `fetchZoneWeeksSpreadsheet()` blob download (`inspection-report-<date>.xlsx`).
- **Weekly view:**
  - the inspection row shows "HOD: {name}" under the auditee when present;
  - the observation table gains a **Photo** column with a lazy thumbnail component, `ObservationPhoto({ reportId, itemId, alt })`:
    - it fetches `/observations/{reportId}/items/{itemId}/photograph` with `apiBlobRequest` when mounted, which happens only when the row is expanded;
    - it shows the image (`object-fit: cover`, 96 × 72) or "Photo unavailable";
    - clicking opens a `<dialog>` with the full image and a Close button;
    - it revokes its object URL on unmount;
  - add the CSS to the `/* Reports */` section (`.report-photo-thumb`, `.report-photo-dialog`), reusing existing colours.

## Documentation to update in the same change

- **`SETUP-GUIDE.md`:**
  - a new **Email alerts** chapter: what is sent and when; the `.env` table; the Microsoft 365 note (Q1); the `scripts/alerts.js` commands; and a go-live checklist item "`scripts/alerts.js test-email` reaches an HOD's mailbox";
  - in the people-import chapter, note that HOD and Plant Head users need the role **and** a plant (`set-plant`), or they cannot be chosen or alerted.
- **`guide.md`:** the HOD and Plant Head app roles must be assigned in Entra (they rewrite `user_roles` at each sign-in), with an example.
- **`docs/03-data-model.md`:** `observation_reports.hod_id` and `observation_alerts`.
- **`docs/04-api-reference.md`:**
  - `GET /api/observations/hod-options`;
  - `hodId` on `POST /api/observations`;
  - `scope` on `/history`;
  - the widened `officer-week` access;
  - `REPORT_ROLES`;
  - `includePhotos`;
  - `GET /api/reports/zone-weeks.xlsx`;
  - the new error codes (`INVALID_HOD`, `LOCATION_NOT_SET`).
- **`docs/05-workflows.md`:** a section "Escalation of reports not closed", covering D7–D12.
- **`docs/06-frontend.md`:** the HOD select, the "All of {plant}" tab, the read-only week card for Plant Heads, and the Report page's photographs, checkbox and spreadsheet button.
- **`docs/07-environment-and-config.md`:** every new variable.
- **`docs/09-feature-refinement-backlog.md`:**
  - the out-of-scope list;
  - close 3.13 and 3.17 if fixed here;
  - update 3.20, since photographs are now in the weekly report.
- **`docs/README.md`:** link this plan.
- **`CLAUDE.md`:**
  - the HOD on the report and its validation;
  - the alerts module, scheduler and table;
  - the Plant Head's read scope;
  - `REPORT_ROLES` and `WEEK_VIEW_ROLES`;
  - `readStoredFile`;
  - bump "`docs/10` to `23`" to `24`.

## Acceptance checks

1. **Build.** `docker compose up -d --build backend frontend`. Migration 020 applies once, and a second start applies nothing. With no `SMTP_*` set the backend starts and logs that email alerts are off. With only `SMTP_USER` set, it refuses to start with a clear message.
2. **SMTP.** Run a throwaway SMTP catcher on the compose network, for example `docker run -d --name mailpit --network <compose network> axllent/mailpit`. Set `SMTP_HOST=mailpit`, `SMTP_PORT=1025`, `SMTP_REQUIRE_TLS=false`, `SMTP_FROM=…`. Then `node scripts/alerts.js check` and `test-email someone@example.com` succeed, and the message is visible in Mailpit's API (`GET /api/v1/messages`).
3. **HOD options.** As `test.auditor` on their own patrol, `/hod-options` lists only active HOD users at that plant (make one with `admin.js` or SQL in development), never the auditee. Another user's patrol gives 404.
4. **Submit.** Without `hodId` the result is 400 `VALIDATION_ERROR`. With an HOD from another plant, the auditee, or a non-HOD, it is 400 `INVALID_HOD`, and the uploaded files are deleted (check `uploads/observations`). With a valid HOD the report is created with `hod_id`, and the detail and closure pages show the HOD. "No observation to record" still works without one.
5. **Escalation, in development.**
   - Create reports with observations and backdate `observation_reports.submitted_at` by 16 and by 31 days in SQL.
   - `scripts/alerts.js due` lists:
     - the 16-day report for its HOD;
     - the 31-day report for both its HOD (level 1, if not yet sent) and every Plant Head at the plant.
   - `run` sends **one email per recipient**, and Mailpit shows the subjects, the auditee, the report number, the generation date and working links. `observation_alerts` has one row per report, level and recipient.
   - A second `run` sends nothing.
   - Submitting the closure (`SUBMITTED_FOR_CLOSURE`) before the run excludes it.
   - A report with `hod_id` `NULL` never appears.
   - Stop Mailpit and `run`: errors are logged, no rows are written, and after Mailpit restarts the next `run` sends.
6. **Scheduler.** With `ALERT_SEND_TIME` one minute in the future and `ALERT_CHECK_INTERVAL_MINUTES=1`, the backend sends on its own after that minute, and only once. Two backend replicas (`docker compose up --scale backend=2`, if the compose file allows) send once between them.
7. **Plant Head.** As `test.plant.head`:
   - the dashboard shows the week card with no Edit buttons;
   - `PATCH` assignment calls are still 403;
   - the calendar shows only their plant;
   - the Report page is in the sidebar, and weekly, yearly, both PDFs and the `.xlsx` download work for their plant;
   - the Observations page has "All of {plant}", which lists other people's reports, and they open;
   - the closure detail opens read-only;
   - their own auditor and auditee work is unchanged.

   As `test.hod`: no Report link, `/reports` redirects, and there is no "All of {plant}" tab.
8. **Photographs.**
   - The weekly report on screen shows thumbnails only after a row is expanded, and the dialog opens and closes with the keyboard.
   - The PDF for a week with photos shows the photograph blocks after each inspection's rows, labelled, and page-broken cleanly.
   - An SVG photo, and a deleted file, show the placeholder.
   - With `includePhotos=false`, the text output matches the current PDF apart from the new HOD line.
   - If any reports are stored in SharePoint, a SharePoint-stored photo appears, or the placeholder appears when SharePoint is unreachable.
9. **Regression.** The Observations, Closures, Plan and dashboard pages still work for the officer, auditor and auditee. Run docs/23's Playwright walk-through again.

## Open questions for the user

The defaults above stand unless the user says otherwise.

- **Q1 Microsoft 365 SMTP.** Microsoft has been retiring Basic authentication for SMTP AUTH in Exchange Online, so a user name and password against `smtp.office365.com` may not work in this tenant. The usual options are:
  - an **Exchange Online SMTP relay connector** for the server's public IP: no password, `SMTP_USER` empty, port 25 to the tenant's MX host;
  - an **on-premises relay**;
  - switching to **Microsoft Graph `sendMail`**, which the app could do with its existing Entra app registration.

  Which does the company's Microsoft 365 administrator prefer? The plan supports the first two as they are.
- **Q2** If a plant has **no HOD** set up, should reports with observations be blocked (default), or be allowed with the HOD left empty, so that only the 30-day Plant Head alert applies?
- **Q3** Should the EHS Officer be able to **change** a report's HOD after it is filed, for example if the wrong person was picked? Default: no.
- **Q4** Does "closed" mean the auditee has **sent the action plans for approval** (default), or that the EHS Officer has **approved** the closure? With the second, a report waiting on the officer would still alert the HOD.
- **Q5** One email per level (default), or **reminders**, for example the HOD every 7 days after day 15 until it is closed?
- **Q6** HOD and Plant Head can approve or reject closures through the API today (they are in `MANAGEMENT_ROLES`), though the app only shows the approval queue to EHS Officers. Should that right be **removed**, so that a Plant Head is truly "a normal user who can see everything"? Default: unchanged.
- **Q7** Should the weekly report also include the **closure evidence photographs** (up to 3 per observation) next to each observation photo? Default: no.
- **Q8** Should the EHS Officer also get the **"All of {plant}"** observations tab? Default: yes. Should **HODs**? Default: no.
