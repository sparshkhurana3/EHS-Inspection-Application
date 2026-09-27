# Removing the ticket system

**Status: implemented.** The action-ticket layer and the `ACTION_HOD`
role are gone. The auditee now carries out the corrective action
themselves and evidences it on the closure, and the EHS Officer's
approval of that closure is what ends the inspection.

## The workflow now

```
EHS Officer schedules a patrol
        │
        ▼
Auditor files by Thursday
        ├── no observation to record ──────────────► patrol COMPLETED
        │
        └── observation report (1-10 observations)
                    │
                    ▼
            Auditee writes one action plan per observation,
            optionally attaching up to 3 photographs each
                    │
                    ▼
            Submits to the EHS Officer
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
    approved                sent back
  patrol COMPLETED     REEXAMINATION_REQUIRED
   report CLOSED        (auditee reworks it)
```

Two steps disappeared from the middle: assigning an observation to a
department, and that department's Action Team HOD accepting, rejecting
and evidencing a ticket.

## Decisions

Settled with the product owner before any code was written:

1. **Evidence attaches per observation**, up to three photographs each,
   not three per closure. Each observation already has its own action
   plan, so its proof belongs with it, and on a ten-observation report
   the officer can otherwise not tell which finding a photograph
   evidences.
2. **The ticket tables were dropped**, not archived. The rows present
   were test data from building the feature.
3. **`ACTION_HOD` and `departments` were removed entirely.** Both
   existed only to route tickets. The two accounts holding the role
   became ordinary `USER`s so they keep working as auditors and
   auditees.
4. **Evidence is optional.** The requirement was the *ability* to
   attach up to three photographs, with no lower bound stated, so
   nothing blocks a submission that has none. It is the officer's
   approval that decides whether what was attached was enough. Making
   it mandatory would be a one-line change in `closureStatus.js` plus
   the matching check in `submitClosure`.

## Status machine

`closure_requests.status` is still derived, but from the observations
alone (`closures/closureStatus.js`):

| Status | Means |
|---|---|
| `OPEN` | at least one observation has no action plan (a closure with no observations at all is `OPEN` too) |
| `IN_PROGRESS` | every observation has a plan; the auditee may submit |
| `SUBMITTED_FOR_CLOSURE` | with the EHS Officer |
| `APPROVED` | officer approved; patrol `COMPLETED`, report `CLOSED` |
| `REEXAMINATION_REQUIRED` | sent back; `approval_iteration` advances and the auditee reworks it |

Evidence does not enter the derivation. An observation's plan and its
evidence are editable for exactly as long as the closure is — nothing
freezes one observation while the rest stay open, because there is no
longer a department decision to freeze it against.

## Schema (migration 018)

Dropped: `action_tickets`, `action_ticket_evidence`, `departments`,
`users.department_id`, `closure_items.department_id`,
`closure_items.action_hod_id`, `closure_items.responsible_hod_name`,
`closure_requests.action_hod_id`,
`closure_requests.responsible_hod_name`, and the `ACTION_HOD` row in
`roles`.

Added: `closure_item_evidence` (`closure_item_id`, `file_path`,
`original_name`, `mime_type`, `size`, `uploaded_by`, `uploaded_at`).

`target_date` survives on both closure tables: "by when" is part of an
action plan whoever carries it out.

The migration also **restates every in-flight closure's status** under
the new rule, because the old reading was derived from ticket outcomes
that no longer exist. Closures the officer already owns — submitted,
approved, rejected — are left untouched.

## Endpoints

Gone: the whole `/api/tickets` module.

New, all on the closure:

| Endpoint | Who |
|---|---|
| `POST /api/closures/:closureId/items/:closureItemId/evidence` | auditee, while the closure is editable |
| `DELETE /api/closures/:closureId/items/:closureItemId/evidence/:evidenceId` | auditee, while the closure is editable |
| `GET /api/closures/:closureId/items/:closureItemId/evidence/:evidenceId` | anyone who may read the closure |

`PATCH /:closureId/items/:closureItemId/action-plan` no longer takes
`departmentId`, and `GET /:closureId/departments` is gone.

## Uploads

`closures/closureUpload.js` replaces `tickets/ticketUpload.js`: same
limits (JPEG/PNG/SVG, 10 MB each) but written to
`backend/uploads/closures/` and capped at three **per observation**.

The three-per-observation check runs inside the transaction against a
locked count, so two uploads arriving together cannot between them
exceed the limit. Multer writes files before the handler runs, so every
path that does not end in a committed row deletes them again; on
delete the row goes first and the file only after the commit, because a
missing file behind a surviving row would be a broken image.

Files are served through an authenticated route that applies the
**closure's** read rules, and the resolved path is checked to sit
inside the upload directory before anything is sent.

## Verified

Driven end to end against the running stack, and in a real browser:

- action plan saved with no department field; closure moved `OPEN` →
  `IN_PROGRESS` once all ten observations were planned
- evidence attached, listed, fetched and deleted; the officer sees it
  read-only with no Remove or Attach controls
- 🔍 a fourth photograph refused (`TOO_MANY_EVIDENCE_IMAGES`), a
  non-image refused (`UNSUPPORTED_EVIDENCE_IMAGE`), an unauthenticated
  fetch refused (401), and an attach after submission refused
  (`CLOSURE_ACTION_PLAN_LOCKED`)
- rejected and deleted uploads left no orphan files on disk
- submit → approve moved the patrol to `COMPLETED` and the report to
  `CLOSED`; the six-month history's "closed" filter now follows
  no-observation reports and approved closures
- `/api/tickets` returns 404 and the Ticket link is gone from the
  sidebar

## Known limitations

- **`docs/13` and `docs/17` were deleted** with the feature they
  described. `docs/16-closure-refinement-plan.md` still describes the
  ticket-driven closure it shipped with and is kept as history; this
  document supersedes its status machine.
- **Nothing notifies anybody.** Auditors and auditees find their work
  on the dashboard when they sign in. Email or in-app notification was
  considered and deliberately left out of this change.
- **A closure sent back keeps its evidence.** The action plan text
  survives a send-back, so its photographs do too; the auditee removes
  and replaces what they want. Nothing clears the previous round.
