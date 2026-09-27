import { useState } from "react";

import {
  buildEntraSignInUrl,
} from "./auth.service.js";

/**
 * Microsoft's brand mark, which their guidance requires on a button
 * that signs somebody in with a Microsoft account.
 */
function MicrosoftLogo() {
  return (
    <svg
      className="auth-sso-logo"
      viewBox="0 0 21 21"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

/**
 * Sits beneath the password form, because Entra is the way in that
 * almost everybody uses and the form above it is the failsafe for the
 * day Entra cannot be reached.
 *
 * A plain navigation rather than a fetch: the server answers with a
 * redirect to Microsoft, and only the browser can follow that.
 */
export default function EntraSignInButton({
  label,
  disabled = false,
}) {
  const [isRedirecting, setIsRedirecting] =
    useState(false);

  function handleClick() {
    setIsRedirecting(true);

    window.location.assign(
      buildEntraSignInUrl(),
    );
  }

  return (
    <div className="auth-sso">
      <div className="auth-sso-divider">
        <span>or</span>
      </div>

      <button
        type="button"
        className="button button-secondary auth-sso-button"
        onClick={handleClick}
        disabled={disabled || isRedirecting}
      >
        <MicrosoftLogo />

        {isRedirecting
          ? "Redirecting to Microsoft..."
          : label}
      </button>

      <p className="auth-sso-hint">
        Use your company Microsoft account. No
        password needed here.
      </p>
    </div>
  );
}
