# 4. API reference

Base path `/api`, mounted in `backend/src/app.js`. All bodies are JSON unless noted. Line references are as of commit `24bb98a`.

Ids read from `BIGINT` columns (every table's `id`) are serialised as **strings** (`"101"`), because `pg` leaves `int8` unparsed; compare them as `String(a) === String(b)` on the client.

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
Errors: `SELF_SIGNUP_DISABLED` 403 (self sign-up is closed: the default once Entra ID is configured), `USERNAME_ALREADY_EXISTS` 409, `EMAIL_ALREADY_EXISTS` 409, `ACCOUNT_ALREADY_EXISTS` 409 (PG 23505).

### `POST /api/auth/login` — no auth

Body: `identifier` (username or email, ≤255), `password` (≤128).

Order of checks: lookup by `LOWER(username)` or `LOWER(email)` → unknown (logs `LOGIN_FAILURE` with null user) → inactive → locked (`locked_until > NOW()`) → non-`LOCAL` or no hash → bcrypt compare. Failure increments `failed_login_attempts`; on the 5th failure `locked_until = NOW() + 15 min`. Success resets the counter, stamps `last_login_at`, logs `LOGIN`.

`200`: same shape as signup; `redirectTo` is `/ehs-officer` when roles include `EHS_OFFICER` or `ADMIN`, else `/dashboard`. `lastLoginAt` is the server's current time, not the DB value.
Errors: `INVALID_CREDENTIALS` 401, `ACCOUNT_DISABLED` 403, `ACCOUNT_TEMPORARILY_LOCKED` **423**, `ENTRA_SIGN_IN_REQUIRED` 400.

### `GET /api/auth/me` — authenticate
`200 { "user": { …public user… } }`. Error `AUTHENTICATED_USER_NOT_FOUND` 401.

**JWT**: HS256 with `JWT_SECRET`; claims `sub` (user id as string), `username`, `roles`, `tokenType: "access"`, `iss: ehs-inspection-api`, `aud: ehs-inspection-frontend`, `exp` from `JWT_EXPIRES_IN` (default 8h). The middleware ignores the `roles` claim and reloads roles from the DB.

### `GET /api/auth/providers` — no auth
Which sign-in methods this deployment offers, so the sign-in page knows whether to draw the SSO button. Deliberately public and deliberately uninformative.

`200 { "providers": { "local": { "enabled": true, "signupEnabled": true }, "entra": { "enabled": false, "label": null } } }`

`signupEnabled` mirrors `SELF_SIGNUP_ENABLED` (open without Entra, closed once Entra is configured, unless forced); the home, sign-in and sign-up pages hide their sign-up links when it is `false`.

When Entra is configured, `label` carries `ENTRA_BUTTON_LABEL` (default `"Login with Entra SSO"`).

### `GET /api/auth/entra/start` — no auth
**A browser navigation, not a fetch.** `302` to Microsoft, carrying `state`, `nonce` and a PKCE S256 challenge. Optional `?redirectTo=` must be an app-relative path or it is discarded.

Every failure — Entra not configured, Entra unreachable — is also a `302`, to `{FRONTEND_ORIGIN}/sign-in?ssoError=<message>`, because the browser is on this URL and cannot be shown JSON. 5xx detail is masked here rather than by `errorHandler`.

### `GET /api/auth/entra/callback?code=&state=` — no auth
**A browser navigation.** Where Entra returns the person. Redeems the code server-side with the client secret, verifies the ID token, provisions or links the account, rewrites its roles, then `302`s to `{FRONTEND_ORIGIN}/auth/entra/callback?code=<one-time code>&redirectTo=<path>`.

`state` is single-use: a replayed callback URL lands on `/sign-in?ssoError=…`. Entra's own refusals (`?error=access_denied`, a conditional access block) are turned into a readable message the same way.

### `POST /api/auth/entra/exchange` — no auth
Body `{ code }` — the one-time code from that redirect, valid two minutes and usable once.

`200 { message, token, user, redirectTo }` — **the same envelope `POST /api/auth/login` returns**, so the frontend has one code path for both. Errors: `VALIDATION_ERROR` 400, `ENTRA_EXCHANGE_CODE_INVALID` 400 (unknown, expired or already spent), `ACCOUNT_DISABLED` 403, `ENTRA_NOT_CONFIGURED` 503.

**Entra error codes** seen on the redirect routes: `ENTRA_UNAVAILABLE` 503, `ENTRA_TOKEN_EXCHANGE_FAILED` 401, `ENTRA_ID_TOKEN_INVALID` 401, `ENTRA_NONCE_MISMATCH` 401, `ENTRA_TENANT_NOT_ALLOWED` 403, `ENTRA_NO_APPLICATION_ROLE` 403, `ENTRA_ACCOUNT_CONFLICT` 409, `ENTRA_LOGIN_SESSION_INVALID` 400. Microsoft's own diagnostics are logged, never returned, because `errorHandler` serialises `details` to the browser.

## Dashboard

### `GET /api/dashboard?year=&month=` — authenticate (any role)

`year` 2020–2100, `month` 1–12; both default to the current UTC year/month. Role branch is decided in the service by **fixed priority**: the first of `EHS_OFFICER`, `HOD`, `PLANT_HEAD`, `ADMIN` that the user holds is `role` and selects the management branch, else `USER`. The order is fixed because a user's roles arrive from an unordered `ARRAY_AGG`, and taking whichever came first could cost an officer who is also an HOD their week card.

Common fields: `role`, `period {year, month}`, `metricsPeriod`, `metrics`, `audits[]` for the requested month, `nextAudit`, `nextWeek`, `officerWeek`.

**`metricsPeriod`** `{ year, startDate, endDate, scopeName }` — the window the metrics cover. Always **the current year to date**, independent of the `year`/`month` being browsed: paging the calendar moves `audits[]` and `period`, never the metrics. `endDate` is today, or 31 December once that year has passed. `scopeName` is the plant the figures cover, or `null` for a personal scope or a manager with no plant set.

`<audit>`:
```json
{ "id", "unitId", "unitName", "zoneId", "zoneName", "areaDetail", "scheduledDate", "status",
  "auditorId", "auditorName", "auditeeId", "auditeeName",
  "assignmentRole": "AUDITOR" | "AUDITEE" | null,
  "observationReportId", "observationReportStatus", "hasOpenObservationReport",
  "auditorActionCompleted", "auditeeActionCompleted" }
```
`assignmentRole` is the **viewer's** side of that patrol, or `null` when they are on neither side. Management queries fill it too, so a manager's own patrols are marked on the calendar like anyone else's.

**`nextAudit`, both branches**: the viewer's first current-week audit (Mon–Sun UTC, **always the real current week**, not the requested month) with a pending action, spread with `taskState: "SCHEDULED", taskCompleted: false`; or `{ taskState: "TASK_COMPLETED", taskCompleted: true, weekLabel, message }` if they have audits this week but nothing pending; or `null`. Management users get it for the patrols they are themselves rostered on, because the EHS Officer may be an auditor or auditee like anyone else ([20](20-dashboard-assignment-editing-plan.md) D10). Its `scheduledDate` is a serialised `Date` (`"2026-10-05T00:00:00.000Z"`), unlike the plain date strings in `officerWeek`.
Pending = auditor without a report, or auditee with an open report (`OPEN|PENDING_AUDITEE_ACTION|REEXAMINATION_REQUIRED`) whose closure has not yet been submitted or approved. (The closure row is created with the report, so "a closure row exists" said nothing about the auditee; the check is now on `SUBMITTED_FOR_CLOSURE|APPROVED`, D11.)

USER branch adds:
- `metrics` (`scope: "SELF"`): what this person owes and has done, **split by the side of the patrol they were on**, because the two are different jobs and merging them would report an auditee as having conducted inspections somebody else carried out.
  ```json
  { "scope": "SELF",
    "inspections": { "conducted", "due" },
    "closures":    { "approved", "raised", "assigned" } }
  ```
  `inspections.due` counts patrols where they are **auditor**, scheduled on or before today; `conducted` those with any observation report filed ("no observation to record" counts — the inspection happened). `closures.raised` is the closures actually raised for them as auditee and `approved` those the officer signed off; `assigned` is every patrol they are auditee on, which is larger because a closure only exists once the auditor files a report with findings.
- `nextWeek: null`, `officerWeek: null`.

Management branch adds `nextWeek` (`{ weekNumber, weekLabel: "Week N audit", startDate, endDate, totalAudits, audits[] }` or `null`), `officerWeek` (an [`<officerWeek>`](#get-apidashboardofficer-weekweekstart--planning_roles) for the default week when `role` is `EHS_OFFICER` and the officer has a plant, else `null`), and:
- `metrics` (`scope: "PLANT"`), scoped to the manager's own plant, or every plant when they have none:
  ```json
  { "scope": "PLANT",
    "inspections":       { "conducted", "due" },
    "observationReports":{ "total", "withFindings", "withoutFindings" },
    "closureReports":    { "raised", "approved" } }
  ```
  `inspections.due` is every non-cancelled patrol scheduled on or before today this year — a cancelled patrol was never owed, so it counts on neither side. One report per patrol is a unique constraint, so `inspections.conducted` and `observationReports.total` are necessarily the same number; the split into `withFindings` / `withoutFindings` is what makes the second tile say something the first does not. `closureReports.raised` equals `withFindings`, since a closure is created for exactly those, so the useful figure there is `approved`.

Errors: `INVALID_DASHBOARD_YEAR`, `INVALID_DASHBOARD_MONTH` (400, only if the validator is bypassed).

### `GET /api/dashboard/officer-week?weekStart=` — `PLANNING_ROLES`

One week of the caller's plant for the EHS Officer's week card, so the card can move between weeks and reload after a save without re-fetching the metrics and the calendar ([20](20-dashboard-assignment-editing-plan.md) D6).

`weekStart` is optional and may be **any** `YYYY-MM-DD` day; it is moved back to the Monday of its week (a Sunday goes to the Monday before). Without it the **default week** is returned: the current week if it has a non-cancelled patrol, else the next week that does, else the current week. `GET /api/dashboard` builds its `officerWeek` through the same code, so the two never disagree. Leave the parameter off rather than sending it empty.

`200 { "officerWeek": <officerWeek> }`, always an object, even for a week with nothing in it. `<officerWeek>`, every date a `"YYYY-MM-DD"` string:

```json
{ "weekStart", "weekEnd", "isoWeek", "isCurrentWeek", "isPastWeek", "currentWeekStart",
  "previousWeekStart", "nextWeekStart", "zoneEditFromDate", "zoneEditToDate", "totalAudits",
  "units": [{ "unitId", "unitName", "unitNumber",
              "zones": [{ "patrolId", "zoneId", "zoneName", "zoneNumber", "scheduledDate", "patrolStatus",
                          "auditorId", "auditorName", "auditeeId", "auditeeName",
                          "observationReportId", "closureId", "status", "displayStatus",
                          "canEditAssignment", "reassignableCount", "canEditZone" }] }] }
```

| Field | Meaning |
|---|---|
| `weekStart`, `weekEnd` | The Monday and the Sunday, both included |
| `currentWeekStart` | This week's Monday (UTC), for a "back to this week" button |
| `previousWeekStart`, `nextWeekStart` | The Monday of the nearest earlier / later week that has at least one non-cancelled patrol at the plant, or `null` at either end. Empty weeks are skipped, so the client never does date arithmetic |
| `zoneEditFromDate`, `zoneEditToDate` | The range a zone edit made from this week reaches: the week's own Monday (for a current or later week that is `max(weekStart, currentWeekStart)`) and 31 December of its year. `null` for a past week. A January audit in the week of 28 Dec – 3 Jan falls outside it and can only be swapped one-off |
| `status`, `displayStatus` | The zone's progress as code and label: `OPEN` Open (no report), `WITH_AUDITEE` With Auditee, `ACTION_PLAN_IN_PROGRESS` Action Plan being Implemented, `EHS_OFFICER_ACTION_REQUIRED` EHS Officer Action Required, `CLOSED` Closed, `CLOSED_NO_OBSERVATIONS` Closed – no observations (a report but no closure, so `closureId` is `null`) |
| `canEditAssignment` | The one-off swap of this audit: not a past week, `patrolStatus` is `SCHEDULED` and no report is filed |
| `reassignableCount` | How many of this zone's audits from `zoneEditFromDate` to `zoneEditToDate` are `SCHEDULED` with no observation report, this row's own included. The same rule the zone edit applies, so it equals the `updatedCount` that edit returns. `0` in a past week |
| `canEditZone` | Not a past week and `reassignableCount > 0`. Independent of this week's audit, so a report filed on Monday never blocks changing the zone's future |

Scoped to the plant through `units.plant_id`; cancelled patrols are left out. Zones sort by unit number, unit name, then zone name as text ("Zone 10" before "Zone 4").

Errors: `VALIDATION_ERROR` 400 when `weekStart` is not shaped `YYYY-MM-DD` (`details[0]`: `weekStart`, "Week start must be a date in YYYY-MM-DD format."; an empty string fails here too); `INVALID_WEEK_START` 400 "The dashboard week is invalid." for a well-shaped but impossible date (`2026-02-30`), a year outside 2020–2100, or a repeated `weekStart`; `EHS_OFFICER_LOCATION_NOT_SET` 400 when the caller has no plant; `INSUFFICIENT_PERMISSIONS` 403 for anyone without `EHS_OFFICER` or `ADMIN`.

## Observations — all routes `authenticate` only

No role check: who may see or file what is decided in the service by patrol membership (auditor, auditee, the patrol's EHS Officer), or plant management where a route says so. An account need not hold `USER`; an Entra sign-in can carry `EHS_OFFICER` alone, and the officer may be a patrol's auditor or auditee.

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
| `report` | `null`, or `<report>` with `observationCount`, `highestRisk`, `closureStatus` |

### `GET /api/observations/history?filter=`
The past 6 months of reports the caller may see: their own patrols, or every report at their plant for `EHS_OFFICER`/`HOD`/`PLANT_HEAD`/`ADMIN`. `filter` is `all` (default), `closed` (no observations recorded, **or** the closure approved — a report that can no longer come back to anybody), `no_observations`, or `in_progress`; anything else is `400 VALIDATION_ERROR`.

`200 { windowMonths: 6, filter, count, reports[] }`, newest audit first, capped at 300.

### `POST /api/observations/no-observation`
Body `{ patrolId }`. Closes an open audit the caller audits with nothing to record: creates a `CLOSED` report with `no_observations = true`, **no** items and **no** closure, and moves the patrol to `COMPLETED`. Locks the patrol row first, as `POST /api/observations` does.

`201 { message, report }`. Errors: `ASSIGNED_PATROL_NOT_FOUND` 404, `OBSERVATION_REPORT_ALREADY_EXISTS` 409, `PATROL_STATUS_NOT_ELIGIBLE` 409, `PATROL_AUDITEE_NOT_ASSIGNED` 409.

### `GET /api/observations/:reportId/items/:itemId/photograph`
One observation's photograph. Same access rule as the report detail: auditor, auditee, the patrol's EHS Officer, or plant management. Same headers and errors as the report-level photograph route below.

### `POST /api/observations` — `multipart/form-data`

Files field `photographs`: JPEG/PNG/SVG, ≤10 MB each, **up to 10**, one per observation and **in the same order** as `observations`, stored as `uploads/observations/<uuid>.<ext>`. nginx allows a 110 MB body to fit ten of them. **What is stored is a compressed copy**: each JPEG/PNG is re-encoded after validation (EXIF orientation applied, long edge ≤ 2048 px, JPEG quality 80, metadata stripped). A JPEG stays JPEG; a PNG stays PNG if it is transparent, otherwise it becomes the smaller of JPEG and PNG. SVG is stored as sent. Only real JPEG and PNG content is decoded (an SVG or WebP labelled `image/jpeg` is refused), and images over 120 megapixels are refused. The 10 MB limit applies to the upload, not to the stored file. With `PHOTO_STORAGE=sharepoint` the compressed file is then uploaded to SharePoint before the report is written; if that fails the request answers **503 `PHOTO_STORAGE_UNAVAILABLE`** with a message meant for the user, and nothing is saved.

| Field | Rules |
|---|---|
| `patrolId` | int ≥1 |
| `findingDate` | strict ISO 8601 → `Date`; once per report |
| `observations` | JSON-encoded array, 1–10 entries, each `{ zoneAreaId, category (`UA`\|`UC`), description (≤500 words), riskCategory (`HIGH`\|`MEDIUM`\|`LOW`) }`. Errors name the position: "Observation 2: …" |

The report's own `observation_location`, `category`, `description`, `risk_category`, `photograph_*` and `zone_area_id` columns are filled from **observation #1**, so readers that predate multi-observation support are unaffected.

Transaction: lock the patrol row (`SELECT … FOR UPDATE` on `id` **and** `auditor_id = caller`, [20](20-dashboard-assignment-editing-plan.md) D12) → patrol must exist with `auditor_id = caller` → no existing report → patrol status `SCHEDULED|IN_PROGRESS` → insert report (`PENDING_AUDITEE_ACTION`, `submitted_to = auditee`, photo columns) → update `report_number = POR-<UTC year>-<id padded 6>` → insert `closure_requests` (`OPEN`, `requested_by = auditee`, `ON CONFLICT DO NOTHING`) → patrol `PENDING_AUDITEE_ACTION`. On any error the file is deleted.

`201`:
```json
{ "message": "Observation Sent Successfully!",
  "report": { "id", "reportNumber", "patrolId", "status", "displayStatus", "findingDate", "plantLocation",
              "observationLocation", "category", "description", "riskCategory", "photographPath",
              "photographOriginalName", "submittedAt", "closedAt" } }
```
`status` is normalised (`CLOSED|COMPLETED|APPROVED` → `CLOSED`); `displayStatus` is `"Closed"` or `"In Progress"`.

Errors: `UNSUPPORTED_OBSERVATION_IMAGE`, `OBSERVATION_IMAGE_TOO_LARGE`, `TOO_MANY_OBSERVATION_IMAGES`, `OBSERVATION_UPLOAD_FAILED`, `UNREADABLE_OBSERVATION_IMAGE` (a JPEG/PNG that will not decode), `OBSERVATION_PHOTOGRAPH_COUNT_MISMATCH`, `OBSERVATION_REQUIRED`, `TOO_MANY_OBSERVATIONS`, `AREA_NOT_IN_PATROL_ZONE` (all 400); `ASSIGNED_PATROL_NOT_FOUND` 404; `OBSERVATION_REPORT_ALREADY_EXISTS` 409; `PATROL_STATUS_NOT_ELIGIBLE` 409. Every uploaded file is deleted on any failure.

The lock is what makes routine reassignment safe. If the officer's reassignment commits first, the lock's `auditor_id` match fails against the new row and the old auditor gets `404 ASSIGNED_PATROL_NOT_FOUND` with nothing written; if the submission locks first, the reassignment waits and then skips the patrol, which is no longer `SCHEDULED`. Either way the report, the closure and the patrol name the same pair.

### `GET /api/observations/:reportId/photograph`
Caller must be the patrol's auditor, auditee, or EHS officer. Path is resolved under `<cwd>/uploads/observations/` (traversal guard) and must exist.
`200` raw bytes, `Content-Type` from the stored MIME, `Content-Disposition: inline; filename="…"`, `Cache-Control: private, max-age=300`.
Errors: `OBSERVATION_PHOTOGRAPH_NOT_FOUND` 404, `OBSERVATION_PHOTOGRAPH_FILE_NOT_FOUND` 404, `INVALID_PHOTOGRAPH_PATH` 500.

## Closures — all routes `authenticate`; the approval queue, approve and reject add `authorize(...MANAGEMENT_ROLES)`

As with observations, access is patrol membership checked in SQL, not a role: the auditee works the closure, and the auditor, the patrol's EHS Officer and the reviewer can read it.

`<closure>` also carries `items[]` — one entry per observation, `{ id, sequenceNumber, observation: { areaName, category, description, riskCategory }, actionPlan, targetDate, actionPlanSavedAt, evidence: [{ id, originalName, mimeType, size, uploadedAt }], evidenceCount, canEdit, canAddEvidence }` — plus `itemCount`, `plannedItemCount`, `evidenceCount`, `maxEvidencePerObservation` (3), and `canSubmitForClosure` (true once every observation has a plan; evidence does not gate it). `displayStatus` is `Open` / `In Progress` / `Pending Approval` / `Closed`.

`<closure>` (`closure.repository.mapClosure` + `closure.service.createClosureResponse`):
```json
{ "id", "status", "observationReportId", "reportNumber", "patrolId", "weekNumber", "scheduledDate",
  "unitNumber", "unitName", "zoneNumber", "zoneName", "plantLocation", "observationLocation",
  "auditorName", "auditeeName", "ehsOfficerName", "auditorId", "auditeeId", "ehsOfficerId",
  "findingDate", "category", "photographPath",
  "photographOriginalName", "observationDescription", "riskCategory", "observationSubmittedAt",
  "actionPlan", "targetDate", "completionDate", "actionPlanSavedAt",
  "submittedForClosureAt", "closedAt", "approvalIteration", "wasReturned",
  "displayStatus", "canEditActionPlan", "canSubmitForClosure" }
```
`displayStatus`: `OPEN|REEXAMINATION_REQUIRED`→Open, `IN_PROGRESS`→In Progress, `SUBMITTED_FOR_CLOSURE|PENDING_EHS_APPROVAL`→Pending Approval, `APPROVED|CLOSED`→Closed. `canEditActionPlan` = status ∈ {OPEN, IN_PROGRESS, REEXAMINATION_REQUIRED}, and every item's `canEdit` is the same value — nothing freezes one observation while the rest stay open.

`auditorId`, `auditeeId` and `ehsOfficerId` are the **patrol's** people (`ehsOfficerId` is `null` when the patrol has no officer recorded), on every closure endpoint including the approval queue. They let the client recognise the signed-in user: the approval panel warns an officer who is about to approve a closure on which they are the auditee ([20](20-dashboard-assignment-editing-plan.md) D9).

### `GET /api/closures/current`
The caller's single highest-priority closure (`requested_by = caller`, status in OPEN/IN_PROGRESS/SUBMITTED_FOR_CLOSURE/REEXAMINATION_REQUIRED; order OPEN → IN_PROGRESS → REEXAMINATION_REQUIRED → SUBMITTED_FOR_CLOSURE, then scheduled date).
`200 { "closure": <closure> | null }`

### `PATCH /api/closures/:closureId/items/:closureItemId/action-plan`
Saves **one observation's** action plan. Body `{ actionPlan (≤255 words), targetDate (YYYY-MM-DD) }`.

In one transaction: lock the closure → check the item belongs to it and is still editable → save the plan → mirror item #1 onto `closure_requests` → recompute the closure's derived status.

`200 { message, closure }` with the full `items[]`. Errors: `CLOSURE_ASSIGNMENT_NOT_FOUND` 404, `CLOSURE_ITEM_NOT_FOUND` 404, `CLOSURE_ACTION_PLAN_LOCKED` 409, plus the action-plan validation codes.

### `POST /api/closures/:closureId/items/:closureItemId/evidence`
`multipart/form-data`, field **`evidence`**, 1–3 JPEG/PNG/SVG files of 10 MB each: photographs proving this observation's action plan was carried out. Auditee only, and only while the closure is editable. Stored compressed, the same way as observation photographs.

The three-per-observation cap is checked inside the transaction against a locked count, so concurrent uploads cannot exceed it together. Files multer has already written are deleted again on any failure.

`201 { message, closure }`. Errors: `EVIDENCE_REQUIRED` 400, `TOO_MANY_EVIDENCE_IMAGES` 400, `UNSUPPORTED_EVIDENCE_IMAGE` 400, `EVIDENCE_IMAGE_TOO_LARGE` 400, `UNREADABLE_EVIDENCE_IMAGE` 400, `CLOSURE_ACTION_PLAN_LOCKED` 409, `CLOSURE_ITEM_NOT_FOUND` 404.

### `DELETE /api/closures/:closureId/items/:closureItemId/evidence/:evidenceId`
Removes one photograph. The row goes first and the file only after the commit. `200 { message, closure }`. Errors: `EVIDENCE_NOT_FOUND` 404, `CLOSURE_ACTION_PLAN_LOCKED` 409.

### `GET /api/closures/:closureId/items/:closureItemId/evidence/:evidenceId`
The image bytes, `Content-Disposition: inline`, `Cache-Control: private, max-age=300`. Authorised by the **closure's** read rules, so the auditee, auditor, EHS Officer and plant management all see it. Never served statically; the stored path is checked to sit inside the upload directory first. Errors: `CLOSURE_ASSIGNMENT_NOT_FOUND` 404, `EVIDENCE_NOT_FOUND` 404, `EVIDENCE_FILE_NOT_FOUND` 404, `INVALID_EVIDENCE_PATH` 500.


### `POST /api/closures/:closureId/submit`
No body. `closureId` is **not validated** (route passes `validate` with no rules). Ownership check; status must be `IN_PROGRESS`; all three action-plan fields present. Transaction: closure → `SUBMITTED_FOR_CLOSURE` with `completion_date = today (server local)` and `submitted_for_closure_at`; patrol → `PENDING_EHS_APPROVAL`; report → `PENDING_EHS_APPROVAL` (both unconditional by id).
`200 { "message": "Report sent for closure successfully.", "closure": <closure> }`
Errors: `CLOSURE_ASSIGNMENT_NOT_FOUND` 404, `CLOSURE_NOT_IN_PROGRESS` 409, `INCOMPLETE_CLOSURE_REPORT` 400, `CLOSURE_STATUS_CHANGED` 409, `CLOSURE_SUBMISSION_FAILED` 409, `SUBMITTED_CLOSURE_NOT_FOUND` 500.

### `GET /api/closures/pending-approvals` — `MANAGEMENT_ROLES`
The EHS Officer's review queue: closures in `SUBMITTED_FOR_CLOSURE` on patrols whose `ehs_officer_id` is the caller **or is null**, oldest submission first. **It is not plant-wide**: another officer's patrols at the same plant do not appear (`admin.js reassign-officer` moves them), and an HOD or Plant Head who planned nothing sees only the patrols with no officer. Closures on which the caller is the auditee are included. `200 { closures: [<closure>] }`.

### `POST /api/closures/:closureId/approve` — `MANAGEMENT_ROLES`
Body `{ reviewComments }` optional. In one transaction the closure → `APPROVED`, the patrol → `COMPLETED` and the report → `CLOSED`. **This is the only path that ends an inspection that had findings.**

### `POST /api/closures/:closureId/reject` — `MANAGEMENT_ROLES`
Body `{ reviewComments }` **required** (3–1000 chars, `REVIEW_COMMENTS_REQUIRED` 400). Closure → `REEXAMINATION_REQUIRED` with `approval_iteration` advanced, patrol and report likewise, and every observation open for rework.

Both: `CLOSURE_ASSIGNMENT_NOT_FOUND` 404, `CLOSURE_NOT_AWAITING_APPROVAL` 409, `CLOSURE_STATUS_CHANGED` 409 (another reviewer got there first).

**Who may decide.** A caller holding a management role who can read the closure: the patrol's EHS Officer, auditor or auditee. Anyone else gets the 404. That includes an officer who is the patrol's **auditee**, approving their own action plans: this is allowed by business decision ([20](20-dashboard-assignment-editing-plan.md) D9, segregation of duties considered and declined), and the approval panel shows a warning instead of blocking it.

## Patrols — all routes `authenticate` + `authorize(...PLANNING_ROLES)` (`EHS_OFFICER`, `ADMIN`)

Every route is scoped to the caller's own plant (`users.plant_id`); a caller with none gets `400 EHS_OFFICER_LOCATION_NOT_SET` (the inspection report answers `403 OFFICER_LOCATION_NOT_SET` instead). An HOD or Plant Head is refused with `INSUFFICIENT_PERMISSIONS`.

### `GET /api/patrols/planning-lookups`
```json
{ "location": { "id", "name", "code" },
  "units":    [{ "id", "name", "unitNumber" }],
  "zones":    [{ "id", "unitId", "name", "zoneNumber", "areas": [{ "id", "name" }] }],
  "users":    [{ "id", "fullName", "username", "email" }] }
```
Only the caller's plant: its active units and zones, each zone with its active areas in `display_order`. `users` is every active user at that plant, ordered by name, **the signed-in officer included** ([20](20-dashboard-assignment-editing-plan.md) D8): one list feeds both the auditor and the auditee choices, and the officer may be either. The only person rule anywhere is that one audit's auditor and auditee differ.

### `GET /api/patrols/inspection-report`
The zone-by-week inspection report as an `.xlsx` download, scoped to the officer's own plant and covering **the current year up to today**. Declared before `/:patrolId/assignment` so the literal path is never parsed as a patrol id.

Responds with the spreadsheet bytes, `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="inspection-report-<plant>-<date>.xlsx"`, and `Access-Control-Expose-Headers: Content-Disposition` so a cross-origin fetch can read the filename.

Sheet layout: three merged title rows (title, plant and period, legend), then a header row, then one row per zone. Fixed columns are Unit, Zone, Zone Areas, Auditor, Auditee, Done, Scheduled; after them one column per inspection week, headed `W<iso>` and the Monday's date. Panes freeze at `H5` and an autofilter covers the fixed columns.

**Zone Areas** lists the zone's active `zone_areas` rows, comma-separated in `display_order` then name, wrapped so a long list takes a second line rather than widening the frozen block. It is the zone's configured list **as of when the report is generated**, not the areas that were inspected; a zone with no active areas reads `None configured`.

Each week cell is green (`Done`), red (`Not done`) or grey (`–`, nothing scheduled that week). **Colour and text both carry the status**, so the sheet survives printing in black and white. A week where a zone had several audits is green only when all of them were filed.

- **Conducted** means an observation report exists — "no observation to record" counts, the inspection happened.
- **Cancelled patrols are excluded** from both sides: one that was never owed is not a miss.
- **Only weeks with at least one patrol scheduled somewhere in the plant become columns**, so the sheet does not carry empty columns for the stretch before the roster was first uploaded. Likewise a zone with nothing scheduled all year is left out rather than shown as a row of grey.
- **Auditor and auditee come from the zone's most recent inspection on or before today**, falling back to the next scheduled one for a zone never yet audited. That is deliberately *who last audited it*, which can differ from who the roster has for upcoming weeks; the sheet's legend says so.

Errors: `OFFICER_LOCATION_NOT_SET` 403 (no plant on the account), `INSUFFICIENT_PERMISSIONS` 403 (not `EHS_OFFICER`/`ADMIN` — an `HOD` or `PLANT_HEAD` is refused, the same as every other planning route).

### `POST /api/patrols`
The single-audit exception path; the roster upload is the normal one. Body: `zoneId`, `scheduledDate` (`YYYY-MM-DD` with no time part, today or later against UTC today), `auditorId`, `auditeeId` (ints, must differ). The unit, location and areas follow from the zone.

Transaction: caller's plant → zone with its unit and plant, all active → zone in that plant → zone has at least one area → auditor and auditee each an active user at that plant (the officer may be either) → insert `SCHEDULED` with `ehs_officer_id = created_by = caller`. There is no per-person conflict check: one person may cover several zones on the same day.

`201`:
```json
{ "message": "Audit scheduled successfully.",
  "patrol": { "id", "location", "plantId", "unitId", "unit", "unitName", "zoneId", "zone", "zoneName", "areas",
              "scheduledDate", "auditorId", "auditorName", "auditeeId", "auditeeName",
              "ehsOfficerId", "ehsOfficerName", "status", "createdAt", "updatedAt" } }
```
Errors: `INSPECTION_ZONE_REQUIRED`, `SCHEDULED_DATE_REQUIRED`, `INVALID_SCHEDULED_DATE`, `AUDIT_DATE_IN_PAST`, `INVALID_AUDITOR_ID`, `INVALID_AUDITEE_ID`, `AUDITOR_AUDITEE_MUST_DIFFER`, `EHS_OFFICER_LOCATION_NOT_SET`, `ZONE_NOT_FOUND`, `ZONE_HAS_NO_AREAS`, `INVALID_AUDITOR`, `INVALID_AUDITEE` (400); `ZONE_OUTSIDE_OFFICER_DOMAIN` 403; `AUDIT_SCHEDULING_FAILED` 500.

### `PATCH /api/patrols/:patrolId/assignment`
Body `{ auditorId, auditeeId, applyToUpcoming }`: ints that must differ, and an optional boolean that **defaults to `true`**. The patrol must be at the caller's plant and both people active users there.

- **`applyToUpcoming: false` is the one-off swap**: only this patrol changes, and only while it is still `SCHEDULED`. The zone's roster row is untouched. This is what the dashboard sends for "Only this audit".
- **`applyToUpcoming: true`** runs the zone reassignment of the next endpoint, from **this patrol's own date** (not clamped to the current week) to 31 December of that year. If this patrol is itself already under way, the whole edit is rolled back with `409 PATROL_NOT_EDITABLE`. Kept for API compatibility only; the dashboard never sends it ([20](20-dashboard-assignment-editing-plan.md) D5). Since 20 it skips an audit that has a report even if still `SCHEDULED`, and the roster row changes only when its range overlaps.

`200 { message, updatedCount, patrol }` (`patrol` as above); `message` is "Audit assignment updated successfully." for a one-off swap, else "Assignment updated for N upcoming audits of this zone."

Errors: `VALIDATION_ERROR` 400; `INVALID_AUDITOR_ID`, `INVALID_AUDITEE_ID`, `AUDITOR_AUDITEE_MUST_DIFFER`, `EHS_OFFICER_LOCATION_NOT_SET`, `INVALID_AUDITOR`, `INVALID_AUDITEE` (400); `ZONE_OUTSIDE_OFFICER_DOMAIN` 403; `PATROL_NOT_FOUND` 404; `PATROL_NOT_EDITABLE` 409 ("The auditor and auditee can only be changed before an observation report has been filed for this audit.").

### `PATCH /api/patrols/zones/:zoneId/assignment`
The dashboard's zone edit ([20](20-dashboard-assignment-editing-plan.md) D3, D4). Body `{ auditorId, auditeeId, fromDate }`: ints that must differ, and `fromDate` as `YYYY-MM-DD`. Three path segments, so it never collides with `/:patrolId/assignment`.

Reassigns **every audit of the zone that is still `SCHEDULED` with no observation report**, hand-planned and roster-generated alike, dated from **`max(fromDate, Monday of the current UTC week)`** to **31 December of that date's year**, both ends included. No anchor patrol is needed, so a report already filed this week never blocks changing the zone's future.

- The clamp keeps this Monday's still-unfiled audit reassignable on a Wednesday, while an overdue audit from an earlier week stays with the person who owes it. A later `fromDate` is used as given, even midweek.
- The zone's other non-cancelled audits in the range are under way (their report and closure already name the people doing them): they keep their auditor and auditee and are counted in `skippedCount`. Cancelled audits are ignored.
- The zone's roster row (`zone_audit_rosters`) takes the new pair too, but **only if its `effective_from`–`effective_to` overlaps** the reassigned range: between 29 and 31 December a re-upload may already have made the row next year's, and a December edit must not rewrite it. A zone with no roster row is not an error.
- In one transaction: caller's plant → zone (active, with its unit and plant) → zone in that plant → both people active at the plant (the officer may be either) → lock the zone's non-cancelled audits in the range `FOR UPDATE`, update the reassignable ones → roster row. Observation submission locks the same row first (D12), so an audit filed concurrently is either skipped or the old auditor is refused.

`200`:
```json
{ "message": "Zone 4 reassigned for 10 upcoming audits from 5 Oct 2026 to 31 Dec 2026. 3 audits already under way kept their auditor and auditee.",
  "updatedCount": 10, "skippedCount": 3, "fromDate": "2026-10-05", "toDate": "2026-12-31" }
```
`fromDate` is the **effective** start, after the clamp. The second sentence appears only when `skippedCount > 0` (singular: "1 audit already under way kept its auditor and auditee."). The zone's name comes from the table; dates are `en-GB` day, short month and year in UTC (Node 22's ICU writes September as "Sept"). When the client sends the week card's `zoneEditFromDate`, `updatedCount` equals that row's `reassignableCount`.

Errors:

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | `zoneId` not a positive integer; `fromDate` missing ("The date to apply the change from is required.") or not shaped `YYYY-MM-DD` ("The date to apply the change from must be in YYYY-MM-DD format."); auditor = auditee ("The auditor and auditee must be different users.") |
| `INVALID_FROM_DATE` | 400 | "Select a valid date to apply the change from." A well-shaped but impossible date such as `2026-02-30` |
| `EHS_OFFICER_LOCATION_NOT_SET` | 400 | The caller has no plant |
| `INVALID_AUDITOR` / `INVALID_AUDITEE` | 400 | Not an active user at the caller's plant |
| `ZONE_OUTSIDE_OFFICER_DOMAIN` | 403 | Another plant's zone |
| `ZONE_NOT_FOUND` | **404** | Unknown zone, or the zone, its unit or its plant is inactive. (`POST /api/patrols` answers the same code with 400.) |
| `NO_REASSIGNABLE_AUDITS` | 409 | "This zone has no upcoming audits that can still be reassigned." Nothing changed. Also what a dashboard showing a stale count gets |

A roster re-upload regenerates every upcoming roster-generated audit that is still `SCHEDULED`, so it **overwrites** reassignments made here; hand-planned audits keep their people.
