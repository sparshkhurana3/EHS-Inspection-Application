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

    location:
      row.plant_location,

    unitId:
      row.unit_id,

    unit:
      row.unit_number,

    unitName:
      row.unit_name,

    zoneId:
      row.zone_id,

    zone:
      row.zone_number,

    zoneName:
      row.zone_name,

    areaDetail:
      row.area_detail,

    scheduledDate:
      row.scheduled_date,

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

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

export async function findActiveUsersByRole(
  roleCode,
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT DISTINCT
        app_user.id,
        app_user.full_name,
        app_user.username,
        app_user.email

      FROM users AS app_user

      JOIN user_roles AS user_role
        ON user_role.user_id =
           app_user.id

      JOIN roles AS app_role
        ON app_role.id =
           user_role.role_id

      WHERE
        app_user.is_active = TRUE

        AND UPPER(
          BTRIM(app_role.code)
        ) = UPPER(BTRIM($1))

      ORDER BY
        app_user.full_name,
        app_user.username
    `,
    [roleCode],
  );

  return result.rows.map(mapUser);
}

export async function findActiveUserWithRole(
  {
    userId,
    roleCode,
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

      JOIN user_roles AS user_role
        ON user_role.user_id =
           app_user.id

      JOIN roles AS app_role
        ON app_role.id =
           user_role.role_id

      WHERE
        app_user.id = $1
        AND app_user.is_active = TRUE

        AND UPPER(
          BTRIM(app_role.code)
        ) = UPPER(BTRIM($2))

      LIMIT 1
    `,
    [
      userId,
      roleCode,
    ],
  );

  return result.rows[0]
    ? mapUser(result.rows[0])
    : null;
}

export async function findUnitForPlant(
  {
    plantLocation,
    unitNumber,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      WITH canonical_plant AS (
        SELECT
          plant_record.id,
          plant_record.name,

          COUNT(
            DISTINCT patrol_record.id
          ) AS patrol_count,

          COUNT(
            DISTINCT existing_unit.id
          ) AS unit_count

        FROM plants AS plant_record

        LEFT JOIN units AS existing_unit
          ON existing_unit.plant_id =
             plant_record.id

        LEFT JOIN patrols AS patrol_record
          ON patrol_record.unit_id =
             existing_unit.id

        WHERE
          LOWER(
            BTRIM(plant_record.name)
          ) = LOWER(BTRIM($1))

          AND plant_record.is_active = TRUE

        GROUP BY
          plant_record.id,
          plant_record.name

        ORDER BY
          patrol_count DESC,
          unit_count DESC,
          plant_record.id DESC

        LIMIT 1
      )

      SELECT
        unit_record.id,
        unit_record.plant_id,
        unit_record.name,
        unit_record.code,
        unit_record.unit_number,
        unit_record.is_active,

        canonical_plant.name
          AS plant_name

      FROM canonical_plant

      JOIN units AS unit_record
        ON unit_record.plant_id =
           canonical_plant.id

      WHERE
        BTRIM(
          unit_record.unit_number::TEXT
        ) = BTRIM($2::TEXT)

        AND unit_record.is_active = TRUE

      LIMIT 1
    `,
    [
      plantLocation,
      unitNumber,
    ],
  );

  return result.rows[0] ?? null;
}

export async function findZoneForUnit(
  {
    unitId,
    zoneNumber,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        id,
        unit_id,
        zone_number,
        name
      FROM zones
      WHERE unit_id = $1
        AND zone_number = $2
      LIMIT 1
    `,
    [
      unitId,
      zoneNumber,
    ],
  );

  return result.rows[0] ?? null;
}

