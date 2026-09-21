import { formatDate } from "../../lib/errorMessage.js";

function TicketCard({ ticket, onOpen }) {
  return (
    <li>
      <button
        type="button"
        className={`closure-list-item ticket-list-item${
          ticket.isOverdue
            ? " ticket-overdue"
            : ""
        }`}
        onClick={() => onOpen(ticket.id)}
      >
        <span className="closure-list-main">
          <strong>
            {ticket.reportNumber ?? "Ticket"}
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
            {ticket.departmentName
              ? `${ticket.departmentName} · `
              : ""}
            Raised by {ticket.auditeeName}
          </span>

          {ticket.wasReopened ? (
            <span className="ticket-reopened-tag">
              Reopened by the EHS Officer
            </span>
          ) : null}
        </span>

        <span className="closure-list-meta">
          <span
            className={`observation-risk-code observation-risk-${ticket.riskCategory?.toLowerCase()}`}
          >
            {ticket.riskCategory}
          </span>

          <span>
            Target{" "}
            {formatDate(ticket.targetDate)}
            {ticket.isOverdue
              ? " (overdue)"
              : ""}
          </span>

          <span
            className={`closure-status-chip ticket-status-${ticket.status?.toLowerCase()}`}
          >
            {ticket.displayStatus}
          </span>
        </span>
      </button>
    </li>
  );
}

export default function TicketList({
  tickets,
  onOpen,
  emptyMessage,
}) {
  if (tickets.length === 0) {
    return (
      <p className="closure-empty-note">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="closure-list ticket-list">
      {tickets.map((ticket) => (
        <TicketCard
          key={ticket.id}
          ticket={ticket}
          onOpen={onOpen}
        />
      ))}
    </ul>
  );
}
