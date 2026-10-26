import {
  formatFiscalYear,
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
  includePhotos,
  onIncludePhotosChange,
  onGenerate,
  onDownload,
  onDownloadSpreadsheet,
  downloadingSpreadsheet,
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
                aria-label="Week number of the company year"
                placeholder="14"
                value={jumpWeek}
                onChange={(event) =>
                  onJumpWeekChange(
                    event.target.value,
                  )
                }
                disabled={generating}
              />

              of the year starting April

              <input
                type="number"
                min="2000"
                max="2999"
                inputMode="numeric"
                className="report-jump-input report-jump-input-year"
                aria-label="Year the company year starts in"
                placeholder="2025"
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
                  {`FY ${formatFiscalYear(
                    entry.year,
                  )}${
                    entry.year === currentYear
                      ? " (year to date)"
                      : ""
                  }`}
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

        {tab === "weekly" ? (
          <label className="observation-history-filter">
            <input
              type="checkbox"
              checked={includePhotos}
              onChange={(event) =>
                onIncludePhotosChange(
                  event.target.checked,
                )
              }
            />
            Include photographs in the PDF
          </label>
        ) : (
          <button
            type="button"
            className="button button-secondary"
            onClick={onDownloadSpreadsheet}
            disabled={downloadingSpreadsheet}
          >
            {downloadingSpreadsheet
              ? "Preparing..."
              : "Download zone-by-week spreadsheet (.xlsx)"}
          </button>
        )}
      </div>

      {jumpIncomplete ? (
        <p className="report-toolbar-hint">
          Enter both a week number and the year the
          company year starts in (2025 for April
          2025 to March 2026), or clear them to use
          the list. Week 1 starts on the first
          Monday on or after 1 April.
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
          The yearly report is for the company year
          that runs from{" "}
          {formatReportDate(
            `${selectedYear || currentYear}-04-01`,
          )}{" "}
          to today for the current year, or to 31
          March for a past year.
        </p>
      )}
    </section>
  );
}
