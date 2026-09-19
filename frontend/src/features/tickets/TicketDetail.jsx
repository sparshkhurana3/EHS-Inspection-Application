import Alert from "../../components/Alert.jsx";
import LoadingSpinner from "../../components/LoadingSpinner.jsx";

import { formatDate } from "../../lib/errorMessage.js";

import ObservationSummary from "../closures/ObservationSummary.jsx";

import TicketActionPanel from "./TicketActionPanel.jsx";

import { useTicketDetail } from "./useTickets.js";

/**
 * One ticket: what was found (reusing the closure page's observation
 * summary), the proposed plan, and the HOD's own action panel.
 */
export default function TicketDetail({
  ticketId,
  onBack,
}) {
  const {
    ticket,
    photograph,
    evidenceUrls,
    loading,
    error,
    reload,
  } = useTicketDetail(ticketId);

  if (loading) {
    return (
      <LoadingSpinner message="Loading ticket..." />
    );
  }

  if (error || !ticket) {
    return (
      <>
        <Alert
          type="error"
          title="Unable to load the ticket"
        >
          {error || "The ticket was not found."}
        </Alert>

        <button
          type="button"
          className="button button-secondary"
          onClick={onBack}
        >
          Back to tickets
        </button>
      </>
    );
  }

  /*
   * ObservationSummary expects a closure-shaped object; the ticket
   * response carries the same observation fields under the same names,
   * so it is passed through directly.
   */
  const observation = {
    reportNumber: ticket.reportNumber,
    findingDate: ticket.findingDate,
    plantLocation: ticket.plantLocation,
    unitName: ticket.unitName,
    zoneName: ticket.zoneName,
    areaName: ticket.areaName,
    category: ticket.category,
    riskCategory: ticket.riskCategory,
    auditorName: ticket.auditorName,
    observationDescription:
      ticket.observationDescription,
  };

  return (
    <section className="closure-page">
      <header className="observation-section-header">
        <div>
          <span className="dashboard-eyebrow">
            Action Team workflow
          </span>

          <h1>
            {ticket.reportNumber ?? "Ticket"}
          </h1>
        </div>

        <button
          type="button"
          className="button button-secondary"
          onClick={onBack}
        >
          Back
        </button>
      </header>

      <ObservationSummary
        closure={observation}
        photograph={photograph}
      />

      <section className="closure-action-plan">
        <header className="observation-section-header">
          <h3>Proposed action plan</h3>

          <span
            className={`closure-status-chip ticket-status-${ticket.status?.toLowerCase()}`}
          >
            {ticket.displayStatus}
          </span>
        </header>

        <div className="closure-detail-grid">
          <div>
            <span>Assigned to</span>
            <strong>
              {ticket.actionHodName}
            </strong>
          </div>

          <div>
            <span>Target date</span>
            <strong>
              {formatDate(ticket.targetDate)}
            </strong>
          </div>
        </div>

        <div className="observation-detail-body">
          <span>Action plan</span>
          <p>{ticket.proposedActionPlan}</p>
        </div>
      </section>

      <TicketActionPanel
        ticket={ticket}
        evidenceUrls={evidenceUrls}
        onChanged={reload}
      />
    </section>
  );
}
