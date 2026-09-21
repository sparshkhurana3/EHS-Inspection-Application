import { useState } from "react";

import Alert from "../../components/Alert.jsx";
import LoadingSpinner from "../../components/LoadingSpinner.jsx";

import { formatDate } from "../../lib/errorMessage.js";

import TicketStatusCard from "../tickets/TicketStatusCard.jsx";
import { useTicketApprovals } from "../tickets/useTickets.js";

/**
 * The EHS Officer decides what the Action Team HOD sent: approve and
 * close the ticket, or send it back for the HOD to redo. Reopening
 * deletes the photographs they attached, so it is confirmed first.
 */
function TicketApprovalPanel({
  ticket,
  busy,
  onApprove,
  onReopen,
}) {
  const [comments, setComments] = useState("");
  const [localError, setLocalError] =
    useState("");

  function handleReopen() {
    if (!comments.trim()) {
      setLocalError(
        "Explain what the Action Team HOD needs to redo.",
      );

      return;
    }

    const confirmed = window.confirm(
      "Reopen this ticket? The evidence photographs and everything the Action Team HOD recorded will be deleted, and they will start again.",
    );

    if (!confirmed) {
      return;
    }

    setLocalError("");
    onReopen(ticket.id, comments);
  }

  return (
    <section className="ticket-action-panel">
      <h3>
        {ticket.pendingOutcome === "REJECTION"
          ? "Approve this rejection?"
          : "Approve this resolution?"}
      </h3>

      <p className="closure-empty-note">
        {ticket.pendingOutcome === "REJECTION"
          ? "Approving closes the ticket as rejected, and it stays attached to the closure and the observation."
          : "Approving closes the ticket as completed. Reopening clears what the HOD attached and sends it back."}
      </p>

      {localError ? (
        <Alert type="error">
          {localError}
        </Alert>
      ) : null}

      <div className="form-field">
        <label htmlFor="ticket-approval-comments">
          Comments
        </label>

        <textarea
          id="ticket-approval-comments"
          rows="3"
          value={comments}
          disabled={busy}
          onChange={(event) => {
            setLocalError("");
            setComments(event.target.value);
          }}
        />

        <span className="form-field-help">
          Optional to approve, required to
          reopen.
        </span>
      </div>

      <div className="ticket-approval-actions">
        <button
          type="button"
          className="button button-primary"
          disabled={busy}
          onClick={() =>
            onApprove(ticket.id, comments)
          }
        >
          {busy
            ? "Working..."
            : "Approve and close"}
        </button>

        <button
          type="button"
          className="button button-secondary"
          disabled={busy}
          onClick={handleReopen}
        >
          {busy
            ? "Working..."
            : "Reopen and send back"}
        </button>
      </div>
    </section>
  );
}

export default function TicketApprovalQueuePage() {
  const {
    tickets,
    loading,
    busy,
    error,
    approve,
    reopen,
  } = useTicketApprovals();

  const [selectedId, setSelectedId] =
    useState(null);

  const selected =
    tickets.find(
      (ticket) =>
        String(ticket.id) ===
        String(selectedId),
    ) ?? null;

  if (loading) {
    return (
      <LoadingSpinner message="Loading tickets awaiting approval..." />
    );
  }

  return (
    <section className="closure-approval-queue-page">
      {error ? (
        <Alert
          type="error"
          title="Unable to review tickets"
        >
          {error}
        </Alert>
      ) : null}

      {tickets.length === 0 ? (
        <p className="closure-empty-note">
          No tickets are waiting for your
          decision.
        </p>
      ) : (
        <ul className="closure-list">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <button
                type="button"
                className={`closure-list-item${
                  String(ticket.id) ===
                  String(selectedId)
                    ? " closure-list-item-selected"
                    : ""
                }`}
                onClick={() =>
                  setSelectedId(ticket.id)
                }
              >
                <span className="closure-list-main">
                  <strong>
                    {ticket.reportNumber}
                  </strong>

                  <span>
                    {[
                      ticket.unitName,
                      ticket.zoneName,
                      ticket.areaName,
                    ]
                      .filter(Boolean)
                      .join(" / ")}
                  </span>

                  <span>
                    {ticket.departmentName} ·{" "}
                    {ticket.actionHodName}
                  </span>
                </span>

                <span className="closure-list-meta">
                  <span>
                    Sent{" "}
                    {formatDate(
                      ticket.submittedForApprovalAt,
                    )}
                  </span>

                  <span className="closure-status-chip ticket-status-pending_approval">
                    {ticket.pendingOutcome ===
                    "REJECTION"
                      ? "Rejection"
                      : "Resolution"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected ? (
        <>
          <TicketStatusCard
            ticket={selected}
          />

          <TicketApprovalPanel
            ticket={selected}
            busy={busy}
            onApprove={async (id, comments) => {
              await approve(id, comments);
              setSelectedId(null);
            }}
            onReopen={async (id, comments) => {
              await reopen(id, comments);
              setSelectedId(null);
            }}
          />
        </>
      ) : null}
    </section>
  );
}
