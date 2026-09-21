import {
  databasePool,
} from "../../config/database.js";

function mapRosterRow(row) {
  return {
    id: row.id,
    unitId: row.unit_id,
    unitName: row.unit_name,
    unitNumber: row.unit_number,
    zoneId: row.zone_id,
    zoneName: row.zone_name,
    zoneNumber: row.zone_number,
    auditorId: row.auditor_id,
    auditorName: row.auditor_name,
    auditorEmail: row.auditor_email,
    auditeeId: row.auditee_id,
    auditeeName: row.auditee_name,
    auditeeEmail: row.auditee_email,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    upcomingCount: Number(
      row.upcoming_count ?? 0,
    ),
    updatedAt: row.updated_at,
  };
}

function mapUser(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    username: row.username,
    email: row.email,
  };
}

function mapPatrol(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    location: row.plant_name,
    plantId: row.plant_id,
    unitId: row.unit_id,
    unit: row.unit_number,
    unitName: row.unit_name,
    zoneId: row.zone_id,
    zone: row.zone_number,
    zoneName: row.zone_name,

    /*
     * A patrol covers the whole zone, so the areas are a property of
     * the zone. The auditor records which one a finding occurred in on
     * the observation report.
     */
    areas: row.areas ?? [],

    scheduledDate: row.scheduled_date,
    auditorId: row.auditor_id,
    auditorName: row.auditor_name,
    auditeeId: row.auditee_id,
    auditeeName: row.auditee_name,
    ehsOfficerId: row.ehs_officer_id,
    ehsOfficerName: row.ehs_officer_name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * The location a user belongs to. For an EHS Officer this is the domain
 * they may plan audits in; for everyone it decides which auditor and
 * auditee lists they appear in.
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
 * Units and zones belonging to one location, each zone carrying its own
 * fixed area list. One round trip feeds the whole cascading form.
 */
export async function findPlanningScope(
  plantId,
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        unit_record.id AS unit_id,
        unit_record.name AS unit_name,
        unit_record.unit_number,

        zone_record.id AS zone_id,
        zone_record.name AS zone_name,
        zone_record.zone_number,

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

      FROM units AS unit_record

      JOIN zones AS zone_record
        ON zone_record.unit_id = unit_record.id
       AND zone_record.is_active = TRUE

      LEFT JOIN zone_areas AS zone_area
        ON zone_area.zone_id = zone_record.id
       AND zone_area.is_active = TRUE

      WHERE
        unit_record.plant_id = $1
        AND unit_record.is_active = TRUE

      GROUP BY
        unit_record.id,
        unit_record.name,
        unit_record.unit_number,
        zone_record.id,
        zone_record.name,
        zone_record.zone_number

      ORDER BY
        unit_record.unit_number,
        unit_record.name,
        zone_record.zone_number,
        zone_record.name
    `,
    [plantId],
  );

  const unitsById = new Map();
  const zones = [];

  for (const row of result.rows) {
    if (!unitsById.has(row.unit_id)) {
      unitsById.set(row.unit_id, {
        id: row.unit_id,
        name: row.unit_name,
        unitNumber: row.unit_number,
      });
    }

    zones.push({
      id: row.zone_id,
      unitId: row.unit_id,
      name: row.zone_name,
      zoneNumber: row.zone_number,
      areas: row.areas,
    });
  }

  return {
    units: [...unitsById.values()],
    zones,
  };
}

/**
 * Everyone registered at a location is eligible to audit or be audited
 * there. Selection is by location rather than by an AUDITOR/AUDITEE
 * role code, which only ever existed in the test seed scripts.
 */
export async function findUsersAtLocation(
  {
    plantId,
    excludeUserId = null,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        app_user.id,
        app_user.full_name,
        app_user.username,
        app_user.email

      FROM users AS app_user

      WHERE
        app_user.plant_id = $1
        AND app_user.is_active = TRUE
        AND ($2::BIGINT IS NULL OR app_user.id <> $2)

      ORDER BY
        app_user.full_name,
        app_user.username
    `,
    [plantId, excludeUserId],
  );

  return result.rows.map(mapUser);
}

/**
 * Confirms a zone exists and resolves up the hierarchy to its plant, so
 * the service can reject a zone outside the officer's own location. The
 * dropdown being scoped is presentation; this is the enforcement.
 */
