# 5. Workflows and status machines

## End-to-end happy path

```mermaid
sequenceDiagram
    actor EHS as EHS Officer
    actor AUD as Auditor
    actor AEE as Auditee
    participant API
    participant DB

    EHS->>API: POST /api/patrols
    API->>DB: INSERT patrols (SCHEDULED)
    Note over AUD: Dashboard shows the patrol as this week's task (assignmentRole AUDITOR)
    AUD->>API: GET /api/observations/current-assignments
    AUD->>API: POST /api/observations (multipart photo)
    API->>DB: INSERT observation_reports (PENDING_AUDITEE_ACTION)
    API->>DB: INSERT closure_requests (OPEN, requested_by = auditee)
    API->>DB: UPDATE patrols → PENDING_AUDITEE_ACTION
    Note over AEE: Dashboard shows the patrol as this week's task (assignmentRole AUDITEE)
    AEE->>API: GET /api/closures/current
    AEE->>API: PATCH /api/closures/:id/action-plan
    API->>DB: UPDATE closure_requests → IN_PROGRESS
    AEE->>API: POST /api/closures/:id/submit
    API->>DB: closure → SUBMITTED_FOR_CLOSURE, patrol & report → PENDING_EHS_APPROVAL
    Note over EHS: ⟂ Not implemented: review queue, approve / reject / re-examine
    EHS-->>API: POST /api/closures/:id/approve (planned)
    API-->>DB: closure → APPROVED, report → CLOSED, patrol → COMPLETED (planned)
```

## Status machines (what the code actually does)

Legend: solid = implemented transition with its endpoint; dashed = value exists in the DB CHECK constraint but no code path sets it.

### `patrols.status`

```mermaid
stateDiagram-v2
    [*] --> SCHEDULED : POST /patrols
    SCHEDULED --> PENDING_AUDITEE_ACTION : POST /observations
    IN_PROGRESS --> PENDING_AUDITEE_ACTION : POST /observations (accepted, never set)
    PENDING_AUDITEE_ACTION --> PENDING_EHS_APPROVAL : POST /closures/:id/submit (unconditional by id)
    PENDING_EHS_APPROVAL --> COMPLETED : (planned) approve
    PENDING_EHS_APPROVAL --> REEXAMINATION_REQUIRED : (planned) reject / re-examine
    REEXAMINATION_REQUIRED --> PENDING_EHS_APPROVAL : (planned) resubmit
    SCHEDULED --> CANCELLED : (planned) cancel / edit
```

Never written today: `IN_PROGRESS`, `REEXAMINATION_REQUIRED`, `COMPLETED`, `CANCELLED`. Queries nevertheless filter on `CANCELLED` (dashboard, conflict check), and the conflict check also excludes `CLOSED`, which is not a legal patrol status (dead predicate).

### `observation_reports.status`

```mermaid
stateDiagram-v2
    [*] --> PENDING_AUDITEE_ACTION : POST /observations
    PENDING_AUDITEE_ACTION --> PENDING_EHS_APPROVAL : POST /closures/:id/submit
    PENDING_EHS_APPROVAL --> CLOSED : (planned) approve
    PENDING_EHS_APPROVAL --> REEXAMINATION_REQUIRED : (planned) reject
    REEXAMINATION_REQUIRED --> PENDING_EHS_APPROVAL : (planned) resubmit
```

`OPEN` is only the column default and is never inserted. The service's normaliser maps `COMPLETED`/`APPROVED` → `CLOSED`, but those values violate the CHECK constraint, so the branch is unreachable.

### `closure_requests.status`

```mermaid
stateDiagram-v2
    [*] --> OPEN : POST /observations (auto-created)
    OPEN --> IN_PROGRESS : PATCH action-plan
    IN_PROGRESS --> IN_PROGRESS : PATCH action-plan
    REEXAMINATION_REQUIRED --> IN_PROGRESS : PATCH action-plan
    IN_PROGRESS --> SUBMITTED_FOR_CLOSURE : POST submit (requires plan, target date, HOD)
    SUBMITTED_FOR_CLOSURE --> APPROVED : (planned) approve
    SUBMITTED_FOR_CLOSURE --> REEXAMINATION_REQUIRED : (planned) reject with comments
    SUBMITTED_FOR_CLOSURE --> REJECTED : (planned, or drop this value)
```

Never written: `APPROVED`, `REJECTED`, `REEXAMINATION_REQUIRED`. Migration 006 already added `reviewed_by`, `reviewed_at`, `review_comments`, `approval_iteration`, `approved_at` for this step.

## Who sees what, and when

| Step | Query that surfaces it | Condition |
|---|---|---|
| Auditor's task this week | `GET /dashboard` → `nextAudit` (USER); `GET /observations/current-assignments` | patrol in current ISO week, `auditor_id = me`, status SCHEDULED/IN_PROGRESS, no report yet |
| Auditee's task this week | `GET /dashboard` → `nextAudit` (USER) | patrol in current week, `auditee_id = me`, report status OPEN/PENDING_AUDITEE_ACTION/REEXAMINATION_REQUIRED, and no closure row with `requested_by = me` (note: the closure row *is* auto-created, so this shows "pending" only until the row exists, which is immediately, so in practice the auditee task relies on `hasOpenObservationReport`) |
| Auditee's current closure | `GET /closures/current` | `requested_by = me`, status OPEN/IN_PROGRESS/REEXAMINATION_REQUIRED/SUBMITTED_FOR_CLOSURE, highest priority first |
| EHS review queue | *(planned)* `GET /closures/pending-approvals` | status SUBMITTED_FOR_CLOSURE, ordered by `submitted_for_closure_at` (index exists) |
| Management week view | `GET /dashboard` → `nextWeek` | all non-cancelled patrols in the current week |

## Invariants the code relies on

- One observation report per patrol (unique `patrol_id`); one closure per report (unique `observation_report_id`).
- Closure rows are created by the **observation** module, not the closure module. `requested_by` means "assigned to (auditee)".
- Auditor ≠ auditee (DB CHECK). Auditor/auditee eligibility for planning is by role codes `AUDITOR`/`AUDITEE` (seed-only roles), but observation and closure access is by patrol membership, not role.
- "Today" is server-local in patrols/closures and UTC in the dashboard. Keep containers on one timezone (UTC) and treat this as a refinement item.
- The week window on the dashboard is always the real current week regardless of the `year`/`month` requested.
