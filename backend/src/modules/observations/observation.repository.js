import {
  databasePool,
} from "../../config/database.js";

function mapAssignment(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,

    scheduledDate:
      row.scheduled_date,

    weekNumber:
      Number(row.week_number),

    unitId:
      row.unit_id,

    unitNumber:
      row.unit_number ??
      row.unit_name,

    unitName:
      row.unit_name,

    zoneId:
      row.zone_id,

    zoneNumber:
      row.zone_number ??
      row.zone_name,

    zoneName:
      row.zone_name,

    plantLocation:
      row.plant_location,

    /*
     * The zone description, kept for display. The area a finding
     * occurred in is chosen by the auditor from `areas` below.
     */
    observationLocation:
      row.area_detail,

    areas: row.areas ?? [],

    auditorId:
      row.auditor_id,

    auditorName:
      row.auditor_name,

    auditeeId:
      row.auditee_id,

    auditeeName:
      row.auditee_name,

    ehsOfficerId:
      row.ehs_officer_id,

    ehsOfficerName:
      row.ehs_officer_name,

    status:
      row.status,
  };
}

function mapReport(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,

    reportNumber:
      row.report_number,

    patrolId:
      row.patrol_id,

    status:
      row.status,

    findingDate:
      row.finding_date,

    plantLocation:
      row.plant_location,

    observationLocation:
      row.observation_location,

    category:
      row.category,

    description:
      row.description,

    riskCategory:
      row.risk_category,

    zoneAreaId:
      row.zone_area_id ?? null,

    areaName:
      row.area_name ?? null,

    photographPath:
      row.photograph_path,

    photographOriginalName:
      row.photograph_original_name,

    submittedAt:
      row.submitted_at,

    closedAt:
      row.closed_at,
  };
}

export async function findCalendarPatrols({
  userId,
  startDate,
  endDate,
}) {
  const result =
    await databasePool.query(
      `
        SELECT
          patrol.id,
          patrol.scheduled_date,
          patrol.status,
          patrol.plant_location,
          patrol.area_detail,

          unit_record.unit_number,
          unit_record.name
            AS unit_name,

          zone_record.zone_number,
          zone_record.name
            AS zone_name,

          auditor.full_name
            AS auditor_name,

          auditee.full_name
            AS auditee_name,

          ehs_officer.full_name
            AS ehs_officer_name

        FROM patrols AS patrol

        JOIN units AS unit_record
          ON unit_record.id =
             patrol.unit_id

        JOIN zones AS zone_record
          ON zone_record.id =
             patrol.zone_id

        JOIN users AS auditor
          ON auditor.id =
             patrol.auditor_id

        JOIN users AS auditee
          ON auditee.id =
             patrol.auditee_id

        LEFT JOIN users AS ehs_officer
          ON ehs_officer.id =
             patrol.ehs_officer_id

        WHERE
          patrol.scheduled_date
            BETWEEN $2::DATE
            AND $3::DATE

          AND patrol.status <>
              'CANCELLED'

          AND (
            patrol.auditor_id = $1
            OR patrol.auditee_id = $1
            OR patrol.ehs_officer_id = $1
          )

        ORDER BY
          patrol.scheduled_date,
          patrol.id
      `,
      [
        userId,
        startDate,
        endDate,
      ],
    );

  return result.rows;
}

/**
 * Finds the authenticated user's current weekly patrol
 * assignments where that user is the assigned auditor.
 *
 * Week number is the sequential patrol number for that Zone,
 * ordered by scheduled date and patrol ID.
 */
/**
 * Every non-cancelled patrol in the current week where this user is the
 * auditor, each with its observation report if one has been filed.
 *
 * The previous version excluded filed observations twice over, by patrol
 * status and by requiring no report row, so the page could never show a
 * submitted report. Both filters are gone: the caller decides what is
 * pending and what is submitted.
 */
