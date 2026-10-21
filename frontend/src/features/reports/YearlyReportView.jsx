import {
  useMemo,
  useState,
} from "react";

import YearlyUnitTable from "./YearlyUnitTable.jsx";

import {
  completionBandClass,
  formatPercent,
  pluralise,
} from "./reportFormat.js";

/*
 * Sorting applies to the zones within each unit. The percentage sorts
 * lowest first, so the zones furthest behind come first; the counts
 * sort highest first.
 */
const SORTS = {
  default: null,
  completion: (zone) =>
    zone.totals.completionPercent,
  scheduled: (zone) => zone.totals.scheduled,
  reports: (zone) =>
    zone.totals.observationReports,
  open: (zone) => zone.totals.closuresOpen,
};

const SORT_OPTIONS = [
  ["default", "Unit and zone"],
  ["completion", "Completion, lowest first"],
  ["scheduled", "Scheduled, most first"],
  ["reports", "Observation reports, most first"],
  ["open", "Closures open, most first"],
];

function sortZones(zones, sort) {
  const read = SORTS[sort];

  if (!read) {
    return zones;
  }

  return [...zones].sort((left, right) => {
    const leftValue = read(left);
    const rightValue = read(right);

    /* A zone with no percentage goes last. */
    if (leftValue === null || rightValue === null) {
      return (
        (leftValue === null ? 1 : 0) -
        (rightValue === null ? 1 : 0)
      );
    }

    return sort === "completion"
      ? leftValue - rightValue
      : rightValue - leftValue;
  });
}

function HeaderCell({
  label,
  sortKey,
  sort,
  onSort,
}) {
  if (!sortKey) {
    return <span>{label}</span>;
  }

  const active = sort === sortKey;

  return (
    <button
      type="button"
      className="report-sort-button"
      aria-sort={
        active
          ? sortKey === "completion"
            ? "ascending"
            : "descending"
          : "none"
      }
      onClick={() =>
        onSort(active ? "default" : sortKey)
      }
    >
      {label}

      <span aria-hidden="true">
        {active
          ? sortKey === "completion"
            ? "↑"
            : "↓"
          : ""}
      </span>
    </button>
  );
}

/**
 * The yearly report on screen: location tiles, controls, and one block
 * per unit with its zones, scheduled against conducted.
 */
