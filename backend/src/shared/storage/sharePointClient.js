import { readFile } from "node:fs/promises";

import {
  environment,
} from "../../config/environment.js";

import {
  logger,
} from "../../config/logger.js";

/*
 * Everything Microsoft Graph-specific about keeping photographs in a
 * SharePoint document library. The app authenticates as itself (client
 * credentials), so its reach is whatever the tenant granted the app
 * registration - with Sites.Selected, the one site it was given.
 *
 * A stored photograph is recorded as "sharepoint:<driveId>/<itemId>".
 * Item ids survive renames and moves inside the library, so somebody
 * tidying folders in SharePoint does not break a report.
 */

export const SHAREPOINT_REFERENCE_PREFIX =
  "sharepoint:";

const configuration =
  environment.photoStorage.sharePoint;

const REQUEST_TIMEOUT_MS = 30_000;

const MAX_ATTEMPTS = 3;

const MAX_RETRY_WAIT_MS = 10_000;

/*
 * Files up to this size go up in one request; larger ones through an
 * upload session. A compressed photograph is far below it; an SVG,
 * stored as sent, can be up to 10 MB.
 */
const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024;

/* Upload session chunks must be a multiple of 320 KiB. */
const UPLOAD_CHUNK_SIZE = 16 * 320 * 1024;

/*
 * SharePoint asks unattended applications to identify their traffic
 * this way, so throttling decisions and support cases can tell it apart.
 */
const USER_AGENT =
  "NONISV|EHSInspection|EHSInspectionApp/1.0";

export class SharePointError extends Error {
  constructor(
    message,
    {
      status = null,
      code = null,
    } = {},
  ) {
    super(message);

    this.name = "SharePointError";
    this.status = status;
    this.graphCode = code;
  }
}

let cachedToken = null;
let pendingToken = null;

let cachedDrive = null;
let pendingDrive = null;

const knownFolders = new Set();

export function isSharePointConfigured() {
  return configuration !== null;
}

function requireConfiguration() {
  if (!configuration) {
    throw new SharePointError(
      "SharePoint storage is not configured (SHAREPOINT_SITE_URL is not set).",
    );
  }

  return configuration;
}

function apiUrl(pathAndQuery) {
  return `${requireConfiguration().graphBaseUrl}/v1.0${pathAndQuery}`;
}

