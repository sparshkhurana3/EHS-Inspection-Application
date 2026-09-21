import {
  databasePool,
} from "../../config/database.js";

function mapClosure(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.closure_id,
    status: row.closure_status,

    observationReportId:
      row.observation_report_id,

    reportNumber:
      row.report_number,

    patrolId:
      row.patrol_id,

    weekNumber:
      row.week_number
        ? Number(row.week_number)
        : null,

    scheduledDate:
      row.scheduled_date,

    unitNumber:
      row.unit_number ??
      row.unit_name,

    unitName:
      row.unit_name,

    zoneNumber:
      row.zone_number ??
      row.zone_name,

    zoneName:
      row.zone_name,

    plantLocation:
      row.plant_location,

    observationLocation:
      row.observation_location ??
      row.area_detail,

    auditorName:
      row.auditor_name,

    auditeeName:
      row.auditee_name,

    ehsOfficerName:
      row.ehs_officer_name,

    findingDate:
      row.finding_date,

    category:
      row.category,

    photographPath:
      row.photograph_path,

    photographOriginalName:
      row.photograph_original_name,

    observationDescription:
      row.observation_description,

    riskCategory:
      row.risk_category,

    observationSubmittedAt:
      row.observation_submitted_at,

    actionPlan:
      row.action_plan,

    targetDate:
      row.target_date,

    responsibleHodName:
      row.responsible_hod_name,

    /*
     * Which registered user the plan is assigned to, and the ticket
     * opened for them. Both nullable: a closure whose plan has never
     * been saved has neither, and a closure saved before this feature
     * shipped has a name but no id or ticket.
     */
    actionHodId:
      row.action_hod_id ?? null,

    actionHodName:
      row.action_hod_name ?? null,

    ticketId:
      row.ticket_id ?? null,

    ticketStatus:
      row.ticket_status ?? null,

    ticketDecision:
      row.ticket_decision ?? null,

    ticketClosureDate:
      row.ticket_closure_date ?? null,

    completionDate:
      row.completion_date,

    actionPlanSavedAt:
      row.action_plan_saved_at,

    submittedForClosureAt:
      row.submitted_for_closure_at,

    closedAt:
      row.closed_at,

    requestedAt:
      row.requested_at,

    approvedAt:
      row.approved_at,

    approvalIteration:
      Number(row.approval_iteration ?? 0),

    reviewComments:
      row.review_comments,

    reviewedAt:
      row.reviewed_at,

    reviewedByName:
      row.reviewed_by_name,

    /*
     * The area of the zone the finding was in, named by the auditor on
     * the observation report.
     */
    zoneAreaId:
      row.zone_area_id ?? null,

    areaName:
      row.area_name ?? null,

    noObservations:
      row.no_observations ?? false,

    /*
     * Every observation on the report (docs/15-observations-
     * refinement-plan.md, D2); the fields above stay filled with
     * observation #1 so this addition does not change anything that
     * already reads them.
     */
    observations:
      row.observations ?? [],

    /*
     * One action plan per observation (docs/16, D1). The flat
     * actionPlan/targetDate/actionHodName fields above mirror item #1.
     */
    items: row.items ?? [],
  };
}

