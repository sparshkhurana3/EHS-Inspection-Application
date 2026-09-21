# 4. API reference

Base path `/api`, mounted in `backend/src/app.js`. All bodies are JSON unless noted. Line references are as of commit `24bb98a`.

> **HEAD does not boot.** `observation.routes.js:39` registers `getCurrentAssignments`, which is not imported, so importing `app.js` throws at module load. See the [backlog](09-feature-refinement-backlog.md) P0 items. The reference below documents the *intended* contract.

## Conventions

**Error envelope** (`middleware/errorHandler.js`):

```json
{ "message": "…", "code": "ERROR_CODE", "details": [{ "field": "…", "message": "…" }] }
```

For status ≥ 500 the message is replaced with a generic one; `details` is still passed through. `stack` is added for 5xx outside production. Unknown routes → `404 ROUTE_NOT_FOUND`.

**Codes every protected route can return**

| Code | HTTP | When |
|---|---|---|
| `AUTHENTICATION_REQUIRED` | 401 | No `Authorization: Bearer …` |
| `INVALID_TOKEN_TYPE` | 401 | JWT `tokenType !== "access"` |
| `INVALID_AUTHENTICATION_TOKEN` | 401 | Bad signature/issuer/audience |
| `AUTHENTICATION_TOKEN_EXPIRED` | 401 | Expired |
| `ACCOUNT_UNAVAILABLE` | 401 | User row missing or inactive |
| `INSUFFICIENT_PERMISSIONS` | 403 | Role not in `authorize(...)` list |
| `VALIDATION_ERROR` | 400 | express-validator failure; `details[]` |

**Auth rate limit**: `/auth/signup` and `/auth/login` share a limiter of 20 requests / 15 min per IP → `429 AUTHENTICATION_RATE_LIMIT_EXCEEDED`.

## Health

### `GET /api/health` — no auth
`200 { "status": "healthy", "service": "ehs-inspection-api", "timestamp": "<ISO>" }`

## Auth

### `POST /api/auth/signup` — no auth

| Field | Rules |
|---|---|
| `fullName` | trimmed, 2–150 chars |
| `username` | trimmed, 3–100, `/^[a-zA-Z0-9._-]+$/`, stored lowercase |
| `email` | valid email, `normalizeEmail()`, stored lowercase |
| `password` | 8–128, ≥1 lower, ≥1 upper, ≥1 digit, ≥1 non-alphanumeric |
| `confirmPassword` | must equal `password` |

Transaction: insert `users` (`LOCAL`), link role `USER`, insert `authentication_events(SIGNUP)`. Uniqueness checked on username then email.

`201`:
```json
{ "message": "Your account was created successfully.", "token": "<JWT>",
  "user": { "id", "fullName", "username", "email", "roles": ["USER"], "authenticationSource": "LOCAL", "lastLoginAt": null },
  "redirectTo": "/dashboard" }
```
Errors: `USERNAME_ALREADY_EXISTS` 409, `EMAIL_ALREADY_EXISTS` 409, `ACCOUNT_ALREADY_EXISTS` 409 (PG 23505).

### `POST /api/auth/login` — no auth

Body: `identifier` (username or email, ≤255), `password` (≤128).

Order of checks: lookup by `LOWER(username)` or `LOWER(email)` → unknown (logs `LOGIN_FAILURE` with null user) → inactive → locked (`locked_until > NOW()`) → non-`LOCAL` or no hash → bcrypt compare. Failure increments `failed_login_attempts`; on the 5th failure `locked_until = NOW() + 15 min`. Success resets the counter, stamps `last_login_at`, logs `LOGIN`.

`200`: same shape as signup; `redirectTo` is `/ehs-officer` when roles include `EHS_OFFICER` or `ADMIN`, else `/dashboard`. `lastLoginAt` is the server's current time, not the DB value.
Errors: `INVALID_CREDENTIALS` 401, `ACCOUNT_DISABLED` 403, `ACCOUNT_TEMPORARILY_LOCKED` **423**, `ENTRA_SIGN_IN_REQUIRED` 400.

### `GET /api/auth/me` — authenticate
`200 { "user": { …public user… } }`. Error `AUTHENTICATED_USER_NOT_FOUND` 401.

**JWT**: HS256 with `JWT_SECRET`; claims `sub` (user id as string), `username`, `roles`, `tokenType: "access"`, `iss: ehs-inspection-api`, `aud: ehs-inspection-frontend`, `exp` from `JWT_EXPIRES_IN` (default 8h). The middleware ignores the `roles` claim and reloads roles from the DB.

## Dashboard

