BEGIN;

/*
 * The Action Team HOD role. Distinct from the existing HOD role, which
 * is a management role with a plant-wide dashboard. An Action Team HOD
 * account holds only this role, never USER, so the ordinary pages stay
 * gated shut for them and the Ticket page stays gated shut for
 * everyone else.
 */
INSERT INTO roles (code, name)
VALUES ('ACTION_HOD', 'Action Team HOD')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name;


/*
 * Which registered user a closure's action plan was assigned to.
 * closure_requests.responsible_hod_name keeps being filled (with this
 * user's full_name) so every existing query, response field and
 * display keeps working unchanged; this column records *which* user it
 * is so the ticket can be addressed to them.
 */
ALTER TABLE closure_requests
ADD COLUMN IF NOT EXISTS action_hod_id BIGINT
    REFERENCES users(id);

CREATE INDEX IF NOT EXISTS
    closure_requests_action_hod_index
ON closure_requests (action_hod_id);


/*
 * The corrective-action type list. Site-specific and open-ended ("...
 * etc"), so it is data loaded into the table rather than a hardcoded
 * list, the same rule as locations (R12).
 */
CREATE TABLE IF NOT EXISTS corrective_action_types (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO corrective_action_types (code, name, display_order) VALUES
    ('ELECTRICAL_WORK',        'Electrical work',            10),
    ('MECHANICAL_MAINTENANCE', 'Mechanical maintenance',     20),
    ('CIVIL_WORK',             'Civil work',                 30),
    ('UTILITY_WORK',           'Utility work',               40),
    ('CLEANING_HOUSEKEEPING',  'Cleaning / housekeeping',    50),
    ('SIGNAGE_MARKING',        'Signage and floor marking',  60),
    ('PPE_ISSUE',              'PPE issue',                  70),
    ('TRAINING_AWARENESS',     'Training / awareness',       80),
    ('OTHER',                  'Other',                      90)
ON CONFLICT (code) DO NOTHING;


/*
 * One ticket per closure per approval round. When the auditee saves the
 * action plan, a ticket is opened (or, while still OPEN, refreshed)
 * addressed to the chosen Action Team HOD. closure_round is the
 * closure's approval_iteration at the moment the ticket was created, so
 * a rejected-and-resubmitted plan opens a fresh ticket while the
 * earlier one is kept as history.
 *
 * The ticket never moves the closure, the observation report or the
 * patrol; it is a parallel record the HOD works independently.
 */
CREATE TABLE IF NOT EXISTS action_tickets (
    id BIGSERIAL PRIMARY KEY,

    closure_request_id BIGINT NOT NULL
        REFERENCES closure_requests(id)
        ON DELETE CASCADE,

    observation_report_id BIGINT NOT NULL
        REFERENCES observation_reports(id)
        ON DELETE CASCADE,

    patrol_id BIGINT NOT NULL
        REFERENCES patrols(id)
        ON DELETE CASCADE,

    closure_round INTEGER NOT NULL DEFAULT 0,

    action_hod_id BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE RESTRICT,

    assigned_by BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE RESTRICT,

    /*
     * A snapshot of the closure at assignment time. Once the HOD has
     * acted (status is no longer OPEN) these no longer change, because
     * the HOD's decision refers to this fixed text.
     */
    action_hod_name VARCHAR(150) NOT NULL,
    proposed_action_plan TEXT NOT NULL,
    target_date DATE NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    decision VARCHAR(20),
    comments VARCHAR(1000),
    corrective_action_type_id BIGINT
        REFERENCES corrective_action_types(id),
    completion_notes VARCHAR(1000),

    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    closure_date DATE,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT action_tickets_status_check
        CHECK (
            status IN (
                'OPEN',
                'IN_PROGRESS',
                'CLOSED'
            )
        ),

    CONSTRAINT action_tickets_decision_check
        CHECK (
            decision IS NULL
            OR decision IN (
                'ACCEPTED',
                'REJECTED'
            )
        ),

    /*
     * The three statuses each carry a fixed shape: OPEN has no decision
     * and no closure date, IN_PROGRESS is an accepted decision still
     * without a closure date, CLOSED always has both.
     */
    CONSTRAINT action_tickets_state_consistency_check
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
                status = 'CLOSED'
                AND decision IS NOT NULL
                AND closure_date IS NOT NULL
            )
        ),

    CONSTRAINT action_tickets_closure_round_unique
        UNIQUE (closure_request_id, closure_round)
);

CREATE INDEX IF NOT EXISTS
    action_tickets_hod_status_index
ON action_tickets (action_hod_id, status);

CREATE INDEX IF NOT EXISTS
    action_tickets_hod_closed_index
ON action_tickets (action_hod_id, closure_date DESC)
WHERE status = 'CLOSED';


/*
 * Up to 3 evidence photographs per ticket, enforced in the service
 * inside a transaction (lock the ticket row, then count) rather than by
 * a constraint here.
 */
CREATE TABLE IF NOT EXISTS action_ticket_evidence (
    id BIGSERIAL PRIMARY KEY,

    ticket_id BIGINT NOT NULL
        REFERENCES action_tickets(id)
        ON DELETE CASCADE,

    file_path TEXT NOT NULL,
    original_name TEXT,
    mime_type VARCHAR(100),
    size BIGINT,

    uploaded_by BIGINT NOT NULL
        REFERENCES users(id),

    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS
    action_ticket_evidence_ticket_index
ON action_ticket_evidence (ticket_id);

COMMIT;