export async function findSchedulingConflict(
  {
    scheduledDate,
    auditorId,
    auditeeId,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        patrol.id,
        patrol.scheduled_date,
        patrol.status,
        patrol.auditor_id,
        patrol.auditee_id,

        auditor.full_name
          AS auditor_name,

        auditee.full_name
          AS auditee_name,

        CASE
          WHEN patrol.auditor_id = $2
          THEN 'AUDITOR_ALREADY_ASSIGNED'

          WHEN patrol.auditee_id = $3
          THEN 'AUDITEE_ALREADY_ASSIGNED'

          ELSE 'SCHEDULING_CONFLICT'
        END AS conflict_type

      FROM patrols AS patrol

      JOIN users AS auditor
        ON auditor.id =
           patrol.auditor_id

      JOIN users AS auditee
        ON auditee.id =
           patrol.auditee_id

      WHERE
        patrol.scheduled_date =
          $1::DATE

        AND UPPER(
          BTRIM(patrol.status)
        ) NOT IN (
          'CANCELLED',
          'CLOSED'
        )

        AND (
          patrol.auditor_id = $2
          OR patrol.auditee_id = $3
        )

      ORDER BY patrol.id

      LIMIT 1
    `,
    [
      scheduledDate,
      Number(auditorId),
      Number(auditeeId),
    ],
  );

  return result.rows[0] ?? null;
}

export async function findActivePlanningLocations(
  client = databasePool,
) {
  const result = await client.query(
    `
      WITH plant_usage AS (
        SELECT
          plant_record.id,
          plant_record.name,
          plant_record.code,

          COUNT(
            DISTINCT patrol_record.id
          ) AS patrol_count,

          COUNT(
            DISTINCT unit_record.id
          ) AS unit_count

        FROM plants AS plant_record

        LEFT JOIN units AS unit_record
          ON unit_record.plant_id =
             plant_record.id

        LEFT JOIN patrols AS patrol_record
          ON patrol_record.unit_id =
             unit_record.id

        WHERE plant_record.is_active = TRUE

        GROUP BY
          plant_record.id,
          plant_record.name,
          plant_record.code
      ),

      canonical_plants AS (
        SELECT DISTINCT ON (
          LOWER(BTRIM(plant_usage.name))
        )
          plant_usage.id,
          plant_usage.name,
          plant_usage.code

        FROM plant_usage

        ORDER BY
          LOWER(BTRIM(plant_usage.name)),
          plant_usage.patrol_count DESC,
          plant_usage.unit_count DESC,
          plant_usage.id DESC
      )

      SELECT
        canonical_plant.id,
        canonical_plant.name,
        canonical_plant.code

      FROM canonical_plants
        AS canonical_plant

      ORDER BY
        canonical_plant.name
    `,
  );

  return result.rows.map((row) => ({
    id: row.id,
    value: row.name,
    label: row.name,
    code: row.code,
  }));
}

export async function findActivePlanningUnits(
  client = databasePool,
) {
  const result = await client.query(
    `
      WITH plant_usage AS (
        SELECT
          plant_record.id,
          plant_record.name,

          COUNT(
            DISTINCT patrol_record.id
          ) AS patrol_count,

          COUNT(
            DISTINCT existing_unit.id
          ) AS unit_count

        FROM plants AS plant_record

        LEFT JOIN units AS existing_unit
          ON existing_unit.plant_id =
             plant_record.id

        LEFT JOIN patrols AS patrol_record
          ON patrol_record.unit_id =
             existing_unit.id

        WHERE plant_record.is_active = TRUE

        GROUP BY
          plant_record.id,
          plant_record.name
      ),

      canonical_plants AS (
        SELECT DISTINCT ON (
          LOWER(BTRIM(plant_usage.name))
        )
          plant_usage.id,
          plant_usage.name

        FROM plant_usage

        ORDER BY
          LOWER(BTRIM(plant_usage.name)),
          plant_usage.patrol_count DESC,
          plant_usage.unit_count DESC,
          plant_usage.id DESC
      )

      SELECT
        unit_record.id,
        unit_record.plant_id,
        unit_record.unit_number,
        unit_record.name,
        unit_record.code,

        canonical_plant.name
          AS plant_name

      FROM canonical_plants
        AS canonical_plant

      JOIN units AS unit_record
        ON unit_record.plant_id =
           canonical_plant.id

      WHERE unit_record.is_active = TRUE

      ORDER BY
        canonical_plant.name,
        unit_record.unit_number::TEXT,
        unit_record.name
    `,
  );

  return result.rows.map((row) => ({
    id: row.id,

    plantId:
      row.plant_id,

    location:
      row.plant_name,

    value:
      String(row.unit_number),

    label:
      row.name,

    code:
      row.code,
  }));
}

export async function findActivePlanningZones(
  client = databasePool,
) {
  const result = await client.query(
    `
      WITH plant_usage AS (
        SELECT
          plant_record.id,
          plant_record.name,

          COUNT(
            DISTINCT patrol_record.id
          ) AS patrol_count,

          COUNT(
            DISTINCT existing_unit.id
          ) AS unit_count

        FROM plants AS plant_record

        LEFT JOIN units AS existing_unit
          ON existing_unit.plant_id =
             plant_record.id

        LEFT JOIN patrols AS patrol_record
          ON patrol_record.unit_id =
             existing_unit.id

        WHERE plant_record.is_active = TRUE

        GROUP BY
          plant_record.id,
          plant_record.name
      ),

      canonical_plants AS (
        SELECT DISTINCT ON (
          LOWER(BTRIM(plant_usage.name))
        )
          plant_usage.id,
          plant_usage.name

        FROM plant_usage

        ORDER BY
          LOWER(BTRIM(plant_usage.name)),
          plant_usage.patrol_count DESC,
          plant_usage.unit_count DESC,
          plant_usage.id DESC
      )

      SELECT
        zone_record.id,
        zone_record.unit_id,
        zone_record.zone_number,
        zone_record.name,
        zone_record.code,
        zone_record.area_detail,

        unit_record.plant_id,
        unit_record.unit_number,

        canonical_plant.name
          AS plant_name

      FROM canonical_plants
        AS canonical_plant

      JOIN units AS unit_record
        ON unit_record.plant_id =
           canonical_plant.id

      JOIN zones AS zone_record
        ON zone_record.unit_id =
           unit_record.id

      WHERE
        unit_record.is_active = TRUE
        AND zone_record.is_active = TRUE

      ORDER BY
        canonical_plant.name,
        unit_record.unit_number::TEXT,
        zone_record.zone_number::TEXT,
        zone_record.name
    `,
  );

  return result.rows.map((row) => ({
    id: row.id,

    plantId:
      row.plant_id,

    location:
      row.plant_name,

    unitId:
      row.unit_id,

    unitNumber:
      String(row.unit_number),

    value:
      String(row.zone_number),

    label:
      row.name,

    code:
      row.code,

    areaDetail:
      row.area_detail,
  }));
}

export async function findActivePlanningAreaDetails(
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT DISTINCT
        BTRIM(zone_record.area_detail)
          AS area_detail

      FROM zones AS zone_record

      JOIN units AS unit_record
        ON unit_record.id =
           zone_record.unit_id

      JOIN plants AS plant_record
        ON plant_record.id =
           unit_record.plant_id

      WHERE
        zone_record.is_active = TRUE
        AND unit_record.is_active = TRUE
        AND plant_record.is_active = TRUE
        AND zone_record.area_detail
            IS NOT NULL
        AND BTRIM(
          zone_record.area_detail
        ) <> ''

      ORDER BY area_detail
    `,
  );

  return result.rows.map(
    (row) => row.area_detail,
  );
}

