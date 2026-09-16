function formatDateRange(
  startDateValue,
  endDateValue,
) {
  if (!startDateValue || !endDateValue) {
    return "Date range not available";
  }

  const startDate = new Date(startDateValue);
  const endDate = new Date(endDateValue);

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime())
  ) {
    return `${startDateValue} to ${endDateValue}`;
  }

  const formatter = new Intl.DateTimeFormat(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    },
  );

  return `${formatter.format(
    startDate,
  )} to ${formatter.format(endDate)}`;
}

function getWeekLabel(week) {
  if (week.weekLabel) {
    return week.weekLabel;
  }

  if (week.week_label) {
    return week.week_label;
  }

  const weekNumber =
    week.weekNumber ??
    week.week_number;

  if (weekNumber) {
    return `Week ${weekNumber} audit`;
  }

  return "Upcoming weekly audit";
}

function getAuditIdentifier(
  audit,
  index,
) {
  return (
    audit.id ??
    audit.auditId ??
    audit.audit_id ??
    `weekly-audit-${index}`
  );
}

function formatAuditDate(dateValue) {
  if (!dateValue) {
    return "Not available";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return String(dateValue);
  }

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    },
  ).format(date);
}

export default function WeeklySummary({
  week,
  expanded,
  onToggle,
}) {
  if (!week) {
    return (
      <section className="upcoming-section">
        <div className="dashboard-section-heading">
          <div>
            <span className="dashboard-eyebrow">
              Weekly plan
            </span>

            <h2>Next upcoming week</h2>
          </div>
        </div>

        <div className="empty-dashboard-card">
          <strong>
            No upcoming weekly audit found
          </strong>

          <p>
            No weekly audit plan is available
            for the current selection.
          </p>
        </div>
      </section>
    );
  }

  const audits = Array.isArray(week.audits)
    ? week.audits
    : [];

  const weekLabel = getWeekLabel(week);

  const startDate =
    week.startDate ??
    week.start_date;

  const endDate =
    week.endDate ??
    week.end_date;

  const totalAudits =
    week.totalAudits ??
    week.total_audits ??
    audits.length;

  return (
    <section className="upcoming-section">
      <div className="dashboard-section-heading">
        <div>
          <span className="dashboard-eyebrow">
            Weekly plan
          </span>

          <h2>Next upcoming week</h2>
        </div>

        <span className="dashboard-single-record">
          Showing next week only
        </span>
      </div>

      <button
        type="button"
        className="weekly-summary-card"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls="weekly-audit-list"
      >
        <div className="weekly-summary-heading">
          <div>
            <span className="assignment-role-label">
              Upcoming weekly audit
            </span>

            <h3>{weekLabel}</h3>

            <p>
              {formatDateRange(
                startDate,
                endDate,
              )}
            </p>
          </div>

          <div className="weekly-summary-total">
            <strong>{totalAudits}</strong>
            <span>planned audits</span>
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

      {expanded && (
        <div
          id="weekly-audit-list"
          className="weekly-audit-list"
        >
          <div className="weekly-list-header">
            <span>Zone</span>
            <span>Area details</span>
            <span>Auditor</span>
            <span>Auditee</span>
            <span>Date</span>
            <span>Status</span>
          </div>

          {audits.length === 0 ? (
            <div className="weekly-list-empty">
              No zone-wise audits were returned
              for this week.
            </div>
          ) : (
            audits.map((audit, index) => {
              const zoneName =
                audit.zoneName ??
                audit.zone_name ??
                "Not available";

              const areaDetail =
                audit.areaDetail ??
                audit.area_detail ??
                "Not available";

              const auditorName =
                audit.auditorName ??
                audit.auditor_name ??
                "Not assigned";

              const auditeeName =
                audit.auditeeName ??
                audit.auditee_name ??
                "Not assigned";

              const scheduledDate =
                audit.scheduledDate ??
                audit.scheduled_date;

              const status =
                audit.status ??
                "Scheduled";

              return (
                <div
                  key={getAuditIdentifier(
                    audit,
                    index,
                  )}
                  className="weekly-list-row"
                >
                  <span
                    data-label="Zone"
                    className="weekly-zone-name"
                  >
                    {zoneName}
                  </span>

                  <span data-label="Area details">
                    {areaDetail}
                  </span>

                  <span data-label="Auditor">
                    {auditorName}
                  </span>

                  <span data-label="Auditee">
                    {auditeeName}
                  </span>

                  <span data-label="Date">
                    {formatAuditDate(
                      scheduledDate,
                    )}
                  </span>

                  <span data-label="Status">
                    <span className="weekly-status">
                      {status}
                    </span>
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}