function encodePath(value) {
  return value
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

function wait(milliseconds) {
  return new Promise((resolve) =>
    setTimeout(resolve, milliseconds),
  );
}

function retryDelay(response, attempt) {
  const retryAfter = Number(
    response.headers.get("retry-after"),
  );

  const milliseconds =
    Number.isFinite(retryAfter) &&
    retryAfter > 0
      ? retryAfter * 1000
      : 1000 * 2 ** (attempt - 1);

  return Math.min(
    milliseconds,
    MAX_RETRY_WAIT_MS,
  );
}

async function readErrorBody(response) {
  try {
    const body = await response.json();

    return {
      code:
        body?.error?.code ??
        body?.error ??
        null,
      message:
        body?.error?.message ??
        body?.error_description ??
        null,
    };
  } catch {
    return {
      code: null,
      message: null,
    };
  }
}

async function requestToken() {
  const settings = requireConfiguration();

  const response = await fetch(
    `${settings.authority}/${encodeURIComponent(
      settings.tenantId,
    )}/oauth2/v2.0/token`,
    {
      method: "POST",
      body: new URLSearchParams({
        client_id: settings.clientId,
        client_secret: settings.clientSecret,
        scope: `${settings.graphBaseUrl}/.default`,
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(
        REQUEST_TIMEOUT_MS,
      ),
    },
  );

  if (!response.ok) {
    const failure =
      await readErrorBody(response);

    /*
     * Microsoft's own description goes to the log, never to a
     * response: it can name the tenant and the app registration.
     */
    logger.error(
      "Microsoft Graph token request failed.",
      {
        status: response.status,
        code: failure.code,
        description: failure.message,
      },
    );

    throw new SharePointError(
      "Could not obtain a Microsoft Graph access token.",
      {
        status: response.status,
        code: failure.code,
      },
    );
  }

  const body = await response.json();

  return {
    value: body.access_token,

    /* Renew five minutes early rather than race the expiry. */
    expiresAt:
      Date.now() +
      Math.max(
        Number(body.expires_in ?? 3600) - 300,
        60,
      ) *
        1000,
  };
}

/**
 * One token for the whole process, renewed shortly before it expires.
 * Concurrent requests during a renewal share the one token request.
 */
async function getAccessToken() {
  if (
    cachedToken &&
    cachedToken.expiresAt > Date.now()
  ) {
    return cachedToken.value;
  }

  if (!pendingToken) {
    pendingToken = requestToken()
      .then((token) => {
        cachedToken = token;

        return token;
      })
      .finally(() => {
        pendingToken = null;
      });
  }

  return (await pendingToken).value;
}

/**
 * A Graph call with the app's token, retrying what Graph asks to be
 * retried (429 and 503 with Retry-After, and 504) and renewing the
 * token once if it is refused. Returns the Response for any status in
 * `acceptStatuses`; anything else becomes a SharePointError.
 */
async function graphRequest(
  url,
  {
    method = "GET",
    headers = {},
    body,
    acceptStatuses = [200, 201, 204],
    authenticated = true,
  } = {},
) {
  let renewedToken = false;

  for (
    let attempt = 1;
    ;
    attempt += 1
  ) {
    const response = await fetch(url, {
      method,
      body,
      headers: {
        "User-Agent": USER_AGENT,
        ...headers,
        ...(authenticated
          ? {
              Authorization: `Bearer ${await getAccessToken()}`,
            }
          : {}),
      },
      signal: AbortSignal.timeout(
        REQUEST_TIMEOUT_MS,
      ),
    });

    if (acceptStatuses.includes(response.status)) {
      return response;
    }

    if (
      authenticated &&
      response.status === 401 &&
      !renewedToken
    ) {
      cachedToken = null;
      renewedToken = true;

      continue;
    }

    if (
      [429, 503, 504].includes(response.status) &&
      attempt < MAX_ATTEMPTS
    ) {
      await wait(
        retryDelay(response, attempt),
      );

      continue;
    }

    const failure =
      await readErrorBody(response);

    throw new SharePointError(
      failure.message ??
        `Microsoft Graph answered ${response.status}.`,
      {
        status: response.status,
        code: failure.code,
      },
    );
  }
}

async function findDrive() {
  const settings = requireConfiguration();

  const site = settings.siteId
    ? { id: settings.siteId }
    : await (
        await graphRequest(
          apiUrl(
            `/sites/${settings.siteHostname}:/${encodePath(
              settings.sitePath,
            )}?$select=id,webUrl`,
          ),
        )
      ).json();

  const drivesResponse = await graphRequest(
    apiUrl(
      `/sites/${site.id}/drives?$select=id,name,webUrl`,
    ),
  );

  const drives =
    (await drivesResponse.json()).value ?? [];

  const wanted =
    settings.library.toLowerCase();

  const drive = drives.find((candidate) => {
    const urlName = decodeURIComponent(
      String(candidate.webUrl ?? "")
        .split("/")
        .pop() ?? "",
    ).toLowerCase();

    return (
      String(candidate.name ?? "")
        .toLowerCase() === wanted ||
      urlName === wanted
    );
  });

  if (!drive) {
    throw new SharePointError(
      `The site has no document library called "${settings.library}". Libraries found: ${
        drives
          .map((candidate) => candidate.name)
          .join(", ") || "none"
      }.`,
      {
        status: 404,
        code: "libraryNotFound",
      },
    );
  }

  return {
    siteId: site.id,
    driveId: drive.id,
    driveName: drive.name,
    driveWebUrl: drive.webUrl,
  };
}

/**
 * The configured site and library, looked up once. A failed lookup is
 * not cached, so a SharePoint outage clears on its own.
 */
export async function resolveDrive() {
  if (cachedDrive) {
    return cachedDrive;
  }

  if (!pendingDrive) {
    pendingDrive = findDrive()
      .then((drive) => {
        cachedDrive = drive;

        return drive;
      })
      .finally(() => {
        pendingDrive = null;
      });
  }

  return pendingDrive;
}

/**
 * Creates each missing folder along a path, remembering the ones it
 * has seen. Graph answers 409 for a folder that already exists, which
 * is the common case after a restart and is not an error.
 */
async function ensureFolder(driveId, folderPath) {
  const segments = folderPath
    .split("/")
    .filter(Boolean);

  for (
    let index = 0;
    index < segments.length;
    index += 1
  ) {
    const currentPath = segments
      .slice(0, index + 1)
      .join("/");

    const cacheKey = `${driveId}/${currentPath}`;

    if (knownFolders.has(cacheKey)) {
      continue;
    }

    const parentPath = segments
      .slice(0, index)
      .join("/");

    const childrenUrl = parentPath
      ? apiUrl(
          `/drives/${driveId}/root:/${encodePath(
            parentPath,
          )}:/children`,
        )
      : apiUrl(
          `/drives/${driveId}/root/children`,
        );

    await graphRequest(childrenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: segments[index],
        folder: {},
        "@microsoft.graph.conflictBehavior":
          "fail",
      }),
      acceptStatuses: [200, 201, 409],
    });

    knownFolders.add(cacheKey);
  }
}

