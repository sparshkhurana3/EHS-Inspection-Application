import Alert
  from "../../components/Alert.jsx";

import LoadingSpinner
  from "../../components/LoadingSpinner.jsx";

import PatrolForm
  from "./PatrolForm.jsx";

import usePatrols
  from "./usePatrols.js";

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

export default function PlanningPage() {
  const {
    formOpen,
    formValues,
    auditors,
    auditees,
    scheduledPatrol,
    loading,
    submitting,
    error,
    successMessage,
    openForm,
    closeForm,
    updateField,
    submitSchedule,
    reloadLookups,
  } = usePatrols();

  if (loading) {
    return (
      <main className="planning-page">
        <LoadingSpinner
          message="Loading audit planning data..."
        />
      </main>
    );
  }

  return (
    <main className="planning-page">
      <header className="planning-page-header">
        <div>
          <span className="dashboard-eyebrow">
            EHS Officer workflow
          </span>

          <h1>Audit Planning</h1>

          <p>
            Schedule an EHS audit and assign
            the responsible auditor and
            auditee.
          </p>
        </div>

        <div className="planning-header-actions">
          <button
            type="button"
            className="dashboard-refresh-button"
            onClick={reloadLookups}
            disabled={submitting}
          >
            Refresh Users
          </button>

          {!formOpen && (
            <button
              type="button"
              className="button button-primary"
              onClick={openForm}
            >
              Schedule an Audit
            </button>
          )}
        </div>
      </header>

      {error && (
        <Alert
          type="error"
          title="Unable to schedule audit"
        >
          {error}
        </Alert>
      )}

      {successMessage && (
        <Alert
          type="success"
          title="Audit scheduled"
        >
          {successMessage}
        </Alert>
      )}

      {scheduledPatrol && (
        <section className="scheduled-audit-summary">
          <div>
            <span className="dashboard-eyebrow">
              Latest scheduled audit
            </span>

            <h2>
              {scheduledPatrol.location ??
                "Audit assignment"}
            </h2>
          </div>

          <div className="scheduled-audit-summary-grid">
            <span>
              <small>Date</small>
              <strong>
                {formatDate(
                  scheduledPatrol
                    .scheduledDate ??
                  scheduledPatrol
                    .scheduled_date,
                )}
              </strong>
            </span>

            <span>
              <small>Unit</small>
              <strong>
                {scheduledPatrol.unit ??
                  "Not available"}
              </strong>
            </span>

            <span>
              <small>Zone</small>
              <strong>
                {scheduledPatrol.zone ??
                  "Not available"}
              </strong>
            </span>

            <span>
              <small>Status</small>
              <strong>Scheduled</strong>
            </span>
          </div>
        </section>
      )}

      {formOpen ? (
        <section className="patrol-planning-card">
          <PatrolForm
            formValues={formValues}
            auditors={auditors}
            auditees={auditees}
            submitting={submitting}
            onFieldChange={updateField}
            onSubmit={submitSchedule}
            onCancel={closeForm}
          />
        </section>
      ) : (
        <section className="planning-empty-card">
          <div className="planning-empty-icon">
            +
          </div>

          <h2>Schedule a new audit</h2>

          <p>
            Create an audit assignment for an
            auditor and auditee. The scheduled
            audit will appear on the relevant
            users' calendars.
          </p>

          <button
            type="button"
            className="button button-primary"
            onClick={openForm}
          >
            Schedule an Audit
          </button>
        </section>
      )}
    </main>
  );
}