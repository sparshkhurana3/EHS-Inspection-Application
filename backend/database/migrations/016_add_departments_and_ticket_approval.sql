BEGIN;

/*
 * Departments are master data, loaded at production cutover like the
 * location hierarchy, never a hardcoded list (R12). An Action Team HOD
 * belongs to one department; the auditee assigns an observation's plan
 * to a department and the ticket opens for that department's HOD
 * (docs/17-ticket-refinement-plan.md, D1).
 */
CREATE TABLE IF NOT EXISTS departments (
    id BIGSERIAL PRIMARY KEY,

    plant_id BIGINT NOT NULL
        REFERENCES plants(id)
        ON DELETE RESTRICT,

    name VARCHAR(150) NOT NULL,
    code VARCHAR(50) NOT NULL,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT departments_plant_code_unique
        UNIQUE (plant_id, code)
);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS department_id BIGINT
    REFERENCES departments(id);

CREATE INDEX IF NOT EXISTS
    users_department_index
ON users (department_id)
WHERE is_active;

ALTER TABLE closure_items
ADD COLUMN IF NOT EXISTS department_id BIGINT
    REFERENCES departments(id);

/*
 * The ticket now ends with the EHS Officer, not the HOD: both a
 * rejection and a completed resolution go to PENDING_APPROVAL, and the
 * officer either closes the ticket or reopens it, clearing what the HOD
 * attached (D3-D6).
 */
ALTER TABLE action_tickets
ADD COLUMN IF NOT EXISTS department_id BIGINT
    REFERENCES departments(id);

ALTER TABLE action_tickets
ADD COLUMN IF NOT EXISTS submitted_for_approval_at TIMESTAMPTZ;

ALTER TABLE action_tickets
ADD COLUMN IF NOT EXISTS approved_by BIGINT
    REFERENCES users(id);

ALTER TABLE action_tickets
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE action_tickets
ADD COLUMN IF NOT EXISTS approval_comments VARCHAR(1000);

ALTER TABLE action_tickets
ADD COLUMN IF NOT EXISTS reopen_comments VARCHAR(1000);

ALTER TABLE action_tickets
ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ;

ALTER TABLE action_tickets
ADD COLUMN IF NOT EXISTS reopen_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE action_tickets
DROP CONSTRAINT IF EXISTS action_tickets_status_check;

ALTER TABLE action_tickets
ADD CONSTRAINT action_tickets_status_check
CHECK (
    status IN (
        'OPEN',
        'IN_PROGRESS',
        'PENDING_APPROVAL',
        'CLOSED'
    )
);

ALTER TABLE action_tickets
DROP CONSTRAINT IF EXISTS
    action_tickets_state_consistency_check;

ALTER TABLE action_tickets
ADD CONSTRAINT action_tickets_state_consistency_check
CHECK (
    (
        status = 'OPEN'
        AND decision IS NULL
        AND closure_date IS NULL
    )
    OR (
        status = 'IN_PROGRESS'
        AND decision = 'ACCEPTED'
        AND closure_date IS NULL
    )
    OR (
        status = 'PENDING_APPROVAL'
        AND decision IS NOT NULL
        AND closure_date IS NULL
    )
    OR (
        status = 'CLOSED'
        AND decision IS NOT NULL
        AND closure_date IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS
    action_tickets_pending_approval_index
ON action_tickets (submitted_for_approval_at)
WHERE status = 'PENDING_APPROVAL';

CREATE INDEX IF NOT EXISTS
    action_tickets_hod_assigned_index
ON action_tickets (action_hod_id, assigned_at DESC);

COMMIT;