const CLOSURE_SELECT = `
  WITH zone_patrol_sequence AS (
    SELECT
      patrol.id,

      ROW_NUMBER() OVER (
        PARTITION BY patrol.zone_id
        ORDER BY
          patrol.scheduled_date,
          patrol.id
      ) AS week_number

    FROM patrols AS patrol
    WHERE patrol.status <> 'CANCELLED'
  )

  SELECT
    closure_request.id
      AS closure_id,

    closure_request.status
      AS closure_status,

    closure_request.requested_at,
    closure_request.action_plan,
    closure_request.target_date,
    closure_request.responsible_hod_name,
    closure_request.action_hod_id,
    action_hod.full_name AS action_hod_name,
    closure_request.completion_date,
    closure_request.action_plan_saved_at,
    closure_request.submitted_for_closure_at,
    closure_request.closed_at,
    closure_request.approved_at,
    closure_request.approval_iteration,
    closure_request.review_comments,
    closure_request.reviewed_at,
    reviewer.full_name AS reviewed_by_name,

    observation_report.id
      AS observation_report_id,

    observation_report.report_number,
    observation_report.finding_date,
    observation_report.plant_location,
    observation_report.observation_location,
    observation_report.category,
    observation_report.photograph_path,
    observation_report.photograph_original_name,
    observation_report.description
      AS observation_description,
    observation_report.risk_category,
    observation_report.submitted_at
      AS observation_submitted_at,
    observation_report.zone_area_id,
    report_area.name AS area_name,
    observation_report.no_observations,

    /*
     * One entry per observation: its own action plan, the department it
     * is assigned to, and the latest ticket raised for it
     * (docs/16-closure-refinement-plan.md, D1/D3).
     */
    COALESCE((
      SELECT JSON_AGG(
        JSON_BUILD_OBJECT(
          'id', closure_item.id,
          'sequenceNumber', closure_item.sequence_number,
          'actionPlan', closure_item.action_plan,
          'targetDate', closure_item.target_date,
          'actionHodId', closure_item.action_hod_id,
          'actionHodName', COALESCE(
            item_hod.full_name,
            closure_item.responsible_hod_name
          ),
          'departmentId', closure_item.department_id,
          'departmentName', item_department.name,
          'actionPlanSavedAt',
            closure_item.action_plan_saved_at,
          'observation', JSON_BUILD_OBJECT(
            'id', item_observation.id,
            'areaName', item_area.name,
            'category', item_observation.category,
            'description', item_observation.description,
            'riskCategory',
              item_observation.risk_category
          ),
          'ticket', CASE
            WHEN item_ticket.id IS NULL THEN NULL
            ELSE JSON_BUILD_OBJECT(
              'id', item_ticket.id,
              'status', item_ticket.status,
              'decision', item_ticket.decision,
              'closureRound', item_ticket.closure_round,
              'closureDate', item_ticket.closure_date
            )
          END
        )
        ORDER BY closure_item.sequence_number
      )
      FROM closure_items AS closure_item
      JOIN observation_items AS item_observation
        ON item_observation.id =
           closure_item.observation_item_id
      LEFT JOIN zone_areas AS item_area
        ON item_area.id =
           item_observation.zone_area_id
      LEFT JOIN users AS item_hod
        ON item_hod.id = closure_item.action_hod_id
      LEFT JOIN departments AS item_department
        ON item_department.id = closure_item.department_id
      LEFT JOIN LATERAL (
        SELECT
          ticket.id,
          ticket.status,
          ticket.decision,
          ticket.closure_round,
          ticket.closure_date
        FROM action_tickets AS ticket
        WHERE ticket.closure_item_id = closure_item.id
        ORDER BY ticket.closure_round DESC
        LIMIT 1
      ) AS item_ticket ON TRUE
      WHERE closure_item.closure_request_id =
        closure_request.id
    ), '[]'::JSON) AS items,

    COALESCE((
      SELECT JSON_AGG(
        JSON_BUILD_OBJECT(
          'id', item.id,
          'sequenceNumber', item.sequence_number,
          'areaName', item_area.name,
          'category', item.category,
          'description', item.description,
          'riskCategory', item.risk_category
        )
        ORDER BY item.sequence_number
      )
      FROM observation_items AS item
      LEFT JOIN zone_areas AS item_area
        ON item_area.id = item.zone_area_id
      WHERE item.observation_report_id =
        observation_report.id
    ), '[]'::JSON) AS observations,

    patrol.id AS patrol_id,
    patrol.scheduled_date,

    sequence.week_number,

    unit.unit_number,
    unit.name AS unit_name,

    zone.zone_number,
    zone.name AS zone_name,
    zone.area_detail,

    auditor.full_name
      AS auditor_name,

    auditee.full_name
      AS auditee_name,

    ehs_officer.full_name
      AS ehs_officer_name,

    latest_ticket.id AS ticket_id,
    latest_ticket.status AS ticket_status,
    latest_ticket.decision AS ticket_decision,
    latest_ticket.closure_date AS ticket_closure_date

  FROM closure_requests
    AS closure_request

  JOIN observation_reports
    AS observation_report
    ON observation_report.id =
       closure_request.observation_report_id

  JOIN patrols AS patrol
    ON patrol.id =
       closure_request.patrol_id

  JOIN zone_patrol_sequence
    AS sequence
    ON sequence.id = patrol.id

  JOIN units AS unit
    ON unit.id = patrol.unit_id

  JOIN zones AS zone
    ON zone.id = patrol.zone_id

  JOIN users AS auditor
    ON auditor.id = patrol.auditor_id

  JOIN users AS auditee
    ON auditee.id = patrol.auditee_id

  LEFT JOIN users AS ehs_officer
    ON ehs_officer.id =
       patrol.ehs_officer_id

  LEFT JOIN users AS reviewer
    ON reviewer.id = closure_request.reviewed_by

  LEFT JOIN users AS action_hod
    ON action_hod.id = closure_request.action_hod_id

  LEFT JOIN zone_areas AS report_area
    ON report_area.id = observation_report.zone_area_id

  /*
   * The most recent ticket for this closure (there is at most one per
   * approval round; a rejected-and-resubmitted plan opens a new round
   * and a new ticket, and the latest one is what the closure views
   * should show).
   */
  LEFT JOIN LATERAL (
    SELECT
      ticket.id,
      ticket.status,
      ticket.decision,
      ticket.closure_date,
      ticket.closure_round
    FROM action_tickets AS ticket
    WHERE ticket.closure_request_id = closure_request.id
    ORDER BY ticket.closure_round DESC
    LIMIT 1
  ) AS latest_ticket ON TRUE
`;

