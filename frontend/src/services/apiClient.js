const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  "/api";

export const ACCESS_TOKEN_KEY =
  "ehs_access_token";

export const USER_STORAGE_KEY = "ehs_user";

/*
 * Notified when a request comes back 401 so the session can be cleared
 * once, centrally, instead of every page inventing its own handling.
 */
let onUnauthorized = null;

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

function readToken() {
  try {
    return localStorage.getItem(
      ACCESS_TOKEN_KEY,
    );
  } catch {
    return null;
  }
}

function createHeaders({ body, headers }) {
  const requestHeaders = new Headers(headers);

  const accessToken = readToken();

  if (accessToken) {
    requestHeaders.set(
      "Authorization",
      `Bearer ${accessToken}`,
    );
  }

  requestHeaders.set(
    "Accept",
    "application/json",
  );

  /*
   * The browser must set the multipart boundary itself, so never force
   * a content type on FormData.
   */
  if (
    body !== undefined &&
    body !== null &&
    !(body instanceof FormData) &&
    !requestHeaders.has("Content-Type")
  ) {
    requestHeaders.set(
      "Content-Type",
      "application/json",
    );
  }

  return requestHeaders;
}

async function readResponse(response) {
  const contentType =
    response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const responseText = await response.text();

  return responseText
    ? { message: responseText }
    : {};
}

async function createApiError(
  response,
  fallbackMessage,
) {
  const responseData =
    await readResponse(response);

  const error = new Error(
    responseData?.message ?? fallbackMessage,
  );

  error.status = response.status;
  error.code = responseData?.code;
  error.details = responseData?.details;

  return error;
}

function handleUnauthorized(response) {
  if (
    response.status === 401 &&
    typeof onUnauthorized === "function"
  ) {
    onUnauthorized();
  }
}

export async function apiRequest(
  endpoint,
  options = {},
) {
  const response = await fetch(
    `${API_BASE_URL}${endpoint}`,
    {
      ...options,
      headers: createHeaders({
        body: options.body,
        headers: options.headers,
      }),
    },
  );

  if (!response.ok) {
    handleUnauthorized(response);

    throw await createApiError(
      response,
      "The API request failed.",
    );
  }

  return readResponse(response);
}

/**
 * For endpoints that return bytes rather than JSON, such as an
 * observation photograph, which is served through an authenticated
 * route and so cannot be used as a plain image src.
 */
export async function apiBlobRequest(
  endpoint,
  options = {},
) {
  const response = await fetch(
    `${API_BASE_URL}${endpoint}`,
    {
      ...options,
      headers: createHeaders({
        body: options.body,
        headers: options.headers,
      }),
    },
  );

  if (!response.ok) {
    handleUnauthorized(response);

    throw await createApiError(
      response,
      "The file could not be loaded.",
    );
  }

  return response.blob();
}
