import {
  useCallback,
  useState,
} from "react";

import {
  loginUser,
  signupUser,
} from "./auth.service.js";

import { useAuthenticatedUser, } from "../../app/authProvider.jsx"

const ACCESS_TOKEN_KEY = "ehs_access_token";
const USER_STORAGE_KEY = "ehs_user";

/**
 * Stores the authenticated user and access token.
 */
function saveAuthentication(authenticationResult) {
  if (!authenticationResult?.token) {
    throw new Error(
      "The authentication server did not return an access token.",
    );
  }

  if (!authenticationResult?.user) {
    throw new Error(
      "The authentication server did not return user information.",
    );
  }

  localStorage.setItem(
    ACCESS_TOKEN_KEY,
    authenticationResult.token,
  );

  localStorage.setItem(
    USER_STORAGE_KEY,
    JSON.stringify(authenticationResult.user),
  );
}

/**
 * Converts API or network errors into messages suitable
 * for display on the sign-in and sign-up pages.
 */
function getAuthenticationErrorMessage(error) {
  if (
    error instanceof TypeError &&
    error.message === "Failed to fetch"
  ) {
    return (
      "Unable to connect to the EHS API. " +
      "Check that the backend is running and accessible."
    );
  }

  if (
    Array.isArray(error?.details) &&
    error.details.length > 0
  ) {
    return error.details
      .map((detail) => detail.message)
      .filter(Boolean)
      .join(" ");
  }

  if (
    error instanceof Error &&
    error.message
  ) {
    return error.message;
  }

  return "An unexpected authentication error occurred.";
}

/**
 * Provides sign-in and sign-up operations to the
 * authentication pages.
 */
export default function useAuth() {
  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  const { setAuthenticatedUser, } = useAuthenticatedUser();

  /**
   * Signs in an existing local application user.
   */
  const login = useCallback(
    async ({ identifier, password }) => {
      if (loading) {
        return null;
      }

      setLoading(true);
      setError("");
      setSuccessMessage("");

      try {
        const result = await loginUser({
          identifier,
          password,
        });

        saveAuthentication(result);

        setAuthenticatedUser(result.user, result.token);

        setSuccessMessage(
          result.message ??
            "Sign-in successful.",
        );

        return result;
      } catch (requestError) {
        setError(
          getAuthenticationErrorMessage(
            requestError,
          ),
        );

        return null;
      } finally {
        setLoading(false);
      }
    },
    [loading, setAuthenticatedUser],
  );

  /**
   * Creates a new local application account.
   */
  const signup = useCallback(
    async ({
      fullName,
      username,
      email,
      password,
      confirmPassword,
    }) => {
      if (loading) {
        return null;
      }

      setError("");
      setSuccessMessage("");

      if (password !== confirmPassword) {
        setError(
          "Password and confirm password do not match.",
        );

        return null;
      }

      setLoading(true);

      try {
        const result = await signupUser({
          fullName,
          username,
          email,
          password,
          confirmPassword,
        });

        saveAuthentication(result);

        setAuthenticatedUser(result.user, result.token);

        setSuccessMessage(
          result.message ??
            "Your account was created successfully.",
        );

        return result;
      } catch (requestError) {
        setError(
          getAuthenticationErrorMessage(
            requestError,
          ),
        );

        return null;
      } finally {
        setLoading(false);
      }
    },
    [loading, setAuthenticatedUser],
  );

  /**
   * Clears authentication messages.
   */
  const clearMessages = useCallback(() => {
    setError("");
    setSuccessMessage("");
  }, []);

  return {
    loading,
    error,
    successMessage,
    login,
    signup,
    clearMessages,
  };
}