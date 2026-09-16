import PhotographInput from "./PhotographInput.jsx";
import RiskSelector from "./RiskSelector.jsx";

import { formatDate } from "../../lib/errorMessage.js";

function ReadOnlyField({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || "Not available"}</strong>
    </div>
  );
}

export default function ObservationCard({
  assignment,
  formValues,
  descriptionWordCount,
  maxDescriptionWords,
  submitting,
  onFieldChange,
  onPhotographChange,
  onPhotographRemove,
  onSubmit,
  onCancel,
}) {
  const areas = Array.isArray(assignment?.areas)
    ? assignment.areas
    : [];

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
          label="Audit date"
          value={formatDate(
            assignment?.scheduledDate,
          )}
        />
        <ReadOnlyField
          label="Plant"
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

        {/*
          * A patrol covers the whole zone, so the auditor names the
          * area the finding was actually in. The options are that
          * zone's own fixed areas, loaded from the database.
          */}
        <div className="form-field">
          <label htmlFor="zoneAreaId">
            Area of observation
            <span
              className="required-marker"
              aria-hidden="true"
            >
              {" *"}
            </span>
          </label>

          {areas.length === 0 ? (
            <p className="observation-empty-note">
              No areas are configured for this
              zone, so an observation cannot be
              recorded. Ask your EHS Officer to
              configure them.
            </p>
          ) : (
            <select
              id="zoneAreaId"
              required
              aria-required="true"
              value={formValues.zoneAreaId}
              disabled={submitting}
              onChange={(event) =>
                onFieldChange(
                  "zoneAreaId",
                  event.target.value,
                )
              }
            >
              <option value="">
                Select the area
              </option>

              {areas.map((area) => (
                <option
                  key={area.id}
                  value={area.id}
                >
                  {area.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="category">
            Category
            <span
              className="required-marker"
              aria-hidden="true"
            >
              {" *"}
            </span>
          </label>

          <select
            id="category"
            required
            aria-required="true"
            value={formValues.category}
            disabled={submitting}
            onChange={(event) =>
              onFieldChange(
                "category",
                event.target.value,
              )
            }
          >
            <option value="">
              Select the category
            </option>
            <option value="UC">
              UC - Unsafe Condition
            </option>
            <option value="UA">
              UA - Unsafe Act
            </option>
          </select>
        </div>

        <PhotographInput
          photograph={formValues.photograph}
          photographPreview={
            formValues.photographPreview
          }
          disabled={submitting}
          onChange={onPhotographChange}
          onRemove={onPhotographRemove}
        />

        <div className="form-field">
          <label htmlFor="description">
            Observation description
            <span
              className="required-marker"
              aria-hidden="true"
            >
              {" *"}
            </span>
          </label>

          <textarea
            id="description"
            rows="8"
            required
            aria-required="true"
            aria-describedby="description-count"
            value={formValues.description}
            disabled={submitting}
            onChange={(event) =>
              onFieldChange(
                "description",
                event.target.value,
              )
            }
          />

          <span id="description-count">
            {descriptionWordCount}/
            {maxDescriptionWords} words
          </span>
        </div>

        <RiskSelector
          value={formValues.riskCategory}
          disabled={submitting}
          onChange={(value) =>
            onFieldChange("riskCategory", value)
          }
        />

        <button
          type="submit"
          className="button button-primary"
          disabled={
            submitting || areas.length === 0
          }
        >
          {submitting
            ? "Sending observation..."
            : "Send Observation for Closure"}
        </button>
      </form>
    </section>
  );
}
