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

    completionDate:
      row.completion_date,

    actionPlanSavedAt:
      row.action_plan_saved_at,

    submittedForClosureAt:
      row.submitted_for_closure_at,

    closedAt:
      row.closed_at,
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

    closure_request.action_plan,
    closure_request.target_date,
    closure_request.responsible_hod_name,
    closure_request.completion_date,
    closure_request.action_plan_saved_at,
    closure_request.submitted_for_closure_at,
    closure_request.closed_at,

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
      AS ehs_officer_name

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
`;

export async function findCurrentClosureForAuditee(
  auditeeId,
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
          'SUBMITTED_FOR_CLOSURE',
          'REEXAMINATION_REQUIRED'
        )

      ORDER BY
        CASE closure_request.status
          WHEN 'OPEN' THEN 1
          WHEN 'IN_PROGRESS' THEN 2
          WHEN 'REEXAMINATION_REQUIRED' THEN 3
          WHEN 'SUBMITTED_FOR_CLOSURE' THEN 4
          ELSE 5
        END,
        patrol.scheduled_date ASC,
        closure_request.id ASC

      LIMIT 1
    `,
    [auditeeId],
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

export async function saveActionPlan(
  {
    closureId,
    auditeeId,
    actionPlan,
    targetDate,
    responsibleHodName,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      UPDATE closure_requests
      SET
        action_plan = $1,
        target_date = $2::DATE,
        responsible_hod_name = $3,
        status = 'IN_PROGRESS',
        action_plan_saved_at = NOW(),
        updated_at = NOW()
      WHERE
        id = $4
        AND requested_by = $5
        AND status IN (
          'OPEN',
          'IN_PROGRESS',
          'REEXAMINATION_REQUIRED'
        )
      RETURNING
        id,
        observation_report_id,
        patrol_id,
        requested_by,
        action_plan,
        target_date,
        responsible_hod_name,
        status,
        action_plan_saved_at,
        updated_at
    `,
    [
      actionPlan,
      targetDate,
      responsibleHodName,
      closureId,
      auditeeId,
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