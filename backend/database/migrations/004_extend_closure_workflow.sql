BEGIN;

ALTER TABLE closure_requests
ADD COLUMN IF NOT EXISTS responsible_hod_name VARCHAR(255);

ALTER TABLE closure_requests
ADD COLUMN IF NOT EXISTS target_date DATE;

ALTER TABLE closure_requests
ADD COLUMN IF NOT EXISTS completion_date DATE;

ALTER TABLE closure_requests
ADD COLUMN IF NOT EXISTS action_plan_saved_at TIMESTAMPTZ;

ALTER TABLE closure_requests
ADD COLUMN IF NOT EXISTS submitted_for_closure_at TIMESTAMPTZ;

ALTER TABLE closure_requests
ALTER COLUMN action_plan DROP NOT NULL;


/*
 * Remove the previous status constraint before normalizing
 * existing status values.
 */
ALTER TABLE closure_requests
DROP CONSTRAINT IF EXISTS closure_request_status_check;


/*
 * Migrate previous REQUESTED records.
 *
 * A record with an existing action plan has already been
 * worked on and therefore becomes IN_PROGRESS.
 *
 * A record without an action plan is a newly assigned
 * closure and therefore becomes OPEN.
 */
UPDATE closure_requests
SET
    status = CASE
        WHEN action_plan IS NOT NULL
         AND BTRIM(action_plan) <> ''
        THEN 'IN_PROGRESS'

        ELSE 'OPEN'
    END,

    action_plan_saved_at = CASE
        WHEN action_plan IS NOT NULL
         AND BTRIM(action_plan) <> ''
        THEN COALESCE(
            action_plan_saved_at,
            updated_at,
            requested_at,
            NOW()
        )

        ELSE action_plan_saved_at
    END,

    updated_at = NOW()
WHERE status = 'REQUESTED';


/*
 * Map any previous completed status to the new approved
 * closure status.
 */
UPDATE closure_requests
SET
    status = 'APPROVED',

    completion_date = COALESCE(
        completion_date,
        closed_at::DATE,
        reviewed_at::DATE,
        CURRENT_DATE
    ),

    submitted_for_closure_at = COALESCE(
        submitted_for_closure_at,
        reviewed_at,
        closed_at,
        updated_at,
        NOW()
    ),

    updated_at = NOW()
WHERE status IN (
    'CLOSED',
    'COMPLETED'
);


/*
 * Map previous pending approval values to the new submitted
 * state if such rows already exist.
 */
UPDATE closure_requests
SET
    status = 'SUBMITTED_FOR_CLOSURE',

    completion_date = COALESCE(
        completion_date,
        updated_at::DATE,
        CURRENT_DATE
    ),

    submitted_for_closure_at = COALESCE(
        submitted_for_closure_at,
        updated_at,
        NOW()
    ),

    updated_at = NOW()
WHERE status = 'PENDING_EHS_APPROVAL';


/*
 * Stop the migration with a clear message if an unexpected
 * legacy status still exists.
 */
DO $$
DECLARE
    invalid_statuses TEXT;
BEGIN
    SELECT STRING_AGG(
        DISTINCT status,
        ', '
        ORDER BY status
    )
    INTO invalid_statuses
    FROM closure_requests
    WHERE status NOT IN (
        'OPEN',
        'IN_PROGRESS',
        'SUBMITTED_FOR_CLOSURE',
        'APPROVED',
        'REJECTED',
        'REEXAMINATION_REQUIRED'
    );

    IF invalid_statuses IS NOT NULL THEN
        RAISE EXCEPTION
            'Unsupported closure request statuses remain: %',
            invalid_statuses;
    END IF;
END
$$;


/*
 * Add the new workflow constraint only after all existing
 * records have been normalized.
 */
ALTER TABLE closure_requests
ADD CONSTRAINT closure_request_status_check
CHECK (
    status IN (
        'OPEN',
        'IN_PROGRESS',
        'SUBMITTED_FOR_CLOSURE',
        'APPROVED',
        'REJECTED',
        'REEXAMINATION_REQUIRED'
    )
);


/*
 * One observation report should produce only one closure
 * assignment.
 */
CREATE UNIQUE INDEX IF NOT EXISTS
    closure_requests_observation_report_unique
ON closure_requests (
    observation_report_id
);

CREATE INDEX IF NOT EXISTS
    closure_requests_auditee_status_index
ON closure_requests (
    requested_by,
    status
);

CREATE INDEX IF NOT EXISTS
    closure_requests_target_date_index
ON closure_requests (
    target_date
);

COMMIT;