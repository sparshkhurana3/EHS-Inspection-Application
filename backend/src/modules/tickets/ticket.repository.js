import {
  databasePool,
} from "../../config/database.js";

function mapTicket(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.ticket_id,
    status: row.ticket_status,
    decision: row.ticket_decision,

    closureRequestId:
      row.closure_request_id,

    closureItemId:
      row.closure_item_id ?? null,

    observationReportId:
      row.observation_report_id,

    patrolId:
      row.patrol_id,

    closureRound:
      Number(row.closure_round ?? 0),

    actionHodId:
      row.action_hod_id,

    actionHodName:
      row.action_hod_name,

    assignedBy:
      row.assigned_by,

    proposedActionPlan:
      row.proposed_action_plan,

    targetDate:
      row.target_date,

    comments:
      row.comments,

    correctiveActionTypeId:
      row.corrective_action_type_id,

    correctiveActionTypeCode:
      row.corrective_action_type_code,

    correctiveActionTypeName:
      row.corrective_action_type_name,

    completionNotes:
      row.completion_notes,

    /* The HOD's write-up of the work done, shown at approval. */
    resolutionComments:
      row.completion_notes,

    departmentId:
      row.department_id ?? null,

    departmentName:
      row.department_name ?? null,

    submittedForApprovalAt:
      row.submitted_for_approval_at,

    approvedBy:
      row.approved_by ?? null,

    approvedByName:
      row.approved_by_name ?? null,

    approvedAt:
      row.approved_at,

    approvalComments:
      row.approval_comments,

    reopenComments:
      row.reopen_comments,

    reopenedAt:
      row.reopened_at,

    reopenCount:
      Number(row.reopen_count ?? 0),

    assignedAt:
      row.assigned_at,

    decidedAt:
      row.decided_at,

    closureDate:
      row.ticket_closure_date,

    closedAt:
      row.ticket_closed_at,

    closureStatus:
      row.closure_status,

    reportNumber:
      row.report_number,

    findingDate:
      row.finding_date,

    plantLocation:
      row.plant_location,

    observationLocation:
      row.observation_location,

    /*
     * A ticket is raised for one observation, so the fields the Action
     * HOD reads describe that observation, falling back to the
     * report's own columns for a ticket raised before plans became
     * per-observation.
     */
    category:
      row.ticket_category ?? row.category,

    riskCategory:
      row.ticket_risk_category ??
      row.risk_category,

    observationDescription:
      row.ticket_observation_description ??
      row.observation_description,

    photographPath:
      row.photograph_path,

    zoneAreaId:
      row.zone_area_id,

    areaName:
      row.ticket_area_name ?? row.area_name,

    observationItemId:
      row.ticket_observation_id ?? null,

    observationSequenceNumber:
      row.ticket_observation_sequence
        ? Number(
            row.ticket_observation_sequence,
          )
        : null,

    /*
     * Every observation on the underlying report (docs/15-
     * observations-refinement-plan.md, D2); the fields above stay
     * filled with observation #1.
     */
    observations:
      row.observations ?? [],

    scheduledDate:
      row.scheduled_date,

    unitNumber:
      row.unit_number,

    unitName:
      row.unit_name,

    zoneNumber:
      row.zone_number,

    zoneName:
      row.zone_name,

    auditorName:
      row.auditor_name,

    auditeeName:
      row.auditee_name,

    ehsOfficerName:
      row.ehs_officer_name,
  };
}

function mapEvidence(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    ticketId: row.ticket_id,
    filePath: row.file_path,
    originalName: row.original_name,
    mimeType: row.mime_type,
    size: row.size ? Number(row.size) : null,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
  };
}

/*
 * Every ticket query joins through the patrol/closure chain so the same
 * response shape serves the list, the detail view, and the read-access
 * predicate below.
 */
