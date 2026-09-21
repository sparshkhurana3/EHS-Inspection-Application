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
  onNoObservation,
  busyPatrolId,
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
      {assignments.map((assignment) => {
        const busy =
          String(busyPatrolId) ===
          String(assignment.id);

        return (
          <li key={assignment.id}>
            <div className="observation-list-item observation-list-pending">
              <span className="observation-list-main">
                <strong>
                  {formatDate(
                    assignment.scheduledDate,
                  )}
                  {assignment.isFromEarlierWeek
                    ? " · earlier week"
                    : ""}
                </strong>

                <span>
                  {describeLocation(assignment)}
                </span>

                <span
                  className={`observation-due${
                    assignment.isOverdue
                      ? " observation-due-overdue"
                      : ""
                  }`}
                >
                  {assignment.isOverdue
                    ? `Overdue · was due ${formatDate(
                        assignment.dueDate,
                      )}`
                    : `Due ${formatDate(
                        assignment.dueDate,
                      )}`}
                </span>
              </span>

              <span className="observation-list-meta">
                <span>
                  Auditee:{" "}
                  {assignment.auditeeName ??
                    "Not assigned"}
                </span>

                <span className="observation-list-actions">
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => onOpen(assignment)}
                    disabled={busy}
                  >
                    Fill report
                  </button>

                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() =>
                      onNoObservation(assignment)
                    }
                    disabled={busy}
                  >
                    {busy
                      ? "Closing..."
                      : "No observation to record"}
                  </button>
                </span>
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function describeReport(report) {
  if (report.noObservations) {
    return "No observations";
  }

  const count = report.observationCount ?? 0;

  const countLabel =
    count === 1
      ? "1 observation"
      : `${count} observations`;

  return report.highestRisk
    ? `${countLabel} · highest risk ${report.highestRisk}`
    : countLabel;
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

        const showLifecycle =
          !report.noObservations &&
          (report.closure || report.ticket);

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
                </span>

                <span>
                  {describeReport(report)}
                </span>
              </span>

              <span className="observation-list-meta">
                {showLifecycle ? (
                  <span>
                    {report.lifecycleLabel}
                  </span>
                ) : null}

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
