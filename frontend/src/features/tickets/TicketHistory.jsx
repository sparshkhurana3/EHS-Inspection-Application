import Alert from "../../components/Alert.jsx";
import LoadingSpinner from "../../components/LoadingSpinner.jsx";

import { formatDate } from "../../lib/errorMessage.js";

import { useTicketHistory } from "./useTickets.js";

export const TICKET_HISTORY_FILTERS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  {
    value: "pending_approval",
    label: "Pending approval",
  },
  { value: "closed", label: "Closed" },
];

const EMPTY_MESSAGES = {
  all: "No tickets were assigned to you in the last six months.",
  open: "No open tickets in the last six months.",
  in_progress:
    "No tickets are in progress from the last six months.",
  pending_approval:
    "No tickets are waiting on the EHS Officer.",
  closed:
    "No tickets were closed in the last six months.",
};

/**
 * Every ticket assigned to this HOD in the last six months, whatever
 * its status.
 */
export default function TicketHistory({
  filter,
  onFilterChange,
  onOpen,
}) {
  const { tickets, count, loading, error } =
    useTicketHistory(filter);

  return (
    <section className="ticket-history">
      <div className="dashboard-section-heading">
        <div>
          <h2>Past 6 months</h2>
        </div>

        <label className="observation-history-filter">
          Show
          <select
            value={filter}
            onChange={(event) =>
              onFilterChange(event.target.value)
            }
          >
            {TICKET_HISTORY_FILTERS.map(
              (option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ),
            )}
          </select>
        </label>
      </div>

      {error ? (
        <Alert
          type="error"
          title="Unable to load your ticket history"
        >
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <LoadingSpinner message="Loading tickets..." />
      ) : tickets.length === 0 ? (
        <p className="closure-empty-note">
          {EMPTY_MESSAGES[filter] ??
            EMPTY_MESSAGES.all}
        </p>
      ) : (
        <>
          <p className="dashboard-single-record">
            {count === 1
              ? "1 ticket"
              : `${count} tickets`}
          </p>

          <div className="weekly-audit-list">
            <div className="weekly-list-header ticket-history-row">
              <span>Assigned</span>
              <span>Report / observation</span>
              <span>Department</span>
              <span>Type of work</span>
              <span>Decision</span>
              <span>Status</span>
            </div>

            <ul className="zone-assignment-list">
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <div
                    className="weekly-list-row ticket-history-row zone-assignment-row"
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      onOpen(ticket.id)
                    }
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" ||
                        event.key === " "
                      ) {
                        event.preventDefault();
                        onOpen(ticket.id);
                      }
                    }}
                  >
                    <span data-label="Assigned">
                      {formatDate(
                        ticket.assignedAt,
                      )}
                    </span>

                    <span data-label="Report / observation">
                      <strong>
                        {ticket.reportNumber}
                      </strong>
                      <br />
                      {ticket.areaName ??
                        ticket.zoneName}
                    </span>

                    <span data-label="Department">
                      {ticket.departmentName ??
                        "Not recorded"}
                    </span>

                    <span data-label="Type of work">
                      {ticket.correctiveActionTypeName ??
                        "—"}
                    </span>

                    <span data-label="Decision">
                      {ticket.displayDecision ??
                        "—"}
                    </span>

                    <span data-label="Status">
                      <span
                        className={`weekly-status ticket-status-${String(
                          ticket.status,
                        ).toLowerCase()}`}
                      >
                        {ticket.displayStatus}
                      </span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
