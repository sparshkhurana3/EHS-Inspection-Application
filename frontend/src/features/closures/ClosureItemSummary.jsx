import { formatDate } from "../../lib/errorMessage.js";

import TicketStatusCard from "../tickets/TicketStatusCard.jsx";

function Field({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || "Not recorded"}</strong>
    </div>
  );
}

/**
 * Read-only view of one observation's action plan and the ticket the
 * department is working on it. Used by the EHS Officer's approval panel
 * and the officer's zone progress view, which both show the closure
 * without editing it.
 */
export default function ClosureItemSummary({
  item,
  total,
}) {
  return (
    <section className="closure-item-card">
      <header className="observation-section-header">
        <div>
          <h3>
            Observation {item.sequenceNumber}
            {total ? ` of ${total}` : ""}
          </h3>

          <p>
            {[
              item.observation?.areaName,
              item.observation?.category,
              item.observation?.riskCategory
                ? `${item.observation.riskCategory} risk`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        {item.ticketDisplayStatus ? (
          <span
            className={`closure-status-chip ticket-status-${String(
              item.ticket?.status ?? "",
            ).toLowerCase()}`}
          >
            Ticket: {item.ticketDisplayStatus}
          </span>
        ) : null}
      </header>

      <div className="closure-detail-grid">
        <Field
          label="Assigned to"
          value={
            item.departmentName
              ? `${item.departmentName}${
                  item.actionHodName
                    ? ` — ${item.actionHodName}`
                    : ""
                }`
              : item.actionHodName
          }
        />
        <Field
          label="Target date"
          value={formatDate(item.targetDate)}
        />
        <Field
          label="Plan saved"
          value={formatDate(
            item.actionPlanSavedAt,
          )}
        />
      </div>

      <div className="observation-detail-body">
        <span>What was observed</span>
        <p>
          {item.observation?.description ??
            "Not recorded"}
        </p>
      </div>

      <div className="observation-detail-body">
        <span>Action plan</span>
        <p>
          {item.actionPlan ??
            "Not yet submitted."}
        </p>
      </div>

      <TicketStatusCard ticket={item.ticket} />
    </section>
  );
}