export async function findZoneWithHierarchy(
  zoneId,
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        zone_record.id AS zone_id,
        zone_record.name AS zone_name,
        zone_record.zone_number,

        unit_record.id AS unit_id,
        unit_record.name AS unit_name,
        unit_record.unit_number,

        plant_record.id AS plant_id,
        plant_record.name AS plant_name,

        (
          SELECT COUNT(*)
          FROM zone_areas AS zone_area
          WHERE zone_area.zone_id = zone_record.id
            AND zone_area.is_active = TRUE
        ) AS area_count

      FROM zones AS zone_record

      JOIN units AS unit_record
        ON unit_record.id = zone_record.unit_id

      JOIN plants AS plant_record
        ON plant_record.id = unit_record.plant_id

      WHERE
        zone_record.id = $1
        AND zone_record.is_active = TRUE
        AND unit_record.is_active = TRUE
        AND plant_record.is_active = TRUE
    `,
    [zoneId],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    zoneId: row.zone_id,
    zoneName: row.zone_name,
    zoneNumber: row.zone_number,
    unitId: row.unit_id,
    unitName: row.unit_name,
    unitNumber: row.unit_number,
    plantId: row.plant_id,
    plantName: row.plant_name,
    areaCount: Number(row.area_count),
  };
}

/**
 * An auditor or auditee must be an active user at the same location.
 */
export async function findActiveUserAtLocation(
  {
    userId,
    plantId,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        app_user.id,
        app_user.full_name,
        app_user.username,
        app_user.email

      FROM users AS app_user

      WHERE
        app_user.id = $1
        AND app_user.plant_id = $2
        AND app_user.is_active = TRUE
    `,
    [userId, plantId],
  );

  return result.rows[0]
    ? mapUser(result.rows[0])
    : null;
}


/**
 * Reassigns who audits and who is audited. Restricted to a patrol still
 * SCHEDULED, since once an observation report exists it references the
 * auditor who filed it and a closure references the auditee it was
 * opened for; reassigning after that point would leave those records
 * pointing at the wrong person.
 */
export async function updatePatrolAssignment(
  {
    patrolId,
    auditorId,
    auditeeId,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      UPDATE patrols
      SET
        auditor_id = $1,
        auditee_id = $2,
        updated_at = NOW()
      WHERE
        id = $3
        AND status = 'SCHEDULED'
      RETURNING id
    `,
    [auditorId, auditeeId, patrolId],
  );

  return result.rows[0] ?? null;
}

export async function createPatrol(
  {
    unitId,
    zoneId,
    plantName,
    auditorId,
    auditeeId,
    scheduledDate,
    ehsOfficerId,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      INSERT INTO patrols (
        unit_id,
        zone_id,
        auditor_id,
        auditee_id,
        scheduled_date,
        status,
        plant_location,
        ehs_officer_id,
        created_by
      )
      VALUES (
        $1, $2, $3, $4, $5::DATE,
        'SCHEDULED',
        $6, $7, $7
      )
      RETURNING id
    `,
    [
      unitId,
      zoneId,
      auditorId,
      auditeeId,
      scheduledDate,
      plantName,
      ehsOfficerId,
    ],
  );

  return result.rows[0]?.id ?? null;
}

/**
 * LEFT JOIN on the EHS officer on purpose: the column is nullable, and
 * an inner join silently turned a legally-created patrol into a 500.
 */
export async function findPatrolById(
  patrolId,
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        patrol.id,
        patrol.scheduled_date,
        patrol.status,
        patrol.created_at,
        patrol.updated_at,

        unit_record.id AS unit_id,
        unit_record.name AS unit_name,
        unit_record.unit_number,

        zone_record.id AS zone_id,
        zone_record.name AS zone_name,
        zone_record.zone_number,

        plant_record.id AS plant_id,
        plant_record.name AS plant_name,

        patrol.auditor_id,
        auditor.full_name AS auditor_name,

        patrol.auditee_id,
        auditee.full_name AS auditee_name,

        patrol.ehs_officer_id,
        ehs_officer.full_name AS ehs_officer_name,

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

      LEFT JOIN zone_areas AS zone_area
        ON zone_area.zone_id = zone_record.id
       AND zone_area.is_active = TRUE

      WHERE patrol.id = $1

      GROUP BY
        patrol.id, unit_record.id, zone_record.id,
        plant_record.id, auditor.full_name,
        auditee.full_name, ehs_officer.full_name
    `,
    [patrolId],
  );

  return mapPatrol(result.rows[0]);
}

/*
 * ---------------------------------------------------------------------
 * Weekly roster: one-time upload that generates every upcoming Monday's
 * patrol per zone. See docs/14-weekly-roster-plan.md.
 * ---------------------------------------------------------------------
 */

/**
 * The plant's active units and zones, with each zone's own code/number
 * (for matching a roster row's "Unit"/"Zone" text) and its active area
 * count (a zone with no areas cannot be scheduled, same rule as the
 * manual form).
 */
export async function findRosterLookupScope(
  plantId,
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        unit_record.id AS unit_id,
        unit_record.name AS unit_name,
        unit_record.code AS unit_code,
        unit_record.unit_number,

        zone_record.id AS zone_id,
        zone_record.name AS zone_name,
        zone_record.code AS zone_code,
        zone_record.zone_number,

        (
          SELECT COUNT(*)
          FROM zone_areas AS zone_area
          WHERE zone_area.zone_id = zone_record.id
            AND zone_area.is_active = TRUE
        ) AS area_count

      FROM units AS unit_record

      JOIN zones AS zone_record
        ON zone_record.unit_id = unit_record.id
       AND zone_record.is_active = TRUE

      WHERE
        unit_record.plant_id = $1
        AND unit_record.is_active = TRUE

      ORDER BY
        unit_record.unit_number,
        unit_record.name,
        zone_record.zone_number,
        zone_record.name
    `,
    [plantId],
  );

  return result.rows.map((row) => ({
    unitId: row.unit_id,
    unitName: row.unit_name,
    unitCode: row.unit_code,
    unitNumber: row.unit_number,
    zoneId: row.zone_id,
    zoneName: row.zone_name,
    zoneCode: row.zone_code,
    zoneNumber: row.zone_number,
    areaCount: Number(row.area_count),
  }));
}

