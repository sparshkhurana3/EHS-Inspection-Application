# 16. Closure page: one action plan per observation, and a status driven by ticket outcomes

Implementation plan for the auditee's **Closures** page refinement. Written to be implemented file by file without further design decisions. Read [02-architecture.md](02-architecture.md) for the layering rules first. The page as it stands is described in [11-closure-page-plan.md](11-closure-page-plan.md); the ticket half is [13-action-ticket-plan.md](13-action-ticket-plan.md). This plan supersedes one sentence of [15-observations-refinement-plan.md](15-observations-refinement-plan.md)'s D3 ("the auditee writes one action plan covering all observations") — see D1 below — and depends on 15's `observation_items` table, so **implement 15 first**.

**Goal**

1. Each observation on a report gets **its own action plan**, assigned to whichever department can fix it (Maintenance, Utility, Electrical, Chemical, …), because different observations on the same audit often belong to different departments.
2. The closure's status reflects the **whole report's** progress, derived from its observations' plans and tickets:
   - **Open** — at least one observation has no action plan yet.
   - **In Progress** — every observation has a plan **and** a ticket assigned to a department.
   - **Closed** — every observation's ticket has reached its outcome (implemented or rejected) **and** the EHS Officer has approved the closure.
3. Because a report can now hold up to 10 observations ([15](15-observations-refinement-plan.md)), the closure page shows a **specific action plan per observation** with its own "assign to department" (Action Team HOD) choice, and the auditee sees **each attached ticket's status directly underneath that observation's plan**. A no-observation report never gets a closure at all (15, D4), so this plan only concerns reports that have observations.

**Non-regression rule.** A closure still exists 1:1 with its observation report (`closure_requests.observation_report_id` stays unique). The EHS Officer approval loop stays: `POST /:closureId/submit` → `POST /:closureId/approve|reject`, one decision per submission, `REEXAMINATION_REQUIRED` sends the auditee back. The dashboard's zone-status card, the ticket module's read predicate, and every place that already reads `closure.actionPlan`/`targetDate`/`actionHodName`/`ticketStatus` keep working unchanged (D2, same backward-compatible pattern 15 used for `observation_items`).

## Decisions taken in this plan

