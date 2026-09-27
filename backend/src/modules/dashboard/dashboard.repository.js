import {
  databasePool,
} from "../../config/database.js";

function mapAudit(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,

    unitId: row.unit_id,
    unitName: row.unit_name,

    zoneId: row.zone_id,
    zoneName: row.zone_name,
    areaDetail: row.area_detail,

    scheduledDate: row.scheduled_date,
    status: row.status,

    auditorId: row.auditor_id,
    auditorName: row.auditor_name,

    auditeeId: row.auditee_id,
    auditeeName: row.auditee_name,

    assignmentRole:
      row.assignment_role ?? null,

    observationReportId:
      row.observation_report_id ?? null,

    observationReportStatus:
      row.observation_report_status ?? null,

    hasOpenObservationReport:
      Boolean(row.has_open_observation_report),

    auditorActionCompleted:
      Boolean(row.auditor_action_completed),

    auditeeActionCompleted:
      Boolean(row.auditee_action_completed),
  };
}

export async function findAssignedMonthlyPatrols(
  {
    userId,
    monthStart,
    monthEnd,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        p.id,
        p.unit_id,
        u.name AS unit_name,
        p.zone_id,
        z.name AS zone_name,
        z.area_detail,
        p.scheduled_date,
        p.status,
        p.auditor_id,
        auditor.full_name AS auditor_name,
        p.auditee_id,
        auditee.full_name AS auditee_name,

        CASE
          WHEN p.auditor_id = $1
          THEN 'AUDITOR'

          WHEN p.auditee_id = $1
          THEN 'AUDITEE'

          ELSE NULL
        END AS assignment_role,

        observation_report.id
          AS observation_report_id,

        observation_report.status
          AS observation_report_status,

        CASE
          WHEN observation_report.id IS NOT NULL
           AND observation_report.status IN (
               'OPEN',
               'PENDING_AUDITEE_ACTION',
               'REEXAMINATION_REQUIRED'
           )
          THEN TRUE
          ELSE FALSE
        END AS has_open_observation_report,

        CASE
          WHEN observation_report.id IS NOT NULL
          THEN TRUE
          ELSE FALSE
        END AS auditor_action_completed,

        CASE
          WHEN EXISTS (
              SELECT 1
              FROM closure_requests closure_request
              WHERE
                  closure_request.patrol_id = p.id
                  AND closure_request.requested_by = $1
          )
          THEN TRUE
          ELSE FALSE
        END AS auditee_action_completed

      FROM patrols p

      JOIN units u
        ON u.id = p.unit_id

      JOIN zones z
        ON z.id = p.zone_id

      JOIN users auditor
        ON auditor.id = p.auditor_id

      JOIN users auditee
        ON auditee.id = p.auditee_id

      LEFT JOIN observation_reports
        AS observation_report
        ON observation_report.patrol_id = p.id

      WHERE
        (
          p.auditor_id = $1
          OR p.auditee_id = $1
        )
        AND p.scheduled_date >= $2::DATE
        AND p.scheduled_date < $3::DATE
        AND p.status <> 'CANCELLED'

      ORDER BY
        p.scheduled_date ASC,
        p.id ASC
    `,
    [
      userId,
      monthStart,
      monthEnd,
    ],
  );

  return result.rows.map(mapAudit);
}

export async function findUserCurrentWeekPatrols(
  {
    userId,
    weekStart,
    weekEnd,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        p.id,
        p.unit_id,
        u.name AS unit_name,
        p.zone_id,
        z.name AS zone_name,
        z.area_detail,
        p.scheduled_date,
        p.status,
        p.auditor_id,
        auditor.full_name AS auditor_name,
        p.auditee_id,
        auditee.full_name AS auditee_name,

        CASE
          WHEN p.auditor_id = $1
          THEN 'AUDITOR'

          WHEN p.auditee_id = $1
          THEN 'AUDITEE'

          ELSE NULL
        END AS assignment_role,

        observation_report.id
          AS observation_report_id,

        observation_report.status
          AS observation_report_status,

        CASE
          WHEN observation_report.id IS NOT NULL
           AND observation_report.status IN (
               'OPEN',
               'PENDING_AUDITEE_ACTION',
               'REEXAMINATION_REQUIRED'
           )
          THEN TRUE
          ELSE FALSE
        END AS has_open_observation_report,

        CASE
          WHEN observation_report.id IS NOT NULL
          THEN TRUE
          ELSE FALSE
        END AS auditor_action_completed,

        CASE
          WHEN EXISTS (
              SELECT 1
              FROM closure_requests closure_request
              WHERE
                  closure_request.patrol_id = p.id
                  AND closure_request.requested_by = $1
          )
          THEN TRUE
          ELSE FALSE
        END AS auditee_action_completed

      FROM patrols p

      JOIN units u
        ON u.id = p.unit_id

      JOIN zones z
        ON z.id = p.zone_id

      JOIN users auditor
        ON auditor.id = p.auditor_id

      JOIN users auditee
        ON auditee.id = p.auditee_id

      LEFT JOIN observation_reports
        AS observation_report
        ON observation_report.patrol_id = p.id

      WHERE
        (
          p.auditor_id = $1
          OR p.auditee_id = $1
        )
        AND p.scheduled_date >= $2::DATE
        AND p.scheduled_date < $3::DATE
        AND p.status <> 'CANCELLED'

      ORDER BY
        p.scheduled_date ASC,
        p.id ASC
    `,
    [
      userId,
      weekStart,
      weekEnd,
    ],
  );

  return result.rows.map(mapAudit);
}

