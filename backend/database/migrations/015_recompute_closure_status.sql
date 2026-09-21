BEGIN;

/*
 * A closure's status is now derived from its observations and their
 * tickets (docs/16-closure-refinement-plan.md, D5), and is rewritten
 * whenever an action plan is saved or a ticket is decided or closed.
 * A closure migrated by 014 holds whatever status it had under the
 * one-plan-per-closure rule until its next write, which would read as
 * "In Progress" while an observation still has no plan.
 *
 * This is the one-time correction. Only OPEN/IN_PROGRESS rows are
 * touched: anything with the EHS Officer, approved or rejected belongs
 * to the review loop and is not derived.
 */
WITH item_state AS (
    SELECT
        closure_item.closure_request_id,

        BTRIM(
            COALESCE(closure_item.action_plan, '')
        ) <> '' AS has_plan,

        latest_ticket.status AS ticket_status

    FROM closure_items AS closure_item

    LEFT JOIN LATERAL (
        SELECT ticket.status
        FROM action_tickets AS ticket
        WHERE ticket.closure_item_id = closure_item.id
        ORDER BY ticket.closure_round DESC
        LIMIT 1
    ) AS latest_ticket ON TRUE
),

closure_state AS (
    SELECT
        closure_request_id,

        BOOL_AND(has_plan) AS every_plan,

        BOOL_AND(
            ticket_status IS NOT NULL
            AND ticket_status <> 'OPEN'
        ) AS every_ticket_taken_up

    FROM item_state
    GROUP BY closure_request_id
)

UPDATE closure_requests AS closure_request
SET
    status = CASE
        WHEN closure_state.every_plan
         AND closure_state.every_ticket_taken_up
        THEN 'IN_PROGRESS'
        ELSE 'OPEN'
    END,
    updated_at = NOW()

FROM closure_state

WHERE
    closure_state.closure_request_id =
        closure_request.id
    AND closure_request.status IN (
        'OPEN', 'IN_PROGRESS'
    )
    AND closure_request.status <> (
        CASE
            WHEN closure_state.every_plan
             AND closure_state.every_ticket_taken_up
            THEN 'IN_PROGRESS'
            ELSE 'OPEN'
        END
    );

COMMIT;
