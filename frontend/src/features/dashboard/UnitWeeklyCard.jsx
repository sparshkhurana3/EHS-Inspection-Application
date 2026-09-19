import { formatDate } from "../../lib/errorMessage.js";

import ZoneAssignmentRow from "./ZoneAssignmentRow.jsx";

/**
 * One unit the EHS Officer manages: its own next scheduled week,
 * expandable to the zones audited that week.
 */
export default function UnitWeeklyCard({
  unit,
  expanded,
  onToggle,
  users,
  onSaveAssignment,
}) {
  const hasUpcomingAudit = Boolean(
    unit.weekStart,
  );

  return (
    <div className="patrol-planning-card unit-weekly-card">
      <button
        type="button"
        className="weekly-summary-card"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`unit-${unit.unitId}-zones`}
      >
        <div className="weekly-summary-heading">
          <div>
            <span className="assignment-role-label">
              {unit.unitNumber
                ? `Unit ${unit.unitNumber}`
                : "Unit"}
            </span>

            <h3>{unit.unitName}</h3>

            <p>
              {hasUpcomingAudit
                ? `${formatDate(
                    unit.weekStart,
                  )} to ${formatDate(
                    unit.weekEnd,
                  )}`
                : "No upcoming audit scheduled"}
            </p>
          </div>

          <div className="weekly-summary-total">
            <strong>
              {unit.zones.length}
            </strong>
            <span>
              {unit.zones.length === 1
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
          id={`unit-${unit.unitId}-zones`}
          className="weekly-audit-list"
        >
          {unit.zones.length === 0 ? (
            <div className="weekly-list-empty">
              No zone audits are scheduled for
              this unit yet.
            </div>
          ) : (
            <>
              <div className="weekly-list-header">
                <span>Zone</span>
                <span>Date</span>
                <span>Auditor</span>
                <span>Auditee</span>
                <span>Status</span>
                <span />
              </div>

              <ul className="zone-assignment-list">
                {unit.zones.map((zone) => (
                  <ZoneAssignmentRow
                    key={zone.patrolId}
                    zone={zone}
                    users={users}
                    onSaveAssignment={
                      onSaveAssignment
                    }
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
