import { Navigate } from "react-router-dom";

import {
  useAuthenticatedUser,
} from "./authProvider.jsx";

import { hasAnyRole } from "../constants/roles.js";

/**
 * Keeps a route out of the hands of users who lack the role, or (with
 * `deny`) out of the hands of users who hold one they should not.
 *
 * Convenience, not security: the API enforces the same rule and is the
 * real boundary. This stops a wrong-role user landing on a page that
 * would only fail for them.
 */
export default function RequireRole({
  roles,
  deny,
  redirectTo = "/dashboard",
  children,
}) {
  const { user } = useAuthenticatedUser();

  if (roles && !hasAnyRole(user, roles)) {
    return <Navigate to={redirectTo} replace />;
  }

  if (deny && hasAnyRole(user, deny)) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
}
