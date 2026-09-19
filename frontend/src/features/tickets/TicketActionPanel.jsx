import Alert from "../../components/Alert.jsx";

import { formatDate } from "../../lib/errorMessage.js";

import EvidenceInput from "./EvidenceInput.jsx";

import {
  useCloseTicket,
  useTicketDecision,
  useTicketEvidence,
  useTicketLookups,
} from "./useTickets.js";

/**
 * The Action Team HOD's half of a ticket: decide (while OPEN), attach
 * evidence and close (while IN_PROGRESS), or a read-only summary once
 * CLOSED.
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

  const closeForm = useCloseTicket(
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
            Type of corrective action
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
            reject.
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
              : "Reject and close"}
          </button>
        </div>
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

        <div className="form-field">
          <label htmlFor="completion-notes">
            Completion notes (optional)
          </label>

          <textarea
            id="completion-notes"
            rows="4"
            value={
              closeForm.completionNotes
            }
            disabled={closeForm.closing}
            onChange={(event) =>
              closeForm.setCompletionNotes(
                event.target.value,
              )
            }
          />
        </div>

        {closeForm.error ? (
          <Alert type="error">
            {closeForm.error}
          </Alert>
        ) : null}

        <button
          type="button"
          className="button button-primary"
          disabled={
            closeForm.closing ||
            !ticket.canClose
          }
          title={
            ticket.canClose
              ? undefined
              : "Attach at least one evidence photograph first."
          }
          onClick={closeForm.close}
        >
          {closeForm.closing
            ? "Closing..."
            : "Close ticket"}
        </button>
      </section>
    );
  }

  return (
    <section className="ticket-action-panel">
      <h3>Ticket closed</h3>

      <p>
        {ticket.displayDecision} on{" "}
        {formatDate(ticket.closureDate)}.
      </p>
    </section>
  );
}