### `GET /api/dashboard?year=&month=` — authenticate (any role)

`year` 2020–2100, `month` 1–12; both default to the current UTC year/month. Role branch is decided in the service: first role in {`EHS_OFFICER`, `HOD`, `PLANT_HEAD`, `ADMIN`} → management, else `USER`.

Common fields: `role`, `period {year, month}`, `metricsPeriod {startDate, endDate}` (always the **current** year), `audits[]` for the requested month.

`<audit>`:
```json
{ "id", "unitId", "unitName", "zoneId", "zoneName", "areaDetail", "scheduledDate", "status",
  "auditorId", "auditorName", "auditeeId", "auditeeName",
  "assignmentRole": "AUDITOR" | "AUDITEE" | null,
  "observationReportId", "observationReportStatus", "hasOpenObservationReport",
  "auditorActionCompleted", "auditeeActionCompleted" }
```
`assignmentRole` is `null` on management queries (column not selected).

USER branch adds:
- `nextAudit`: first current-week audit (Mon–Sun UTC, **always the real current week**, not the requested month) with a pending action, spread with `taskState: "SCHEDULED", taskCompleted: false`; or `{ taskState: "TASK_COMPLETED", taskCompleted: true, weekLabel, message }` if the week has audits but nothing pending; or `null`.
  Pending = auditor without a report, or auditee with an open report (`OPEN|PENDING_AUDITEE_ACTION|REEXAMINATION_REQUIRED`) and no closure row of their own.
- `metrics`: `{ audits: { conducted, total }, closures: { requested, actual } }` for the current year. `actual` counts `APPROVED AND closed_at IS NOT NULL`, which nothing produces today, so it is always 0.
- `nextWeek: null`.

Management branch adds `nextAudit: null`, no `metrics`, and `nextWeek`: `{ weekNumber, weekLabel: "Week N audit", startDate, endDate, totalAudits, audits[] }` or `null`.

Errors: `INVALID_DASHBOARD_YEAR`, `INVALID_DASHBOARD_MONTH` (400, only if the validator is bypassed).

## Observations — all routes `authenticate` + `authorize("USER")`

### `GET /api/observations/current-assignments`
Every patrol the caller audits in the current ISO week, **plus** any still-unfiled audit from the previous 4 weeks so a missed deadline does not disappear when the week rolls over. `weekNumber` is the ISO week of `scheduled_date`.

`200 { weekStartDate, weekEndDate, pendingCount, submittedCount, overdueCount, assignments[] }`.

Each assignment carries `id, scheduledDate, weekNumber, unitId/unitNumber/unitName, zoneId/zoneNumber/zoneName, plantLocation, areas[], auditorId/auditorName, auditeeId/auditeeName, ehsOfficerId/ehsOfficerName, status`, plus:

| Field | Meaning |
|---|---|
| `dueDate` | Thursday of the audit's ISO week (Monday + 3 days) |
| `isOverdue` | no report yet and today is past `dueDate` (does **not** block submission) |
| `isFromEarlierWeek` | scheduled before this week's Monday |
| `reportStatus` | `OPEN` (no report) \| `CLOSED` (a report exists) |
| `report` | `null`, or `<report>` with `observationCount`, `highestRisk`, `closureStatus`, `ticketStatus` |

### `GET /api/observations/history?filter=`
The past 6 months of reports the caller may see: their own patrols, or every report at their plant for `EHS_OFFICER`/`HOD`/`PLANT_HEAD`/`ADMIN`. `filter` is `all` (default), `closed` (latest ticket `CLOSED` — the product definition of closed via ticket), `no_observations`, or `in_progress`; anything else is `400 VALIDATION_ERROR`.

`200 { windowMonths: 6, filter, count, reports[] }`, newest audit first, capped at 300.

### `POST /api/observations/no-observation`
Body `{ patrolId }`. Closes an open audit the caller audits with nothing to record: creates a `CLOSED` report with `no_observations = true`, **no** items and **no** closure, and moves the patrol to `COMPLETED`.

`201 { message, report }`. Errors: `ASSIGNED_PATROL_NOT_FOUND` 404, `OBSERVATION_REPORT_ALREADY_EXISTS` 409, `PATROL_STATUS_NOT_ELIGIBLE` 409, `PATROL_AUDITEE_NOT_ASSIGNED` 409.

### `GET /api/observations/:reportId/items/:itemId/photograph`
One observation's photograph. Same access rule as the report detail: auditor, auditee, the patrol's EHS Officer, the Action HOD of its ticket, or plant management. Same headers and errors as the report-level photograph route below.

### `POST /api/observations` — `multipart/form-data`

