const WEEKDAY_LABELS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];

function createDateKey(year, month, day) {
  return [
    String(year),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function getCalendarCells(year, month) {
  const firstDay = new Date(
    year,
    month - 1,
    1,
  );

  const lastDay = new Date(
    year,
    month,
    0,
  );

  /*
   * JavaScript uses Sunday = 0.
   * This calendar displays Monday first.
   */
  const leadingBlankCount =
    (firstDay.getDay() + 6) % 7;

  const cells = [];

  for (
    let index = 0;
    index < leadingBlankCount;
    index += 1
  ) {
    cells.push(null);
  }

  for (
    let day = 1;
    day <= lastDay.getDate();
    day += 1
  ) {
    cells.push({
      day,
      dateKey: createDateKey(
        year,
        month,
        day,
      ),
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

function getMonthLabel(year, month) {
  return new Intl.DateTimeFormat(
    "en-IN",
    {
      month: "long",
      year: "numeric",
    },
  ).format(
    new Date(year, month - 1, 1),
  );
}

function groupAuditsByDate(audits) {
  if (!Array.isArray(audits)) {
    return new Map();
  }

  return audits.reduce(
    (groupedAudits, audit) => {
      const date =
        audit.scheduledDate ??
        audit.scheduled_date;

      if (!date) {
        return groupedAudits;
      }

      const dateKey = String(date).slice(
        0,
        10,
      );

      const existingAudits =
        groupedAudits.get(dateKey) ?? [];

      groupedAudits.set(dateKey, [
        ...existingAudits,
        audit,
      ]);

      return groupedAudits;
    },
    new Map(),
  );
}

function getAuditRoleLabel(audit) {
  const assignmentRole = String(
    audit.assignmentRole ??
      audit.assignment_role ??
      "",
  ).toUpperCase();

  if (assignmentRole === "AUDITOR") {
    return "Auditor";
  }

  if (assignmentRole === "AUDITEE") {
    return "Auditee";
  }

  return "Assigned";
}

function getAuditIdentifier(audit, index) {
  return (
    audit.id ??
    audit.auditId ??
    audit.audit_id ??
    `${audit.scheduledDate ?? "audit"}-${index}`
  );
}

export default function PatrolCalendar({
  year,
  month,
  audits = [],
  onPreviousMonth,
  onNextMonth,
}) {
  const calendarCells =
    getCalendarCells(year, month);

  const auditsByDate =
    groupAuditsByDate(audits);

  const monthLabel =
    getMonthLabel(year, month);

  return (
    <section className="patrol-calendar-card">
      <header className="calendar-header">
        <div>
          <span className="dashboard-eyebrow">
            Assigned patrols
          </span>

          <h2>{monthLabel}</h2>
        </div>

        <div className="calendar-navigation">
          <button
            type="button"
            onClick={onPreviousMonth}
            aria-label="View previous month"
          >
            <span aria-hidden="true">←</span>
          </button>

          <button
            type="button"
            onClick={onNextMonth}
            aria-label="View next month"
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </header>

      <div
        className="calendar-grid"
        role="grid"
        aria-label={monthLabel}
      >
        {WEEKDAY_LABELS.map(
          (weekday) => (
            <div
              key={weekday}
              className="calendar-weekday"
              role="columnheader"
            >
              {weekday}
            </div>
          ),
        )}

        {calendarCells.map(
          (calendarCell, index) => {
            if (!calendarCell) {
              return (
                <div
                  key={`blank-${index}`}
                  className={
                    "calendar-day " +
                    "calendar-day-empty"
                  }
                  role="gridcell"
                  aria-hidden="true"
                />
              );
            }

            const dayAudits =
              auditsByDate.get(
                calendarCell.dateKey,
              ) ?? [];

            const visibleAudits =
              dayAudits.slice(0, 2);

            const additionalAuditCount =
              dayAudits.length -
              visibleAudits.length;

            const dayClassName = [
              "calendar-day",
              dayAudits.length > 0
                ? "calendar-day-has-audit"
                : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div
                key={calendarCell.dateKey}
                className={dayClassName}
                role="gridcell"
                aria-label={[
                  calendarCell.dateKey,
                  dayAudits.length === 1
                    ? "1 assigned audit"
                    : `${dayAudits.length} assigned audits`,
                ].join(", ")}
              >
                <span className="calendar-day-number">
                  {calendarCell.day}
                </span>

                <div className="calendar-day-audits">
                  {visibleAudits.map(
                    (audit, auditIndex) => (
                      <div
                        key={getAuditIdentifier(
                          audit,
                          auditIndex,
                        )}
                        className={
                          "calendar-audit-indicator"
                        }
                        title={
                          audit.zoneName ??
                          audit.zone_name ??
                          "Assigned audit"
                        }
                      >
                        <strong>
                          {audit.zoneName ??
                            audit.zone_name ??
                            "Zone"}
                        </strong>

                        <span>
                          {getAuditRoleLabel(
                            audit,
                          )}
                        </span>
                      </div>
                    ),
                  )}

                  {additionalAuditCount > 0 && (
                    <span className="calendar-more-audits">
                      +{additionalAuditCount} more
                    </span>
                  )}
                </div>
              </div>
            );
          },
        )}
      </div>
    </section>
  );
}