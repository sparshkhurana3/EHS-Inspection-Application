import dotenv from "dotenv";

dotenv.config();

function requireEnvironmentVariable(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Required environment variable "${name}" is missing.`,
    );
  }

  return value;
}

function parsePositiveInteger(value, fallback) {
  const parsedValue = Number.parseInt(value, 10);

  if (
    Number.isNaN(parsedValue) ||
    parsedValue < 1
  ) {
    return fallback;
  }

  return parsedValue;
}

/*
 * compose.yaml passes every optional Entra setting through as
 * "${VAR:-}", so an unset one arrives as an empty string rather than as
 * undefined, and ?? would happily accept it. Anything optional and
 * non-empty has to come through here.
 */
function readOptional(name, fallback) {
  const value = process.env[name];

  return value && value.trim()
    ? value.trim()
    : fallback;
}

/*
 * Microsoft Entra ID is the primary identity provider, but the app has
 * to keep starting when it is not configured yet (a fresh clone, a
 * developer machine, the containers on someone's laptop). So Entra is
 * optional as a whole and strict once switched on: supplying some of
 * the three required settings but not all of them is a deployment
 * mistake we would rather surface at boot than at the first sign-in.
 */
function readEntraConfiguration() {
  const tenantId = process.env.ENTRA_TENANT_ID;
  const clientId = process.env.ENTRA_CLIENT_ID;
  const clientSecret =
    process.env.ENTRA_CLIENT_SECRET;

  const providedSettings = [
    tenantId,
    clientId,
    clientSecret,
  ].filter(Boolean);

  if (providedSettings.length === 0) {
    return { isEnabled: false };
  }

  if (providedSettings.length < 3) {
    throw new Error(
      "Microsoft Entra ID is partially configured. Set ENTRA_TENANT_ID, ENTRA_CLIENT_ID and ENTRA_CLIENT_SECRET together, or none of them.",
    );
  }

  return {
    isEnabled: true,
    tenantId,
    clientId,
    clientSecret,

    /*
     * The public cloud by default. Tenants in a sovereign cloud sign in
     * against a different host - login.microsoftonline.us for US
     * Government, login.partner.microsoftonline.cn for China - and
     * everything else about the flow is identical.
     */
    authority: readOptional(
      "ENTRA_AUTHORITY",
      "https://login.microsoftonline.com",
    ).replace(/\/+$/, ""),

    /*
     * Must match a redirect URI registered on the application exactly,
     * Entra compares it character for character. It points at this API
     * rather than at the single-page app because the authorization code
     * is redeemed here, with the client secret, which must never reach
     * a browser.
     */
    redirectUri: readOptional(
      "ENTRA_REDIRECT_URI",
      "http://localhost:8090/api/auth/entra/callback",
    ),

    /*
     * openid gets us an ID token, profile the display name, email the
     * address. No Microsoft Graph permission is needed: everything the
     * app stores arrives as a claim.
     */
    scopes: readOptional(
      "ENTRA_SCOPES",
      "openid profile email",
    ),

    /*
     * Entra delivers app role assignments in the "roles" claim. Tenants
     * that drive authorization from group membership instead can point
     * this at "groups" and map the object ids below.
     */
    roleClaim: readOptional(
      "ENTRA_ROLE_CLAIM",
      "roles",
    ),

    /*
     * Optional translation from what the directory calls a role to what
     * this application calls it, as "DirectoryValue=APP_ROLE" pairs.
     * Empty when the Entra app roles are named after the app's own role
     * codes, which is what the integration guide recommends.
     */
    roleMap: parseRoleMap(
      process.env.ENTRA_ROLE_MAP,
    ),

    /*
     * Granted to somebody who clears Entra's own assignment gate but
     * carries no role this app recognises. USER is what local signup
     * grants too, so they land on the ordinary dashboard as an auditor
     * or auditee. Set it empty to refuse such sign-ins outright.
     */
    defaultRole:
      process.env.ENTRA_DEFAULT_ROLE ===
      undefined
        ? "USER"
        : process.env.ENTRA_DEFAULT_ROLE.trim(),

    buttonLabel: readOptional(
      "ENTRA_BUTTON_LABEL",
      "Login with Entra SSO",
    ),
  };
}

function parseRoleMap(value) {
  if (!value) {
    return {};
  }

  return value
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .reduce((map, pair) => {
      const separatorIndex =
        pair.indexOf("=");

      if (separatorIndex < 1) {
        throw new Error(
          `ENTRA_ROLE_MAP entry "${pair}" is not in the form "DirectoryValue=APP_ROLE".`,
        );
      }

      const directoryValue = pair
        .slice(0, separatorIndex)
        .trim();

      const applicationRole = pair
        .slice(separatorIndex + 1)
        .trim()
        .toUpperCase();

      return {
        ...map,
        [directoryValue]: applicationRole,
      };
    }, {});
}

export const environment = Object.freeze({
  nodeEnvironment:
    process.env.NODE_ENV ?? "development",

  port: parsePositiveInteger(
    process.env.PORT,
    3000,
  ),

  database: {
    host: requireEnvironmentVariable(
      "DATABASE_HOST",
    ),

    port: parsePositiveInteger(
      process.env.DATABASE_PORT,
      5432,
    ),

    name: requireEnvironmentVariable(
      "DATABASE_NAME",
    ),

    user: requireEnvironmentVariable(
      "DATABASE_USER",
    ),

    password: requireEnvironmentVariable(
      "DATABASE_PASSWORD",
    ),

    ssl:
      process.env.DATABASE_SSL === "true",
  },

  authentication: {
    jwtSecret:
      requireEnvironmentVariable("JWT_SECRET"),

    jwtExpiresIn:
      process.env.JWT_EXPIRES_IN ?? "8h",

    passwordSaltRounds:
      parsePositiveInteger(
        process.env.PASSWORD_SALT_ROUNDS,
        12,
      ),
  },

  frontendOrigin:
    process.env.FRONTEND_ORIGIN ??
    "http://localhost:5173",

  entra: Object.freeze(
    readEntraConfiguration(),
  ),
});
