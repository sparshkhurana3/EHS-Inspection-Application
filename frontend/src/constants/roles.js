export const APP_ROLES = Object.freeze({
  USER: "USER",
  EHS_OFFICER: "EHS_OFFICER",
  HOD: "HOD",
  PLANT_HEAD: "PLANT_HEAD",
  ADMIN: "ADMIN",
});

export const MANAGEMENT_ROLES = Object.freeze([
  APP_ROLES.EHS_OFFICER,
  APP_ROLES.HOD,
  APP_ROLES.PLANT_HEAD,
  APP_ROLES.ADMIN,
]);

/*
 * Who may plan audits. Mirrors PLANNING_ROLES on the backend; the API
 * is the boundary that actually enforces it.
 */
export const PLANNING_ROLES = Object.freeze([
  APP_ROLES.EHS_OFFICER,
  APP_ROLES.ADMIN,
]);

export function normalizeRole(role) {
  if (role && typeof role === "object") {
    return normalizeRole(
      role.code ??
        role.roleCode ??
        role.role_code ??
        role.name ??
        role.role,
    );
  }

  return String(role ?? "")
    .trim()
    .toUpperCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
}

export function getUserRoles(user) {
  const sources = [
    user?.roles,
    user?.roleCodes,
    user?.role_codes,
    user?.role,
  ];

  const collected = sources.flatMap((source) => {
    if (Array.isArray(source)) {
      return source;
    }

    if (typeof source === "string") {
      return source.split(",");
    }

    return [];
  });

  return [
    ...new Set(
      collected.map(normalizeRole).filter(Boolean),
    ),
  ];
}

export function hasAnyRole(user, allowed) {
  const roles = getUserRoles(user);

  return allowed.some((role) =>
    roles.includes(normalizeRole(role)),
  );
}

export function hasManagementRole(user) {
  return hasAnyRole(user, MANAGEMENT_ROLES);
}

export function canPlanAudits(user) {
  return hasAnyRole(user, PLANNING_ROLES);
}
