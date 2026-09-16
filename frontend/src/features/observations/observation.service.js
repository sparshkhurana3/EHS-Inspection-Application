import {
  apiRequest,
} from "../../services/apiClient.js";

export function fetchCurrentObservationAssignment() {
  return apiRequest(
    "/observations/current-assignment",
    {
      method: "GET",
    },
  );
}

export function createObservationReport({
  patrolId,
  findingDate,
  location,
  category,
  photograph,
  description,
  riskCategory,
}) {
  const formData = new FormData();

  formData.append(
    "patrolId",
    String(patrolId),
  );

  formData.append(
    "findingDate",
    findingDate,
  );

  formData.append(
    "location",
    location,
  );

  formData.append(
    "category",
    category,
  );

  formData.append(
    "description",
    description.trim(),
  );

  formData.append(
    "riskCategory",
    riskCategory,
  );

  formData.append(
    "photograph",
    photograph,
  );

  return apiRequest(
    "/observations",
    {
      method: "POST",
      body: formData,
    },
  );
}