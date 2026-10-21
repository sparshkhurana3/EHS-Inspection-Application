import {
  apiBlobRequest,
  apiRequest,
} from "../../services/apiClient.js";

/*
 * The weekly and yearly inspection reports (docs/23). The JSON
 * endpoints feed the Report page; the PDF endpoints return the same
 * report as a file, fetched as blobs because the routes need the Bearer
 * token and a plain <a href> cannot carry one.
 */

function toQuery(params) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(
    ([key, value]) => {
      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        query.set(key, String(value));
      }
    },
  );

  return query.toString();
}

export function fetchWeeklyReportWeeks() {
  return apiRequest(
    "/reports/weekly/weeks",
    { method: "GET" },
  );
}

export function fetchYearlyReportYears() {
  return apiRequest(
    "/reports/yearly/years",
    { method: "GET" },
  );
}

/**
 * `params` is { weekStart } or { isoYear, isoWeek } for a weekly
 * report, { year } for a yearly one.
 */
export function fetchReport(type, params) {
  return apiRequest(
    `/reports/${type}?${toQuery(params)}`,
    { method: "GET" },
  );
}

export function fetchReportPdf(type, params) {
  return apiBlobRequest(
    `/reports/${type}/pdf?${toQuery(params)}`,
    { method: "GET" },
  );
}
