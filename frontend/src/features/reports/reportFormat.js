/*
 * Small formatting helpers shared by the weekly and yearly report views.
 */

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * "1 Oct 2026" from a "YYYY-MM-DD" string, built by hand so it never
 * drifts a day with the browser's time zone.
 */
export function formatReportDate(dateOnly) {
  if (!dateOnly) {
    return "–";
  }

  const [year, month, day] = String(dateOnly)
    .slice(0, 10)
    .split("-")
    .map(Number);

  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * "Thu 1 Oct", for a deadline.
 */
export function formatDayAndMonth(dateOnly, dayName) {
  const [, month, day] = String(dateOnly)
    .slice(0, 10)
    .split("-")
    .map(Number);

  return `${dayName} ${day} ${MONTH_NAMES[month - 1]}`;
}

export function formatPercent(percent) {
  return percent === null ||
    percent === undefined
    ? "–"
    : `${percent}%`;
}

export function pluralise(count, singular) {
  return `${count} ${singular}${
    count === 1 ? "" : "s"
  }`;
}

/**
 * The colour band of a completion percentage (docs/23 D10). A band in
 * the middle has no class: only the extremes carry colour.
 */
export function completionBandClass(band) {
  if (band === "COMPLETE") {
    return "report-band-complete";
  }

  if (band === "BEHIND") {
    return "report-band-behind";
  }

  return "";
}

/**
 * "2026-27" for the company year that starts in April 2026.
 */
export function formatFiscalYear(fiscalYear) {
  const year = Number(fiscalYear);

  return `${year}-${String(
    (year + 1) % 100,
  ).padStart(2, "0")}`;
}

export function weekLabel(week) {
  return `W${week.fiscalWeek} FY ${
    week.fiscalYearLabel ??
    formatFiscalYear(week.fiscalYear)
  } · ${formatReportDate(
    week.weekStart,
  )} to ${formatReportDate(week.weekEnd)}`;
}
