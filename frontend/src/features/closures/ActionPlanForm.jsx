import Alert from "../../components/Alert.jsx";

import { formatDate } from "../../lib/errorMessage.js";

/**
 * The auditee's half of a closure.
 *
 * `editable` comes from the server's canEditActionPlan rather than
 * being inferred here; it was previously referenced but never declared,
 * which threw on first render and took the whole page down.
 */
export default function ActionPlanForm({
  closure,
  values,
  actionPlanWordCount,
  maxActionPlanWords,
  saving,
  submitting,
  error,
  onFieldChange,
  onSave,
  onSendForApproval,
  actionHodOptions,
  actionHodOptionsLoading,
  actionHodPlantName,
}) {
  const editable = Boolean(
    closure?.canEditActionPlan,
  );

  const canSubmit = Boolean(
    closure?.canSubmitForClosure,
  );

  const busy = saving || submitting;

  function handleSave(event) {
    event.preventDefault();
    onSave();
  }

  return (
    <section className="closure-action-plan">
      <header className="observation-section-header">
        <div>
          <h3>Closure report</h3>

          {closure?.approvalIteration > 1 ? (
            <p>
              Attempt {closure.approvalIteration}
            </p>
          ) : null}
        </div>

        <span className="closure-status-chip">
          {closure?.displayStatus}
        </span>
      </header>

      {/*
        * A rejection clears the action plan but keeps the target date,
        * so the officer's reason has to be visible or the empty field
        * looks like a bug.
        */}
      {closure?.wasReturned &&
      closure?.reviewComments ? (
        <Alert
          type="warning"
          title="Sent back by the EHS Officer"
        >
          {closure.reviewComments}
        </Alert>
      ) : null}

      {error ? (
        <Alert type="error">{error}</Alert>
      ) : null}

      <form noValidate onSubmit={handleSave}>
        <div className="form-field">
          <label htmlFor="actionPlan">
            Action plan
          </label>

          <textarea
            id="actionPlan"
            rows="7"
            aria-describedby="action-plan-count"
            value={values.actionPlan}
            disabled={!editable || busy}
            onChange={(event) =>
              onFieldChange(
                "actionPlan",
                event.target.value,
              )
            }
          />

          <span id="action-plan-count">
            {actionPlanWordCount}/
            {maxActionPlanWords} words
          </span>
        </div>

        <div className="form-field">
          <label htmlFor="targetDate">
            Target date
          </label>

          <input
            id="targetDate"
            type="date"
            value={values.targetDate}
            disabled={!editable || busy}
            onChange={(event) =>
              onFieldChange(
                "targetDate",
                event.target.value,
              )
            }
          />
        </div>

        <div className="form-field">
          <label htmlFor="actionHodId">
            Action Team HOD
          </label>

          {editable ? (
            <>
              <select
                id="actionHodId"
                value={values.actionHodId}
                disabled={
                  busy ||
                  actionHodOptionsLoading ||
                  actionHodOptions.length === 0
                }
                onChange={(event) =>
                  onFieldChange(
                    "actionHodId",
                    event.target.value,
                  )
                }
              >
                <option value="">
                  {actionHodOptionsLoading
                    ? "Loading..."
                    : "Select an Action Team HOD"}
                </option>

                {actionHodOptions.map(
                  (hod) => (
                    <option
                      key={hod.id}
                      value={hod.id}
                    >
                      {hod.fullName}
                    </option>
                  ),
                )}
              </select>

              {!actionHodOptionsLoading &&
              actionHodOptions.length === 0 ? (
                <p className="closure-empty-note">
                  No Action Team HOD is
                  registered for{" "}
                  {actionHodPlantName ??
                    "this location"}
                  . Ask the administrator to
                  add one before saving the
                  plan.
                </p>
              ) : null}
            </>
          ) : (
            <p>
              {closure?.actionHodName ??
                closure?.responsibleHodName ??
                "Not yet assigned."}
            </p>
          )}
        </div>

        {closure?.completionDate ? (
          <p className="closure-empty-note">
            Completion date recorded:{" "}
            {formatDate(closure.completionDate)}
          </p>
        ) : null}

        {editable ? (
          <div className="closure-form-actions">
            <button
              type="submit"
              className="button button-secondary"
              disabled={busy}
            >
              {saving
                ? "Saving..."
                : "Save action plan"}
            </button>

            <button
              type="button"
              className="button button-primary"
              disabled={busy || !canSubmit}
              title={
                canSubmit
                  ? undefined
                  : "Save a complete action plan first."
              }
              onClick={onSendForApproval}
            >
              {submitting
                ? "Sending..."
                : "Send closure for approval"}
            </button>
          </div>
        ) : (
          <p className="closure-empty-note">
            This closure is waiting for the EHS
            Officer and cannot be edited.
          </p>
        )}
      </form>
    </section>
  );
}
