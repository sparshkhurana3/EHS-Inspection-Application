import Alert
  from "../../components/Alert.jsx";

import LoadingSpinner
  from "../../components/LoadingSpinner.jsx";

import ObservationCard
  from "./ObservationCard.jsx";

import useObservations
  from "./useObservations.js";

function getReportStatus(report) {
  const status = String(
    report?.status ?? "",
  ).toUpperCase();

  if (
    status === "CLOSED" ||
    status === "COMPLETED" ||
    status === "APPROVED"
  ) {
    return {
      label: "Closed",
      className:
        "observation-report-status-closed",
    };
  }

  return {
    label: "In Progress",
    className:
      "observation-report-status-progress",
  };
}

function formatDate(dateValue) {
  if (!dateValue) {
    return "Not available";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return String(dateValue);
  }

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    },
  ).format(date);
}

function ExistingReportCard({
  report,
  assignment,
}) {
  const reportStatus =
    getReportStatus(report);

  const weekNumber =
    assignment?.weekNumber ??
    assignment?.week_number ??
    "Not available";

  const unitName =
    assignment?.unitNumber ??
    assignment?.unit_number ??
    assignment?.unitName ??
    assignment?.unit_name ??
    "Not available";

  const zoneName =
    assignment?.zoneNumber ??
    assignment?.zone_number ??
    assignment?.zoneName ??
    assignment?.zone_name ??
    "Not available";

  return (
    <section className="existing-observation-card">
      <header className="observation-section-header">
        <div>
          <span className="dashboard-eyebrow">
            Patrol Observation Report
          </span>

          <h2>Observation submitted</h2>
        </div>

        <span
          className={[
            "observation-report-status",
            reportStatus.className,
          ].join(" ")}
        >
          {reportStatus.label}
        </span>
      </header>

      <div className="existing-report-grid">
        <div>
          <span>Report number</span>

          <strong>
            {report.reportNumber ??
              report.report_number ??
              report.id ??
              "Not available"}
          </strong>
        </div>

        <div>
          <span>Week number</span>
          <strong>{weekNumber}</strong>
        </div>

        <div>
          <span>Unit</span>
          <strong>{unitName}</strong>
        </div>

        <div>
          <span>Zone</span>
          <strong>{zoneName}</strong>
        </div>

        <div>
          <span>Submitted date</span>

          <strong>
            {formatDate(
              report.submittedAt ??
                report.submitted_at,
            )}
          </strong>
        </div>

        <div>
          <span>Report status</span>

          <strong>
            {reportStatus.label}
          </strong>
        </div>
      </div>

      <p className="existing-report-message">
        {reportStatus.label === "Closed"
          ? "The observation report has been closed."
          : "The observation report has been sent to the auditee and remains in progress until the closure workflow is completed."}
      </p>
    </section>
  );
}

export default function ObservationPage() {
  const {
    assignment,
    existingReport,
    formValues,
    descriptionWordCount,
    maxDescriptionWords,
    loading,
    submitting,
    error,
    successMessage,
    updateField,
    updatePhotograph,
    removePhotograph,
    submitObservation,
    reload,
  } = useObservations();

  if (loading) {
    return (
      <main className="observation-page">
        <LoadingSpinner
          message="Loading current weekly patrol..."
        />
      </main>
    );
  }

  return (
    <main className="observation-page">
      <header className="observation-page-header">
        <div>
          <span className="dashboard-eyebrow">
            Auditor workflow
          </span>

          <h1>Observation</h1>

          <p>
            Add and monitor the Patrol
            Observation Report for the current
            assigned weekly audit.
          </p>
        </div>

        <button
          type="button"
          className="dashboard-refresh-button"
          onClick={reload}
          disabled={submitting}
        >
          Refresh
        </button>
      </header>

      {error && (
        <Alert
          type="error"
          title="Unable to continue"
        >
          {error}
        </Alert>
      )}

      {successMessage && (
        <Alert
          type="success"
          title="Observation submitted"
        >
          {successMessage}
        </Alert>
      )}

      {!assignment && !error && (
        <section className="empty-dashboard-card">
          <strong>
            No current auditor assignment
          </strong>

          <p>
            There is no weekly patrol assigned
            to you as an auditor that requires
            an observation report.
          </p>
        </section>
      )}

      {assignment && existingReport && (
        <ExistingReportCard
          report={existingReport}
          assignment={assignment}
        />
      )}

      {assignment && !existingReport && (
        <ObservationCard
          assignment={assignment}
          formValues={formValues}
          descriptionWordCount={
            descriptionWordCount
          }
          maxDescriptionWords={
            maxDescriptionWords
          }
          submitting={submitting}
          onFieldChange={updateField}
          onPhotographChange={
            updatePhotograph
          }
          onPhotographRemove={
            removePhotograph
          }
          onSubmit={submitObservation}
        />
      )}
    </main>
  );
}