export const APP_ROLES = Object.freeze({
  USER: "USER",
  EHS_OFFICER: "EHS_OFFICER",
  HOD: "HOD",
  PLANT_HEAD: "PLANT_HEAD",
});

export const MANAGEMENT_ROLES = Object.freeze([
  APP_ROLES.EHS_OFFICER,
  APP_ROLES.HOD,
  APP_ROLES.PLANT_HEAD,
]);

export function normalizeRole(role) {
  return String(role ?? "")
    .trim()
    .toUpperCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
}

export function hasManagementRole(roles = []) {
  const normalizedRoles = roles.map(normalizeRole);

  return MANAGEMENT_ROLES.some((role) =>
    normalizedRoles.includes(role),
  );
}