export async function findWeeklyAuditorAssignments(
  {
    auditorId,
    currentDate,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      WITH zone_patrol_sequence AS (
        SELECT
          patrol.id,

          ROW_NUMBER() OVER (
            PARTITION BY patrol.zone_id
            ORDER BY
              patrol.scheduled_date ASC,
              patrol.id ASC
          ) AS week_number

        FROM patrols AS patrol

        WHERE patrol.status <> 'CANCELLED'
      )

      SELECT
        patrol.id,
        patrol.scheduled_date,
        patrol.status,

        sequence.week_number,

        unit_record.id AS unit_id,
        unit_record.unit_number,
        unit_record.name AS unit_name,

        zone_record.id AS zone_id,
        zone_record.zone_number,
        zone_record.name AS zone_name,
        zone_record.area_detail,

        plant_record.id AS plant_id,
        plant_record.name AS plant_location,

        patrol.auditor_id,
        auditor.full_name AS auditor_name,

        patrol.auditee_id,
        auditee.full_name AS auditee_name,

        patrol.ehs_officer_id,
        ehs_officer.full_name AS ehs_officer_name,

        observation_report.id AS report_id,
        observation_report.report_number,
        observation_report.status AS report_status,
        observation_report.submitted_at,
        observation_report.category,
        observation_report.risk_category,
        observation_report.zone_area_id,
        report_area.name AS report_area_name,

        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', zone_area.id,
              'name', zone_area.name
            )
            ORDER BY
              zone_area.display_order,
              zone_area.name
          ) FILTER (
            WHERE zone_area.id IS NOT NULL
          ),
          '[]'::JSON
        ) AS areas

      FROM patrols AS patrol

      JOIN zone_patrol_sequence AS sequence
        ON sequence.id = patrol.id

      JOIN units AS unit_record
        ON unit_record.id = patrol.unit_id

      JOIN plants AS plant_record
        ON plant_record.id = unit_record.plant_id

      JOIN zones AS zone_record
        ON zone_record.id = patrol.zone_id

      JOIN users AS auditor
        ON auditor.id = patrol.auditor_id

      JOIN users AS auditee
        ON auditee.id = patrol.auditee_id

      LEFT JOIN users AS ehs_officer
        ON ehs_officer.id = patrol.ehs_officer_id

      LEFT JOIN observation_reports AS observation_report
        ON observation_report.patrol_id = patrol.id

      LEFT JOIN zone_areas AS report_area
        ON report_area.id = observation_report.zone_area_id

      LEFT JOIN zone_areas AS zone_area
        ON zone_area.zone_id = zone_record.id
       AND zone_area.is_active = TRUE

      WHERE
        patrol.auditor_id = $1
        AND patrol.status <> 'CANCELLED'

        AND patrol.scheduled_date >=
          DATE_TRUNC('week', $2::DATE)::DATE

        AND patrol.scheduled_date <
          (
            DATE_TRUNC('week', $2::DATE)
            + INTERVAL '7 days'
          )::DATE

      GROUP BY
        patrol.id, sequence.week_number,
        unit_record.id, zone_record.id, plant_record.id,
        auditor.full_name, auditee.full_name,
        ehs_officer.full_name,
        observation_report.id, report_area.name

      ORDER BY
        patrol.scheduled_date ASC,
        patrol.id ASC
    `,
    [auditorId, currentDate],
  );

  return result.rows.map((row) => ({
    ...mapAssignment(row),

    report: row.report_id
      ? {
          id: row.report_id,
          reportNumber: row.report_number,
          status: row.report_status,
          submittedAt: row.submitted_at,
          category: row.category,
          riskCategory: row.risk_category,
          zoneAreaId: row.zone_area_id,
          areaName: row.report_area_name,
        }
      : null,
  }));
}

export async function findPhotographByReportId(
  {
    reportId,
    userId,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        observation_report.id,
        observation_report.photograph_path,
        observation_report.photograph_original_name,
        observation_report.photograph_mime_type,
        observation_report.photograph_size

      FROM observation_reports
        AS observation_report

      JOIN patrols AS patrol
        ON patrol.id =
          observation_report.patrol_id

      WHERE
        observation_report.id = $1
        AND (
          patrol.auditor_id = $2
          OR patrol.auditee_id = $2
          OR patrol.ehs_officer_id = $2
        )

      LIMIT 1
    `,
    [
      reportId,
      userId,
    ],
  );

  return result.rows[0] ?? null;
}

