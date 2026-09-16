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
    yearStart:
      `${year}-01-01`,

    yearEnd:
      `${year + 1}-01-01`,
  };
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

  const {
    yearStart,
    yearEnd,
  } = getYearRange(currentYear);

  const {
    weekStart,
    weekEnd,
  } = getCurrentWeekRange(
    referenceDate,
  );

  if (isManagementRole(dashboardRole)) {
    const [
      monthlyAudits,
      currentWeekAudits,
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
    ]);

    return {
      role: dashboardRole,

      period: {
        year: selectedYear,
        month: selectedMonth,
      },

      metricsPeriod: {
        startDate: yearStart,
        endDate: `${currentYear}-12-31`,
      },

      audits: monthlyAudits,
      nextAudit: null,

      nextWeek: createManagementWeek(
        currentWeekAudits,
        weekStart,
        weekEnd,
      ),
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
        yearEnd,
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
      startDate: yearStart,
      endDate: `${currentYear}-12-31`,
    },

    audits: monthlyAudits,
    nextAudit,
    nextWeek: null,

    metrics: {
      audits: {
        conducted:
          annualMetrics.conductedAudits,

        total:
          annualMetrics.totalAudits,
      },

      closures: {
        requested:
          annualMetrics.closuresRequested,

        actual:
          annualMetrics.actualClosures,
      },
    },
  };
}