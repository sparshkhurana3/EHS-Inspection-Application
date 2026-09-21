# 17. Ticket page: departments, EHS Officer approval of tickets, and the six-month history

Implementation plan for the Action Team HOD's **Ticket** page refinement. Written to be implemented file by file without further design decisions. Read [02-architecture.md](02-architecture.md) for the layering rules first. The page as it stands is [13-action-ticket-plan.md](13-action-ticket-plan.md); per-observation tickets come from [16-closure-refinement-plan.md](16-closure-refinement-plan.md), which this depends on — **implement 16 first** (it is).

**Goal**

1. The auditee assigns an observation's plan to a **department** (Maintenance, Utility, Electrical, …); the ticket opens for the Action Team HOD **mapped to that department**.
2. The ticket records the **type of work done** from a dropdown.
3. The HOD has a **History** tab: every ticket of theirs from the last 6 months, open or closed.
4. Ticket status: **Open** (no action yet), **In Progress** (accepted), **Closed** (rejected or completed) — with the EHS Officer now the one who closes it:
   - A **rejection** (with an explanation) goes to the EHS Officer for approval; approved → Closed, attached to the closure and observation.
   - An **accepted** ticket is completed by the HOD with **1–3 photographs and resolution comments**, which go to the EHS Officer, who either **approves** (→ Closed) or **reopens** it (→ Open, the HOD's data cleared).

**Already there, kept as is.** Goal 2 is the existing `corrective_action_types` dropdown (`correctiveActionTypeId`, required on accept — 13, D7/D8); this plan only makes it editable again at completion (D2). Goal 3's "only visible to Action HOD" is already true: `/tickets` is denied to every other role (`RequireRole deny`), and this plan keeps the officer's ticket approvals **off** that page (D7). Per-observation tickets, the 3-file evidence limit, the read predicate and the closure's derived status all stay.

**Non-regression rule.** The auditee's closure flow and the officer's closure approval loop are unchanged except that "Action Team HOD" becomes "department" in the plan form (D1). A ticket still becomes `CLOSED` with a `decision` of `ACCEPTED` or `REJECTED`, so everything that reads that (closure items, observation history's "closed via ticket", the dashboard) works untouched; the only difference is *who* sets it. `closureStatus.js` needs no change (D9).

## Decisions taken in this plan

| # | Decision | Why |
|---|---|---|
| D1 | A new master-data table `departments` (plant-scoped) and `users.department_id`. An Action Team HOD belongs to one department; a department has one or more HODs. The auditee's dropdown lists **departments** at the plant that have at least one active `ACTION_HOD`; the ticket is assigned to that department's HOD (the first by name if several — see the "Not supported" note). `closure_items` and `action_tickets` store `department_id` alongside the existing `action_hod_id`, which keeps being filled. Like locations, departments are **loaded at cutover, never hardcoded** (R12). *Fallback if this is more than wanted:* keep the HOD dropdown and skip the table; everything else in this plan still works. | "mapped to the department selected" is a mapping, not a person. Keeping `action_hod_id` filled means nothing downstream changes. |
| D2 | The **type of work** stays `correctiveActionTypeId`: required on accept (unchanged), and **editable again when completing** the ticket, since the work actually done can differ from the plan. | Already implemented; the spec's "type of work done" is known after the work. |
| D3 | One new stored status, `PENDING_APPROVAL`, for "with the EHS Officer" — reached from a rejection (decision `REJECTED`) or a completion (decision `ACCEPTED`). It **displays as "Pending Approval"**, a fourth, transitional label beside the spec's Open / In Progress / Closed. | The officer step has to be visible to the HOD and to the auditee, and neither "In Progress" nor "Closed" is true of it. |
| D4 | **Reject** no longer closes: `OPEN` → `PENDING_APPROVAL` (`decision = 'REJECTED'`, comments required). The officer **approves** → `CLOSED` (`closure_date` today), or **reopens** → `OPEN` with the HOD's data cleared, so the HOD looks again. | Spec: "rejected … sent for approval … if approved the ticket will be closed." The reopen alternative is applied to both paths for symmetry; the spec only spells it out for the accepted path. |
| D5 | The HOD's **Close** becomes **Submit resolution**: `IN_PROGRESS` → `PENDING_APPROVAL` (`decision` stays `ACCEPTED`), requiring **1–3 evidence photographs** (already enforced) and **resolution comments** (now mandatory; the existing `completion_notes` column, surfaced as `resolutionComments`). The officer approves → `CLOSED`, or reopens → `OPEN`. | Spec, verbatim. |
| D6 | **Reopen clears the HOD's data**: `decision`, `comments`, `corrective_action_type_id`, `completion_notes`, `decided_at`, `submitted_for_approval_at`, and every evidence row **and file**. The plan snapshot (`proposed_action_plan`, `target_date`, `action_hod_name`) stays. The officer's reason is **required** and kept in `reopen_comments`/`reopened_at`/`reopen_count`, shown to the HOD as a banner. | Spec: "changing the status to open and clearing the data attached in the ticket." Without a reason the HOD cannot know what to redo. |
| D7 | The officer approves tickets from the **Closures page**, a new `?view=ticket-approvals` beside the existing closure approvals; `/tickets` stays HOD-only. Endpoints are gated `MANAGEMENT_ROLES` and scoped to tickets whose patrol the caller owns as EHS Officer or whose plant they manage. | Spec: the ticket page is "only visible to action HOD". The officer already has an approvals area. |
| D8 | **History** = every ticket assigned to the HOD whose `assigned_at` is within the last 6 months, any status, filterable (`all`, `open`, `in_progress`, `pending_approval`, `closed`). The main tab keeps its working lists (Open, In Progress, **Pending approval** (new), Closed in the last 30 days). | Spec: "all the closed and open tickets within the last 6 months in the history tab". |
| D9 | `closureStatus.js` treats `PENDING_APPROVAL` as "taken up, not resolved" (it is neither `OPEN` nor `CLOSED`), so a closure with a ticket awaiting the officer is **In Progress** and cannot be submitted until the officer decides; a reopen puts the closure back to **Open**. `canEditClosureItem` already allows editing while the ticket is `OPEN`, so after a reopen the auditee may also revise the plan (which refreshes the ticket snapshot, 13's D5). | Falls out of 16's rules with no code change; recompute is just called from the new transitions. |
| D10 | "Attached to the closure and observation" needs nothing new: once `CLOSED`, the ticket already appears on the closure's item and on the observation's history (`lifecycleStatus CLOSED_VIA_TICKET`). This plan only adds `approvedByName`/`approvedAt` to what those show. | Already delivered by 15 and 16. |

**Not supported by this plan:** a department with several HODs sharing a queue (the first by name is assigned; the others see nothing), an HOD in several departments, and reassigning a ticket to another department after it opens. Each needs a join table or an explicit reassign action; say so if wanted.

## Data model

One migration, `backend/database/migrations/016_add_departments_and_ticket_approval.sql`, idempotent, wrapped in `BEGIN; ... COMMIT;`. Depends on 014.

```sql
/* departments: master data, one set per plant (R12) */
CREATE TABLE IF NOT EXISTS departments (
    id         BIGSERIAL PRIMARY KEY,
    plant_id   BIGINT NOT NULL REFERENCES plants(id) ON DELETE RESTRICT,
    name       VARCHAR(150) NOT NULL,
    code       VARCHAR(50)  NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT departments_plant_code_unique UNIQUE (plant_id, code)
);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS department_id BIGINT REFERENCES departments(id);

CREATE INDEX IF NOT EXISTS users_department_index
ON users (department_id) WHERE is_active;

ALTER TABLE closure_items
ADD COLUMN IF NOT EXISTS department_id BIGINT REFERENCES departments(id);

/* ticket: department, approval, reopen */
ALTER TABLE action_tickets
ADD COLUMN IF NOT EXISTS department_id             BIGINT REFERENCES departments(id),
ADD COLUMN IF NOT EXISTS submitted_for_approval_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_by               BIGINT REFERENCES users(id),
ADD COLUMN IF NOT EXISTS approved_at               TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approval_comments         VARCHAR(1000),
ADD COLUMN IF NOT EXISTS reopen_comments           VARCHAR(1000),
ADD COLUMN IF NOT EXISTS reopened_at               TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reopen_count              INTEGER NOT NULL DEFAULT 0;

ALTER TABLE action_tickets DROP CONSTRAINT IF EXISTS action_tickets_status_check;
ALTER TABLE action_tickets ADD CONSTRAINT action_tickets_status_check
    CHECK (status IN ('OPEN', 'IN_PROGRESS', 'PENDING_APPROVAL', 'CLOSED'));

ALTER TABLE action_tickets DROP CONSTRAINT IF EXISTS action_tickets_state_consistency_check;
ALTER TABLE action_tickets ADD CONSTRAINT action_tickets_state_consistency_check CHECK (
       (status = 'OPEN'             AND decision IS NULL      AND closure_date IS NULL)
    OR (status = 'IN_PROGRESS'      AND decision = 'ACCEPTED' AND closure_date IS NULL)
    OR (status = 'PENDING_APPROVAL' AND decision IS NOT NULL  AND closure_date IS NULL)
    OR (status = 'CLOSED'           AND decision IS NOT NULL  AND closure_date IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS action_tickets_pending_approval_index
ON action_tickets (submitted_for_approval_at) WHERE status = 'PENDING_APPROVAL';

CREATE INDEX IF NOT EXISTS action_tickets_hod_assigned_index
ON action_tickets (action_hod_id, assigned_at DESC);
```

No backfill of `department_id`: existing HODs have no department until master data is loaded. Until an HOD has a department they do not appear in the auditee's dropdown (D1), which is the same "not configured" behaviour the location tables have. Pre-existing `CLOSED` tickets are untouched; they were closed by the HOD under the old rule and stay valid.

**Dev master data** (not a seed; the same shape production loads at cutover):

```sql
INSERT INTO departments (plant_id, name, code) VALUES
  ((SELECT id FROM plants WHERE code = 'GGM'), 'Maintenance', 'MAINT'),
  ((SELECT id FROM plants WHERE code = 'GGM'), 'Utility',     'UTIL')
ON CONFLICT (plant_id, code) DO NOTHING;
UPDATE users SET department_id = (SELECT id FROM departments WHERE code = 'MAINT') WHERE username = 'test.action.hod';
UPDATE users SET department_id = (SELECT id FROM departments WHERE code = 'UTIL')  WHERE username = 'utility.hod';
```

### Ticket status machine (replaces 13's)

```
OPEN ──accept (HOD)──────────────► IN_PROGRESS ──submit resolution (HOD, 1–3 photos + comments)──► PENDING_APPROVAL (ACCEPTED)
  │                                                                                                      │ approve (officer) → CLOSED
  │                                                                                                      └ reopen  (officer) → OPEN (cleared)
  └──reject (HOD, comments)──────► PENDING_APPROVAL (REJECTED) ─ approve (officer) → CLOSED
                                                               └ reopen  (officer) → OPEN (cleared)
```

## Backend

### Closures module (department instead of HOD)

- `closure.repository.js`: `findActionHodsForClosure` → **`findDepartmentsForClosure({ closureId, auditeeId })`**: active departments at the closure's plant that have ≥ 1 active `ACTION_HOD` user, each with its first HOD by `full_name`: `{ id, name, code, hodId, hodName }`. `saveClosureItem` also stores `department_id`; the `CLOSURE_SELECT`/`findClosureItems` item shape gains `departmentId`, `departmentName`. `upsertTicketForClosureRound` gains `departmentId`.
- `closure.service.js` `saveClosureItem`: takes `departmentId` (not `actionHodId`); resolves the department from `findDepartmentsForClosure`, uses its `hodId`/`hodName` for `action_hod_id`/`responsible_hod_name` and the ticket. `getActionHodOptions` → `getDepartmentOptions` returning `{ plantName, departments }`.
- `closure.validator.js`: `actionHodId` rule → `departmentId` (int ≥ 1, required).
- `closure.routes.js`: `GET /:closureId/action-hods` → `GET /:closureId/departments`.

### Tickets module

**Repository — `ticket.repository.js`**

| Function | Change |
|---|---|
| `mapTicket` / `TICKET_SELECT` | Add `department_id`, `department.name AS department_name` (LEFT JOIN), `submitted_for_approval_at`, `approved_by`, `approver.full_name AS approved_by_name`, `approved_at`, `approval_comments`, `reopen_comments`, `reopened_at`, `reopen_count`; map `completion_notes` as `resolutionComments` (keep `completionNotes` too for one release so `TicketStatusCard` does not break mid-change, then drop). |
| `findTicketsForHod` | Unchanged query; the service now buckets four statuses. |
| `findTicketHistoryForHod({ hodId, fromDate, filter })` | New: `WHERE action_hod_id = $1 AND assigned_at >= $2` plus `AND status = <filter>` when not `all`; `ORDER BY assigned_at DESC LIMIT 300`. |
| `findTicketsPendingApproval({ userId })` | New: `status = 'PENDING_APPROVAL'` and (`patrol.ehs_officer_id = $1` OR the caller is management at the patrol's plant — same EXISTS as `observation.repository.js#findReportByIdForUser`), `ORDER BY submitted_for_approval_at`. |
| `findTicketByIdForApprover({ ticketId, userId, forUpdate })` | New: same predicate as above for one ticket, `FOR UPDATE` when asked. |
| `rejectTicket` | Sets `status = 'PENDING_APPROVAL'`, `decision = 'REJECTED'`, `comments`, `corrective_action_type_id`, `decided_at = NOW()`, `submitted_for_approval_at = NOW()`; **no** `closure_date`. Guard `WHERE status = 'OPEN'`. |
| `closeTicket` → `submitResolution({ ticketId, hodId, resolutionComments, correctiveActionTypeId })` | Sets `status = 'PENDING_APPROVAL'`, `completion_notes`, `corrective_action_type_id` (if given), `submitted_for_approval_at = NOW()`. Guard `WHERE status = 'IN_PROGRESS'`. |
| `approveTicket({ ticketId, approverId, comments })` | `status = 'CLOSED'`, `closure_date = CURRENT_DATE`, `closed_at = NOW()`, `approved_by`, `approved_at = NOW()`, `approval_comments`. Guard `WHERE status = 'PENDING_APPROVAL'`. |
| `reopenTicket({ ticketId, approverId, comments })` | `status = 'OPEN'`, `decision = NULL`, `comments = NULL`, `corrective_action_type_id = NULL`, `completion_notes = NULL`, `decided_at = NULL`, `submitted_for_approval_at = NULL`, `reopen_comments = $comments`, `reopened_at = NOW()`, `reopen_count = reopen_count + 1`. Guard `WHERE status = 'PENDING_APPROVAL'`. |
| `deleteEvidenceForTicket(ticketId, client)` | New: `DELETE … RETURNING file_path`; the service unlinks the files **after** the transaction commits (a rolled-back reopen must not lose photos). |

**Service — `ticket.service.js`**

- `STATUS_LABELS` gains `PENDING_APPROVAL: "Pending Approval"`. `createTicketResponse` flags: `canDecide` (`OPEN`, the HOD), `canAddEvidence` (`IN_PROGRESS`), `canSubmitResolution` (`IN_PROGRESS` and 1 ≤ evidence ≤ 3; replaces `canClose`), `awaitingApproval` (`PENDING_APPROVAL`), `wasReopened` (`reopen_count > 0 && status = 'OPEN'`), `pendingOutcome` (`"RESOLUTION"` | `"REJECTION"` from `decision` while pending), `displayDecision` unchanged.
- `getHodTickets`: buckets `open`, `inProgress`, `pendingApproval`, `closed` (30 days) with counts.
- `getHodTicketHistory({ userId, filter })`: 6 months back, `{ windowMonths: 6, filter, count, tickets }`.
- `rejectTicket`: same validation as today (comments required), calls the new repo `rejectTicket`, then `recomputeClosureStatus`.
- `submitResolution({ userId, ticketId, resolutionComments, correctiveActionTypeId })`: `IN_PROGRESS` only; `resolutionComments` **required** (≤ 1000 chars); evidence count 1–3 (`EVIDENCE_REQUIRED_TO_CLOSE` message reworded "Attach at least one evidence photograph before submitting the resolution."); optional type re-validation; `recomputeClosureStatus`. Replaces `closeTicket`.
- `getPendingTicketApprovals({ userId })`, `approveTicket({ userId, ticketId, comments })`, `reopenTicket({ userId, ticketId, comments })`: `findTicketByIdForApprover(forUpdate)` → `404 TICKET_NOT_FOUND` / `409 TICKET_NOT_AWAITING_APPROVAL` → write → `recomputeClosureStatus` in the same transaction → for reopen, unlink the returned evidence paths after commit (`safelyDeleteFile`, existing pattern) → return `getTicketById`. Reopen comments required (`REOPEN_COMMENTS_REQUIRED`, 3–1000 chars). Messages: "Ticket approved and closed." / "Ticket reopened and sent back to the Action Team HOD."
- `addEvidence` stays `IN_PROGRESS`-only, so nothing can be attached while the officer is reviewing.

**Validator — `ticket.validator.js`**: `submitResolutionValidationRules` (`resolutionComments` required 3–1000, `correctiveActionTypeId` optional int), `ticketApprovalValidationRules` (`comments` optional ≤ 1000), `ticketReopenValidationRules` (`comments` required 3–1000), `ticketHistoryValidationRules` (`query("filter")` in the five values).

**Routes — `ticket.routes.js`** (literal paths before `/:ticketId`):

```js
router.get("/",                        authenticate, authorize(...TICKET_ROLES),     getHodTickets);
router.get("/lookups",                 authenticate, authorize(...TICKET_ROLES),     getLookups);
router.get("/history",                 authenticate, authorize(...TICKET_ROLES),     ticketHistoryValidationRules, validate, getHodTicketHistory);
router.get("/pending-approvals",       authenticate, authorize(...MANAGEMENT_ROLES), getPendingTicketApprovals);
router.get("/:ticketId",               …unchanged (SQL-scoped)…);
router.get("/:ticketId/evidence/:evidenceId", …unchanged…);
router.post("/:ticketId/accept",       …unchanged…);
router.post("/:ticketId/reject",       …unchanged route, new behaviour…);
router.post("/:ticketId/evidence",     …unchanged…);
router.delete("/:ticketId/evidence/:evidenceId", …unchanged…);
router.post("/:ticketId/submit-resolution", authenticate, authorize(...TICKET_ROLES), submitResolutionValidationRules, validate, submitResolution);   // replaces /close
router.post("/:ticketId/approve",      authenticate, authorize(...MANAGEMENT_ROLES), ticketApprovalValidationRules, validate, approveTicket);
router.post("/:ticketId/reopen",       authenticate, authorize(...MANAGEMENT_ROLES), ticketReopenValidationRules, validate, reopenTicket);
```

`GET /:ticketId` and the evidence GET already let the patrol's EHS Officer read a ticket through `TICKET_READ_PREDICATE`; extend that predicate with the plant-management EXISTS so a Plant Head reviewing approvals can open it too.

### Access summary

| Endpoint | Roles | Scope |
|---|---|---|
| `GET /api/tickets`, `/history`, `/lookups` | `ACTION_HOD` | own tickets |
| `POST …/accept`, `/reject`, `/evidence`, `/submit-resolution` | `ACTION_HOD` | own ticket |
| `GET /api/tickets/pending-approvals`, `POST …/approve`, `/reopen` | `EHS_OFFICER`/`HOD`/`PLANT_HEAD`/`ADMIN` | tickets on patrols they own or at their plant |
| `GET /api/closures/:id/departments` | `USER` | the closure's auditee |

## Frontend

### Closures (department select)

- `closure.service.js`: `fetchDepartmentOptions(closureId)` → `GET /closures/:id/departments`; `saveClosureItem` sends `departmentId`.
- `useClosures.js`: `useActionHodOptions` → `useDepartmentOptions(closureId)` returning `{ options: [{ id, name, hodName }], plantName, loading, error }`; `useClosureItemForm` holds `departmentId`.
- `ActionPlanItemForm.jsx`: the select is labelled **Assign to department**, options `Maintenance — Test Action HOD`; read-only mode shows `item.departmentName` and `item.actionHodName`. Empty state: "No department at {plant} has an Action Team HOD registered yet."
- `ClosureItemSummary.jsx`, `TicketStatusCard.jsx`: show department name; chip colour for `pending_approval`.

### Tickets (HOD)

- `ticket.service.js`: `fetchTicketHistory(filter)`, `submitTicketResolution({ ticketId, resolutionComments, correctiveActionTypeId })` (replaces `closeTicket`).
- `useTickets.js`: `useHodTickets` exposes `pendingApproval`/`pendingApprovalCount`; new `useTicketHistory(filter)`; `useCloseTicket` → `useSubmitResolution` (form state: `resolutionComments`, `correctiveActionTypeId`).
- **`TicketPage.jsx`**: tab strip **Tickets** / **History** in the query string (`?view=history&filter=`), same pattern as the Observations page. Tickets tab: Open, In progress, **Pending approval** (new list, rows read-only with "Awaiting EHS Officer"), Closed in the last 30 days. History tab: new **`TicketHistory.jsx`** — filter select (All / Open / In progress / Pending approval / Closed), count, six-column rows (Assigned · Report / observation · Department · Type of work · Decision · Status), click → detail.
- **`TicketActionPanel.jsx`**:
  - `OPEN`: accept / **"Reject and send for approval"** (reject copy updated: "Your explanation goes to the EHS Officer, who closes the ticket or sends it back.").
  - `IN_PROGRESS`: evidence input (unchanged), then **Resolution**: required comments textarea, type-of-work select (pre-filled from accept, editable), **Submit resolution for approval** (enabled by `canSubmitResolution`; hint "Attach 1–3 photographs and describe what was done.").
  - `PENDING_APPROVAL`: read-only card "Awaiting EHS Officer approval" with what was sent.
  - `wasReopened`: a warning banner at the top of the detail: "Reopened by the EHS Officer: {reopen_comments}", with "Reopened N time(s)".
- **`TicketList.jsx`**: chip colour for pending approval; row meta shows department.

### Tickets (EHS Officer approvals)

- `ClosurePage.jsx`: `?view=ticket-approvals` renders new **`TicketApprovalQueuePage.jsx`** (in `features/closures/`, next to `ApprovalQueuePage.jsx`); the approvals header gains a second button **Ticket approvals (N)**. The count comes from `GET /api/tickets/pending-approvals` (already needed for the list).
- `TicketApprovalQueuePage`: list (report number, observation N, department, HOD, outcome "Resolution" / "Rejection", waiting since) → selected ticket: `ObservationSummary`-style observation block for **that** observation, `TicketStatusCard` (plan, comments, type of work, evidence thumbnails, resolution), then **`TicketApprovalPanel.jsx`**: **Approve and close** (optional comments) / **Reopen** (required reason, `window.confirm` because it deletes the HOD's photographs). Hook `useTicketApprovals` in `useTickets.js` (list, `approve`, `reopen`, busy, error).
- Role gating: the button and view render only for `hasManagementRole(user)`; the endpoints enforce it.

### Styles

Append `.ticket-status-pending_approval` (amber), `.ticket-reopened-banner`, `.ticket-history-row` (six-column `weekly-list-row` variant), `.ticket-resolution-form`, `.ticket-approval-actions`.

## Documentation to update in the same change

- `CLAUDE.md`: the ticket step of the domain workflow (four statuses, officer approval/reopen, departments) and the roles bullet (department master data).
- [03-data-model.md](03-data-model.md): `departments`, `users.department_id`, the new ticket columns and CHECKs, migration 016.
- [04-api-reference.md](04-api-reference.md): the changed/new ticket routes and `<ticket>` fields; `GET /closures/:id/departments`.
- [05-workflows.md](05-workflows.md): the new ticket machine diagram.
- [06-frontend.md](06-frontend.md): the History tab, the approval queue, the department select.
- [README.md](README.md): row 17.

## Implementation order

1. Migration 016 + the dev master-data SQL; rebuild; confirm `\d action_tickets` shows the new CHECKs and both test HODs have a department.
2. Closures: departments endpoint, `saveClosureItem` by department, frontend select (checks 1–2).
3. Ticket repository/service/routes for reject-to-pending and submit-resolution (checks 3–6); confirm the closure's derived status through each step (check 7).
4. Officer endpoints and the approval queue UI (checks 8–12).
5. History endpoint and tab (checks 13–14).
6. Docs.

## Acceptance checks

Run against the containers. `test.action.hod` is the Maintenance HOD, `utility.hod` the Utility HOD, `test.auditee` the auditee, `test.ehs.officer` the officer.

| # | Check | Expected |
|---|---|---|
| 1 | `GET /api/closures/:id/departments` as the auditee | `[{ Maintenance, hodName "Test Action HOD" }, { Utility, hodName "Utility Dept HOD" }]`; a department with no HOD is absent |
| 2 | Save observation 1's plan with `departmentId` = Utility | the ticket opens for `utility.hod`, `departmentName "Utility"`; Maintenance's HOD does not see it |
| 3 | `POST /reject` as the Utility HOD with comments | 200; ticket `status PENDING_APPROVAL`, `decision REJECTED`, `displayStatus "Pending Approval"`, no `closureDate`; without comments 400 |
| 4 | Accept a second ticket, add 1 photo, `POST /submit-resolution` **without** comments | 400 `RESOLUTION_COMMENTS_REQUIRED`; with comments but 0 photos 400 `EVIDENCE_REQUIRED_TO_CLOSE`; with 1–3 photos and comments 200 → `PENDING_APPROVAL`, `decision ACCEPTED` |
| 5 | `POST /evidence` while `PENDING_APPROVAL` | 409 |
| 6 | Change the type of work at resolution | stored; shown on the card |
| 7 | `GET /api/closures/:id` at each step | ticket `OPEN` → closure `Open`; accepted → `In Progress`; pending approval → still `In Progress`, `canSubmitForClosure false` |
| 8 | `GET /api/tickets/pending-approvals` as the officer, then as `test.auditor` | officer sees both pending tickets with outcome; auditor 403 |
| 9 | `POST /approve` on the rejected ticket | `CLOSED`, `decision REJECTED`, `closureDate` today, `approvedByName`; observation history shows "Closed – plan rejected" |
| 10 | `POST /reopen` on the resolution ticket **without** a reason | 400; with a reason: `OPEN`, `decision null`, `comments null`, `resolutionComments null`, `evidence []`, files gone from `uploads/tickets`, `reopenCount 1`, `wasReopened true`; the closure goes back to `Open`; the HOD's page shows the reopen banner |
| 11 | The HOD accepts again, resubmits with photos; officer approves | `CLOSED`, `decision ACCEPTED`; `closedTicketCount` on the closure increments; closure submittable once every ticket is closed |
| 12 | `POST /approve` on an `OPEN` ticket | 409 `TICKET_NOT_AWAITING_APPROVAL` |
| 13 | `GET /api/tickets/history?filter=all` as the Utility HOD | every ticket assigned to them in 6 months, newest first, including closed and reopened ones; `filter=closed` only closed; `filter=bogus` 400 |
| 14 | History tab as the Maintenance HOD | only their own tickets; the Utility ticket is absent |
| 15 | Sign in as `test.hod` (management) | can open `?view=ticket-approvals` and approve; cannot open `/tickets` |
| 16 | A pre-migration `CLOSED` ticket | unchanged, still shown as Closed with its decision |
| 17 | Auditee's closure page | each observation shows department + HOD, the ticket chip reads Pending Approval while the officer reviews, and the reopen reason appears on the ticket card |
| 18 | Observation history `filter=closed` after 9 and 11 | both reports listed as closed via ticket with the right decision labels |