const TICKET_SELECT = `
  SELECT
    ticket.id AS ticket_id,
    ticket.status AS ticket_status,
    ticket.decision AS ticket_decision,
    ticket.closure_request_id,
    ticket.closure_item_id,
    ticket.observation_report_id,
    ticket.patrol_id,
    ticket.closure_round,
    ticket.action_hod_id,
    ticket.action_hod_name,
    ticket.assigned_by,
    ticket.proposed_action_plan,
    ticket.target_date,
    ticket.comments,
    ticket.corrective_action_type_id,
    ticket.completion_notes,
    ticket.department_id,
    ticket_department.name AS department_name,
    ticket.submitted_for_approval_at,
    ticket.approved_by,
    approver.full_name AS approved_by_name,
    ticket.approved_at,
    ticket.approval_comments,
    ticket.reopen_comments,
    ticket.reopened_at,
    ticket.reopen_count,
    ticket.assigned_at,
    ticket.decided_at,
    ticket.closure_date AS ticket_closure_date,
    ticket.closed_at AS ticket_closed_at,

    closure_request.status AS closure_status,

    observation_report.report_number,
    observation_report.finding_date,
    observation_report.plant_location,
    observation_report.observation_location,
    observation_report.category,
    observation_report.risk_category,
    observation_report.description
      AS observation_description,
    observation_report.photograph_path,
    observation_report.zone_area_id,
    report_area.name AS area_name,

    ticket_observation.id
      AS ticket_observation_id,
    ticket_observation.category
      AS ticket_category,
    ticket_observation.risk_category
      AS ticket_risk_category,
    ticket_observation.description
      AS ticket_observation_description,
    ticket_observation.sequence_number
      AS ticket_observation_sequence,
    ticket_area.name AS ticket_area_name,

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

    patrol.scheduled_date,

    unit.unit_number,
    unit.name AS unit_name,

    zone.zone_number,
    zone.name AS zone_name,

    auditor.full_name AS auditor_name,
    auditee.full_name AS auditee_name,
    ehs_officer.full_name AS ehs_officer_name,

    action_type.code AS corrective_action_type_code,
    action_type.name AS corrective_action_type_name

  FROM action_tickets AS ticket

  JOIN closure_requests AS closure_request
    ON closure_request.id = ticket.closure_request_id

  JOIN observation_reports AS observation_report
    ON observation_report.id = ticket.observation_report_id

  JOIN patrols AS patrol
    ON patrol.id = ticket.patrol_id

  JOIN units AS unit
    ON unit.id = patrol.unit_id

  JOIN zones AS zone
    ON zone.id = patrol.zone_id

  JOIN users AS auditor
    ON auditor.id = patrol.auditor_id

  JOIN users AS auditee
    ON auditee.id = patrol.auditee_id

  LEFT JOIN users AS ehs_officer
    ON ehs_officer.id = patrol.ehs_officer_id

  LEFT JOIN zone_areas AS report_area
    ON report_area.id = observation_report.zone_area_id

  LEFT JOIN corrective_action_types AS action_type
    ON action_type.id = ticket.corrective_action_type_id

  LEFT JOIN departments AS ticket_department
    ON ticket_department.id = ticket.department_id

  LEFT JOIN users AS approver
    ON approver.id = ticket.approved_by

  /*
   * The one observation this ticket is for. A ticket raised before
   * plans became per-observation has no closure item, so these stay
   * null and the report-level columns above are used instead.
   */
  LEFT JOIN closure_items AS ticket_closure_item
    ON ticket_closure_item.id = ticket.closure_item_id

  LEFT JOIN observation_items AS ticket_observation
    ON ticket_observation.id =
       ticket_closure_item.observation_item_id

  LEFT JOIN zone_areas AS ticket_area
    ON ticket_area.id = ticket_observation.zone_area_id
`;

/*
 * Who may read a ticket: the Action Team HOD it is assigned to, the
 * auditee who assigned it, the auditor, or the patrol's EHS Officer.
 * Mirrors closure.repository.js's findClosureByIdForUser predicate.
 */
const TICKET_READ_PREDICATE = `
  (
    ticket.action_hod_id = $2
    OR closure_request.requested_by = $2
    OR patrol.auditor_id = $2
    OR patrol.auditee_id = $2
    OR patrol.ehs_officer_id = $2
    OR EXISTS (
      SELECT 1
      FROM users AS reader
      JOIN user_roles AS reader_role_link
        ON reader_role_link.user_id = reader.id
      JOIN roles AS reader_role
        ON reader_role.id = reader_role_link.role_id
      WHERE
        reader.id = $2
        AND reader.plant_id = unit.plant_id
        AND reader_role.code IN (
          'EHS_OFFICER', 'HOD',
          'PLANT_HEAD', 'ADMIN'
        )
    )
  )
`;

