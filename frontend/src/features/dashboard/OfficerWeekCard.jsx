import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { Link } from "react-router-dom";

import Alert from "../../components/Alert.jsx";

import {
  fetchPlanningLookups,
  updatePatrolAssignment,
} from "../patrols/patrol.service.js";

import {
  formatDate,
  getErrorMessage,
} from "../../lib/errorMessage.js";

import UnitZoneSection from "./UnitZoneSection.jsx";

/**
 * The EHS Officer's "Next scheduled weekly audit": one card for the
 * plant's single upcoming inspection week, expandable to every zone
 * scheduled that week, grouped by unit.
 */
export default function OfficerWeekCard({
  week,
  onAssignmentChanged,
}) {
  const [expanded, setExpanded] =
    useState(false);

  const [users, setUsers] = useState([]);
  const [lookupsError, setLookupsError] =
    useState("");

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

  const saveAssignment = useCallback(
    async ({
      patrolId,
      auditorId,
      auditeeId,
      applyToUpcoming,
    }) => {
      try {
        const result =
          await updatePatrolAssignment({
            patrolId,
            auditorId,
            auditeeId,
            applyToUpcoming,
          });

        await onAssignmentChanged?.();

        return {
          message: result?.message,
        };
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

  if (!week) {
    return (
      <section className="upcoming-section">
        <div className="dashboard-section-heading">
          <div>
            <span className="dashboard-eyebrow">
              Weekly plan
            </span>

            <h2>
              Upcoming inspection week
            </h2>
          </div>
        </div>

        <div className="empty-dashboard-card">
          <strong>
            No inspections are scheduled
          </strong>

          <p>
            Upload the weekly roster on
            the{" "}
            <Link to="/plan">
              Plan page
            </Link>
            .
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="upcoming-section">
      <div className="patrol-planning-card officer-week-card">
        <button
          type="button"
          className="weekly-summary-card"
          onClick={() =>
            setExpanded(
              (current) => !current,
            )
          }
          aria-expanded={expanded}
          aria-controls="officer-week-zones"
        >
          <div className="weekly-summary-heading">
            <div>
              <span className="dashboard-eyebrow">
                Weekly plan
              </span>

              <h3>
                Upcoming inspection week
              </h3>

              <p>
                {`${formatDate(
                  week.weekStart,
                )} to ${formatDate(
                  week.weekEnd,
                )}`}
              </p>
            </div>

            <div className="weekly-summary-total">
              <strong>
                {week.totalAudits}
              </strong>
              <span>
                {week.totalAudits === 1
                  ? "zone audit"
                  : "zone audits"}
              </span>
            </div>

            <span className="weekly-expand-action">
              {expanded
                ? "Hide zone plan"
                : "View zone plan"}

              <span aria-hidden="true">
                {expanded ? "↑" : "↓"}
              </span>
            </span>
          </div>
        </button>

        {expanded ? (
          <div
            id="officer-week-zones"
            className="weekly-audit-list"
          >
            {lookupsError ? (
              <Alert type="error">
                {lookupsError}
              </Alert>
            ) : null}

            {week.units.map((unit) => (
              <UnitZoneSection
                key={unit.unitId}
                unit={unit}
                users={users}
                onSaveAssignment={
                  saveAssignment
                }
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
