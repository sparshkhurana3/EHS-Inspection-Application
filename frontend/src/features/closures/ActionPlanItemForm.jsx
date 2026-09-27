import Alert from "../../components/Alert.jsx";

import { formatDate } from "../../lib/errorMessage.js";

import ClosureEvidencePanel from "./ClosureEvidencePanel.jsx";

import { useClosureItemForm } from "./useClosures.js";

/**
 * One observation's action plan: what was found, what will be done
 * about it, and the photographs proving it was done — all in one
 * block, so a report with several observations reads as several
 * independent units of work.
 */
export default function ActionPlanItemForm({
  closureId,
  item,
  total,
  photograph,
  onSaved,
}) {
  const form = useClosureItemForm({
    closureId,
    item,
    onSaved,
  });

  const editable = Boolean(item.canEdit);
  const suffix = `-${item.id}`;

  function handleSave(event) {
    event.preventDefault();
    form.save();
  }

  return (
    <section className="closure-item-card">
      <header className="observation-section-header">
        <div>
          <h3>
            Observation {item.sequenceNumber} of{" "}
            {total}
          </h3>

          <p>
            {[
              item.observation?.areaName,
              item.observation?.category,
              item.observation?.riskCategory
                ? `${item.observation.riskCategory} risk`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        <span className="closure-status-chip">
          {item.actionPlan
            ? "Action plan saved"
            : "Action plan needed"}
        </span>
      </header>

      <div className="closure-item-observation">
        <div className="observation-detail-body">
          <span>What was observed</span>
          <p>
            {item.observation?.description ??
              "Not recorded"}
          </p>
        </div>

        {photograph ? (
          <div className="observation-detail-photo">
            <span>Photograph</span>
            <img
              src={photograph}
              alt={`Observation ${item.sequenceNumber}`}
            />
          </div>
        ) : null}
      </div>

      {form.error ? (
        <Alert type="error">{form.error}</Alert>
      ) : null}

      <form noValidate onSubmit={handleSave}>
        <div className="form-field">
          <label
            htmlFor={`actionPlan${suffix}`}
          >
            Action plan for this observation
          </label>

          <textarea
            id={`actionPlan${suffix}`}
            rows="5"
            aria-describedby={`action-plan-count${suffix}`}
            value={form.values.actionPlan}
            disabled={!editable || form.saving}
            onChange={(event) =>
              form.updateField(
                "actionPlan",
                event.target.value,
              )
            }
          />

          <span
            id={`action-plan-count${suffix}`}
          >
            {form.actionPlanWordCount}/
            {form.maxActionPlanWords} words
          </span>
        </div>

        <div className="form-field">
          <label
            htmlFor={`targetDate${suffix}`}
          >
            Target date
          </label>

          <input
            id={`targetDate${suffix}`}
            type="date"
            value={form.values.targetDate}
            disabled={!editable || form.saving}
            onChange={(event) =>
              form.updateField(
                "targetDate",
                event.target.value,
              )
            }
          />
        </div>

        {editable ? (
          <div className="closure-form-actions">
            <button
              type="submit"
              className="button button-secondary"
              disabled={form.saving}
            >
              {form.saving
                ? "Saving..."
                : item.actionPlan
                  ? "Update action plan"
                  : "Save action plan"}
            </button>

            {item.actionPlanSavedAt ? (
              <span className="closure-empty-note">
                Saved{" "}
                {formatDate(
                  item.actionPlanSavedAt,
                )}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="closure-item-disabled-note">
            This closure is with the EHS Officer
            and cannot be edited.
          </p>
        )}
      </form>

      <ClosureEvidencePanel
        closureId={closureId}
        item={item}
        editable={editable}
        onChanged={onSaved}
      />
    </section>
  );
}
