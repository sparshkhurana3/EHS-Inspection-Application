# 11. Closure page: pending list, approval loop, completed detail

Implementation plan for the auditee's Closure page and the EHS Officer approval that governs it.

**Goal**

1. Show **all** closures pending for the signed-in auditee from the **last 6 months**.
2. A closure is completed only when an `EHS_OFFICER` approves it. If the officer reopens it instead, the auditee fills the closure in again.
3. A closure awaiting the officer shows **Pending Approval**. Any other not-yet-completed closure shows **Open**.
4. Show closures **completed in the last week** as cards. Clicking one shows the observation report and the closure report together.
5. A pending closure older than 6 months shows as **Lapsed**.

Prerequisites, all in [09](09-feature-refinement-backlog.md): items 0.3, 0.4, 0.5 and 1.2 are four separate defects in this exact feature. The page crashes on render for auditees, the action-plan inputs cannot be typed into, the photograph never loads, and the EHS Officer branch never activates. Fix them before starting.

## Assignment rules this must respect

| Rule | Status |
|---|---|
| One person cannot be auditor and auditee of the same patrol | Already enforced by a database constraint and a validator. No work |
| A person can be auditee of one zone and auditor of another | Already works. Closures are scoped by `requested_by`, observations by `auditor_id`. The same user legitimately appears on both pages in one week |
| A person can be auditee on several zones | **Not supported.** `GET /api/closures/current` ends in `LIMIT 1` |

The live database already contains the failure. User 2 has three closure rows, two awaiting approval and one approved. The page can show exactly one of them.

## The three windows

| List | Filter | Anchor column |
|---|---|---|
| Pending | not yet approved, created within 6 months | `requested_at` |
| Lapsed | not yet approved, created more than 6 months ago | `requested_at` |
| Completed | approved within 7 days | approval timestamp |

Pending and Lapsed are the same set split by age, so one query serves both. Lapsed is **derived, never stored**: it is a function of the clock, so a stored status would need a nightly job to flip it and would drift the moment that job failed.

**"Completed" is not `completion_date`.** That column is a `DATE` the auditee sets when submitting, meaning "the date I finished the work". Per requirement 2, completion is the officer's approval. The completed list must filter on the approval timestamp, never on `completion_date`.

**The approval timestamp needs repair.** Migration 006 added `approved_at` for the approval endpoint that was never built, so it is null on every row. The one `APPROVED` row in the database carries `closed_at` and `reviewed_at` instead, written directly by a seed script. Backfill `approved_at` from `COALESCE(closed_at, reviewed_at)` for existing approved rows in the same migration that adds the index below, then have the new endpoint always write it.

## Status labels

Requirement 3 collapses the display to two labels before completion. The current mapping has four and must change:

| Stored status | Label today | Label required |
|---|---|---|
| `OPEN` | Open | **Open** |
| `IN_PROGRESS` | In Progress | **Open** |
| `REEXAMINATION_REQUIRED` | In Progress | **Open** |
| `SUBMITTED_FOR_CLOSURE` | Sent for Closure | **Pending Approval** |
| `APPROVED` | Closed | Completed |

A lapsed closure keeps this same chip and gains a **Lapsed** badge plus its own section. One exception: a closure older than 6 months that is already `SUBMITTED_FOR_CLOSURE` stays **Pending Approval** and is not treated as lapsed, because the auditee has done their part and the delay belongs to the officer. Lapsing describes work the auditee still owes. Confirm if you want age to override that.

**Change the label only, never the stored status.** The three statuses that now share the word "Open" still drive different behaviour: whether the submit button is enabled, and whether this is a first attempt or a rework. Collapsing them in the database would break the approval loop.

**This hides the rejection, which needs a second signal.** A closure the officer sent back reads "Open", identical to one never touched, so the auditee has no way to tell that rework is expected. Add a distinct marker on the card for `REEXAMINATION_REQUIRED`, for example a "Returned by EHS" badge with the officer's comments, alongside the required Open label. Confirm the wording.

## Backend

### 1. Replace the single-closure query with list queries

Keep `CLOSURE_SELECT` as it is. It already joins the observation report, patrol, zone, unit and all three people, so one row carries both reports for the detail view.

Add two repository functions:

