import AppError from "../../shared/errors/AppError.js";

import {
  USER_ROLES,
} from "../../shared/constants/roles.js";

import * as dashboardRepository
  from "./dashboard.repository.js";

/*
 * The management roles in the order the dashboard picks between them.
 * A user's roles arrive from an unordered ARRAY_AGG, so taking the
 * first one they hold could randomly cost an officer who is also an
 * HOD their week card.
 */
const MANAGEMENT_ROLE_PRIORITY = [
  USER_ROLES.EHS_OFFICER,
  USER_ROLES.HOD,
  USER_ROLES.PLANT_HEAD,
  USER_ROLES.ADMIN,
];

function normalizeRole(role) {
  return String(role ?? "")
    .trim()
    .toUpperCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
}

function getPrimaryDashboardRole(roles) {
  const normalizedRoles = Array.isArray(roles)
    ? roles.map(normalizeRole)
    : [];

  const managementRole =
    MANAGEMENT_ROLE_PRIORITY.find((role) =>
      normalizedRoles.includes(role),
    );

  if (managementRole) {
    return managementRole;
  }

  return USER_ROLES.USER;
}

function isManagementRole(role) {
  return MANAGEMENT_ROLE_PRIORITY.includes(
    normalizeRole(role),
  );
}

function createUtcDate(
  year,
  monthIndex,
  day,
) {
  return new Date(
    Date.UTC(
      year,
      monthIndex,
      day,
    ),
  );
}

function formatDateOnly(date) {
  return date
    .toISOString()
    .slice(0, 10);
}

function getMonthRange(year, month) {
  const monthStart = createUtcDate(
    year,
    month - 1,
    1,
  );

  const monthEnd = createUtcDate(
    year,
    month,
    1,
  );

  return {
    monthStart:
      formatDateOnly(monthStart),

    monthEnd:
      formatDateOnly(monthEnd),
  };
}

function getYearRange(year) {
  return {
    yearStart: `${year}-01-01`,
  };
}

/*
 * The "till date" edge of the year-to-date metrics: today, or the last
 * day of the year once that year is behind us, so looking back at a
 * finished year reports the whole of it rather than nothing.
 */
function getMetricsCutoff(year, referenceDate) {
  const endOfYear = `${year}-12-31`;
  const today = formatDateOnly(referenceDate);

  return today < endOfYear
    ? today
    : endOfYear;
}

function getCurrentWeekRange(referenceDate) {
  const date = createUtcDate(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
  );

  const dayOfWeek =
    date.getUTCDay();

  const daysFromMonday =
    (dayOfWeek + 6) % 7;

  const weekStart = new Date(date);

  weekStart.setUTCDate(
    date.getUTCDate() -
      daysFromMonday,
  );

  const weekEnd = new Date(weekStart);

  weekEnd.setUTCDate(
    weekStart.getUTCDate() + 7,
  );

  return {
    weekStart:
      formatDateOnly(weekStart),

    weekEnd:
      formatDateOnly(weekEnd),
  };
}

function getIsoWeekNumber(dateValue) {
  const date = new Date(
    `${dateValue}T00:00:00.000Z`,
  );

  const workingDate = new Date(date);

  const dayNumber =
    workingDate.getUTCDay() || 7;

  workingDate.setUTCDate(
    workingDate.getUTCDate() +
      4 -
      dayNumber,
  );

  const yearStart = new Date(
    Date.UTC(
      workingDate.getUTCFullYear(),
      0,
      1,
    ),
  );

  return Math.ceil(
    (
      (
        workingDate -
        yearStart
      ) /
        86400000 +
      1
    ) /
      7,
  );
}

function addDaysToDateOnly(
  dateValue,
  days,
) {
  const date = new Date(
    `${dateValue}T00:00:00.000Z`,
  );

  date.setUTCDate(
    date.getUTCDate() + days,
  );

  return formatDateOnly(date);
}

/*
 * The week the officer asked to see, as its Monday. Parsed here rather
 * than by a sanitiser because Express 5's req.query is a getter, so a
 * sanitised value never reaches the controller. Any day is accepted and
 * moved back to the Monday of its week. Null when no week was asked
 * for, which means the default week.
 */
