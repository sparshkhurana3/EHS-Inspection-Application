const OUTCOME_CHIPS = [
  { value: "ALL", label: "All" },
  { value: "NOT_DONE", label: "Not done" },
  { value: "INSPECTED", label: "Inspected" },
  {
    value: "NO_OBSERVATIONS",
    label: "No observation",
  },
  {
    value: "OBSERVATIONS",
    label: "With observations",
  },
];

/**
 * The weekly report's filters: outcome, unit, risk and a text search,
 * with a live count. Filters only change what is on screen; the PDF is
 * always the full report.
 */
export default function WeeklyFilters({
  filters,
  units,
  shown,
  total,
  onChange,
  onExpandAll,
  onCollapseAll,
  onClear,
}) {
  return (
    <div className="report-filters">
      <div
        className="report-chip-row"
        role="group"
        aria-label="Filter by outcome"
      >
        {OUTCOME_CHIPS.map((chip) => (
          <button
            key={chip.value}
            type="button"
            className="report-chip-button"
            aria-pressed={
              filters.outcome === chip.value
            }
            onClick={() =>
              onChange({ outcome: chip.value })
            }
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="report-filter-row">
        <label className="observation-history-filter">
          Unit

          <select
            value={filters.unitId}
            onChange={(event) =>
              onChange({
                unitId: event.target.value,
              })
            }
          >
            <option value="">All units</option>

            {units.map((unit) => (
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
          Risk

          <select
            value={filters.risk}
            onChange={(event) =>
              onChange({
                risk: event.target.value,
              })
            }
          >
            <option value="">Any</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </label>

        <label className="observation-history-filter report-search">
          Search

          <input
            type="search"
            placeholder="Zone, auditor or auditee"
            value={filters.search}
            onChange={(event) =>
              onChange({
                search: event.target.value,
              })
            }
          />
        </label>
      </div>

      <div className="report-filter-row">
        <span
          className="report-count"
          role="status"
          aria-live="polite"
        >
          Showing {shown} of {total} inspections
        </span>

        <button
          type="button"
          className="button button-secondary report-small-button"
          onClick={onExpandAll}
        >
          Expand all
        </button>

        <button
          type="button"
          className="button button-secondary report-small-button"
          onClick={onCollapseAll}
        >
          Collapse all
        </button>

        <button
          type="button"
          className="button button-secondary report-small-button"
          onClick={onClear}
        >
          Clear filters
        </button>
      </div>
    </div>
  );
}
