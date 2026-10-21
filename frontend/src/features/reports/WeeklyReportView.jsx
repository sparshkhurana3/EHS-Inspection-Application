import {
  useMemo,
  useState,
} from "react";

import WeeklyFilters from "./WeeklyFilters.jsx";
import WeeklyInspectionRow from "./WeeklyInspectionRow.jsx";

const NO_FILTERS = {
  outcome: "ALL",
  unitId: "",
  risk: "",
  search: "",
};

function matchesOutcome(inspection, outcome) {
  if (outcome === "ALL") {
    return true;
  }

  if (outcome === "INSPECTED") {
    return inspection.outcome !== "NOT_DONE";
  }

  return inspection.outcome === outcome;
}

function matchesSearch(inspection, search) {
  const needle = search.trim().toLowerCase();

  if (!needle) {
    return true;
  }

  return [
    inspection.zoneName,
    inspection.auditorName,
    inspection.auditeeName,
  ].some((value) =>
    String(value ?? "")
      .toLowerCase()
      .includes(needle),
  );
}

/**
 * A summary tile that filters the list below it. Pressed means that
 * filter is on.
 */
function FilterTile({
  label,
  value,
  caption,
  filter,
  active,
  onSelect,
  bar,
}) {
  return (
    <button
      type="button"
      className="metric-tile report-tile-button"
      aria-pressed={active}
      onClick={() => onSelect(filter)}
    >
      <span className="metric-tile-label">
        {label}
      </span>

      <span className="metric-tile-value">
        {value}
      </span>

      {bar === undefined ? null : (
        <span
          className="metric-tile-bar"
          role="img"
          aria-label={`${bar}% inspected`}
        >
          <span style={{ width: `${bar}%` }} />
        </span>
      )}

      {caption ? (
        <span className="metric-tile-caption">
          {caption}
        </span>
      ) : null}
    </button>
  );
}

function PlainTile({ label, value, caption }) {
  return (
    <article className="metric-tile">
      <span className="metric-tile-label">
        {label}
      </span>

      <p className="metric-tile-value">{value}</p>

      {caption ? (
        <span className="metric-tile-caption">
          {caption}
        </span>
      ) : null}
    </article>
  );
}

/**
 * The weekly report on screen: summary tiles that filter, a filter
 * bar, and every unit's audits with their observations and closures.
 */
