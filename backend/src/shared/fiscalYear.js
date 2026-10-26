/*
 * The company's year runs from 1 April to 31 March, and its weeks are
 * counted from the first Monday on or after 1 April: in 2026 week 1
 * starts on Monday 6 April. A year is named by the calendar year it
 * starts in, so "2026" is April 2026 to March 2027 and is written
 * "2026-27".
 *
 * Everything works on "YYYY-MM-DD" strings in UTC, so a date never
 * drifts a day with the server's time zone. A week belongs to the year
 * of its Monday, which means the week starting Monday 30 March 2026
 * (holding 1 to 5 April) is the last week of the year before.
 */

const FISCAL_START_MONTH = 4;

function pad(value) {
  return String(value).padStart(2, "0");
}

function addDays(dateOnly, days) {
  const date = new Date(
    `${dateOnly}T00:00:00Z`,
  );

  date.setUTCDate(
    date.getUTCDate() + days,
  );

  return date.toISOString().slice(0, 10);
}

function daysBetween(fromDate, toDate) {
  return Math.round(
    (new Date(`${toDate}T00:00:00Z`) -
      new Date(`${fromDate}T00:00:00Z`)) /
      (24 * 60 * 60 * 1000),
  );
}

/**
 * The Monday on or before a date.
 */
export function getMondayOnOrBefore(dateOnly) {
  const date = new Date(
    `${dateOnly}T00:00:00Z`,
  );

  return addDays(
    dateOnly,
    -((date.getUTCDay() + 6) % 7),
  );
}

/**
 * The year a date falls in, named by the calendar year it started in.
 */
export function getFiscalYearOfDate(dateOnly) {
  const year = Number(dateOnly.slice(0, 4));
  const month = Number(dateOnly.slice(5, 7));

  return month >= FISCAL_START_MONTH
    ? year
    : year - 1;
}

/**
 * First and last day of a year: 1 April and the following 31 March.
 */
export function getFiscalYearRange(fiscalYear) {
  return {
    from: `${fiscalYear}-${pad(FISCAL_START_MONTH)}-01`,
    to: `${fiscalYear + 1}-03-31`,
  };
}

/**
 * The Monday that starts week 1: the first Monday on or after 1 April.
 */
export function getFiscalWeekOneMonday(fiscalYear) {
  const aprilFirst = `${fiscalYear}-${pad(
    FISCAL_START_MONTH,
  )}-01`;

  const monday =
    getMondayOnOrBefore(aprilFirst);

  return monday === aprilFirst
    ? monday
    : addDays(monday, 7);
}

/**
 * The year a Monday belongs to.
 */
export function getFiscalYearOfMonday(monday) {
  const calendarYear = Number(
    monday.slice(0, 4),
  );

  return monday >=
    getFiscalWeekOneMonday(calendarYear)
    ? calendarYear
    : calendarYear - 1;
}

/**
 * The week number (1 to 52, sometimes 53) of the week starting on the
 * given Monday, and the year it belongs to.
 */
export function getFiscalWeek(monday) {
  const fiscalYear =
    getFiscalYearOfMonday(monday);

  return {
    fiscalYear,
    week:
      1 +
      daysBetween(
        getFiscalWeekOneMonday(fiscalYear),
        monday,
      ) /
        7,
  };
}

/**
 * The week number of the week a date falls in.
 */
export function getFiscalWeekNumber(dateOnly) {
  return getFiscalWeek(
    getMondayOnOrBefore(dateOnly),
  ).week;
}

/**
 * The Monday of week `week` of a year, or null when that year has no
 * such week (week 53 of a 52-week year, week 0).
 */
export function getFiscalWeekMonday(
  fiscalYear,
  week,
) {
  if (
    !Number.isInteger(fiscalYear) ||
    !Number.isInteger(week) ||
    week < 1 ||
    week > 53
  ) {
    return null;
  }

  const monday = addDays(
    getFiscalWeekOneMonday(fiscalYear),
    (week - 1) * 7,
  );

  return getFiscalYearOfMonday(monday) ===
    fiscalYear
    ? monday
    : null;
}

/**
 * "2026-27".
 */
export function formatFiscalYear(fiscalYear) {
  return `${fiscalYear}-${pad(
    (fiscalYear + 1) % 100,
  )}`;
}
