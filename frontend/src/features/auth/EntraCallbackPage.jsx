import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import AuthLayout from "../../layouts/AuthLayout.jsx";
import Button from "../../components/Button.jsx";

import { useAuthenticatedUser } from "../../app/authProvider.jsx";
import { exchangeEntraCode } from "./auth.service.js";
import { getErrorMessage } from "../../lib/errorMessage.js";

/**
 * Where Microsoft sign-in lands once the server has established who the
 * person is. It holds a one-time code, not a session, and trades it for
 * the real thing.
 *
 * The code is deliberately short lived and single use, so this page is
 * only ever passed through; if it is reloaded or revisited the code is
 * already spent and the person is sent back to sign in.
 */
export default function EntraCallbackPage() {
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();

  const { setAuthenticatedUser } =
    useAuthenticatedUser();

  const [error, setError] = useState("");

  /*
   * React runs effects twice in development's strict mode, and the code
   * may only be spent once, so the attempt is guarded rather than left
   * to the dependency array.
   */
  const hasAttempted = useRef(false);

  useEffect(() => {
    if (hasAttempted.current) {
      return;
    }

    hasAttempted.current = true;

    const code = searchParams.get("code");

    if (!code) {
      setError(
        "This sign-in link is incomplete. Start signing in again.",
      );

      return;
    }

    exchangeEntraCode({ code })
      .then((result) => {
        if (
          !result?.token ||
          !result?.user
        ) {
          throw new Error(
            "The authentication server did not return a session.",
          );
        }

        setAuthenticatedUser(
          result.user,
          result.token,
        );

        navigate(
          searchParams.get("redirectTo") ??
            result.redirectTo ??
            "/dashboard",
          { replace: true },
        );
      })
      .catch((requestError) => {
        setError(
          getErrorMessage(requestError),
        );
      });
  }, [
    navigate,
    searchParams,
    setAuthenticatedUser,
  ]);

  if (error) {
    return (
      <AuthLayout
        title="Sign-in failed"
        description="Your Microsoft sign-in could not be completed."
      >
        <div
          className="auth-form-error"
          role="alert"
        >
          {error}
        </div>

        <div className="auth-sso">
          <Button
            to="/sign-in"
            variant="primary"
            className="auth-submit-button"
          >
            Back to sign in
          </Button>

          <p className="auth-sso-hint">
            You can also sign in with your
            username and password.
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Signing you in"
      description="Completing your Microsoft sign-in."
    >
      <p
        className="auth-sso-hint"
        role="status"
      >
        One moment...
      </p>
    </AuthLayout>
  );
}
