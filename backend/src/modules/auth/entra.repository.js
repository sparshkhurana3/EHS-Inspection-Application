import {
  databasePool,
} from "../../config/database.js";

/*
 * Persistence for Microsoft Entra ID sign-in: the short-lived rows that
 * carry an authorization-code round trip, and the reads and writes that
 * link a directory account to an application account.
 */

function mapLoginSession(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    state: row.state,
    nonce: row.nonce,
    codeVerifier: row.code_verifier,
    redirectTo: row.redirect_to,
    userId: row.user_id,
    authorizedAt: row.authorized_at,
    consumedAt: row.consumed_at,
    expiresAt: row.expires_at,
  };
}

export async function createLoginSession(
  {
    state,
    nonce,
    codeVerifier,
    redirectTo,
    expiresAt,
  },
  client = databasePool,
) {
  const result = await client.query(
    `
      INSERT INTO entra_login_sessions (
        state,
        nonce,
        code_verifier,
        redirect_to,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        state,
        nonce,
        code_verifier,
        redirect_to,
        user_id,
        authorized_at,
        consumed_at,
        expires_at
    `,
    [
      state,
      nonce,
      codeVerifier,
      redirectTo,
      expiresAt,
    ],
  );

  return mapLoginSession(result.rows[0]);
}

/**
 * Takes ownership of a pending sign-in and hands back the secrets it
 * was holding, in one statement.
 *
 * Single statement on purpose. Redeeming the authorization code means
 * two HTTPS calls to Microsoft, and doing that inside an open
 * transaction would pin a pool connection for the duration; a few
 * hundred people signing in on a Monday morning would exhaust the pool
 * waiting on the network. So the row is claimed and released here, and
 * the account work happens in its own transaction afterwards.
 *
 * The WHERE clause is what makes a sign-in single use: a replayed
 * callback URL, or a double-clicked redirect, finds authorized_at
 * already set and gets nothing back. The verifier is wiped in the same
 * statement, so it cannot be claimed twice even in principle.
 */
export async function claimLoginSessionByState(
  state,
  client = databasePool,
) {
  const result = await client.query(
    `
      WITH claimed AS (
        SELECT
          id,
          state,
          nonce,
          code_verifier,
          redirect_to,
          user_id,
          authorized_at,
          consumed_at,
          expires_at
        FROM entra_login_sessions
        WHERE
          state = $1
          AND authorized_at IS NULL
          AND consumed_at IS NULL
          AND expires_at > NOW()
        FOR UPDATE SKIP LOCKED
      )
      UPDATE entra_login_sessions AS session
      SET
        authorized_at = NOW(),

        /*
         * The verifier has served its purpose and is the only secret in
         * the row, so it does not outlive the claim.
         */
        code_verifier = ''
      FROM claimed
      WHERE session.id = claimed.id
      RETURNING
        claimed.id,
        claimed.state,
        claimed.nonce,
        claimed.code_verifier,
        claimed.redirect_to,
        claimed.user_id,
        claimed.authorized_at,
        claimed.consumed_at,
        claimed.expires_at
    `,
    [state],
  );

  return mapLoginSession(result.rows[0]);
}

export async function lockLoginSessionByExchangeCode(
  exchangeCodeHash,
  client,
) {
  const result = await client.query(
    `
      SELECT
        id,
        state,
        nonce,
        code_verifier,
        redirect_to,
        user_id,
        authorized_at,
        consumed_at,
        expires_at
      FROM entra_login_sessions
      WHERE exchange_code_hash = $1
      FOR UPDATE
    `,
    [exchangeCodeHash],
  );

  return mapLoginSession(result.rows[0]);
}

/**
 * Records who signed in and stores the one-time code the browser will
 * trade for an application session. The expiry is shortened here: the
 * directory round trip allows for a person typing a password and
 * approving a push notification, whereas this is one redirect.
 */