/**
 * Every closure this auditee still owes action on, or is waiting to
 * hear back about. Pending and lapsed are the same set split by age, so
 * one query serves both and the service partitions on is_lapsed.
 *
 * Lapsed is derived rather than stored: it is a function of the clock,
 * so a stored status would need a nightly job and would drift the
 * moment that job failed. A closure already awaiting the officer is
 * never lapsed, because the delay is not the auditee's.
 */
export async function findOpenClosuresForAuditee(
  {
    auditeeId,
    lapseMonths,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      ${CLOSURE_SELECT}

      WHERE
        closure_request.requested_by = $1
        AND closure_request.status IN (
          'OPEN',
          'IN_PROGRESS',
          'REEXAMINATION_REQUIRED',
          'SUBMITTED_FOR_CLOSURE'
        )

      ORDER BY
        CASE closure_request.status
          WHEN 'REEXAMINATION_REQUIRED' THEN 1
          WHEN 'OPEN' THEN 2
          WHEN 'IN_PROGRESS' THEN 3
          WHEN 'SUBMITTED_FOR_CLOSURE' THEN 4
          ELSE 5
        END,
        closure_request.target_date ASC NULLS LAST,
        patrol.scheduled_date ASC,
        closure_request.id ASC
    `,
    [auditeeId],
  );

  const lapseBefore = new Date();

  lapseBefore.setMonth(
    lapseBefore.getMonth() - lapseMonths,
  );

  return result.rows.map((row) => {
    const closure = mapClosure(row);

    const requestedAt = row.requested_at
      ? new Date(row.requested_at)
      : null;

    return {
      ...closure,

      isLapsed:
        row.closure_status !==
          "SUBMITTED_FOR_CLOSURE" &&
        Boolean(requestedAt) &&
        requestedAt < lapseBefore,
    };
  });
}

/**
 * Closures completed in the recent past, where completed means approved
 * by an EHS Officer.
 *
 * COALESCE because approved_at was added for an approval endpoint that
 * was never built, so rows approved before it exists carry closed_at
 * instead. Drop the COALESCE once those are backfilled.
 */
export async function findRecentlyCompletedClosuresForAuditee(
  {
    auditeeId,
    daysBack,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      ${CLOSURE_SELECT}

      WHERE
        closure_request.requested_by = $1
        AND closure_request.status = 'APPROVED'
        AND COALESCE(
              closure_request.approved_at,
              closure_request.closed_at
            ) >= NOW() - ($2 || ' days')::INTERVAL

      ORDER BY
        COALESCE(
          closure_request.approved_at,
          closure_request.closed_at
        ) DESC
    `,
    [auditeeId, String(daysBack)],
  );

  return result.rows.map(mapClosure);
}

