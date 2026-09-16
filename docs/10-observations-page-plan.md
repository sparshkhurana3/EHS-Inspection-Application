# 10. Observations page: weekly list and report detail

Implementation plan for the auditor's Observations page.

**Goal**

1. Show **every** observation pending for the signed-in user this week, where pending means a patrol they are the auditor for that has no observation report yet.
2. Show a card for each observation they have already filled this week. Clicking it opens the contents they submitted.

Prerequisite: the P0 boot failures in [09](09-feature-refinement-backlog.md) must be fixed first, in particular item 0.1, which is in this same module.

## Assignment rules this must respect

| Rule | Where it is enforced today | Work needed |
|---|---|---|
| One person cannot be both auditor and auditee of the same patrol | DB `patrol_auditor_auditee_check`, plus a body-level validator on `POST /api/patrols` | None. Already correct at both layers |
| A person can be auditor of one zone and auditee of another | Queries are scoped by column (`auditor_id = me` here, `requested_by = me` for closures), not by role | None for this page. See [knock-on effects](#knock-on-effects) |
| A person can have several zones to audit, or be audited on, in one week | **Not supported.** The whole chain is singular | This plan |

The third rule is the reason for the work. The repository returns a list, but the service collapses it to one record and the page renders one form.

## Why the current code cannot show either list

`findCurrentAuditorAssignments` filters filled observations out **twice**:

```sql
AND patrol.status IN ('SCHEDULED', 'IN_PROGRESS')   -- filled patrols move to PENDING_AUDITEE_ACTION
AND observation_report.id IS NULL                   -- explicitly excludes anything filled
```

Submitting a report sets the patrol to `PENDING_AUDITEE_ACTION` and creates the report row, so a filled observation fails both predicates. Both must change, not just the second.

The service then reduces the list to one item, and there is **no endpoint that returns a report's contents** — only `GET /api/observations/:reportId/photograph`. The detail view has no data source today.

## Backend

### 1. Widen the weekly query

Rename `findCurrentAuditorAssignments` to `findWeeklyAuditorAssignments` and change it to return every non-cancelled patrol in the week where the user is auditor, each with its report if one exists.

- Drop the `observation_report.id IS NULL` predicate.
- Replace the status filter with `patrol.status <> 'CANCELLED'`.
- Promote the existing `LEFT JOIN observation_reports` into the select list: `id`, `report_number`, `status`, `submitted_at`, `risk_category`, `category`.
- Keep the week window as it is. `DATE_TRUNC('week', $2::DATE)` is Monday-based and matches the dashboard's `getCurrentWeekRange`, so the two agree.
- Keep the `zone_patrol_sequence` CTE that computes `week_number` per zone.
- Order by `scheduled_date`, then `id`.

Map each row to an assignment with a nested report:

```js
{ ...assignmentFields, report: null | { id, reportNumber, status, displayStatus, submittedAt, category, riskCategory } }
```

Reuse `createReportResponse` so `displayStatus` stays consistent with the rest of the module.

### 2. Return the list from the service

`getCurrentAssignments` currently reads an undeclared `assignment` variable (bug 0.1). Rewrite it to return the list rather than patching the singular shape:

```json
{
  "weekStartDate": "2026-09-14",
  "weekEndDate": "2026-09-20",
  "pendingCount": 2,
  "submittedCount": 1,
  "assignments": [
    { "id": 12, "scheduledDate": "2026-09-16", "weekNumber": 3,
      "unitName": "Unit I", "zoneName": "Zone 1", "observationLocation": "Tool shop",
      "auditeeName": "...", "ehsOfficerName": "...", "status": "SCHEDULED",
      "report": null },
    { "id": 14, "…": "…", "report": { "id": 7, "reportNumber": "POR-2026-000007",
      "status": "PENDING_AUDITEE_ACTION", "displayStatus": "In Progress",
      "submittedAt": "2026-09-15T09:25:42Z" } }
  ]
}
```

`pendingCount` and `submittedCount` are derived server-side so the header does not have to recount. An empty week returns `assignments: []` with both counts zero, not an error.

This replaces the old `{ assignment, report }` shape. The only consumer is the frontend, which is rewritten in the same change.

### 3. New endpoint: read one report

`GET /api/observations/:reportId` — `authenticate`, `authorize("USER")`, `observationReportIdValidationRules` (which already exists and is used by the photograph route).

Add `findReportByIdForUser({ reportId, userId })` to the repository. Copy the ownership predicate from `findPhotographByReportId`, which is already correct:

```sql
AND (patrol.auditor_id = $2 OR patrol.auditee_id = $2 OR patrol.ehs_officer_id = $2)
```

Join the patrol, unit, zone and users so the detail view can show the full context in one request. Return `{ report: { …all report fields…, patrol context, auditorName, auditeeName } }`, or `404 OBSERVATION_REPORT_NOT_FOUND` when the row does not exist or the caller is not on the patrol.

Do not reuse `findReportByPatrolId` for this. It has no ownership check and is used inside the submit transaction, where the check would be wrong.

**Register this route after `/current-assignments`** so the literal path is matched before the parameterised one.

### 4. Leave the submit endpoint alone

`POST /api/observations` already takes `patrolId` in the body and enforces auditor ownership, patrol status, and one-report-per-patrol. Nothing changes. The frontend just supplies the `patrolId` of whichever card the user opened.

## Frontend

### Page structure

```
Observations                                   Week of 14–20 Sep
─────────────────────────────────────────────────────────────────
Pending (2)
  ┌──────────────────────────────────────────┐
  │ Tue 16 Sep · Unit I / Zone 1 / Tool shop │  → opens the form
  │ Auditee: A. Sharma          [Fill report]│
  └──────────────────────────────────────────┘
  ┌──────────────────────────────────────────┐
  │ Thu 18 Sep · Unit II / Zone 4 / Utility  │
  └──────────────────────────────────────────┘

Submitted (1)
  ┌──────────────────────────────────────────┐
  │ POR-2026-000007 · Mon 15 Sep             │  → opens read-only detail
  │ Unit I / Zone 2 · UA · HIGH · In Progress│
  └──────────────────────────────────────────┘
```

Three states in one page: the list, the fill form for one pending patrol, and the read-only detail for one submitted report. Use the query string so the states are linkable and the browser back button works: `/observations` for the list, `?patrolId=12` for the form, `?reportId=7` for the detail. This also closes backlog item 1.7, where the dashboard already builds `/observations?auditId=…` links that the page currently ignores.

### Components

| Component | Responsibility |
|---|---|
| `ObservationPage.jsx` | Reads `useSearchParams`, picks list / form / detail, renders the week header and counts |
| `PendingObservationList.jsx` | New. One row per pending assignment, empty state when none |
| `SubmittedObservationList.jsx` | New. One card per submitted report, empty state when none |
| `ObservationCard.jsx` | Existing form. Change: takes one `assignment` as a prop instead of implying the only one, and a back action |
| `ObservationDetail.jsx` | New. Read-only view of a submitted report plus its photograph |

`ExistingReportCard`, currently embedded in the page, is superseded by `SubmittedObservationList` and the detail view.

### Hook

Split `useObservations` in two, because one hook owning a list and a form is where the current confusion comes from:

- `useWeeklyObservations()` — fetches the list, exposes `assignments`, `pending`, `submitted`, `weekStartDate`, `weekEndDate`, `loading`, `error`, `reload`.
- `useObservationForm(assignment)` — the existing form state and validation, keyed to one assignment. Keep every current rule unchanged: 10 MB photo, JPEG/PNG/SVG, 500-word description, required category and risk. Reset all state when `assignment.id` changes, and revoke the photo object URL on unmount or switch.
- `useObservationDetail(reportId)` — fetches the report and its photograph blob.

After a successful submit, navigate back to the list and call `reload()`. That is simpler than an optimistic move between sections and guarantees the counts are right.

### Detail view

Fields to show, all read-only: report number, status chip, finding date, unit, zone, area, plant location, category, risk, description, submitted date, auditee, EHS officer, and the photograph. Fetch the image through the existing authenticated photograph route, which needs `apiBlobRequest` to exist first (backlog item 0.5).

## Recording the area

A patrol covers a whole zone, so the area is recorded here rather than at planning time: a finding happens in one place. `observation_reports.zone_area_id` exists for this, added by migration 007.

The form's **location of observation** field changes from a read-only input to a **required dropdown** of that zone's fixed areas, ordered by `display_order`. The weekly list response therefore carries `areas[]` on each assignment, so the form needs no extra request.

- `POST /api/observations` takes `zoneAreaId` and validates it belongs to the patrol's zone, rejecting anything else with `400 AREA_NOT_IN_PATROL_ZONE`.
- A zone with no areas configured blocks the form with a clear message, since there is nothing to attribute a finding to.
- Existing reports have a null area and must render as "Not recorded" rather than blank.
- The detail view and the closure page both show the area name.

## Open decision

**Do unfilled observations from earlier weeks roll forward?** The requirement says "for that week", and the query window is strictly the current Monday to Sunday. A patrol scheduled last week that was never filled currently disappears from the page, while the patrol row stays `SCHEDULED` forever and the auditee never receives a closure.

Recommendation: add an **Overdue** section above Pending, listing unfilled patrols where the user is auditor and `scheduled_date < weekStart`. It is a small change to the same query, and without it missed audits are silently lost. Confirm before building, since it changes what "for that week" means.

## Knock-on effects

- **Closures have the identical problem.** `GET /api/closures/current` returns one row with `LIMIT 1`. Since a person can be auditee for more than one zone in a week, they can have several open closures and can currently only ever see one. The same list-plus-detail treatment is needed there. Tracked as a follow-up; not in this plan's scope.
- **The dashboard shows one task.** `selectCurrentUserTask` returns the first pending audit across both roles. With several assignments it under-reports. Either show a count with a link to the relevant page, or list them.
- **R11 renames a column.** When the per-zone area work lands, `zones.area_detail` becomes `zones.description` and the area moves to `zone_areas`. `mapAssignment` maps `row.area_detail` to `observationLocation` and must be updated with it. Sequence R11 before this plan, or budget the follow-up edit.

## Acceptance checks

| # | Setup | Expected |
|---|---|---|
| 1 | User is auditor on three patrols this week, none filled | Pending shows 3, Submitted shows 0 |
| 2 | Fill one | Pending 2, Submitted 1, no page reload needed |
| 3 | Click the submitted card | Read-only detail with every field and the photograph |
| 4 | Same user is also auditee on another zone this week | That patrol does **not** appear on this page; it appears in closures |
| 5 | User has no assignments this week | Empty state, no error, no crash |
| 6 | Open `/observations?reportId=<id of a report on someone else's patrol>` | `404 OBSERVATION_REPORT_NOT_FOUND`, error shown, no data leaked |
| 7 | Open `/observations?patrolId=<patrol the user does not audit>` | Form refuses; submit returns `ASSIGNED_PATROL_NOT_FOUND` |
| 8 | Submit twice for the same patrol, for example a double click | Second attempt returns `OBSERVATION_REPORT_ALREADY_EXISTS`, surfaced cleanly |
| 9 | Click a dashboard audit card | Lands on the matching form or detail, not on an unrelated record |
| 10 | Browser back from the form | Returns to the list with the section state intact |
