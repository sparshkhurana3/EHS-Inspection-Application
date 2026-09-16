import {
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
