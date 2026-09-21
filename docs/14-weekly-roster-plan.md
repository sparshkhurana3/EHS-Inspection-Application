# 14. Weekly roster: file upload and automatic Monday scheduling

Implementation plan for replacing one-audit-at-a-time planning with a **roster upload**. Written to be implemented file by file without further design decisions. Read [02-architecture.md](02-architecture.md) for the layering rules first; every new file below follows them. The Plan page today is described in [12-plan-page-plan.md](12-plan-page-plan.md) and the officer's dashboard weekly cards in the dashboard module (`buildOfficerUnitWeeklyPlans`).

**Goal**

1. The EHS Officer uploads **one `.xlsx` or `.csv` file** listing, per zone, who audits it and who is audited: columns `Location, Unit, Zone, Auditor (email), Auditee (email)`.
2. The upload **schedules every zone in the file for every Monday** from the upload date to **31 December of the current year**. The officer never types a date.
3. The dashboard shows the officer **one card for the upcoming inspection week**; clicking it expands to every scheduled inspection that week, grouped by unit, with status and an inline auditor/auditee edit.
4. Editing a zone's auditor or auditee from that card **changes every upcoming Monday for that zone until 31 December**, not just the one row.

**Non-regression rule.** The existing single-audit form on `/plan` (`POST /api/patrols`) stays and keeps working; a manually planned audit is an ordinary patrol. Observation, closure, ticket and approval workflows are untouched: a roster-generated patrol is a normal `patrols` row with `status = 'SCHEDULED'`, so everything downstream (`POST /api/observations`, the closure chain, the calendar, the auditor's "next audit" card) works unchanged. Non-officer dashboards do not change.

## Decisions taken in this plan

Each was chosen to be the simplest reading that keeps the existing workflow intact. Change them here before implementing if any is wrong.

| # | Decision | Why |
|---|---|---|
| D1 | The roster is stored in a new table `zone_audit_rosters`, **one row per zone** (unique on `zone_id`), holding the auditor and auditee. Patrols generated from it carry a nullable `patrols.roster_id`. | Gives "who covers this zone" a home so an edit can propagate, and lets a re-upload find the patrols it owns without touching manually planned ones. |
| D2 | **First Monday = the first Monday on or after the upload date** (UTC, matching `patrol.service.js#getCurrentDate`). Uploading on a Monday schedules that same day, like the manual form which allows today. | "based on the current date … all upcoming Mondays". |
| D3 | **Last date = 31 December of the upload year.** An upload with no Monday left in the year is rejected (`400 NO_MONDAYS_REMAINING`). Next year's roster is uploaded next year. | Spec says "till 31st December"; a year rollover rule is not asked for. |
| D4 | **All-or-nothing.** If any row is invalid, nothing is written and every problem is returned with its row number (`400 ROSTER_INVALID`, `details: [{ row, field, message }]`). | An officer fixes the sheet once; partial schedules are confusing to unpick. |
| D5 | **Re-upload replaces the plan.** The file is the roster: zones in the file are upserted; zones no longer in the file lose their roster row. Future roster-generated patrols (`roster_id IS NOT NULL`, `status = 'SCHEDULED'`, date ≥ new first Monday) are deleted and regenerated. Patrols in the past, with an observation report, or planned by hand are never touched. | "1 time upload" still needs a defined answer for the second upload. Delete rather than cancel: a `SCHEDULED` patrol with no report has nothing referencing it, and `CANCELLED` rows would clutter the calendar queries. |
| D6 | **Rows are matched to the officer's own location only.** `Location` must equal the officer's plant `name` or `code` (case-insensitive, trimmed); any other value is a row error. `Unit` and `Zone` match on `name`, `code`, `unit_number`/`zone_number` (case-insensitive, trimmed) inside the resolved parent. Emails match `LOWER(email)` among **active users at that plant**, excluding the officer (same rule as the dropdowns). | Same scope enforcement as `schedulePatrol`; the file never widens what an officer may plan. |
| D7 | **One person may cover several zones.** An auditor or auditee can appear on any number of rows; the only person rule is that the auditor and the auditee of the **same** zone must differ, which `validateScheduleInput`, the roster row check and the `patrols` table's own `patrol_auditor_auditee_check` all enforce. The former one-audit-per-person-per-day rule (`findSchedulingConflict`) has been removed from scheduling, roster upload and assignment edits. | Confirmed by the business: staff routinely cover more than one zone in a week. |
| D8 | Assignment edits from the dashboard gain an `applyToUpcoming` flag, **default true**. When true the edit updates the roster row and every `SCHEDULED` patrol of that zone from the edited patrol's date to 31 December of that year, **regardless of whether the patrol came from the roster or the manual form**. The checkbox lets the officer make a one-off swap. | Spec: "changed for all upcoming inspections till 31st December". A single-day exception is the obvious other case, and the flag costs one line. |
| D9 | The dashboard shows **one week card** (the current Monday-to-Sunday week if it has inspections, otherwise the next week that does), whose body groups zones **by unit**. This replaces the per-unit cards from the previous refinement. | Spec: "the upcoming Inspection for the week in the form of a card". Grouping by unit inside keeps the unit view. |
| D10 | Files are parsed with `exceljs` (xlsx) and `csv-parse` (csv), read from memory, max **2 MB**, first worksheet only, header row required. `xlsx` from npm is not used: its published version has unpatched advisories. | Both libraries are maintained and pure JS. |
| D11 | The CSV template is generated **in the browser** (a `Blob` of the header row plus the officer's zones); no template endpoint. | The Plan page already has the officer's units and zones from `planning-lookups`. |

## Data model

One migration, `backend/database/migrations/012_add_zone_audit_rosters.sql`, idempotent, wrapped in `BEGIN; ... COMMIT;`.

```sql
CREATE TABLE IF NOT EXISTS zone_audit_rosters (
    id               BIGSERIAL PRIMARY KEY,

    plant_id         BIGINT NOT NULL REFERENCES plants(id) ON DELETE RESTRICT,
    unit_id          BIGINT NOT NULL REFERENCES units(id)  ON DELETE RESTRICT,
    zone_id          BIGINT NOT NULL REFERENCES zones(id)  ON DELETE RESTRICT,

    auditor_id       BIGINT NOT NULL REFERENCES users(id)  ON DELETE RESTRICT,
    auditee_id       BIGINT NOT NULL REFERENCES users(id)  ON DELETE RESTRICT,

    /* first Monday and 31 Dec of the upload that last set this row (D2, D3) */
    effective_from   DATE NOT NULL,
    effective_to     DATE NOT NULL,

    uploaded_by      BIGINT NOT NULL REFERENCES users(id)  ON DELETE RESTRICT,
    source_file_name TEXT,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT zone_audit_rosters_zone_unique UNIQUE (zone_id),
    CONSTRAINT zone_audit_rosters_people_differ CHECK (auditor_id <> auditee_id),
    CONSTRAINT zone_audit_rosters_range_check   CHECK (effective_from <= effective_to)
);

CREATE INDEX IF NOT EXISTS zone_audit_rosters_plant_index
ON zone_audit_rosters (plant_id);

/* which roster row generated a patrol; NULL for manually planned audits */
ALTER TABLE patrols
ADD COLUMN IF NOT EXISTS roster_id BIGINT
    REFERENCES zone_audit_rosters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS patrols_roster_index
ON patrols (roster_id)
WHERE roster_id IS NOT NULL;
```

`ON DELETE SET NULL` on `roster_id`: when a zone drops out of a re-uploaded file its roster row goes, but its past patrols stay as history with `roster_id = NULL`.

No CHECK constraints on names: locations, units and zones are matched against the master tables at upload time, never against a list in code (R12).

## Backend

### Dependencies — `backend/package.json`

Add `"exceljs": "^4.4.0"` and `"csv-parse": "^5.6.0"` to `dependencies`. Host Node is v12 and cannot run `npm install` for these; update the lockfile inside a Node 22 container so `npm ci` in the Dockerfile keeps working:

```bash
docker run --rm -v "$PWD/backend:/app" -w /app node:22-alpine npm install exceljs@^4.4.0 csv-parse@^5.6.0
```

Commit `package.json` and `package-lock.json`. Do not add anything to the frontend.

### Upload middleware — new `backend/src/modules/patrols/rosterUpload.js`

Mirror `observations/observationUpload.js`, but with `multer.memoryStorage()` (the file is parsed and discarded, never stored):

- field name `roster`, `upload.single("roster")`
- `limits: { fileSize: 2 * 1024 * 1024, files: 1 }`
- `fileFilter`: accept by **extension** of `file.originalname` (`.csv`, `.xlsx`, case-insensitive). CSV MIME types vary across browsers and OSes (`text/csv`, `application/vnd.ms-excel`, `application/octet-stream`), so the MIME type is not checked. Reject with `AppError("Upload a .csv or .xlsx file.", 400, "UNSUPPORTED_ROSTER_FILE")`.
- `handleRosterUploadError` maps `LIMIT_FILE_SIZE` → `ROSTER_FILE_TOO_LARGE` ("The roster file must be 2 MB or smaller."), `LIMIT_FILE_COUNT` / `LIMIT_UNEXPECTED_FILE` → `ROSTER_UPLOAD_FAILED`.

### Parser — new `backend/src/modules/patrols/rosterParser.js`

Pure function, no database. `parseRosterFile({ buffer, originalName })` → `{ rows, errors }`.

- `.csv`: `parse(buffer, { columns: false, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true })` from `csv-parse/sync`. First record is the header.
- `.xlsx`: `new ExcelJS.Workbook(); await workbook.xlsx.load(buffer); const sheet = workbook.worksheets[0]`. Read each row's cells with **`cell.text`**, not `cell.value`: Excel turns email addresses into hyperlinks, whose `value` is `{ text, hyperlink }`, and formulas into `{ formula, result }`. `cell.text` is the display string in every case.
- Header matching: normalise each header to lowercase letters only (`replace(/[^a-z]/g, "")`) and map `location`, `unit`, `zone`, anything starting with `auditor`, anything starting with `auditee` to the five fields. This accepts `Auditor(email)`, `Auditor Email`, `auditor_email`. If any of the five is missing, return a single error `{ row: 1, field: "header", message: "The file must have the columns Location, Unit, Zone, Auditor (email) and Auditee (email)." }` and no rows.
- Data rows: skip a row whose five cells are all blank. Otherwise emit `{ rowNumber, location, unit, zone, auditorEmail, auditeeEmail }` with every value trimmed and emails lower-cased. `rowNumber` is the 1-based row in the file **including the header**, so it matches what the officer sees in Excel.
- A blank required cell is a row error `{ row, field, message: "<Field> is required." }`; the parser still returns the other rows so all problems come back at once (D4).
- Stop after 500 data rows with error `ROSTER_TOO_MANY_ROWS`; no plant has that many zones.

### Repository — `backend/src/modules/patrols/patrol.repository.js`

Add these functions. All take an optional trailing `client`.

| Function | SQL |
|---|---|
| `findRosterLookupScope(plantId)` | The plant's active units and zones with `id`, `name`, `code`, `unit_number` / `zone_number`, `unit_id`, and each zone's active `area_count`. One query; the service matches names in JS. |
| `findActiveUsersByEmail({ plantId, emails, excludeUserId })` | `SELECT id, full_name, email FROM users WHERE plant_id = $1 AND is_active AND LOWER(email) = ANY($2::TEXT[]) AND id <> $3`. Returns a `Map` keyed by lower-cased email. |
| `findRosterForPlant(plantId)` | Roster rows joined to unit, zone, auditor and auditee names, ordered by unit number/name then zone number/name. Also `(SELECT COUNT(*) FROM patrols WHERE roster_id = r.id AND status = 'SCHEDULED' AND scheduled_date >= CURRENT_DATE) AS upcoming_count`. |
| `findRosterConflicts({ plantId, mondays, pairs })` | Given the planned `(auditor_id, auditee_id)` pairs and the Monday list, return the first existing **non-roster** patrol (`roster_id IS NULL AND status <> 'CANCELLED'`) whose `scheduled_date = ANY($mondays)` and whose auditor or auditee is any of the people. Returns `{ scheduledDate, userId, fullName }` or `null`. Roster patrols are excluded because they are about to be deleted (D5). |
| `deleteUpcomingRosterPatrols({ plantId, fromDate })` | `DELETE FROM patrols p USING units u WHERE u.id = p.unit_id AND u.plant_id = $1 AND p.roster_id IS NOT NULL AND p.status = 'SCHEDULED' AND p.scheduled_date >= $2::DATE AND NOT EXISTS (SELECT 1 FROM observation_reports o WHERE o.patrol_id = p.id) RETURNING p.id`. Returns the count. |
| `deleteRosterRowsNotIn({ plantId, zoneIds })` | `DELETE FROM zone_audit_rosters WHERE plant_id = $1 AND zone_id <> ALL($2::BIGINT[])`. Run **after** the patrol delete so `ON DELETE SET NULL` has nothing to touch. |
| `upsertRosterRow({ plantId, unitId, zoneId, auditorId, auditeeId, effectiveFrom, effectiveTo, uploadedBy, sourceFileName })` | `INSERT ... ON CONFLICT (zone_id) DO UPDATE SET unit_id, auditor_id, auditee_id, effective_from, effective_to, uploaded_by, source_file_name, updated_at = NOW() RETURNING id`. |
| `generateRosterPatrols({ plantId, plantName, firstMonday, lastDate, ehsOfficerId })` | The bulk insert below. Returns the number of rows inserted. |
| `findUpcomingZonePatrolsForAssignment({ zoneId, fromDate, toDate })` | `SELECT id, scheduled_date FROM patrols WHERE zone_id = $1 AND status = 'SCHEDULED' AND scheduled_date BETWEEN $2 AND $3 ORDER BY scheduled_date FOR UPDATE`. |
| `findSchedulingConflictForDates({ dates, auditorId, auditeeId, excludePatrolIds })` | Same shape as `findSchedulingConflict` but `scheduled_date = ANY($1::DATE[])` and `id <> ALL($4::BIGINT[])`; returns the first conflict with its `scheduled_date`. |
| `updatePatrolAssignments({ patrolIds, auditorId, auditeeId })` | `UPDATE patrols SET auditor_id, auditee_id, updated_at WHERE id = ANY($3::BIGINT[]) AND status = 'SCHEDULED' RETURNING id`. Returns the count. |
| `updateRosterAssignmentForZone({ zoneId, auditorId, auditeeId })` | `UPDATE zone_audit_rosters SET auditor_id, auditee_id, updated_at WHERE zone_id = $1 RETURNING id`. Null when the zone has no roster row; that is not an error. |

Bulk insert:

```sql
INSERT INTO patrols (
    unit_id, zone_id, auditor_id, auditee_id, scheduled_date,
    status, plant_location, ehs_officer_id, created_by, roster_id
)
SELECT
    r.unit_id, r.zone_id, r.auditor_id, r.auditee_id, monday::DATE,
    'SCHEDULED', $2, $5, $5, r.id
FROM zone_audit_rosters AS r
CROSS JOIN GENERATE_SERIES($3::DATE, $4::DATE, INTERVAL '7 days') AS monday
WHERE r.plant_id = $1
  AND NOT EXISTS (
      SELECT 1 FROM patrols AS existing
      WHERE existing.zone_id = r.zone_id
        AND existing.scheduled_date = monday::DATE
        AND existing.status <> 'CANCELLED'
  )
```

`NOT EXISTS` keeps a manually planned audit for the same zone on the same Monday instead of duplicating it. `plant_location` is filled the same way `createPatrol` fills it (the plant name); it has no CHECK constraint since migration 007.

### Service — `backend/src/modules/patrols/patrol.service.js`

Add two helpers next to `getCurrentDate`:

```js
function getFirstMondayOnOrAfter(dateOnly) {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + ((8 - date.getUTCDay()) % 7));
  return date.toISOString().slice(0, 10);
}

function listMondays(firstMonday, lastDate) { /* step 7 days while <= lastDate */ }
```

`(8 - day) % 7`: Sunday (0) → +1, Monday (1) → +0, Tuesday (2) → +6.

#### `uploadRoster({ userId, file })`

1. `parseRosterFile`. If it returned errors, throw `AppError("The roster file could not be read. Fix the listed rows and upload it again.", 400, "ROSTER_INVALID", errors)`.
2. If no rows: `400 ROSTER_EMPTY`.
3. `firstMonday = getFirstMondayOnOrAfter(getCurrentDate())`, `lastDate = \`${year}-12-31\``. If `firstMonday > lastDate`: `400 NO_MONDAYS_REMAINING` ("There are no Mondays left this year to schedule.").
4. Inside one `withTransaction`:
   - `requireOfficerLocation(userId, client)`.
   - `findRosterLookupScope(location.id)`, `findActiveUsersByEmail` for every distinct email in the file.
   - Resolve each row, collecting `errors` (`{ row, field, message }`):
     - `location` ≠ plant name/code → `"Location \"X\" is not the location you are responsible for (Y)."`
     - unit not found in plant → `"Unit \"X\" was not found at Y."`; zone not found in unit → `"Zone \"X\" was not found in unit Y."`; zone with `area_count = 0` → the existing `ZONE_HAS_NO_AREAS` wording.
     - email not found → `"No active user at Y has the email X."`; auditor email = auditee email → the existing `AUDITOR_AUDITEE_MUST_DIFFER` wording.
     - zone already seen in an earlier row → `"Zone X appears more than once (also row N)."`
   - If `errors.length > 0`, throw `ROSTER_INVALID` with them (max 100 entries; state the total in the message). Throwing rolls back, so nothing below is reachable half-done.
   - `findRosterConflicts` against manually planned patrols on the Monday list; if one is returned throw `409 ROSTER_SCHEDULING_CONFLICT` ("Name already has an audit on DATE that was planned by hand. Reassign that audit first.").
   - `deleteUpcomingRosterPatrols({ plantId, fromDate: firstMonday })`, then `deleteRosterRowsNotIn`, then `upsertRosterRow` per row, then `generateRosterPatrols`.
5. Return `{ message: "Roster uploaded. N zones scheduled for M Mondays from A to B.", roster: await getRoster({ userId }).roster, summary: { zones, mondays, firstMonday, lastDate, patrolsCreated, patrolsReplaced } }`.

#### `getRoster({ userId })`

`requireOfficerLocation` then `findRosterForPlant`. Returns `{ location, roster: { effectiveFrom, effectiveTo, rows: [...] } }`; `effectiveFrom/To` are taken from the first row (all rows of one upload share them) or `null` when empty. Map `snake_case` → `camelCase`: `id, unitId, unitName, unitNumber, zoneId, zoneName, zoneNumber, auditorId, auditorName, auditorEmail, auditeeId, auditeeName, auditeeEmail, effectiveFrom, effectiveTo, upcomingCount, updatedAt`.

#### `updatePatrolAssignment(input)` — extend

Accept `applyToUpcoming` (boolean, default `true`). Keep everything up to and including the plant and user checks. Then:

- `applyToUpcoming === false`: unchanged behaviour (single-date conflict check, single update).
- `applyToUpcoming === true`:
  1. `fromDate = toDateOnlyString(existingPatrol.scheduledDate)`, `toDate = \`${fromDate.slice(0, 4)}-12-31\``.
  2. `targets = findUpcomingZonePatrolsForAssignment({ zoneId: existingPatrol.zoneId, fromDate, toDate }, client)`. If the edited patrol is not among them it is no longer `SCHEDULED`: throw the existing `PATROL_NOT_EDITABLE`.
  3. `findSchedulingConflictForDates` over the targets' dates excluding the targets' ids; on conflict throw `409 AUDITOR_SCHEDULING_CONFLICT` / `AUDITEE_SCHEDULING_CONFLICT` with the date in the message ("... already has an audit scheduled on DATE.").
  4. `updatePatrolAssignments`, then `updateRosterAssignmentForZone` (may return null).
  5. Return `{ message: "Assignment updated for N upcoming audits of this zone.", patrol, updatedCount: N }`.

### Validator — `backend/src/modules/patrols/patrol.validator.js`

- `updatePatrolAssignmentValidationRules`: add `body("applyToUpcoming").optional().isBoolean().toBoolean()`.
- No validator for the upload: the body is a file; multer and the parser do the checking.

### Controller and routes — `patrol.controller.js`, `patrol.routes.js`

```js
router.get("/roster", authenticate, authorize(...PLANNING_ROLES), getRoster);

router.post(
  "/roster",
  authenticate,
  authorize(...PLANNING_ROLES),
  uploadRosterFile,          // multer
  handleRosterUploadError,
  uploadRoster,
);
```

Declare both **before** `/:patrolId/assignment` so `roster` is never parsed as a patrol id. The controller passes `req.file` (`buffer`, `originalname`) and `req.user.id`; `400 ROSTER_FILE_REQUIRED` when `req.file` is missing.

### Dashboard — `backend/src/modules/dashboard/`

Replace the per-unit response with a single week (D9).

`dashboard.repository.js`: rename `findOfficerUnitWeeklyPlans` → `findOfficerWeekPatrols({ plantId, weekStart })` and change the `next_dates` CTE to a **plant-wide** `MIN(scheduled_date)` over the plant's non-cancelled patrols with `scheduled_date >= $2`; the rest of the query (week bounds, joins, columns) stays. Add `u.id AS unit_id, u.name AS unit_name, u.unit_number` if not already selected. Result is flat rows for that one week, or an empty array.

`dashboard.service.js`: replace `buildOfficerUnitWeeklyPlans` with `buildOfficerWeek(rows)` returning

```js
{
  weekStart, weekEnd, totalAudits,
  units: [{ unitId, unitName, unitNumber, zones: [ /* same zone shape as today */ ] }]
}
```

or `null` when there are no rows. The zone objects keep `patrolId, zoneId, zoneName, zoneNumber, scheduledDate, auditorId, auditorName, auditeeId, auditeeName, observationReportId, closureId, status, displayStatus, canEditAssignment` exactly as `buildOfficerUnitWeeklyPlans` builds them; `getZoneStatusCode` and `ZONE_STATUS_LABELS` are unchanged. In `getDashboardData`, replace `unitWeeks` with `officerWeek` (still `null` for HOD / Plant Head / Admin, who keep `nextWeek`).

### Access summary

| Endpoint | Roles | Scope |
|---|---|---|
| `GET /api/patrols/roster` | `PLANNING_ROLES` | officer's plant |
| `POST /api/patrols/roster` | `PLANNING_ROLES` | officer's plant; every row must resolve inside it |
| `PATCH /api/patrols/:patrolId/assignment` (+ `applyToUpcoming`) | `PLANNING_ROLES` | patrol's plant must be the officer's |

## Frontend

### Service — `frontend/src/features/patrols/patrol.service.js`

```js
export function fetchRoster()                       // GET /patrols/roster
export function uploadRoster(file) {               // POST /patrols/roster
  const body = new FormData(); body.append("roster", file);
  return apiRequest("/patrols/roster", { method: "POST", body });
}
```

`updatePatrolAssignment` gains `applyToUpcoming` in its JSON body. `apiRequest` already skips the JSON content-type for `FormData`.

### Hook — new `frontend/src/features/patrols/useRoster.js`

Owns: `roster` (from `fetchRoster`), `loading`, `uploading`, `selectedFile`, `error` (string), `rowErrors` (the `details` array when `code === "ROSTER_INVALID"`; `apiRequest` puts `details` on the thrown error), `summary` (from a successful upload). Exposes `selectFile(file)`, `upload()`, `reload()`, `downloadTemplate(zones, units, location)` (D11: builds `Location,Unit,Zone,Auditor (email),Auditee (email)\n` plus one line per zone with the last two cells empty, wraps it in a `Blob` of type `text/csv`, triggers a download named `weekly-roster-template.csv` via a temporary `<a download>`).

Client-side checks before upload: a file is selected; extension is `.csv` or `.xlsx`; size ≤ 2 MB. Same messages as the backend.

### Plan page — `frontend/src/features/patrols/PlanningPage.jsx` and new `RosterUploadPanel.jsx`, `RosterTable.jsx`

Add a **Weekly roster** section above the existing "Schedule an audit" button; the manual form stays below as the exception path.

`RosterUploadPanel` (uses `useRoster`):

- Intro line: "Upload the roles and responsibilities sheet once. Every zone in it is scheduled for every Monday from the upload date to 31 December." followed by the expected columns.
- Row of controls: file input (`accept=".csv,.xlsx"`), **Upload roster** (`button-primary`, disabled while uploading or without a file), **Download template** (`button-secondary`).
- After success: `Alert type="success"` with the message, then a small `patrol-summary` block: Zones, Mondays, First Monday, Last date, Audits created, Audits replaced.
- On `ROSTER_INVALID`: `Alert type="error"` with the message, then a table `Row | Field | Problem` from `rowErrors`. Any other error: the plain `Alert`.
- Confirmation before a re-upload when `roster.rows.length > 0`: `window.confirm("This replaces the current roster and every upcoming Monday audit generated from it. Continue?")`.

`RosterTable`: the current roster, `Unit | Zone | Auditor | Auditee | Upcoming audits`, with a caption "Effective A to B" and an empty-state note "No roster has been uploaded yet." Reuse the `weekly-list-header` / `weekly-list-row` grid styles.

### Dashboard — `frontend/src/features/dashboard/`

- `useDashboard.js`: replace `unitWeeks` with `officerWeek` in state and return.
- `DashboardPage.jsx`: `managementUser ? (officerWeek !== undefined && role === "EHS_OFFICER" ? <OfficerWeekCard week={officerWeek} onAssignmentChanged={reloadDashboard} /> : <WeeklySummary .../>) : <AuditStatusCards .../>`. Render `OfficerWeekCard` for the officer even when `officerWeek` is `null` so they see the empty state instead of the HOD widget.
- Replace `OfficerWeeklyPlan.jsx` + `UnitWeeklyCard.jsx` with **`OfficerWeekCard.jsx`**: one `patrol-planning-card` whose header button (`weekly-summary-card`, `aria-expanded`) shows the eyebrow "Weekly plan", the heading "Upcoming inspection week", the date range, and the total count; the body, when expanded, renders one `UnitZoneSection` per unit. Keep the `fetchPlanningLookups` users load and the `saveAssignment` callback from `OfficerWeeklyPlan.jsx` as they are. Empty state (`week === null`): "No inspections are scheduled. Upload the weekly roster on the Plan page." with a `<Link to="/plan">`.
- New **`UnitZoneSection.jsx`**: a static heading (`Unit N — name`, zone count) over the existing `weekly-list-header` and a `zone-assignment-list` of `ZoneAssignmentRow`s. This is `UnitWeeklyCard.jsx` minus the toggle.
- `ZoneAssignmentRow.jsx`: in edit mode add a checkbox under the selects, `Apply to every upcoming Monday for this zone until 31 December` (checked by default, `event.stopPropagation()` like the other controls). Pass `applyToUpcoming` through `onSaveAssignment`. Show the response message (it states how many audits changed) via the existing `Alert` slot as a success line for a few seconds, or simply rely on the reload. Nothing else in the row changes; `ZoneProgressDetail` is reused as is.

### Styles — `frontend/src/styles/global.css`

Append: `.roster-panel` (card padding, matches `.patrol-planning-card`), `.roster-controls` (flex row, wraps on mobile), `.roster-error-table` (three-column grid, `weekly-list-row` colours), `.unit-zone-section` and `.unit-zone-section-heading` (subtle divider between units inside the week card), `.zone-assignment-scope` (the checkbox line). Drop `.unit-weekly-card-grid` once `UnitWeeklyCard.jsx` is deleted.

## Seeds and test data

Add `docs/samples/weekly-roster-sample.csv`:

```csv
Location,Unit,Zone,Auditor (email),Auditee (email)
Gurugram,Unit 1,Zone 1,test.auditor@example.com,test.auditee@example.com
Gurugram,Unit 1,Zone 2,test.hod@example.com,test.plant.head@example.com
```

Adjust the location, unit and zone names to whatever the local master data uses (see [12-plan-page-plan.md](12-plan-page-plan.md#master-data-loading)). One person may cover several zones (D7), so a roster can be filled with as few as two users.

## Documentation to update in the same change

- `CLAUDE.md`: workflow step 1 (patrols are created by the roster upload **or** `POST /api/patrols`); the "feature plans" line (`docs/10`–`14`).
- [03-data-model.md](03-data-model.md): `zone_audit_rosters`, `patrols.roster_id`, migration 012.
- [04-api-reference.md](04-api-reference.md): `GET/POST /api/patrols/roster`, `applyToUpcoming` on the assignment PATCH, the dashboard's `officerWeek` replacing `unitWeeks`, new error codes.
- [05-workflows.md](05-workflows.md): the roster → Mondays → patrol flow and the propagation rule.
- [06-frontend.md](06-frontend.md): `useRoster`, the new components, the removed ones.
- [README.md](README.md): add row 14.

## Implementation order

1. Migration 012; `docker compose up -d --build backend`; confirm `\d zone_audit_rosters`.
2. Dependencies (lockfile via the Node 22 container), `rosterUpload.js`, `rosterParser.js`. Check the parser with the sample CSV and an `.xlsx` saved from it by hand, both through the running API.
3. Repository functions, then `uploadRoster` / `getRoster` in the service, controller, routes. Verify with curl (see checks 1–9).
4. `updatePatrolAssignment` propagation.
5. Dashboard backend (`findOfficerWeekPatrols`, `buildOfficerWeek`, `officerWeek`).
6. Frontend: service + `useRoster` + Plan page panel; then the dashboard week card; then the checkbox on the row.
7. Docs.

## Acceptance checks

Run against the containers with an EHS Officer token (`test.ehs.officer`) unless stated.

| # | Check | Expected |
|---|---|---|
| 1 | `POST /api/patrols/roster` with the sample CSV on a Wednesday | 201; `summary.firstMonday` is the coming Monday, `summary.lastDate` is `YYYY-12-31`, `patrolsCreated` = zones × Mondays; the calendar (`GET /api/dashboard?year=&month=`) shows every zone on every Monday |
| 2 | Same file saved as `.xlsx` (emails as Excel hyperlinks) | Same result as 1 |
| 3 | Upload on a Monday | That Monday is included |
| 4 | A row with `Location` = another plant | 400 `ROSTER_INVALID`, `details[0].row` is the row number in the file, nothing written |
| 5 | Unknown unit, unknown zone, unknown email, auditor = auditee, duplicate zone, same email in two rows — all in one file | One 400 listing every problem with its row and field |
| 6 | Missing header column | 400 `ROSTER_INVALID` with `row: 1, field: "header"` |
| 7 | A `.txt` file; a 3 MB file | 400 `UNSUPPORTED_ROSTER_FILE`; 400 `ROSTER_FILE_TOO_LARGE` |
| 8 | Plan a manual audit for a zone next Monday, then upload a roster including that zone | The manual patrol is kept (no duplicate for that zone/date); other Mondays generated |
| 9 | Plan a manual audit next Monday whose auditor is also in the roster file | Accepted: one person may hold several zones on a Monday. The roster keeps the hand-planned audit for that zone/date and generates the rest |
| 10 | Re-upload with one zone removed and one auditor changed | Removed zone's future roster patrols deleted and its roster row gone; changed zone's future Mondays carry the new auditor; a past Monday and a Monday with an observation report are untouched; manual patrols untouched |
| 11 | Upload from an officer with no `plant_id` | 400 `EHS_OFFICER_LOCATION_NOT_SET` |
| 12 | Sign in as `test.auditor` and `POST /api/patrols/roster` | 403 |
| 13 | Dashboard as the officer after 1 | `officerWeek` has one `weekStart`, `units[]` grouped, each zone `status: "OPEN"`, `canEditAssignment: true`; the card expands to that list in the browser |
| 14 | Edit a zone's auditor from the card with the checkbox on | 200, `updatedCount` = remaining Mondays for that zone; `GET /api/patrols/roster` shows the new auditor; a later Monday for that zone shows the new auditor on the calendar |
| 15 | Same edit with the checkbox off | Only that Monday changes; roster row unchanged |
| 16 | Edit a zone to an auditor who already audits another zone that Monday | Accepted; the same person now covers both zones |
| 17 | Edit a zone whose observation report is already filed | 409 `PATROL_NOT_EDITABLE` |
| 18 | File a report for one Monday's zone, save a plan, submit, approve | Statuses on the card move through With Auditee → Action Plan being Implemented → EHS Officer Action Required → Closed, same as before this change |
| 19 | Sign in as `test.hod` | Dashboard still shows the plant-wide `nextWeek` widget, no `officerWeek` |
| 20 | Sign in as the Action HOD | `/dashboard` still redirects to `/tickets` |