/*
 * Who may approve or reopen a ticket: the patrol's own EHS Officer, or
 * a management user at that plant (docs/17, D7).
 */
const TICKET_APPROVER_PREDICATE = `
  (
    patrol.ehs_officer_id = $1
    OR EXISTS (
      SELECT 1
      FROM users AS approver_user
      JOIN user_roles AS approver_role_link
        ON approver_role_link.user_id = approver_user.id
      JOIN roles AS approver_role
        ON approver_role.id = approver_role_link.role_id
      WHERE
        approver_user.id = $1
        AND approver_user.plant_id = unit.plant_id
        AND approver_role.code IN (
          'EHS_OFFICER', 'HOD',
          'PLANT_HEAD', 'ADMIN'
        )
    )
  )
`;

/**
 * Every ticket assigned to this Action Team HOD: open and in-progress
 * without limit, closed ones from the last `closedDaysBack` days.
 */
export async function findTicketsForHod(
  {
    hodId,
    closedDaysBack,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      ${TICKET_SELECT}
      WHERE
        ticket.action_hod_id = $1
        AND (
          ticket.status <> 'CLOSED'
          OR ticket.closure_date >= CURRENT_DATE - $2::INTEGER
        )
      ORDER BY
        CASE ticket.status
          WHEN 'OPEN' THEN 0
          WHEN 'IN_PROGRESS' THEN 1
          ELSE 2
        END,
        ticket.target_date,
        ticket.id
    `,
    [hodId, closedDaysBack],
  );

  return result.rows.map(mapTicket);
}

export async function findTicketByIdForUser(
  {
    ticketId,
    userId,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      ${TICKET_SELECT}
      WHERE
        ticket.id = $1
        AND ${TICKET_READ_PREDICATE}
      LIMIT 1
    `,
    [ticketId, userId],
  );

  return mapTicket(result.rows[0]);
}

/**
 * The HOD's own ticket, optionally row-locked for a decide/evidence/
 * close transaction so two concurrent requests cannot both succeed.
 */
export async function findTicketByIdForHod(
  {
    ticketId,
    hodId,
    forUpdate = false,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      ${TICKET_SELECT}
      WHERE
        ticket.id = $1
        AND ticket.action_hod_id = $2
      ${forUpdate ? "FOR UPDATE OF ticket" : ""}
    `,
    [ticketId, hodId],
  );

  return mapTicket(result.rows[0]);
}

export async function findLatestTicketForClosure(
  closureId,
  client = databasePool,
) {
  const result = await client.query(
    `
      ${TICKET_SELECT}
      WHERE ticket.closure_request_id = $1
      ORDER BY ticket.closure_round DESC
      LIMIT 1
    `,
    [closureId],
  );

  return mapTicket(result.rows[0]);
}

export async function findEvidenceForTicket(
  ticketId,
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        id,
        ticket_id,
        file_path,
        original_name,
        mime_type,
        size,
        uploaded_by,
        uploaded_at
      FROM action_ticket_evidence
      WHERE ticket_id = $1
      ORDER BY uploaded_at, id
    `,
    [ticketId],
  );

  return result.rows.map(mapEvidence);
}

/**
 * One evidence file, only when the caller may read the ticket it
 * belongs to (same predicate as a ticket read).
 */
export async function findEvidenceByIdForUser(
  {
    ticketId,
    evidenceId,
    userId,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        evidence.id,
        evidence.ticket_id,
        evidence.file_path,
        evidence.original_name,
        evidence.mime_type,
        evidence.size

      FROM action_ticket_evidence AS evidence

      JOIN action_tickets AS ticket
        ON ticket.id = evidence.ticket_id

      JOIN closure_requests AS closure_request
        ON closure_request.id = ticket.closure_request_id

      JOIN patrols AS patrol
        ON patrol.id = ticket.patrol_id

      WHERE
        evidence.id = $1
        AND evidence.ticket_id = $2
        AND ${TICKET_READ_PREDICATE.replaceAll("$2", "$3")}

      LIMIT 1
    `,
    [evidenceId, ticketId, userId],
  );

  return mapEvidence(result.rows[0]);
}

export async function countEvidence(
  ticketId,
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT COUNT(*)::INTEGER AS count
      FROM action_ticket_evidence
      WHERE ticket_id = $1
    `,
    [ticketId],
  );

  return result.rows[0]?.count ?? 0;
}