export async function createClosureAssignment(
  {
    observationReportId,
    patrolId,
    auditeeId,
  },
  client,
) {
  const result = await client.query(
    `
      INSERT INTO closure_requests (
        observation_report_id,
        patrol_id,
        requested_by,
        status,
        requested_at,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        'OPEN',
        NOW(),
        NOW(),
        NOW()
      )
      ON CONFLICT (
        observation_report_id
      )
      DO NOTHING
      RETURNING
        id,
        observation_report_id,
        patrol_id,
        requested_by,
        status,
        requested_at
    `,
    [
      observationReportId,
      patrolId,
      auditeeId,
    ],
  );

  if (result.rows[0]) {
    return result.rows[0];
  }

  const existingResult =
    await client.query(
      `
        SELECT
          id,
          observation_report_id,
          patrol_id,
          requested_by,
          status,
          requested_at
        FROM closure_requests
        WHERE observation_report_id = $1
        LIMIT 1
      `,
      [observationReportId],
    );

  return existingResult.rows[0] ?? null;
}

export async function findPatrolForSubmission(
  {
    patrolId,
    auditorId,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        patrol.id,
        patrol.scheduled_date,
        patrol.status,

        patrol.unit_id,
        unit.name AS unit_name,
        unit.unit_number,

        patrol.zone_id,
        zone.name AS zone_name,
        zone.zone_number,
        zone.area_detail,

        plant.name AS plant_location,

        patrol.auditor_id,
        auditor.full_name
          AS auditor_name,

        patrol.auditee_id,
        auditee.full_name
          AS auditee_name,

        patrol.ehs_officer_id,
        ehs_officer.full_name
          AS ehs_officer_name,

        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', zone_area.id,
              'name', zone_area.name
            )
            ORDER BY
              zone_area.display_order,
              zone_area.name
          ) FILTER (
            WHERE zone_area.id IS NOT NULL
          ),
          '[]'::JSON
        ) AS areas

      FROM patrols patrol

      JOIN units unit
        ON unit.id = patrol.unit_id

      JOIN plants plant
        ON plant.id = unit.plant_id

      JOIN zones zone
        ON zone.id = patrol.zone_id

      JOIN users auditor
        ON auditor.id = patrol.auditor_id

      JOIN users auditee
        ON auditee.id = patrol.auditee_id

      LEFT JOIN users ehs_officer
        ON ehs_officer.id =
           patrol.ehs_officer_id

      LEFT JOIN zone_areas zone_area
        ON zone_area.zone_id = patrol.zone_id
       AND zone_area.is_active = TRUE

      WHERE
        patrol.id = $1
        AND patrol.auditor_id = $2

      GROUP BY
        patrol.id, unit.id, zone.id, plant.id,
        auditor.full_name, auditee.full_name,
        ehs_officer.full_name

      LIMIT 1
    `,
    [
      patrolId,
      auditorId,
    ],
  );

  return mapAssignment(
    result.rows[0],
  );
}

export async function findReportByPatrolId(
  patrolId,
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        observation_report.id,
        observation_report.report_number,
        observation_report.patrol_id,
        observation_report.status,
        observation_report.finding_date,
        observation_report.plant_location,
        observation_report.observation_location,
        observation_report.category,
        observation_report.description,
        observation_report.risk_category,
        observation_report.photograph_path,
        observation_report.photograph_original_name,
        observation_report.submitted_at,
        observation_report.closed_at

      FROM observation_reports
          observation_report

      WHERE
        observation_report.patrol_id = $1

      LIMIT 1
    `,
    [patrolId],
  );

  return mapReport(
    result.rows[0],
  );
}

