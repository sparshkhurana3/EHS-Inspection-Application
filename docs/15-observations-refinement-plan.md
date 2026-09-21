# 15. Observations page: multiple observations, "no observation" closure, Thursday deadline, six-month history

Implementation plan for the auditor's **Observations** page refinement. Written to be implemented file by file without further design decisions. Read [02-architecture.md](02-architecture.md) for the layering rules first. The page as it stands is described in [10-observations-page-plan.md](10-observations-page-plan.md); this plan builds on it and does not repeat it.

**Goal**

1. An observation report holds **up to 10 observations**. The header (week number, location, unit, zone, auditor, auditee, EHS Officer) appears once; **area, category, photograph, description and risk** repeat per observation, with an "Add another observation" control in the form.
2. From the auditor's point of view a report is **Open** (nothing filed yet) or **Closed** (either filed and sent to the auditee, or closed with **No observation to record**). Once the auditee's closure and the Action HOD's ticket complete, they are shown on the report as information.
3. **No observation to record**: one click closes an open report with no observations, marks the audit complete for the auditee, and shows the outcome to the EHS Officer.
4. The report is **due by Thursday** of its audit week. The page shows the due date and flags overdue reports.
5. A **Past 6 months** view lists every report the caller can see, filterable, in particular by **Closed via ticket** (the Action HOD implemented the plan or rejected it).

