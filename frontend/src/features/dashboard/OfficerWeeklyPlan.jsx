import {
  useCallback,
  useEffect,
  useState,
} from "react";

import Alert from "../../components/Alert.jsx";

import {
  fetchPlanningLookups,
  updatePatrolAssignment,
} from "../patrols/patrol.service.js";

import {
  getErrorMessage,
} from "../../lib/errorMessage.js";

import UnitWeeklyCard from "./UnitWeeklyCard.jsx";

/**
 * The EHS Officer's "Next Scheduled Weekly Audit": one card per unit
 * they manage, each expandable to that unit's own next scheduled week.
 */
export default function OfficerWeeklyPlan({
  units,
  onAssignmentChanged,
}) {
  const [users, setUsers] = useState([]);
  const [lookupsError, setLookupsError] =
    useState("");

  const [expandedUnitIds, setExpandedUnitIds] =
    useState(() => new Set());

  useEffect(() => {
    let cancelled = false;

    fetchPlanningLookups()
      .then((result) => {
        if (!cancelled) {
          setUsers(result?.users ?? []);
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setLookupsError(
            getErrorMessage(requestError),
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const toggleUnit = useCallback((unitId) => {
    setExpandedUnitIds((current) => {
      const next = new Set(current);

      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }

      return next;
    });
  }, []);

  const saveAssignment = useCallback(
    async ({ patrolId, auditorId, auditeeId }) => {
      try {
        await updatePatrolAssignment({
          patrolId,
          auditorId,
          auditeeId,
        });

        await onAssignmentChanged?.();

        return {};
      } catch (requestError) {
        return {
          error: getErrorMessage(
            requestError,
          ),
        };
      }
    },
    [onAssignmentChanged],
  );

  if (units.length === 0) {
    return (
      <section className="upcoming-section">
        <div className="dashboard-section-heading">
          <div>
            <span className="dashboard-eyebrow">
              Weekly plan
            </span>

            <h2>
              Next scheduled weekly audit
            </h2>
          </div>
        </div>

        <div className="empty-dashboard-card">
          <strong>No units found</strong>

          <p>
            No units are configured for your
            location yet.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="upcoming-section">
      <div className="dashboard-section-heading">
        <div>
          <span className="dashboard-eyebrow">
            Weekly plan
          </span>

          <h2>
            Next scheduled weekly audit
          </h2>
        </div>

        <span className="dashboard-single-record">
          {units.length === 1
            ? "1 unit"
            : `${units.length} units`}
        </span>
      </div>

      {lookupsError ? (
        <Alert type="error">
          {lookupsError}
        </Alert>
      ) : null}

      <div className="unit-weekly-card-grid">
        {units.map((unit) => (
          <UnitWeeklyCard
            key={unit.unitId}
            unit={unit}
            users={users}
            expanded={expandedUnitIds.has(
              unit.unitId,
            )}
            onToggle={() =>
              toggleUnit(unit.unitId)
            }
            onSaveAssignment={saveAssignment}
          />
        ))}
      </div>
    </section>
  );
}