export async function createPatrol(
  {
    location,
    unitId,
    zoneId,
    areaDetail,
    scheduledDate,
    auditorId,
    auditeeId,
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
        ehs_officer_id,
        plant_location,
        area_detail,
        scheduled_date,
        status,
        created_by,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8::DATE,
        'SCHEDULED',
        $5,
        NOW(),
        NOW()
      )
      RETURNING id
    `,
    [
      unitId,
      zoneId,
      auditorId,
      auditeeId,
      ehsOfficerId,
      location,
      areaDetail,
      scheduledDate,
    ],
  );

  return result.rows[0] ?? null;
}

export async function findPatrolById(
  patrolId,
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        patrol.id,
        patrol.plant_location,
        patrol.area_detail,
        patrol.scheduled_date,
        patrol.status,
        patrol.created_at,
        patrol.updated_at,

        unit_record.id AS unit_id,
        unit_record.unit_number,
        unit_record.name AS unit_name,

        zone_record.id AS zone_id,
        zone_record.zone_number,
        zone_record.name AS zone_name,

        auditor.id AS auditor_id,
        auditor.full_name AS auditor_name,

        auditee.id AS auditee_id,
        auditee.full_name AS auditee_name,

        ehs_officer.id AS ehs_officer_id,
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

      JOIN users AS ehs_officer
        ON ehs_officer.id =
           patrol.ehs_officer_id

      WHERE patrol.id = $1
      LIMIT 1
    `,
    [patrolId],
  );

  return mapPatrol(result.rows[0]);
}