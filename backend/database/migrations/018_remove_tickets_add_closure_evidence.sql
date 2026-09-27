/*
 * Removes the action-ticket system and makes the auditee's closure the
 * end of the workflow.
 *
 * The chain used to be: auditee writes an action plan per observation,
 * assigns it to a department, that department's Action Team HOD works a
 * ticket, and the EHS Officer approves every ticket and then the
 * closure. The auditee is now responsible for carrying out the action
 * themselves, so the middle two steps and everything that served them
 * disappear:
 *
 *   observation report -> closure (plan + evidence per observation)
 *                      -> EHS Officer approves or reopens -> done
 *
 * What goes: action_tickets and their evidence, the departments they
 * were routed to, the ACTION_HOD role that worked them, and the columns
 * on closure_requests and closure_items that named the responsible
 * department or HOD.
 *
 * What arrives: closure_item_evidence, up to three photographs per
 * observation proving the action was carried out.
 *
 * Idempotent, like every migration in this folder.
 */

/* ---------------------------------------------------------------- *
 * 1. Evidence of closure, attached per observation
 * ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS closure_item_evidence (
  id BIGSERIAL PRIMARY KEY,

  closure_item_id BIGINT NOT NULL
    REFERENCES closure_items (id) ON DELETE CASCADE,

  file_path TEXT NOT NULL,
  original_name TEXT,
  mime_type VARCHAR(100),
  size BIGINT,

  uploaded_by BIGINT NOT NULL REFERENCES users (id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE closure_item_evidence IS
  'Photographs the auditee attaches to one observation''s action plan as evidence the action was carried out. At most three per closure item, enforced in the service.';

CREATE INDEX IF NOT EXISTS closure_item_evidence_item_index
  ON closure_item_evidence (closure_item_id);

/* ---------------------------------------------------------------- *
 * 2. The ticket tables
 *
 * Evidence first: its foreign key would otherwise block the drop.
 * The files these rows point at are removed separately, outside the
 * database.
 * ---------------------------------------------------------------- */

DROP TABLE IF EXISTS action_ticket_evidence;
DROP TABLE IF EXISTS action_tickets;

/* ---------------------------------------------------------------- *
 * 3. Columns that only existed to route work to a department
 * ---------------------------------------------------------------- */

ALTER TABLE closure_items
  DROP COLUMN IF EXISTS department_id,
  DROP COLUMN IF EXISTS action_hod_id,
  DROP COLUMN IF EXISTS responsible_hod_name;

ALTER TABLE closure_requests
  DROP COLUMN IF EXISTS action_hod_id,
  DROP COLUMN IF EXISTS responsible_hod_name;

/*
 * target_date survives on both: "by when" is part of an action plan
 * whoever carries it out.
 */

/* ---------------------------------------------------------------- *
 * 4. The ACTION_HOD role
 *
 * Anyone holding it becomes an ordinary USER, so they keep working as
 * an auditor or auditee instead of losing access. USER is granted
 * before ACTION_HOD is taken away, so nobody is left with no role.
 * ---------------------------------------------------------------- */

INSERT INTO user_roles (user_id, role_id)
SELECT
  ur.user_id,
  (SELECT id FROM roles WHERE code = 'USER')
FROM user_roles ur
JOIN roles r ON r.id = ur.role_id
WHERE r.code = 'ACTION_HOD'
  AND EXISTS (SELECT 1 FROM roles WHERE code = 'USER')
ON CONFLICT (user_id, role_id) DO NOTHING;

DELETE FROM user_roles
WHERE role_id IN (
  SELECT id FROM roles WHERE code = 'ACTION_HOD'
);

DELETE FROM roles WHERE code = 'ACTION_HOD';

/* ---------------------------------------------------------------- *
 * 5. Departments
 * ---------------------------------------------------------------- */

ALTER TABLE users
  DROP COLUMN IF EXISTS department_id;

DROP TABLE IF EXISTS departments;

/* ---------------------------------------------------------------- *
 * 6. Restate every closure's status under the new rules
 *
 * The old status was derived from ticket outcomes, which no longer
 * exist, so any closure still in flight would be stuck on a reading
 * that can never be recomputed. The new rule is simply:
 *
 *   OPEN         an observation still has no action plan
 *   IN_PROGRESS  every observation has one; the auditee may submit
 *
 * Closures the EHS Officer already owns - submitted, approved,
 * rejected, awaiting re-examination - are left exactly as they are.
 * ---------------------------------------------------------------- */

UPDATE closure_requests AS closure
SET
  status = plan_state.derived_status,
  updated_at = NOW()
FROM (
  SELECT
    item.closure_request_id AS closure_id,

    CASE
      WHEN BOOL_AND(
        COALESCE(TRIM(item.action_plan), '') <> ''
      )
      THEN 'IN_PROGRESS'
      ELSE 'OPEN'
    END AS derived_status

  FROM closure_items AS item
  GROUP BY item.closure_request_id
) AS plan_state

WHERE closure.id = plan_state.closure_id
  AND closure.status IN ('OPEN', 'IN_PROGRESS')
  AND closure.status <> plan_state.derived_status;

/* A closure whose report has no items at all is OPEN by definition. */
UPDATE closure_requests AS closure
SET
  status = 'OPEN',
  updated_at = NOW()
WHERE closure.status = 'IN_PROGRESS'
  AND NOT EXISTS (
    SELECT 1
    FROM closure_items AS item
    WHERE item.closure_request_id = closure.id
  );
