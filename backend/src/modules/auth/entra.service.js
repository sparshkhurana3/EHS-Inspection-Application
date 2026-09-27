import {
  withTransaction,
} from "../../config/database.js";

import {
  environment,
} from "../../config/environment.js";

import {
  logger,
} from "../../config/logger.js";

import {
  USER_ROLES,
  normalizeRole,
} from "../../shared/constants/roles.js";

import AppError from "../../shared/errors/AppError.js";

import {
  createAccessToken,
  createPublicUser,
  determineRedirectPath,
  sanitizeRedirectPath,
} from "./authSession.js";

import * as authRepository from "./auth.repository.js";
import * as entraRepository from "./entra.repository.js";

import {
  buildAuthorizationUrl,
  createPkcePair,
  createRandomToken,
  hashExchangeCode,
  resolveIdentity,
} from "./entra.client.js";

/*
 * Microsoft Entra ID sign-in, end to end.
 *
 * Three steps, because the browser leaves the application in the middle
 * of it:
 *
 *   start    the browser is sent to Entra, and the state, nonce and
 *            PKCE verifier are parked in entra_login_sessions
 *   callback Entra sends the browser back with a code; the code is
 *            redeemed here, the account is provisioned or linked, and a
 *            one-time code is handed back
 *   exchange the single-page app trades that one-time code for the same
 *            access token a password sign-in would have produced
 *
 * The last step exists so that a session token never travels in a URL,
 * where it would be recorded in browser history and in every proxy log
 * between here and the user.
 */

const LOGIN_SESSION_TTL_MILLISECONDS =
  10 * 60 * 1000;

/* One redirect, so this needs to cover a page load and nothing more. */
const EXCHANGE_TTL_MILLISECONDS =
  2 * 60 * 1000;

const KNOWN_ROLES = new Set(
  Object.values(USER_ROLES),
);

export function isEntraEnabled() {
  return environment.entra.isEnabled;
}

/**
 * Tells the sign-in page which providers to offer. Public: it must be
 * readable by somebody who has not signed in yet, and it reveals
 * nothing beyond whether the button should be drawn.
 */
export function describeProviders() {
  return {
    providers: {
      local: {
        enabled: true,
      },

      entra: {
        enabled: isEntraEnabled(),

        label: isEntraEnabled()
          ? environment.entra.buttonLabel
          : null,
      },
    },
  };
}

function requireEnabled() {
  if (!isEntraEnabled()) {
    throw new AppError(
      "Microsoft Entra ID sign-in is not configured for this deployment. Sign in with your username and password.",
      503,
      "ENTRA_NOT_CONFIGURED",
    );
  }
}

export async function startLogin({
  redirectTo,
} = {}) {
  requireEnabled();

  const state = createRandomToken();
  const nonce = createRandomToken();

  const {
    codeVerifier,
    codeChallenge,
  } = createPkcePair();

  /*
   * Built before the row is written: if Entra is unreachable this
   * throws ENTRA_UNAVAILABLE and leaves nothing behind to clean up.
   */
  const authorizationUrl =
    await buildAuthorizationUrl({
      state,
      nonce,
      codeChallenge,
    });

  await entraRepository.createLoginSession({
    state,
    nonce,
    codeVerifier,
    redirectTo:
      sanitizeRedirectPath(redirectTo),
    expiresAt: new Date(
      Date.now() +
        LOGIN_SESSION_TTL_MILLISECONDS,
    ),
  });

  /*
   * Housekeeping here rather than on a timer, so the table stays small
   * without adding a scheduler to the process. Failure is irrelevant to
   * the person signing in.
   */
  entraRepository
    .deleteFinishedLoginSessions()
    .catch((error) =>
      logger.warn(
        "Could not prune finished Entra login sessions.",
        { reason: error.message },
      ),
    );

  return authorizationUrl;
}

/**
 * A work account's address can arrive under any of three claims
 * depending on how the tenant is configured, so all three are tried
 * before giving up.
 */
function readEmail(claims) {
  const candidate = [
    claims.email,
    claims.preferred_username,
    claims.upn,
  ].find(
    (value) =>
      typeof value === "string" &&
      value.includes("@"),
  );

  if (!candidate) {
    throw new AppError(
      "Your Microsoft account did not supply an email address, which this application needs. Contact the EHS application administrator.",
      400,
      "ENTRA_EMAIL_CLAIM_MISSING",
    );
  }

  return candidate.trim().toLowerCase();
}

