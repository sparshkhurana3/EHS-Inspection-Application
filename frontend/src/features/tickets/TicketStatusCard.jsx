import {
  useEffect,
  useRef,
  useState,
} from "react";

import { formatDate } from "../../lib/errorMessage.js";

import {
  fetchTicketEvidenceBlob,
} from "./ticket.service.js";

function Field({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || "Not recorded"}</strong>
    </div>
  );
}

/**
 * Loads each evidence photograph as an authenticated blob and keeps the
 * resulting object URLs, revoking them on unmount or when the ticket
 * changes. Evidence is served through an authenticated route (like
 * observation photographs), so a plain <img src> cannot be used.
 */
function useEvidencePreviews(ticket) {
  const [previews, setPreviews] = useState({});
  const urlsRef = useRef([]);

  useEffect(() => {
    urlsRef.current.forEach((url) =>
      URL.revokeObjectURL(url),
    );
    urlsRef.current = [];
    setPreviews({});

    const evidence = ticket?.evidence ?? [];

    if (!ticket?.id || evidence.length === 0) {
      return undefined;
    }

    let cancelled = false;

    Promise.all(
      evidence.map((item) =>
        fetchTicketEvidenceBlob({
          ticketId: ticket.id,
          evidenceId: item.id,
        })
          .then((blob) => [
            item.id,
            URL.createObjectURL(blob),
          ])
          .catch(() => [item.id, null]),
      ),
    ).then((entries) => {
      if (cancelled) {
        return;
      }

      const urls = entries
        .map(([, url]) => url)
        .filter(Boolean);

      urlsRef.current = urls;

      setPreviews(
        Object.fromEntries(entries),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [ticket?.id, ticket?.evidence]);

  useEffect(
    () => () => {
      urlsRef.current.forEach((url) =>
        URL.revokeObjectURL(url),
      );
    },
    [],
  );

  return previews;
}

/**
 * Read-only view of the Action Team HOD's ticket, shown on the
 * auditee's closure detail and the EHS Officer's approval panel. The
 * ticket is always embedded on the closure response, so no request is
 * made here except to load evidence thumbnails.
 */
export default function TicketStatusCard({
  ticket,
}) {
  const previews = useEvidencePreviews(ticket);

  if (!ticket) {
    return (
      <section className="closure-action-plan">
        <h3>Corrective action ticket</h3>

        <p className="closure-empty-note">
          No ticket has been raised for this
          plan yet.
        </p>
      </section>
    );
  }

  return (
    <section className="closure-action-plan ticket-status-card">
      <header className="observation-section-header">
        <h3>Corrective action ticket</h3>

        <span
          className={`closure-status-chip ticket-status-${ticket.status?.toLowerCase()}`}
        >
          {ticket.displayStatus}
        </span>
      </header>

      <div className="closure-detail-grid">
        <Field
          label="Assigned to"
          value={ticket.actionHodName}
        />

        <Field
          label="Assigned"
          value={formatDate(
            ticket.assignedAt,
          )}
        />

        <Field
          label="Target date"
          value={formatDate(
            ticket.targetDate,
          )}
        />

        {ticket.displayDecision ? (
          <Field
            label="Decision"
            value={ticket.displayDecision}
          />
        ) : null}

        {ticket.correctiveActionTypeName ? (
          <Field
            label="Corrective action type"
            value={
              ticket.correctiveActionTypeName
            }
          />
        ) : null}

        {ticket.closureDate ? (
          <Field
            label="Closed"
            value={formatDate(
              ticket.closureDate,
            )}
          />
        ) : null}
      </div>

      <div className="observation-detail-body">
        <span>Proposed action plan</span>
        <p>{ticket.proposedActionPlan}</p>
      </div>

      {ticket.comments ? (
        <div className="observation-detail-body">
          <span>Comments</span>
          <p>{ticket.comments}</p>
        </div>
      ) : null}

      {ticket.completionNotes ? (
        <div className="observation-detail-body">
          <span>Completion notes</span>
          <p>{ticket.completionNotes}</p>
        </div>
      ) : null}

      {ticket.evidence?.length > 0 ? (
        <div className="ticket-evidence-grid">
          {ticket.evidence.map((item) => (
            <div
              key={item.id}
              className="ticket-evidence-item"
            >
              {previews[item.id] ? (
                <img
                  src={previews[item.id]}
                  alt={
                    item.originalName ??
                    "Evidence photograph"
                  }
                />
              ) : (
                <p className="closure-empty-note">
                  Loading...
                </p>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
