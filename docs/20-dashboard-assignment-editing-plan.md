# 20. Dashboard assignment editing, and the EHS Officer as auditor or auditee

Implementation plan for two refinements to patrol scheduling. It builds on [14-weekly-roster-plan.md](14-weekly-roster-plan.md), whose decisions D6, D8 and D9 it amends, and follows the layering in [02-architecture.md](02-architecture.md).

**Goal**

1. **Edit the scheduled weekly patrols from the dashboard.** The roster is uploaded once (say on 1 January) and every zone is scheduled for every Monday to 31 December. Later (say in February) the EHS Officer changes zone 4's auditor and auditee from the dashboard, and every upcoming zone-4 audit changes with it. The officer can also move between weeks on the dashboard and make a one-off swap for a single week.
2. **The EHS Officer can be assigned as auditor, or as auditee, of a patrol**, from the planning form, the roster file and the dashboard edit. They then do that work like anyone else: file the observation report as auditor, or answer the closure as auditee.

## Why this is needed: what the code did before this change

- `PATCH /api/patrols/:patrolId/assignment` with `applyToUpcoming` (docs/14 D8) already propagated an edit to every remaining Monday of a zone. **It was unreachable**: `DashboardPage.jsx` called `hasManagementRole(userRoles)` with an array, but the helper takes a user object and returned `false`, so every user, the officer included, was shown the ordinary-user card and `OfficerWeekCard` (the only place the edit lives) never rendered.
- Even when rendered, the edit was anchored to one patrol of the single week shown. `canEditAssignment` was `!observationReportId`, so once that week's zone-4 audit was filed (reports are due Thursday) the officer could not change zone 4's future until the next Monday. Only one week could be seen.
- After a save, `reloadDashboard` replaced the whole page with a spinner, which unmounted the card and threw away the "updated N audits" confirmation.
- The signed-in officer was left out of the auditor/auditee choices (`getPlanningLookups` `excludeUserId`) and their own email was rejected by the roster upload with a misleading "No active user … has the email" (`uploadRoster` `excludeUserId`). Nothing else stopped them: the database has no rule against it, and the observation and closure routes check patrol membership, not role.
- The dashboard sent management users `nextAudit: null`, so an officer who is this week's auditor or auditee got no prompt on the dashboard.

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Fix the dashboard's management check (`hasManagementRole({ roles })`). HOD, Plant Head and Admin consequently see the plant-wide `WeeklySummary` that docs/06 always described, instead of the empty "No upcoming audit found" card. | Nothing in part 1 is reachable without it. |
| D2 | The dashboard's primary role is chosen by fixed priority `EHS_OFFICER`, `HOD`, `PLANT_HEAD`, `ADMIN`, not by the order of an unordered `ARRAY_AGG`. | A user holding `EHS_OFFICER` and `HOD` could randomly lose the officer card. |
| D3 | **Zone-level reassignment.** New `PATCH /api/patrols/zones/:zoneId/assignment` with `{ auditorId, auditeeId, fromDate }`. It reassigns every patrol of the zone that is `SCHEDULED` **and has no observation report**, dated from `max(fromDate, Monday of the current week)` to **31 December of that from-date's year**, hand-planned and roster-generated alike (docs/14 D8 kept). Patrols already under way in the range are left alone and counted. Nothing reassignable → `409 NO_REASSIGNABLE_AUDITS`. | The edit no longer needs an editable anchor patrol, so a filed audit this week never blocks changing the zone's future. The current-week clamp keeps Monday's not-yet-filed audit reassignable on a Wednesday, while overdue audits from earlier weeks stay with the person who owes them. |
| D4 | The zone's roster row (`zone_audit_rosters`) is updated with the new pair **only if its effective range overlaps** the reassigned range. | Between 29 and 31 December a re-upload can already have turned the row into next year's; a December edit must not rewrite next year's roster. |
| D5 | `PATCH /:patrolId/assignment` stays. `applyToUpcoming: false` is the one-off swap, unchanged. `applyToUpcoming: true` (still the default, for API compatibility) now runs the same zone-level code from the patrol's own date, and still answers `409 PATROL_NOT_EDITABLE` when that patrol is under way. The dashboard uses the one-off path and the zone endpoint, never `applyToUpcoming: true`. | One implementation of propagation, not two. |
| D6 | **Week navigation.** New `GET /api/dashboard/officer-week?weekStart=YYYY-MM-DD` (`PLANNING_ROLES`) returns one week of the officer's plant. Any date is normalised to its Monday. The response carries `previousWeekStart` / `nextWeekStart` (the nearest earlier/later week **that has at least one non-cancelled patrol**, or `null`) and `currentWeekStart`, so the client never does date arithmetic and never pages through empty weeks. Without `weekStart` the default week is docs/14 D9's: the current week if it has inspections, else the next week that does, else the current week. `GET /api/dashboard` keeps returning `officerWeek` for the default week in the same, extended shape. | A separate endpoint lets the card move between weeks, and reload after a save, without re-fetching metrics and the calendar or showing the page spinner. |
| D7 | Past weeks are viewable and read-only. In the current and future weeks a zone row offers **Edit** when either a one-off swap is possible (that audit is `SCHEDULED` with no report) or the zone has reassignable audits from that week on. | Editing the past would reach audits that are history or owed by someone else. |
| D8 | The signed-in officer appears in the auditor/auditee choices everywhere and may put their own email in the roster file. The **only** person rule remains "auditor ≠ auditee on the same patrol". | Requirement 2. |
| D9 | **The officer may approve a closure on which they are the auditee** (decided by the business). The approval panel shows a warning that they are approving their own action plans. To support it, the closure payload gains `auditorId`, `auditeeId` and `ehsOfficerId`. No approval routing changes. | Business decision; segregation of duties was considered and declined. |
| D10 | Management users also receive their **own** `nextAudit` (their task this week as auditor or auditee), and the dashboard shows it above the management widget **only when there is one**. The management calendar marks the viewer's own patrols `AUDITOR`/`AUDITEE` instead of "Assigned". | An officer who is rostered needs the same prompt anyone else gets. |
| D11 | `auditee_action_completed` in the two user dashboard queries means "the closure has been submitted or approved", not "a closure row exists". | The closure row is created with the report, so the auditee prompt could never fire; D10 depends on it. Pre-existing defect, fixed because D10 reuses the query. |
| D12 | Observation submission (`POST /api/observations` and `/no-observation`) locks the patrol row (`FOR UPDATE`, matched on id and auditor) before reading it. | Reassignment becomes routine. Without the lock a reassignment committing between the auditor's read and write left the report and closure naming the old pair while the patrol named the new one. With it, one side waits: either the reassignment skips the now-filed patrol, or the old auditor gets the existing 404. |

