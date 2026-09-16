import { formatDate } from "../../lib/errorMessage.js";

function describeLocation(assignment) {
  return [
    assignment.unitName,
    assignment.zoneName,
  ]
    .filter(Boolean)
    .join(" / ");
}

export function PendingObservationList({
  assignments,
  onOpen,
}) {
  if (assignments.length === 0) {
    return (
      <p className="observation-empty-note">
        No observations are pending for you this
        week.
      </p>
    );
  }

  return (
    <ul className="observation-list">
      {assignments.map((assignment) => (
        <li key={assignment.id}>
          <button
            type="button"
            className="observation-list-item"
            onClick={() => onOpen(assignment)}
          >
            <span className="observation-list-main">
              <strong>
                {formatDate(
                  assignment.scheduledDate,
                )}
              </strong>

              <span>
                {describeLocation(assignment)}
              </span>
            </span>

            <span className="observation-list-meta">
              <span>
                Auditee:{" "}
                {assignment.auditeeName ??
                  "Not assigned"}
              </span>

              <span className="observation-action-hint">
                Fill report
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function SubmittedObservationList({
  assignments,
  onOpen,
}) {
  if (assignments.length === 0) {
    return (
      <p className="observation-empty-note">
        You have not submitted any observations
        this week.
      </p>
    );
  }

  return (
    <ul className="observation-list">
      {assignments.map((assignment) => {
        const report = assignment.report;

        return (
          <li key={assignment.id}>
            <button
              type="button"
              className="observation-list-item"
              onClick={() => onOpen(report.id)}
            >
              <span className="observation-list-main">
                <strong>
                  {report.reportNumber ??
                    "Report"}
                </strong>

                <span>
                  {describeLocation(assignment)}
                  {report.areaName
                    ? ` / ${report.areaName}`
                    : ""}
                </span>
              </span>

              <span className="observation-list-meta">
                <span>
                  {report.category ?? "--"} ·{" "}
                  {report.riskCategory ?? "--"}
                </span>

                <span className="observation-status-chip">
                  {report.displayStatus}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
