BEGIN;

/*
 * Store the latest EHS Officer review decision.
 */
ALTER TABLE closure_requests
ADD COLUMN IF NOT EXISTS
    review_comments VARCHAR(1000);

ALTER TABLE closure_requests
ADD COLUMN IF NOT EXISTS
    reviewed_by BIGINT;

ALTER TABLE closure_requests
ADD COLUMN IF NOT EXISTS
    reviewed_at TIMESTAMPTZ;

ALTER TABLE closure_requests
ADD COLUMN IF NOT EXISTS
    approval_iteration INTEGER
    NOT NULL DEFAULT 0;

ALTER TABLE closure_requests
ADD COLUMN IF NOT EXISTS
    submitted_for_closure_at TIMESTAMPTZ;

ALTER TABLE closure_requests
ADD COLUMN IF NOT EXISTS
    approved_at TIMESTAMPTZ;


/*
 * Add the reviewer foreign key without duplicating it.
 */
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid =
              'closure_requests'::regclass
          AND conname =
              'closure_requests_reviewed_by_fkey'
    ) THEN
        ALTER TABLE closure_requests
        ADD CONSTRAINT
            closure_requests_reviewed_by_fkey
        FOREIGN KEY (reviewed_by)
        REFERENCES users (id);
    END IF;
END
$$;


/*
 * Improve pending-approval lookup performance.
 */
CREATE INDEX IF NOT EXISTS
    closure_requests_status_index
ON closure_requests (
    status
);

CREATE INDEX IF NOT EXISTS
    closure_requests_reviewed_by_index
ON closure_requests (
    reviewed_by
);

CREATE INDEX IF NOT EXISTS
    closure_requests_submitted_at_index
ON closure_requests (
    submitted_for_closure_at
);

CREATE INDEX IF NOT EXISTS
    closure_requests_approval_queue_index
ON closure_requests (
    status,
    submitted_for_closure_at
);


/*
 * Support EHS Officer-specific approval queues.
 */
CREATE INDEX IF NOT EXISTS
    patrols_ehs_officer_id_index
ON patrols (
    ehs_officer_id
);

COMMIT;