Out of scope, recorded in [09-feature-refinement-backlog.md](09-feature-refinement-backlog.md) instead: the management calendar's missing plant filter; deep links from the dashboard sending `?auditId=` while the pages read `patrolId`/`closureId`; the roster page's "Effective A to B" caption not reflecting later dashboard edits; zones sorting lexically ("Zone 10" before "Zone 4"); routing an officer-auditee's closure to another manager (D9 declined it); closure read access (`findClosureByIdForUser`) having no plant-management branch, so a zone's progress detail on the week card 404s when the patrol was planned by a different officer; `admin.js deactivate-user` leaving the person on every future patrol and roster row (the dashboard zone edit is now the remedy, and the row's select keeps a fallback option for them).

## Backend

No migration. Nothing in the schema ties `patrols.ehs_officer_id` to `auditor_id`/`auditee_id`; `patrol_auditor_auditee_check` and `zone_audit_rosters_people_differ` (auditor ≠ auditee) stay the only person rules. Do **not** add `ehs_officer_id <> auditee_id`.

New SQL returns dates as `TO_CHAR(..., 'YYYY-MM-DD')` strings. `pg` parses `DATE` as local midnight, which is only right because the containers pin `TZ=UTC`.

### Patrols module

`patrol.repository.js`

- `findUsersAtLocation({ plantId })` and `findActiveUsersByEmail({ plantId, emails })`: drop the `excludeUserId` parameter and its SQL (`$n::BIGINT IS NULL OR id <> $n`). The service was the only caller passing it.
- New `reassignZonePatrols({ zoneId, fromDate, toDate, auditorId, auditeeId }, client)`. In one statement or one CTE: lock the zone's non-cancelled patrols in `[fromDate, toDate]`, update those that are `SCHEDULED` with no `observation_reports` row, and return `{ updatedIds, updatedCount, skippedCount }`. `skippedCount` is the non-cancelled patrols in range that were not reassignable. Plant scope is implied by the zone, which the service has already checked.
- `updateRosterAssignmentForZone({ zoneId, auditorId, auditeeId, fromDate, toDate })`: add `AND effective_from <= $toDate::DATE AND effective_to >= $fromDate::DATE` (D4). Still returns null when there is no matching row, which is not an error.
- Remove `findUpcomingZonePatrolsForAssignment` and `updatePatrolAssignments` once nothing calls them.

`patrol.service.js`

- `getPlanningLookups`: stop passing `excludeUserId`, and reword the comment (D8).
- `uploadRoster`: stop passing `excludeUserId` to `findActiveUsersByEmail`.
- New exported `updateZoneAssignment({ userId, zoneId, auditorId, auditeeId, fromDate })`:
  1. `validateAssignmentInput`; validate `fromDate` as a real `YYYY-MM-DD` date (`400 INVALID_FROM_DATE`, "Select a valid date to apply the change from.").
  2. `effectiveFrom = max(fromDate, Monday of the current UTC week)`. `toDate = <effectiveFrom year>-12-31`.
  3. In `withTransaction`: `requireOfficerLocation`; `findZoneWithHierarchy(zoneId)` → `404 ZONE_NOT_FOUND` when null, `403 ZONE_OUTSIDE_OFFICER_DOMAIN` when another plant's; `findActiveUserAtLocation` for both people (`INVALID_AUDITOR` / `INVALID_AUDITEE`, as today); `reassignZonePatrols`; if `updatedCount === 0` throw `409 NO_REASSIGNABLE_AUDITS` ("This zone has no upcoming audits that can still be reassigned."); then `updateRosterAssignmentForZone` with the same range.
  4. Return `{ message, updatedCount, skippedCount, fromDate: effectiveFrom, toDate }`. Message: `"Zone 4 reassigned for 42 upcoming audits from 16 Feb 2026 to 31 Dec 2026."`, plus `" 1 audit already under way kept its auditor and auditee."` when `skippedCount > 0`. Use the zone's name and plain singular/plural.
- `updatePatrolAssignment`: the `applyToUpcoming: false` branch is unchanged. The `true` branch calls the same internal helper as `updateZoneAssignment`, with `fromDate` = the patrol's own date (not clamped) and `toDate` = 31 December of that year. If the edited patrol's id is not in `updatedIds`, throw `PATROL_NOT_EDITABLE`, which rolls the transaction back. Response unchanged: `{ message, updatedCount, patrol }`.

`patrol.validator.js`: `updateZoneAssignmentValidationRules`: `param("zoneId").isInt({ min: 1 })`, the same `auditorId`/`auditeeId` rules and must-differ check as `updatePatrolAssignmentValidationRules`, and `body("fromDate")` required, matching `^\d{4}-\d{2}-\d{2}$`.

`patrol.controller.js`: thin `updateZoneAssignment`, `200`.

`patrol.routes.js`: `router.patch("/zones/:zoneId/assignment", authenticate, authorize(...PLANNING_ROLES), updateZoneAssignmentValidationRules, validate, updateZoneAssignment)`. It has three segments, so it does not collide with `/:patrolId/assignment`.

### Dashboard module

`dashboard.service.js`

- `getPrimaryDashboardRole`: iterate a fixed priority list `[EHS_OFFICER, HOD, PLANT_HEAD, ADMIN]` and return the first role the user holds (D2).
- New exported `getOfficerWeek({ user, weekStart, referenceDate = new Date() })`:
  - Plant from `findOfficerPlant(user.id)`. If there is none, throw `400 EHS_OFFICER_LOCATION_NOT_SET` with the patrols module's wording.
  - Parse `weekStart` in the service (Express 5's `req.query` is a getter, so sanitisers do not stick). Normalise it to its Monday with `getCurrentWeekRange`; years outside 2020–2100 give `400 INVALID_WEEK_START`. If it is absent, use the default week (D6).
  - Load the week's rows, the adjacent weeks and the per-zone reassignable counts (repository below). Build the payload with `buildOfficerWeek`.
- `buildOfficerWeek` always returns an object (D6). Week-level fields:

  ```js
  {
    weekStart, weekEnd,            // "YYYY-MM-DD", Monday and Sunday
    isoWeek, isCurrentWeek, isPastWeek,
    currentWeekStart,
    previousWeekStart, nextWeekStart,  // nearest week with patrols, or null
    zoneEditFromDate, zoneEditToDate,  // max(weekStart, currentWeekStart) and 31 Dec of its year; null for a past week
    totalAudits,
    units: [{ unitId, unitName, unitNumber, zones: [...] }],
  }
  ```

  Every zone keeps today's fields (`patrolId, zoneId, zoneName, zoneNumber, scheduledDate, auditorId, auditorName, auditeeId, auditeeName, observationReportId, closureId, status, displayStatus`) and gains:
  - `patrolStatus`;
  - `canEditAssignment = !isPastWeek && patrolStatus === "SCHEDULED" && !observationReportId` (the one-off swap);
  - `reassignableCount` (that zone's reassignable audits in `[zoneEditFromDate, zoneEditToDate]`);
  - `canEditZone = !isPastWeek && reassignableCount > 0`.
- `getDashboardData`, management branch:
  - Build `officerWeek` through `getOfficerWeek`'s internals when the role is `EHS_OFFICER` and the plant is set; otherwise it stays `null`.
  - Also run `findUserCurrentWeekPatrols` for the viewer and return `nextAudit: selectCurrentUserTask(...)` (D10).
  - Pass `userId` to `findManagementMonthlyPatrols` so it can fill `assignment_role`.

`dashboard.repository.js`

- Replace `findOfficerWeekPatrols` with `findOfficerPatrolsInWeek({ plantId, weekStart, weekEnd })`: the same joins and columns, for exactly that week, with dates as `YYYY-MM-DD` strings.
- New `findOfficerDefaultWeekStart({ plantId, currentWeekStart })`: `DATE_TRUNC('week', MIN(scheduled_date))` over the plant's non-cancelled patrols on or after `currentWeekStart`, or null.
- New `findOfficerAdjacentWeeks({ plantId, weekStart, weekEnd })`: `previousWeekStart = DATE_TRUNC('week', MAX(scheduled_date) FILTER (WHERE scheduled_date < weekStart))` and `nextWeekStart = DATE_TRUNC('week', MIN(...) FILTER (WHERE scheduled_date > weekEnd))`, plant-scoped and excluding `CANCELLED`.
- New `countReassignableZonePatrols({ zoneIds, fromDate, toDate })`: `zone_id → count` of `SCHEDULED` patrols with no report in the range. Skip the query for a past week.
- `findManagementMonthlyPatrols({ userId, monthStart, monthEnd })`: add the same `assignment_role` `CASE` as `findAssignedMonthlyPatrols`. The missing plant filter is out of scope (see above).
- `findAssignedMonthlyPatrols` and `findUserCurrentWeekPatrols`: `auditee_action_completed` becomes `EXISTS (closure for p.id with status IN ('SUBMITTED_FOR_CLOSURE', 'APPROVED'))` (D11).

`dashboard.validator.js`: `officerWeekValidationRules`: `query("weekStart").optional().matches(/^\d{4}-\d{2}-\d{2}$/)`. `dashboard.controller.js`: thin `getOfficerWeek` → `200 { officerWeek }`. `dashboard.routes.js`: `router.get("/officer-week", authenticate, authorize(...PLANNING_ROLES), officerWeekValidationRules, validate, getOfficerWeek)`.

### Closures and observations

- `closure.repository.js`: `CLOSURE_SELECT` and `mapClosure` add `auditorId`, `auditeeId`, `ehsOfficerId` (D9). No change to who may approve.
- `observation.repository.js` / `observation.service.js`: at the start of the submit and no-observation transactions, `SELECT id FROM patrols WHERE id = $1 AND auditor_id = $2 FOR UPDATE` (D12). When no row comes back, take the existing not-found path, which already deletes the uploaded files.

## Frontend

- `DashboardPage.jsx`:
  - `const managementUser = hasManagementRole({ roles: userRoles })` (D1).
  - For a management user, render `<AuditStatusCards audit={nextAudit} …>` **above** the management widget only when `nextAudit` is non-null (D10). The ordinary-user branch is unchanged.
  - Pass the dashboard's `officerWeek` to `OfficerWeekCard` as its initial week. Do not pass `reloadDashboard` as the after-save callback.
- `dashboard.service.js`: `fetchOfficerWeek({ weekStart })` → `GET /dashboard/officer-week` (no query string when `weekStart` is empty).
- New `useOfficerWeek(initialWeek)` hook. It owns `week`, `loading` (its own flag, never the page spinner), `error`, `goToWeek(weekStart)`, `goToPreviousWeek`, `goToNextWeek`, `goToCurrentWeek` and `reload()`, which re-fetches the week being shown. It seeds from `initialWeek` and re-seeds when the dashboard reloads.
- `OfficerWeekCard.jsx`:
  - Uses `useOfficerWeek`.
  - Heading follows the week: "This week", "Upcoming week" or "Past week", plus "Week N" and the date range.
  - **Previous / This week / Next** buttons sit outside the expand `<button>` (buttons cannot nest), disabled when there is no such week or while loading.
  - The expanded state survives navigation.
  - Empty states: "No inspections are scheduled. Upload the weekly roster on the Plan page." only when the week is empty **and** there is no previous or next week; otherwise "No inspections are scheduled this week."
  - `saveAssignment` branches on scope: one-off → `updatePatrolAssignment({ patrolId, auditorId, auditeeId, applyToUpcoming: false })`; zone → `updateZoneAssignment({ zoneId, auditorId, auditeeId, fromDate: week.zoneEditFromDate })`. After either it calls `reload()` and shows the response `message` as a success `Alert` at card level.
  - It still loads `fetchPlanningLookups` users once.
- `ZoneAssignmentRow.jsx`:
  - **Edit** shows when `canEditAssignment || canEditZone`.
  - In edit mode the old checkbox becomes a two-option radio group:
    - "Every audit of this zone from {zoneEditFromDate} to 31 Dec ({reassignableCount} audits)", enabled when `canEditZone`;
    - "Only this audit on {scheduledDate}", enabled when `canEditAssignment`.
  - The default is the zone option when available.
  - When the row's own audit is under way, a note says it keeps its people.
  - Selects:
    - mark the signed-in user "(you)" (`useAuthenticatedUser`);
    - include a fallback `<option>` for a current auditor/auditee missing from `users`;
    - say "Assignments cannot be changed until the user list loads." and disable Save when `users` is empty.
  - A zone closed with no observations has no closure, so its detail says so instead of mounting `ZoneProgressDetail` with `closureId = null` (that spinner never stopped).
- `features/patrols/patrol.service.js`: `updateZoneAssignment({ zoneId, auditorId, auditeeId, fromDate })` → `PATCH /patrols/zones/:zoneId/assignment`.
- `PatrolForm.jsx`: "(you)" on the signed-in user in both selects; "No other users are registered at this location." becomes "No users are registered at this location."
- `RosterUploadPanel.jsx`: the re-upload confirmation also says it overwrites assignments changed from the dashboard.
- `ApprovalPanel.jsx`: when `closure.auditeeId` equals the signed-in user's id, show a warning `Alert` above the buttons: "You are the auditee of this audit, so approving it signs off your own action plans." Remove the stale "Responsible HOD" field and the docstring claim that rejection clears the action plan. `ApprovalQueuePage.jsx` marks such rows "(you)" next to the auditee name.
- `global.css`: append styles for the week navigation row and the scope radio group. Reuse existing classes otherwise.

## Documentation to update in the same change

- `CLAUDE.md`:
  - the dashboard paragraph (week navigation, zone edit);
  - the roles paragraph (anyone at the plant, the officer included, may be auditor or auditee; observation/closure routes are `authenticate`-only, not `USER`);
  - self-approval as a decided rule;
  - plan range `10`–`20`.
- `docs/README.md`: row 20; note on row 14 that D6/D8/D9 are amended by 20.
- `docs/14-weekly-roster-plan.md`: a short "Amended by 20" note under D6, D8 and D9. Do not rewrite history.
- `docs/12-plan-page-plan.md`: the "excluding the officer" line.
- `docs/04-api-reference.md`:
  - the two new endpoints, with their errors (`NO_REASSIGNABLE_AUDITS`, `INVALID_FROM_DATE`, `INVALID_WEEK_START`);
  - `officerWeek`'s shape and the management `nextAudit`;
  - `planning-lookups` users;
  - the closure ids;
  - the real pending-approvals scope.
- `docs/05-workflows.md`: the reassignment rules (D3–D5, D7) and that the officer may be a participant (D8, D9).
- `docs/06-frontend.md`: `useOfficerWeek`, the card navigation, the row's scope choice, the management `nextAudit` card.
- `docs/01-overview.md`: R9 status (reassignment done; date edit and cancel not started); the officer's row.
- `docs/03-data-model.md`: `ehs_officer_id` may equal `auditor_id` or `auditee_id`.
- `docs/09-feature-refinement-backlog.md`: R9 partially done; the out-of-scope items above as new entries.
- `guide.md` and `SETUP-GUIDE.md`:
  - the officer can be rostered and may approve their own closure (warning shown);
  - change a zone's people from the dashboard instead of re-uploading;
  - a re-upload overwrites those changes.
- `docs/samples/generate-roster-template.mjs`: the instructions sheet says the officer may enter their own email. Regenerate `weekly-roster-template.xlsx` from it.

## Acceptance checks

Run with an EHS Officer whose plant is set. "This week" is the current Monday-to-Sunday week (UTC).

| # | Check | Expected |
|---|---|---|
| 1 | Sign in as the officer and open `/dashboard` | The officer week card renders (not "No upcoming audit found") |
| 2 | `GET /api/patrols/planning-lookups` | `users` includes the officer |
| 3 | Upload a roster naming the officer as auditor of one zone and auditee of another | 201; both zones scheduled |
| 4 | Roster row with the officer as both auditor and auditee | 400 `ROSTER_INVALID`, "must be different users" |
| 5 | File this week's zone-4 report, then `PATCH /api/patrols/zones/4/assignment` with this week's Monday as `fromDate` | 200; `updatedCount` = remaining Mondays; `skippedCount` = 1; this week's patrol keeps its people; next week's carries the new pair; `GET /api/patrols/roster` shows the new pair |
| 6 | Same with a `fromDate` in a past week | `fromDate` in the response is this week's Monday |
| 7 | A zone with nothing reassignable left | 409 `NO_REASSIGNABLE_AUDITS` |
| 8 | Another plant's zone | 403 `ZONE_OUTSIDE_OFFICER_DOMAIN` |
| 9 | `PATCH /api/patrols/:id/assignment` with `applyToUpcoming: false` | Only that patrol changes; the roster row does not |
| 10 | `PATCH /api/patrols/:id/assignment` with `applyToUpcoming: true` on a filed patrol | 409 `PATROL_NOT_EDITABLE`, nothing changed |
| 11 | `GET /api/dashboard/officer-week` with no `weekStart`, then each `nextWeekStart` | Default week as D9; `next`/`previous` skip empty weeks; `null` at either end; a mid-week date normalises to its Monday |
| 12 | A past week | Every zone has `canEditAssignment: false`, `canEditZone: false` |
| 13 | As an ordinary user, `GET /api/dashboard/officer-week` | 403 |
| 14 | Officer is this week's auditor | Dashboard shows "your audit" above the week card; the calendar chip reads "Auditor"; the officer can file the report on `/observations` |
| 15 | Officer is the auditee; the closure is submitted | The approval panel warns that they are the auditee; approving completes the patrol |
| 16 | Ordinary auditee with an open closure | The dashboard prompts them (D11) |
| 17 | HOD signs in | Plant-wide `WeeklySummary`, no officer card |
| 18 | Browser: edit a zone from the card, then Next week, then Previous | The success message stays visible; the card stays expanded; no full-page spinner |
