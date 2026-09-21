import {
  formatDate,
} from "../../lib/errorMessage.js";

/**
 * The officer's current roster: one row per zone, with its auditor,
 * auditee, and how many SCHEDULED future audits still carry it.
 */
export default function RosterTable({
  roster,
}) {
  const rows = roster?.rows ?? [];

  return (
    <div className="roster-table">
      <div className="dashboard-section-heading">
        <div>
          <h3>Current roster</h3>
        </div>

        {roster?.effectiveFrom ? (
          <span className="dashboard-single-record">
            {`Effective ${formatDate(
              roster.effectiveFrom,
            )} to ${formatDate(
              roster.effectiveTo,
            )}`}
          </span>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="closure-empty-note">
          No roster has been uploaded yet.
        </p>
      ) : (
        <>
          <div className="weekly-list-header">
            <span>Unit</span>
            <span>Zone</span>
            <span>Auditor</span>
            <span>Auditee</span>
            <span>Upcoming audits</span>
          </div>

          <ul className="zone-assignment-list">
            {rows.map((row) => (
              <li
                className="weekly-list-row"
                key={row.id}
              >
                <span data-label="Unit">
                  {row.unitName}
                </span>

                <span data-label="Zone">
                  {row.zoneName}
                </span>

                <span data-label="Auditor">
                  {row.auditorName}
                </span>

                <span data-label="Auditee">
                  {row.auditeeName}
                </span>

                <span data-label="Upcoming audits">
                  {row.upcomingCount}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
