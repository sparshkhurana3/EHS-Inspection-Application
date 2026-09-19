import Alert from "../../components/Alert.jsx";
import LoadingSpinner from "../../components/LoadingSpinner.jsx";

import { formatDate } from "../../lib/errorMessage.js";

import ObservationSummary from "../closures/ObservationSummary.jsx";
import { useClosureDetail } from "../closures/useClosures.js";

import TicketStatusCard from "../tickets/TicketStatusCard.jsx";

/**
 * Everything filed against one zone's audit so far: the observation
 * report, the action plan, and the Action Team HOD's ticket. Read-only
 * — this is the EHS Officer reviewing progress, not acting on it, so it
 * reuses the same display components the auditee and the HOD see
 * rather than a new edit form.
 */
export default function ZoneProgressDetail({
  closureId,
}) {
  const {
    closure,
    photograph,
    loading,
    error,
  } = useClosureDetail(closureId);

  if (loading) {
    return (
      <LoadingSpinner message="Loading audit progress..." />
    );
  }

  if (error || !closure) {
    return (
      <Alert
        type="error"
        title="Unable to load this audit"
      >
        {error || "The audit was not found."}
      </Alert>
    );
  }

  return (
    <div className="zone-progress-detail">
      <ObservationSummary
        closure={closure}
        photograph={photograph}
      />

      <section className="closure-action-plan">
        <h3>Action plan</h3>

        <div className="closure-detail-grid">
          <div>
            <span>Assigned to</span>
            <strong>
              {closure.actionHodName ??
                closure.responsibleHodName ??
                "Not yet assigned"}
            </strong>
          </div>

          <div>
            <span>Target date</span>
            <strong>
              {formatDate(closure.targetDate)}
            </strong>
          </div>

          <div>
            <span>Status</span>
            <strong>
              {closure.displayStatus}
            </strong>
          </div>
        </div>

        <div className="observation-detail-body">
          <span>Action plan</span>
          <p>
            {closure.actionPlan ??
              "Not yet submitted."}
          </p>
        </div>
      </section>

      <TicketStatusCard
        ticket={closure.ticket}
      />
    </div>
  );
}
