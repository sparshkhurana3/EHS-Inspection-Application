import {
  databasePool,
} from "../../config/database.js";

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
 * Nobody can be booked twice on one day, in either role.
 */
export async function findSchedulingConflict(
  {
    scheduledDate,
    auditorId,
    auditeeId,
    excludePatrolId = null,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        patrol.id,

        CASE
          WHEN patrol.auditor_id = $2
            OR patrol.auditee_id = $2
          THEN 'AUDITOR'
          ELSE 'AUDITEE'
        END AS conflict_type

      FROM patrols AS patrol

      WHERE
        patrol.scheduled_date = $1::DATE
        AND patrol.status <> 'CANCELLED'
        AND (
          patrol.auditor_id IN ($2, $3)
          OR patrol.auditee_id IN ($2, $3)
        )
        AND (
          $4::BIGINT IS NULL
          OR patrol.id <> $4
        )

      LIMIT 1
    `,
    [
      scheduledDate,
      auditorId,
      auditeeId,
      excludePatrolId,
    ],
  );

  return result.rows[0] ?? null;
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
