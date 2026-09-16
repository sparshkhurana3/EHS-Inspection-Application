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

export default function ObservationDetail({
  reportId,
  onBack,
}) {
  const { report, photograph, loading, error } =
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
          Back to this week
        </button>
      </>
    );
  }

  if (!report) {
    return null;
  }

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
          label="Area"
          value={report.areaName}
        />
        <Field
          label="Category"
          value={report.category}
        />
        <Field
          label="Risk"
          value={report.riskCategory}
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

      <div className="observation-detail-body">
        <span>Description</span>
        <p>{report.description}</p>
      </div>

      <div className="observation-detail-photo">
        <span>Photograph</span>

        {photograph ? (
          <img
            src={photograph}
            alt={
              report.photographOriginalName ??
              "Observation photograph"
            }
          />
        ) : (
          <p className="observation-empty-note">
            Photograph is not available.
          </p>
        )}
      </div>

      <button
        type="button"
        className="button button-secondary"
        onClick={onBack}
      >
        Back to this week
      </button>
    </section>
  );
}
