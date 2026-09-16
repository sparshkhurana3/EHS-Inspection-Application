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