export default function YearlyReportView({
  report,
}) {
  const { totals } = report;

  const [unitId, setUnitId] = useState("");
  const [belowOnly, setBelowOnly] =
    useState(false);
  const [sort, setSort] = useState("default");

  /* A long list of units starts closed. */
  const [collapsedUnits, setCollapsedUnits] =
    useState(
      () =>
        new Set(
          report.units.length > 4
            ? report.units.map(
                (unit) => unit.unitId,
              )
            : [],
        ),
    );

  const [expandedZones, setExpandedZones] =
    useState(() => new Set());

  const visibleUnits = useMemo(() => {
    const units = report.units
      .filter(
        (unit) =>
          !unitId ||
          String(unit.unitId) === unitId,
      )
      .map((unit) => ({
        ...unit,
        zones: sortZones(
          unit.zones.filter(
            (zone) =>
              !belowOnly ||
              (zone.totals.scheduled > 0 &&
                zone.totals.completionPercent <
                  100),
          ),
          sort,
        ),
      }))
      .filter((unit) => unit.zones.length > 0);

    return sort === "completion"
      ? [...units].sort((left, right) => {
          const leftValue =
            left.totals.completionPercent;
          const rightValue =
            right.totals.completionPercent;

          if (
            leftValue === null ||
            rightValue === null
          ) {
            return (
              (leftValue === null ? 1 : 0) -
              (rightValue === null ? 1 : 0)
            );
          }

          return leftValue - rightValue;
        })
      : units;
  }, [report.units, unitId, belowOnly, sort]);

  function toggle(setter, id) {
    setter((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  return (
    <div className="report-body">
      <section
        className="dashboard-metrics-grid report-tiles"
        aria-label="Yearly summary"
      >
        <article className="metric-tile">
          <span className="metric-tile-label">
            Inspections conducted
          </span>

          <p
            className={`metric-tile-value ${completionBandClass(
              totals.completionBand,
            )}`}
          >
            {totals.conducted}

            <span className="metric-tile-of">
              {" of "}
              {totals.scheduled}
            </span>
          </p>

          {totals.completionPercent === null ? null : (
            <div
              className="metric-tile-bar"
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
            </div>
          )}

          <span className="metric-tile-caption">
            {totals.completionPercent === null
              ? "Nothing scheduled"
              : `${formatPercent(
                  totals.completionPercent,
                )} completed`}
          </span>
        </article>

        <article className="metric-tile">
          <span className="metric-tile-label">
            Observation reports
          </span>

          <p className="metric-tile-value">
            {totals.observationReports}
          </p>

          <span className="metric-tile-caption">
            of {totals.conducted} conducted ·{" "}
            {totals.noObservationReports} with no
            observation to record
          </span>
        </article>

        <article className="metric-tile">
          <span className="metric-tile-label">
            Observations recorded
          </span>

          <p className="metric-tile-value">
            {totals.observations}
          </p>

          <span className="metric-tile-caption">
            across{" "}
            {pluralise(
              totals.observationReports,
              "report",
            )}
          </span>
        </article>

        <article className="metric-tile">
          <span className="metric-tile-label">
            Closures approved
          </span>

          <p className="metric-tile-value">
            {totals.closuresApproved}
          </p>

          <span className="metric-tile-caption">
            {totals.closuresOpen} open
          </span>
        </article>

        <article className="metric-tile">
          <span className="metric-tile-label">
            Zones
          </span>

          <p className="metric-tile-value">
            {totals.zonesScheduled}
          </p>

          <span className="metric-tile-caption">
            scheduled · {totals.zonesNotScheduled}{" "}
            not scheduled
          </span>
        </article>
      </section>

      <div className="report-filters">
        <div className="report-filter-row">
          <label className="observation-history-filter">
            Unit

            <select
              value={unitId}
              onChange={(event) =>
                setUnitId(event.target.value)
              }
            >
              <option value="">All units</option>

              {report.units.map((unit) => (
                <option
                  key={unit.unitId}
                  value={String(unit.unitId)}
                >
                  {unit.unitName}
                </option>
              ))}
            </select>
          </label>

          <label className="observation-history-filter">
            Sort zones by

            <select
              value={sort}
              onChange={(event) =>
                setSort(event.target.value)
              }
            >
              {SORT_OPTIONS.map(
                ([value, label]) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {label}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="observation-history-filter">
            <input
              type="checkbox"
              checked={belowOnly}
              onChange={(event) =>
                setBelowOnly(
                  event.target.checked,
                )
              }
            />
            Show only zones below 100%
          </label>
        </div>
      </div>

      <div
        className="report-row report-yearly-row report-row-header"
        role="group"
        aria-label="Sort the zones by a column"
      >
        <span>Unit / Zone</span>

        <HeaderCell
          label="Scheduled"
          sortKey="scheduled"
          sort={sort}
          onSort={setSort}
        />

        <HeaderCell label="Conducted" />

        <HeaderCell
          label="Completion"
          sortKey="completion"
          sort={sort}
          onSort={setSort}
        />

        <HeaderCell
          label="Observation reports"
          sortKey="reports"
          sort={sort}
          onSort={setSort}
        />

        <HeaderCell label="Observations" />
        <HeaderCell label="Closures approved" />

        <HeaderCell
          label="Closures open"
          sortKey="open"
          sort={sort}
          onSort={setSort}
        />
      </div>

      {visibleUnits.length === 0 ? (
        <p className="closure-empty-note">
          No zones match these settings.
        </p>
      ) : (
        visibleUnits.map((unit) => (
          <YearlyUnitTable
            key={unit.unitId}
            unit={unit}
            open={!collapsedUnits.has(unit.unitId)}
            expandedZones={expandedZones}
            onToggleUnit={() =>
              toggle(
                setCollapsedUnits,
                unit.unitId,
              )
            }
            onToggleZone={(zoneId) =>
              toggle(setExpandedZones, zoneId)
            }
          />
        ))
      )}

      <div className="report-row report-yearly-row report-total-row">
        <span data-label="Location">
          {report.plant.name} total
        </span>

        <span data-label="Scheduled">
          {totals.scheduled}
        </span>

        <span data-label="Conducted">
          {totals.conducted}
        </span>

        <span data-label="Completion">
          <strong
            className={completionBandClass(
              totals.completionBand,
            )}
          >
            {formatPercent(
              totals.completionPercent,
            )}
          </strong>
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
      </div>
    </div>
  );
}