function parseOfficerWeekStart(
  weekStartValue,
) {
  if (weekStartValue === undefined) {
    return null;
  }

  const date =
    typeof weekStartValue === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(
      weekStartValue,
    )
      ? new Date(
          `${weekStartValue}T00:00:00.000Z`,
        )
      : null;

  /*
   * The round trip rejects dates such as 2026-02-30, which Date would
   * otherwise roll over into March.
   */
  const isRealDate =
    date !== null &&
    !Number.isNaN(date.getTime()) &&
    formatDateOnly(date) ===
      weekStartValue;

  if (
    !isRealDate ||
    date.getUTCFullYear() < 2020 ||
    date.getUTCFullYear() > 2100
  ) {
    throw new AppError(
      "The dashboard week is invalid.",
      400,
      "INVALID_WEEK_START",
    );
  }

  return getCurrentWeekRange(date)
    .weekStart;
}

/*
 * The range a zone-level edit made from this week reaches, which is
 * the range PATCH /patrols/zones/:zoneId/assignment applies for that
 * from-date: max(week's Monday, current Monday) to 31 December of that
 * year. A week that is not past starts on or after the current Monday,
 * so the max is the week's own Monday. Both null for a past week, which
 * is read-only.
 */
function getZoneEditRange(
  weekStart,
  currentWeekStart,
) {
  if (weekStart < currentWeekStart) {
    return {
      zoneEditFromDate: null,
      zoneEditToDate: null,
    };
  }

  return {
    zoneEditFromDate: weekStart,
    zoneEditToDate:
      `${weekStart.slice(0, 4)}-12-31`,
  };
}

function hasPendingUserAction(audit) {
  if (
    audit.assignmentRole === "AUDITOR"
  ) {
    return !audit.auditorActionCompleted;
  }

  if (
    audit.assignmentRole === "AUDITEE"
  ) {
    return (
      audit.hasOpenObservationReport &&
      !audit.auditeeActionCompleted
    );
  }

  return false;
}

function selectCurrentUserTask(
  currentWeekAudits,
) {
  const pendingAudit =
    currentWeekAudits.find(
      hasPendingUserAction,
    );

  if (pendingAudit) {
    return {
      ...pendingAudit,
      taskState: "SCHEDULED",
      taskCompleted: false,
    };
  }

  if (currentWeekAudits.length > 0) {
    return {
      taskState: "TASK_COMPLETED",
      taskCompleted: true,
      weekLabel: `Week ${getIsoWeekNumber(
        currentWeekAudits[0]
          .scheduledDate,
      )}`,
      message:
        "Task completed for this week.",
    };
  }

  return null;
}

function createManagementWeek(
  audits,
  weekStart,
  weekEnd,
) {
  if (audits.length === 0) {
    return null;
  }

  const weekNumber =
    getIsoWeekNumber(weekStart);

  const endDate = new Date(
    `${weekEnd}T00:00:00.000Z`,
  );

  endDate.setUTCDate(
    endDate.getUTCDate() - 1,
  );

  return {
    weekNumber,
    weekLabel:
      `Week ${weekNumber} audit`,

    startDate: weekStart,
    endDate:
      formatDateOnly(endDate),

    totalAudits: audits.length,
    audits,
  };
}

/*
 * The single label an EHS Officer sees on a zone card, collapsing the
 * observation report and closure machinery into the five states
 * they were asked for. Driven by closureStatus rather than
 * patrol.status: PATROL.status only ever reaches SCHEDULED,
 * PENDING_AUDITEE_ACTION, REEXAMINATION_REQUIRED or COMPLETED in
 * practice, while closure_requests.status is the one that actually
 * distinguishes every step of the auditee/Action HOD loop.
 */
const ZONE_STATUS_LABELS = {
  OPEN: "Open",
  WITH_AUDITEE: "With Auditee",
  ACTION_PLAN_IN_PROGRESS:
    "Action Plan being Implemented",
  EHS_OFFICER_ACTION_REQUIRED:
    "EHS Officer Action Required",
  CLOSED: "Closed",
  CLOSED_NO_OBSERVATIONS:
    "Closed – no observations",
};

