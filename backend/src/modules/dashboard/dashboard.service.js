import AppError from "../../shared/errors/AppError.js";

import {
  USER_ROLES,
} from "../../shared/constants/roles.js";

import * as dashboardRepository
  from "./dashboard.repository.js";

const MANAGEMENT_ROLES = new Set([
  USER_ROLES.EHS_OFFICER,
  USER_ROLES.HOD,
  USER_ROLES.PLANT_HEAD,
  USER_ROLES.ADMIN,
]);

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
    normalizedRoles.find((role) =>
      MANAGEMENT_ROLES.has(role),
    );

  if (managementRole) {
    return managementRole;
  }

  return USER_ROLES.USER;
}

function isManagementRole(role) {
  return MANAGEMENT_ROLES.has(
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
 * Groups the flat zone rows from findOfficerWeekPatrols into a single
 * card for the plant's next upcoming inspection week, its zones
 * grouped by unit. Null when nothing is scheduled.
 */
function buildOfficerWeek(rows) {
  if (rows.length === 0) {
    return null;
  }

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

    unitsById.get(row.unitId).zones.push({
      patrolId: row.patrolId,
      zoneId: row.zoneId,
      zoneName: row.zoneName,
      zoneNumber: row.zoneNumber,
      scheduledDate: row.scheduledDate,
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
       * Reassigning the auditor/auditee only makes sense before any
       * work has happened against this audit.
       */
      canEditAssignment:
        !row.observationReportId,
    });
  }

  return {
    weekStart: rows[0].weekStart,
    weekEnd: rows[0].weekEnd,
    totalAudits: rows.length,
    units: [...unitsById.values()],
  };
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
      annualMetrics,
    ] = await Promise.all([
      dashboardRepository
        .findManagementMonthlyPatrols({
          monthStart,
          monthEnd,
        }),

      dashboardRepository
        .findManagementCurrentWeekPatrols({
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
     * single "upcoming inspection week" meaningful. HOD/Plant Head/
     * Admin keep the existing plant-wide nextWeek list below.
     */
    let officerWeek = null;

    if (
      dashboardRole ===
        USER_ROLES.EHS_OFFICER &&
      managementPlant
    ) {
      const weekRows =
        await dashboardRepository
          .findOfficerWeekPatrols({
            plantId: managementPlant.id,
            weekStart,
          });

      officerWeek =
        buildOfficerWeek(weekRows);
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
      nextAudit: null,

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