/**
 * Active users at a plant, keyed by lower-cased email, for resolving the
 * roster file's Auditor/Auditee columns.
 */
export async function findActiveUsersByEmail(
  {
    plantId,
    emails,
    excludeUserId = null,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        app_user.id,
        app_user.full_name,
        app_user.email

      FROM users AS app_user

      WHERE
        app_user.plant_id = $1
        AND app_user.is_active = TRUE
        AND LOWER(app_user.email) = ANY($2::TEXT[])
        AND ($3::BIGINT IS NULL OR app_user.id <> $3)
    `,
    [plantId, emails, excludeUserId],
  );

  const usersByEmail = new Map();

  for (const row of result.rows) {
    usersByEmail.set(
      row.email.toLowerCase(),
      mapUser(row),
    );
  }

  return usersByEmail;
}

/**
 * The plant's current roster, one row per zone, with the names/emails
 * and how many SCHEDULED future patrols each row still has.
 */
export async function findRosterForPlant(
  plantId,
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        roster.id,

        roster.unit_id,
        unit_record.name AS unit_name,
        unit_record.unit_number,

        roster.zone_id,
        zone_record.name AS zone_name,
        zone_record.zone_number,

        roster.auditor_id,
        auditor.full_name AS auditor_name,
        auditor.email AS auditor_email,

        roster.auditee_id,
        auditee.full_name AS auditee_name,
        auditee.email AS auditee_email,

        roster.effective_from,
        roster.effective_to,
        roster.updated_at,

        (
          SELECT COUNT(*)
          FROM patrols AS p
          WHERE p.roster_id = roster.id
            AND p.status = 'SCHEDULED'
            AND p.scheduled_date >= CURRENT_DATE
        ) AS upcoming_count

      FROM zone_audit_rosters AS roster

      JOIN units AS unit_record
        ON unit_record.id = roster.unit_id

      JOIN zones AS zone_record
        ON zone_record.id = roster.zone_id

      JOIN users AS auditor
        ON auditor.id = roster.auditor_id

      JOIN users AS auditee
        ON auditee.id = roster.auditee_id

      WHERE roster.plant_id = $1

      ORDER BY
        unit_record.unit_number,
        unit_record.name,
        zone_record.zone_number,
        zone_record.name
    `,
    [plantId],
  );

  return result.rows.map(mapRosterRow);
}



/**
 * Deletes future, still-SCHEDULED, roster-generated patrols with no
 * observation report, ahead of regenerating them from a re-upload. A
 * patrol in the past, one with a report, or one planned by hand is
 * never touched.
 */