function getZoneStatusCode({
  observationReportId,
  noObservations,
  closureStatus,
}) {
  if (!observationReportId) {
    return "OPEN";
  }

  /*
   * "No observation to record": the report exists but nothing was
   * found, so no closure was ever opened and the audit is done.
   */
  if (noObservations) {
    return "CLOSED_NO_OBSERVATIONS";
  }

  const normalizedClosureStatus = String(
    closureStatus ?? "",
  ).toUpperCase();

  if (
    normalizedClosureStatus ===
      "SUBMITTED_FOR_CLOSURE"
  ) {
    return "EHS_OFFICER_ACTION_REQUIRED";
  }

  if (normalizedClosureStatus === "APPROVED") {
    return "CLOSED";
  }

  if (normalizedClosureStatus === "IN_PROGRESS") {
    return "ACTION_PLAN_IN_PROGRESS";
  }

  /*
   * OPEN (plan not yet saved), REEXAMINATION_REQUIRED (sent back, plan
   * needs to be redone) and REJECTED all put the ball back with the
   * auditee.
   */
  return "WITH_AUDITEE";
}

/**
 * Groups the flat zone rows from findOfficerPatrolsInWeek into the
 * officer's week card, its zones grouped by unit. Always an object,
 * even for an empty week, because the card needs the week's dates and
 * its neighbours to move on from there.
 *
 * A past week is read-only: its audits are history, or still owed by
 * whoever was rostered then. In the current and later weeks a zone
 * offers a one-off swap of this audit while nobody has started on it,
 * and a zone-level edit while the zone has anything left to reassign
 * from this week to 31 December.
 */
function buildOfficerWeek({
  weekStart,
  weekEnd,
  currentWeekStart,
  previousWeekStart,
  nextWeekStart,
  zoneEditFromDate,
  zoneEditToDate,
  reassignableCounts,
  rows,
}) {
  const isPastWeek =
    weekStart < currentWeekStart;

  const unitsById = new Map();

  for (const row of rows) {
    if (!unitsById.has(row.unitId)) {
      unitsById.set(row.unitId, {
        unitId: row.unitId,
        unitName: row.unitName,
        unitNumber: row.unitNumber,
        zones: [],
      });
    }

    const statusCode = getZoneStatusCode({
      observationReportId:
        row.observationReportId,
      noObservations: row.noObservations,
      closureStatus: row.closureStatus,
    });

    const reassignableCount =
      reassignableCounts.get(
        String(row.zoneId),
      ) ?? 0;

    unitsById.get(row.unitId).zones.push({
      patrolId: row.patrolId,
      zoneId: row.zoneId,
      zoneName: row.zoneName,
      zoneNumber: row.zoneNumber,
      scheduledDate: row.scheduledDate,
      patrolStatus: row.patrolStatus,
      auditorId: row.auditorId,
      auditorName: row.auditorName,
      auditeeId: row.auditeeId,
      auditeeName: row.auditeeName,
      observationReportId:
        row.observationReportId,
      closureId: row.closureId,

      status: statusCode,
      displayStatus:
        ZONE_STATUS_LABELS[statusCode],

      /*
       * The one-off swap of this audit alone, which only makes sense
       * before any work has happened against it. The same rule the
       * patrols module enforces when it saves the swap.
       */
      canEditAssignment:
        !isPastWeek &&
        row.patrolStatus === "SCHEDULED" &&
        !row.observationReportId,

      reassignableCount,

      /*
       * The zone-level edit. Independent of this week's audit, so a
       * report filed on Monday never blocks changing the zone's future.
       */
      canEditZone:
        !isPastWeek &&
        reassignableCount > 0,
    });
  }

  return {
    weekStart,
    weekEnd,
    isoWeek: getIsoWeekNumber(weekStart),
    isCurrentWeek:
      weekStart === currentWeekStart,
    isPastWeek,
    currentWeekStart,
    previousWeekStart,
    nextWeekStart,
    zoneEditFromDate,
    zoneEditToDate,
    totalAudits: rows.length,
    units: [...unitsById.values()],
  };
}

/**
 * Everything the officer's week card shows for one week of their
 * plant. `requestedWeekStart` is a Monday, or null for the default
 * week: the current week if it has inspections, else the next week
 * that does, else the current week. GET /dashboard and
 * GET /dashboard/officer-week both come through here, so the two can
 * never disagree about the default week.
 */
