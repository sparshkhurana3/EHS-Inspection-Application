export const USER_ROLES = Object.freeze({
  USER: "USER",
  EHS_OFFICER: "EHS_OFFICER",
  HOD: "HOD",
  PLANT_HEAD: "PLANT_HEAD",
  ADMIN: "ADMIN",
});

export const DEFAULT_SIGNUP_ROLE =
  USER_ROLES.USER;

/*
 * Roles that administer the process rather than take part in an
 * individual patrol. ADMIN is included because login already routes
 * admins to the EHS Officer landing page and the dashboard treats them
 * as management; excluding them from authorize() left an admin bounced
 * from the page their own sign-in points at.
 */
export const MANAGEMENT_ROLES = Object.freeze([
  USER_ROLES.EHS_OFFICER,
  USER_ROLES.HOD,
  USER_ROLES.PLANT_HEAD,
  USER_ROLES.ADMIN,
]);

/*
 * Roles allowed to plan audits.
 */
export const PLANNING_ROLES = Object.freeze([
  USER_ROLES.EHS_OFFICER,
  USER_ROLES.ADMIN,
]);

export function normalizeRole(role) {
  return String(role ?? "")
    .trim()
    .toUpperCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
}

export function hasAnyRole(roles, allowed) {
  const normalized = (
    Array.isArray(roles) ? roles : []
  ).map(normalizeRole);

  return allowed.some((role) =>
    normalized.includes(role),
  );
}