export async function deleteUpcomingRosterPatrols(
  {
    plantId,
    fromDate,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      DELETE FROM patrols AS p
      USING units AS u
      WHERE
        u.id = p.unit_id
        AND u.plant_id = $1
        AND p.roster_id IS NOT NULL
        AND p.status = 'SCHEDULED'
        AND p.scheduled_date >= $2::DATE
        AND NOT EXISTS (
          SELECT 1
          FROM observation_reports AS o
          WHERE o.patrol_id = p.id
        )

      RETURNING p.id
    `,
    [plantId, fromDate],
  );

  return result.rows.length;
}

/**
 * Removes roster rows for zones no longer present in a re-uploaded
 * file. Run after deleteUpcomingRosterPatrols so ON DELETE SET NULL has
 * already been left with nothing but history rows to touch.
 */
export async function deleteRosterRowsNotIn(
  {
    plantId,
    zoneIds,
  },
  client = databasePool,
) {
  await client.query(
    `
      DELETE FROM zone_audit_rosters
      WHERE
        plant_id = $1
        AND zone_id <> ALL($2::BIGINT[])
    `,
    [plantId, zoneIds],
  );
}

export async function upsertRosterRow(
  {
    plantId,
    unitId,
    zoneId,
    auditorId,
    auditeeId,
    effectiveFrom,
    effectiveTo,
    uploadedBy,
    sourceFileName,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      INSERT INTO zone_audit_rosters (
        plant_id, unit_id, zone_id,
        auditor_id, auditee_id,
        effective_from, effective_to,
        uploaded_by, source_file_name
      )
      VALUES (
        $1, $2, $3, $4, $5, $6::DATE, $7::DATE, $8, $9
      )
      ON CONFLICT (zone_id) DO UPDATE SET
        unit_id = EXCLUDED.unit_id,
        auditor_id = EXCLUDED.auditor_id,
        auditee_id = EXCLUDED.auditee_id,
        effective_from = EXCLUDED.effective_from,
        effective_to = EXCLUDED.effective_to,
        uploaded_by = EXCLUDED.uploaded_by,
        source_file_name = EXCLUDED.source_file_name,
        updated_at = NOW()
      RETURNING id
    `,
    [
      plantId,
      unitId,
      zoneId,
      auditorId,
      auditeeId,
      effectiveFrom,
      effectiveTo,
      uploadedBy,
      sourceFileName,
    ],
  );

  return result.rows[0]?.id ?? null;
}

/**
 * Inserts one SCHEDULED patrol per roster row per Monday in
 * [firstMonday, lastDate], skipping a zone/date pair that already has a
 * non-cancelled patrol (a manually planned audit keeps its place
 * instead of being duplicated).
 */
export async function generateRosterPatrols(
  {
    plantId,
    plantName,
    firstMonday,
    lastDate,
    ehsOfficerId,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      INSERT INTO patrols (
        unit_id, zone_id, auditor_id, auditee_id, scheduled_date,
        status, plant_location, ehs_officer_id, created_by, roster_id
      )
      SELECT
        r.unit_id, r.zone_id, r.auditor_id, r.auditee_id, monday::DATE,
        'SCHEDULED', $2, $5, $5, r.id
      FROM zone_audit_rosters AS r
      CROSS JOIN GENERATE_SERIES(
        $3::DATE, $4::DATE, INTERVAL '7 days'
      ) AS monday
      WHERE
        r.plant_id = $1
        AND NOT EXISTS (
          SELECT 1
          FROM patrols AS existing
          WHERE existing.zone_id = r.zone_id
            AND existing.scheduled_date = monday::DATE
            AND existing.status <> 'CANCELLED'
        )

      RETURNING id
    `,
    [
      plantId,
      plantName,
      firstMonday,
      lastDate,
      ehsOfficerId,
    ],
  );

  return result.rows.length;
}

/**
 * A zone's future SCHEDULED patrols in a date range, locked for update
 * so a concurrent edit cannot race the reassignment below.
 */
export async function findUpcomingZonePatrolsForAssignment(
  {
    zoneId,
    fromDate,
    toDate,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT id, scheduled_date
      FROM patrols
      WHERE
        zone_id = $1
        AND status = 'SCHEDULED'
        AND scheduled_date BETWEEN $2::DATE AND $3::DATE
      ORDER BY scheduled_date
      FOR UPDATE
    `,
    [zoneId, fromDate, toDate],
  );

  return result.rows.map((row) => ({
    id: row.id,
    scheduledDate: row.scheduled_date,
  }));
}


/**
 * Reassigns the auditor and auditee on every listed patrol still
 * SCHEDULED. Used to propagate an edit across a zone's upcoming
 * Mondays.
 */
export async function updatePatrolAssignments(
  {
    patrolIds,
    auditorId,
    auditeeId,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      UPDATE patrols
      SET
        auditor_id = $1,
        auditee_id = $2,
        updated_at = NOW()
      WHERE
        id = ANY($3::BIGINT[])
        AND status = 'SCHEDULED'
      RETURNING id
    `,
    [auditorId, auditeeId, patrolIds],
  );

  return result.rows.length;
}

/**
 * Updates a zone's roster row to match a propagated assignment change,
 * so the next roster upload or view reflects it. Returns null when the
 * zone has no roster row, which is not an error.
 */
export async function updateRosterAssignmentForZone(
  {
    zoneId,
    auditorId,
    auditeeId,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      UPDATE zone_audit_rosters
      SET
        auditor_id = $1,
        auditee_id = $2,
        updated_at = NOW()
      WHERE zone_id = $3
      RETURNING id
    `,
    [auditorId, auditeeId, zoneId],
  );

  return result.rows[0] ?? null;
}
