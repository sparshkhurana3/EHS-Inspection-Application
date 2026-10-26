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

export function fetchObservationHistory(
  filter = "all",
) {
  const query = new URLSearchParams({
    filter,
  });

  return apiRequest(
    `/observations/history?${query.toString()}`,
    { method: "GET" },
  );
}

export function fetchObservationReport(reportId) {
  return apiRequest(
    `/observations/${encodeURIComponent(reportId)}`,
    { method: "GET" },
  );
}

/** Observation #1's photograph (kept for older single-photo readers). */
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

export function fetchObservationItemPhotograph(
  reportId,
  itemId,
) {
  return apiBlobRequest(
    `/observations/${encodeURIComponent(
      reportId,
    )}/items/${encodeURIComponent(
      itemId,
    )}/photograph`,
    { method: "GET" },
  );
}

/**
 * `observations` is a JSON text field and the photographs follow it in
 * the same order, one file per observation: multer keeps part order,
 * so photographs[i] belongs to observations[i] on the server.
 */
export function createObservationReport({
  patrolId,
  findingDate,
  hodId,
  observations,
}) {
  const formData = new FormData();

  formData.append("patrolId", String(patrolId));
  formData.append("findingDate", findingDate);
  formData.append("hodId", String(hodId));

  formData.append(
    "observations",
    JSON.stringify(
      observations.map((observation) => ({
        zoneAreaId: Number(
          observation.zoneAreaId,
        ),
        category: observation.category,
        description:
          observation.description.trim(),
        riskCategory:
          observation.riskCategory,
      })),
    ),
  );

  observations.forEach((observation) => {
    formData.append(
      "photographs",
      observation.photograph,
    );
  });

  return apiRequest("/observations", {
    method: "POST",
    body: formData,
  });
}

/**
 * The HODs the auditor may name for this patrol's auditee: HOD users at
 * the patrol's location, never the auditee themselves.
 */
export function fetchHodOptions(patrolId) {
  return apiRequest(
    `/observations/hod-options?patrolId=${encodeURIComponent(
      patrolId,
    )}`,
    { method: "GET" },
  );
}

export function recordNoObservation(patrolId) {
  return apiRequest(
    "/observations/no-observation",
    {
      method: "POST",
      body: JSON.stringify({
        patrolId: Number(patrolId),
      }),
    },
  );
}
