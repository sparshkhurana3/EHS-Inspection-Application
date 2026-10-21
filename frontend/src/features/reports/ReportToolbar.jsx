import {
  formatReportDate,
  weekLabel,
} from "./reportFormat.js";

const TABS = [
  { value: "weekly", label: "Weekly" },
  { value: "yearly", label: "Yearly" },
];

/**
 * Report type, period, Generate and Download. The period only takes
 * effect when Generate is pressed; Download works without a generated
 * report and always saves the full report.
 */
export default function ReportToolbar({
  tab,
  onTabChange,
  weeks,
  years,
  selectedWeek,
  selectedYear,
  currentYear,
  onSelectWeek,
  onSelectYear,
  jumpWeek,
  jumpYear,
  onJumpWeekChange,
  onJumpYearChange,
  canGenerate,
  generating,
  downloading,
  onGenerate,
  onDownload,
}) {
  const jumpIncomplete =
    (jumpWeek === "") !== (jumpYear === "");

  return (
    <section className="roster-panel report-toolbar">
      <div
        className="observation-tabs report-tabs"
        role="tablist"
      >
        {TABS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            role="tab"
            aria-selected={tab === entry.value}
            className={`observation-tab${
              tab === entry.value
                ? " observation-tab-active"
                : ""
            }`}
            onClick={() =>
              onTabChange(entry.value)
            }
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="roster-controls">
        {tab === "weekly" ? (
          <>
            <label className="observation-history-filter">
              Week

              <select
                value={selectedWeek}
                onChange={(event) =>
                  onSelectWeek(
                    event.target.value,
                  )
                }
                disabled={
                  weeks.length === 0 ||
                  generating
                }
              >
                {weeks.length === 0 ? (
                  <option value="">
                    No weeks available
                  </option>
                ) : null}

                {weeks.map((week) => (
                  <option
                    key={week.weekStart}
                    value={week.weekStart}
                  >
                    {`${weekLabel(week)}${
                      week.zoneCount !==
                      undefined
                        ? ` · ${week.reportCount} of ${week.zoneCount} inspected`
                        : ""
                    }`}
                  </option>
                ))}
              </select>
            </label>

            <span className="observation-history-filter">
              or go to week

              <input
                type="number"
                min="1"
                max="53"
                inputMode="numeric"
                className="report-jump-input"
                aria-label="ISO week number"
                placeholder="14"
                value={jumpWeek}
                onChange={(event) =>
                  onJumpWeekChange(
                    event.target.value,
                  )
                }
                disabled={generating}
              />

              of

              <input
                type="number"
                min="2000"
                max="2999"
                inputMode="numeric"
                className="report-jump-input report-jump-input-year"
                aria-label="Year"
                placeholder="2024"
                value={jumpYear}
                onChange={(event) =>
                  onJumpYearChange(
                    event.target.value,
                  )
                }
                disabled={generating}
              />
            </span>
          </>
        ) : (
          <label className="observation-history-filter">
            Year

            <select
              value={selectedYear}
              onChange={(event) =>
                onSelectYear(
                  event.target.value,
                )
              }
              disabled={
                years.length === 0 ||
                generating
              }
            >
              {years.map((entry) => (
                <option
                  key={entry.year}
                  value={entry.year}
                >
                  {entry.year === currentYear
                    ? `${entry.year} (year to date)`
                    : entry.year}
                </option>
              ))}
            </select>
          </label>
        )}

        <button
          type="button"
          className="button button-primary"
          onClick={onGenerate}
          disabled={
            !canGenerate ||
            generating ||
            jumpIncomplete
          }
        >
          {generating
            ? "Generating..."
            : "Generate report"}
        </button>

        <button
          type="button"
          className="button button-secondary"
          onClick={onDownload}
          disabled={
            !canGenerate ||
            downloading ||
            jumpIncomplete
          }
        >
          {downloading
            ? "Preparing..."
            : "Download PDF (full report)"}
        </button>
      </div>

      {jumpIncomplete ? (
        <p className="report-toolbar-hint">
          Enter both a week number and a year, or
          clear them to use the list.
        </p>
      ) : null}

      {tab === "weekly" &&
      weeks.length === 0 ? (
        <p className="closure-empty-note">
          No inspections have been scheduled at
          your location in the last year. You can
          still go to an older week by number.
        </p>
      ) : null}

      {tab === "weekly" ? null : (
        <p className="report-toolbar-hint">
          The yearly report runs from{" "}
          {formatReportDate(
            `${selectedYear || currentYear}-01-01`,
          )}{" "}
          to today for the current year, or to 31
          December for a past year.
        </p>
      )}
    </section>
  );
}
