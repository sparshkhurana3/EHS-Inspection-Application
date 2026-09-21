import Alert from "../../components/Alert.jsx";

import { formatDate } from "../../lib/errorMessage.js";

import TicketStatusCard from "../tickets/TicketStatusCard.jsx";

import { useClosureItemForm } from "./useClosures.js";

/**
 * One observation's action plan: what was found, what will be done
 * about it, which department will do it, and the ticket that department
 * is working — all in one block, so a report with several observations
 * reads as several independent units of work.
 */
export default function ActionPlanItemForm({
  closureId,
  item,
  total,
  photograph,
  departmentOptions,
  departmentOptionsLoading,
  plantName,
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

        {item.ticketDisplayStatus ? (
          <span
            className={`closure-status-chip ticket-status-${String(
              item.ticket?.status ?? "",
            ).toLowerCase()}`}
          >
            Ticket: {item.ticketDisplayStatus}
          </span>
        ) : (
          <span className="closure-status-chip">
            No ticket yet
          </span>
        )}
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

        <div className="form-field">
          <label
            htmlFor={`departmentId${suffix}`}
          >
            Assign to department
          </label>

          {editable ? (
            <>
              <select
                id={`departmentId${suffix}`}
                value={form.values.departmentId}
                disabled={
                  form.saving ||
                  departmentOptionsLoading ||
                  departmentOptions.length === 0
                }
                onChange={(event) =>
                  form.updateField(
                    "departmentId",
                    event.target.value,
                  )
                }
              >
                <option value="">
                  {departmentOptionsLoading
                    ? "Loading..."
                    : "Select the responsible department"}
                </option>

                {departmentOptions.map(
                  (department) => (
                    <option
                      key={department.id}
                      value={department.id}
                    >
                      {department.name}
                      {department.hodName
                        ? ` — ${department.hodName}`
                        : ""}
                    </option>
                  ),
                )}
              </select>

              {!departmentOptionsLoading &&
              departmentOptions.length === 0 ? (
                <p className="closure-empty-note">
                  No department at{" "}
                  {plantName ?? "this location"}{" "}
                  has an Action Team HOD
                  registered yet. Ask the
                  administrator to add one before
                  saving the plan.
                </p>
              ) : null}
            </>
          ) : (
            <p>
              {item.departmentName
                ? `${item.departmentName}${
                    item.actionHodName
                      ? ` — ${item.actionHodName}`
                      : ""
                  }`
                : "Not yet assigned."}
            </p>
          )}
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
            {item.ticket
              ? "A decision has already been recorded for this observation, so its action plan can no longer be changed."
              : "This closure is waiting for the EHS Officer and cannot be edited."}
          </p>
        )}
      </form>

      <TicketStatusCard ticket={item.ticket} />
    </section>
  );
}
