import { formatDate } from "../../lib/errorMessage.js";

function Field({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || "Not recorded"}</strong>
    </div>
  );
}

/**
 * The observation report half of a closure. The API returns both in one
 * row, so the closure page can show what was found alongside what was
 * done about it without a second request.
 */
export default function ObservationSummary({
  closure,
  photograph,
}) {
  return (
    <section className="closure-observation">
      <h3>Observation report</h3>

      <div className="closure-detail-grid">
        <Field
          label="Report number"
          value={closure.reportNumber}
        />
        <Field
          label="Finding date"
          value={formatDate(closure.findingDate)}
        />
        <Field
          label="Plant"
          value={closure.plantLocation}
        />
        <Field
          label="Unit"
          value={closure.unitName}
        />
        <Field
          label="Zone"
          value={closure.zoneName}
        />
        <Field
          label="Area"
          value={closure.areaName}
        />
        <Field
          label="Category"
          value={closure.category}
        />
        <Field
          label="Risk"
          value={closure.riskCategory}
        />
        <Field
          label="Auditor"
          value={closure.auditorName}
        />
        <Field
          label="Submitted"
          value={formatDate(
            closure.observationSubmittedAt,
          )}
        />
      </div>

      <div className="observation-detail-body">
        <span>Description</span>
        <p>
          {closure.observationDescription ??
            "Not recorded"}
        </p>
      </div>

      <div className="observation-detail-photo">
        <span>Photograph</span>

        {photograph ? (
          <img
            src={photograph}
            alt={
              closure.photographOriginalName ??
              "Observation photograph"
            }
          />
        ) : (
          <p className="closure-empty-note">
            Photograph is not available.
          </p>
        )}
      </div>
    </section>
  );
}
