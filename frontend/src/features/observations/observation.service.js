import {
  apiBlobRequest,
  apiRequest,
} from "../../services/apiClient.js";

export function fetchWeeklyAssignments() {
  return apiRequest(
    "/observations/current-assignments",
    { method: "GET" },
  );
}

export function fetchObservationReport(reportId) {
  return apiRequest(
    `/observations/${encodeURIComponent(reportId)}`,
    { method: "GET" },
  );
}

export function fetchObservationPhotograph(
  reportId,
) {
  return apiBlobRequest(
    `/observations/${encodeURIComponent(
      reportId,
    )}/photograph`,
    { method: "GET" },
  );
}

export function createObservationReport({
  patrolId,
  findingDate,
  zoneAreaId,
  category,
  photograph,
  description,
  riskCategory,
}) {
  const formData = new FormData();

  formData.append("patrolId", String(patrolId));
  formData.append("findingDate", findingDate);
  formData.append(
    "zoneAreaId",
    String(zoneAreaId),
  );
  formData.append("category", category);
  formData.append(
    "description",
    description.trim(),
  );
  formData.append("riskCategory", riskCategory);
  formData.append("photograph", photograph);

  return apiRequest("/observations", {
    method: "POST",
    body: formData,
  });
}
