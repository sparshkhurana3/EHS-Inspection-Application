import { useState } from "react";
import {
  Link,
  useNavigate,
} from "react-router-dom";

import AuthLayout from "../../layouts/AuthLayout.jsx";
import Button from "../../components/Button.jsx";
import useAuth from "./useAuth.js";

const initialValues = {
  fullName: "",
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
};

export default function SignupPage() {
  const navigate = useNavigate();

  const {
    loading,
    error,
    signup,
    clearMessages,
  } = useAuth();

  const [formValues, setFormValues] =
    useState(initialValues);

  const [localError, setLocalError] =
    useState("");

  function handleChange(event) {
  const fieldName = event.target.name;
  const fieldValue = event.target.value;

  setFormValues((currentValues) => {
    switch (fieldName) {
      case "fullName":
        return {
          ...currentValues,
          fullName: fieldValue,
        };

      case "username":
        return {
          ...currentValues,
          username: fieldValue,
        };

      case "email":
        return {
          ...currentValues,
          email: fieldValue,
        };

      case "password":
        return {
          ...currentValues,
          password: fieldValue,
        };

      case "confirmPassword":
        return {
          ...currentValues,
          confirmPassword: fieldValue,
        };

      default:
        return currentValues;
    }
  });

  setLocalError("");
  clearMessages();
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (
      formValues.password !==
      formValues.confirmPassword
    ) {
      setLocalError(
        "Password and confirm password do not match.",
      );

      return;
    }

    const result = await signup(formValues);

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

  const displayedError = localError || error;

  return (
    <AuthLayout
      title="Create an account"
      description="Register to participate in safety patrol and corrective-action workflows."
    >
      <form
        className="auth-form"
        onSubmit={handleSubmit}
      >
        <div className="form-field">
          <label htmlFor="signup-full-name">
            Full name
          </label>

          <input
            id="signup-full-name"
            name="fullName"
            type="text"
            autoComplete="name"
            placeholder="Enter your full name"
            value={formValues.fullName}
            onChange={handleChange}
            disabled={loading}
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="signup-username">
            Username
          </label>

          <input
            id="signup-username"
            name="username"
            type="text"
            autoComplete="username"
            placeholder="Create a username"
            value={formValues.username}
            onChange={handleChange}
            disabled={loading}
            minLength={3}
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="signup-email">
            Company email
          </label>

          <input
            id="signup-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="Enter your company email"
            value={formValues.email}
            onChange={handleChange}
            disabled={loading}
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="signup-password">
            Password
          </label>

          <input
            id="signup-password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Create a password"
            value={formValues.password}
            onChange={handleChange}
            disabled={loading}
            minLength={8}
            required
          />

          <small className="form-field-help">
            Use at least 8 characters with uppercase,
            lowercase, numeric, and special characters.
          </small>
        </div>

        <div className="form-field">
          <label htmlFor="signup-confirm-password">
            Confirm password
          </label>

          <input
            id="signup-confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Re-enter your password"
            value={formValues.confirmPassword}
            onChange={handleChange}
            disabled={loading}
            minLength={8}
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
            ? "Creating account..."
            : "Sign up"}
        </Button>
      </form>

      <p className="auth-switch-message">
        Already have an account?{" "}
        <Link to="/sign-in">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}