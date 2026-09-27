import crypto from "node:crypto";

import {
  createRemoteJWKSet,
  jwtVerify,
} from "jose";

import {
  environment,
} from "../../config/environment.js";

import {
  logger,
} from "../../config/logger.js";

import AppError from "../../shared/errors/AppError.js";

/*
 * Talks OpenID Connect to Microsoft Entra ID. Everything specific to
 * Microsoft lives here; the service above deals only in the claims that
 * come back.
 *
 * The authorization code flow is run server side with a client secret
 * rather than in the browser, because a single-page app cannot keep a
 * secret and because the rest of this API already authenticates with
 * its own JWT. Entra's tokens are used once, here, to establish who the
 * person is and are then discarded: they never reach the browser and
 * are never stored.
 */

const DISCOVERY_CACHE_MILLISECONDS =
  60 * 60 * 1000;

const NETWORK_TIMEOUT_MILLISECONDS = 10_000;

let discoveryCache = null;
let keyStore = null;

function requireEntra() {
  if (!environment.entra.isEnabled) {
    throw new AppError(
      "Microsoft Entra ID sign-in is not configured for this deployment.",
      503,
      "ENTRA_NOT_CONFIGURED",
    );
  }

  return environment.entra;
}

function toBase64Url(buffer) {
  return buffer
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export function createRandomToken(byteLength = 32) {
  return toBase64Url(
    crypto.randomBytes(byteLength),
  );
}

/**
 * Hashes the one-time exchange code so the table that holds it cannot
 * be read for working codes.
 */
export function hashExchangeCode(code) {
  return crypto
    .createHash("sha256")
    .update(code)
    .digest("hex");
}

/**
 * RFC 7636 S256: Entra only ever sees the hash, so an intercepted
 * authorization code is useless without the verifier we kept.
 */
export function createPkcePair() {
  const codeVerifier =
    createRandomToken(32);

  const codeChallenge = toBase64Url(
    crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest(),
  );

  return { codeVerifier, codeChallenge };
}

/**
 * Entra publishes its endpoints and signing keys; reading them rather
 * than hardcoding URLs means key rotation and endpoint changes need no
 * redeploy. Cached for an hour, and a stale copy is preferred to an
 * outage if the refresh fails.
 */
async function discover() {
  const entra = requireEntra();

  const isFresh =
    discoveryCache &&
    discoveryCache.fetchedAt +
      DISCOVERY_CACHE_MILLISECONDS >
      Date.now();

  if (isFresh) {
    return discoveryCache.document;
  }

  const discoveryUrl =
    `${entra.authority}/${entra.tenantId}/v2.0/.well-known/openid-configuration`;

  let response;

  try {
    response = await fetch(discoveryUrl, {
      signal: AbortSignal.timeout(
        NETWORK_TIMEOUT_MILLISECONDS,
      ),
    });
  } catch (error) {
    if (discoveryCache) {
      return discoveryCache.document;
    }

    logger.error(
      "Entra ID discovery request failed.",
      { reason: error.message },
    );

    throw new AppError(
      "Microsoft Entra ID could not be reached. Sign in with your username and password instead.",
      503,
      "ENTRA_UNAVAILABLE",
    );
  }

  if (!response.ok) {
    if (discoveryCache) {
      return discoveryCache.document;
    }

    throw new AppError(
      "Microsoft Entra ID could not be reached. Sign in with your username and password instead.",
      503,
      "ENTRA_UNAVAILABLE",
    );
  }

  const document = await response.json();

  discoveryCache = {
    document,
    fetchedAt: Date.now(),
  };

  /* The signing keys move with the document, so refresh both together. */
  keyStore = createRemoteJWKSet(
    new URL(document.jwks_uri),
  );

  return document;
}

/**
 * The URL the browser is sent to so the person can sign in to the
 * directory. Nothing secret is in it.
 */
export async function buildAuthorizationUrl({
  state,
  nonce,
  codeChallenge,
}) {
  const entra = requireEntra();
  const document = await discover();

  const url = new URL(
    document.authorization_endpoint,
  );

  url.searchParams.set(
    "client_id",
    entra.clientId,
  );

  url.searchParams.set(
    "response_type",
    "code",
  );

  url.searchParams.set(
    "redirect_uri",
    entra.redirectUri,
  );

  url.searchParams.set(
    "response_mode",
    "query",
  );

  url.searchParams.set(
    "scope",
    entra.scopes,
  );

  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);

  url.searchParams.set(
    "code_challenge",
    codeChallenge,
  );

  url.searchParams.set(
    "code_challenge_method",
    "S256",
  );

  return url.toString();
}