/**
 * The EHS Officer's review queue: everything submitted and waiting.
 * Scoped to patrols the officer owns, so two officers at different
 * sites do not review each other's work.
 */
export async function findClosuresPendingApproval(
  {
    officerId,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      ${CLOSURE_SELECT}

      WHERE
        closure_request.status = 'SUBMITTED_FOR_CLOSURE'
        AND (
          patrol.ehs_officer_id = $1
          OR patrol.ehs_officer_id IS NULL
        )

      ORDER BY
        closure_request.submitted_for_closure_at ASC,
        closure_request.id ASC
    `,
    [officerId],
  );

  return result.rows.map(mapClosure);
}

/**
 * One closure, readable by anyone on the patrol it belongs to.
 */
export async function findClosureByIdForUser(
  {
    closureId,
    userId,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      ${CLOSURE_SELECT}

      WHERE
        closure_request.id = $1
        AND (
          closure_request.requested_by = $2
          OR closure_request.action_hod_id = $2
          OR patrol.auditor_id = $2
          OR patrol.auditee_id = $2
          OR patrol.ehs_officer_id = $2
        )

      LIMIT 1
    `,
    [closureId, userId],
  );

  return mapClosure(result.rows[0]);
}

export async function findClosureByIdForAuditee(
  {
    closureId,
    auditeeId,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      ${CLOSURE_SELECT}

      WHERE
        closure_request.id = $1
        AND closure_request.requested_by = $2

      LIMIT 1
    `,
    [
      closureId,
      auditeeId,
    ],
  );

  return mapClosure(result.rows[0]);
}

/**
 * Locks the closure row for the length of a write, so two saves on
 * different observations of the same closure cannot interleave and
 * leave the derived status computed from a half-written set of items.
 */
export async function lockClosureForUpdate(
  {
    closureId,
    auditeeId,
  },
  client,
) {
  const result = await client.query(
    `
      SELECT
        id,
        status,
        approval_iteration,
        observation_report_id,
        patrol_id
      FROM closure_requests
      WHERE
        id = $1
        AND requested_by = $2
      FOR UPDATE
    `,
    [closureId, auditeeId],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    status: row.status,
    approvalIteration: Number(
      row.approval_iteration ?? 0,
    ),
    observationReportId:
      row.observation_report_id,
    patrolId: row.patrol_id,
  };
}

/**
 * Every observation of one closure with its own plan and latest
 * ticket. The same shape the CLOSURE_SELECT aggregate builds, for the
 * write path, which needs it without re-running the whole query.
 */
export async function findClosureItems(
  closureId,
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        closure_item.id,
        closure_item.sequence_number,
        closure_item.action_plan,
        closure_item.target_date,
        closure_item.action_hod_id,
        closure_item.responsible_hod_name,
        closure_item.action_plan_saved_at,
        closure_item.department_id,
        item_department.name AS department_name,

        item_observation.id AS observation_item_id,
        item_observation.category,
        item_observation.description,
        item_observation.risk_category,
        item_area.name AS area_name,

        item_hod.full_name AS action_hod_name,

        item_ticket.id AS ticket_id,
        item_ticket.status AS ticket_status,
        item_ticket.decision AS ticket_decision,
        item_ticket.closure_round
          AS ticket_closure_round,
        item_ticket.closure_date
          AS ticket_closure_date

      FROM closure_items AS closure_item

      JOIN observation_items AS item_observation
        ON item_observation.id =
           closure_item.observation_item_id

      LEFT JOIN zone_areas AS item_area
        ON item_area.id =
           item_observation.zone_area_id

      LEFT JOIN users AS item_hod
        ON item_hod.id = closure_item.action_hod_id

      LEFT JOIN departments AS item_department
        ON item_department.id = closure_item.department_id

      LEFT JOIN LATERAL (
        SELECT
          ticket.id,
          ticket.status,
          ticket.decision,
          ticket.closure_round,
          ticket.closure_date
        FROM action_tickets AS ticket
        WHERE ticket.closure_item_id = closure_item.id
        ORDER BY ticket.closure_round DESC
        LIMIT 1
      ) AS item_ticket ON TRUE

      WHERE closure_item.closure_request_id = $1

      ORDER BY closure_item.sequence_number
    `,
    [closureId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    sequenceNumber: Number(
      row.sequence_number,
    ),
    actionPlan: row.action_plan,
    targetDate: row.target_date,
    actionHodId: row.action_hod_id,
    actionHodName:
      row.action_hod_name ??
      row.responsible_hod_name,
    departmentId: row.department_id ?? null,
    departmentName:
      row.department_name ?? null,
    actionPlanSavedAt:
      row.action_plan_saved_at,

    observation: {
      id: row.observation_item_id,
      areaName: row.area_name,
      category: row.category,
      description: row.description,
      riskCategory: row.risk_category,
    },

    ticket: row.ticket_id
      ? {
          id: row.ticket_id,
          status: row.ticket_status,
          decision: row.ticket_decision,
          closureRound: Number(
            row.ticket_closure_round ?? 0,
          ),
          closureDate:
            row.ticket_closure_date,
        }
      : null,
  }));
}

