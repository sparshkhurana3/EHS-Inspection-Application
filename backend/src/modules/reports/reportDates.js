/*
 * Calendar-date helpers for the reports. Everything here works on
 * "YYYY-MM-DD" strings in UTC, so a report can never drift a day with
 * the server's time zone.
 */

export const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * A DATE column comes back from `pg` as a JS Date, not a string, so
 * slicing String(value) would slice the long-form Date#toString()
 * output. Values read back from the database go through here.
 */
export function toDateOnlyString(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value ?? "").slice(0, 10);
}

/**
 * A submitted "YYYY-MM-DD" date if it names a real day, else null.
 * The round trip is the check: Date rolls 2026-02-30 over to 2 March
 * instead of rejecting it.
 */
export function toValidDateOnly(value) {
  const dateOnly = String(value ?? "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return null;
  }

  const date = new Date(
    `${dateOnly}T00:00:00Z`,
  );

  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) ===
      dateOnly
    ? dateOnly
    : null;
}

/**
 * A "YYYY-MM-DD" date moved by whole days, as the same shape.
 */
export function addDays(dateOnly, days) {
  const date = new Date(
    `${dateOnly}T00:00:00Z`,
  );

  date.setUTCDate(
    date.getUTCDate() + days,
  );

  return date
    .toISOString()
    .slice(0, 10);
}

/**
 * The Monday on or before a date: the start of its Monday-to-Sunday
 * week. (day + 6) % 7: Monday (1) -> -0, ... Sunday (0) -> -6.
 */
export function getMondayOnOrBefore(dateOnly) {
  const date = new Date(
    `${dateOnly}T00:00:00Z`,
  );

  date.setUTCDate(
    date.getUTCDate() -
      ((date.getUTCDay() + 6) % 7),
  );

  return date
    .toISOString()
    .slice(0, 10);
}

/**
 * The ISO week number for a "YYYY-MM-DD" Monday.
 *
 * ISO weeks belong to the year holding their Thursday, which is why the
 * calculation hops to Thursday first: the Monday of the week that
 * straddles New Year would otherwise be numbered against the wrong
 * year.
 */
export function getIsoWeekNumber(dateOnly) {
  const date = new Date(`${dateOnly}T00:00:00Z`);

  const dayOfWeek =
    (date.getUTCDay() + 6) % 7;

  date.setUTCDate(
    date.getUTCDate() - dayOfWeek + 3,
  );

  const firstThursday = new Date(
    Date.UTC(date.getUTCFullYear(), 0, 4),
  );

  const firstDayOfWeek =
    (firstThursday.getUTCDay() + 6) % 7;

  firstThursday.setUTCDate(
    firstThursday.getUTCDate() -
      firstDayOfWeek +
      3,
  );

  return (
    1 +
    Math.round(
      (date - firstThursday) /
        (7 * 24 * 60 * 60 * 1000),
    )
  );
}

/**
 * The ISO year of a week: the year of its Thursday, which is why a week
 * starting 29 December can be week 1 of the next year.
 */
export function getIsoYear(weekStart) {
  return Number(
    addDays(weekStart, 3).slice(0, 4),
  );
}

/**
 * The Monday of ISO week `isoWeek` of `isoYear`, or null when that week
 * does not exist (week 53 of a 52-week year, week 0, and so on). Week 1
 * is the week holding 4 January.
 */
export function getIsoWeekMonday(
  isoYear,
  isoWeek,
) {
  if (
    !Number.isInteger(isoYear) ||
    !Number.isInteger(isoWeek) ||
    isoWeek < 1 ||
    isoWeek > 53
  ) {
    return null;
  }

  const firstMonday = getMondayOnOrBefore(
    `${String(isoYear).padStart(4, "0")}-01-04`,
  );

  const monday = addDays(
    firstMonday,
    (isoWeek - 1) * 7,
  );

  return getIsoWeekNumber(monday) === isoWeek
    ? monday
    : null;
}

/**
 * "1 Oct 2026".
 */
export function formatReportDate(dateOnly) {
  const [year, month, day] = String(dateOnly)
    .split("-")
    .map(Number);

  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * "Thu 1 Oct", for a deadline.
 */
export function formatDayAndMonth(dateOnly, dayName) {
  const [, month, day] = String(dateOnly)
    .split("-")
    .map(Number);

  return `${dayName} ${day} ${MONTH_NAMES[month - 1]}`;
}
