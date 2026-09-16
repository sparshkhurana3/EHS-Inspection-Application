import { databasePool } from "../../config/database.js";

function mapUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    fullName: row.full_name,
    username: row.username,
    email: row.email,
    passwordHash: row.password_hash,
    authenticationSource:
      row.authentication_source,
    isActive: row.is_active,
    failedLoginAttempts:
      row.failed_login_attempts,
    lockedUntil: row.locked_until,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    roles: Array.isArray(row.roles)
      ? row.roles
      : [],
  };
}

export async function findUserByUsernameOrEmail(
  identifier,
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        u.id,
        u.full_name,
        u.username,
        u.email,
        u.password_hash,
        u.authentication_source,
        u.is_active,
        u.failed_login_attempts,
        u.locked_until,
        u.last_login_at,
        u.created_at,
        COALESCE(
          ARRAY_AGG(r.code)
            FILTER (WHERE r.code IS NOT NULL),
          ARRAY[]::VARCHAR[]
        ) AS roles
      FROM users u
      LEFT JOIN user_roles ur
        ON ur.user_id = u.id
      LEFT JOIN roles r
        ON r.id = ur.role_id
      WHERE
        LOWER(u.username) = LOWER($1)
        OR LOWER(u.email) = LOWER($1)
      GROUP BY u.id
      LIMIT 1
    `,
    [identifier],
  );

  return mapUser(result.rows[0]);
}

export async function findUserById(
  userId,
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        u.id,
        u.full_name,
        u.username,
        u.email,
        u.password_hash,
        u.authentication_source,
        u.is_active,
        u.failed_login_attempts,
        u.locked_until,
        u.last_login_at,
        u.created_at,
        COALESCE(
          ARRAY_AGG(r.code)
            FILTER (WHERE r.code IS NOT NULL),
          ARRAY[]::VARCHAR[]
        ) AS roles
      FROM users u
      LEFT JOIN user_roles ur
        ON ur.user_id = u.id
      LEFT JOIN roles r
        ON r.id = ur.role_id
      WHERE u.id = $1
      GROUP BY u.id
      LIMIT 1
    `,
    [userId],
  );

  return mapUser(result.rows[0]);
}

export async function createUser(
  {
    fullName,
    username,
    email,
    passwordHash,
    authenticationSource,
  },
  client,
) {
  const result = await client.query(
    `
      INSERT INTO users (
        full_name,
        username,
        email,
        password_hash,
        authentication_source
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        full_name,
        username,
        email,
        authentication_source,
        is_active,
        failed_login_attempts,
        locked_until,
        last_login_at,
        created_at
    `,
    [
      fullName,
      username,
      email,
      passwordHash,
      authenticationSource,
    ],
  );

  return mapUser(result.rows[0]);
}

export async function assignRoleToUser(
  userId,
  roleCode,
  client,
) {
  await client.query(
    `
      INSERT INTO user_roles (
        user_id,
        role_id
      )
      SELECT
        $1,
        r.id
      FROM roles r
      WHERE r.code = $2
      ON CONFLICT (user_id, role_id)
      DO NOTHING
    `,
    [userId, roleCode],
  );
}

export async function recordSuccessfulLogin(
  userId,
  client = databasePool,
) {
  await client.query(
    `
      UPDATE users
      SET
        last_login_at = NOW(),
        failed_login_attempts = 0,
        locked_until = NULL,
        updated_at = NOW()
      WHERE id = $1
    `,
    [userId],
  );
}

export async function recordFailedLogin(
  userId,
  client = databasePool,
) {
  await client.query(
    `
      UPDATE users
      SET
        failed_login_attempts =
          failed_login_attempts + 1,

        locked_until =
          CASE
            WHEN failed_login_attempts + 1 >= 5
            THEN NOW() + INTERVAL '15 minutes'
            ELSE locked_until
          END,

        updated_at = NOW()
      WHERE id = $1
    `,
    [userId],
  );
}

export async function createAuthenticationEvent(
  {
    userId = null,
    usernameAttempted = null,
    eventType,
    success,
    ipAddress = null,
    userAgent = null,
  },
  client = databasePool,
) {
  await client.query(
    `
      INSERT INTO authentication_events (
        user_id,
        username_attempted,
        event_type,
        success,
        ip_address,
        user_agent
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        NULLIF($5, '')::INET,
        $6
      )
    `,
    [
      userId,
      usernameAttempted,
      eventType,
      success,
      ipAddress,
      userAgent,
    ],
  );
}