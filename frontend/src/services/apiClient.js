const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  "http://localhost:3000/api";

const ACCESS_TOKEN_KEY =
  "ehs_access_token";

function createHeaders({
  body,
  headers,
}) {
  const requestHeaders =
    new Headers(headers);

  const accessToken =
    localStorage.getItem(
      ACCESS_TOKEN_KEY,
    );

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
   * The browser must create the multipart boundary
   * automatically for FormData requests.
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
    response.headers.get(
      "content-type",
    ) ?? "";

  if (
    contentType.includes(
      "application/json",
    )
  ) {
    return response.json();
  }

  const responseText =
    await response.text();

  return responseText
    ? {
        message: responseText,
      }
    : {};
}

async function createApiError(
  response,
  fallbackMessage,
) {
  const responseData =
    await readResponse(response);

  const error = new Error(
    responseData?.message ??
      fallbackMessage,
  );

  error.status = response.status;
  error.code = responseData?.code;
  error.details =
    responseData?.details;

  return error;
}

export async function apiRequest(
  endpoint,
  options = {},
) {
  const requestOptions = {
    ...options,

    headers: createHeaders({
      body: options.body,
      headers: options.headers,
    }),
  };

  const response = await fetch(
    `${API_BASE_URL}${endpoint}`,
    requestOptions,
  );

  if (!response.ok) {
    throw await createApiError(
      response,
      "The API request failed.",
    );
  }

  return readResponse(response);
}