| # | Decision | Why |
|---|---|---|
| D1 | **One action plan per observation**, in a new child table `closure_items` — one row per `observation_items` row, same `sequence_number`. Supersedes 15's D3 sentence about a single plan; 15's actual schema decision ("one closure per report") is untouched. | The spec ties "Open" to a plan being "missing for any one observation," which only makes sense if plans are per-observation. |
| D2 | `closure_requests` **keeps** `action_plan`, `target_date`, `responsible_hod_name`, `action_hod_id`, `action_plan_saved_at` and is written from **closure item #1** whenever any item is saved (mirrors 15's D2: `observation_reports`' single-observation columns stay filled from item #1). `closure_requests.status` also stays and is now **derived** on every write rather than set directly by `saveActionPlan` (D5). | Every existing reader — the dashboard zone card, `ObservationSummary`, the closure list, the approval queue — keeps working with zero changes. |
| D3 | `action_tickets` gains `closure_item_id` (nullable, backfilled to each closure's item #1 in the migration; **required** for every ticket created after this change). The uniqueness that was `(closure_request_id, closure_round)` becomes `(closure_item_id, closure_round)`: one ticket per **observation** per approval round, not one per closure. `closure_request_id` stays on the row (denormalised) so the existing "every ticket for this closure" queries need only add a column, not a join. | Different observations can go to different departments in the same round; one ticket per closure could not represent that. |
| D4 | The Action HOD dropdown is chosen **per observation**, defaulting to the previous observation's choice when adding a new one (a convenience, not a rule — a UX nicety in `ActionPlanItemForm`, not a constraint). Saving one item's plan opens (or refreshes, while `OPEN`) only **that item's** ticket, exactly like 15's single-report ticket refresh rule in 13's D5. | Matches "assigned to the relevant department" per observation. |
| D5 | `closure_requests.status` is computed by a pure function `deriveClosureStatus(items)` and written by every function that changes an item or a ticket outcome (`saveClosureItem`, ticket accept/reject/close via a new hook the ticket service calls back into). Rule, applied to the closure's `closure_items` and each item's **latest ticket**: any item missing a plan → `OPEN`; else any item's ticket missing or not yet `IN_PROGRESS` (i.e. `OPEN`/none) → still `OPEN` (a plan alone is not enough, D2 spec: "if action plans are created... **and** the ticket is assigned"); else any item's ticket not yet `CLOSED` → `IN_PROGRESS`; else (every item's ticket `CLOSED`) → `SUBMITTED_FOR_CLOSURE` **if not yet submitted**, otherwise the existing approval-loop value (`SUBMITTED_FOR_CLOSURE`/`APPROVED`/`REJECTED`/`REEXAMINATION_REQUIRED`) is left alone — approval itself stays a distinct, EHS-Officer-only action (D6). | This is the literal three-way rule from the spec, expressed against per-item data instead of one shared plan/ticket. |
| D6 | **The EHS Officer approval step is kept, unchanged**, layered on top of D5: once every ticket is `CLOSED`, the closure becomes eligible to submit (`canSubmitForClosure`), the auditee still clicks **Submit**, and `APPROVED` (→ "Closed") only follows the officer's review. The spec's "approved by the EHS_Officer" phrase is read as this existing step, not as a reason to remove it. | Removing officer sign-off would be a bigger behavioural change than asked for, and the approval endpoints/roles already exist and work. |
| D7 | A closure rejected by the EHS Officer (`REEXAMINATION_REQUIRED`) reopens **every** item for editing (not just the ones whose ticket was rejected) and starts a **new round** (`approval_iteration` increments, as today); each item's ticket for the new round is created fresh when its plan is re-saved, exactly like 13's existing per-round ticket rule. | Simplest reading that reuses the existing round/iteration machinery without inventing a partial-reopen concept the spec does not ask for. |
| D8 | `canEditActionPlan` (which observations the auditee may still edit) is now **per item**: an item is editable while the closure is not past `REEXAMINATION_REQUIRED`/`OPEN`/`IN_PROGRESS`, same statuses as today, evaluated per item rather than for the whole closure, **and** only while that item's own latest ticket is not yet decided (`OPEN`, no ticket, or ticket `OPEN`) — once a department has accepted or rejected the plan, the plan text is frozen, matching 13's existing "once decided, the snapshot is frozen" ticket rule. | The spec does not say plans can be edited after a department has acted on them, and the ticket module already assumes a frozen snapshot once decided. |

## Data model

One migration, `backend/database/migrations/014_add_closure_items.sql`, idempotent, wrapped in `BEGIN; ... COMMIT;`. Depends on migration 013 (`observation_items`).

```sql
CREATE TABLE IF NOT EXISTS closure_items (
    id                  BIGSERIAL PRIMARY KEY,

    closure_request_id  BIGINT NOT NULL REFERENCES closure_requests(id)   ON DELETE CASCADE,
    observation_item_id BIGINT NOT NULL REFERENCES observation_items(id) ON DELETE CASCADE,
    sequence_number     INTEGER NOT NULL,

    action_plan         TEXT,
    target_date         DATE,
    responsible_hod_name VARCHAR(255),
    action_hod_id       BIGINT REFERENCES users(id),
    action_plan_saved_at TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT closure_items_closure_sequence_unique
        UNIQUE (closure_request_id, sequence_number),

    CONSTRAINT closure_items_observation_item_unique
        UNIQUE (observation_item_id)
);

CREATE INDEX IF NOT EXISTS closure_items_closure_index
ON closure_items (closure_request_id);

/* one closure_items row per existing observation_items row */
INSERT INTO closure_items (
    closure_request_id, observation_item_id, sequence_number,
    action_plan, target_date, responsible_hod_name, action_hod_id, action_plan_saved_at
)
SELECT
    cr.id, oi.id, oi.sequence_number,
    CASE WHEN oi.sequence_number = 1 THEN cr.action_plan ELSE NULL END,
    CASE WHEN oi.sequence_number = 1 THEN cr.target_date ELSE NULL END,
    CASE WHEN oi.sequence_number = 1 THEN cr.responsible_hod_name ELSE NULL END,
    CASE WHEN oi.sequence_number = 1 THEN cr.action_hod_id ELSE NULL END,
    CASE WHEN oi.sequence_number = 1 THEN cr.action_plan_saved_at ELSE NULL END
FROM closure_requests AS cr
JOIN observation_items AS oi
    ON oi.observation_report_id = cr.observation_report_id
WHERE NOT EXISTS (
    SELECT 1 FROM closure_items AS ci WHERE ci.closure_request_id = cr.id
);

ALTER TABLE action_tickets
ADD COLUMN IF NOT EXISTS closure_item_id BIGINT
    REFERENCES closure_items(id) ON DELETE CASCADE;

/* backfill: every pre-existing ticket belongs to its closure's item #1 */
UPDATE action_tickets AS t
SET closure_item_id = ci.id
FROM closure_items AS ci
WHERE ci.closure_request_id = t.closure_request_id
  AND ci.sequence_number = 1
  AND t.closure_item_id IS NULL;

ALTER TABLE action_tickets
DROP CONSTRAINT IF EXISTS action_tickets_closure_round_unique;

ALTER TABLE action_tickets
ADD CONSTRAINT action_tickets_closure_item_round_unique
UNIQUE (closure_item_id, closure_round);

CREATE INDEX IF NOT EXISTS action_tickets_closure_item_index
ON action_tickets (closure_item_id);
```

No CHECK constraint on `closure_items.action_hod_id`'s department: it is whoever is chosen from the existing `ACTION_HOD` dropdown, unchanged from 13.

## Backend

### Repository — `closure.repository.js`

| Function | Change |
|---|---|
| `CLOSURE_SELECT` / `mapClosure` | Add a lateral JSON aggregate `items` (mirrors 15's `observations` addition to this same query): one entry per `closure_items` row joined to its `observation_items` row and its **latest ticket** (`LEFT JOIN LATERAL … ORDER BY closure_round DESC LIMIT 1`, keyed by `closure_item_id` now instead of `closure_request_id`), shaped `{ id, sequenceNumber, observation: { areaName, category, description, riskCategory }, actionPlan, targetDate, actionHodId, actionHodName, ticket: { id, status, decision, closureDate } | null }`. |
| `findClosureItems(closureId, client)` | New: the same per-item shape as above, standalone, for the write path (`saveClosureItem` needs to re-derive status without re-running the whole `CLOSURE_SELECT`). |
| `saveActionPlan(...)` | Renamed `saveClosureItem({ closureId, closureItemId, auditeeId, actionPlan, targetDate, actionHodId }, client)`. `UPDATE closure_items SET action_plan=$1, target_date=$2, action_hod_id=$3, responsible_hod_name=$4 (looked up from the users table, same as today), action_plan_saved_at=NOW(), updated_at=NOW() WHERE id = $closureItemId AND closure_request_id = $closureId RETURNING *`, plus a row-lock (`FOR UPDATE`) on the parent `closure_requests` row first, guarded by ownership (`requested_by = auditeeId`) and by the closure not being past-editable (D8) checked in the service. |
| `syncClosureHeaderFromItemOne(closureId, client)` | New: `UPDATE closure_requests SET action_plan=(SELECT action_plan FROM closure_items WHERE closure_request_id=$1 AND sequence_number=1), target_date=…, responsible_hod_name=…, action_hod_id=…, action_plan_saved_at=… WHERE id=$1` (D2). Called after every `saveClosureItem`. |
| `updateClosureStatus(closureId, status, client)` | New: `UPDATE closure_requests SET status=$1, updated_at=NOW() WHERE id=$2`. Called by the service after computing `deriveClosureStatus`. Separate from the approval-path writes (`approveClosure`/`rejectClosure`/`applyReviewToPatrolAndReport`), which keep setting status themselves for the review transition. |
| `upsertTicketForClosureRound(...)` | Add `closureItemId` to the params and the `INSERT`/`ON CONFLICT (closure_item_id, closure_round)` target (was `closure_request_id, closure_round`). |
| `findActionHodsForClosure`, `findPlantNameForClosure` | Unchanged (still resolve from the closure's patrol/plant, independent of items). |

### Service — `closure.service.js`

- **`deriveClosureStatus(items)`** (pure function, D5): `items` = the array from `findClosureItems`/`CLOSURE_SELECT`.
  ```js
  function deriveClosureStatus(items) {
    // Any observation without a saved plan keeps the whole closure Open.
    if (items.some((item) => !item.actionPlan?.trim())) {
      return "OPEN";
    }

    // "The ticket is assigned to the relevant department" means the
    // department has accepted it (IN_PROGRESS) or already resolved it
    // (CLOSED). A ticket that is merely OPEN, or missing, is not yet
    // assigned work, so the closure is still Open.
    if (items.some((item) => !item.ticket || item.ticket.status === "OPEN")) {
      return "OPEN";
    }

    if (!items.every((item) => item.ticket.status === "CLOSED")) {
      return "IN_PROGRESS";
    }

    return "READY_FOR_SUBMISSION"; // sentinel; the caller maps it, see below
  }
  ```
  The caller (`recomputeClosureStatus`, below) never writes `"READY_FOR_SUBMISSION"` literally: when `deriveClosureStatus` returns it, the closure keeps its current status if that status is already `SUBMITTED_FOR_CLOSURE`/`APPROVED`/`REJECTED`, or is set to `IN_PROGRESS` (all tickets closed, still waiting on the auditee to click **Submit** — `canSubmitForClosure` turns `true`) otherwise. This keeps "every ticket closed" as a *submission-eligibility* signal rather than an auto-submit, matching D6.
- **`recomputeClosureStatus(closureId, client)`**: `findClosureItems` → `deriveClosureStatus` → map the sentinel per the rule above → `updateClosureStatus` (skip the write if unchanged). Called at the end of `saveClosureItem` and from the new ticket-outcome hook below.
- **`saveClosureItem({ userId, closureId, closureItemId, actionPlan, targetDate, actionHodId })`**: ownership + editability checks (D8: item's closure status not past `REEXAMINATION_REQUIRED`, item's own ticket not decided) inside one `withTransaction`, then `saveClosureItem` (repo) → `syncClosureHeaderFromItemOne` → `upsertTicketForClosureRound` for that item (same trigger rule as today, now keyed by `closureItemId`) → `recomputeClosureStatus`. Returns the refreshed closure via `getClosureById`.
- **`ticketDecided(closureId, client)` / `ticketClosed(closureId, client)`**: two tiny exported hooks that just call `recomputeClosureStatus(closureId, client)`, called from **`ticket.service.js`** at the end of `acceptTicket`, `rejectTicket` and `closeTicket` (those already run inside their own `withTransaction`; pass the existing `client` through so the recompute commits atomically with the ticket write). `ticket.service.js` needs `closure_request_id` off the ticket row, which it already reads.
- **`submitClosure`**: `hasCompleteActionPlan` check replaced by `existingClosure.status === "IN_PROGRESS" || (deriveClosureStatus-equivalent all-tickets-closed)` — concretely, reuse the freshly-computed status: reject with `INCOMPLETE_CLOSURE_REPORT` unless every item has a plan and every item's ticket is `CLOSED` (`canSubmitForClosure`, computed the same way in `createClosureResponse`, D9 below). Everything after that (the `SUBMITTED_FOR_CLOSURE` write, completion date) is unchanged.
- **`createClosureResponse(closure)`**: add `items: closure.items.map(...)` (pass through, each with its own `canEdit` per D8) and compute `canSubmitForClosure` from `items` (every plan present, every ticket `CLOSED`) instead of the old three-field check. `hasCompleteActionPlan`/`wasReturned`/`ticketDisplayStatus` stay as today, now describing item #1 for any caller still reading the flat fields (D2).
- **`getActionHodOptions`**: unchanged; called once per item by the frontend (D4), not once per closure.

### Ticket module — small, targeted changes

- `ticket.repository.js` `TICKET_SELECT`: add `ticket.closure_item_id`; `insertEvidence`/lookups unchanged.
- `ticket.service.js`: `acceptTicket`, `rejectTicket`, `closeTicket` each call `closureService.recomputeClosureStatus(ticket.closureRequestId, client)` immediately before their transaction commits (a new import; `closure.service.js` must not import `ticket.service.js` at module scope in a way that creates a cycle — it currently does the reverse (`closure.service.js` imports `ticket.service.js`), so `ticket.service.js` calling into `closure.service.js` **would** cycle. Break it by moving `recomputeClosureStatus` (and `deriveClosureStatus`) into a new tiny module `backend/src/modules/closures/closureStatus.js` with no dependency on either service, imported by both).

### Validator — `closure.validator.js`

- `saveActionPlanValidationRules` → `saveClosureItemValidationRules`: add `param("closureItemId").isInt({ min: 1 }).toInt()` alongside the existing `closureId` param and the existing `actionPlan`/`targetDate`/`actionHodId` body rules (unchanged).

### Routes — `closure.routes.js`

```js
router.patch(
  "/:closureId/items/:closureItemId/action-plan",
  authenticate,
  saveClosureItemValidationRules,
  validate,
  saveClosureItem,
);
```
Replaces the old `PATCH /:closureId/action-plan`. `GET /:closureId/action-hods` stays as is (still resolved from the closure's plant, reusable for any item).

### Access summary

Unchanged from 13/15: auditee (`requested_by`), the ticket's Action HOD, the patrol's EHS Officer, and plant management can read a closure; only the auditee who owns it may write an item; only management may approve/reject.

## Frontend

### Service — `frontend/src/features/closures/closure.service.js`

- `saveClosureItem({ closureId, closureItemId, actionPlan, targetDate, actionHodId })` → `PATCH /closures/:closureId/items/:closureItemId/action-plan`, replacing `saveClosureActionPlan`.
- `fetchActionHodOptions(closureId)` unchanged.

### Hook — `useClosures.js`

- `useClosureForm` becomes **`useClosureItemForm(item)`**, one instance per item (mirrors 15's `ObservationItemFields` split): owns that item's `actionPlan`/`targetDate`/`actionHodId`, validates, calls `saveClosureItem`, and is keyed by `item.id` so switching items does not carry stale state (same pattern 15 used keying the observation form by `assignment.id`).
- `useClosureDetail(closureId)`: unchanged shape, now `closure.items` carries everything; drop the old single `fetchActionHodOptions` call-once-per-closure pattern only if items need independently-loaded options — they do not, since HODs are plant-scoped, not item-scoped, so one shared `useActionHodOptions(closureId)` still serves every item's dropdown.

### Components

- **`ActionPlanForm.jsx`** → renders the closure header once (unchanged fields) and then one **`ActionPlanItemForm.jsx`** (new) per `closure.items[i]`, each showing that observation's summary (area, category, photograph, description, risk — reusing the per-item block 15's `ObservationSummary.jsx` already renders) directly above its own action-plan fields (plan text, target date, Action HOD `<select>`) and its own ticket status (`<TicketStatusCard ticket={item.ticket} />`, reused from `features/tickets`). Each item's fields are `disabled` once `item.canEdit` is false (D8), with a note explaining why ("A decision has already been recorded for this observation."). Submit button per item, not a single page-level submit (matches "the option to add another observation" pattern set by 15's form — items are independent units here too).
- **`ClosurePage.jsx`**: replace the single `<TicketStatusCard ticket={closure.ticket} />` with one per item (now rendered inside `ActionPlanItemForm`); the page-level **Submit for closure** button becomes enabled by the new `closure.canSubmitForClosure` (every item done), with its disabled-state hint text updated to "Every observation needs an accepted-or-rejected ticket before this closure can be submitted."
- **`ClosureList.jsx`**: the `ticket-chip` badge becomes a small per-closure summary, e.g. "3/3 tickets closed" alongside the existing status chip, computed from `closure.items`.
- **`ApprovalQueuePage.jsx`**: unchanged structurally; `ObservationSummary`/`TicketStatusCard` usage moves to per-item inside the same detail panel, matching `ClosurePage`.
- **`ObservationSummary.jsx`**: no change needed beyond what 15 already did — it already renders one block per observation when given `observations[]`; this plan's per-item action-plan blocks sit alongside it, not inside it.

### Styles

Append `.closure-item-card` (bordered block per observation, reusing `.closure-action-plan`'s look), `.closure-item-disabled-note`, `.closure-ticket-summary-chip`.

## Documentation to update in the same change

- `CLAUDE.md`: the closure step of the domain-workflow list (one action plan **per observation**, status derived from item/ticket state, `closure_items`/`action_tickets.closure_item_id`).
- [03-data-model.md](03-data-model.md): `closure_items`, `action_tickets.closure_item_id`, migration 014.
- [04-api-reference.md](04-api-reference.md): the new `PATCH /:closureId/items/:closureItemId/action-plan` route, the `items[]` shape on `<closure>`.
- [05-workflows.md](05-workflows.md): the per-observation plan → ticket → closed chain.
- [README.md](README.md): row 16.

## Implementation order

1. Migration 014 (after 013 is applied); confirm `\d closure_items` and that every existing closure has exactly as many `closure_items` rows as its report has `observation_items`, and every pre-existing ticket has a `closure_item_id`.
2. `closureStatus.js` (the new no-dependency module) + repository changes + `saveClosureItem`/`recomputeClosureStatus` in the service; verify with curl against a 2-observation report (checks 1–4).
3. Wire the ticket-service hooks (`acceptTicket`/`rejectTicket`/`closeTicket` → `recomputeClosureStatus`); verify the three-state transition end to end (checks 5–8).
4. `submitClosure` gating + `createClosureResponse` (`items`, `canSubmitForClosure`); routes/validator.
5. Frontend: service, `useClosureItemForm`, `ActionPlanItemForm`, `ActionPlanForm`/`ClosurePage` wiring, `ClosureList` chip, styles.
6. Docs.

## Acceptance checks

Run against the containers as the relevant role, on a report with 2 observations (via 15's multi-observation submission) unless stated.

| # | Check | Expected |
|---|---|---|
| 1 | `GET /api/closures/:id` right after the observation report is filed | `status "OPEN"`, `items.length === 2`, both `actionPlan: null` |
| 2 | Save observation 1's plan (`PATCH .../items/1/action-plan`) | 200; closure `status` still `"OPEN"` (item 2 still missing) |
| 3 | Save observation 2's plan with a different Action HOD (different department) | 200; each item now has its own ticket, `ticket.status "OPEN"`; closure `status` still `"OPEN"` (D5: an `OPEN` ticket is not yet "assigned") |
| 4 | Both items' Action HODs accept their tickets | closure `status` becomes `"IN_PROGRESS"`; `canSubmitForClosure` still `false` |
| 5 | Sign in as the auditee, `POST /:id/submit` at this point | 400 `INCOMPLETE_CLOSURE_REPORT` |
| 6 | Item 1's HOD closes their ticket (accepted); item 2's is still in progress | closure `status` stays `"IN_PROGRESS"` |
| 7 | Item 2's HOD closes their ticket (rejected) | closure `status` untouched by the ticket call directly, but `canSubmitForClosure` becomes `true` |
| 8 | Auditee `POST /:id/submit` | 200, `status "SUBMITTED_FOR_CLOSURE"` |
| 9 | EHS Officer `POST /:id/approve` | 200, `status "APPROVED"`; observation report `CLOSED`; patrol `COMPLETED` |
| 10 | EHS Officer `POST /:id/reject` instead, on a fresh closure at step 8 | `status "REEXAMINATION_REQUIRED"`; both items' `canEdit` becomes `true` again |
| 11 | Re-save an item's plan after rejection | opens a **new** ticket for that item (`closure_round` incremented), old ticket kept as history |
| 12 | Try to edit an item whose ticket is already `CLOSED` but the closure overall is still `IN_PROGRESS` (the other item not yet decided) | 409, "A decision has already been recorded for this observation." |
| 13 | `GET /api/tickets` as an Action HOD assigned to only observation 2 | sees exactly that item's ticket, with the right `observations`/area context, not observation 1's |
| 14 | Single-observation report (existing behaviour) | Closure page renders one `ActionPlanItemForm`, looks the same as today's single form |
| 15 | Dashboard officer week card and `ClosureList` | zone status / list chip reflect the derived closure status correctly at each stage above, no crashes reading `closure.actionPlan` (still populated from item #1) |
