import Alert from "../../components/Alert.jsx";
import LoadingSpinner from "../../components/LoadingSpinner.jsx";

import ObservationSummary from "../closures/ObservationSummary.jsx";
import { useClosureDetail } from "../closures/useClosures.js";

import ClosureItemSummary from "../closures/ClosureItemSummary.jsx";

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
    photographs,
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
        photographs={photographs}
      />

      {(closure.items ?? []).length === 0 ? (
        <section className="closure-action-plan">
          <h3>Action plan</h3>

          <p className="closure-empty-note">
            No action plan has been proposed yet.
          </p>
        </section>
      ) : (
        closure.items.map((item) => (
          <ClosureItemSummary
            key={item.id}
            item={item}
            total={closure.items.length}
          />
        ))
      )}

    </div>
  );
}
