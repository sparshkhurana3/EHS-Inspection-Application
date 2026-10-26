import {
  databasePool,
} from "../../config/database.js";

/*
 * Reads and writes for the email alerts (docs/24): reports that were
 * not closed in time, and the Monday reminder of work still open from
 * earlier weeks.
 */

/**
 * Reports with observations whose auditee has not sent the closure for
 * approval within `days` days of the report being generated, one row
 * per report and recipient who has not been told yet at this level.
 *
 * Only reports that name an HOD escalate, which in practice means
 * reports filed after the HOD became mandatory. The day count is whole
 * calendar days in `timeZone`.
 *
 * HOD level: the report's own HOD. PLANT_HEAD level: every active Plant
 * Head at the report's plant.
 */
export async function findDueEscalations(
  {
    level,
    days,
    today,
    timeZone,
  },
  client = databasePool,
) {
  const recipientJoin =
    level === "HOD"
      ? "recipient.id = report.hod_id"
      : `
          recipient.plant_id = unit_record.plant_id
          AND EXISTS (
            SELECT 1
            FROM user_roles AS ur
            JOIN roles AS ro
              ON ro.id = ur.role_id
            WHERE
              ur.user_id = recipient.id
              AND ro.code = 'PLANT_HEAD'
          )
        `;

  const result = await client.query(
    `
      SELECT
        report.id AS report_id,
        report.report_number,

        TO_CHAR(
          report.submitted_at AT TIME ZONE $2,
          'YYYY-MM-DD'
        ) AS generated_date,

        (
          $3::DATE - (
            report.submitted_at AT TIME ZONE $2
          )::DATE
        )::INTEGER AS days_open,

        plant_record.name AS plant_name,
        unit_record.name AS unit_name,
        zone_record.name AS zone_name,

        auditee.full_name AS auditee_name,
        hod.full_name AS hod_name,

        (
          SELECT COUNT(*)::INTEGER
          FROM observation_items AS item
          WHERE
            item.observation_report_id = report.id
        ) AS observation_count,

        closure.status AS closure_status,

        recipient.id AS recipient_id,
        recipient.full_name AS recipient_name,
        recipient.email AS recipient_email

      FROM observation_reports AS report

      JOIN patrols AS patrol
        ON patrol.id = report.patrol_id

      JOIN units AS unit_record
        ON unit_record.id = patrol.unit_id

      JOIN plants AS plant_record
        ON plant_record.id = unit_record.plant_id

      JOIN zones AS zone_record
        ON zone_record.id = patrol.zone_id

      JOIN users AS auditee
        ON auditee.id = patrol.auditee_id

      JOIN users AS hod
        ON hod.id = report.hod_id

      JOIN closure_requests AS closure
        ON closure.observation_report_id = report.id

      JOIN users AS recipient
        ON ${recipientJoin}

      WHERE
        report.no_observations = FALSE
        AND closure.status NOT IN (
          'SUBMITTED_FOR_CLOSURE',
          'APPROVED'
        )
        AND (
          (
            report.submitted_at AT TIME ZONE $2
          )::DATE + $4::INTEGER
        ) <= $3::DATE
        AND recipient.is_active = TRUE
        AND COALESCE(recipient.email, '') <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM observation_alerts AS sent
          WHERE
            sent.observation_report_id = report.id
            AND sent.level = $1
            AND sent.recipient_user_id = recipient.id
        )

      ORDER BY
        recipient.id,
        report.submitted_at,
        report.id
    `,
    [level, timeZone, today, days],
  );

  return result.rows.map((row) => ({
    reportId: Number(row.report_id),
    reportNumber: row.report_number,
    generatedDate: row.generated_date,
    daysOpen: row.days_open,
    plantName: row.plant_name,
    unitName: row.unit_name,
    zoneName: row.zone_name,
    auditeeName: row.auditee_name,
    hodName: row.hod_name,
    observationCount: row.observation_count,
    closureStatus: row.closure_status,
    recipientId: Number(row.recipient_id),
    recipientName: row.recipient_name,
    recipientEmail: row.recipient_email,
  }));
}

/**
 * How many reports are due at a level but have nobody to tell: the HOD
 * is inactive or has no email, or the plant has no Plant Head. It is
 * logged so a gap in the setup is noticed.
 */
export async function countDueWithoutRecipient(
  {
    level,
    days,
    today,
    timeZone,
  },
  client = databasePool,
) {
  const noRecipient =
    level === "HOD"
      ? `
          NOT EXISTS (
            SELECT 1
            FROM users AS hod_user
            WHERE
              hod_user.id = report.hod_id
              AND hod_user.is_active = TRUE
              AND COALESCE(hod_user.email, '') <> ''
          )
        `
      : `
          NOT EXISTS (
            SELECT 1
            FROM users AS head
            JOIN user_roles AS ur
              ON ur.user_id = head.id
            JOIN roles AS ro
              ON ro.id = ur.role_id
            WHERE
              ro.code = 'PLANT_HEAD'
              AND head.plant_id = unit_record.plant_id
              AND head.is_active = TRUE
              AND COALESCE(head.email, '') <> ''
          )
        `;

  const result = await client.query(
    `
      SELECT COUNT(*)::INTEGER AS total

      FROM observation_reports AS report

      JOIN patrols AS patrol
        ON patrol.id = report.patrol_id

      JOIN units AS unit_record
        ON unit_record.id = patrol.unit_id

      JOIN closure_requests AS closure
        ON closure.observation_report_id = report.id

      WHERE
        report.hod_id IS NOT NULL
        AND report.no_observations = FALSE
        AND closure.status NOT IN (
          'SUBMITTED_FOR_CLOSURE',
          'APPROVED'
        )
        AND (
          (
            report.submitted_at AT TIME ZONE $1
          )::DATE + $3::INTEGER
        ) <= $2::DATE
        AND ${noRecipient}
    `,
    [timeZone, today, days],
  );

  return result.rows[0].total;
}

