import ObservationPhoto from "./ObservationPhoto.jsx";

import {
  formatDayAndMonth,
  formatReportDate,
  pluralise,
} from "./reportFormat.js";

function StatusChip({ inspection, dueDate }) {
  if (inspection.outcome === "NOT_DONE") {
    return (
      <span className="report-status report-status-missed">
        <strong>Not done</strong>

        {inspection.notYetDue ? (
          <small>
            Due by{" "}
            {formatDayAndMonth(dueDate, "Thu")}
          </small>
        ) : null}
      </span>
    );
  }

  return (
    <span className="report-status report-status-done">
      <strong>Inspected</strong>

      <small>
        {inspection.outcome === "NO_OBSERVATIONS"
          ? "No observation to record"
          : pluralise(
              inspection.observations.length,
              "observation",
            )}
      </small>
    </span>
  );
}

/**
 * One audit: a summary row, and for an audit with findings an
 * expandable table of its observations with each one's action plan.
 */
export default function WeeklyInspectionRow({
  inspection,
  dueDate,
  expanded,
  onToggle,
}) {
  const detailsId = `report-observations-${inspection.patrolId}`;

  const hasObservations =
    inspection.observations.length > 0;

  return (
    <li className="report-inspection">
      <div className="report-row report-inspection-row">
        <span data-label="Zone">
          <strong className="report-strong">
            {inspection.zoneName}
          </strong>

          <small className="report-muted">
            {formatReportDate(
              inspection.scheduledDate,
            )}
          </small>
        </span>

        <span data-label="Auditor / Auditee">
          <small>
            Auditor: {inspection.auditorName}
          </small>

          <small>
            Auditee: {inspection.auditeeName}
          </small>

          {inspection.hodName ? (
            <small>
              HOD: {inspection.hodName}
            </small>
          ) : null}
        </span>

        <span data-label="Inspection">
          <StatusChip
            inspection={inspection}
            dueDate={dueDate}
          />
        </span>

        <span data-label="Report">
          {inspection.reportNumber ?? "–"}
        </span>

        <span data-label="Closure">
          {inspection.closureLabel ? (
            <>
              {inspection.closureLabel}

              {inspection.reviewComments ? (
                <small className="report-muted">
                  {inspection.reviewComments}
                </small>
              ) : null}
            </>
          ) : (
            "–"
          )}
        </span>

        <span
          data-label=""
          className="report-row-action"
        >
          {hasObservations ? (
            <button
              type="button"
              className="button button-secondary report-small-button"
              aria-expanded={expanded}
              aria-controls={detailsId}
              onClick={onToggle}
            >
              {expanded
                ? "Hide observations"
                : `Show observations (${inspection.observations.length})`}
            </button>
          ) : null}
        </span>
      </div>

      {hasObservations && expanded ? (
        <div
          id={detailsId}
          className="report-observations"
        >
          <div className="report-observation-head">
            <span>#</span>
            <span>Area</span>
            <span>Cat.</span>
            <span>Risk</span>
            <span>Observation</span>
            <span>Action plan</span>
            <span>Target date</span>
            <span>Photo</span>
          </div>

          {inspection.observations.map(
            (observation) => (
              <div
                key={observation.sequenceNumber}
                className="report-observation-row"
              >
                <span data-label="#">
                  {observation.sequenceNumber}
                </span>

                <span data-label="Area">
                  {observation.areaName ?? "–"}
                </span>

                <span data-label="Category">
                  {observation.category}
                </span>

                <span data-label="Risk">
                  <span
                    className={`report-risk${
                      observation.riskCategory ===
                      "HIGH"
                        ? " report-risk-high"
                        : ""
                    }`}
                  >
                    {observation.riskLabel}
                  </span>
                </span>

                <span data-label="Observation">
                  {observation.description}
                </span>

                <span data-label="Action plan">
                  {observation.actionPlan ? (
                    observation.actionPlan
                  ) : (
                    <span className="report-muted">
                      Not yet provided
                    </span>
                  )}

                  {observation.evidenceCount >
                  0 ? (
                    <small className="report-muted">
                      (
                      {pluralise(
                        observation.evidenceCount,
                        "evidence photo",
                      )}
                      )
                    </small>
                  ) : null}
                </span>

                <span data-label="Target date">
                  {formatReportDate(
                    observation.targetDate,
                  )}
                </span>

                <span data-label="Photo">
                  <ObservationPhoto
                    reportId={inspection.reportId}
                    itemId={observation.itemId}
                    label={`Observation ${observation.sequenceNumber}, ${inspection.zoneName}`}
                  />
                </span>
              </div>
            ),
          )}
        </div>
      ) : null}
    </li>
  );
}
