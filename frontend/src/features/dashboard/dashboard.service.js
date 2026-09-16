import {
  apiRequest,
} from "../../services/apiClient.js";

export function fetchDashboardData({
  year,
  month,
}) {
  const query = new URLSearchParams({
    year: String(year),
    month: String(month),
  });

  return apiRequest(
    `/dashboard?${query.toString()}`,
    {
      method: "GET",
    },
  );
}