import {
  useCallback,
  useState,
} from "react";

import {
  loginUser,
  signupUser,
} from "./auth.service.js";

import { useAuthenticatedUser } from "../../app/authProvider.jsx";

import { getErrorMessage as getAuthenticationErrorMessage } from "../../lib/errorMessage.js";

/**
 * The provider owns persistence; this only checks the server actually
 * returned a session before we try to start one.
 */
function assertAuthentication(authenticationResult) {
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

        assertAuthentication(result);

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

        assertAuthentication(result);

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