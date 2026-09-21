import Alert from "../../components/Alert.jsx";
import LoadingSpinner from "../../components/LoadingSpinner.jsx";

import { formatDate } from "../../lib/errorMessage.js";

import { useObservationDetail } from "./useObservations.js";

function Field({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || "Not recorded"}</strong>
    </div>
  );
}

const CLOSURE_STATUS_LABELS = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  SUBMITTED_FOR_CLOSURE: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  REEXAMINATION_REQUIRED:
    "Sent back for re-examination",
};

const TICKET_STATUS_LABELS = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  CLOSED: "Closed",
};

/**
 * Once the auditee's closure and the Action HOD's ticket exist they are
 * shown here as information; the detail endpoint carries their status
 * and key dates, not the full records.
 */
function ProgressBlock({ report }) {
  const { closure, ticket } = report;

  if (!closure && !ticket) {
    return null;
  }

  return (
    <section className="closure-action-plan observation-progress">
      <h3>Closure and corrective action</h3>

      <p className="observation-lifecycle-line">
        {report.lifecycleLabel}
      </p>

      <div className="closure-detail-grid">
        {closure ? (
          <>
            <Field
              label="Closure status"
              value={
                CLOSURE_STATUS_LABELS[
                  closure.status
                ] ?? closure.status
              }
            />
            <Field
              label="Action Team HOD"
              value={closure.actionHodName}
            />
            <Field
              label="Target date"
              value={formatDate(closure.targetDate)}
            />
            {closure.approvedAt ? (
              <Field
                label="Approved"
                value={formatDate(closure.approvedAt)}
              />
            ) : null}
          </>
        ) : null}

        {ticket ? (
          <>
            <Field
              label="Ticket status"
              value={
                TICKET_STATUS_LABELS[
                  ticket.status
                ] ?? ticket.status
              }
            />
            <Field
              label="Ticket decision"
              value={ticket.decision}
            />
            {ticket.closureDate ? (
              <Field
                label="Ticket closed"
                value={formatDate(ticket.closureDate)}
              />
            ) : null}
          </>
        ) : null}
      </div>

      {closure?.actionPlan ? (
        <div className="observation-detail-body">
          <span>Action plan</span>
          <p>{closure.actionPlan}</p>
        </div>
      ) : null}
    </section>
  );
}

export default function ObservationDetail({
  reportId,
  backLabel = "Back to this week",
  onBack,
}) {
  const { report, photographs, loading, error } =
    useObservationDetail(reportId);

  if (loading) {
    return (
      <LoadingSpinner message="Loading observation report..." />
    );
  }

  if (error) {
    return (
      <>
        <Alert
          type="error"
          title="Unable to load the report"
        >
          {error}
        </Alert>

        <button
          type="button"
          className="button button-secondary"
          onClick={onBack}
        >
          {backLabel}
        </button>
      </>
    );
  }

  if (!report) {
    return null;
  }

  const observations = report.observations ?? [];

  return (
    <section className="existing-observation-card">
      <header className="observation-section-header">
        <div>
          <span className="dashboard-eyebrow">
            Submitted observation
          </span>

          <h2>
            {report.reportNumber ??
              "Observation report"}
          </h2>
        </div>

        <span className="observation-status-chip">
          {report.displayStatus}
        </span>
      </header>

      <div className="existing-report-grid">
        <Field
          label="Audit date"
          value={formatDate(report.scheduledDate)}
        />
        <Field
          label="Finding date"
          value={formatDate(report.findingDate)}
        />
        <Field
          label="Plant"
          value={report.plantName}
        />
        <Field
          label="Unit"
          value={report.unitName}
        />
        <Field
          label="Zone"
          value={report.zoneName}
        />
        <Field
          label="Auditor"
          value={report.auditorName}
        />
        <Field
          label="Auditee"
          value={report.auditeeName}
        />
        <Field
          label="EHS Officer"
          value={report.ehsOfficerName}
        />
        <Field
          label="Submitted"
          value={formatDate(report.submittedAt)}
        />
      </div>

      {report.noObservations ? (
        <p className="observation-empty-note">
          The auditor recorded no observation for
          this audit.
        </p>
      ) : (
        observations.map((item) => (
          <div
            key={item.id}
            className="observation-detail-item"
          >
            <h3>
              Observation {item.sequenceNumber} of{" "}
              {observations.length}
            </h3>

            <div className="existing-report-grid">
              <Field
                label="Area"
                value={item.areaName}
              />
              <Field
                label="Category"
                value={item.category}
              />
              <Field
                label="Risk"
                value={item.riskCategory}
              />
            </div>

            <div className="observation-detail-body">
              <span>Description</span>
              <p>{item.description}</p>
            </div>

            <div className="observation-detail-photo">
              <span>Photograph</span>

              {photographs[item.id] ? (
                <img
                  src={photographs[item.id]}
                  alt={
                    item.photographOriginalName ??
                    "Observation photograph"
                  }
                />
              ) : (
                <p className="observation-empty-note">
                  Photograph is not available.
                </p>
              )}
            </div>
          </div>
        ))
      )}

      <ProgressBlock report={report} />

      <button
        type="button"
        className="button button-secondary"
        onClick={onBack}
      >
        {backLabel}
      </button>
    </section>
  );
}