export async function findManagementMonthlyPatrols(
  {
    monthStart,
    monthEnd,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        p.id,
        p.unit_id,
        u.name AS unit_name,
        p.zone_id,
        z.name AS zone_name,
        z.area_detail,
        p.scheduled_date,
        p.status,
        p.auditor_id,
        auditor.full_name AS auditor_name,
        p.auditee_id,
        auditee.full_name AS auditee_name,

        observation_report.id
          AS observation_report_id,

        observation_report.status
          AS observation_report_status,

        CASE
          WHEN observation_report.id IS NOT NULL
           AND observation_report.status IN (
               'OPEN',
               'PENDING_AUDITEE_ACTION',
               'REEXAMINATION_REQUIRED'
           )
          THEN TRUE
          ELSE FALSE
        END AS has_open_observation_report,

        CASE
          WHEN observation_report.id IS NOT NULL
          THEN TRUE
          ELSE FALSE
        END AS auditor_action_completed,

        CASE
          WHEN EXISTS (
              SELECT 1
              FROM closure_requests closure_request
              WHERE closure_request.patrol_id = p.id
          )
          THEN TRUE
          ELSE FALSE
        END AS auditee_action_completed

      FROM patrols p

      JOIN units u
        ON u.id = p.unit_id

      JOIN zones z
        ON z.id = p.zone_id

      JOIN users auditor
        ON auditor.id = p.auditor_id

      JOIN users auditee
        ON auditee.id = p.auditee_id

      LEFT JOIN observation_reports
        AS observation_report
        ON observation_report.patrol_id = p.id

      WHERE
        p.scheduled_date >= $1::DATE
        AND p.scheduled_date < $2::DATE
        AND p.status <> 'CANCELLED'

      ORDER BY
        p.scheduled_date ASC,
        z.name ASC,
        p.id ASC
    `,
    [
      monthStart,
      monthEnd,
    ],
  );

  return result.rows.map(mapAudit);
}

export async function findManagementCurrentWeekPatrols(
  {
    weekStart,
    weekEnd,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        p.id,
        p.unit_id,
        u.name AS unit_name,
        p.zone_id,
        z.name AS zone_name,
        z.area_detail,
        p.scheduled_date,
        p.status,
        p.auditor_id,
        auditor.full_name AS auditor_name,
        p.auditee_id,
        auditee.full_name AS auditee_name,

        observation_report.id
          AS observation_report_id,

        observation_report.status
          AS observation_report_status,

        CASE
          WHEN observation_report.id IS NOT NULL
           AND observation_report.status IN (
               'OPEN',
               'PENDING_AUDITEE_ACTION',
               'REEXAMINATION_REQUIRED'
           )
          THEN TRUE
          ELSE FALSE
        END AS has_open_observation_report,

        CASE
          WHEN observation_report.id IS NOT NULL
          THEN TRUE
          ELSE FALSE
        END AS auditor_action_completed,

        CASE
          WHEN EXISTS (
              SELECT 1
              FROM closure_requests closure_request
              WHERE closure_request.patrol_id = p.id
          )
          THEN TRUE
          ELSE FALSE
        END AS auditee_action_completed

      FROM patrols p

      JOIN units u
        ON u.id = p.unit_id

      JOIN zones z
        ON z.id = p.zone_id

      JOIN users auditor
        ON auditor.id = p.auditor_id

      JOIN users auditee
        ON auditee.id = p.auditee_id

      LEFT JOIN observation_reports
        AS observation_report
        ON observation_report.patrol_id = p.id

      WHERE
        p.scheduled_date >= $1::DATE
        AND p.scheduled_date < $2::DATE
        AND p.status <> 'CANCELLED'

      ORDER BY
        z.name ASC,
        p.scheduled_date ASC,
        p.id ASC
    `,
    [
      weekStart,
      weekEnd,
    ],
  );

  return result.rows.map(mapAudit);
}

