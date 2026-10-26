import {
  getFiscalWeek,
  getFiscalWeekMonday,
  getFiscalYearOfMonday,
} from "../../shared/fiscalYear.js";

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
 * The week number of the week starting on a Monday, counted from the
 * first Monday on or after 1 April (docs/24, shared/fiscalYear.js).
 */
export function getFiscalWeekNumberOf(monday) {
  return getFiscalWeek(monday).week;
}

/**
 * The year a week belongs to, named by the calendar year it starts in
 * (2026 is April 2026 to March 2027).
 */
export function getFiscalYearOfWeek(monday) {
  return getFiscalYearOfMonday(monday);
}

/**
 * The Monday of week `fiscalWeek` of `fiscalYear`, or null when that
 * year has no such week.
 */
export function getFiscalWeekMondayOf(
  fiscalYear,
  fiscalWeek,
) {
  return getFiscalWeekMonday(
    fiscalYear,
    fiscalWeek,
  );
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
