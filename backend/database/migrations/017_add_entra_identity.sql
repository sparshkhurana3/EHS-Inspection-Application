/*
 * Microsoft Entra ID single sign-on.
 *
 * users.authentication_source has always allowed 'ENTRA' but nothing
 * wrote it. Two things were missing to make it real:
 *
 *   1. A stable link between an app account and the directory account.
 *      Email is not that link: a person can be renamed in the
 *      directory, and matching on a mutable field is how account
 *      takeover happens. The 'oid' claim is immutable per tenant, so
 *      that is what we store.
 *
 *   2. Somewhere to park the authorization-code round trip. The state,
 *      nonce and PKCE verifier are generated before we redirect to
 *      Entra and have to be read back when Entra redirects the browser
 *      to the callback, which is a different request with no session.
 *
 * Idempotent, like every migration in this folder.
 */

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS entra_object_id VARCHAR(64);

COMMENT ON COLUMN users.entra_object_id IS
  'Immutable Entra ID object identifier (the "oid" claim). NULL for accounts that have never signed in through SSO.';

CREATE UNIQUE INDEX IF NOT EXISTS users_entra_object_id_unique
  ON users (entra_object_id)
  WHERE entra_object_id IS NOT NULL;

/*
 * One row per sign-in attempt, created just before the browser is sent
 * to Entra and destroyed once the resulting session has been handed to
 * the single-page app. Short lived by design: rows expire in minutes
 * and every read deletes the stale ones.
 */
CREATE TABLE IF NOT EXISTS entra_login_sessions (
  id BIGSERIAL PRIMARY KEY,

  /* CSRF token echoed by Entra on the callback. */
  state VARCHAR(128) NOT NULL UNIQUE,

  /* Replay guard, checked against the "nonce" claim of the ID token. */
  nonce VARCHAR(128) NOT NULL,

  /* PKCE (RFC 7636) verifier; Entra only ever sees its SHA-256 hash. */
  code_verifier VARCHAR(128) NOT NULL,

  /* Where the person was heading before they were asked to sign in. */
  redirect_to VARCHAR(255),

  /*
   * SHA-256 of the one-time code handed to the browser after a
   * successful callback, which the app trades for a real access token.
   * Hashed so that read access to this table yields nothing usable.
   */
  exchange_code_hash VARCHAR(64) UNIQUE,

  /* Filled in at the callback, once we know who signed in. */
  user_id BIGINT REFERENCES users (id) ON DELETE CASCADE,

  authorized_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,

  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS entra_login_sessions_expiry_index
  ON entra_login_sessions (expires_at);
