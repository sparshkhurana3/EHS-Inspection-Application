BEGIN;

/*
 * One action plan per observation. A closure still exists 1:1 with its
 * observation report; what changes is that the plan, target date and
 * Action Team HOD now live per observation, because different
 * observations on the same audit often belong to different departments
 * (docs/16-closure-refinement-plan.md, D1).
 *
 * closure_requests keeps its own action_plan/target_date/
 * responsible_hod_name/action_hod_id columns, filled from item #1, so
 * every existing reader keeps working (D2).
 */
CREATE TABLE IF NOT EXISTS closure_items (
    id BIGSERIAL PRIMARY KEY,

    closure_request_id BIGINT NOT NULL
        REFERENCES closure_requests(id)
        ON DELETE CASCADE,

    observation_item_id BIGINT NOT NULL
        REFERENCES observation_items(id)
        ON DELETE CASCADE,

    sequence_number INTEGER NOT NULL,

    action_plan TEXT,
    target_date DATE,
    responsible_hod_name VARCHAR(255),

    action_hod_id BIGINT
        REFERENCES users(id),

    action_plan_saved_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT closure_items_closure_sequence_unique
        UNIQUE (closure_request_id, sequence_number),

    CONSTRAINT closure_items_observation_item_unique
        UNIQUE (observation_item_id)
);

CREATE INDEX IF NOT EXISTS
    closure_items_closure_index
ON closure_items (closure_request_id);

/*
 * One closure_items row per existing observation_items row. Item #1
 * inherits whatever plan the closure already carried, so a closure
 * mid-flight keeps its plan and its ticket.
 */
INSERT INTO closure_items (
    closure_request_id,
    observation_item_id,
    sequence_number,
    action_plan,
    target_date,
    responsible_hod_name,
    action_hod_id,
    action_plan_saved_at
)
SELECT
    cr.id,
    oi.id,
    oi.sequence_number,
    CASE WHEN oi.sequence_number = 1
        THEN cr.action_plan END,
    CASE WHEN oi.sequence_number = 1
        THEN cr.target_date END,
    CASE WHEN oi.sequence_number = 1
        THEN cr.responsible_hod_name END,
    CASE WHEN oi.sequence_number = 1
        THEN cr.action_hod_id END,
    CASE WHEN oi.sequence_number = 1
        THEN cr.action_plan_saved_at END
FROM closure_requests AS cr
JOIN observation_items AS oi
    ON oi.observation_report_id =
       cr.observation_report_id
WHERE NOT EXISTS (
    SELECT 1
    FROM closure_items AS ci
    WHERE ci.closure_request_id = cr.id
);

/*
 * One ticket per observation per approval round, replacing one ticket
 * per closure per round (D3). closure_request_id stays on the row so
 * the existing "every ticket for this closure" queries keep working.
 */
ALTER TABLE action_tickets
ADD COLUMN IF NOT EXISTS closure_item_id BIGINT
    REFERENCES closure_items(id)
    ON DELETE CASCADE;

UPDATE action_tickets AS t
SET closure_item_id = ci.id
FROM closure_items AS ci
WHERE ci.closure_request_id = t.closure_request_id
  AND ci.sequence_number = 1
  AND t.closure_item_id IS NULL;

ALTER TABLE action_tickets
DROP CONSTRAINT IF EXISTS
    action_tickets_closure_round_unique;

ALTER TABLE action_tickets
DROP CONSTRAINT IF EXISTS
    action_tickets_closure_item_round_unique;

ALTER TABLE action_tickets
ADD CONSTRAINT
    action_tickets_closure_item_round_unique
UNIQUE (closure_item_id, closure_round);

CREATE INDEX IF NOT EXISTS
    action_tickets_closure_item_index
ON action_tickets (closure_item_id);

COMMIT;