export async function createReport(
  {
    patrolId,
    auditorId,
    auditeeId,
    findingDate,
    plantLocation,
    observationLocation,
    category,
    description,
    riskCategory,
    zoneAreaId,
    photograph,
  },
  client,
) {
  const result = await client.query(
    `
      INSERT INTO observation_reports (
        patrol_id,
        submitted_by,
        submitted_to,
        status,
        finding_date,
        plant_location,
        observation_location,
        category,
        photograph_path,
        photograph_original_name,
        photograph_mime_type,
        photograph_size,
        description,
        risk_category,
        zone_area_id
      )
      VALUES (
        $1,
        $2,
        $3,
        'PENDING_AUDITEE_ACTION',
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14
      )
      RETURNING
        id,
        patrol_id,
        status,
        finding_date,
        plant_location,
        observation_location,
        category,
        photograph_path,
        photograph_original_name,
        description,
        risk_category,
        zone_area_id,
        submitted_at,
        closed_at
    `,
    [
      patrolId,
      auditorId,
      auditeeId,
      findingDate,
      plantLocation,
      observationLocation,
      category,
      photograph.path,
      photograph.originalName,
      photograph.mimeType,
      photograph.size,
      description,
      riskCategory,
      zoneAreaId,
    ],
  );

  const createdReport =
    result.rows[0];

  const reportNumber =
    `POR-${new Date().getUTCFullYear()}-${String(
      createdReport.id,
    ).padStart(6, "0")}`;

  const numberedResult =
    await client.query(
      `
        UPDATE observation_reports
        SET
          report_number = $1,
          updated_at = NOW()
        WHERE id = $2
        RETURNING
          id,
          report_number,
          patrol_id,
          status,
          finding_date,
          plant_location,
          observation_location,
          category,
          photograph_path,
          photograph_original_name,
          description,
          risk_category,
          zone_area_id,
          submitted_at,
          closed_at
      `,
      [
        reportNumber,
        createdReport.id,
      ],
    );

  return mapReport(
    numberedResult.rows[0],
  );
}

export async function updatePatrolAfterSubmission(
  patrolId,
  client,
) {
  await client.query(
    `
      UPDATE patrols
      SET
        status =
          'PENDING_AUDITEE_ACTION',

        updated_at = NOW()

      WHERE id = $1
    `,
    [patrolId],
  );
}

/**
 * One observation report with the context needed to display it.
 *
 * Ownership mirrors the photograph route: the auditor who filed it, the
 * auditee who must act on it, and the EHS Officer who owns the patrol.
 * Anyone else gets nothing, so a guessed id leaks no data.
 */
export async function findReportByIdForUser(
  {
    reportId,
    userId,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        observation_report.id,
        observation_report.report_number,
        observation_report.patrol_id,
        observation_report.status,
        observation_report.finding_date,
        observation_report.plant_location,
        observation_report.observation_location,
        observation_report.category,
        observation_report.description,
        observation_report.risk_category,
        observation_report.photograph_path,
        observation_report.photograph_original_name,
        observation_report.submitted_at,
        observation_report.closed_at,
        observation_report.zone_area_id,

        zone_area.name AS area_name,

        patrol.scheduled_date,
        unit_record.name AS unit_name,
        unit_record.unit_number,
        zone_record.name AS zone_name,
        zone_record.zone_number,
        plant_record.name AS plant_name,

        auditor.full_name AS auditor_name,
        auditee.full_name AS auditee_name,
        ehs_officer.full_name AS ehs_officer_name

      FROM observation_reports AS observation_report

      JOIN patrols AS patrol
        ON patrol.id = observation_report.patrol_id

      JOIN units AS unit_record
        ON unit_record.id = patrol.unit_id

      JOIN plants AS plant_record
        ON plant_record.id = unit_record.plant_id

      JOIN zones AS zone_record
        ON zone_record.id = patrol.zone_id

      JOIN users AS auditor
        ON auditor.id = patrol.auditor_id

      JOIN users AS auditee
        ON auditee.id = patrol.auditee_id

      LEFT JOIN users AS ehs_officer
        ON ehs_officer.id = patrol.ehs_officer_id

      LEFT JOIN zone_areas AS zone_area
        ON zone_area.id = observation_report.zone_area_id

      WHERE
        observation_report.id = $1
        AND (
          patrol.auditor_id = $2
          OR patrol.auditee_id = $2
          OR patrol.ehs_officer_id = $2
        )

      LIMIT 1
    `,
    [reportId, userId],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    ...mapReport(row),

    scheduledDate: row.scheduled_date,
    unitName: row.unit_name,
    unitNumber: row.unit_number,
    zoneName: row.zone_name,
    zoneNumber: row.zone_number,
    plantName: row.plant_name,
    auditorName: row.auditor_name,
    auditeeName: row.auditee_name,
    ehsOfficerName: row.ehs_officer_name,
  };
}
