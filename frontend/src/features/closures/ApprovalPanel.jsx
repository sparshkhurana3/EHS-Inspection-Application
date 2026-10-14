import { useState } from "react";

import Alert from "../../components/Alert.jsx";

import {
  useAuthenticatedUser,
} from "../../app/authProvider.jsx";

import { formatDate } from "../../lib/errorMessage.js";

/**
 * The EHS Officer's decision on one submitted closure. Approval is the
 * only route to a completed closure; rejecting reopens every
 * observation for rework and keeps its plan text and photographs.
 */
export default function ApprovalPanel({
  closure,
  busy,
  onApprove,
  onReject,
}) {
  const { user } = useAuthenticatedUser();

  const [comments, setComments] = useState("");
  const [localError, setLocalError] =
    useState("");

  /*
   * The officer may approve a closure on which they are the auditee.
   * Nothing stops it, so the panel says plainly what they are signing.
   */
  const approvingOwnPlans =
    closure.auditeeId != null &&
    String(closure.auditeeId) ===
      String(user?.id);

  function handleReject() {
    if (!comments.trim()) {
      setLocalError(
        "Review comments are required when sending a report back.",
      );

      return;
    }

    setLocalError("");
    onReject(closure.id, comments.trim());
  }

  return (
    <section className="closure-approval">
      <h3>EHS review</h3>

      <div className="closure-detail-grid">
        <div>
          <span>Action plan</span>
          <strong>
            {closure.actionPlan ??
              "Not provided"}
          </strong>
        </div>

        <div>
          <span>Target date</span>
          <strong>
            {formatDate(closure.targetDate)}
          </strong>
        </div>

        <div>
          <span>Completion date</span>
          <strong>
            {formatDate(closure.completionDate)}
          </strong>
        </div>
      </div>

      {localError ? (
        <div role="alert">
          <Alert type="error">
            {localError}
          </Alert>
        </div>
      ) : null}

      <div className="form-field">
        <label htmlFor="reviewComments">
          Review comments
        </label>

        <textarea
          id="reviewComments"
          rows="4"
          maxLength={1000}
          value={comments}
          disabled={busy}
          onChange={(event) =>
            setComments(event.target.value)
          }
        />

        <span>{comments.length}/1000</span>
      </div>

      {approvingOwnPlans ? (
        <Alert type="warning">
          You are the auditee of this audit, so
          approving it signs off your own action
          plans.
        </Alert>
      ) : null}

      <div className="closure-form-actions">
        <button
          type="button"
          className="button button-secondary"
          disabled={busy}
          onClick={handleReject}
        >
          Send for re-examination
        </button>

        <button
          type="button"
          className="button button-primary"
          disabled={busy}
          onClick={() =>
            onApprove(
              closure.id,
              comments.trim(),
            )
          }
        >
          Approve and close
        </button>
      </div>
    </section>
  );
}
