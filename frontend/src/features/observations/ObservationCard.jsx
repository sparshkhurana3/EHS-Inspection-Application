import PhotographInput
  from "./PhotographInput.jsx";

import RiskSelector
  from "./RiskSelector.jsx";

const PLANT_LOCATIONS = [
  "Gurugram",
  "Pune",
  "Chennai",
  "Manesar",
  "China",
];

function getAssignmentValue(
  assignment,
  camelCaseField,
  snakeCaseField,
  fallback = "Not available",
) {
  return (
    assignment?.[camelCaseField] ??
    assignment?.[snakeCaseField] ??
    fallback
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
}) {
  const weekNumber =
    getAssignmentValue(
      assignment,
      "weekNumber",
      "week_number",
    );

  const unitNumber =
    getAssignmentValue(
      assignment,
      "unitNumber",
      "unit_number",
      getAssignmentValue(
        assignment,
        "unitName",
        "unit_name",
      ),
    );

  const zoneNumber =
    getAssignmentValue(
      assignment,
      "zoneNumber",
      "zone_number",
      getAssignmentValue(
        assignment,
        "zoneName",
        "zone_name",
      ),
    );

  const observationLocation =
    getAssignmentValue(
      assignment,
      "observationLocation",
      "observation_location",
      getAssignmentValue(
        assignment,
        "areaDetail",
        "area_detail",
      ),
    );

  const auditeeName =
    getAssignmentValue(
      assignment,
      "auditeeName",
      "auditee_name",
    );

  const ehsOfficerName =
    getAssignmentValue(
      assignment,
      "ehsOfficerName",
      "ehs_officer_name",
    );

  const auditorName =
    getAssignmentValue(
      assignment,
      "auditorName",
      "auditor_name",
    );

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      className="observation-report-form"
      onSubmit={handleSubmit}
      noValidate
    >
      <section className="observation-assignment-card">
        <header className="observation-section-header">
          <div>
            <span className="dashboard-eyebrow">
              Current weekly assignment
            </span>

            <h2>Patrol information</h2>
          </div>

          <span className="observation-assignment-status">
            Scheduled
          </span>
        </header>

        <div className="observation-assignment-grid">
          <div>
            <span>Week number</span>
            <strong>{weekNumber}</strong>
          </div>

          <div>
            <span>Unit number</span>
            <strong>{unitNumber}</strong>
          </div>

          <div>
            <span>Zone number</span>
            <strong>{zoneNumber}</strong>
          </div>

          <div>
            <span>Auditee name</span>
            <strong>{auditeeName}</strong>
          </div>

          <div>
            <span>EHS Officer</span>
            <strong>{ehsOfficerName}</strong>
          </div>

          <div>
            <span>Auditor name</span>
            <strong>{auditorName}</strong>
          </div>
        </div>
      </section>

      <section className="observation-form-card">
        <header className="observation-section-header">
          <div>
            <span className="dashboard-eyebrow">
              Patrol Observation Report
            </span>

            <h2>Add observation</h2>

            <p>
              Record the finding identified
              during the assigned patrol.
            </p>
          </div>
        </header>

        <div className="observation-form-grid">
          <div className="observation-form-field">
            <label htmlFor="finding-date">
              Finding date
              <span aria-hidden="true">
                {" "}*
              </span>
            </label>

            <input
              id="finding-date"
              name="findingDate"
              type="date"
              value={
                formValues.findingDate
              }
              onChange={(event) =>
                onFieldChange(
                  "findingDate",
                  event.target.value,
                )
              }
              disabled={submitting}
              required
            />

            <small>
              Automatically set when the
              report is started.
            </small>
          </div>

          <div className="observation-form-field">
            <label htmlFor="plant-location">
              Plant location
              <span aria-hidden="true">
                {" "}*
              </span>
            </label>

            <select
              id="plant-location"
              name="location"
              value={formValues.location}
              onChange={(event) =>
                onFieldChange(
                  "location",
                  event.target.value,
                )
              }
              disabled={submitting}
              required
            >
              <option value="">
                Select location
              </option>

              {PLANT_LOCATIONS.map(
                (location) => (
                  <option
                    key={location}
                    value={location}
                  >
                    {location}
                  </option>
                ),
              )}
            </select>
          </div>

          <div className="observation-form-field">
            <label htmlFor="observation-location">
              Location of observation
            </label>

            <input
              id="observation-location"
              type="text"
              value={observationLocation}
              readOnly
            />

            <small>
              Taken from the assigned patrol.
            </small>
          </div>

          <div className="observation-form-field">
            <label htmlFor="observation-category">
              Category
              <span aria-hidden="true">
                {" "}*
              </span>
            </label>

            <select
              id="observation-category"
              name="category"
              value={formValues.category}
              onChange={(event) =>
                onFieldChange(
                  "category",
                  event.target.value,
                )
              }
              disabled={submitting}
              required
            >
              <option value="">
                Select category
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
            photograph={
              formValues.photograph
            }
            photographPreview={
              formValues
                .photographPreview
            }
            disabled={submitting}
            onChange={
              onPhotographChange
            }
            onRemove={
              onPhotographRemove
            }
          />

          <div className="observation-form-field observation-description-field">
            <label htmlFor="observation-description">
              Observation description
              <span aria-hidden="true">
                {" "}*
              </span>
            </label>

            <textarea
              id="observation-description"
              name="description"
              rows="8"
              value={
                formValues.description
              }
              placeholder="Describe the unsafe act or unsafe condition, its location, and the potential safety impact."
              onChange={(event) =>
                onFieldChange(
                  "description",
                  event.target.value,
                )
              }
              disabled={submitting}
              required
            />

            <div className="observation-description-meta">
              <small>
                Use clear and factual language.
              </small>

              <small>
                {descriptionWordCount}/
                {maxDescriptionWords} words
              </small>
            </div>
          </div>
        </div>

        <RiskSelector
          value={formValues.riskCategory}
          disabled={submitting}
          onChange={(selectedRisk) => {
            onFieldChange(
              "riskCategory",
              selectedRisk,
            );
          }}
        />

        <div className="observation-submit-panel">
          <div>
            <strong>
              Send report to auditee
            </strong>

            <p>
              The observation will be sent
              to the assigned auditee for
              action plan and closure.
            </p>
          </div>

          <button
            type="submit"
            className="button button-primary"
            disabled={submitting}
          >
            {submitting
              ? "Sending observation..."
              : "Send Observation for Closure"}
          </button>
        </div>
      </section>
    </form>
  );
}