/**
 * Records escalation emails as sent, once the server has accepted them.
 */
export async function recordEscalationsSent(
  {
    level,
    rows,
  },
  client = databasePool,
) {
  if (rows.length === 0) {
    return;
  }

  await client.query(
    `
      INSERT INTO observation_alerts (
        observation_report_id,
        level,
        recipient_user_id,
        recipient_email
      )

      SELECT
        entry.report_id,
        $1,
        entry.recipient_id,
        entry.email

      FROM UNNEST(
        $2::BIGINT[],
        $3::BIGINT[],
        $4::TEXT[]
      ) AS entry(report_id, recipient_id, email)

      ON CONFLICT DO NOTHING
    `,
    [
      level,
      rows.map((row) => row.reportId),
      rows.map((row) => row.recipientId),
      rows.map((row) => row.recipientEmail),
    ],
  );
}

/**
 * Audits from earlier weeks that an auditor has still not filed a
 * report for: still SCHEDULED or IN_PROGRESS with no report, dated
 * before this week's Monday. Active users with an email only.
 */
export async function findPendingReportsForDigest(
  {
    weekStart,
    today,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        auditor.id AS user_id,
        auditor.full_name AS user_name,
        auditor.email AS user_email,

        TO_CHAR(
          patrol.scheduled_date,
          'YYYY-MM-DD'
        ) AS scheduled_date,

        (
          $2::DATE - (
            DATE_TRUNC(
              'week',
              patrol.scheduled_date
            )::DATE + 3
          )
        )::INTEGER AS days_overdue,

        unit_record.name AS unit_name,
        zone_record.name AS zone_name

      FROM patrols AS patrol

      JOIN users AS auditor
        ON auditor.id = patrol.auditor_id

      JOIN units AS unit_record
        ON unit_record.id = patrol.unit_id

      JOIN zones AS zone_record
        ON zone_record.id = patrol.zone_id

      WHERE
        patrol.scheduled_date < $1::DATE
        AND patrol.status IN (
          'SCHEDULED',
          'IN_PROGRESS'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM observation_reports AS report
          WHERE report.patrol_id = patrol.id
        )
        AND auditor.is_active = TRUE
        AND COALESCE(auditor.email, '') <> ''

      ORDER BY
        auditor.id,
        patrol.scheduled_date,
        patrol.id
    `,
    [weekStart, today],
  );

  return result.rows.map((row) => ({
    userId: Number(row.user_id),
    userName: row.user_name,
    userEmail: row.user_email,
    scheduledDate: row.scheduled_date,
    daysOverdue: row.days_overdue,
    unitName: row.unit_name,
    zoneName: row.zone_name,
  }));
}

/**
 * Closures from earlier weeks that an auditee has still not sent for
 * approval (open, in progress, or sent back), for reports generated
 * before this week's Monday.
 */
export async function findPendingClosuresForDigest(
  {
    weekStart,
    today,
    timeZone,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        auditee.id AS user_id,
        auditee.full_name AS user_name,
        auditee.email AS user_email,

        report.id AS report_id,
        report.report_number,

        TO_CHAR(
          report.submitted_at AT TIME ZONE $3,
          'YYYY-MM-DD'
        ) AS generated_date,

        (
          $2::DATE - (
            report.submitted_at AT TIME ZONE $3
          )::DATE
        )::INTEGER AS days_open,

        closure.status AS closure_status,
        unit_record.name AS unit_name,
        zone_record.name AS zone_name

      FROM closure_requests AS closure

      JOIN observation_reports AS report
        ON report.id = closure.observation_report_id

      JOIN patrols AS patrol
        ON patrol.id = report.patrol_id

      JOIN users AS auditee
        ON auditee.id = patrol.auditee_id

      JOIN units AS unit_record
        ON unit_record.id = patrol.unit_id

      JOIN zones AS zone_record
        ON zone_record.id = patrol.zone_id

      WHERE
        closure.status IN (
          'OPEN',
          'IN_PROGRESS',
          'REEXAMINATION_REQUIRED',
          'REJECTED'
        )
        AND (
          report.submitted_at AT TIME ZONE $3
        )::DATE < $1::DATE
        AND auditee.is_active = TRUE
        AND COALESCE(auditee.email, '') <> ''

      ORDER BY
        auditee.id,
        report.submitted_at,
        report.id
    `,
    [weekStart, today, timeZone],
  );

  return result.rows.map((row) => ({
    userId: Number(row.user_id),
    userName: row.user_name,
    userEmail: row.user_email,
    reportId: Number(row.report_id),
    reportNumber: row.report_number,
    generatedDate: row.generated_date,
    daysOpen: row.days_open,
    closureStatus: row.closure_status,
    unitName: row.unit_name,
    zoneName: row.zone_name,
  }));
}

export async function findDigestRecipientsAlreadySent(
  digestDate,
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT user_id
      FROM weekly_digest_log
      WHERE digest_date = $1::DATE
    `,
    [digestDate],
  );

  return new Set(
    result.rows.map((row) => Number(row.user_id)),
  );
}

export async function recordDigestSent(
  {
    userId,
    digestDate,
    email,
    pendingReports,
    pendingClosures,
  },
  client = databasePool,
) {
  await client.query(
    `
      INSERT INTO weekly_digest_log (
        user_id,
        digest_date,
        recipient_email,
        pending_reports,
        pending_closures
      )
      VALUES ($1, $2::DATE, $3, $4, $5)
      ON CONFLICT DO NOTHING
    `,
    [
      userId,
      digestDate,
      email,
      pendingReports,
      pendingClosures,
    ],
  );
}
