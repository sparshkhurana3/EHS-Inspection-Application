import {
  apiRequest,
} from "../../services/apiClient.js";

export function fetchPlanningLookups() {
  return apiRequest(
    "/patrols/planning-lookups",
    {
      method: "GET",
    },
  );
}

export function schedulePatrol({
  location,
  unit,
  zone,
  areaDetail,
  scheduledDate,
  auditorId,
  auditeeId,
}) {
  return apiRequest(
    "/patrols",
    {
      method: "POST",

      body: JSON.stringify({
        location,
        unit,
        zone,
        areaDetail,
        scheduledDate,
        auditorId,
        auditeeId,
      }),
    },
  );
}