export async function findClosureStatus(
  closureId,
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT status
      FROM closure_requests
      WHERE id = $1
    `,
    [closureId],
  );

  return result.rows[0]?.status ?? null;
}

/**
 * Saves one observation's action plan. The closure's own status is not
 * touched here: it is derived from every item and its ticket
 * afterwards (docs/16, D5).
 */
export async function saveClosureItem(
  {
    closureId,
    closureItemId,
    actionPlan,
    targetDate,
    responsibleHodName,
    actionHodId,
    departmentId,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      UPDATE closure_items
      SET
        action_plan = $1,
        target_date = $2::DATE,
        responsible_hod_name = $3,
        action_hod_id = $4,
        department_id = $7,
        action_plan_saved_at = NOW(),
        updated_at = NOW()
      WHERE
        id = $5
        AND closure_request_id = $6
      RETURNING
        id,
        closure_request_id,
        observation_item_id,
        sequence_number,
        action_plan,
        target_date,
        responsible_hod_name,
        action_hod_id
    `,
    [
      actionPlan,
      targetDate,
      responsibleHodName,
      actionHodId,
      closureItemId,
      closureId,
      departmentId,
    ],
  );

  return result.rows[0] ?? null;
}

/**
 * Mirrors item #1 onto the closure's own columns, so every reader that
 * predates per-observation plans keeps working (docs/16, D2).
 */
export async function syncClosureHeaderFromItemOne(
  closureId,
  client = databasePool,
) {
  await client.query(
    `
      UPDATE closure_requests AS closure_request
      SET
        action_plan = closure_item.action_plan,
        target_date = closure_item.target_date,
        responsible_hod_name =
          closure_item.responsible_hod_name,
        action_hod_id = closure_item.action_hod_id,
        action_plan_saved_at =
          closure_item.action_plan_saved_at,
        updated_at = NOW()
      FROM closure_items AS closure_item
      WHERE
        closure_request.id = $1
        AND closure_item.closure_request_id =
            closure_request.id
        AND closure_item.sequence_number = 1
    `,
    [closureId],
  );
}

export async function updateClosureStatus(
  {
    closureId,
    status,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      UPDATE closure_requests
      SET
        status = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING id, status
    `,
    [status, closureId],
  );

  return result.rows[0] ?? null;
}

/**
 * The plant this closure's patrol belongs to, independent of whether
 * any Action Team HOD is registered there yet. Kept separate from
 * findActionHodsForClosure below, whose inner join to hod_user would
 * otherwise return zero rows (and no plant name) when the location has
 * no HOD registered.
 */
export async function findPlantNameForClosure(
  {
    closureId,
    auditeeId,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT target_plant.name AS plant_name

      FROM closure_requests AS closure_request

      JOIN patrols AS patrol
        ON patrol.id = closure_request.patrol_id

      JOIN units AS patrol_unit
        ON patrol_unit.id = patrol.unit_id

      JOIN plants AS target_plant
        ON target_plant.id = patrol_unit.plant_id

      WHERE
        closure_request.id = $1
        AND closure_request.requested_by = $2

      LIMIT 1
    `,
    [closureId, auditeeId],
  );

  return result.rows[0]?.plant_name ?? null;
}