export async function insertEvidence(
  {
    ticketId,
    files,
    uploadedBy,
  },
  client = databasePool,
) {
  if (!files.length) {
    return [];
  }

  /*
   * uploaded_by is the same value for every row in this batch, appended
   * once after the per-file placeholders so it is bound only once.
   */
  const values = [];

  const placeholders = files.map(
    (file) => {
      values.push(
        ticketId,
        file.path,
        file.originalname,
        file.mimetype,
        file.size,
      );

      const base = values.length - 5;

      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${files.length * 5 + 1})`;
    },
  );

  values.push(uploadedBy);

  const result = await client.query(
    `
      INSERT INTO action_ticket_evidence (
        ticket_id,
        file_path,
        original_name,
        mime_type,
        size,
        uploaded_by
      )
      VALUES
        ${placeholders.join(",\n        ")}
      RETURNING
        id,
        ticket_id,
        file_path,
        original_name,
        mime_type,
        size,
        uploaded_by,
        uploaded_at
    `,
    values,
  );

  return result.rows.map(mapEvidence);
}

export async function deleteEvidence(
  {
    ticketId,
    evidenceId,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      DELETE FROM action_ticket_evidence
      WHERE id = $1 AND ticket_id = $2
      RETURNING file_path
    `,
    [evidenceId, ticketId],
  );

  return result.rows[0] ?? null;
}

/**
 * Accept the proposed plan: OPEN -> IN_PROGRESS. Only succeeds while
 * the ticket is still OPEN; a null return means someone else already
 * moved it.
 */
export async function acceptTicket(
  {
    ticketId,
    hodId,
    comments,
    correctiveActionTypeId,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      UPDATE action_tickets
      SET
        status = 'IN_PROGRESS',
        decision = 'ACCEPTED',
        comments = $1,
        corrective_action_type_id = $2,
        decided_at = NOW(),
        updated_at = NOW()
      WHERE
        id = $3
        AND action_hod_id = $4
        AND status = 'OPEN'
      RETURNING id
    `,
    [
      comments,
      correctiveActionTypeId,
      ticketId,
      hodId,
    ],
  );

  return result.rows[0] ?? null;
}

/**
 * Reject the proposed plan: OPEN -> PENDING_APPROVAL. The EHS Officer
 * closes the ticket or sends it back (docs/17, D4); no work is done on
 * the ground for a rejected plan. correctiveActionTypeId is optional.
 */
export async function rejectTicket(
  {
    ticketId,
    hodId,
    comments,
    correctiveActionTypeId,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      UPDATE action_tickets
      SET
        status = 'PENDING_APPROVAL',
        decision = 'REJECTED',
        comments = $1,
        corrective_action_type_id = $2,
        decided_at = NOW(),
        submitted_for_approval_at = NOW(),
        updated_at = NOW()
      WHERE
        id = $3
        AND action_hod_id = $4
        AND status = 'OPEN'
      RETURNING id
    `,
    [
      comments,
      correctiveActionTypeId,
      ticketId,
      hodId,
    ],
  );

  return result.rows[0] ?? null;
}

/**
 * The HOD's completed work goes to the EHS Officer:
 * IN_PROGRESS -> PENDING_APPROVAL. The type of work is editable here,
 * since what was actually done can differ from what was planned
 * (docs/17, D2/D5).
 */
export async function submitResolution(
  {
    ticketId,
    hodId,
    resolutionComments,
    correctiveActionTypeId,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      UPDATE action_tickets
      SET
        status = 'PENDING_APPROVAL',
        completion_notes = $1,
        corrective_action_type_id = COALESCE(
          $2,
          corrective_action_type_id
        ),
        submitted_for_approval_at = NOW(),
        updated_at = NOW()
      WHERE
        id = $3
        AND action_hod_id = $4
        AND status = 'IN_PROGRESS'
      RETURNING id
    `,
    [
      resolutionComments,
      correctiveActionTypeId,
      ticketId,
      hodId,
    ],
  );

  return result.rows[0] ?? null;
}

/**
 * The EHS Officer closes the ticket: PENDING_APPROVAL -> CLOSED,
 * keeping whichever decision the HOD recorded.
 */
export async function approveTicket(
  {
    ticketId,
    approverId,
    comments,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      UPDATE action_tickets
      SET
        status = 'CLOSED',
        closure_date = CURRENT_DATE,
        closed_at = NOW(),
        approved_by = $1,
        approved_at = NOW(),
        approval_comments = $2,
        updated_at = NOW()
      WHERE
        id = $3
        AND status = 'PENDING_APPROVAL'
      RETURNING id
    `,
    [approverId, comments, ticketId],
  );

  return result.rows[0] ?? null;
}

