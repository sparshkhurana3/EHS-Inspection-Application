import { formatDate } from "../../lib/errorMessage.js";

import ObservationItemFields from "./ObservationItemFields.jsx";

function ReadOnlyField({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || "Not available"}</strong>
    </div>
  );
}

/**
 * The report form: the once-only header (week, location, unit, zone,
 * people, finding date) followed by one repeated block per observation
 * and an "Add another observation" control, up to ten.
 */
export default function ObservationCard({
  assignment,
  formValues,
  maxObservations,
  maxDescriptionWords,
  submitting,
  onFieldChange,
  onItemFieldChange,
  onItemPhotographChange,
  onItemPhotographRemove,
  onAddObservation,
  onRemoveObservation,
  onSubmit,
  onCancel,
}) {
  const areas = Array.isArray(assignment?.areas)
    ? assignment.areas
    : [];

  const observations = formValues.observations;
  const atLimit = observations.length >= maxObservations;

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <section className="observation-card">
      <header className="observation-section-header">
        <div>
          <span className="dashboard-eyebrow">
            Auditor workflow
          </span>

          <h2>Patrol Observation Report</h2>

          {assignment?.dueDate ? (
            <p>
              Due by {formatDate(assignment.dueDate)}
              {assignment.isOverdue ? " · overdue" : ""}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          className="button button-secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          Back
        </button>
      </header>

      {/*
        * Assignment facts come from the patrol and cannot be edited
        * here. The plant location in particular is derived server-side,
        * so a report can never claim a different site from its audit.
        */}
      <div className="observation-assignment-grid">
        <ReadOnlyField
          label="Week number"
          value={
            assignment?.weekNumber
              ? `Week ${assignment.weekNumber}`
              : null
          }
        />
        <ReadOnlyField
          label="Audit date"
          value={formatDate(assignment?.scheduledDate)}
        />
        <ReadOnlyField
          label="Location"
          value={assignment?.plantLocation}
        />
        <ReadOnlyField
          label="Unit"
          value={assignment?.unitName}
        />
        <ReadOnlyField
          label="Zone"
          value={assignment?.zoneName}
        />
        <ReadOnlyField
          label="Auditor"
          value={assignment?.auditorName}
        />
        <ReadOnlyField
          label="Auditee"
          value={assignment?.auditeeName}
        />
        <ReadOnlyField
          label="EHS Officer"
          value={assignment?.ehsOfficerName}
        />
      </div>

      <form
        className="observation-form"
        noValidate
        onSubmit={handleSubmit}
      >
        <div className="form-field">
          <label htmlFor="findingDate">
            Finding date
            <span
              className="required-marker"
              aria-hidden="true"
            >
              {" *"}
            </span>
          </label>

          <input
            id="findingDate"
            type="date"
            required
            aria-required="true"
            value={formValues.findingDate}
            disabled={submitting}
            onChange={(event) =>
              onFieldChange(
                "findingDate",
                event.target.value,
              )
            }
          />
        </div>

        {areas.length === 0 ? (
          <p className="observation-empty-note">
            No areas are configured for this zone, so
            an observation cannot be recorded. Ask
            your EHS Officer to configure them.
          </p>
        ) : (
          observations.map((item, index) => (
            <ObservationItemFields
              key={item.key}
              index={index}
              total={observations.length}
              item={item}
              areas={areas}
              disabled={submitting}
              maxDescriptionWords={maxDescriptionWords}
              onFieldChange={onItemFieldChange}
              onPhotographChange={
                onItemPhotographChange
              }
              onPhotographRemove={
                onItemPhotographRemove
              }
              onRemove={onRemoveObservation}
            />
          ))
        )}

        <button
          type="button"
          className="button button-secondary observation-add-item"
          onClick={onAddObservation}
          disabled={
            submitting || atLimit || areas.length === 0
          }
        >
          Add another observation
        </button>

        <p className="observation-empty-note">
          {atLimit
            ? `Up to ${maxObservations} observations per report.`
            : `${observations.length} of ${maxObservations} observations.`}
        </p>

        <button
          type="submit"
          className="button button-primary"
          disabled={submitting || areas.length === 0}
        >
          {submitting
            ? "Sending observation..."
            : "Send Observation for Closure"}
        </button>
      </form>
    </section>
  );
}