async function loadOfficerWeek({
  plantId,
  requestedWeekStart,
  referenceDate,
}) {
  const {
    weekStart: currentWeekStart,
  } = getCurrentWeekRange(
    referenceDate,
  );

  const weekStart =
    requestedWeekStart ??
    (await dashboardRepository
      .findOfficerDefaultWeekStart({
        plantId,
        currentWeekStart,
      })) ??
    currentWeekStart;

  /*
   * The Sunday, inclusive, which is what the card shows and what the
   * week queries filter on. getCurrentWeekRange's end is the exclusive
   * next Monday, which its other callers rely on.
   */
  const weekEnd = addDaysToDateOnly(
    weekStart,
    6,
  );

  const {
    zoneEditFromDate,
    zoneEditToDate,
  } = getZoneEditRange(
    weekStart,
    currentWeekStart,
  );

  const [
    rows,
    adjacentWeeks,
  ] = await Promise.all([
    dashboardRepository
      .findOfficerPatrolsInWeek({
        plantId,
        weekStart,
        weekEnd,
      }),

    dashboardRepository
      .findOfficerAdjacentWeeks({
        plantId,
        weekStart,
        weekEnd,
      }),
  ]);

  /* A past week offers no zone edit, so there is nothing to count. */
  const reassignableCounts =
    zoneEditFromDate
      ? await dashboardRepository
        .countReassignableZonePatrols({
          zoneIds: [
            ...new Set(
              rows.map((row) => row.zoneId),
            ),
          ],
          fromDate: zoneEditFromDate,
          toDate: zoneEditToDate,
        })
      : new Map();

  return buildOfficerWeek({
    weekStart,
    weekEnd,
    currentWeekStart,
    previousWeekStart:
      adjacentWeeks.previousWeekStart,
    nextWeekStart:
      adjacentWeeks.nextWeekStart,
    zoneEditFromDate,
    zoneEditToDate,
    reassignableCounts,
    rows,
  });
}

/**
 * One week of the officer's plant for the dashboard week card, which
 * moves between weeks and reloads after a save without re-fetching the
 * metrics and the calendar. `weekStart` is any "YYYY-MM-DD" date and is
 * moved back to its Monday; absent means the default week.
 */
export async function getOfficerWeek({
  user,
  weekStart,
  referenceDate = new Date(),
}) {
  const requestedWeekStart =
    parseOfficerWeekStart(weekStart);

  const plant =
    await dashboardRepository
      .findOfficerPlant(user.id);

  if (!plant) {
    throw new AppError(
      "Your account is not assigned to a location, so audits cannot be planned. Ask an administrator to set your location.",
      400,
      "EHS_OFFICER_LOCATION_NOT_SET",
    );
  }

  return loadOfficerWeek({
    plantId: plant.id,
    requestedWeekStart,
    referenceDate,
  });
}

function parseDashboardPeriod(
  yearValue,
  monthValue,
  referenceDate,
) {
  const selectedYear =
    yearValue === undefined
      ? referenceDate.getUTCFullYear()
      : Number(yearValue);

  const selectedMonth =
    monthValue === undefined
      ? referenceDate.getUTCMonth() + 1
      : Number(monthValue);

  if (
    !Number.isInteger(selectedYear) ||
    selectedYear < 2020 ||
    selectedYear > 2100
  ) {
    throw new AppError(
      "The dashboard year is invalid.",
      400,
      "INVALID_DASHBOARD_YEAR",
    );
  }

  if (
    !Number.isInteger(selectedMonth) ||
    selectedMonth < 1 ||
    selectedMonth > 12
  ) {
    throw new AppError(
      "The dashboard month is invalid.",
      400,
      "INVALID_DASHBOARD_MONTH",
    );
  }

  return {
    selectedYear,
    selectedMonth,
  };
}