/**
 * The EHS Officer sends the ticket back: PENDING_APPROVAL -> OPEN with
 * everything the HOD recorded cleared, so they look at it again
 * (docs/17, D6). The plan snapshot is kept: it is what the ticket is
 * for. Evidence rows are deleted by the caller in the same transaction.
 */
export async function reopenTicket(
  {
    ticketId,
    approverId,
    comments,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      UPDATE action_tickets
      SET
        status = 'OPEN',
        decision = NULL,
        comments = NULL,
        corrective_action_type_id = NULL,
        completion_notes = NULL,
        decided_at = NULL,
        submitted_for_approval_at = NULL,
        closure_date = NULL,
        closed_at = NULL,
        approved_by = $1,
        approved_at = NULL,
        approval_comments = NULL,
        reopen_comments = $2,
        reopened_at = NOW(),
        reopen_count = reopen_count + 1,
        updated_at = NOW()
      WHERE
        id = $3
        AND status = 'PENDING_APPROVAL'
      RETURNING id
    `,
    [approverId, comments, ticketId],
  );

  return result.rows[0] ?? null;
}

/**
 * Removes every evidence row for a ticket, returning the file paths so
 * the caller can unlink them once the transaction has committed.
 */
export async function deleteEvidenceForTicket(
  ticketId,
  client = databasePool,
) {
  const result = await client.query(
    `
      DELETE FROM action_ticket_evidence
      WHERE ticket_id = $1
      RETURNING file_path
    `,
    [ticketId],
  );

  return result.rows.map(
    (row) => row.file_path,
  );
}

/**
 * Every ticket assigned to this HOD in the last six months, for the
 * History tab (docs/17, D8).
 */
export async function findTicketHistoryForHod(
  {
    hodId,
    fromDate,
    filter,
  },
  client = databasePool,
) {
  const statusClause =
    filter && filter !== "all"
      ? "AND ticket.status = $3"
      : "";

  const parameters = [hodId, fromDate];

  if (statusClause) {
    parameters.push(
      String(filter).toUpperCase(),
    );
  }

  const result = await client.query(
    `
      ${TICKET_SELECT}
      WHERE
        ticket.action_hod_id = $1
        AND ticket.assigned_at >= $2::DATE
        ${statusClause}
      ORDER BY
        ticket.assigned_at DESC,
        ticket.id DESC
      LIMIT 300
    `,
    parameters,
  );

  return result.rows.map(mapTicket);
}

/**
 * Every ticket waiting on this approver's decision.
 */
export async function findTicketsPendingApproval(
  {
    userId,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      ${TICKET_SELECT}
      WHERE
        ticket.status = 'PENDING_APPROVAL'
        AND ${TICKET_APPROVER_PREDICATE}
      ORDER BY
        ticket.submitted_for_approval_at,
        ticket.id
    `,
    [userId],
  );

  return result.rows.map(mapTicket);
}

/**
 * One ticket, readable and writable by an approver.
 */
export async function findTicketByIdForApprover(
  {
    ticketId,
    userId,
    forUpdate = false,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      ${TICKET_SELECT}
      WHERE
        ticket.id = $2
        AND ${TICKET_APPROVER_PREDICATE}
      ${forUpdate ? "FOR UPDATE OF ticket" : ""}
    `,
    [userId, ticketId],
  );

  return mapTicket(result.rows[0]);
}

export async function findActiveCorrectiveActionTypes(
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT id, code, name
      FROM corrective_action_types
      WHERE is_active
      ORDER BY display_order, name
    `,
  );

  return result.rows;
}

export async function findCorrectiveActionTypeById(
  id,
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT id, code, name
      FROM corrective_action_types
      WHERE id = $1 AND is_active
      LIMIT 1
    `,
    [id],
  );

  return result.rows[0] ?? null;
}
