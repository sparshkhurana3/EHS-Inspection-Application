import jwt from "jsonwebtoken";

import {
  environment,
} from "../../config/environment.js";

import {
  USER_ROLES,
} from "../../shared/constants/roles.js";

/*
 * What it means to hold a session in this application, independent of
 * how the person proved who they are. Password sign-in and Microsoft
 * Entra ID sign-in both end here and both mint the same token, so every
 * route, guard and role check downstream is unaware of the difference.
 *
 * Extracted from auth.service.js when Entra was added, for the same
 * reason closureStatus.js was extracted from closure.service.js: two
 * services need it and neither should have to import the other.
 */

export function createPublicUser(user) {
  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    email: user.email,
    roles: user.roles,
    authenticationSource:
      user.authenticationSource,
    lastLoginAt: user.lastLoginAt,
  };
}

export function determineRedirectPath(roles) {
  if (
    roles.includes(USER_ROLES.EHS_OFFICER) ||
    roles.includes(USER_ROLES.ADMIN)
  ) {
    return "/ehs-officer";
  }

  return "/dashboard";
}

export function createAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      username: user.username,
      roles: user.roles,
      tokenType: "access",
    },
    environment.authentication.jwtSecret,
    {
      expiresIn:
        environment.authentication.jwtExpiresIn,
      issuer: "ehs-inspection-api",
      audience: "ehs-inspection-frontend",
    },
  );
}

/**
 * Guards the one value in the sign-in round trip that the caller
 * controls. It is handed back to the browser as a location to go to
 * after signing in, so anything other than a path inside this
 * application is an open redirect waiting to be used in a phishing
 * mail. Protocol-relative "//evil.example" is a URL, not a path.
 */
export function sanitizeRedirectPath(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  const isApplicationPath =
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.startsWith("/\\");

  if (!isApplicationPath) {
    return null;
  }

  return trimmed.slice(0, 255);
}