```sql
-- findOpenClosuresForAuditee(auditeeId, lapseMonths)
-- Returns pending and lapsed together; the service splits on is_lapsed.
SELECT …,
  (closure_request.requested_at < NOW() - ($2 || ' months')::INTERVAL
   AND closure_request.status <> 'SUBMITTED_FOR_CLOSURE') AS is_lapsed
WHERE closure_request.requested_by = $1
  AND closure_request.status IN
      ('OPEN','IN_PROGRESS','REEXAMINATION_REQUIRED','SUBMITTED_FOR_CLOSURE')
ORDER BY CASE closure_request.status
           WHEN 'REEXAMINATION_REQUIRED' THEN 1   -- rework first, it is already late
           WHEN 'OPEN' THEN 2
           WHEN 'IN_PROGRESS' THEN 3
           WHEN 'SUBMITTED_FOR_CLOSURE' THEN 4    -- waiting on someone else, last
         END,
         closure_request.target_date ASC NULLS LAST,
         patrol.scheduled_date ASC

-- findRecentlyCompletedClosuresForAuditee(auditeeId, daysBack)
WHERE closure_request.requested_by = $1
  AND closure_request.status = 'APPROVED'
  AND COALESCE(closure_request.approved_at, closure_request.closed_at)
      >= NOW() - ($2 || ' days')::INTERVAL
ORDER BY COALESCE(closure_request.approved_at, closure_request.closed_at) DESC
```

Drop the `LIMIT 1` query once nothing calls it. Keep `findClosureByIdForAuditee`, which the action-plan and submit paths use for their ownership check.

The `COALESCE` is only needed until the backfill lands. Remove it afterwards.

Window sizes belong in one module constant, not scattered as literals, so 6 months and 1 week can be changed in one place.

### 2. Endpoints

| Endpoint | Auth | Behaviour |
|---|---|---|
| `GET /api/closures` | any signed-in user | Returns both lists in one response. Replaces `GET /api/closures/current` |
| `GET /api/closures/:closureId` | auditee, auditor, or EHS officer of the patrol | One closure with its full observation context. Backs the detail view |
| `POST /api/closures/:closureId/approve` | `EHS_OFFICER`, `ADMIN` | Approve. `closureReviewValidationRules` already exists, unused |
| `POST /api/closures/:closureId/reject` | `EHS_OFFICER`, `ADMIN` | Reopen with mandatory comments. `rejectClosureValidationRules` already exists, unused |
| `GET /api/closures/pending-approvals` | `EHS_OFFICER`, `ADMIN` | The officer's queue. Already called by the frontend, never implemented |

`PATCH /:closureId/action-plan` and `POST /:closureId/submit` keep their current contracts. Submit already sets `completion_date` to the current date at the moment the auditee sends the closure for approval, which is the required behaviour, so no change is needed there. On a resubmission after rejection it is overwritten with the new date, which is correct: the work finished on the later date. One caveat, tracked as backlog item 3.3, is that this date is taken in server-local time while the dashboard works in UTC. Pin the container to UTC so a late-evening submission cannot record tomorrow's date. Note that the submit route has no parameter validation, which is backlog item 1.6 and should be fixed while the file is open.

`GET /api/closures` response:

```json
{
  "pendingWindowMonths": 6,
  "completedWindowDays": 7,
  "pendingCount": 2,
  "lapsedCount": 1,
  "completedCount": 1,
  "pending":   [ { "…closure…", "displayStatus": "Pending Approval", "wasReturned": false, "isLapsed": false } ],
  "lapsed":    [ { "…closure…", "displayStatus": "Open", "wasReturned": true, "isLapsed": true } ],
  "completed": [ { "…closure…", "displayStatus": "Completed", "approvedAt": "…",
                   "reviewedByName": "…", "reviewComments": "…" } ]
}
```

Add two derived booleans. `wasReturned` is true for `REEXAMINATION_REQUIRED` and carries the rejection signal the two-label scheme cannot. `isLapsed` drives the Lapsed section.

### 3. The approval loop

Both endpoints require the closure to be `SUBMITTED_FOR_CLOSURE` and run one transaction across three tables.

**Approve** → closure `APPROVED`, setting `reviewed_by`, `reviewed_at`, `approved_at`, optional `review_comments`, `approval_iteration + 1`. Observation report → `CLOSED` with `closed_at`. Patrol → `COMPLETED`.

**Reject** → closure `REEXAMINATION_REQUIRED`, setting the same review columns and incrementing the iteration. Observation report → `REEXAMINATION_REQUIRED`. Patrol → `REEXAMINATION_REQUIRED`.

Rejecting also **clears the action plan so the auditee writes it again, and leaves the target date untouched**:

```sql
UPDATE closure_requests SET
    status               = 'REEXAMINATION_REQUIRED',
    action_plan          = NULL,      -- cleared: must be written again
    action_plan_saved_at = NULL,
    -- target_date deliberately untouched; the commitment does not move
    reviewed_by = $2, reviewed_at = NOW(), review_comments = $3,
    approval_iteration = approval_iteration + 1,
    updated_at = NOW()
WHERE id = $1 AND status = 'SUBMITTED_FOR_CLOSURE';
```

