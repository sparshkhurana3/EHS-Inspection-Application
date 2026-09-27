import {
  useEffect,
  useState,
} from "react";
import {
  Link,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import AuthLayout from "../../layouts/AuthLayout.jsx";
import Button from "../../components/Button.jsx";
import EntraSignInButton from "./EntraSignInButton.jsx";
import useAuth from "./useAuth.js";
import { fetchAuthProviders } from "./auth.service.js";

const initialValues = {
  identifier: "",
  password: "",
};

export default function LoginPage() {
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();

  const {
    loading,
    error,
    login,
    clearMessages,
  } = useAuth();

  const [formValues, setFormValues] =
    useState(initialValues);

  /*
   * Single sign-on fails on a round trip through Microsoft rather than
   * inside a fetch, so the reason arrives as a query parameter on the
   * redirect back to this page.
   */
  const [ssoError, setSsoError] = useState(
    () => searchParams.get("ssoError") ?? "",
  );

  /*
   * Whether this deployment has Entra configured at all. Until the
   * answer arrives the button is not drawn, so it never flashes up on a
   * deployment that runs on passwords only.
   */
  const [entraProvider, setEntraProvider] =
    useState(null);

  useEffect(() => {
    let isCurrent = true;

    fetchAuthProviders()
      .then((result) => {
        if (isCurrent) {
          setEntraProvider(
            result?.providers?.entra ?? null,
          );
        }
      })
      .catch(() => {
        /*
         * The password form is the failsafe and must stay usable even
         * when this lookup fails, so a failure here is silent: it only
         * means the single sign-on button is not offered.
         */
        if (isCurrent) {
          setEntraProvider(null);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  function handleChange(event) {
  const fieldName = event.target.name;
  const fieldValue = event.target.value;

  setFormValues((currentValues) => {
    if (fieldName === "identifier") {
      return {
        ...currentValues,
        identifier: fieldValue,
      };
    }

    if (fieldName === "password") {
      return {
        ...currentValues,
        password: fieldValue,
      };
    }

    return currentValues;
  });

  setSsoError("");
  clearMessages();
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const result = await login({
      identifier: formValues.identifier,
      password: formValues.password,
    });

    if (!result) {
      return;
    }

    navigate(
      result.redirectTo ?? "/dashboard",
      {
        replace: true,
      },
    );
  }

  const displayedError = error || ssoError;

  return (
    <AuthLayout
      title="Sign in"
      description="Enter your credentials to access the EHS Inspection application."
    >
      <form
        className="auth-form"
        onSubmit={handleSubmit}
      >
        <div className="form-field">
          <label htmlFor="login-identifier">
            Username or company email
          </label>

          <input
            id="login-identifier"
            name="identifier"
            type="text"
            autoComplete="username"
            placeholder="Enter username or email"
            value={formValues.identifier}
            onChange={handleChange}
            disabled={loading}
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="login-password">
            Password
          </label>

          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={formValues.password}
            onChange={handleChange}
            disabled={loading}
            required
          />
        </div>

        {displayedError && (
          <div
            className="auth-form-error"
            role="alert"
          >
            {displayedError}
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          className="auth-submit-button"
          disabled={loading}
        >
          {loading
            ? "Signing in..."
            : "Sign in"}
        </Button>
      </form>

      {entraProvider?.enabled && (
        <EntraSignInButton
          label={entraProvider.label}
          disabled={loading}
        />
      )}

      <p className="auth-switch-message">
        Do not have an account?{" "}
        <Link to="/sign-up">
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
}