/**
 * Active ACTION_HOD users at the same plant as this closure's patrol,
 * for the auditee's assignment dropdown. Scoped to a closure this
 * auditee owns, the same location rule as the auditor/auditee dropdowns
 * on the Plan page.
 */
/**
 * Departments at this closure's plant that have at least one active
 * Action Team HOD, each with the HOD the ticket will be assigned to
 * (the first by name when a department has several)
 * (docs/17-ticket-refinement-plan.md, D1).
 */
export async function findDepartmentsForClosure(
  {
    closureId,
    auditeeId,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT DISTINCT ON (department.id)
        department.id,
        department.name,
        department.code,

        hod_user.id AS hod_id,
        hod_user.full_name AS hod_name,

        target_plant.name AS plant_name

      FROM closure_requests AS closure_request

      JOIN patrols AS patrol
        ON patrol.id = closure_request.patrol_id

      JOIN units AS patrol_unit
        ON patrol_unit.id = patrol.unit_id

      JOIN plants AS target_plant
        ON target_plant.id = patrol_unit.plant_id

      JOIN departments AS department
        ON department.plant_id = patrol_unit.plant_id
        AND department.is_active = TRUE

      JOIN users AS hod_user
        ON hod_user.department_id = department.id
        AND hod_user.is_active = TRUE

      JOIN user_roles AS hod_role_link
        ON hod_role_link.user_id = hod_user.id

      JOIN roles AS hod_role
        ON hod_role.id = hod_role_link.role_id
        AND hod_role.code = 'ACTION_HOD'

      WHERE
        closure_request.id = $1
        AND closure_request.requested_by = $2

      ORDER BY
        department.id,
        hod_user.full_name,
        hod_user.username
    `,
    [closureId, auditeeId],
  );

  return result.rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      hodId: row.hod_id,
      hodName: row.hod_name,
      plantName: row.plant_name,
    }))
    .sort((left, right) =>
      String(left.name).localeCompare(
        String(right.name),
      ),
    );
}

/**
 * Open (or refresh) the ticket for this closure's current approval
 * round. The WHERE on the DO UPDATE means a ticket the HOD has already
 * acted on (status no longer OPEN) is left untouched by a later save;
 * the statement then returns no row, which is not an error.
 */
export async function upsertTicketForClosureRound(
  {
    closureId,
    closureItemId,
    observationReportId,
    patrolId,
    closureRound,
    actionHodId,
    actionHodName,
    departmentId,
    proposedActionPlan,
    targetDate,
    assignedBy,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      INSERT INTO action_tickets (
        closure_request_id,
        closure_item_id,
        observation_report_id,
        patrol_id,
        closure_round,
        action_hod_id,
        assigned_by,
        action_hod_name,
        proposed_action_plan,
        target_date,
        department_id
      )
      VALUES ($1, $10, $2, $3, $4, $5, $6, $7, $8, $9, $11)
      ON CONFLICT (closure_item_id, closure_round) DO UPDATE
      SET
        action_hod_id = EXCLUDED.action_hod_id,
        action_hod_name = EXCLUDED.action_hod_name,
        department_id = EXCLUDED.department_id,
        proposed_action_plan = EXCLUDED.proposed_action_plan,
        target_date = EXCLUDED.target_date,
        assigned_at = NOW(),
        updated_at = NOW()
      WHERE action_tickets.status = 'OPEN'
      RETURNING id, status
    `,
    [
      closureId,
      observationReportId,
      patrolId,
      closureRound,
      actionHodId,
      assignedBy,
      actionHodName,
      proposedActionPlan,
      targetDate,
      closureItemId,
      departmentId,
    ],
  );

  return result.rows[0] ?? null;
}

