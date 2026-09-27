/**
 * Year-to-date inspection metrics, above the calendar.
 *
 * Two audiences, deliberately different numbers. Management is
 * answerable for the plant's whole programme — how much of what was
 * scheduled has actually happened, and what it produced. An auditor or
 * auditee is answerable only for their own share, split by the side of
 * the patrol they were on, because the two are different jobs.
 */

function formatCount(value) {
  return Number(value ?? 0).toLocaleString();
}

function toPercentage(done, total) {
  const denominator = Number(total ?? 0);

  if (denominator <= 0) {
    return null;
  }

  return Math.round(
    (Number(done ?? 0) / denominator) * 100,
  );
}

/**
 * One tile. `of` makes it a ratio with a progress bar; leaving it out
 * gives a plain total, which is what a count of reports is.
 */
function MetricTile({
  label,
  value,
  of,
  caption,
}) {
  const percentage =
    of === undefined
      ? null
      : toPercentage(value, of);

  return (
    <article className="metric-tile">
      <span className="metric-tile-label">
        {label}
      </span>

      <p className="metric-tile-value">
        {formatCount(value)}

        {of === undefined ? null : (
          <span className="metric-tile-of">
            {" of "}
            {formatCount(of)}
          </span>
        )}
      </p>

      {percentage === null ? null : (
        <div
          className="metric-tile-bar"
          role="img"
          aria-label={`${percentage}% complete`}
        >
          <span
            style={{
              width: `${percentage}%`,
            }}
          />
        </div>
      )}

      {caption ? (
        <span className="metric-tile-caption">
          {percentage === null
            ? caption
            : `${percentage}% · ${caption}`}
        </span>
      ) : null}
    </article>
  );
}

function ManagementMetrics({ metrics }) {
  const {
    inspections,
    observationReports,
    closureReports,
  } = metrics;

  return (
    <>
      <MetricTile
        label="Inspections conducted"
        value={inspections.conducted}
        of={inspections.due}
        caption="of those scheduled so far this year"
      />

      <MetricTile
        label="Observation reports"
        value={observationReports.total}
        caption={
          `${formatCount(
            observationReports.withFindings,
          )} with findings · ${formatCount(
            observationReports.withoutFindings,
          )} with none to record`
        }
      />

      <MetricTile
        label="Closure reports approved"
        value={closureReports.approved}
        of={closureReports.raised}
        caption="raised against reports with findings"
      />
    </>
  );
}

function PersonalMetrics({ metrics }) {
  const { inspections, closures } = metrics;

  return (
    <>
      <MetricTile
        label="Inspections you conducted"
        value={inspections.conducted}
        of={inspections.due}
        caption="assigned to you as auditor so far"
      />

      <MetricTile
        label="Closures you completed"
        value={closures.approved}
        of={closures.raised}
        caption={
          closures.raised === 0
            ? `no report has come to you yet · ${formatCount(
                closures.assigned,
              )} audits assigned as auditee`
            : "approved by the EHS Officer"
        }
      />
    </>
  );
}

export default function DashboardMetrics({
  metrics,
  period,
}) {
  /*
   * The dashboard renders before the first response arrives, and an
   * older deployment may not send metrics at all.
   */
  if (!metrics) {
    return null;
  }

  const isPlantWide = metrics.scope === "PLANT";

  return (
    <section
      className="dashboard-metrics"
      aria-label="Inspection metrics"
    >
      <div className="dashboard-metrics-header">
        <h2>
          {isPlantWide
            ? "Inspection programme"
            : "Your year so far"}
        </h2>

        <span className="dashboard-single-record">
          {[
            period?.year
              ? `${period.year} to date`
              : "Year to date",
            isPlantWide
              ? period?.scopeName ?? "All locations"
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>

      <div className="dashboard-metrics-grid">
        {isPlantWide ? (
          <ManagementMetrics
            metrics={metrics}
          />
        ) : (
          <PersonalMetrics metrics={metrics} />
        )}
      </div>
    </section>
  );
}
