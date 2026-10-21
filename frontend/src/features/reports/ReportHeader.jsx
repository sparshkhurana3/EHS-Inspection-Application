import CompanyLogo from "../../brand/CompanyLogo.jsx";

import { formatReportDate } from "./reportFormat.js";

/**
 * The in-page document header: the Sona Comstar logo, what the report
 * is, and for which period.
 */
export default function ReportHeader({ report }) {
  const isWeekly = report.type === "WEEKLY";

  return (
    <header className="report-header">
      <CompanyLogo
        surface="light"
        className="report-header-logo"
      />

      <div className="report-header-text">
        <h2>
          {isWeekly
            ? "Weekly inspection report"
            : "Yearly inspection report"}
        </h2>

        <p>
          {isWeekly
            ? `${report.plant.name} · Week ${
                report.isoWeek
              }, ${report.isoYear} · ${formatReportDate(
                report.weekStart,
              )} – ${formatReportDate(
                report.weekEnd,
              )}`
            : `${report.plant.name} · ${
                report.year
              }${
                report.isPartialYear
                  ? ` · 1 Jan – ${formatReportDate(
                      report.cutoffDate,
                    )} (year to date)`
                  : ""
              }`}
        </p>

        <span>
          Generated{" "}
          {formatReportDate(report.generatedAt)}
        </span>
      </div>
    </header>
  );
}