/**
 * Trades the authorization code for tokens. This is the one call that
 * carries the client secret, which is why it happens on the server.
 */
async function redeemAuthorizationCode({
  code,
  codeVerifier,
}) {
  const entra = requireEntra();
  const document = await discover();

  const body = new URLSearchParams({
    client_id: entra.clientId,
    client_secret: entra.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: entra.redirectUri,
    code_verifier: codeVerifier,
    scope: entra.scopes,
  });

  let response;

  try {
    response = await fetch(
      document.token_endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(
          NETWORK_TIMEOUT_MILLISECONDS,
        ),
      },
    );
  } catch (error) {
    logger.error(
      "Entra ID token request failed.",
      { reason: error.message },
    );

    throw new AppError(
      "Microsoft Entra ID could not be reached. Sign in with your username and password instead.",
      503,
      "ENTRA_UNAVAILABLE",
    );
  }

  const payload = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    /*
     * Entra's own description is what an administrator needs (expired
     * code, redirect URI mismatch, secret rotated), but it names our
     * configuration and carries correlation ids, so it goes to the log
     * and not into the response: errorHandler serialises details
     * straight to the browser.
     */
    logger.error(
      "Entra ID rejected the authorization code.",
      {
        entraError: payload.error,
        entraErrorDescription:
          payload.error_description,
      },
    );

    throw new AppError(
      "Microsoft Entra ID rejected the sign-in attempt.",
      401,
      "ENTRA_TOKEN_EXCHANGE_FAILED",
    );
  }

  if (!payload.id_token) {
    throw new AppError(
      "Microsoft Entra ID did not return an identity token.",
      502,
      "ENTRA_ID_TOKEN_MISSING",
    );
  }

  return payload;
}

/**
 * Verifies the identity token and returns its claims.
 *
 * Signature, issuer, audience and expiry are checked by jose against
 * the keys published by the tenant. Two further checks matter here:
 *
 *   nonce - ties the token to the sign-in we started, so a token
 *           captured from another session cannot be replayed.
 *   tid   - pins the token to our own tenant. Without it, a token from
 *           any Microsoft tenant would satisfy the others, and since
 *           accounts are matched on email that would be an account
 *           takeover.
 */
async function verifyIdentityToken({
  idToken,
  nonce,
}) {
  const entra = requireEntra();
  const document = await discover();

  if (!keyStore) {
    keyStore = createRemoteJWKSet(
      new URL(document.jwks_uri),
    );
  }

  let claims;

  try {
    ({ payload: claims } = await jwtVerify(
      idToken,
      keyStore,
      {
        issuer: document.issuer,
        audience: entra.clientId,
        clockTolerance: 60,
      },
    ));
  } catch (error) {
    logger.error(
      "Entra ID identity token failed verification.",
      { reason: error.message },
    );

    throw new AppError(
      "The Microsoft Entra ID identity token could not be verified.",
      401,
      "ENTRA_ID_TOKEN_INVALID",
    );
  }

  if (claims.nonce !== nonce) {
    throw new AppError(
      "The Microsoft Entra ID sign-in could not be matched to this browser session. Try signing in again.",
      401,
      "ENTRA_NONCE_MISMATCH",
    );
  }

  if (claims.tid !== entra.tenantId) {
    throw new AppError(
      "This Microsoft account belongs to a different organisation.",
      403,
      "ENTRA_TENANT_NOT_ALLOWED",
    );
  }

  if (!claims.oid) {
    throw new AppError(
      "The Microsoft Entra ID identity token did not identify the user.",
      401,
      "ENTRA_OBJECT_ID_MISSING",
    );
  }

  return claims;
}

/**
 * The whole callback-side exchange: code in, verified claims out.
 */
export async function resolveIdentity({
  code,
  codeVerifier,
  nonce,
}) {
  const tokens =
    await redeemAuthorizationCode({
      code,
      codeVerifier,
    });

  return verifyIdentityToken({
    idToken: tokens.id_token,
    nonce,
  });
}