`responsible_hod_name` is also left untouched. You named the action plan and the target date; the responsible HOD is neither, and the person accountable does not change because the plan was rejected. Say so if it should clear too.

The old action plan is destroyed by this, so there is no record of what was rejected. If that history matters for audit, add a `closure_revisions` table capturing the plan text, the reviewer, the comments and the iteration before the clear. Not required for this plan.

Because `canSubmitForClosure` requires a non-blank action plan, clearing it automatically disables the submit button until the auditee writes a new one. No extra guard needed.

The rework path then works with no further change: `canEditActionPlan` already includes `REEXAMINATION_REQUIRED`, the action-plan endpoint already accepts that status and moves the closure to `IN_PROGRESS`, and submit moves it back to `SUBMITTED_FOR_CLOSURE`. `approval_iteration` counts the cycles.

Two corrections to make while in these files. The submit path updates the patrol and the report unconditionally by id, with no status precondition in the `WHERE` clause, and the new endpoints must not copy that pattern. `REJECTED` exists in the status constraint but no flow reaches it; either use it for a terminal rejection or drop it in a migration rather than leaving a fourth unreachable value.

### 4. Index

```sql
CREATE INDEX IF NOT EXISTS closure_requests_auditee_approved_index
    ON closure_requests (requested_by, approved_at DESC)
    WHERE status = 'APPROVED';
```

The pending query is already served by `closure_requests_auditee_status_index` and `closure_requests_requested_by_index`, and the officer queue by `closure_requests_approval_queue_index`.

## Frontend

### Page structure

```
Closure                                     Pending · last 6 months
─────────────────────────────────────────────────────────────────
Lapsed (1)
  ┌─────────────────────────────────────────────────────┐
  │ POR-2026-000041 · Unit II / Zone 4 · HIGH           │
  │ Raised 2 Mar · overdue 198 days   [Open] [Lapsed]   │  → still actionable
  └─────────────────────────────────────────────────────┘

Pending (2)
  ┌─────────────────────────────────────────────────────┐
  │ POR-2026-000007 · Unit I / Zone 2 · HIGH            │
  │ Returned by EHS · target 17 Sep            [Open]   │  → action plan form
  └─────────────────────────────────────────────────────┘
  ┌─────────────────────────────────────────────────────┐
  │ POR-2026-000010 · Unit I / Zone 1 · MEDIUM          │
  │ Submitted 15 Sep              [Pending Approval]    │  → read-only, awaiting officer
  └─────────────────────────────────────────────────────┘

Completed this week (1)
  ┌─────────────────────────────────────────────────────┐
  │ POR-2026-000002 · approved 13 Sep          [Done]   │  → observation + closure detail
  └─────────────────────────────────────────────────────┘
```

Route state in the query string, `/closures?closureId=…`, so cards are linkable, the back button works, and the dashboard's existing `/closures?auditId=…&reportId=…` links stop being ignored. That also closes backlog item 1.7 for this page.

### Components

| Component | Responsibility |
|---|---|
| `ClosurePage.jsx` | Picks list, form, or detail. Renders window labels and counts |
| `PendingClosureList.jsx` | New. One card per pending closure with the status chip and the returned badge |
| `LapsedClosureList.jsx` | New. Same card, Lapsed badge and age in days. Reuse the pending card with a variant prop rather than forking it |
| `CompletedClosureList.jsx` | New. One card per closure approved in the last week |
| `ActionPlanForm.jsx` | Existing. Takes one closure as a prop. Fix the undeclared `editable` (0.3) and the broken field setter (0.4) |
| `ClosureDetail.jsx` | New. Observation report, closure report, photograph, review comments |
| `ApprovalPanel.jsx` | Existing. Only reachable once the wrong `useAuth` import is fixed (1.2) |

### Hook

Split `useClosures`, which currently owns the list, the form, the photograph, the officer queue and five busy flags at once:

- `useAuditeeClosures()` — all three lists, counts, loading, error, reload.
- `useClosureForm(closure)` — action plan, target date, responsible HOD, the 255-word limit, reset when `closure.id` changes. After a rejection the server returns a null action plan with the target date intact, so the form naturally opens with an empty plan field and the original date. Show the officer's comments directly above the empty field so it is obvious why it is blank.
- `useClosureDetail(closureId)` — one closure plus its photograph blob.
- `useApprovalQueue()` — officer only, list plus approve and reject.

