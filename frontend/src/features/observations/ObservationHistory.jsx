import Alert from "../../components/Alert.jsx";
import LoadingSpinner from "../../components/LoadingSpinner.jsx";

import { formatDate } from "../../lib/errorMessage.js";

import { useObservationHistory } from "./useObservations.js";

export const HISTORY_FILTERS = [
  { value: "all", label: "All" },
  { value: "closed", label: "Closed via ticket" },
  {
    value: "no_observations",
    label: "No observations",
  },
  { value: "in_progress", label: "In progress" },
];

const EMPTY_MESSAGES = {
  all: "No observation reports in the last six months.",
  closed:
    "No report has been closed through a ticket in the last six months.",
  no_observations:
    "No audit was closed with no observation in the last six months.",
  in_progress:
    "No report is still in progress from the last six months.",
};

function describeCount(report) {
  if (report.noObservations) {
    return "None";
  }

  const count = report.observationCount ?? 0;

  return report.highestRisk
    ? `${count} · ${report.highestRisk}`
    : String(count);
}

/**
 * Every report the caller may see from the past six months, with the
 * filter kept in the query string so Back returns to the same list.
 */
export default function ObservationHistory({
  filter,
  onFilterChange,
  onOpen,
}) {
  const { reports, count, loading, error } =
    useObservationHistory(filter);

  return (
    <section className="observation-history">
      <div className="dashboard-section-heading">
        <div>
          <h2>Past 6 months</h2>
        </div>

        <label className="observation-history-filter">
          Show
          <select
            value={filter}
            onChange={(event) =>
              onFilterChange(event.target.value)
            }
          >
            {HISTORY_FILTERS.map((option) => (
              <option
                key={option.value}
                value={option.value}
              >
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <Alert type="error" title="Unable to load history">
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <LoadingSpinner message="Loading reports..." />
      ) : reports.length === 0 ? (
        <p className="observation-empty-note">
          {EMPTY_MESSAGES[filter] ?? EMPTY_MESSAGES.all}
        </p>
      ) : (
        <>
          <p className="dashboard-single-record">
            {count === 1
              ? "1 report"
              : `${count} reports`}
          </p>

          <div className="weekly-audit-list">
            <div className="weekly-list-header observation-history-row">
              <span>Date</span>
              <span>Unit / Zone</span>
              <span>Auditor</span>
              <span>Auditee</span>
              <span>Observations</span>
              <span>Status</span>
            </div>

            <ul className="zone-assignment-list">
              {reports.map((report) => (
                <li key={report.id}>
                  <div
                    className="weekly-list-row observation-history-row zone-assignment-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpen(report.id)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" ||
                        event.key === " "
                      ) {
                        event.preventDefault();
                        onOpen(report.id);
                      }
                    }}
                  >
                    <span data-label="Date">
                      <strong>
                        {formatDate(
                          report.scheduledDate,
                        )}
                      </strong>
                      <br />
                      {report.reportNumber}
                    </span>

                    <span data-label="Unit / Zone">
                      {report.unitName} /{" "}
                      {report.zoneName}
                    </span>

                    <span data-label="Auditor">
                      {report.auditorName}
                    </span>

                    <span data-label="Auditee">
                      {report.auditeeName}
                    </span>

                    <span data-label="Observations">
                      {describeCount(report)}
                    </span>

                    <span data-label="Status">
                      <span className="weekly-status">
                        {report.lifecycleLabel}
                      </span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
