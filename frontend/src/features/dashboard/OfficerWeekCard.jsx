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
  updateZoneAssignment,
} from "../patrols/patrol.service.js";

import {
  formatDate,
  getErrorMessage,
} from "../../lib/errorMessage.js";

import UnitZoneSection from "./UnitZoneSection.jsx";

function getWeekHeading(week) {
  if (week.isCurrentWeek) {
    return "This week";
  }

  return week.isPastWeek
    ? "Past week"
    : "Upcoming week";
}

/**
 * What the card says when a week has no inspections. Pointing at the
 * roster upload only makes sense when no week has any.
 */
function EmptyWeekNote({
  week,
  canEdit,
  className = "officer-week-empty",
}) {
  const otherWeeksScheduled = Boolean(
    week?.previousWeekStart ||
      week?.nextWeekStart,
  );

  if (otherWeeksScheduled) {
    return (
      <div className={className}>
        <strong>
          No inspections are scheduled
          this week.
        </strong>
      </div>
    );
  }

  return (
    <div className={className}>
      <strong>
        No inspections are scheduled.
      </strong>

      {canEdit ? (
        <p>
          Upload the weekly roster on
          the{" "}
          <Link to="/plan">
            Plan page
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}

function WeekSummary({
  week,
  expandAction = null,
}) {
  return (
    <div className="weekly-summary-heading">
      <div>
        <span className="dashboard-eyebrow">
          Weekly plan
        </span>

        <h3>{getWeekHeading(week)}</h3>

        <p>
          {`Week ${week.fiscalWeek} · ${formatDate(
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

      {expandAction}
    </div>
  );
}

/**
 * The EHS Officer's weekly plan: one week of the plant's inspections,
 * expandable to every zone scheduled that week, grouped by unit. The
 * officer can move between weeks that have inspections and change a
 * zone's auditor and auditee, for one audit or for the rest of the
 * year.
 *
 * The week and its navigation come from useOfficerWeek, which
 * DashboardPage owns so that the week chosen and a save's confirmation
 * survive the page reloading around this card.
 */
export default function OfficerWeekCard({
  week,
  loading,
  error,
  successMessage,
  onSuccessMessageChange,
  onPreviousWeek,
  onNextWeek,
  onCurrentWeek,
  onReload,
  canEdit = true,
}) {
  /*
   * Deliberately not reset when the week changes, so the officer can
   * page through weeks with the zone plan open.
   */
  const [expanded, setExpanded] =
    useState(false);

  /*
   * A save reloads the week it was made in, so moving to another week
   * while it is in flight would be undone by that reload.
   */
  const [saving, setSaving] =
    useState(false);

  const [users, setUsers] = useState([]);
  const [lookupsError, setLookupsError] =
    useState("");

  useEffect(() => {
    /*
     * The Plant Head sees this card read-only and may not read the
     * planning lookups (docs/24 D15), so they are not asked for.
     */
    if (!canEdit) {
      return undefined;
    }

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
  }, [canEdit]);

  const zoneEditFromDate =
    week?.zoneEditFromDate ?? null;

  /*
   * A zone edit goes to the zone endpoint from the first date this
   * week allows; a one-off swap changes only the one audit. The
   * dashboard never sends applyToUpcoming: true.
   */
  const saveAssignment = useCallback(
    async ({
      scope,
      patrolId,
      zoneId,
      auditorId,
      auditeeId,
    }) => {
      onSuccessMessageChange("");
      setSaving(true);

      let result;

      try {
        result =
          scope === "ZONE"
            ? await updateZoneAssignment({
                zoneId,
                auditorId,
                auditeeId,
                fromDate:
                  zoneEditFromDate,
              })
            : await updatePatrolAssignment({
                patrolId,
                auditorId,
                auditeeId,
                applyToUpcoming: false,
              });
      } catch (requestError) {
        setSaving(false);

        return {
          error: getErrorMessage(
            requestError,
          ),
        };
      }

      onSuccessMessageChange(
        result?.message ??
          "The assignment was updated.",
      );

      await onReload();
      setSaving(false);

      return {};
    },
    [
      onReload,
      onSuccessMessageChange,
      zoneEditFromDate,
    ],
  );

  const alerts = (
    <>
      {successMessage ? (
        <Alert type="success">
          {successMessage}
        </Alert>
      ) : null}

      {error ? (
        <Alert
          type="error"
          title="Unable to load the inspection week"
        >
          {error}
        </Alert>
      ) : null}
    </>
  );

  if (!week) {
    return (
      <section className="upcoming-section">
        <div className="dashboard-section-heading">
          <div>
            <span className="dashboard-eyebrow">
              Weekly plan
            </span>

            <h2>Inspection week</h2>
          </div>
        </div>

        {alerts}

        <EmptyWeekNote
          week={week}
          canEdit={canEdit}
          className="empty-dashboard-card"
        />
      </section>
    );
  }

  const weekIsEmpty =
    week.totalAudits === 0;

  const navigationDisabled =
    loading || saving;

  return (
    <section className="upcoming-section">
      {alerts}

      <div className="patrol-planning-card officer-week-card">
        {weekIsEmpty ? (
          <div className="officer-week-summary">
            <WeekSummary week={week} />
          </div>
        ) : (
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
            <WeekSummary
              week={week}
              expandAction={
                <span className="weekly-expand-action">
                  {expanded
                    ? "Hide zone plan"
                    : "View zone plan"}

                  <span aria-hidden="true">
                    {expanded ? "↑" : "↓"}
                  </span>
                </span>
              }
            />
          </button>
        )}

        <div
          className="officer-week-nav"
          role="group"
          aria-label="Choose the inspection week"
        >
          <button
            type="button"
            className="button button-secondary"
            disabled={
              navigationDisabled ||
              !week.previousWeekStart
            }
            onClick={onPreviousWeek}
          >
            <span aria-hidden="true">←</span>
            Previous
          </button>

          <button
            type="button"
            className="button button-secondary"
            disabled={
              navigationDisabled ||
              week.isCurrentWeek
            }
            onClick={onCurrentWeek}
          >
            This week
          </button>

          <button
            type="button"
            className="button button-secondary"
            disabled={
              navigationDisabled ||
              !week.nextWeekStart
            }
            onClick={onNextWeek}
          >
            Next
            <span aria-hidden="true">→</span>
          </button>

          {loading ? (
            <span
              className="officer-week-nav-status"
              role="status"
            >
              Loading week...
            </span>
          ) : null}
        </div>

        {weekIsEmpty ? (
          <EmptyWeekNote
            week={week}
            canEdit={canEdit}
          />
        ) : expanded ? (
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
                zoneEditFromDate={
                  week.zoneEditFromDate
                }
                zoneEditToDate={
                  week.zoneEditToDate
                }
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
