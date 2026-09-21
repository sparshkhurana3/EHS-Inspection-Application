import {
  databasePool,
} from "../../config/database.js";

const RISK_RANK = {
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

const RISK_LABEL_BY_RANK = {
  1: "HIGH",
  2: "MEDIUM",
  3: "LOW",
};

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

    noObservations:
      row.no_observations ?? false,

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

function mapItem(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    sequenceNumber: Number(
      row.sequence_number,
    ),
    zoneAreaId: row.zone_area_id ?? null,
    areaName: row.area_name ?? null,
    observationLocation:
      row.observation_location,
    category: row.category,
    description: row.description,
    riskCategory: row.risk_category,
    photographOriginalName:
      row.photograph_original_name,
  };
}

/*
 * A report's highest-severity observation, for list display. Any HIGH
 * beats any MEDIUM beats any LOW; null when the report has no items
 * (a "no observation" closure).
 */
function highestRiskLabel(rank) {
  if (rank === null || rank === undefined) {
    return null;
  }

  return (
    RISK_LABEL_BY_RANK[Number(rank)] ??
    null
  );
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
 * Every non-cancelled patrol in the current week where this user is the
 * auditor, each with its observation report if one has been filed, plus
 * any still-unfiled audit from the previous 4 weeks (so a missed
 * Thursday deadline does not silently disappear when the week rolls
 * over). Week number is the ISO week of the scheduled date, matching
 * the dashboard's "Week N audit" label.
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
      SELECT
        patrol.id,
        patrol.scheduled_date,
        patrol.status,

        /*
         * PostgreSQL's WEEK field is already the ISO 8601 week-
         * numbering week, matching the dashboard's "Week N audit".
         */
        EXTRACT(
          WEEK FROM patrol.scheduled_date
        )::INT AS week_number,

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
        observation_report.no_observations,
        observation_report.closed_at,
        observation_report.submitted_at,
        observation_report.category,
        observation_report.risk_category,
        observation_report.zone_area_id,
        report_area.name AS report_area_name,

        closure_request.id AS closure_id,
        closure_request.status AS closure_status,

        latest_ticket.id AS ticket_id,
        latest_ticket.status AS ticket_status,
        latest_ticket.decision AS ticket_decision,
        latest_ticket.closure_date AS ticket_closure_date,

        (
          SELECT COUNT(*)
          FROM observation_items AS item
          WHERE item.observation_report_id =
            observation_report.id
        ) AS observation_count,

        (
          SELECT MIN(
            CASE item.risk_category
              WHEN 'HIGH' THEN 1
              WHEN 'MEDIUM' THEN 2
              ELSE 3
            END
          )
          FROM observation_items AS item
          WHERE item.observation_report_id =
            observation_report.id
        ) AS highest_risk_rank,

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

      LEFT JOIN closure_requests AS closure_request
        ON closure_request.observation_report_id =
           observation_report.id

      LEFT JOIN LATERAL (
        SELECT
          ticket.id,
          ticket.status,
          ticket.decision,
          ticket.closure_date
        FROM action_tickets AS ticket
        WHERE ticket.closure_request_id =
          closure_request.id
        ORDER BY ticket.closure_round DESC
        LIMIT 1
      ) AS latest_ticket ON TRUE

      LEFT JOIN zone_areas AS zone_area
        ON zone_area.zone_id = zone_record.id
       AND zone_area.is_active = TRUE

      WHERE
        patrol.auditor_id = $1
        AND patrol.status <> 'CANCELLED'
        AND (
          (
            patrol.scheduled_date >=
              DATE_TRUNC('week', $2::DATE)::DATE
            AND patrol.scheduled_date <
              (
                DATE_TRUNC('week', $2::DATE)
                + INTERVAL '7 days'
              )::DATE
          )
          OR (
            observation_report.id IS NULL
            AND patrol.scheduled_date >=
              (
                DATE_TRUNC('week', $2::DATE)
                - INTERVAL '28 days'
              )::DATE
            AND patrol.scheduled_date <
              DATE_TRUNC('week', $2::DATE)::DATE
          )
        )

      GROUP BY
        patrol.id,
        unit_record.id, zone_record.id, plant_record.id,
        auditor.full_name, auditee.full_name,
        ehs_officer.full_name,
        observation_report.id, report_area.name,
        closure_request.id, closure_request.status,
        latest_ticket.id, latest_ticket.status,
        latest_ticket.decision, latest_ticket.closure_date

      ORDER BY
        patrol.scheduled_date ASC,
        patrol.id ASC
    `,
    [auditorId, currentDate],
  );

  return result.rows.map((row) => ({
    ...mapAssignment(row),

    weekNumber: Number(row.week_number),

    report: row.report_id
      ? {
          id: row.report_id,
          reportNumber: row.report_number,
          status: row.report_status,
          noObservations:
            row.no_observations ?? false,
          closedAt: row.closed_at,
          submittedAt: row.submitted_at,
          category: row.category,
          riskCategory: row.risk_category,
          zoneAreaId: row.zone_area_id,
          areaName: row.report_area_name,
          observationCount: Number(
            row.observation_count ?? 0,
          ),
          highestRisk: highestRiskLabel(
            row.highest_risk_rank,
          ),
          closureId: row.closure_id,
          closureStatus:
            row.closure_status,
          ticketId: row.ticket_id,
          ticketStatus: row.ticket_status,
          ticketDecision:
            row.ticket_decision,
          ticketClosureDate:
            row.ticket_closure_date,
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
          OR EXISTS (
            SELECT 1
            FROM action_tickets AS ticket
            WHERE
              ticket.observation_report_id =
                observation_report.id
              AND ticket.action_hod_id = $2
          )
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

/**
 * Every observation on a report, in the order they were entered.
 */
export async function findItemsByReportId(
  reportId,
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        item.id,
        item.sequence_number,
        item.zone_area_id,
        item.observation_location,
        item.category,
        item.description,
        item.risk_category,
        item.photograph_original_name,

        zone_area.name AS area_name

      FROM observation_items AS item

      LEFT JOIN zone_areas AS zone_area
        ON zone_area.id = item.zone_area_id

      WHERE item.observation_report_id = $1

      ORDER BY item.sequence_number
    `,
    [reportId],
  );

  return result.rows.map(mapItem);
}

