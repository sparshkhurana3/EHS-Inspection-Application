import Alert from "../../components/Alert.jsx";

import { formatDate } from "../../lib/errorMessage.js";

import EvidenceInput from "./EvidenceInput.jsx";

import {
  useSubmitResolution,
  useTicketDecision,
  useTicketEvidence,
  useTicketLookups,
} from "./useTickets.js";

/**
 * The Action Team HOD's half of a ticket: decide (while OPEN), attach
 * evidence and send the resolution to the EHS Officer (while
 * IN_PROGRESS), wait (while PENDING_APPROVAL), or a read-only summary
 * once CLOSED.
 */
export default function TicketActionPanel({
  ticket,
  evidenceUrls,
  onChanged,
}) {
  const {
    correctiveActionTypes,
  } = useTicketLookups();

  const decision = useTicketDecision(
    ticket,
    onChanged,
  );

  const evidence = useTicketEvidence(
    ticket,
    onChanged,
  );

  const resolution = useSubmitResolution(
    ticket,
    onChanged,
  );

  if (ticket.canDecide) {
    return (
      <section className="ticket-action-panel">
        <h3>Decide on the proposed plan</h3>

        {decision.error ? (
          <Alert type="error">
            {decision.error}
          </Alert>
        ) : null}

        <div className="form-field">
          <label htmlFor="ticket-comments">
            Comments
          </label>

          <textarea
            id="ticket-comments"
            rows="4"
            value={decision.comments}
            disabled={decision.submitting}
            onChange={(event) =>
              decision.setComments(
                event.target.value,
              )
            }
          />
        </div>

        <div className="form-field">
          <label htmlFor="ticket-corrective-type">
            Type of work
          </label>

          <select
            id="ticket-corrective-type"
            value={
              decision.correctiveActionTypeId
            }
            disabled={decision.submitting}
            onChange={(event) =>
              decision.setCorrectiveActionTypeId(
                event.target.value,
              )
            }
          >
            <option value="">
              Select a type
            </option>

            {correctiveActionTypes.map(
              (type) => (
                <option
                  key={type.id}
                  value={type.id}
                >
                  {type.name}
                </option>
              ),
            )}
          </select>

          <span className="form-field-help">
            Required to accept; optional to
            reject. You can change it when you
            report the work done.
          </span>
        </div>

        <div className="ticket-decision-actions">
          <button
            type="button"
            className="button button-primary"
            disabled={decision.submitting}
            onClick={decision.accept}
          >
            {decision.submitting
              ? "Submitting..."
              : "Accept plan"}
          </button>

          <button
            type="button"
            className="button button-secondary"
            disabled={decision.submitting}
            onClick={decision.reject}
          >
            {decision.submitting
              ? "Submitting..."
              : "Reject and send for approval"}
          </button>
        </div>

        <p className="closure-empty-note">
          Your explanation goes to the EHS
          Officer, who closes the ticket or
          sends it back to you.
        </p>
      </section>
    );
  }

  if (ticket.canAddEvidence) {
    return (
      <section className="ticket-action-panel">
        <h3>Work the ticket</h3>

        {evidence.error ? (
          <Alert type="error">
            {evidence.error}
          </Alert>
        ) : null}

        {ticket.evidence?.length > 0 ? (
          <div className="ticket-evidence-grid">
            {ticket.evidence.map((item) => (
              <div
                key={item.id}
                className="ticket-evidence-item"
              >
                {evidenceUrls?.[item.id] ? (
                  <img
                    src={evidenceUrls[item.id]}
                    alt={
                      item.originalName ??
                      "Evidence photograph"
                    }
                  />
                ) : null}

                <button
                  type="button"
                  className="observation-photo-remove"
                  disabled={
                    evidence.removingId ===
                    item.id
                  }
                  onClick={() =>
                    evidence.remove(item.id)
                  }
                >
                  {evidence.removingId ===
                  item.id
                    ? "Removing..."
                    : "Remove"}
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <EvidenceInput
          selectedFiles={
            evidence.selectedFiles
          }
          remainingSlots={
            evidence.remainingSlots
          }
          disabled={evidence.uploading}
          onAddFiles={evidence.addFiles}
          onRemoveSelected={
            evidence.removeSelected
          }
        />

        {evidence.selectedFiles.length > 0 ? (
          <button
            type="button"
            className="button button-secondary"
            disabled={evidence.uploading}
            onClick={evidence.upload}
          >
            {evidence.uploading
              ? "Uploading..."
              : "Upload evidence"}
          </button>
        ) : null}

        <div className="ticket-resolution-form">
          <h4>Resolution</h4>

          <div className="form-field">
            <label htmlFor="resolution-comments">
              What was done
            </label>

            <textarea
              id="resolution-comments"
              rows="4"
              value={
                resolution.resolutionComments
              }
              disabled={resolution.submitting}
              onChange={(event) =>
                resolution.setResolutionComments(
                  event.target.value,
                )
              }
            />
          </div>

          <div className="form-field">
            <label htmlFor="resolution-type">
              Type of work done
            </label>

            <select
              id="resolution-type"
              value={
                resolution.correctiveActionTypeId
              }
              disabled={resolution.submitting}
              onChange={(event) =>
                resolution.setCorrectiveActionTypeId(
                  event.target.value,
                )
              }
            >
              <option value="">
                Select a type
              </option>

              {correctiveActionTypes.map(
                (type) => (
                  <option
                    key={type.id}
                    value={type.id}
                  >
                    {type.name}
                  </option>
                ),
              )}
            </select>
          </div>

          {resolution.error ? (
            <Alert type="error">
              {resolution.error}
            </Alert>
          ) : null}

          <button
            type="button"
            className="button button-primary"
            disabled={
              resolution.submitting ||
              !ticket.canSubmitResolution
            }
            title={
              ticket.canSubmitResolution
                ? undefined
                : "Attach at least one evidence photograph first."
            }
            onClick={resolution.submit}
          >
            {resolution.submitting
              ? "Sending..."
              : "Submit resolution for approval"}
          </button>

          <p className="closure-empty-note">
            Attach 1–3 photographs and describe
            what was done. The EHS Officer
            closes the ticket or sends it back.
          </p>
        </div>
      </section>
    );
  }

  if (ticket.awaitingApproval) {
    return (
      <section className="ticket-action-panel">
        <h3>Awaiting EHS Officer approval</h3>

        <p>
          {ticket.pendingOutcome === "REJECTION"
            ? "Your rejection of this plan is with the EHS Officer."
            : "Your resolution is with the EHS Officer."}{" "}
          Sent{" "}
          {formatDate(
            ticket.submittedForApprovalAt,
          )}
          .
        </p>

        {ticket.pendingOutcome ===
        "REJECTION" ? (
          <div className="observation-detail-body">
            <span>Your explanation</span>
            <p>{ticket.comments}</p>
          </div>
        ) : (
          <div className="observation-detail-body">
            <span>What you reported</span>
            <p>{ticket.resolutionComments}</p>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="ticket-action-panel">
      <h3>Ticket closed</h3>

      <p>
        {ticket.displayDecision} on{" "}
        {formatDate(ticket.closureDate)}
        {ticket.approvedByName
          ? `, approved by ${ticket.approvedByName}`
          : ""}
        .
      </p>

      {ticket.approvalComments ? (
        <div className="observation-detail-body">
          <span>EHS Officer's comments</span>
          <p>{ticket.approvalComments}</p>
        </div>
      ) : null}
    </section>
  );
}