function readFullName(claims, email) {
  const candidate = [
    claims.name,
    [claims.given_name, claims.family_name]
      .filter(Boolean)
      .join(" "),
  ].find(
    (value) =>
      typeof value === "string" &&
      value.trim().length > 0,
  );

  return (
    candidate?.trim().slice(0, 150) ??
    email.split("@")[0]
  );
}

/**
 * Translates the directory's app role assignments into this
 * application's role codes.
 *
 * Entra is the authoritative source, so whatever comes back here
 * replaces what the database holds. Values this application does not
 * recognise are dropped rather than rejected, because a typo in the
 * Entra manifest should not be able to lock everybody out; it is logged
 * so an administrator can find it.
 */
function resolveRoles(claims) {
  const entra = environment.entra;

  const rawClaim = claims[entra.roleClaim];

  const claimedValues = Array.isArray(rawClaim)
    ? rawClaim
    : typeof rawClaim === "string" && rawClaim
      ? [rawClaim]
      : [];

  const unrecognised = [];

  const mapped = claimedValues.reduce(
    (roles, value) => {
      const translated =
        entra.roleMap[value] ?? value;

      const roleCode =
        normalizeRole(translated);

      if (!KNOWN_ROLES.has(roleCode)) {
        unrecognised.push(value);

        return roles;
      }

      return roles.includes(roleCode)
        ? roles
        : [...roles, roleCode];
    },
    [],
  );

  if (unrecognised.length > 0) {
    logger.warn(
      "Entra ID supplied role values this application does not recognise.",
      {
        unrecognised,
        roleClaim: entra.roleClaim,
      },
    );
  }

  if (mapped.length > 0) {
    return mapped;
  }

  /*
   * Nobody recognisable came back. Entra's own "assignment required"
   * setting is the gate that decides who may reach the application at
   * all; this decides what somebody who cleared that gate without an
   * app role can do. Configuring an empty default refuses them instead.
   */
  const fallbackRole = normalizeRole(
    environment.entra.defaultRole,
  );

  if (KNOWN_ROLES.has(fallbackRole)) {
    return [fallbackRole];
  }

  throw new AppError(
    "Your Microsoft account is not assigned a role in the EHS Inspection application. Contact the EHS application administrator.",
    403,
    "ENTRA_NO_APPLICATION_ROLE",
  );
}

async function generateUsername(
  email,
  client,
) {
  const base =
    email
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "")
      .slice(0, 80) || "user";

  const isTaken =
    await entraRepository.isUsernameTaken(
      base,
      client,
    );

  if (!isTaken) {
    return base;
  }

  /*
   * Two directory accounts can share a local part across domains. A
   * short random suffix settles it without a retry loop, and the
   * username is only ever a display and local sign-in handle.
   */
  return `${base}.${createRandomToken(4)
    .toLowerCase()
    .slice(0, 6)}`;
}

/**
 * Finds the application account behind a verified directory identity,
 * creating it if this is the person's first sign-in.
 *
 * Matching is on the immutable object id first and on email only as a
 * fallback, and email is trusted for this purpose solely because the
 * token has already been proved to come from our own tenant. Without
 * that tenant check, matching on email would be an account takeover.
 */
async function resolveUser(claims, client) {
  const entraObjectId = claims.oid;
  const email = readEmail(claims);

  const fullName = readFullName(
    claims,
    email,
  );

  const existingByObjectId =
    await entraRepository
      .findUserByEntraObjectId(
        entraObjectId,
        client,
      );

  if (existingByObjectId) {
    await entraRepository
      .linkExistingUserToEntra(
        {
          userId: existingByObjectId,
          entraObjectId,
          fullName,
          email,
        },
        client,
      );

    return {
      userId: existingByObjectId,
      isNewAccount: false,
    };
  }

  const existingByEmail =
    await entraRepository.findUserIdByEmail(
      email,
      client,
    );

  if (existingByEmail) {
    /*
     * The address is already spoken for by a different directory
     * account. Re-pointing it would hand this person somebody else's
     * patrols, so it stops here for an administrator to sort out.
     */
    if (
      existingByEmail.entraObjectId &&
      existingByEmail.entraObjectId !==
        entraObjectId
    ) {
      throw new AppError(
        "This email address is already linked to a different Microsoft account. Contact the EHS application administrator.",
        409,
        "ENTRA_ACCOUNT_CONFLICT",
      );
    }

    await entraRepository
      .linkExistingUserToEntra(
        {
          userId: existingByEmail.id,
          entraObjectId,
          fullName,
          email,
        },
        client,
      );

    return {
      userId: existingByEmail.id,
      isNewAccount: false,
    };
  }

  const username = await generateUsername(
    email,
    client,
  );

  const userId =
    await entraRepository.createEntraUser(
      {
        fullName,
        username,
        email,
        entraObjectId,
      },
      client,
    );

  return { userId, isNewAccount: true };
}