export async function attachExchangeCode(
  {
    loginSessionId,
    userId,
    exchangeCodeHash,
    expiresAt,
  },
  client,
) {
  await client.query(
    `
      UPDATE entra_login_sessions
      SET
        user_id = $2,
        exchange_code_hash = $3,
        expires_at = $4
      WHERE id = $1
    `,
    [
      loginSessionId,
      userId,
      exchangeCodeHash,
      expiresAt,
    ],
  );
}

export async function consumeLoginSession(
  loginSessionId,
  client,
) {
  await client.query(
    `
      UPDATE entra_login_sessions
      SET consumed_at = NOW()
      WHERE id = $1
    `,
    [loginSessionId],
  );
}

/*
 * Housekeeping. Called when a sign-in starts rather than on a timer, so
 * the table stays small without adding a scheduler to the process.
 */
export async function deleteFinishedLoginSessions(
  client = databasePool,
) {
  await client.query(
    `
      DELETE FROM entra_login_sessions
      WHERE
        expires_at < NOW()
        OR consumed_at < NOW() - INTERVAL '1 hour'
    `,
  );
}

export async function findUserByEntraObjectId(
  entraObjectId,
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT id
      FROM users
      WHERE entra_object_id = $1
      LIMIT 1
    `,
    [entraObjectId],
  );

  return result.rows[0]
    ? Number(result.rows[0].id)
    : null;
}

export async function findUserIdByEmail(
  email,
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT
        id,
        entra_object_id
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [email],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    entraObjectId: row.entra_object_id,
  };
}

export async function isUsernameTaken(
  username,
  client = databasePool,
) {
  const result = await client.query(
    `
      SELECT 1
      FROM users
      WHERE LOWER(username) = LOWER($1)
      LIMIT 1
    `,
    [username],
  );

  return result.rows.length > 0;
}

export async function createEntraUser(
  {
    fullName,
    username,
    email,
    entraObjectId,
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
        authentication_source,
        entra_object_id
      )
      VALUES ($1, $2, $3, NULL, 'ENTRA', $4)
      RETURNING id
    `,
    [
      fullName,
      username,
      email,
      entraObjectId,
    ],
  );

  return Number(result.rows[0].id);
}

/**
 * Links an account that already existed to its directory identity, and
 * refreshes the name and address the directory now holds.
 *
 * authentication_source is deliberately not touched. An account created
 * locally keeps its password and so keeps working if Entra is
 * unavailable, which is the whole point of retaining password sign-in.
 */
export async function linkExistingUserToEntra(
  {
    userId,
    entraObjectId,
    fullName,
    email,
  },
  client,
) {
  await client.query(
    `
      UPDATE users
      SET
        entra_object_id = $2,
        full_name = COALESCE($3, full_name),
        email = COALESCE($4, email),
        updated_at = NOW()
      WHERE id = $1
    `,
    [
      userId,
      entraObjectId,
      fullName,
      email,
    ],
  );
}

/**
 * Entra is the authoritative source of roles, so every sign-in rewrites
 * them: a role withdrawn in the admin console is gone from the app on
 * the person's next sign-in, without anyone touching the database.
 *
 * Unknown role codes are ignored rather than rejected, so a typo in the
 * Entra manifest cannot take the application down.
 */
export async function replaceUserRoles(
  userId,
  roleCodes,
  client,
) {
  await client.query(
    `
      DELETE FROM user_roles
      WHERE user_id = $1
    `,
    [userId],
  );

  if (roleCodes.length === 0) {
    return [];
  }

  const result = await client.query(
    `
      INSERT INTO user_roles (
        user_id,
        role_id
      )
      SELECT
        $1,
        r.id
      FROM roles r
      WHERE r.code = ANY($2::VARCHAR[])
      ON CONFLICT (user_id, role_id)
      DO NOTHING
      RETURNING role_id
    `,
    [userId, roleCodes],
  );

  const assignedCount = result.rowCount;

  if (assignedCount === 0) {
    return [];
  }

  const assigned = await client.query(
    `
      SELECT r.code
      FROM user_roles ur
      JOIN roles r
        ON r.id = ur.role_id
      WHERE ur.user_id = $1
    `,
    [userId],
  );

  return assigned.rows.map(
    (row) => row.code,
  );
}