/**
 * What this user has been asked to do this year, and how much of it is
 * done, split by the side of the patrol they were on.
 *
 * Bounded by `cutoffDate` (today) rather than running to the end of the
 * year, because a roster schedules every Monday to 31 December: counting
 * the whole year would tell somebody in January that they had done 2 of
 * 52 inspections. "Assigned so far" is the number that says whether they
 * are keeping up.
 *
 * The two sides are counted separately on purpose. One person is often
 * auditor on some zones and auditee on others, and the work differs:
 * an auditor conducts the inspection and files the report, an auditee
 * answers it with a closure. Merging them would report an auditee as
 * having "conducted" inspections somebody else carried out.
 */
export async function getUserAnnualMetrics(
  {
    userId,
    yearStart,
    cutoffDate,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      WITH assigned_patrols AS (
        SELECT
          patrol.id,
          patrol.auditor_id,
          patrol.auditee_id
        FROM patrols AS patrol
        WHERE
          (
            patrol.auditor_id = $1
            OR patrol.auditee_id = $1
          )
          AND patrol.scheduled_date >= $2::DATE
          AND patrol.scheduled_date <= $3::DATE
          AND patrol.status <> 'CANCELLED'
      )

      SELECT
        COUNT(*) FILTER (
          WHERE assigned_patrols.auditor_id = $1
        )::INTEGER AS auditor_assigned,

        /*
         * Conducted means the auditor filed something: an observation
         * report, or "no observation to record", which is equally a
         * completed inspection.
         */
        COUNT(*) FILTER (
          WHERE
            assigned_patrols.auditor_id = $1
            AND EXISTS (
              SELECT 1
              FROM observation_reports AS report
              WHERE report.patrol_id = assigned_patrols.id
            )
        )::INTEGER AS auditor_conducted,

        COUNT(*) FILTER (
          WHERE assigned_patrols.auditee_id = $1
        )::INTEGER AS auditee_assigned,

        /*
         * An auditee only has work once the auditor files a report that
         * has findings on it, so their denominator is the closures
         * actually raised for them, not every patrol they are named on.
         */
        COUNT(*) FILTER (
          WHERE
            assigned_patrols.auditee_id = $1
            AND EXISTS (
              SELECT 1
              FROM closure_requests AS closure
              WHERE closure.patrol_id = assigned_patrols.id
            )
        )::INTEGER AS closures_raised,

        COUNT(*) FILTER (
          WHERE
            assigned_patrols.auditee_id = $1
            AND EXISTS (
              SELECT 1
              FROM closure_requests AS closure
              WHERE closure.patrol_id = assigned_patrols.id
                AND closure.status = 'APPROVED'
            )
        )::INTEGER AS closures_approved

      FROM assigned_patrols
    `,
    [
      userId,
      yearStart,
      cutoffDate,
    ],
  );

  const row = result.rows[0] ?? {};

  return {
    auditorAssigned: row.auditor_assigned ?? 0,
    auditorConducted: row.auditor_conducted ?? 0,
    auditeeAssigned: row.auditee_assigned ?? 0,
    closuresRaised: row.closures_raised ?? 0,
    closuresApproved: row.closures_approved ?? 0,
  };
}

/**
 * The plant-wide picture for an EHS Officer: how much of the year's
 * planned inspection programme has actually happened, and what it
 * produced.
 *
 * `plantId` null means every plant, which is what a Plant Head or Admin
 * with no plant set sees.
 */
export async function getManagementAnnualMetrics(
  {
    plantId,
    yearStart,
    cutoffDate,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      WITH due_patrols AS (
        SELECT patrol.id
        FROM patrols AS patrol
        JOIN units AS unit_record
          ON unit_record.id = patrol.unit_id
        WHERE
          patrol.scheduled_date >= $2::DATE
          AND patrol.scheduled_date <= $3::DATE
          /*
           * A cancelled patrol was never owed, so it belongs in
           * neither side of the due-versus-conducted comparison.
           */
          AND patrol.status <> 'CANCELLED'
          AND (
            $1::BIGINT IS NULL
            OR unit_record.plant_id = $1::BIGINT
          )
      ),

      /*
       * One report per patrol is enforced by a unique constraint, so
       * this is also the count of inspections conducted.
       */
      due_reports AS (
        SELECT report.*
        FROM observation_reports AS report
        JOIN due_patrols
          ON due_patrols.id = report.patrol_id
      ),

      due_closures AS (
        SELECT closure.*
        FROM closure_requests AS closure
        JOIN due_patrols
          ON due_patrols.id = closure.patrol_id
      )

      SELECT
        (SELECT COUNT(*) FROM due_patrols)::INTEGER
          AS inspections_due,

        (SELECT COUNT(*) FROM due_reports)::INTEGER
          AS inspections_conducted,

        (
          SELECT COUNT(*) FROM due_reports
          WHERE no_observations = FALSE
        )::INTEGER AS reports_with_findings,

        (
          SELECT COUNT(*) FROM due_reports
          WHERE no_observations = TRUE
        )::INTEGER AS reports_without_findings,

        (SELECT COUNT(*) FROM due_closures)::INTEGER
          AS closures_raised,

        (
          SELECT COUNT(*) FROM due_closures
          WHERE status = 'APPROVED'
        )::INTEGER AS closures_approved
    `,
    [
      plantId ?? null,
      yearStart,
      cutoffDate,
    ],
  );

  const row = result.rows[0] ?? {};

  return {
    inspectionsDue: row.inspections_due ?? 0,
    inspectionsConducted:
      row.inspections_conducted ?? 0,
    reportsWithFindings:
      row.reports_with_findings ?? 0,
    reportsWithoutFindings:
      row.reports_without_findings ?? 0,
    closuresRaised: row.closures_raised ?? 0,
    closuresApproved:
      row.closures_approved ?? 0,
  };
}