export async function getDashboardData({
  user,
  year,
  month,
  referenceDate = new Date(),
}) {
  if (!user?.id) {
    throw new AppError(
      "An authenticated user is required.",
      401,
      "AUTHENTICATION_REQUIRED",
    );
  }

  const dashboardRole =
    getPrimaryDashboardRole(user.roles);

  const {
    selectedYear,
    selectedMonth,
  } = parseDashboardPeriod(
    year,
    month,
    referenceDate,
  );

  const {
    monthStart,
    monthEnd,
  } = getMonthRange(
    selectedYear,
    selectedMonth,
  );

  const currentYear =
    referenceDate.getUTCFullYear();

  const { yearStart } =
    getYearRange(currentYear);

  const {
    weekStart,
    weekEnd,
  } = getCurrentWeekRange(
    referenceDate,
  );

  const metricsCutoff = getMetricsCutoff(
    currentYear,
    referenceDate,
  );

  if (isManagementRole(dashboardRole)) {
    /*
     * Metrics are scoped to the manager's own plant, the same as the
     * officer's week card below, because every location has its own
     * officer and a plant-wide number is what they are answerable for.
     * A manager with no plant set sees every plant.
     */
    const managementPlant =
      await dashboardRepository
        .findOfficerPlant(user.id);

    const [
      monthlyAudits,
      currentWeekAudits,
      ownCurrentWeekAudits,
      annualMetrics,
    ] = await Promise.all([
      dashboardRepository
        .findManagementMonthlyPatrols({
          userId: user.id,
          monthStart,
          monthEnd,
        }),

      dashboardRepository
        .findManagementCurrentWeekPatrols({
          weekStart,
          weekEnd,
        }),

      /*
       * A manager, the officer included, may be rostered as auditor or
       * auditee like anyone else, and needs the same prompt for it.
       */
      dashboardRepository
        .findUserCurrentWeekPatrols({
          userId: user.id,
          weekStart,
          weekEnd,
        }),

      dashboardRepository
        .getManagementAnnualMetrics({
          plantId: managementPlant?.id ?? null,
          yearStart,
          cutoffDate: metricsCutoff,
        }),
    ]);

    /*
     * The weekly plan card is an EHS Officer feature: every location
     * has its own officer, so scoping by their plant is what makes a
     * single inspection week meaningful. HOD/Plant Head/Admin keep the
     * existing plant-wide nextWeek list below.
     */
    let officerWeek = null;

    if (
      dashboardRole ===
        USER_ROLES.EHS_OFFICER &&
      managementPlant
    ) {
      officerWeek = await loadOfficerWeek({
        plantId: managementPlant.id,
        requestedWeekStart: null,
        referenceDate,
      });
    }

    return {
      role: dashboardRole,

      period: {
        year: selectedYear,
        month: selectedMonth,
      },

      metricsPeriod: {
        year: currentYear,
        startDate: yearStart,
        endDate: metricsCutoff,
        scopeName:
          managementPlant?.name ?? null,
      },

      metrics: {
        scope: "PLANT",

        inspections: {
          conducted:
            annualMetrics.inspectionsConducted,
          due: annualMetrics.inspectionsDue,
        },

        observationReports: {
          total:
            annualMetrics.reportsWithFindings +
            annualMetrics.reportsWithoutFindings,
          withFindings:
            annualMetrics.reportsWithFindings,
          withoutFindings:
            annualMetrics.reportsWithoutFindings,
        },

        closureReports: {
          raised:
            annualMetrics.closuresRaised,
          approved:
            annualMetrics.closuresApproved,
        },
      },

      audits: monthlyAudits,
      nextAudit: selectCurrentUserTask(
        ownCurrentWeekAudits,
      ),

      nextWeek: createManagementWeek(
        currentWeekAudits,
        weekStart,
        weekEnd,
      ),

      officerWeek,
    };
  }

  const [
    monthlyAudits,
    currentWeekAudits,
    annualMetrics,
  ] = await Promise.all([
    dashboardRepository
      .findAssignedMonthlyPatrols({
        userId: user.id,
        monthStart,
        monthEnd,
      }),

    dashboardRepository
      .findUserCurrentWeekPatrols({
        userId: user.id,
        weekStart,
        weekEnd,
      }),

    dashboardRepository
      .getUserAnnualMetrics({
        userId: user.id,
        yearStart,
        cutoffDate: metricsCutoff,
      }),
  ]);

  const nextAudit =
    selectCurrentUserTask(
      currentWeekAudits,
    );

  return {
    role: USER_ROLES.USER,

    period: {
      year: selectedYear,
      month: selectedMonth,
    },

    metricsPeriod: {
      year: currentYear,
      startDate: yearStart,
      endDate: metricsCutoff,
      scopeName: null,
    },

    audits: monthlyAudits,
    nextAudit,
    nextWeek: null,
    officerWeek: null,

    metrics: {
      scope: "SELF",

      /* What they were asked to audit, and what they filed. */
      inspections: {
        conducted:
          annualMetrics.auditorConducted,
        due: annualMetrics.auditorAssigned,
      },

      /* The other side of the patrol: answering somebody else's report. */
      closures: {
        approved:
          annualMetrics.closuresApproved,
        raised: annualMetrics.closuresRaised,
        assigned:
          annualMetrics.auditeeAssigned,
      },
    },
  };
}