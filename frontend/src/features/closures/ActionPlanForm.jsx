function getClosureStatusDetails(statusValue) {
  const status = String(
    statusValue ?? "OPEN",
  )
    .trim()
    .toUpperCase();

  switch (status) {
    case "IN_PROGRESS":
      return {
        label: "In Progress",
        className:
          "closure-status-in-progress",
      };

    case "SUBMITTED_FOR_CLOSURE":
    case "PENDING_EHS_APPROVAL":
      return {
        label: "Sent for Closure",
        className:
          "closure-status-submitted",
      };

    case "APPROVED":
    case "CLOSED":
      return {
        label: "Closed",
        className:
          "closure-status-closed",
      };

    case "REEXAMINATION_REQUIRED":
      return {
        label: "Re-examination Required",
        className:
          "closure-status-reexamination",
      };

    case "REJECTED":
      return {
        label: "Rejected",
        className:
          "closure-status-rejected",
      };

    case "OPEN":
    default:
      return {
        label: "Open",
        className:
          "closure-status-open",
      };
  }
}

export default function ActionPlanForm({
  closure,
  formValues,
  actionPlanWordCount,
  maxActionPlanWords,
  saving,
  submitting,
  onFieldChange,
  onSave,
  onSubmitForClosure,
}) {
  const normalizedStatus = String(
    closure?.status ?? "OPEN",
  )
    .trim()
    .toUpperCase();

  const statusDetails =
    getClosureStatusDetails(
      normalizedStatus,
    );

  const canSubmitForClosure =
    normalizedStatus === "IN_PROGRESS" &&
    Boolean(formValues.actionPlan.trim()) &&
    Boolean(formValues.targetDate) &&
    Boolean(
      formValues.responsibleHodName.trim(),
    );

  function handleFieldChange(
    fieldName,
    fieldValue,
  ) {
    if (
      typeof onFieldChange === "function"
    ) {
      onFieldChange(
        fieldName,
        fieldValue,
      );
    }
  }

  function handleSave(event) {
    event.preventDefault();

    if (
      editable &&
      typeof onSave === "function"
    ) {
      onSave();
    }
  }

  function handleSubmitForClosure() {
    if (
      canSubmitForClosure &&
      typeof onSubmitForClosure ===
        "function"
    ) {
      onSubmitForClosure();
    }
  }

  return (
    <form
      className="closure-action-form"
      onSubmit={handleSave}
      noValidate
    >
      <div className="closure-action-form-heading">
        <div>
          <span className="dashboard-eyebrow">
            Auditee response
          </span>

          <h2>Corrective Action Plan</h2>
        </div>

        <div
          className={[
            "closure-status-label",
            statusDetails.className,
          ].join(" ")}
          role="status"
          aria-label={
            `Closure status: ${statusDetails.label}`
          }
        >
          <span
            className="closure-status-indicator"
            aria-hidden="true"
          />

          <span className="closure-status-title">
            Closure status
          </span>

          <strong>
            {statusDetails.label}
          </strong>
        </div>
      </div>

      <div
        className={[
          "closure-form-field",
          "closure-action-plan-field",
        ].join(" ")}
      >
        <label htmlFor="closure-action-plan">
          Action plan

          <span
            className="required-marker"
            aria-hidden="true"
          >
            {" "}*
          </span>
        </label>

        <textarea
          id="closure-action-plan"
          name="actionPlan"
          value={formValues.actionPlan}
          rows={7}
          placeholder="Describe the corrective action that will be implemented."
          onChange={(event) => {
            handleFieldChange(
              "actionPlan",
              event.target.value,
            );
          }}
          disabled={
            !editable ||
            saving ||
            submitting
          }
          required
        />

        <div className="closure-word-count">
          <span>
            Maximum {maxActionPlanWords} words
          </span>

          <span>
            {actionPlanWordCount}/
            {maxActionPlanWords}
          </span>
        </div>
      </div>

      <div className="closure-form-grid">
        <div className="closure-form-field">
          <label htmlFor="closure-target-date">
            Target date

            <span
              className="required-marker"
              aria-hidden="true"
            >
              {" "}*
            </span>
          </label>

          <input
            id="closure-target-date"
            name="targetDate"
            type="date"
            value={formValues.targetDate}
            onChange={(event) => {
              handleFieldChange(
                "targetDate",
                event.target.value,
              );
            }}
            disabled={
              !editable ||
              saving ||
              submitting
            }
            required
          />
        </div>

        <div className="closure-form-field">
          <label htmlFor="responsible-hod-name">
            Responsible HOD name

            <span
              className="required-marker"
              aria-hidden="true"
            >
              {" "}*
            </span>
          </label>

          <input
            id="responsible-hod-name"
            name="responsibleHodName"
            type="text"
            value={
              formValues.responsibleHodName
            }
            placeholder="Enter the full name"
            maxLength={255}
            onChange={(event) => {
              handleFieldChange(
                "responsibleHodName",
                event.target.value,
              );
            }}
            disabled={
              !editable ||
              saving ||
              submitting
            }
            required
          />
        </div>
      </div>

      {editable && (
        <div className="closure-form-actions">
          <button
            type="submit"
            className="button button-secondary"
            disabled={saving || submitting}
          >
            {saving
              ? "Saving Action Plan..."
              : "Save Action Plan"}
          </button>

          <button
            type="button"
            className="button button-primary"
            onClick={
              handleSubmitForClosure
            }
            disabled={
              saving ||
              submitting ||
              !canSubmitForClosure
            }
          >
            {submitting
              ? "Sending..."
              : "Send report for closure"}
          </button>
        </div>
      )}
    </form>
  );
}