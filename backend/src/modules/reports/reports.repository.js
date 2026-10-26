import {
  databasePool,
} from "../../config/database.js";

/*
 * Reads for the weekly and yearly inspection reports (docs/23). All of
 * it is scoped to one plant, which the service takes from the signed-in
 * officer's own account.
 */

/**
 * The location a user belongs to.
 */
export async function findUserLocation(
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
 * The inspection weeks at a plant, newest first, for the weekly
 * report's week picker. Only weeks that had a non-cancelled audit
 * appear, so the officer is never offered an empty report.
 *
 * `reportCount` is audits with a report filed, not zones, so it is a
 * hint for the picker and not the report's own zone-level summary.
 */
export async function findInspectionWeeks(
  {
    plantId,
    fromDate,
    toDate,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        TO_CHAR(
          DATE_TRUNC(
            'week',
            patrol.scheduled_date
          ),
          'YYYY-MM-DD'
        ) AS week_start,

        COUNT(DISTINCT patrol.zone_id)::INTEGER
          AS zone_count,

        COUNT(report.id)::INTEGER
          AS report_count

      FROM patrols AS patrol

      JOIN units AS unit_record
        ON unit_record.id = patrol.unit_id

      LEFT JOIN observation_reports AS report
        ON report.patrol_id = patrol.id

      WHERE
        unit_record.plant_id = $1
        AND patrol.scheduled_date >= $2::DATE
        AND patrol.scheduled_date <= $3::DATE
        AND patrol.status <> 'CANCELLED'

      GROUP BY week_start

      ORDER BY week_start DESC
    `,
    [plantId, fromDate, toDate],
  );

  return result.rows.map((row) => ({
    weekStart: row.week_start,
    zoneCount: row.zone_count,
    reportCount: row.report_count,
  }));
}

/**
 * Every non-cancelled audit at a plant in one week, with its report and
 * closure header when they exist. The observations themselves come from
 * findReportItemsForReport so a report with ten of them does not
 * multiply this result.
 */
export async function findWeekPatrolsForReport(
  {
    plantId,
    weekStart,
    weekEnd,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        patrol.id AS patrol_id,

        TO_CHAR(
          patrol.scheduled_date,
          'YYYY-MM-DD'
        ) AS scheduled_date,

        unit_record.id AS unit_id,
        unit_record.unit_number,
        unit_record.name AS unit_name,

        zone_record.id AS zone_id,
        zone_record.zone_number,
        zone_record.name AS zone_name,

        auditor.full_name AS auditor_name,
        auditee.full_name AS auditee_name,

        report.id AS report_id,
        report.report_number,
        report.no_observations,

        hod.full_name AS hod_name,

        closure.id AS closure_id,
        closure.status AS closure_status,
        closure.approval_iteration,
        closure.review_comments,

        TO_CHAR(
          closure.approved_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD'
        ) AS approved_on,

        reviewer.full_name AS reviewer_name

      FROM patrols AS patrol

      JOIN units AS unit_record
        ON unit_record.id = patrol.unit_id

      JOIN zones AS zone_record
        ON zone_record.id = patrol.zone_id

      JOIN users AS auditor
        ON auditor.id = patrol.auditor_id

      JOIN users AS auditee
        ON auditee.id = patrol.auditee_id

      LEFT JOIN observation_reports AS report
        ON report.patrol_id = patrol.id

      LEFT JOIN users AS hod
        ON hod.id = report.hod_id

      LEFT JOIN closure_requests AS closure
        ON closure.observation_report_id = report.id

      LEFT JOIN users AS reviewer
        ON reviewer.id = closure.reviewed_by

      WHERE
        unit_record.plant_id = $1
        AND unit_record.is_active
        AND zone_record.is_active
        AND patrol.scheduled_date >= $2::DATE
        AND patrol.scheduled_date <= $3::DATE
        AND patrol.status <> 'CANCELLED'

      ORDER BY
        unit_record.unit_number NULLS LAST,
        unit_record.name,
        zone_record.zone_number NULLS LAST,
        zone_record.name,
        patrol.scheduled_date,
        patrol.id
    `,
    [plantId, weekStart, weekEnd],
  );

  return result.rows.map((row) => ({
    patrolId: Number(row.patrol_id),
    scheduledDate: row.scheduled_date,
    unitId: Number(row.unit_id),
    unitNumber: row.unit_number,
    unitName: row.unit_name,
    zoneId: Number(row.zone_id),
    zoneNumber: row.zone_number,
    zoneName: row.zone_name,
    auditorName: row.auditor_name,
    auditeeName: row.auditee_name,
    reportId:
      row.report_id === null
        ? null
        : Number(row.report_id),
    reportNumber: row.report_number ?? null,
    hodName: row.hod_name ?? null,
    noObservations:
      row.no_observations === true,
    closureStatus: row.closure_status ?? null,
    approvalIteration:
      row.approval_iteration ?? null,
    reviewComments: row.review_comments ?? null,
    approvedOn: row.approved_on ?? null,
    reviewerName: row.reviewer_name ?? null,
  }));
}

/**
 * The observations of the given reports, each with its closure item's
 * action plan, target date and evidence count, in report order.
 */
export async function findReportItemsForReport(
  { reportIds },
  client = databasePool,
) {
  if (!reportIds || reportIds.length === 0) {
    return [];
  }

  const result = await client.query(
    `
      SELECT
        item.id AS item_id,
        item.observation_report_id,
        item.sequence_number,
        item.photograph_path,
        item.photograph_mime_type,
        item.category,
        item.risk_category,
        item.description,

        COALESCE(
          zone_area.name::TEXT,
          item.observation_location
        ) AS area_name,

        closure_item.action_plan,

        TO_CHAR(
          closure_item.target_date,
          'YYYY-MM-DD'
        ) AS target_date,

        (
          SELECT COUNT(*)::INTEGER
          FROM closure_item_evidence AS evidence
          WHERE
            evidence.closure_item_id =
              closure_item.id
        ) AS evidence_count

      FROM observation_items AS item

      LEFT JOIN zone_areas AS zone_area
        ON zone_area.id = item.zone_area_id

      LEFT JOIN closure_items AS closure_item
        ON closure_item.observation_item_id = item.id

      WHERE
        item.observation_report_id =
          ANY($1::BIGINT[])

      ORDER BY
        item.observation_report_id,
        item.sequence_number
    `,
    [reportIds],
  );

  return result.rows.map((row) => ({
    itemId: Number(row.item_id),
    reportId: Number(row.observation_report_id),
    photographPath: row.photograph_path ?? null,
    photographMimeType:
      row.photograph_mime_type ?? null,
    sequenceNumber: row.sequence_number,
    category: row.category,
    riskCategory: row.risk_category,
    description: row.description,
    areaName: row.area_name ?? null,
    actionPlan: row.action_plan ?? null,
    targetDate: row.target_date ?? null,
    evidenceCount: row.evidence_count ?? 0,
  }));
}

/**
 * The company years (1 April to 31 March) that had a non-cancelled audit at a plant, up to
 * today, newest first, with how many were scheduled and conducted. The
 * service adds the current year when it is missing.
 */
export async function findInspectionYears(
  {
    plantId,
    cutoffDate,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        /*
         * The company year starts on 1 April, so three months back puts
         * April on January: 2026-04-01 and 2027-03-31 both fall in 2026.
         */
        EXTRACT(
          YEAR FROM (
            patrol.scheduled_date
            - INTERVAL '3 months'
          )
        )::INTEGER AS year,

        COUNT(*)::INTEGER AS scheduled_count,

        COUNT(report.id)::INTEGER
          AS conducted_count

      FROM patrols AS patrol

      JOIN units AS unit_record
        ON unit_record.id = patrol.unit_id

      LEFT JOIN observation_reports AS report
        ON report.patrol_id = patrol.id

      WHERE
        unit_record.plant_id = $1
        AND patrol.scheduled_date <= $2::DATE
        AND patrol.status <> 'CANCELLED'

      GROUP BY year

      ORDER BY year DESC
    `,
    [plantId, cutoffDate],
  );

  return result.rows.map((row) => ({
    year: row.year,
    scheduledCount: row.scheduled_count,
    conductedCount: row.conducted_count,
  }));
}

/**
 * Every active zone of every active unit at a plant with its totals
 * for the period, including zones with nothing scheduled, which show
 * as zero (docs/23 D9).
 *
 * Scheduled is non-cancelled audits dated in the period. Conducted is
 * those with an observation report, the same test as every other
 * report. A report with findings is one with no_observations false.
 * Closures are counted per report, and observation items per report
 * before joining, so a report with ten observations does not multiply
 * the other counts.
 */
export async function findYearlyZoneTotals(
  {
    plantId,
    fromDate,
    cutoffDate,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        unit_record.id AS unit_id,
        unit_record.unit_number,
        unit_record.name AS unit_name,

        zone_record.id AS zone_id,
        zone_record.zone_number,
        zone_record.name AS zone_name,

        COUNT(patrol.id)::INTEGER
          AS scheduled_count,

        COUNT(report.id)::INTEGER
          AS conducted_count,

        COUNT(report.id) FILTER (
          WHERE report.no_observations = FALSE
        )::INTEGER AS observation_report_count,

        COUNT(report.id) FILTER (
          WHERE report.no_observations = TRUE
        )::INTEGER AS no_observation_count,

        COALESCE(
          SUM(item_counts.item_count),
          0
        )::INTEGER AS observation_count,

        COUNT(closure.id) FILTER (
          WHERE closure.status = 'APPROVED'
        )::INTEGER AS closures_approved,

        COUNT(closure.id) FILTER (
          WHERE closure.status <> 'APPROVED'
        )::INTEGER AS closures_open

      FROM zones AS zone_record

      JOIN units AS unit_record
        ON unit_record.id = zone_record.unit_id

      LEFT JOIN patrols AS patrol
        ON patrol.zone_id = zone_record.id
        AND patrol.status <> 'CANCELLED'
        AND patrol.scheduled_date >= $2::DATE
        AND patrol.scheduled_date <= $3::DATE

      LEFT JOIN observation_reports AS report
        ON report.patrol_id = patrol.id

      LEFT JOIN closure_requests AS closure
        ON closure.observation_report_id = report.id

      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INTEGER AS item_count

        FROM observation_items AS item

        WHERE
          item.observation_report_id = report.id
      ) AS item_counts ON TRUE

      WHERE
        unit_record.plant_id = $1
        AND unit_record.is_active
        AND zone_record.is_active

      GROUP BY
        unit_record.id,
        zone_record.id

      ORDER BY
        unit_record.unit_number NULLS LAST,
        unit_record.name,
        zone_record.zone_number NULLS LAST,
        zone_record.name
    `,
    [plantId, fromDate, cutoffDate],
  );

  return result.rows.map((row) => ({
    unitId: Number(row.unit_id),
    unitNumber: row.unit_number,
    unitName: row.unit_name,
    zoneId: Number(row.zone_id),
    zoneNumber: row.zone_number,
    zoneName: row.zone_name,
    scheduledCount: row.scheduled_count,
    conductedCount: row.conducted_count,
    observationReportCount:
      row.observation_report_count,
    noObservationCount: row.no_observation_count,
    observationCount: row.observation_count,
    closuresApproved: row.closures_approved,
    closuresOpen: row.closures_open,
  }));
}

/**
 * One row per zone per inspection week in the period, with how many
 * audits were scheduled and how many were conducted. It feeds the
 * week-by-week strip under each zone on the Report page.
 */
export async function findYearlyZoneWeeks(
  {
    plantId,
    fromDate,
    cutoffDate,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        patrol.zone_id,

        TO_CHAR(
          DATE_TRUNC(
            'week',
            patrol.scheduled_date
          ),
          'YYYY-MM-DD'
        ) AS week_start,

        COUNT(*)::INTEGER AS scheduled_count,

        COUNT(report.id)::INTEGER
          AS conducted_count

      FROM patrols AS patrol

      JOIN units AS unit_record
        ON unit_record.id = patrol.unit_id

      LEFT JOIN observation_reports AS report
        ON report.patrol_id = patrol.id

      WHERE
        unit_record.plant_id = $1
        AND patrol.scheduled_date >= $2::DATE
        AND patrol.scheduled_date <= $3::DATE
        AND patrol.status <> 'CANCELLED'

      GROUP BY
        patrol.zone_id,
        week_start

      ORDER BY
        week_start,
        patrol.zone_id
    `,
    [plantId, fromDate, cutoffDate],
  );

  return result.rows.map((row) => ({
    zoneId: Number(row.zone_id),
    weekStart: row.week_start,
    scheduledCount: row.scheduled_count,
    conductedCount: row.conducted_count,
  }));
}