export async function submitForClosure(
  {
    closureId,
    auditeeId,
    completionDate,
  },
  client,
) {
  const result = await client.query(
    `
      UPDATE closure_requests
      SET
        status = 'SUBMITTED_FOR_CLOSURE',
        completion_date = $1,
        submitted_for_closure_at = NOW(),
        updated_at = NOW()

      WHERE
        id = $2
        AND requested_by = $3
        AND status = 'IN_PROGRESS'
        AND action_plan IS NOT NULL
        AND target_date IS NOT NULL
        AND responsible_hod_name IS NOT NULL

      RETURNING
        id,
        patrol_id,
        observation_report_id
    `,
    [
      completionDate,
      closureId,
      auditeeId,
    ],
  );

  return result.rows[0] ?? null;
}

export async function updatePatrolAfterClosureSubmission(
  patrolId,
  client,
) {
  await client.query(
    `
      UPDATE patrols
      SET
        status = 'PENDING_EHS_APPROVAL',
        updated_at = NOW()
      WHERE id = $1
    `,
    [patrolId],
  );
}

export async function updateObservationAfterClosureSubmission(
  observationReportId,
  client,
) {
  await client.query(
    `
      UPDATE observation_reports
      SET
        status = 'PENDING_EHS_APPROVAL',
        updated_at = NOW()
      WHERE id = $1
    `,
    [observationReportId],
  );
}
/**
 * Approve a submitted closure.
 *
 * The status precondition lives in the WHERE clause, not only in the
 * service, so two officers reviewing the same closure at once cannot
 * both succeed and double-increment the iteration.
 */
export async function approveClosure(
  {
    closureId,
    reviewerId,
    reviewComments,
  },
  client,
) {
  const result = await client.query(
    `
      UPDATE closure_requests
      SET
        status = 'APPROVED',
        reviewed_by = $2,
        reviewed_at = NOW(),
        review_comments = NULLIF(BTRIM($3), ''),
        approved_at = NOW(),
        closed_at = NOW(),
        approval_iteration = approval_iteration + 1,
        updated_at = NOW()

      WHERE
        id = $1
        AND status = 'SUBMITTED_FOR_CLOSURE'

      RETURNING id
    `,
    [closureId, reviewerId, reviewComments ?? ""],
  );

  return result.rows[0] ?? null;
}

/**
 * Send a submitted closure back to the auditee.
 *
 * The action plan is cleared so it must be written again, while the
 * target date and the responsible HOD are deliberately left alone: the
 * original commitment should not move because the plan failed review.
 *
 * Clearing the plan also disables submission on its own, because
 * canSubmitForClosure requires a non-blank plan.
 */
export async function rejectClosure(
  {
    closureId,
    reviewerId,
    reviewComments,
  },
  client,
) {
  const result = await client.query(
    `
      UPDATE closure_requests
      SET
        status = 'REEXAMINATION_REQUIRED',

        action_plan = NULL,
        action_plan_saved_at = NULL,

        reviewed_by = $2,
        reviewed_at = NOW(),
        review_comments = $3,
        approval_iteration = approval_iteration + 1,
        updated_at = NOW()

      WHERE
        id = $1
        AND status = 'SUBMITTED_FOR_CLOSURE'

      RETURNING id
    `,
    [closureId, reviewerId, reviewComments],
  );

  return result.rows[0] ?? null;
}

/**
 * Moves the patrol and its observation report in step with the review
 * decision, so the three tables never disagree about where the work is.
 */
export async function applyReviewToPatrolAndReport(
  {
    closureId,
    patrolStatus,
    reportStatus,
    closeReport,
  },
  client,
) {
  await client.query(
    `
      UPDATE patrols
      SET status = $2, updated_at = NOW()
      WHERE id = (
        SELECT patrol_id FROM closure_requests WHERE id = $1
      )
    `,
    [closureId, patrolStatus],
  );

  await client.query(
    `
      UPDATE observation_reports
      SET
        status = $2,
        closed_at = CASE WHEN $3 THEN NOW() ELSE closed_at END,
        updated_at = NOW()
      WHERE id = (
        SELECT observation_report_id FROM closure_requests WHERE id = $1
      )
    `,
    [closureId, reportStatus, closeReport],
  );
}
