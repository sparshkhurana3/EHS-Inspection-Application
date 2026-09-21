import {
  apiRequest,
} from "../../services/apiClient.js";

export function fetchPlanningLookups() {
  return apiRequest(
    "/patrols/planning-lookups",
    { method: "GET" },
  );
}

export function schedulePatrol({
  zoneId,
  scheduledDate,
  auditorId,
  auditeeId,
}) {
  return apiRequest("/patrols", {
    method: "POST",
    body: JSON.stringify({
      zoneId: Number(zoneId),
      scheduledDate,
      auditorId: Number(auditorId),
      auditeeId: Number(auditeeId),
    }),
  });
}

export function updatePatrolAssignment({
  patrolId,
  auditorId,
  auditeeId,
  applyToUpcoming = true,
}) {
  return apiRequest(
    `/patrols/${encodeURIComponent(
      patrolId,
    )}/assignment`,
    {
      method: "PATCH",
      body: JSON.stringify({
        auditorId: Number(auditorId),
        auditeeId: Number(auditeeId),
        applyToUpcoming,
      }),
    },
  );
}

export function fetchRoster() {
  return apiRequest("/patrols/roster", {
    method: "GET",
  });
}

export function uploadRoster(file) {
  const body = new FormData();

  body.append("roster", file);

  return apiRequest("/patrols/roster", {
    method: "POST",
    body,
  });
}
