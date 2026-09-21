import Alert from "../../components/Alert.jsx";
import LoadingSpinner from "../../components/LoadingSpinner.jsx";

import { formatDate } from "../../lib/errorMessage.js";

import PatrolForm from "./PatrolForm.jsx";
import RosterUploadPanel from "./RosterUploadPanel.jsx";
import usePatrols from "./usePatrols.js";
import useRoster from "./useRoster.js";

export default function PlanningPage() {
  const planning = usePatrols();
  const roster = useRoster();

  if (planning.loading) {
    return (
      <LoadingSpinner message="Loading your location..." />
    );
  }

  /*
   * An officer with no location cannot plan anything, and an empty form
   * would look broken rather than misconfigured.
   */
  if (!planning.location) {
    return (
      <Alert
        type="error"
        title="Your location is not set"
      >
        {planning.error ||
          "Your account is not assigned to a location, so audits cannot be planned. Ask an administrator to set it."}
      </Alert>
    );
  }

  return (
    <section className="planning-page">
      <header className="observation-section-header">
        <div>
          <span className="dashboard-eyebrow">
            EHS Officer workflow
          </span>

          <h1>Plan audits</h1>

          <p>{planning.location.name}</p>
        </div>
      </header>

      <RosterUploadPanel
        roster={roster.roster}
        loading={roster.loading}
        uploading={roster.uploading}
        selectedFile={roster.selectedFile}
        error={roster.error}
        rowErrors={roster.rowErrors}
        summary={roster.summary}
        onSelectFile={roster.selectFile}
        onUpload={roster.upload}
        onDownloadTemplate={() =>
          roster.downloadTemplate(
            planning.zones,
            planning.units,
            planning.location,
          )
        }
      />

      <header className="observation-section-header">
        <div>
          <span className="dashboard-eyebrow">
            Exception
          </span>

          <h2>Schedule a single audit</h2>

          <p>
            For a one-off audit outside the
            weekly roster.
          </p>
        </div>

        <div className="closure-header-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={planning.reload}
            disabled={planning.submitting}
          >
            Refresh
          </button>

          {!planning.formOpen ? (
            <button
              type="button"
              className="button button-primary"
              onClick={planning.openForm}
            >
              Schedule an audit
            </button>
          ) : null}
        </div>
      </header>

      {planning.error ? (
        <Alert
          type="error"
          title="Unable to schedule the audit"
        >
          {planning.error}
        </Alert>
      ) : null}

      {planning.successMessage ? (
        <Alert type="success" title="Audit scheduled">
          {planning.successMessage}
        </Alert>
      ) : null}

      {planning.scheduledPatrol ? (
        <div className="patrol-summary">
          <div>
            <span>Date</span>
            <strong>
              {formatDate(
                planning.scheduledPatrol
                  .scheduledDate,
              )}
            </strong>
          </div>

          <div>
            <span>Unit</span>
            <strong>
              {
                planning.scheduledPatrol
                  .unitName
              }
            </strong>
          </div>

          <div>
            <span>Zone</span>
            <strong>
              {
                planning.scheduledPatrol
                  .zoneName
              }
            </strong>
          </div>

          <div>
            <span>Status</span>
            <strong>
              {planning.scheduledPatrol.status}
            </strong>
          </div>
        </div>
      ) : null}

      {planning.formOpen ? (
        <PatrolForm
          location={planning.location}
          units={planning.units}
          zonesForUnit={planning.zonesForUnit}
          selectedZone={planning.selectedZone}
          users={planning.users}
          values={planning.values}
          submitting={planning.submitting}
          onFieldChange={planning.updateField}
          onSubmit={planning.submit}
          onCancel={planning.closeForm}
        />
      ) : (
        <p className="closure-empty-note">
          Use Schedule an audit to plan a patrol
          for your location.
        </p>
      )}
    </section>
  );
}