Files field `photographs`: JPEG/PNG/SVG, ≤10 MB each, **up to 10**, one per observation and **in the same order** as `observations`, stored as `uploads/observations/<uuid>.<ext>`. nginx allows a 110 MB body to fit ten of them.

| Field | Rules |
|---|---|
| `patrolId` | int ≥1 |
| `findingDate` | strict ISO 8601 → `Date`; once per report |
| `observations` | JSON-encoded array, 1–10 entries, each `{ zoneAreaId, category (`UA`\|`UC`), description (≤500 words), riskCategory (`HIGH`\|`MEDIUM`\|`LOW`) }`. Errors name the position: "Observation 2: …" |

The report's own `observation_location`, `category`, `description`, `risk_category`, `photograph_*` and `zone_area_id` columns are filled from **observation #1**, so readers that predate multi-observation support are unaffected.

Transaction: patrol must exist with `auditor_id = caller` → no existing report → patrol status `SCHEDULED|IN_PROGRESS` → insert report (`PENDING_AUDITEE_ACTION`, `submitted_to = auditee`, photo columns) → update `report_number = POR-<UTC year>-<id padded 6>` → insert `closure_requests` (`OPEN`, `requested_by = auditee`, `ON CONFLICT DO NOTHING`) → patrol `PENDING_AUDITEE_ACTION`. On any error the file is deleted.

`201`:
```json
{ "message": "Observation Sent Successfully!",
  "report": { "id", "reportNumber", "patrolId", "status", "displayStatus", "findingDate", "plantLocation",
              "observationLocation", "category", "description", "riskCategory", "photographPath",
              "photographOriginalName", "submittedAt", "closedAt" } }
```
`status` is normalised (`CLOSED|COMPLETED|APPROVED` → `CLOSED`); `displayStatus` is `"Closed"` or `"In Progress"`.

Errors: `UNSUPPORTED_OBSERVATION_IMAGE`, `OBSERVATION_IMAGE_TOO_LARGE`, `TOO_MANY_OBSERVATION_IMAGES`, `OBSERVATION_UPLOAD_FAILED`, `OBSERVATION_PHOTOGRAPH_COUNT_MISMATCH`, `OBSERVATION_REQUIRED`, `TOO_MANY_OBSERVATIONS`, `AREA_NOT_IN_PATROL_ZONE` (all 400); `ASSIGNED_PATROL_NOT_FOUND` 404; `OBSERVATION_REPORT_ALREADY_EXISTS` 409; `PATROL_STATUS_NOT_ELIGIBLE` 409. Every uploaded file is deleted on any failure.

### `GET /api/observations/:reportId/photograph`
Caller must be the patrol's auditor, auditee, or EHS officer. Path is resolved under `<cwd>/uploads/observations/` (traversal guard) and must exist.
`200` raw bytes, `Content-Type` from the stored MIME, `Content-Disposition: inline; filename="…"`, `Cache-Control: private, max-age=300`.
Errors: `OBSERVATION_PHOTOGRAPH_NOT_FOUND` 404, `OBSERVATION_PHOTOGRAPH_FILE_NOT_FOUND` 404, `INVALID_PHOTOGRAPH_PATH` 500.

## Closures — all routes `authenticate` + `authorize("USER")`

`<closure>` also carries `items[]` — one entry per observation, `{ id, sequenceNumber, observation: { areaName, category, description, riskCategory }, actionPlan, targetDate, actionHodId, actionHodName, ticket: { id, status, decision, closureRound, closureDate } | null, canEdit, ticketDisplayStatus }` — plus `itemCount`, `closedTicketCount`, and `canSubmitForClosure` (true only when every observation has a plan and every ticket is `CLOSED`). `displayStatus` is `Open` / `In Progress` / `Pending Approval` / `Closed`.

`<closure>` (`closure.repository.mapClosure` + `closure.service.createClosureResponse`):
```json
{ "id", "status", "observationReportId", "reportNumber", "patrolId", "weekNumber", "scheduledDate",
  "unitNumber", "unitName", "zoneNumber", "zoneName", "plantLocation", "observationLocation",
  "auditorName", "auditeeName", "ehsOfficerName", "findingDate", "category", "photographPath",
  "photographOriginalName", "observationDescription", "riskCategory", "observationSubmittedAt",
  "actionPlan", "targetDate", "responsibleHodName", "completionDate", "actionPlanSavedAt",
  "submittedForClosureAt", "closedAt",
  "displayStatus", "canEditActionPlan", "canSubmitForClosure" }
```
`displayStatus`: `OPEN`→Open, `IN_PROGRESS|REEXAMINATION_REQUIRED`→In Progress, `SUBMITTED_FOR_CLOSURE|PENDING_EHS_APPROVAL`→Sent for Closure, `APPROVED|CLOSED`→Closed. `canEditActionPlan` = status ∈ {OPEN, IN_PROGRESS, REEXAMINATION_REQUIRED}. `canSubmitForClosure` = `IN_PROGRESS` and action plan, target date, HOD all present.

