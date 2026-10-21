import {
  completionBandClass,
  formatPercent,
} from "./reportFormat.js";

import ZoneWeekStrip from "./ZoneWeekStrip.jsx";

/**
 * The completion cell: the percentage in words and a bar. Only the
 * extremes carry colour, and the number is always written out.
 */
function Completion({ totals }) {
  if (totals.completionPercent === null) {
    return (
      <span className="report-muted">–</span>
    );
  }

  return (
    <span
      className={`report-completion ${completionBandClass(
        totals.completionBand,
      )}`}
    >
      <strong>
        {formatPercent(totals.completionPercent)}
      </strong>

      <span
        className="metric-tile-bar report-bar"
        role="img"
        aria-label={`${totals.completionPercent}% completed`}
      >
        <span
          style={{
            width: `${Math.min(
              totals.completionPercent,
              100,
            )}%`,
          }}
        />
      </span>
    </span>
  );
}

function FigureCells({ totals, notScheduled }) {
  if (notScheduled) {
    return (
      <>
        <span
          className="report-muted"
          data-label="Scheduled"
        >
          Not scheduled
        </span>

        {[
          "Conducted",
          "Completion",
          "Observation reports",
          "Observations",
          "Closures approved",
          "Closures open",
        ].map((label) => (
          <span
            key={label}
            className="report-muted"
            data-label={label}
          >
            –
          </span>
        ))}
      </>
    );
  }

  return (
    <>
      <span data-label="Scheduled">
        {totals.scheduled}
      </span>

      <span data-label="Conducted">
        {totals.conducted}
      </span>

      <span data-label="Completion">
        <Completion totals={totals} />
      </span>

      <span data-label="Observation reports">
        {totals.observationReports}
      </span>

      <span data-label="Observations">
        {totals.observations}
      </span>

      <span data-label="Closures approved">
        {totals.closuresApproved}
      </span>

      <span data-label="Closures open">
        {totals.closuresOpen}
      </span>
    </>
  );
}

/**
 * One unit: a header row with its totals that opens and closes, then
 * its zones. A zone opens to show its week-by-week strip.
 */
export default function YearlyUnitTable({
  unit,
  open,
  expandedZones,
  onToggleUnit,
  onToggleZone,
}) {
  const listId = `report-yearly-unit-${unit.unitId}`;

  return (
    <section className="report-unit">
      <button
        type="button"
        className="report-row report-yearly-row report-unit-row"
        aria-expanded={open}
        aria-controls={listId}
        onClick={onToggleUnit}
      >
        <span data-label="Unit">
          {unit.unitName}{" "}
          <span aria-hidden="true">
            {open ? "↑" : "↓"}
          </span>
        </span>

        <FigureCells
          totals={unit.totals}
          notScheduled={
            unit.totals.scheduled === 0
          }
        />
      </button>

      {open ? (
        <ul
          id={listId}
          className="report-inspection-list"
        >
          {unit.zones.map((zone) => {
            const notScheduled =
              zone.totals.scheduled === 0;

            const expanded = expandedZones.has(
              zone.zoneId,
            );

            const stripId = `report-zone-weeks-${zone.zoneId}`;

            return (
              <li
                key={zone.zoneId}
                className="report-inspection"
              >
                {notScheduled ? (
                  <div className="report-row report-yearly-row">
                    <span data-label="Zone">
                      {zone.zoneName}
                    </span>

                    <FigureCells
                      totals={zone.totals}
                      notScheduled
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className="report-row report-yearly-row report-zone-row"
                    aria-expanded={expanded}
                    aria-controls={stripId}
                    onClick={() =>
                      onToggleZone(zone.zoneId)
                    }
                  >
                    <span data-label="Zone">
                      {zone.zoneName}{" "}
                      <span aria-hidden="true">
                        {expanded ? "↑" : "↓"}
                      </span>
                    </span>

                    <FigureCells
                      totals={zone.totals}
                      notScheduled={false}
                    />
                  </button>
                )}

                {expanded ? (
                  <div
                    id={stripId}
                    className="report-zone-weeks"
                  >
                    <ZoneWeekStrip
                      zoneName={zone.zoneName}
                      weeks={zone.weeks}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