**Non-regression rule.** Closure, ticket, approval and dashboard workflows keep working unchanged. Concretely: `closure_requests` stays one-per-report; the observation columns on `observation_reports` that the closure, ticket and dashboard queries read today keep being filled (with observation #1, see D2); `GET /api/observations/:reportId/photograph` keeps returning observation #1's photo; the ticket's snapshot and the closure loop are untouched. Existing reports get exactly one `observation_items` row by migration backfill, so every old report renders the same as before.

## Decisions taken in this plan

| # | Decision | Why |
|---|---|---|
| D1 | Observations live in a new child table `observation_items` (1–10 per report). The report row keeps the header (patrol, dates, status, number). | The spec's "repeated fields" are exactly the item columns; the rest is the report. |
| D2 | The existing per-observation columns on `observation_reports` (`observation_location`, `category`, `description`, `risk_category`, `photograph_*`, `zone_area_id`) are **kept and filled with observation #1**. Responses additionally carry `observations[]`, `observationCount` and `highestRisk`. | Closure, ticket and dashboard SQL keep working with no change; the pages that should show every observation read `observations[]`. |
| D3 | **One closure per report** stays; the auditee writes one action plan covering all observations. | Not asked to change, and the ticket snapshot (`proposed_action_plan`, one per closure round) is built on it. |
| D4 | "No observation to record" creates a report row with `no_observations = TRUE`, `status = 'CLOSED'`, `closed_at = NOW()`, **no items and no closure**, and moves the patrol to `COMPLETED`. It gets a `report_number` like any report. | Keeps "one report per patrol" true, so the weekly list, calendar and history treat it uniformly. The auditee's dashboard already treats a `CLOSED` report as no action needed. |
| D5 | Due date = **Thursday of the ISO week of `scheduled_date`** (Monday + 3 days). `isOverdue` = no report yet and today > due date. Being overdue **does not block** submission. | The spec sets a deadline, not a lock; blocking would leave an audit that can never be closed. |
| D6 | Pending list widens from "this week" to "this week **plus unsubmitted audits from the previous 4 weeks**", each flagged overdue. Submitted list stays "this week". | A deadline that silently disappears when the week rolls over is no deadline. Four weeks bounds it. |
| D7 | `weekNumber` on the observations page becomes the **ISO week** of `scheduled_date` (`EXTRACT(ISOWEEK …)`), matching the dashboard's "Week N audit" label. The closure module's `ROW_NUMBER` `week_number` is left alone (nothing renders it). | The header must show a week number; the sequential-patrol count the query computes today is not one. |
| D8 | The auditor's report status is derived, not stored: `reportStatus` `OPEN` (no report) / `CLOSED` (report exists), with `outcome` `NO_OBSERVATIONS` / `SENT_TO_AUDITEE`. The stored `observation_reports.status` machine is untouched. | The spec's two states are the auditor's view; the stored machine drives the auditee/officer flow. |
| D9 | History = reports whose patrol `scheduled_date` is within the last **6 months**. Scope: auditor/auditee/EHS officer of the patrol see their own; `EHS_OFFICER`/`HOD`/`PLANT_HEAD`/`ADMIN` see every report **at their plant** (`users.plant_id`; if unset, own only). | Same scope rule as the dashboard's management view. |
| D10 | History filters: `all`, `closed` (**latest ticket `status = 'CLOSED'`**, decision accepted or rejected — the spec's definition), `no_observations`, `in_progress` (everything else). | The spec defines "closed" by the ticket, not by closure approval. |
| D11 | Multipart layout for submission: text field `observations` = JSON array (1–10) of `{ zoneAreaId, category, description, riskCategory }`; files field `photographs`, one file per observation **in the same order**. `req.files[i]` belongs to `observations[i]`; counts must match. | Multer keeps part order; index-keyed field names would need `upload.any()` and hand parsing. |
| D12 | nginx `client_max_body_size` rises from 32m to **110m** (10 photographs × 10 MB + multipart overhead). | 10 × 10 MB is the stated maximum. |
| D13 | The finding date stays **once per report**. | The spec lists it in neither the repeated nor the once-only set; today it is one field. |

## Data model

One migration, `backend/database/migrations/013_add_observation_items.sql`, idempotent, wrapped in `BEGIN; ... COMMIT;`.

```sql
CREATE TABLE IF NOT EXISTS observation_items (
    id                       BIGSERIAL PRIMARY KEY,
    observation_report_id    BIGINT NOT NULL REFERENCES observation_reports(id) ON DELETE CASCADE,
    sequence_number          INTEGER NOT NULL,

    zone_area_id             BIGINT REFERENCES zone_areas(id),
    observation_location     TEXT,               /* area name at filing time */
    category                 VARCHAR(2)  NOT NULL,
    description              TEXT        NOT NULL,
    risk_category            VARCHAR(20) NOT NULL,

    photograph_path          TEXT NOT NULL,
    photograph_original_name TEXT,
    photograph_mime_type     VARCHAR(100),
    photograph_size          BIGINT,

    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT observation_items_sequence_unique UNIQUE (observation_report_id, sequence_number),
    CONSTRAINT observation_items_sequence_range  CHECK (sequence_number BETWEEN 1 AND 10),
    CONSTRAINT observation_items_category_check  CHECK (category IN ('UA', 'UC')),
    CONSTRAINT observation_items_risk_check      CHECK (risk_category IN ('HIGH', 'MEDIUM', 'LOW'))
);

CREATE INDEX IF NOT EXISTS observation_items_report_index
ON observation_items (observation_report_id, sequence_number);

ALTER TABLE observation_reports
ADD COLUMN IF NOT EXISTS no_observations BOOLEAN NOT NULL DEFAULT FALSE;

/* one item per existing report, from the columns it already holds */
INSERT INTO observation_items (
    observation_report_id, sequence_number, zone_area_id, observation_location,
    category, description, risk_category,
    photograph_path, photograph_original_name, photograph_mime_type, photograph_size, created_at
)
SELECT
    r.id, 1, r.zone_area_id, r.observation_location,
    r.category, r.description, r.risk_category,
    r.photograph_path, r.photograph_original_name, r.photograph_mime_type, r.photograph_size, r.submitted_at
FROM observation_reports AS r
WHERE r.no_observations = FALSE
  AND r.description IS NOT NULL
  AND r.photograph_path IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM observation_items AS i WHERE i.observation_report_id = r.id
  );
```

`UA`/`UC` and `HIGH`/`MEDIUM`/`LOW` are fixed business vocabulary, so the CHECK constraints are correct here (see CLAUDE.md, "Conventions"). Areas come from `zone_areas` by foreign key, never from a list.

## Backend

### Uploads — `backend/src/modules/observations/observationUpload.js`

- `limits: { fileSize: 10 MB, files: 10 }`; export `uploadObservationPhotographs = upload.array("photographs", 10)`. Remove `uploadObservationPhotograph` (`.single`).
- `handleObservationUploadError`: `LIMIT_FILE_COUNT` / `LIMIT_UNEXPECTED_FILE` → `TOO_MANY_OBSERVATION_IMAGES` ("Up to 10 photographs can be attached, one per observation."). Other mappings unchanged.

### Validator — `observation.validator.js`

Replace the per-observation rules in `createObservationValidationRules` (`zoneAreaId`, `category`, `description`, `riskCategory`) with one rule:

```js
body("observations")
  .notEmpty().withMessage("Add at least one observation.")
  .bail()
  .customSanitizer((value) => { try { return JSON.parse(value); } catch { return null; } })
  .custom((items) => { /* array, 1..10; each: zoneAreaId int ≥1, category UA|UC, riskCategory HIGH|MEDIUM|LOW, description non-empty ≤500 words; throw with "Observation N: <message>" */ }),
```

Keep `patrolId` and `findingDate`. Add:

```js
export const noObservationValidationRules = [ body("patrolId").notEmpty().isInt({ min: 1 }).toInt() ];

export const historyValidationRules = [
  query("filter").optional().isIn(["all", "closed", "no_observations", "in_progress"]),
];

export const observationItemIdValidationRules = [
  ...observationReportIdValidationRules,
  param("itemId").isInt({ min: 1 }).toInt(),
];
```

### Repository — `observation.repository.js`

| Function | Change |
|---|---|
| `findWeeklyAuditorAssignments({ auditorId, currentDate })` | Drop the `zone_patrol_sequence` CTE; select `EXTRACT(ISOWEEK FROM patrol.scheduled_date)::INT AS week_number`. Add `observation_report.no_observations`, `observation_report.closed_at`, and two lateral sub-selects: `(SELECT COUNT(*) FROM observation_items i WHERE i.observation_report_id = observation_report.id) AS observation_count` and `(SELECT MIN(CASE risk_category WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END) …)` mapped back to a label as `highest_risk`. Widen the window (D6): `(scheduled_date within the current ISO week) OR (observation_report.id IS NULL AND scheduled_date >= current week start − 28 days AND scheduled_date < current week start)`. Also LEFT JOIN `closure_requests` and the same `LEFT JOIN LATERAL latest_ticket` block as `closure.repository.js` so each submitted row carries `closure_status`, `ticket_status`, `ticket_decision`, `ticket_closure_date`. |
| `findItemsByReportId(reportId, client)` | `SELECT i.*, zone_area.name AS area_name FROM observation_items i LEFT JOIN zone_areas … WHERE observation_report_id = $1 ORDER BY sequence_number`. Maps to `{ id, sequenceNumber, zoneAreaId, areaName, observationLocation, category, description, riskCategory, photographOriginalName }` (no path in the response). |
| `findItemPhotograph({ reportId, itemId, userId })` | Same ownership predicate as `findPhotographByReportId` (auditor / auditee / EHS officer / ticket's Action HOD), plus `i.observation_report_id = $1 AND i.id = $2`. Returns the item's photograph columns. |
| `findPhotographByReportId` | Unchanged (report-level columns = item #1, D2). |
| `createReport(...)` | Takes `items: [{ zoneAreaId, observationLocation, category, description, riskCategory, photograph }]`. Inserts the report with observation #1's values in the existing columns, then inserts every item with `sequence_number = index + 1`. Same report-number update as today. Returns the mapped report with `observations`. |
| `createNoObservationReport({ patrolId, auditorId, auditeeId, findingDate, plantLocation }, client)` | `INSERT INTO observation_reports (patrol_id, submitted_by, submitted_to, status, finding_date, plant_location, no_observations, closed_at) VALUES (…, 'CLOSED', …, TRUE, NOW())`, then the report-number update. |
| `completePatrolWithoutObservations(patrolId, client)` | `UPDATE patrols SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1 AND status IN ('SCHEDULED','IN_PROGRESS') RETURNING id`. |
| `findReportByIdForUser({ reportId, userId })` | Add `no_observations`, `closed_at`, `closure_request.id/status/action_plan/target_date/action_hod_name/approved_at/closed_at` (LEFT JOIN) and the `latest_ticket` lateral (id, status, decision, closure_date, comments). Widen the ownership predicate with the ticket's `action_hod_id = $2` and with plant management: `OR EXISTS (SELECT 1 FROM users me JOIN user_roles ur ON ur.user_id = me.id JOIN roles ro ON ro.id = ur.role_id WHERE me.id = $2 AND me.plant_id = plant_record.id AND ro.code IN ('EHS_OFFICER','HOD','PLANT_HEAD','ADMIN'))`. |
| `findReportHistory({ userId, plantId, managementScope, fromDate, filter })` | One query: reports joined to patrol/unit/zone/plant/users, LEFT JOIN closure, LEFT JOIN LATERAL latest ticket, item count and highest risk as above. `WHERE patrol.scheduled_date >= $fromDate AND (<ownership> OR ($managementScope AND unit.plant_id = $plantId))` and the filter predicate: `closed` → `latest_ticket.status = 'CLOSED'`; `no_observations` → `observation_report.no_observations`; `in_progress` → `NOT no_observations AND (latest_ticket.status IS DISTINCT FROM 'CLOSED')`; `all` → none. `ORDER BY patrol.scheduled_date DESC, observation_report.id DESC LIMIT 300`. |

### Service — `observation.service.js`

- **Week and due date helpers** next to `getCurrentDate`: `getIsoWeekStart(dateOnly)` (Monday), `getDueDate(scheduledDate)` = Monday of that week + 3 days, both UTC, both returning `"YYYY-MM-DD"`. `pg` returns `DATE` columns as JS `Date` objects, so convert with `toISOString().slice(0, 10)` (the same trap `patrol.service.js#toDateOnlyString` documents).
- **`createReportResponse(report)`** becomes:

  ```js
  {
    ...report,
    status,                                          // stored status, unchanged
    outcome: report.noObservations ? "NO_OBSERVATIONS" : "SENT_TO_AUDITEE",
    displayStatus: report.noObservations ? "Closed – no observations" : "Closed – sent to auditee",
    observationCount, highestRisk,
    closure: report.closureStatus ? { status, displayStatus (reuse closure.service's label map by importing TICKET/closure label helpers, or copy the 6-entry map), actionPlan, targetDate, actionHodName, approvedAt, closedAt } : null,
    ticket:  report.ticketStatus  ? { id, status, displayStatus, decision, closureDate } : null,
    lifecycleStatus, lifecycleLabel,                 // see table below
  }
  ```

  | `lifecycleStatus` | when | label |
  |---|---|---|
  | `NO_OBSERVATIONS` | `no_observations` | Closed – no observations |
  | `CLOSED_VIA_TICKET` | ticket `CLOSED` | Closed – action implemented (decision `ACCEPTED`) / Closed – plan rejected (`REJECTED`) |
  | `EHS_OFFICER_ACTION_REQUIRED` | closure `SUBMITTED_FOR_CLOSURE` | EHS Officer action required |
  | `APPROVED` | closure `APPROVED` | Approved by EHS Officer |
  | `ACTION_PLAN_IN_PROGRESS` | closure `IN_PROGRESS` | Action plan being implemented |
  | `WITH_AUDITEE` | otherwise | With auditee |

  Order matters: a ticket closed on a closure that was later approved is still "Closed via ticket" (the spec's filter).

- **`getWeeklyAssignments`**: per assignment add `weekNumber` (from the query), `dueDate`, `isOverdue` (`!report && currentDate > dueDate`), `reportStatus` (`OPEN`/`CLOSED`), and `isFromEarlierWeek`. Split `pending` (no report) / `submitted` (report); `overdueCount` added to the totals. `weekStartDate`/`weekEndDate` stay the current week.
- **`submitObservation({ userId, patrolId, findingDate, observations, photographs })`**: `photographs.length` must equal `observations.length` (else `400 OBSERVATION_PHOTOGRAPH_COUNT_MISMATCH`, "Attach exactly one photograph per observation."); 1–10 observations; every `zoneAreaId` must be one of the patrol's areas (`AREA_NOT_IN_PATROL_ZONE`, message prefixed "Observation N:"). Then the existing transaction with `createReport({ …, items })`. On any failure delete **every** uploaded file. Everything else (closure creation, patrol → `PENDING_AUDITEE_ACTION`, `23505` mapping) unchanged.
- **`recordNoObservation({ userId, patrolId })`**: transaction → `findPatrolForSubmission` (404 if not the auditor's) → no existing report (`409 OBSERVATION_REPORT_ALREADY_EXISTS`) → status `SCHEDULED|IN_PROGRESS` (`409 PATROL_STATUS_NOT_ELIGIBLE`) → `createNoObservationReport` with `findingDate = getCurrentDate()` → `completePatrolWithoutObservations`. Returns `{ message: "Audit closed with no observation to record. The auditee and EHS Officer can see this on their dashboards.", report }`.
- **`getObservationReport`**: attach `observations: await findItemsByReportId(reportId)` (empty for a no-observation report).
- **`getObservationHistory({ user, filter })`**: `fromDate` = today − 6 months (UTC, first of that day); `managementScope` = user holds any of the four management roles; `plantId` via `findUserLocation`-style lookup (add `findUserPlantId(userId)` to this repository rather than importing from patrols). Returns `{ windowMonths: 6, filter, count, reports: rows.map(createReportResponse) }`.
- **`getObservationItemPhotograph({ userId, reportId, itemId })`**: same path-containment and `access` checks as `getObservationPhotograph`.

### Controller and routes

```js
router.get("/current-assignments", authenticate, getWeeklyAssignments);
router.get("/history", authenticate, historyValidationRules, validate, getObservationHistory);   // before /:reportId
router.post("/no-observation", authenticate, noObservationValidationRules, validate, recordNoObservation);
router.get("/:reportId", …);                                   // unchanged
router.get("/:reportId/photograph", …);                        // unchanged, item #1
router.get("/:reportId/items/:itemId/photograph", authenticate, observationItemIdValidationRules, validate, getObservationItemPhotograph);
router.post("/", authenticate, uploadObservationPhotographs, handleObservationUploadError, createObservationValidationRules, validate, createObservation);
```

`createObservation` passes `req.body.observations` (already parsed by the sanitizer) and `req.files`. Literal paths (`/history`, `/no-observation`) are declared before `/:reportId`.

### Closures, tickets, dashboard (read side of D2)

- `closure.repository.js` `CLOSURE_SELECT` and `ticket.repository.js` `TICKET_SELECT`: add one lateral JSON aggregate

  ```sql
  COALESCE((
    SELECT JSON_AGG(JSON_BUILD_OBJECT(
      'id', i.id, 'sequenceNumber', i.sequence_number, 'areaName', a.name,
      'category', i.category, 'description', i.description, 'riskCategory', i.risk_category
    ) ORDER BY i.sequence_number)
    FROM observation_items i LEFT JOIN zone_areas a ON a.id = i.zone_area_id
    WHERE i.observation_report_id = observation_report.id
  ), '[]'::JSON) AS observations
  ```

  mapped as `observations` in `mapClosure` / `mapTicket`. No other change: the existing single-observation fields keep coming from the report row.
- `dashboard.repository.js` `findOfficerWeekPatrols`: add `observation_report.no_observations`. `dashboard.service.js` `getZoneStatusCode`: before the closure checks, `if (noObservations) return "CLOSED_NO_OBSERVATIONS"`, label "Closed – no observations", CSS class `weekly-status-closed`. The per-user branch needs nothing: `has_open_observation_report` is already false for a `CLOSED` report and `auditor_action_completed` true.

### Access summary

| Endpoint | Roles | Scope |
|---|---|---|
| `GET /api/observations/current-assignments` | `USER` | own auditor patrols |
| `POST /api/observations` | `USER` | patrol's auditor |
| `POST /api/observations/no-observation` | `USER` | patrol's auditor |
| `GET /api/observations/history` | `USER` | own, or plant-wide for management roles |
| `GET /api/observations/:reportId` | `USER` | auditor / auditee / EHS officer / Action HOD of its ticket / plant management |
| `GET /api/observations/:reportId/items/:itemId/photograph` | `USER` | same as above |

## Frontend

### Service — `frontend/src/features/observations/observation.service.js`

- `createObservationReport({ patrolId, findingDate, observations })`: `formData.append("observations", JSON.stringify(observations.map(({ zoneAreaId, category, description, riskCategory }) => …)))`, then `observations.forEach((o) => formData.append("photographs", o.photograph))` **in that order** (D11).
- `recordNoObservation(patrolId)` → `POST /observations/no-observation`.
- `fetchObservationHistory(filter)` → `GET /observations/history?filter=`.
- `fetchObservationItemPhotograph(reportId, itemId)` → `apiBlobRequest`.

### Hook — `useObservations.js`

- `useWeeklyObservations`: expose `overdueCount`; nothing else changes shape (rows carry the new fields).
- `useObservationForm(assignment)`: `values` becomes `{ findingDate, observations: [emptyItem()] }` where `emptyItem = { key, zoneAreaId, category, description, riskCategory, photograph, photographPreview }` (`key` = `crypto.randomUUID()` for React keys). Exposes `addObservation()` (no-op at 10), `removeObservation(index)` (no-op at 1), `updateItemField(index, name, value)`, `updateItemPhotograph(index, file)`, `removeItemPhotograph(index)`. Validation runs per item and reports "Observation N: …". Revoke every preview URL on reset/unmount. `MAX_OBSERVATIONS = 10` exported.
- New `useNoObservation()`: `{ submitting, error, record(patrolId) }` around `recordNoObservation`.
- New `useObservationHistory(filter)`: `{ reports, count, loading, error, reload }`, reloading when `filter` changes.
- `useObservationDetail(reportId)`: load `report.observations` and fetch each item's photograph into `photographs: { [itemId]: objectUrl }`; drop the single `photograph`.

### Components

- **`ObservationPage.jsx`**: a tab strip under the header, `This week` / `Past 6 months`, stored in the query string as `?view=history` so the back button works. Header shows `Overdue (N)` next to `Pending (N)` when `overdueCount > 0`. `?reportId=` still opens `ObservationDetail` from either tab; `?patrolId=` opens the form.
- **`ObservationList.jsx`** `PendingObservationList`: each row shows `Due Thu DD Mon` and an `Overdue` chip (`observation-due-overdue`) when `isOverdue`; rows from earlier weeks show their audit date in the main line. Two buttons per row: **Fill report** (existing) and **No observation to record** (calls `onNoObservation(assignment)` after `window.confirm("Close this audit with no observation to record? The auditee will have nothing to act on and the EHS Officer will see it as closed.")`). `SubmittedObservationList`: status chip shows `displayStatus`; meta line shows `N observations · highest risk HIGH` or `No observations`, plus a small `lifecycleLabel` line when a closure/ticket exists.
- **`ObservationCard.jsx`** (the form): header grid gains `Week number` (`assignment.weekNumber`), `Auditor` (`assignment.auditorName`) and `Due by` (`formatDate(assignment.dueDate)`), keeping Audit date, Plant, Unit, Zone, Auditee, EHS Officer. The finding-date field stays once. Then one **`ObservationItemFields.jsx`** per item (new component: heading `Observation N of M`, area `<select>`, category, `PhotographInput`, description with word count, `RiskSelector`, a `Remove` button when `M > 1`), followed by an **Add another observation** button (disabled at 10, with "Up to 10 observations per report"). Ids inside the item are suffixed with the index (`zoneAreaId-2`) so labels stay unique. Submit label unchanged.
- **`ObservationDetail.jsx`**: header grid once (report number, week, dates, plant, unit, zone, auditor, auditee, EHS officer, status chip = `displayStatus`); then, for a no-observation report, a single note "The auditor recorded no observation for this audit."; otherwise one `observation-detail-item` per observation (area, category, risk, description, photograph from `photographs[item.id]`). Below that, **only when present**: a `closure-action-plan`-styled block with the closure's plan, target date, Action HOD and status, and `<TicketStatusCard ticket={report.ticket} />` (reused from `features/tickets`). Back button label depends on the tab it was opened from.
- **New `ObservationHistory.jsx`**: filter `<select>` (All / Closed via ticket / No observations / In progress), count line, and a `weekly-list-header` + rows grid: Date · Unit / Zone · Auditor · Auditee · Observations · Status (`lifecycleLabel`). Clicking a row opens `?view=history&reportId=`. Empty state per filter.
- **`ObservationSummary.jsx`** (`features/closures`, used by closure, approval, ticket and dashboard zone detail): when `closure.observations?.length > 0`, render the header fields once and then one block per observation with its own photograph from a new `photographs` prop (`{ [itemId]: url }`); otherwise render exactly as today from the single fields and the `photograph` prop. `useClosureDetail` and `useTicketDetail` fetch every item's photograph via `fetchObservationItemPhotograph` into `photographs` and keep the existing `photograph` (item #1) for the fallback. `TicketDetail.jsx` passes `observations: ticket.observations` through in its adapter object.

### Styles — `frontend/src/styles/global.css`

Append: `.observation-tabs` (button row), `.observation-tab-active`, `.observation-due` / `.observation-due-overdue` (chip, red variant), `.observation-item-fieldset` (bordered block with the `Observation N of M` heading and a `Remove` button at the right), `.observation-add-item` (secondary button, full width), `.observation-detail-item` (same look as `.existing-report-grid` plus description and photo), `.observation-history-row` (6-column grid variant of `.weekly-list-row`), `.observation-list-actions` (two buttons on a pending row, stacked on mobile).

### Infrastructure

- `frontend/nginx.conf`: `client_max_body_size 110m;` (D12).

## Test data

The seeds are unchanged. For manual checks use a roster-generated Monday audit (docs/14) so an auditor has a pending assignment; two zones assigned to the same auditor give both a "fill" and a "no observation" case in one week.

## Documentation to update in the same change

- `CLAUDE.md`: workflow step 2 (a report holds 1–10 `observation_items`; "no observation" closes the patrol with no closure; the per-observation columns on the report are observation #1), the uploads bullet (`photographs`, up to 10), the "feature plans" line.
- [03-data-model.md](03-data-model.md): `observation_items`, `observation_reports.no_observations`, migration 013.
- [04-api-reference.md](04-api-reference.md): the changed `POST /api/observations` body, `no-observation`, `history`, the item photograph route, the new response fields.
- [05-workflows.md](05-workflows.md): the no-observation path and the Thursday deadline.
- [06-frontend.md](06-frontend.md): new components and hooks.
- [README.md](README.md): row 15.

## Implementation order

1. Migration 013; rebuild; confirm `\d observation_items` and that every existing report has one item.
2. Upload middleware + validator + repository `createReport(items)` + service `submitObservation` + route. Submit a 2-observation report with curl (checks 1–4).
3. `recordNoObservation` end to end (checks 5–7), then the dashboard `CLOSED_NO_OBSERVATIONS` code.
4. Weekly query changes (ISO week, due date, earlier-week pending rows) and `createReportResponse` (checks 8–10).
5. Report detail with items/closure/ticket, item photograph route, history endpoint (checks 11–14).
6. Closure/ticket `observations[]` + `ObservationSummary` + hooks (checks 15–16).
7. Frontend form, lists, detail, history tab, styles; nginx.
8. Docs.

## Acceptance checks

Run against the containers as `test.auditor` unless stated.

| # | Check | Expected |
|---|---|---|
| 1 | `POST /api/observations` with `observations` = 2 items and 2 `photographs` | 201; `report.observations.length === 2`, `observationCount 2`, `highestRisk` is the higher of the two; report row's `description`/`category`/`risk_category`/`photograph_path` equal observation #1; two `observation_items` rows with `sequence_number` 1 and 2 |
| 2 | Same with 11 items | 400 `VALIDATION_ERROR`, "Up to 10 observations per report."; no files left in `uploads/observations` |
| 3 | 2 items, 1 photograph | 400 `OBSERVATION_PHOTOGRAPH_COUNT_MISMATCH`; no files left |
| 4 | Item 2's `zoneAreaId` from another zone | 400 `AREA_NOT_IN_PATROL_ZONE` with "Observation 2:" in the message; nothing written |
| 5 | `POST /api/observations/no-observation` on a pending patrol | 201; report `status CLOSED`, `noObservations true`, `outcome NO_OBSERVATIONS`, has a `report_number`; no `closure_requests` row; patrol `COMPLETED` |
| 6 | Same patrol again, and `POST /api/observations` on it | 409 `OBSERVATION_REPORT_ALREADY_EXISTS` both times |
| 7 | Sign in as that patrol's auditee → `GET /api/dashboard` | `nextAudit` reports the task complete (no open observation report); as the EHS Officer the week card shows the zone as "Closed – no observations" |
| 8 | `GET /api/observations/current-assignments` on a Friday for a Monday audit with no report | the row has `dueDate` = that Thursday, `isOverdue true`, `reportStatus "OPEN"`; the page shows the Overdue chip |
| 9 | Same, audit was **last** Monday and still has no report | still listed in `pending` with `isFromEarlierWeek true`; an audit 5 weeks old is not |
| 10 | Assignment `weekNumber` | equals the ISO week the dashboard prints for that date |
| 11 | `GET /api/observations/:reportId` for the 2-item report | `observations[]` with both items and `areaName`s, `closure` and `ticket` null until they exist |
| 12 | After the auditee saves a plan and the HOD accepts and closes the ticket | the same GET carries `closure.status`, `ticket.status "CLOSED"`, `ticket.decision "ACCEPTED"`, `lifecycleStatus "CLOSED_VIA_TICKET"` |
| 13 | `GET /api/observations/:reportId/items/:itemId/photograph` as the auditor, the auditee, the Action HOD and `test.plant.head` (same plant) | 200 for all four; 404 for `roster.test1`; 404 for an `itemId` from another report |
| 14 | `GET /api/observations/history?filter=closed` as the EHS Officer | only reports whose latest ticket is `CLOSED`; `filter=no_observations` only the check-5 report; `filter=all` everything at the plant from the last 6 months; as `test.auditor` only their own |
| 15 | `GET /api/closures/:id` and `GET /api/tickets/:id` for the 2-item report | both responses carry `observations[]` with 2 entries and the old single fields unchanged |
| 16 | Closure page, ticket page and officer zone detail in the browser | show both observations with both photographs; a pre-migration single-observation report renders exactly as before |
| 17 | Form: add 3 observations, remove the 2nd, submit | the two remaining are sent in order; the detail view shows "Observation 1 of 2", "2 of 2" |
| 18 | Form: "Add another observation" after 10 | disabled with the hint text |
| 19 | Pending row → "No observation to record" → confirm | row moves to Submitted with "Closed – no observations"; Cancel leaves it pending |
| 20 | Past 6 months tab, filter Closed via ticket, click a row, Back | detail opens with closure and ticket blocks; Back returns to the history tab with the filter kept |
| 21 | Sign in as the Action HOD | `/observations` still redirects to `/tickets`; the ticket page still shows the observation |
| 22 | `POST /api/observations` with 10 photographs of ~9 MB each through nginx (port 8090) | 201, not 413 |