export default function WeeklyReportView({
  report,
}) {
  const { summary } = report;

  const [filters, setFilters] =
    useState(NO_FILTERS);

  const [expanded, setExpanded] = useState(
    () => new Set(),
  );

  const [collapsedUnits, setCollapsedUnits] =
    useState(() => new Set());

  const visibleUnits = useMemo(
    () =>
      report.units
        .filter(
          (unit) =>
            !filters.unitId ||
            String(unit.unitId) ===
              filters.unitId,
        )
        .map((unit) => ({
          ...unit,
          inspections: unit.inspections.filter(
            (inspection) =>
              matchesOutcome(
                inspection,
                filters.outcome,
              ) &&
              (!filters.risk ||
                inspection.observations.some(
                  (observation) =>
                    observation.riskCategory ===
                    filters.risk,
                )) &&
              matchesSearch(
                inspection,
                filters.search,
              ),
          ),
        }))
        .filter(
          (unit) => unit.inspections.length > 0,
        ),
    [report.units, filters],
  );

  const totalInspections = report.units.reduce(
    (sum, unit) => sum + unit.inspections.length,
    0,
  );

  const shownInspections = visibleUnits.reduce(
    (sum, unit) => sum + unit.inspections.length,
    0,
  );

  const inspectedPercent =
    summary.zonesToInspect > 0
      ? Math.round(
          (summary.zonesInspected /
            summary.zonesToInspect) *
            100,
        )
      : 0;

  function changeFilters(change) {
    setFilters((current) => ({
      ...current,
      ...change,
    }));
  }

  function selectOutcome(outcome) {
    changeFilters({
      outcome:
        filters.outcome === outcome
          ? "ALL"
          : outcome,
    });
  }

  function toggleInspection(patrolId) {
    setExpanded((current) => {
      const next = new Set(current);

      if (next.has(patrolId)) {
        next.delete(patrolId);
      } else {
        next.add(patrolId);
      }

      return next;
    });
  }

  function toggleUnit(unitId) {
    setCollapsedUnits((current) => {
      const next = new Set(current);

      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }

      return next;
    });
  }

  function expandAll() {
    setCollapsedUnits(new Set());

    setExpanded(
      new Set(
        visibleUnits.flatMap((unit) =>
          unit.inspections
            .filter(
              (inspection) =>
                inspection.observations.length >
                0,
            )
            .map(
              (inspection) =>
                inspection.patrolId,
            ),
        ),
      ),
    );
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  return (
    <div className="report-body">
      <section
        className="dashboard-metrics-grid report-tiles"
        aria-label="Weekly summary"
      >
        <PlainTile
          label="Zones to be inspected"
          value={summary.zonesToInspect}
        />

        <FilterTile
          label="Zones inspected"
          value={summary.zonesInspected}
          bar={inspectedPercent}
          caption={`${inspectedPercent}% of zones scheduled`}
          filter="INSPECTED"
          active={filters.outcome === "INSPECTED"}
          onSelect={selectOutcome}
        />

        <FilterTile
          label="Zones not inspected"
          value={summary.zonesNotInspected}
          caption="Not done"
          filter="NOT_DONE"
          active={filters.outcome === "NOT_DONE"}
          onSelect={selectOutcome}
        />

        <FilterTile
          label="Inspected with observations"
          value={summary.inspectedWithObservations}
          caption="Zones with findings"
          filter="OBSERVATIONS"
          active={
            filters.outcome === "OBSERVATIONS"
          }
          onSelect={selectOutcome}
        />

        <FilterTile
          label="No observation to record"
          value={summary.inspectedWithoutObservations}
          caption="Inspected, nothing found"
          filter="NO_OBSERVATIONS"
          active={
            filters.outcome === "NO_OBSERVATIONS"
          }
          onSelect={selectOutcome}
        />

        <PlainTile
          label="Observations recorded"
          value={summary.totalObservations}
          caption={`High ${summary.risk.high} · Medium ${summary.risk.medium} · Low ${summary.risk.low}`}
        />

        <PlainTile
          label="Closures"
          value={
            summary.closures.approved +
            summary.closures.awaitingApproval +
            summary.closures.inProgress +
            summary.closures.returned
          }
          caption={`Approved ${summary.closures.approved} · Awaiting ${summary.closures.awaitingApproval} · In progress ${summary.closures.inProgress} · Returned ${summary.closures.returned}`}
        />
      </section>

      <WeeklyFilters
        filters={filters}
        units={report.units}
        shown={shownInspections}
        total={totalInspections}
        onChange={changeFilters}
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
        onClear={() => setFilters(NO_FILTERS)}
      />

      {visibleUnits.length === 0 ? (
        <div className="closure-empty-note">
          No inspections match these filters.{" "}
          <button
            type="button"
            className="button button-secondary report-small-button"
            onClick={() =>
              setFilters(NO_FILTERS)
            }
          >
            Clear filters
          </button>
        </div>
      ) : (
        visibleUnits.map((unit) => {
          const open = !collapsedUnits.has(
            unit.unitId,
          );

          const listId = `report-unit-${unit.unitId}`;

          return (
            <section
              key={unit.unitId}
              className="report-unit"
            >
              <button
                type="button"
                className="report-unit-band"
                aria-expanded={open}
                aria-controls={listId}
                onClick={() =>
                  toggleUnit(unit.unitId)
                }
              >
                <span>{unit.unitName}</span>

                <span className="report-unit-meta">
                  {unit.inspections.length}{" "}
                  {unit.inspections.length === 1
                    ? "inspection"
                    : "inspections"}
                  <span aria-hidden="true">
                    {open ? "↑" : "↓"}
                  </span>
                </span>
              </button>

              {open ? (
                <ul
                  id={listId}
                  className="report-inspection-list"
                >
                  <li
                    className="report-row report-row-header"
                    aria-hidden="true"
                  >
                    <span>Zone</span>
                    <span>Auditor / Auditee</span>
                    <span>Inspection</span>
                    <span>Report</span>
                    <span>Closure</span>
                    <span />
                  </li>

                  {unit.inspections.map(
                    (inspection) => (
                      <WeeklyInspectionRow
                        key={inspection.patrolId}
                        inspection={inspection}
                        dueDate={report.dueDate}
                        expanded={expanded.has(
                          inspection.patrolId,
                        )}
                        onToggle={() =>
                          toggleInspection(
                            inspection.patrolId,
                          )
                        }
                      />
                    ),
                  )}
                </ul>
              ) : null}
            </section>
          );
        })
      )}
    </div>
  );
}
