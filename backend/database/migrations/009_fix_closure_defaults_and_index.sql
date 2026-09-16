BEGIN;

/*
 * Migration 004 replaced the closure status CHECK constraint but left
 * the column default at 'REQUESTED', a value that constraint no longer
 * accepts. Any INSERT that omits status therefore fails with a check
 * violation.
 *
 * Nothing is broken today only because the observation service always
 * sets the status explicitly when it opens a closure for the auditee.
 * The default is a trap for the next caller that does not.
 *
 * 'OPEN' is the correct initial state: a closure exists as soon as the
 * auditor files the observation, before the auditee has done anything.
 */
ALTER TABLE closure_requests
ALTER COLUMN status SET DEFAULT 'OPEN';


/*
 * The Closure page lists closures completed in the last week, where
 * completed means approved by an EHS Officer. Partial on the approved
 * status, because that query never scans any other row.
 */
CREATE INDEX IF NOT EXISTS
    closure_requests_auditee_approved_index
ON closure_requests (
    requested_by,
    approved_at DESC
)
WHERE status = 'APPROVED';

COMMIT;
