import {
  API_BASE_URL,
  apiRequest,
} from "../../services/apiClient.js";

export function loginUser({
  identifier,
  password,
}) {
  return apiRequest(
    "/auth/login",
    {
      method: "POST",
      body: JSON.stringify({
        identifier:
          identifier.trim().toLowerCase(),
        password,
      }),
    },
  );
}

export function signupUser({
  fullName,
  username,
  email,
  password,
  confirmPassword,
}) {
  return apiRequest(
    "/auth/signup",
    {
      method: "POST",
      body: JSON.stringify({
        fullName: fullName.trim(),
        username:
          username.trim().toLowerCase(),
        email:
          email.trim().toLowerCase(),
        password,
        confirmPassword,
      }),
    },
  );
}

export function fetchCurrentUser() {
  return apiRequest(
    "/auth/me",
    {
      method: "GET",
    },
  );
}

/**
 * Which sign-in methods this deployment offers. Called before anybody
 * has signed in, so it must stay unauthenticated.
 */
export function fetchAuthProviders() {
  return apiRequest(
    "/auth/providers",
    {
      method: "GET",
    },
  );
}

/**
 * Where the browser is sent when the Entra button is pressed. This is a
 * real navigation and not a fetch: the response is a redirect to
 * Microsoft, which only the browser can follow.
 */
export function buildEntraSignInUrl() {
  return `${API_BASE_URL}/auth/entra/start`;
}

/**
 * Trades the one-time code Entra sign-in came back with for the same
 * session envelope a password sign-in returns.
 */
export function exchangeEntraCode({ code }) {
  return apiRequest(
    "/auth/entra/exchange",
    {
      method: "POST",
      body: JSON.stringify({ code }),
    },
  );
}