async function uploadInOneRequest(
  driveId,
  itemPath,
  content,
  mimeType,
) {
  const response = await graphRequest(
    apiUrl(
      `/drives/${driveId}/root:/${encodePath(
        itemPath,
      )}:/content?@microsoft.graph.conflictBehavior=fail`,
    ),
    {
      method: "PUT",
      headers: {
        "Content-Type": mimeType,
      },
      body: content,
    },
  );

  return response.json();
}

async function uploadInSession(
  driveId,
  itemPath,
  content,
) {
  const sessionResponse = await graphRequest(
    apiUrl(
      `/drives/${driveId}/root:/${encodePath(
        itemPath,
      )}:/createUploadSession`,
    ),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        item: {
          "@microsoft.graph.conflictBehavior":
            "fail",
        },
      }),
    },
  );

  const { uploadUrl } =
    await sessionResponse.json();

  let item = null;

  for (
    let start = 0;
    start < content.length;
    start += UPLOAD_CHUNK_SIZE
  ) {
    const end = Math.min(
      start + UPLOAD_CHUNK_SIZE,
      content.length,
    );

    /*
     * The upload URL is pre-authorised; Graph rejects a chunk that
     * also carries the bearer token.
     */
    const chunkResponse = await graphRequest(
      uploadUrl,
      {
        method: "PUT",
        authenticated: false,
        headers: {
          "Content-Range": `bytes ${start}-${end - 1}/${content.length}`,
        },
        body: content.subarray(start, end),
        acceptStatuses: [200, 201, 202],
      },
    );

    if (chunkResponse.status !== 202) {
      item = await chunkResponse.json();
    }
  }

  return item;
}

/**
 * Uploads one local file into `<SHAREPOINT_FOLDER>/<folder>/` and
 * returns the reference to store in the database.
 */
export async function uploadFile({
  localPath,
  folder,
  fileName,
  mimeType,
}) {
  const settings = requireConfiguration();

  const { driveId } = await resolveDrive();

  const folderPath = [
    settings.folder,
    folder,
  ]
    .filter(Boolean)
    .join("/");

  await ensureFolder(driveId, folderPath);

  const content = await readFile(localPath);

  const itemPath = `${folderPath}/${fileName}`;

  const item =
    content.length <= SIMPLE_UPLOAD_LIMIT
      ? await uploadInOneRequest(
          driveId,
          itemPath,
          content,
          mimeType,
        )
      : await uploadInSession(
          driveId,
          itemPath,
          content,
        );

  if (!item?.id) {
    throw new SharePointError(
      "SharePoint accepted the upload but returned no item id.",
    );
  }

  return `${SHAREPOINT_REFERENCE_PREFIX}${driveId}/${item.id}`;
}

export function parseReference(reference) {
  const value = String(reference ?? "");

  if (
    !value.startsWith(
      SHAREPOINT_REFERENCE_PREFIX,
    )
  ) {
    return null;
  }

  const location = value.slice(
    SHAREPOINT_REFERENCE_PREFIX.length,
  );

  const separator = location.indexOf("/");

  if (
    separator < 1 ||
    separator === location.length - 1
  ) {
    return null;
  }

  return {
    driveId: location.slice(0, separator),
    itemId: location.slice(separator + 1),
  };
}

function requireReference(reference) {
  const parsed = parseReference(reference);

  if (!parsed) {
    throw new SharePointError(
      "The stored SharePoint reference is malformed.",
    );
  }

  return parsed;
}

/**
 * The file's bytes as a web stream. Graph answers the content request
 * with a redirect to a short-lived, pre-authorised download address,
 * which fetch follows.
 */
export async function downloadFile(reference) {
  const { driveId, itemId } =
    requireReference(reference);

  const response = await graphRequest(
    apiUrl(
      `/drives/${encodeURIComponent(
        driveId,
      )}/items/${encodeURIComponent(
        itemId,
      )}/content`,
    ),
    {
      acceptStatuses: [200],
    },
  );

  return {
    body: response.body,
    contentLength: response.headers.get(
      "content-length",
    ),
  };
}

/**
 * Deletes a stored file. One that is already gone counts as deleted.
 * The library's recycle bin keeps it for the tenant's retention period.
 */
export async function deleteFile(reference) {
  const { driveId, itemId } =
    requireReference(reference);

  await graphRequest(
    apiUrl(
      `/drives/${encodeURIComponent(
        driveId,
      )}/items/${encodeURIComponent(itemId)}`,
    ),
    {
      method: "DELETE",
      acceptStatuses: [200, 204, 404],
    },
  );
}
