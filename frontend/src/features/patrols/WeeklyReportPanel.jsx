import Alert from "../../components/Alert.jsx";

import { formatDate } from "../../lib/errorMessage.js";

/**
 * The Plan page's weekly report: pick an inspection week and download
 * it as a PDF.
 */
export default function WeeklyReportPanel({
  locationName,
  weeks,
  selectedWeekStart,
  loading,
  downloading,
  error,
  onSelectWeek,
  onDownload,
}) {
  return (
    <section className="roster-panel">
      <header className="observation-section-header">
        <div>
          <span className="dashboard-eyebrow">
            Weekly report
          </span>

          <h2>
            Download a week&apos;s inspection
            report
          </h2>

          <p>
            Every zone scheduled at{" "}
            {locationName} that week, with its
            observations and closures, as a PDF.
          </p>
        </div>
      </header>

      <div className="roster-controls">
        <label className="observation-history-filter">
          Week

          <select
            value={selectedWeekStart}
            onChange={(event) =>
              onSelectWeek(event.target.value)
            }
            disabled={
              loading ||
              downloading ||
              weeks.length === 0
            }
          >
            {weeks.map((week) => (
              <option
                key={week.weekStart}
                value={week.weekStart}
              >
                {`W${week.isoWeek} ${
                  week.isoYear
                } · ${formatDate(
                  week.weekStart,
                )} to ${formatDate(
                  week.weekEnd,
                )} · ${week.reportCount} of ${
                  week.zoneCount
                } inspected`}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="button button-primary"
          onClick={onDownload}
          disabled={
            !selectedWeekStart || downloading
          }
        >
          {downloading
            ? "Preparing..."
            : "Download PDF"}
        </button>
      </div>

      {error ? (
        <Alert
          type="error"
          title="Unable to download the weekly report"
        >
          {error}
        </Alert>
      ) : null}

      {!loading && weeks.length === 0 && !error ? (
        <p className="closure-empty-note">
          No inspections have been scheduled at
          your location in the last year.
        </p>
      ) : null}
    </section>
  );
}
