import {
  useState,
} from "react";

function getDisplayValue(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "Not available";
  }

  return value;
}

function formatDate(dateValue) {
  if (!dateValue) {
    return "Not available";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return String(dateValue);
  }

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    },
  ).format(date);
}

function ReviewField({
  label,
  value,
}) {
  return (
    <div className="approval-review-field">
      <span>{label}</span>

      <strong>
        {getDisplayValue(value)}
      </strong>
    </div>
  );
}

export default function ApprovalPanel({
  closure,
  canReview,
  approving,
  rejecting,
  onApprove,
  onReject,
}) {
  const [reviewComments, setReviewComments] =
    useState("");

  const [localError, setLocalError] =
    useState("");

  const normalizedStatus = String(
    closure?.status ?? "",
  )
    .trim()
    .toUpperCase();

  const pendingApproval =
    normalizedStatus ===
      "SUBMITTED_FOR_CLOSURE" ||
    normalizedStatus ===
      "PENDING_EHS_APPROVAL";

  const actionPlan =
    closure?.actionPlan ??
    closure?.action_plan;

  const responsibleHodName =
    closure?.responsibleHodName ??
    closure?.responsible_hod_name;

  const targetDate =
    closure?.targetDate ??
    closure?.target_date;

  const completionDate =
    closure?.completionDate ??
    closure?.completion_date;

  const submittedAt =
    closure?.submittedForClosureAt ??
    closure?.submitted_for_closure_at;

  const previousReviewComments =
    closure?.reviewComments ??
    closure?.review_comments ??
    closure?.rejectionComments ??
    closure?.rejection_comments;

  const busy =
    approving ||
    rejecting;

  function handleApprove() {
    setLocalError("");

    if (
      typeof onApprove === "function"
    ) {
      onApprove({
        reviewComments:
          reviewComments.trim(),
      });
    }
  }

  function handleReject() {
    setLocalError("");

    const normalizedComments =
      reviewComments.trim();

    if (!normalizedComments) {
      setLocalError(
        "Comments are required when sending the report back for re-examination.",
      );

      return;
    }

    if (
      typeof onReject === "function"
    ) {
      onReject({
        reviewComments:
          normalizedComments,
      });
    }
  }

  return (
    <section className="complete-report-section">
      <header className="approval-panel-header">
        <div>
          <span className="dashboard-eyebrow">
            EHS Officer review
          </span>

          <h2>Closure Approval</h2>

          <p>
            Review the submitted corrective
            action plan before closing the
            audit or returning it to the
            auditee.
          </p>
        </div>

        <span
          className={[
            "approval-status-label",
            pendingApproval
              ? "approval-status-pending"
              : "approval-status-complete",
          ].join(" ")}
        >
          {pendingApproval
            ? "Pending Approval"
            : closure?.displayStatus ??
              "Reviewed"}
        </span>
      </header>

      <div className="approval-review-grid">
        <ReviewField
          label="Report number"
          value={
            closure?.reportNumber ??
            closure?.report_number
          }
        />

        <ReviewField
          label="Auditee"
          value={
            closure?.auditeeName ??
            closure?.auditee_name
          }
        />

        <ReviewField
          label="Responsible HOD"
          value={responsibleHodName}
        />

        <ReviewField
          label="Target date"
          value={formatDate(targetDate)}
        />

        <ReviewField
          label="Completion date"
          value={formatDate(
            completionDate,
          )}
        />

        <ReviewField
          label="Submitted for closure"
          value={formatDate(
            submittedAt,
          )}
        />
      </div>

      <div className="approval-action-plan">
        <span>
          Submitted corrective action plan
        </span>

        <p>
          {getDisplayValue(actionPlan)}
        </p>
      </div>

      {previousReviewComments && (
        <div className="approval-previous-comments">
          <span>
            Previous EHS review comments
          </span>

          <p>
            {previousReviewComments}
          </p>
        </div>
      )}

      {pendingApproval && canReview && (
        <div className="approval-decision-panel">
          <div className="approval-comments-field">
            <label htmlFor="closure-review-comments">
              Review comments
            </label>

            <textarea
              id="closure-review-comments"
              value={reviewComments}
              rows={5}
              maxLength={1000}
              placeholder="Enter approval remarks or explain the changes required from the auditee."
              onChange={(event) => {
                setReviewComments(
                  event.target.value,
                );

                setLocalError("");
              }}
              disabled={busy}
            />

            <div className="approval-comments-meta">
              <span>
                Required when sending the
                report back
              </span>

              <span>
                {reviewComments.length}/1000
              </span>
            </div>
          </div>

          {localError && (
            <div
              className="approval-local-error"
              role="alert"
            >
              {localError}
            </div>
          )}

          <div className="approval-decision-actions">
            <button
              type="button"
              className="button approval-reject-button"
              onClick={handleReject}
              disabled={busy}
            >
              {rejecting
                ? "Sending Back..."
                : "Send for Re-examination"}
            </button>

            <button
              type="button"
              className="button button-primary"
              onClick={handleApprove}
              disabled={busy}
            >
              {approving
                ? "Approving..."
                : "Approve and Close"}
            </button>
          </div>
        </div>
      )}

      {pendingApproval && !canReview && (
        <div className="approval-waiting-message">
          The closure report has been sent
          to the EHS Officer for review.
        </div>
      )}

      {normalizedStatus ===
        "REEXAMINATION_REQUIRED" && (
        <div className="approval-reexamination-message">
          This report was returned for
          re-examination. Update the
          corrective action plan and submit
          it again.
        </div>
      )}

      {normalizedStatus === "APPROVED" && (
        <div className="approval-completed-message">
          The EHS Officer approved this
          closure report. The audit is
          completed and the report is closed.
        </div>
      )}
    </section>
  );
}