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
 * One observation's own fields and photograph. `photograph` is a blob
 * object URL, since photographs are served through an authenticated
 * route and cannot be a plain <img src>.
 */
function ObservationBlock({
  heading,
  areaName,
  category,
  riskCategory,
  description,
  photograph,
  photographAlt,
}) {
  return (
    <div className="closure-observation-item">
      {heading ? <h4>{heading}</h4> : null}

      <div className="closure-detail-grid">
        <Field label="Area" value={areaName} />
        <Field label="Category" value={category} />
        <Field label="Risk" value={riskCategory} />
      </div>

      <div className="observation-detail-body">
        <span>Description</span>
        <p>{description ?? "Not recorded"}</p>
      </div>

      <div className="observation-detail-photo">
        <span>Photograph</span>

        {photograph ? (
          <img
            src={photograph}
            alt={
              photographAlt ??
              "Observation photograph"
            }
          />
        ) : (
          <p className="closure-empty-note">
            Photograph is not available.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The observation report half of a closure or ticket: the header once,
 * then every observation on the report. A report filed before
 * multi-observation support has a single item and renders exactly as
 * it did before.
 */
export default function ObservationSummary({
  closure,
  photograph,
  photographs = {},
}) {
  const observations = closure.observations ?? [];

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

      {observations.length > 0 ? (
        observations.map((item) => (
          <ObservationBlock
            key={item.id}
            heading={`Observation ${item.sequenceNumber} of ${observations.length}`}
            areaName={item.areaName}
            category={item.category}
            riskCategory={item.riskCategory}
            description={item.description}
            /*
             * Item #1 falls back to the report-level photograph, which
             * is the same file and is already loaded by every caller.
             */
            photograph={
              photographs[item.id] ??
              (item.sequenceNumber === 1
                ? photograph
                : "")
            }
            photographAlt={
              closure.photographOriginalName
            }
          />
        ))
      ) : (
        <ObservationBlock
          areaName={closure.areaName}
          category={closure.category}
          riskCategory={closure.riskCategory}
          description={
            closure.observationDescription
          }
          photograph={photograph}
          photographAlt={
            closure.photographOriginalName
          }
        />
      )}
    </section>
  );
}
