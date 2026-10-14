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

/**
 * One week of the EHS Officer's plant. Without a weekStart the API
 * picks the default week, the same one GET /dashboard returns.
 */
export function fetchOfficerWeek({
  weekStart,
} = {}) {
  const query = weekStart
    ? `?${new URLSearchParams({
        weekStart,
      }).toString()}`
    : "";

  return apiRequest(
    `/dashboard/officer-week${query}`,
    {
      method: "GET",
    },
  );
}
