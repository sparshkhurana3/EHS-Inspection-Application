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

    category:
      row.category,

    riskCategory:
      row.risk_category,

    observationDescription:
      row.observation_description,

    photographPath:
      row.photograph_path,

    zoneAreaId:
      row.zone_area_id,

    areaName:
      row.area_name,

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
 * Reject the proposed plan: OPEN -> CLOSED immediately, no work done on
 * the ground. correctiveActionTypeId is optional here.
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
        status = 'CLOSED',
        decision = 'REJECTED',
        comments = $1,
        corrective_action_type_id = $2,
        decided_at = NOW(),
        closure_date = CURRENT_DATE,
        closed_at = NOW(),
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
 * Close an accepted ticket after the work is done on the ground:
 * IN_PROGRESS -> CLOSED.
 */
export async function closeTicket(
  {
    ticketId,
    hodId,
    completionNotes,
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
        completion_notes = $1,
        updated_at = NOW()
      WHERE
        id = $2
        AND action_hod_id = $3
        AND status = 'IN_PROGRESS'
      RETURNING id
    `,
    [completionNotes, ticketId, hodId],
  );

  return result.rows[0] ?? null;
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