/**
 * One observation's photograph. Same ownership rule as
 * findPhotographByReportId, scoped to the item's own report.
 */
export async function findItemPhotograph(
  {
    reportId,
    itemId,
    userId,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        item.id,
        item.photograph_path,
        item.photograph_original_name,
        item.photograph_mime_type,
        item.photograph_size

      FROM observation_items AS item

      JOIN observation_reports
        AS observation_report
        ON observation_report.id =
           item.observation_report_id

      JOIN patrols AS patrol
        ON patrol.id =
          observation_report.patrol_id

      JOIN units AS unit_record
        ON unit_record.id = patrol.unit_id

      WHERE
        item.observation_report_id = $1
        AND item.id = $2
        AND (
          patrol.auditor_id = $3
          OR patrol.auditee_id = $3
          OR patrol.ehs_officer_id = $3
          OR EXISTS (
            SELECT 1
            FROM action_tickets AS ticket
            WHERE
              ticket.observation_report_id =
                observation_report.id
              AND ticket.action_hod_id = $3
          )
          /*
           * Same plant-management scope as
           * findReportByIdForUser: whoever may open the
           * report may see its photographs.
           */
          OR EXISTS (
            SELECT 1
            FROM users AS me
            JOIN user_roles AS ur
              ON ur.user_id = me.id
            JOIN roles AS ro
              ON ro.id = ur.role_id
            WHERE
              me.id = $3
              AND me.plant_id = unit_record.plant_id
              AND ro.code IN (
                'EHS_OFFICER', 'HOD',
                'PLANT_HEAD', 'ADMIN'
              )
          )
        )

      LIMIT 1
    `,
    [reportId, itemId, userId],
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

/**
 * One closure item per observation, created with the closure itself so
 * the auditee has a row to write each observation's action plan into
 * (docs/16-closure-refinement-plan.md, D1).
 */
export async function createClosureItems(
  {
    closureId,
    observationReportId,
  },
  client,
) {
  const result = await client.query(
    `
      INSERT INTO closure_items (
        closure_request_id,
        observation_item_id,
        sequence_number
      )
      SELECT
        $1,
        item.id,
        item.sequence_number
      FROM observation_items AS item
      WHERE item.observation_report_id = $2
      ON CONFLICT (observation_item_id)
      DO NOTHING
      RETURNING id
    `,
    [closureId, observationReportId],
  );

  return result.rows.length;
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
        observation_report.no_observations,
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

/**
 * Inserts the report (its legacy single-observation columns filled
 * from the first item, D2) and every observation item, then assigns
 * the report number. `items` is 1-10 entries, each
 * `{ zoneAreaId, observationLocation, category, description,
 * riskCategory, photograph: { path, originalName, mimeType, size } }`.
 * Returns the report with an `observations` array built from the same
 * items, so the caller needs no second query for the response.
 */
export async function createReport(
  {
    patrolId,
    auditorId,
    auditeeId,
    findingDate,
    plantLocation,
    items,
  },
  client,
) {
  const firstItem = items[0];

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
        no_observations,
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
      firstItem.observationLocation,
      firstItem.category,
      firstItem.photograph.path,
      firstItem.photograph.originalName,
      firstItem.photograph.mimeType,
      firstItem.photograph.size,
      firstItem.description,
      firstItem.riskCategory,
      firstItem.zoneAreaId,
    ],
  );

  const createdReport =
    result.rows[0];

  for (const [
    index,
    item,
  ] of items.entries()) {
    await client.query(
      `
        INSERT INTO observation_items (
          observation_report_id,
          sequence_number,
          zone_area_id,
          observation_location,
          category,
          description,
          risk_category,
          photograph_path,
          photograph_original_name,
          photograph_mime_type,
          photograph_size
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
        )
      `,
      [
        createdReport.id,
        index + 1,
        item.zoneAreaId,
        item.observationLocation,
        item.category,
        item.description,
        item.riskCategory,
        item.photograph.path,
        item.photograph.originalName,
        item.photograph.mimeType,
        item.photograph.size,
      ],
    );
  }

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
          no_observations,
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

  return {
    ...mapReport(numberedResult.rows[0]),

    observations: items.map(
      (item, index) => ({
        sequenceNumber: index + 1,
        zoneAreaId: item.zoneAreaId,
        areaName: item.observationLocation,
        category: item.category,
        description: item.description,
        riskCategory: item.riskCategory,
        photographOriginalName:
          item.photograph.originalName,
      }),
    ),
  };
}

/**
 * "No observation to record" (D4): a CLOSED report with no items and
 * no closure, so the weekly list, calendar and history treat it like
 * any other filed report.
 */
export async function createNoObservationReport(
  {
    patrolId,
    auditorId,
    auditeeId,
    findingDate,
    plantLocation,
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
        no_observations,
        finding_date,
        plant_location,
        closed_at
      )
      VALUES (
        $1, $2, $3, 'CLOSED', TRUE, $4, $5, NOW()
      )
      RETURNING
        id,
        patrol_id,
        status,
        no_observations,
        finding_date,
        plant_location,
        submitted_at,
        closed_at
    `,
    [
      patrolId,
      auditorId,
      auditeeId,
      findingDate,
      plantLocation,
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
          no_observations,
          finding_date,
          plant_location,
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

/**
 * Moves a patrol straight to COMPLETED when the auditor found nothing
 * to record; only reachable while still SCHEDULED/IN_PROGRESS, the
 * same guard submitObservation uses.
 */
export async function completePatrolWithoutObservations(
  patrolId,
  client,
) {
  const result = await client.query(
    `
      UPDATE patrols
      SET
        status = 'COMPLETED',
        updated_at = NOW()
      WHERE
        id = $1
        AND status IN (
          'SCHEDULED', 'IN_PROGRESS'
        )
      RETURNING id
    `,
    [patrolId],
  );

  return result.rows[0] ?? null;
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
 * One observation report with the context needed to display it: its
 * items, the closure that followed it (if any), and the latest ticket
 * on that closure (if any).
 *
 * Ownership: the auditor who filed it, the auditee who must act on it,
 * the EHS Officer who owns the patrol, the Action HOD of its ticket, or
 * a management user (EHS_OFFICER/HOD/PLANT_HEAD/ADMIN) at the same
 * plant. Anyone else gets nothing, so a guessed id leaks no data.
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
        observation_report.no_observations,
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
        ehs_officer.full_name AS ehs_officer_name,

        closure_request.id AS closure_id,
        closure_request.status AS closure_status,
        closure_request.action_plan,
        closure_request.target_date,
        closure_request.responsible_hod_name
          AS action_hod_name,
        closure_request.approved_at
          AS closure_approved_at,
        closure_request.closed_at
          AS closure_closed_at,

        latest_ticket.id AS ticket_id,
        latest_ticket.status AS ticket_status,
        latest_ticket.decision AS ticket_decision,
        latest_ticket.closure_date AS ticket_closure_date

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

      LEFT JOIN closure_requests AS closure_request
        ON closure_request.observation_report_id =
           observation_report.id

      LEFT JOIN LATERAL (
        SELECT
          ticket.id,
          ticket.status,
          ticket.decision,
          ticket.closure_date
        FROM action_tickets AS ticket
        WHERE ticket.closure_request_id =
          closure_request.id
        ORDER BY ticket.closure_round DESC
        LIMIT 1
      ) AS latest_ticket ON TRUE

      WHERE
        observation_report.id = $1
        AND (
          patrol.auditor_id = $2
          OR patrol.auditee_id = $2
          OR patrol.ehs_officer_id = $2
          OR EXISTS (
            SELECT 1
            FROM action_tickets AS ticket
            WHERE
              ticket.observation_report_id =
                observation_report.id
              AND ticket.action_hod_id = $2
          )
          OR EXISTS (
            SELECT 1
            FROM users AS me
            JOIN user_roles AS ur
              ON ur.user_id = me.id
            JOIN roles AS ro
              ON ro.id = ur.role_id
            WHERE
              me.id = $2
              AND me.plant_id = plant_record.id
              AND ro.code IN (
                'EHS_OFFICER', 'HOD',
                'PLANT_HEAD', 'ADMIN'
              )
          )
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

    closure: row.closure_id
      ? {
          id: row.closure_id,
          status: row.closure_status,
          actionPlan: row.action_plan,
          targetDate: row.target_date,
          actionHodName:
            row.action_hod_name,
          approvedAt:
            row.closure_approved_at,
          closedAt:
            row.closure_closed_at,
        }
      : null,

    ticket: row.ticket_id
      ? {
          id: row.ticket_id,
          status: row.ticket_status,
          decision: row.ticket_decision,
          closureDate:
            row.ticket_closure_date,
        }
      : null,
  };
}

/**
 * The plant a user belongs to, or null. Used to scope the history view
 * to a management user's own plant; a kept local copy rather than a
 * cross-module import, matching this module's self-contained style.
 */
export async function findUserPlantId(
  userId,
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT plant_id
      FROM users
      WHERE id = $1
        AND is_active = TRUE
    `,
    [userId],
  );

  return (
    result.rows[0]?.plant_id ?? null
  );
}

/**
 * Every observation report at or after `fromDate` (the six-month
 * window), scoped to the caller's own patrols unless `managementScope`
 * is set, in which case every report at `plantId` is included too. The
 * "closed" filter follows the latest ticket's status, per the product
 * definition of a report being closed via ticket.
 */
export async function findReportHistory(
  {
    userId,
    plantId,
    managementScope,
    fromDate,
    filter,
  },
  client = databasePool,
) {
  const filterClause =
    filter === "closed"
      ? "AND latest_ticket.status = 'CLOSED'"
      : filter === "no_observations"
        ? "AND observation_report.no_observations = TRUE"
        : filter === "in_progress"
          ? "AND observation_report.no_observations = FALSE AND (latest_ticket.status IS DISTINCT FROM 'CLOSED')"
          : "";

  const result = await client.query(
    `
      SELECT
        observation_report.id,
        observation_report.report_number,
        observation_report.patrol_id,
        observation_report.status,
        observation_report.no_observations,
        observation_report.finding_date,
        observation_report.plant_location,
        observation_report.submitted_at,
        observation_report.closed_at,

        patrol.scheduled_date,
        unit_record.name AS unit_name,
        unit_record.unit_number,
        zone_record.name AS zone_name,
        zone_record.zone_number,

        auditor.full_name AS auditor_name,
        auditee.full_name AS auditee_name,

        closure_request.id AS closure_id,
        closure_request.status AS closure_status,

        latest_ticket.id AS ticket_id,
        latest_ticket.status AS ticket_status,
        latest_ticket.decision AS ticket_decision,

        (
          SELECT COUNT(*)
          FROM observation_items AS item
          WHERE item.observation_report_id =
            observation_report.id
        ) AS observation_count,

        (
          SELECT MIN(
            CASE item.risk_category
              WHEN 'HIGH' THEN 1
              WHEN 'MEDIUM' THEN 2
              ELSE 3
            END
          )
          FROM observation_items AS item
          WHERE item.observation_report_id =
            observation_report.id
        ) AS highest_risk_rank

      FROM observation_reports AS observation_report

      JOIN patrols AS patrol
        ON patrol.id = observation_report.patrol_id

      JOIN units AS unit_record
        ON unit_record.id = patrol.unit_id

      JOIN zones AS zone_record
        ON zone_record.id = patrol.zone_id

      JOIN users AS auditor
        ON auditor.id = patrol.auditor_id

      JOIN users AS auditee
        ON auditee.id = patrol.auditee_id

      LEFT JOIN closure_requests AS closure_request
        ON closure_request.observation_report_id =
           observation_report.id

      LEFT JOIN LATERAL (
        SELECT
          ticket.id,
          ticket.status,
          ticket.decision
        FROM action_tickets AS ticket
        WHERE ticket.closure_request_id =
          closure_request.id
        ORDER BY ticket.closure_round DESC
        LIMIT 1
      ) AS latest_ticket ON TRUE

      WHERE
        patrol.scheduled_date >= $1::DATE
        AND (
          patrol.auditor_id = $2
          OR patrol.auditee_id = $2
          OR patrol.ehs_officer_id = $2
          OR (
            $4::BOOLEAN
            AND unit_record.plant_id = $3::BIGINT
          )
        )
        ${filterClause}

      ORDER BY
        patrol.scheduled_date DESC,
        observation_report.id DESC

      LIMIT 300
    `,
    [
      fromDate,
      userId,
      plantId,
      managementScope === true,
    ],
  );

  return result.rows.map((row) => ({
    id: row.id,
    reportNumber: row.report_number,
    patrolId: row.patrol_id,
    status: row.status,
    noObservations:
      row.no_observations ?? false,
    findingDate: row.finding_date,
    plantLocation: row.plant_location,
    submittedAt: row.submitted_at,
    closedAt: row.closed_at,

    scheduledDate: row.scheduled_date,
    unitName: row.unit_name,
    unitNumber: row.unit_number,
    zoneName: row.zone_name,
    zoneNumber: row.zone_number,

    auditorName: row.auditor_name,
    auditeeName: row.auditee_name,

    closureId: row.closure_id,
    closureStatus: row.closure_status,

    ticketId: row.ticket_id,
    ticketStatus: row.ticket_status,
    ticketDecision: row.ticket_decision,

    observationCount: Number(
      row.observation_count ?? 0,
    ),
    highestRisk: highestRiskLabel(
      row.highest_risk_rank,
    ),
  }));
}
