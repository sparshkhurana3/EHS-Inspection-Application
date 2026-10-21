import { formatReportDate } from "./reportFormat.js";

/**
 * A zone's year at a glance: one square per inspection week, green when
 * every audit that week was conducted and red when not. The week is
 * also written under each square, so colour is never the only signal.
 */
export default function ZoneWeekStrip({
  zoneName,
  weeks,
}) {
  if (weeks.length === 0) {
    return (
      <p className="closure-empty-note">
        No inspections were scheduled for this
        zone in this period.
      </p>
    );
  }

  return (
    <ul
      className="report-week-strip"
      aria-label={`Inspection weeks for ${zoneName}`}
    >
      {weeks.map((week) => {
        const done =
          week.conductedCount >=
          week.scheduledCount;

        const description = `Week ${week.isoWeek} (${formatReportDate(
          week.weekStart,
        )}): ${week.conductedCount} of ${
          week.scheduledCount
        } conducted`;

        return (
          <li
            key={week.weekStart}
            className="report-week"
            title={description}
          >
            <span
              className={`report-week-cell ${
                done
                  ? "report-status-done"
                  : "report-status-missed"
              }`}
              role="img"
              aria-label={description}
            />

            <small>W{week.isoWeek}</small>
          </li>
        );
      })}
    </ul>
  );
}