### `GET /api/closures/current`
The caller's single highest-priority closure (`requested_by = caller`, status in OPEN/IN_PROGRESS/SUBMITTED_FOR_CLOSURE/REEXAMINATION_REQUIRED; order OPEN → IN_PROGRESS → REEXAMINATION_REQUIRED → SUBMITTED_FOR_CLOSURE, then scheduled date).
`200 { "closure": <closure> | null }`

### `GET /api/closures/:closureId/departments`
The departments at this closure's plant that have an Action Team HOD, `200 { plantName, departments: [{ id, name, code, hodId, hodName }] }`. Replaces `/action-hods`.

### `PATCH /api/closures/:closureId/items/:closureItemId/action-plan`
Saves **one observation's** action plan and assigns it to a department. Body `{ actionPlan (≤255 words), targetDate (YYYY-MM-DD), departmentId }`; the department must have an active `ACTION_HOD` at the closure's plant, and the ticket goes to that HOD, and the name stored is derived from that user, never accepted from the client.

In one transaction: lock the closure → check the item belongs to it and is still editable → save the plan → mirror item #1 onto `closure_requests` → open or refresh that item's ticket for the current `approval_iteration` → recompute the closure's derived status.

`200 { message, closure }` with the full `items[]`. Errors: `CLOSURE_ASSIGNMENT_NOT_FOUND` 404, `CLOSURE_ITEM_NOT_FOUND` 404, `CLOSURE_ACTION_PLAN_LOCKED` 409 (closure past editing), `CLOSURE_ITEM_LOCKED` 409 (this observation's department already decided), `INVALID_ACTION_HOD` 400, plus the action-plan validation codes.


### `POST /api/closures/:closureId/submit`
No body. `closureId` is **not validated** (route passes `validate` with no rules). Ownership check; status must be `IN_PROGRESS`; all three action-plan fields present. Transaction: closure → `SUBMITTED_FOR_CLOSURE` with `completion_date = today (server local)` and `submitted_for_closure_at`; patrol → `PENDING_EHS_APPROVAL`; report → `PENDING_EHS_APPROVAL` (both unconditional by id).
`200 { "message": "Report sent for closure successfully.", "closure": <closure> }`
Errors: `CLOSURE_ASSIGNMENT_NOT_FOUND` 404, `CLOSURE_NOT_IN_PROGRESS` 409, `INCOMPLETE_CLOSURE_REPORT` 400, `CLOSURE_STATUS_CHANGED` 409, `CLOSURE_SUBMISSION_FAILED` 409, `SUBMITTED_CLOSURE_NOT_FOUND` 500.

### Not implemented (but called by the frontend)
`GET /closures/pending-approvals`, `GET /closures/:id/approval`, `POST /closures/:id/approve`, `POST /closures/:id/reject`. `closure.validator.js` already exports `closureReviewValidationRules` and `rejectClosureValidationRules` for them. Proposed contract is in the [backlog](09-feature-refinement-backlog.md#approval-workflow-design-r6-second-half).

## Patrols — both routes `authenticate` + `authorize("EHS_OFFICER")` (ADMIN not accepted)

### `GET /api/patrols/planning-lookups`
```json
{ "locations": [{ "id", "value", "label", "code" }],
  "units":     [{ "id", "plantId", "location", "value", "label", "code" }],
  "zones":     [{ "id", "plantId", "location", "unitId", "unitNumber", "value", "label", "code", "areaDetail" }],
  "areaDetails": ["ETP area", …],
  "auditors":  [{ "id", "fullName", "username", "email" }],
  "auditees":  [{ "id", "fullName", "username", "email" }] }
```
Plants with the same name are de-duplicated (most patrols → most units → highest id). Auditors/auditees are active users holding role code `AUDITOR` / `AUDITEE`, which only the seed scripts create.

### `POST /api/patrols`
Body: `location`, `unit`, `zone`, `areaDetail` (strings), `scheduledDate` (`YYYY-MM-DD`, today or later by lexical compare against server-local today), `auditorId`, `auditeeId` (ints, must differ).
Transaction: caller must still hold `EHS_OFFICER` → auditor has role `AUDITOR`, auditee has `AUDITEE` → plant → unit in plant → zone in unit → area configured for zone → no other non-cancelled patrol on that date with the same auditor or auditee → insert `SCHEDULED` with `ehs_officer_id = created_by = caller`.

**Broken**: the service calls `findActivePlanningPlant`, `findActiveUnitForPlant`, `findActiveZoneForUnit`, `findActiveAreaDetail`, none of which exist in `patrol.repository.js` (it has `findUnitForPlant`/`findZoneForUnit` with different argument shapes). Every call 500s inside the transaction.

`201`:
```json
{ "message": "Audit scheduled successfully.",
  "patrol": { "id", "location", "unitId", "unit", "unitName", "zoneId", "zone", "zoneName", "areaDetail",
              "scheduledDate", "auditorId", "auditorName", "auditeeId", "auditeeName",
              "ehsOfficerId", "ehsOfficerName", "status", "createdAt", "updatedAt" } }
```
Errors: `SCHEDULED_DATE_REQUIRED`, `INVALID_SCHEDULED_DATE`, `AUDIT_DATE_IN_PAST`, `INSPECTION_{LOCATION,UNIT,ZONE,AREA}_REQUIRED`, `INVALID_AUDITOR_ID`, `INVALID_AUDITEE_ID`, `AUDITOR_AUDITEE_MUST_DIFFER`, `INVALID_AUDITOR`, `INVALID_AUDITEE`, `INSPECTION_LOCATION_NOT_FOUND`, `UNIT_NOT_FOUND_FOR_LOCATION`, `ZONE_NOT_FOUND_FOR_UNIT`, `AREA_DETAIL_NOT_FOUND_FOR_ZONE` (400); `EHS_OFFICER_REQUIRED` 403; ~~`AUDITOR_SCHEDULING_CONFLICT`~~ (removed), `AUDITEE_SCHEDULING_CONFLICT`, `AUDIT_SCHEDULING_CONFLICT` 409; `AUDIT_SCHEDULING_FAILED`, `SCHEDULED_AUDIT_NOT_FOUND` 500.


## Ticket approval and history (migration 016)

`<ticket>` gains `departmentId`/`departmentName`, `resolutionComments`, `submittedForApprovalAt`, `approvedBy`/`approvedByName`/`approvedAt`/`approvalComments`, `reopenComments`/`reopenedAt`/`reopenCount`, and the flags `canSubmitResolution`, `awaitingApproval`, `pendingOutcome` (`RESOLUTION`|`REJECTION`), `wasReopened`. `displayStatus` adds **Pending Approval**.

### `POST /api/tickets/:ticketId/reject` — `ACTION_HOD`
Now moves `OPEN` → `PENDING_APPROVAL` with `decision REJECTED` (comments required); it no longer closes the ticket.

### `POST /api/tickets/:ticketId/submit-resolution` — `ACTION_HOD`
Replaces `/close`. `IN_PROGRESS` → `PENDING_APPROVAL`. Body `{ resolutionComments (3–1000, required), correctiveActionTypeId (optional, corrects the type of work) }`; at least one evidence photograph must already be attached. Errors: `RESOLUTION_COMMENTS_REQUIRED`, `EVIDENCE_REQUIRED_TO_CLOSE` 400, `TICKET_NOT_IN_PROGRESS` 409.

### `GET /api/tickets/history?filter=` — `ACTION_HOD`
Six months of the caller's own tickets, any status. `filter` is `all` (default), `open`, `in_progress`, `pending_approval`, `closed`. `200 { windowMonths: 6, filter, count, tickets[] }`, newest first, capped at 300.

### `GET /api/tickets/pending-approvals` — `MANAGEMENT_ROLES`
Tickets awaiting this officer: those on patrols they own, or at their plant. `200 { count, tickets[] }` with evidence.

### `POST /api/tickets/:ticketId/approve` — `MANAGEMENT_ROLES`
`PENDING_APPROVAL` → `CLOSED`, `closure_date` today, keeping the HOD's decision. Body `{ comments }` optional.

### `POST /api/tickets/:ticketId/reopen` — `MANAGEMENT_ROLES`
`PENDING_APPROVAL` → `OPEN`, clearing `decision`, `comments`, `corrective_action_type_id`, `completion_notes` and **every evidence row and file**; `reopen_count` increments. Body `{ comments }` **required** (`REOPEN_COMMENTS_REQUIRED` 400). Both routes 404 `TICKET_NOT_FOUND` outside the caller's scope and 409 `TICKET_NOT_AWAITING_APPROVAL` otherwise; both recompute the closure's status in the same transaction.