Fix the double fetch on load while splitting: `loadClosures` both depends on `selectedApprovalId` and sets it, so the effect runs twice.

Read the signed-in user from `useAuthenticatedUser()`, not from the login form hook.

### Detail view

One request returns everything, since `CLOSURE_SELECT` already joins both reports. Show two panels:

**Observation report** — report number, finding date, plant location, unit, zone, area, category, risk, description, photograph, auditor, submitted date.
**Closure report** — action plan, responsible HOD, target date, completion date, submitted date, approving officer, approval date, review comments, and the attempt count when `approval_iteration` exceeds 1.

## Resolved rules

| Question | Decision |
|---|---|
| Does a rejected closure keep its previous answers? | **No for the action plan, yes for the target date.** Reject nulls `action_plan` and `action_plan_saved_at`. `target_date` is untouched, so the original commitment stands and cannot be quietly extended by failing review |
| When is the completion date set? | **The current date at the moment the auditee sends the closure for approval.** Already the behaviour; on resubmission it moves to the later date |
| What happens to a pending closure older than 6 months? | **Shown as Lapsed**, in its own section, derived from age rather than stored |

Two assumptions inside those answers, both easy to change:

- `responsible_hod_name` survives a rejection along with the target date. Only the action plan clears.
- A closure older than 6 months that is already awaiting the officer is **not** lapsed. Lapsing marks work the auditee still owes, and that one is waiting on someone else.

A lapsed closure stays fully actionable: editable, submittable, approvable. Marking it without letting it be discharged would strand the obligation permanently, which is the opposite of what surfacing it is for.

Lapsed is listed above Pending because it is the most overdue work and the easiest to lose. That is a display judgment, not something you specified.

## Knock-on effects

- **The officer needs the approval queue to make any of this work.** Nothing can reach `APPROVED` until `pending-approvals`, `approve` and `reject` exist, so the completed list stays permanently empty. Build the officer side in the same change.
- **The observations page has the mirrored defect**, planned in [10](10-observations-page-plan.md). Build that pattern first and reuse it here.
- **The dashboard undercounts.** `selectCurrentUserTask` returns the first pending item across both roles, so an auditee with several closures sees one.
- **Annual metrics start working.** `metrics.closures.actual` counts `APPROVED` rows with `closed_at` set, which nothing produces today, so it always reports zero. Writing both columns on approval fixes it.

## Acceptance checks

| # | Setup | Expected |
|---|---|---|
| 1 | Auditee has three closures within 6 months | All three listed, ordered rework first, awaiting-approval last |
| 2 | One is `SUBMITTED_FOR_CLOSURE` | Chip reads **Pending Approval**, no editable form |
| 3 | One is `IN_PROGRESS`, one is `OPEN` | Both chips read **Open** |
| 4 | Officer rejects a submitted closure with comments | Auditee sees it chipped **Open**, marked returned, comments visible, form editable again |
| 5 | Auditee resubmits, officer approves | Closure `APPROVED`, report `CLOSED`, patrol `COMPLETED`, `approved_at` set, `approval_iteration` is 2 |
| 6 | Approve, then reload the page | It leaves Pending and appears under Completed this week |
| 7 | A closure approved 10 days ago | Not in Completed. Nothing else changes |
| 8 | Click a completed card | Observation report and closure report shown together with the photograph |
| 9 | Auditee is also an auditor elsewhere this week | That patrol appears only on Observations, not here |
| 10 | A non-officer calls approve | `403 INSUFFICIENT_PERMISSIONS`, nothing written |
| 11 | Officer approves a closure that is not `SUBMITTED_FOR_CLOSURE` | Rejected with a conflict, nothing written |
| 12 | Reject with empty comments | `400 VALIDATION_ERROR`, nothing written |
| 13 | Two officers approve the same closure at once | One wins, the other gets a conflict, no double increment |
| 14 | Auditee opens another auditee's `closureId` | `404`, no data leaked |
| 15 | Officer rejects a closure | `action_plan` is null, `target_date` unchanged, `responsible_hod_name` unchanged, submit button disabled |
| 16 | Auditee reopens the rejected closure | Plan field empty, original target date prefilled, officer comments shown above it |
| 17 | Auditee writes a new plan and sends for approval on a later date | `completion_date` equals that later date, not the first submission's |
| 18 | A pending closure raised 7 months ago | Appears under Lapsed with an age, chipped Open, still editable and submittable |
| 19 | A closure raised 7 months ago already awaiting the officer | Stays under Pending, chipped **Pending Approval**, not lapsed |
| 20 | A lapsed closure is completed and approved | Leaves Lapsed, appears under Completed this week |
