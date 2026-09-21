import Alert from "../../components/Alert.jsx";

import { formatDate } from "../../lib/errorMessage.js";

import ActionPlanItemForm from "./ActionPlanItemForm.jsx";

/**
 * The auditee's half of a closure: the report header once, then one
 * action plan per observation, then the single "send for approval"
 * step for the whole closure.
 */
export default function ActionPlanForm({
  closure,
  photographs,
  photograph,
  submitting,
  submitError,
  onItemSaved,
  onSendForApproval,
  departmentOptions,
  departmentOptionsLoading,
  plantName,
}) {
  const items = closure?.items ?? [];

  const canSubmit = Boolean(
    closure?.canSubmitForClosure,
  );

  const closedTickets =
    closure?.closedTicketCount ?? 0;

  const itemCount =
    closure?.itemCount ?? items.length;

  const awaitingApproval =
    closure?.displayStatus ===
    "Pending Approval";

  return (
    <section className="closure-action-plan">
      <header className="observation-section-header">
        <div>
          <h3>Closure report</h3>

          <p>
            {itemCount === 1
              ? "1 observation"
              : `${itemCount} observations`}{" "}
            · {closedTickets}/{itemCount} tickets
            resolved
            {closure?.approvalIteration > 1
              ? ` · attempt ${closure.approvalIteration}`
              : ""}
          </p>
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

      {submitError ? (
        <Alert type="error">{submitError}</Alert>
      ) : null}

      {items.length === 0 ? (
        <p className="closure-empty-note">
          This closure has no observations to plan
          against.
        </p>
      ) : (
        items.map((item) => (
          <ActionPlanItemForm
            key={item.id}
            closureId={closure.id}
            item={item}
            total={items.length}
            photograph={
              photographs?.[
                item.observation?.id
              ] ??
              (item.sequenceNumber === 1
                ? photograph
                : "")
            }
            departmentOptions={
              departmentOptions
            }
            departmentOptionsLoading={
              departmentOptionsLoading
            }
            plantName={plantName}
            onSaved={onItemSaved}
          />
        ))
      )}

      {closure?.completionDate ? (
        <p className="closure-empty-note">
          Completion date recorded:{" "}
          {formatDate(closure.completionDate)}
        </p>
      ) : null}

      <div className="closure-submit-row">
        <button
          type="button"
          className="button button-primary"
          disabled={
            submitting ||
            !canSubmit ||
            awaitingApproval
          }
          title={
            canSubmit
              ? undefined
              : "Every observation needs an accepted-or-rejected ticket before this closure can be submitted."
          }
          onClick={onSendForApproval}
        >
          {submitting
            ? "Sending..."
            : "Send closure for approval"}
        </button>

        {awaitingApproval ? (
          <p className="closure-empty-note">
            This closure is with the EHS Officer.
          </p>
        ) : !canSubmit ? (
          <p className="closure-empty-note">
            Every observation needs a saved action
            plan, and every department needs to
            have accepted or rejected its ticket,
            before this closure can be sent for
            approval.
          </p>
        ) : null}
      </div>
    </section>
  );
}