/**
 * Handles Entra's redirect back into the application. Returns the
 * one-time code the browser should present, not a session.
 */
export async function completeCallback({
  code,
  state,
  requestContext,
}) {
  requireEnabled();

  /*
   * Claimed before any network call, and outside a transaction, so that
   * redeeming the code with Microsoft never holds a database
   * connection. One statement, so a replayed callback gets nothing.
   */
  const loginSession =
    await entraRepository
      .claimLoginSessionByState(state);

  if (!loginSession) {
    throw new AppError(
      "This sign-in request has expired or has already been used. Start signing in again.",
      400,
      "ENTRA_LOGIN_SESSION_INVALID",
    );
  }

  const claims = await resolveIdentity({
    code,
    codeVerifier: loginSession.codeVerifier,
    nonce: loginSession.nonce,
  });

  const exchangeCode = createRandomToken();

  const redirectTo = await withTransaction(
    async (client) => {
      const { userId, isNewAccount } =
        await resolveUser(claims, client);

      const user =
        await authRepository.findUserById(
          userId,
          client,
        );

      if (!user.isActive) {
        throw new AppError(
          "This account has been disabled. Contact the EHS application administrator.",
          403,
          "ACCOUNT_DISABLED",
        );
      }

      const roles =
        await entraRepository
          .replaceUserRoles(
            userId,
            resolveRoles(claims),
            client,
          );

      await authRepository
        .recordSuccessfulLogin(
          userId,
          client,
        );

      await authRepository
        .createAuthenticationEvent(
          {
            userId,
            usernameAttempted: user.email,
            eventType: isNewAccount
              ? "SIGNUP"
              : "LOGIN",
            success: true,
            ipAddress:
              requestContext.ipAddress,
            userAgent:
              requestContext.userAgent,
          },
          client,
        );

      await entraRepository
        .attachExchangeCode(
          {
            loginSessionId:
              loginSession.id,
            userId,
            exchangeCodeHash:
              hashExchangeCode(
                exchangeCode,
              ),
            expiresAt: new Date(
              Date.now() +
                EXCHANGE_TTL_MILLISECONDS,
            ),
          },
          client,
        );

      logger.info(
        "Entra ID sign-in completed.",
        {
          userId,
          isNewAccount,
          roles,
        },
      );

      /*
       * Where the person was heading before being asked to sign in,
       * falling back to the landing page their roles imply.
       */
      return (
        loginSession.redirectTo ??
        determineRedirectPath(roles)
      );
    },
  );

  return { exchangeCode, redirectTo };
}

/**
 * Trades the one-time code for the same session envelope that a
 * password sign-in returns, so the single-page app has one code path
 * for both.
 */
export async function exchangeSession({
  code,
}) {
  requireEnabled();

  return withTransaction(async (client) => {
    const loginSession =
      await entraRepository
        .lockLoginSessionByExchangeCode(
          hashExchangeCode(code),
          client,
        );

    const isUsable =
      loginSession &&
      loginSession.userId &&
      !loginSession.consumedAt &&
      new Date(loginSession.expiresAt) >
        new Date();

    if (!isUsable) {
      throw new AppError(
        "This sign-in could not be completed. Start signing in again.",
        400,
        "ENTRA_EXCHANGE_CODE_INVALID",
      );
    }

    await entraRepository
      .consumeLoginSession(
        loginSession.id,
        client,
      );

    const user =
      await authRepository.findUserById(
        loginSession.userId,
        client,
      );

    if (!user || !user.isActive) {
      throw new AppError(
        "This account has been disabled. Contact the EHS application administrator.",
        403,
        "ACCOUNT_DISABLED",
      );
    }

    return {
      message: "Sign-in successful.",
      token: createAccessToken(user),
      user: createPublicUser(user),
      redirectTo:
        loginSession.redirectTo ??
        determineRedirectPath(user.roles),
    };
  });
}