/**
 * The plant the EHS Officer is responsible for, or null when unset.
 * Mirrors patrols/patrol.repository.js's findUserLocation; kept as its
 * own copy here rather than a cross-module import, matching the rest
 * of this module's self-contained repository functions.
 */
export async function findOfficerPlant(
  userId,
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        plant_record.id,
        plant_record.name,
        plant_record.code

      FROM users AS app_user

      JOIN plants AS plant_record
        ON plant_record.id = app_user.plant_id

      WHERE
        app_user.id = $1
        AND app_user.is_active = TRUE
        AND plant_record.is_active = TRUE
    `,
    [userId],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    code: row.code,
  };
}

/**
 * One row per zone-patrol scheduled in the plant's single upcoming
 * inspection week: the nearest week, on or after `weekStart`, that has
 * at least one non-cancelled patrol anywhere in the plant. Empty
 * (`[]`) when nothing is scheduled from `weekStart` onward.
 */
export async function findOfficerWeekPatrols(
  {
    plantId,
    weekStart,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      WITH plant_next_date AS (
        SELECT MIN(p.scheduled_date) AS next_date
        FROM patrols p
        JOIN units u
          ON u.id = p.unit_id
        WHERE
          u.plant_id = $1
          AND p.status <> 'CANCELLED'
          AND p.scheduled_date >= $2::DATE
      ),

      week_bounds AS (
        SELECT
          DATE_TRUNC('week', next_date)::DATE
            AS week_start,
          (
            DATE_TRUNC('week', next_date)
            + INTERVAL '6 day'
          )::DATE AS week_end
        FROM plant_next_date
        WHERE next_date IS NOT NULL
      )

      SELECT
        u.id AS unit_id,
        u.name AS unit_name,
        u.unit_number,

        week_bounds.week_start,
        week_bounds.week_end,

        p.id AS patrol_id,
        p.scheduled_date,
        p.status AS patrol_status,

        z.id AS zone_id,
        z.name AS zone_name,
        z.zone_number,

        p.auditor_id,
        auditor.full_name AS auditor_name,

        p.auditee_id,
        auditee.full_name AS auditee_name,

        observation_report.id
          AS observation_report_id,

        observation_report.no_observations,

        closure_request.id AS closure_id,
        closure_request.status AS closure_status

      FROM week_bounds

      JOIN patrols p
        ON p.status <> 'CANCELLED'
        AND p.scheduled_date >=
            week_bounds.week_start
        AND p.scheduled_date <=
            week_bounds.week_end

      JOIN units u
        ON u.id = p.unit_id
        AND u.plant_id = $1

      JOIN zones z
        ON z.id = p.zone_id

      LEFT JOIN users auditor
        ON auditor.id = p.auditor_id

      LEFT JOIN users auditee
        ON auditee.id = p.auditee_id

      LEFT JOIN observation_reports
        AS observation_report
        ON observation_report.patrol_id = p.id

      LEFT JOIN closure_requests
        AS closure_request
        ON closure_request.patrol_id = p.id

      ORDER BY
        u.unit_number ASC,
        u.name ASC,
        z.name ASC,
        p.scheduled_date ASC
    `,
    [plantId, weekStart],
  );

  return result.rows.map((row) => ({
    unitId: row.unit_id,
    unitName: row.unit_name,
    unitNumber: row.unit_number,

    weekStart: row.week_start,
    weekEnd: row.week_end,

    patrolId: row.patrol_id,
    scheduledDate: row.scheduled_date,
    patrolStatus: row.patrol_status,

    zoneId: row.zone_id,
    zoneName: row.zone_name,
    zoneNumber: row.zone_number,

    auditorId: row.auditor_id,
    auditorName: row.auditor_name,

    auditeeId: row.auditee_id,
    auditeeName: row.auditee_name,

    observationReportId:
      row.observation_report_id,

    noObservations:
      row.no_observations ?? false,

    closureId: row.closure_id,
    closureStatus: row.closure_status,
  }));
}