import dotenv from "dotenv";

/*
 * quiet: dotenv 17 otherwise prints a banner line to stdout on every
 * start, which lands in the JSON logs and the admin scripts' output.
 */
dotenv.config({ quiet: true });

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
function readEntraConfiguration(
  frontendOrigin,
) {
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
     * a browser. nginx serves the API on the same origin as the app, so
     * the default is simply the app's own address plus the callback
     * path, and a deployment only has to state its address once.
     */
    redirectUri: readOptional(
      "ENTRA_REDIRECT_URI",
      `${frontendOrigin}/api/auth/entra/callback`,
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

/*
 * The address people type to reach the app. Single sign-on sends the
 * browser back here, so on a real deployment it is the https:// origin
 * of the server, with no trailing slash.
 */
const frontendOrigin = readOptional(
  "FRONTEND_ORIGIN",
  "http://localhost:5173",
).replace(/\/+$/, "");

const entraConfiguration = readEntraConfiguration(
  frontendOrigin,
);

/*
 * Whether anyone who can reach the sign-up page may create an account.
 * Unset, it follows the identity setup: open while the app runs on
 * passwords only, closed once Entra ID is configured, because from then
 * on the directory decides who gets in and a self-made local account
 * would walk around that. Break-glass accounts are created with
 * scripts/admin.js instead.
 */
function readSelfSignupEnabled() {
  const value = readOptional(
    "SELF_SIGNUP_ENABLED",
    "",
  ).toLowerCase();

  if (value === "") {
    return !entraConfiguration.isEnabled;
  }

  if (value === "true" || value === "false") {
    return value === "true";
  }

  throw new Error(
    `SELF_SIGNUP_ENABLED must be "true" or "false", or left empty; got "${value}".`,
  );
}

/*
 * Where new photographs are kept: "local" writes them to the uploads
 * volume, "sharepoint" puts them in a SharePoint document library
 * through Microsoft Graph. The choice only affects new uploads - every
 * stored photograph records where it lives, so switching never strands
 * the ones already taken.
 *
 * The SharePoint connection is read whenever a site is configured,
 * even with "local" storage selected, so photographs already in
 * SharePoint stay readable after switching back.
 */
function readPhotoStorageConfiguration() {
  const driver = readOptional(
    "PHOTO_STORAGE",
    "local",
  ).toLowerCase();

  if (
    driver !== "local" &&
    driver !== "sharepoint"
  ) {
    throw new Error(
      `PHOTO_STORAGE must be "local" or "sharepoint"; got "${driver}".`,
    );
  }

  const siteUrl = readOptional(
    "SHAREPOINT_SITE_URL",
    "",
  ).replace(/\/+$/, "");

  if (!siteUrl) {
    if (driver === "sharepoint") {
      throw new Error(
        "PHOTO_STORAGE is \"sharepoint\" but SHAREPOINT_SITE_URL is not set.",
      );
    }

    return {
      driver,
      sharePoint: null,
    };
  }

  let parsedSiteUrl;

  try {
    parsedSiteUrl = new URL(siteUrl);
  } catch {
    throw new Error(
      `SHAREPOINT_SITE_URL "${siteUrl}" is not a URL. Use the site's address, e.g. https://contoso.sharepoint.com/sites/EHSInspection.`,
    );
  }

  if (
    parsedSiteUrl.protocol !== "https:" ||
    parsedSiteUrl.pathname === "/"
  ) {
    throw new Error(
      `SHAREPOINT_SITE_URL "${siteUrl}" must be an https:// site address such as https://contoso.sharepoint.com/sites/EHSInspection.`,
    );
  }

  /*
   * The same app registration that signs people in can hold the
   * SharePoint permission, which leaves one secret to rotate; a
   * separate registration can be named instead for a stricter split.
   */
  const tenantId = readOptional(
    "SHAREPOINT_TENANT_ID",
    entraConfiguration.tenantId ?? "",
  );

  const clientId = readOptional(
    "SHAREPOINT_CLIENT_ID",
    entraConfiguration.clientId ?? "",
  );

  const clientSecret = readOptional(
    "SHAREPOINT_CLIENT_SECRET",
    entraConfiguration.clientSecret ?? "",
  );

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      "SHAREPOINT_SITE_URL is set but there are no credentials to reach it. Set SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID and SHAREPOINT_CLIENT_SECRET, or configure Entra ID sign-in, whose app registration is used when they are blank.",
    );
  }

  return {
    driver,

    sharePoint: {
      siteHostname: parsedSiteUrl.hostname,
      sitePath: decodeURIComponent(
        parsedSiteUrl.pathname,
      ),
      siteUrl,

      /*
       * Optional. The site is normally found from its address; the id
       * ("contoso.sharepoint.com,<guid>,<guid>", the one used when the
       * app was granted the site) skips that lookup.
       */
      siteId: readOptional(
        "SHAREPOINT_SITE_ID",
        "",
      ),

      /*
       * The document library, by the name shown in SharePoint. A new
       * team site's default library is called "Documents" (its address
       * says "Shared Documents").
       */
      library: readOptional(
        "SHAREPOINT_LIBRARY",
        "Documents",
      ),

      /*
       * The folder inside the library that holds everything this app
       * stores, as a "/"-separated path.
       */
      folder: readOptional(
        "SHAREPOINT_FOLDER",
        "EHS Inspection",
      ).replace(/^\/+|\/+$/g, ""),

      tenantId,
      clientId,
      clientSecret,

      /*
       * The public cloud by default; a sovereign cloud uses its own
       * sign-in host (as for ENTRA_AUTHORITY) and its own Graph host,
       * e.g. https://graph.microsoft.us for US Government.
       */
      authority: readOptional(
        "SHAREPOINT_AUTHORITY",
        entraConfiguration.authority ??
          "https://login.microsoftonline.com",
      ).replace(/\/+$/, ""),

      graphBaseUrl: readOptional(
        "GRAPH_BASE_URL",
        "https://graph.microsoft.com",
      ).replace(/\/+$/, ""),
    },
  };
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

  frontendOrigin,

  selfSignupEnabled:
    readSelfSignupEnabled(),

  entra: Object.freeze(
    entraConfiguration,
  ),

  photoStorage: Object.freeze(
    readPhotoStorageConfiguration(),
  ),
});
