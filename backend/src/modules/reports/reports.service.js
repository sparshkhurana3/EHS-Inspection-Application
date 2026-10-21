import AppError from "../../shared/errors/AppError.js";

import * as reportsRepository
  from "./reports.repository.js";

import {
  addDays,
  formatReportDate,
  getIsoWeekMonday,
  getIsoWeekNumber,
  getIsoYear,
  getMondayOnOrBefore,
  toDateOnlyString,
  toValidDateOnly,
} from "./reportDates.js";

import {
  buildWeeklyInspectionPdf,
} from "./weeklyInspectionPdf.js";

import {
  buildYearlyInspectionPdf,
} from "./yearlyInspectionPdf.js";

/*
 * The weekly and yearly inspection reports (docs/21, docs/23).
 *
 * Each report is built once as a raw model: ISO dates, codes and
 * ready-made labels, with all the counting done here. The same model is
 * returned as JSON for the Report page to draw and handed to the PDF
 * builder, so the screen and the PDF cannot disagree.
 *
 * Inspected means an observation report was filed, the same test the
 * dashboard metrics and the zone-by-week spreadsheet use, so "no
 * observation to record" counts as inspected.
 */

async function requireOfficerLocation(userId) {
  const location =
    await reportsRepository.findUserLocation(
      userId,
    );

  if (!location) {
    throw new AppError(
      "No location is assigned to your account, so reports cannot be produced. Contact the EHS application administrator.",
      403,
      "OFFICER_LOCATION_NOT_SET",
    );
  }

  return location;
}

function toFileName(parts) {
  return `${parts.join("-")}.pdf`
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-");
}

function getToday(referenceDate) {
  return toDateOnlyString(referenceDate);
}

/* Weekly */

const RISK_LABELS = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

function describeUnit(unitNumber, unitName) {
  if (
    unitNumber &&
    !String(unitName).includes(
      String(unitNumber),
    )
  ) {
    return `Unit ${unitNumber} · ${unitName}`;
  }

  return unitName;
}

function describeClosure(patrol) {
  switch (patrol.closureStatus) {
    case "IN_PROGRESS":
      return "Action plans saved, not submitted";

    case "SUBMITTED_FOR_CLOSURE":
      return "Awaiting EHS approval";

    case "APPROVED":
      return [
        "Approved",
        patrol.approvedOn
          ? formatReportDate(patrol.approvedOn)
          : null,
        patrol.reviewerName
          ? `by ${patrol.reviewerName}`
          : null,
      ]
        .filter(Boolean)
        .join(" ");

    case "REEXAMINATION_REQUIRED":
    case "REJECTED":
      return `Returned for rework (round ${
        patrol.approvalIteration ?? 1
      })`;

    default:
      return "Action plans pending";
  }
}

function toClosureBucket(closureStatus) {
  switch (closureStatus) {
    case "APPROVED":
      return "approved";

    case "SUBMITTED_FOR_CLOSURE":
      return "awaitingApproval";

    case "REEXAMINATION_REQUIRED":
    case "REJECTED":
      return "returned";

    default:
      return "inProgress";
  }
}

/**
 * The Monday of the week asked for, from either a date inside it or an
 * ISO year and week number (docs/23 D12). A week that has not started
 * is refused.
 */
function resolveWeekStart(
  { weekStart, isoYear, isoWeek },
  today,
) {
  let monday;

  if (weekStart !== undefined && weekStart !== "") {
    const validDate = toValidDateOnly(weekStart);

    if (!validDate) {
      throw new AppError(
        "Select a valid week.",
        400,
        "INVALID_WEEK_START",
      );
    }

    monday = getMondayOnOrBefore(validDate);
  } else if (
    isoYear !== undefined &&
    isoWeek !== undefined
  ) {
    const year = Number.parseInt(isoYear, 10);
    const week = Number.parseInt(isoWeek, 10);

    monday =
      year >= 2000
        ? getIsoWeekMonday(year, week)
        : null;

    if (!monday) {
      throw new AppError(
        "That week does not exist. Enter a week number from 1 to 52 (53 in some years) and a year from 2000.",
        400,
        "INVALID_ISO_WEEK",
      );
    }
  } else {
    throw new AppError(
      "Select a valid week.",
      400,
      "INVALID_WEEK_START",
    );
  }

  if (monday > getMondayOnOrBefore(today)) {
    throw new AppError(
      "Choose a week that has already started.",
      400,
      "WEEK_NOT_STARTED",
    );
  }

  return monday;
}

/**
 * The weeks an EHS Officer can pick a weekly report for: those with at
 * least one non-cancelled audit at their location, from a year back up
 * to and including the current week. The client does no date
 * arithmetic.
 */
export async function getWeeklyReportWeeks({
  userId,
  referenceDate = new Date(),
}) {
  const location =
    await requireOfficerLocation(userId);

  const currentWeekStart = getMondayOnOrBefore(
    getToday(referenceDate),
  );

  const weeks =
    await reportsRepository.findInspectionWeeks({
      plantId: location.id,
      fromDate: addDays(
        currentWeekStart,
        -52 * 7,
      ),
      toDate: addDays(currentWeekStart, 6),
    });

  return {
    message: "Inspection weeks loaded.",

    location: {
      name: location.name,
      code: location.code,
    },

    currentWeekStart,

    weeks: weeks.map((week) => ({
      weekStart: week.weekStart,
      weekEnd: addDays(week.weekStart, 6),
      isoWeek: getIsoWeekNumber(
        week.weekStart,
      ),
      isoYear: getIsoYear(week.weekStart),
      zoneCount: week.zoneCount,
      reportCount: week.reportCount,
    })),
  };
}

/**
 * A zone with more than one audit that week counts as inspected only
 * when every one of them has a report, and as "with observations" when
 * any report has findings.
 */
async function buildWeeklyReportModel({
  userId,
  query,
  referenceDate = new Date(),
}) {
  const today = getToday(referenceDate);
  const weekStart = resolveWeekStart(query, today);
  const location =
    await requireOfficerLocation(userId);

  const weekEnd = addDays(weekStart, 6);

  const patrols =
    await reportsRepository
      .findWeekPatrolsForReport({
        plantId: location.id,
        weekStart,
        weekEnd,
      });

  if (patrols.length === 0) {
    throw new AppError(
      "No inspections were scheduled at your location in that week.",
      404,
      "NO_INSPECTIONS_IN_WEEK",
    );
  }

  const items =
    await reportsRepository
      .findReportItemsForReport({
        reportIds: patrols
          .map((patrol) => patrol.reportId)
          .filter((id) => id !== null),
      });

  const itemsByReport = new Map();

  items.forEach((item) => {
    if (!itemsByReport.has(item.reportId)) {
      itemsByReport.set(item.reportId, []);
    }

    itemsByReport
      .get(item.reportId)
      .push(item);
  });

  const dueDate = addDays(weekStart, 3);

  const summary = {
    zonesToInspect: 0,
    zonesInspected: 0,
    zonesNotInspected: 0,
    inspectedWithObservations: 0,
    inspectedWithoutObservations: 0,
    totalObservations: 0,
    risk: { high: 0, medium: 0, low: 0 },
    closures: {
      approved: 0,
      awaitingApproval: 0,
      inProgress: 0,
      returned: 0,
    },
    byUnit: [],
  };

  const units = [];
  const zonesSeen = new Map();

  patrols.forEach((patrol) => {
    let unit = units.find(
      (candidate) =>
        candidate.unitId === patrol.unitId,
    );

    if (!unit) {
      unit = {
        unitId: patrol.unitId,
        unitName: describeUnit(
          patrol.unitNumber,
          patrol.unitName,
        ),
        inspections: [],
      };

      units.push(unit);
    }

    const outcome =
      patrol.reportId === null
        ? "NOT_DONE"
        : patrol.noObservations
          ? "NO_OBSERVATIONS"
          : "OBSERVATIONS";

    const observations =
      outcome === "OBSERVATIONS"
        ? (
            itemsByReport.get(
              patrol.reportId,
            ) ?? []
          ).map((item) => ({
            sequenceNumber:
              item.sequenceNumber,
            areaName: item.areaName,
            category: item.category,
            riskCategory: item.riskCategory,
            riskLabel:
              RISK_LABELS[item.riskCategory] ??
              item.riskCategory,
            description: item.description,
            actionPlan: item.actionPlan,
            targetDate: item.targetDate,
            evidenceCount: item.evidenceCount,
          }))
        : [];

    const returned =
      patrol.closureStatus ===
        "REEXAMINATION_REQUIRED" ||
      patrol.closureStatus === "REJECTED";

    unit.inspections.push({
      patrolId: patrol.patrolId,
      zoneId: patrol.zoneId,
      zoneName: patrol.zoneName,
      scheduledDate: patrol.scheduledDate,
      auditorName: patrol.auditorName,
      auditeeName: patrol.auditeeName,
      outcome,
      notYetDue:
        outcome === "NOT_DONE" &&
        today <= dueDate,
      reportNumber: patrol.reportNumber,
      closureStatus:
        outcome === "OBSERVATIONS"
          ? (patrol.closureStatus ?? "OPEN")
          : null,
      closureLabel:
        outcome === "OBSERVATIONS"
          ? describeClosure(patrol)
          : null,
      reviewComments: returned
        ? patrol.reviewComments
        : null,
      observations,
    });

    if (outcome === "OBSERVATIONS") {
      summary.closures[
        toClosureBucket(patrol.closureStatus)
      ] += 1;

      observations.forEach((observation) => {
        summary.totalObservations += 1;

        const key =
          observation.riskLabel.toLowerCase();

        if (key in summary.risk) {
          summary.risk[key] += 1;
        }
      });
    }

    const zone = zonesSeen.get(
      patrol.zoneId,
    ) ?? {
      unitIndex: units.indexOf(unit),
      inspected: true,
      withObservations: false,
    };

    zone.inspected =
      zone.inspected && outcome !== "NOT_DONE";

    zone.withObservations =
      zone.withObservations ||
      outcome === "OBSERVATIONS";

    zonesSeen.set(patrol.zoneId, zone);
  });

  units.forEach((unit) => {
    summary.byUnit.push({
      unitName: unit.unitName,
      zonesToInspect: 0,
      zonesInspected: 0,
      inspectedWithObservations: 0,
    });
  });

  zonesSeen.forEach((zone) => {
    const unitSummary =
      summary.byUnit[zone.unitIndex];

    summary.zonesToInspect += 1;
    unitSummary.zonesToInspect += 1;

    if (!zone.inspected) {
      summary.zonesNotInspected += 1;

      return;
    }

    summary.zonesInspected += 1;
    unitSummary.zonesInspected += 1;

    if (zone.withObservations) {
      summary.inspectedWithObservations += 1;
      unitSummary.inspectedWithObservations += 1;
    } else {
      summary.inspectedWithoutObservations += 1;
    }
  });

  return {
    type: "WEEKLY",
    plant: {
      name: location.name,
      code: location.code,
    },
    weekStart,
    weekEnd,
    isoWeek: getIsoWeekNumber(weekStart),
    isoYear: getIsoYear(weekStart),
    dueDate,
    generatedAt: today,
    units,
    summary,
  };
}

export async function getWeeklyReport(input) {
  return {
    message: "Weekly inspection report loaded.",
    report: await buildWeeklyReportModel(input),
  };
}

export async function getWeeklyReportPdf({
  generatedBy,
  ...input
}) {
  const model =
    await buildWeeklyReportModel(input);

  return {
    buffer: await buildWeeklyInspectionPdf(
      model,
      { generatedBy },
    ),

    fileName: toFileName([
      "weekly-inspection-report",
      model.plant.code ?? model.plant.name,
      model.isoYear,
      `w${String(model.isoWeek).padStart(2, "0")}`,
    ]),
  };
}

/* Yearly */

function completionBandOf(percent) {
  if (percent === null) {
    return null;
  }

  if (percent >= 100) {
    return "COMPLETE";
  }

  return percent >= 75 ? "ON_TRACK" : "BEHIND";
}

function emptyTotals() {
  return {
    scheduled: 0,
    conducted: 0,
    notConducted: 0,
    completionPercent: null,
    completionBand: null,
    observationReports: 0,
    noObservationReports: 0,
    observations: 0,
    closuresApproved: 0,
    closuresOpen: 0,
    zonesScheduled: 0,
    zonesNotScheduled: 0,
  };
}

function addToTotals(totals, zoneTotals) {
  totals.scheduled += zoneTotals.scheduled;
  totals.conducted += zoneTotals.conducted;

  totals.observationReports +=
    zoneTotals.observationReports;

  totals.noObservationReports +=
    zoneTotals.noObservationReports;

  totals.observations +=
    zoneTotals.observations;

  totals.closuresApproved +=
    zoneTotals.closuresApproved;

  totals.closuresOpen +=
    zoneTotals.closuresOpen;

  if (zoneTotals.scheduled > 0) {
    totals.zonesScheduled += 1;
  } else {
    totals.zonesNotScheduled += 1;
  }
}

/**
 * The percentage is recomputed from the summed counts, never averaged
 * from the percentages below it.
 */
function finishTotals(totals) {
  totals.notConducted =
    totals.scheduled - totals.conducted;

  totals.completionPercent =
    totals.scheduled > 0
      ? Math.round(
          (totals.conducted /
            totals.scheduled) *
            100,
        )
      : null;

  totals.completionBand = completionBandOf(
    totals.completionPercent,
  );

  return totals;
}

function validateYear(yearValue, today) {
  const year = Number.parseInt(yearValue, 10);

  if (
    !Number.isInteger(year) ||
    year < 2000
  ) {
    throw new AppError(
      "Select a year from 2000.",
      400,
      "INVALID_YEAR",
    );
  }

  if (year > Number(today.slice(0, 4))) {
    throw new AppError(
      "Choose a year that has already started.",
      400,
      "YEAR_NOT_STARTED",
    );
  }

  return year;
}

/**
 * The years an EHS Officer can pick a yearly report for: those with at
 * least one non-cancelled audit at their location, newest first,
 * always including the current year.
 */
export async function getYearlyReportYears({
  userId,
  referenceDate = new Date(),
}) {
  const location =
    await requireOfficerLocation(userId);

  const today = getToday(referenceDate);
  const currentYear = Number(today.slice(0, 4));

  const years =
    await reportsRepository.findInspectionYears({
      plantId: location.id,
      cutoffDate: today,
    });

  if (
    !years.some(
      (entry) => entry.year === currentYear,
    )
  ) {
    years.unshift({
      year: currentYear,
      scheduledCount: 0,
      conductedCount: 0,
    });
  }

  return {
    message: "Inspection years loaded.",

    location: {
      name: location.name,
      code: location.code,
    },

    currentYear,
    years,
  };
}

/**
 * One calendar year, 1 January to today (or to 31 December for a past
 * year). Every active zone is listed, including zones with nothing
 * scheduled, which are left out of every percentage (docs/23 D8, D9).
 * "Closures" means closures approved; every other closure is open.
 */
async function buildYearlyReportModel({
  userId,
  year: yearValue,
  referenceDate = new Date(),
}) {
  const today = getToday(referenceDate);
  const year = validateYear(yearValue, today);
  const location =
    await requireOfficerLocation(userId);

  const isPartialYear =
    year === Number(today.slice(0, 4));

  const fromDate = `${year}-01-01`;

  const cutoffDate = isPartialYear
    ? today
    : `${year}-12-31`;

  const [zoneRows, weekRows] =
    await Promise.all([
      reportsRepository.findYearlyZoneTotals({
        plantId: location.id,
        fromDate,
        cutoffDate,
      }),

      reportsRepository.findYearlyZoneWeeks({
        plantId: location.id,
        fromDate,
        cutoffDate,
      }),
    ]);

  const weeksByZone = new Map();

  weekRows.forEach((row) => {
    if (!weeksByZone.has(row.zoneId)) {
      weeksByZone.set(row.zoneId, []);
    }

    weeksByZone.get(row.zoneId).push({
      weekStart: row.weekStart,
      isoWeek: getIsoWeekNumber(row.weekStart),
      scheduledCount: row.scheduledCount,
      conductedCount: row.conductedCount,
    });
  });

  const locationTotals = emptyTotals();
  const units = [];

  zoneRows.forEach((row) => {
    let unit = units.find(
      (candidate) =>
        candidate.unitId === row.unitId,
    );

    if (!unit) {
      unit = {
        unitId: row.unitId,
        unitName: describeUnit(
          row.unitNumber,
          row.unitName,
        ),
        totals: emptyTotals(),
        zones: [],
      };

      units.push(unit);
    }

    const zoneTotals = finishTotals({
      ...emptyTotals(),
      scheduled: row.scheduledCount,
      conducted: row.conductedCount,
      observationReports:
        row.observationReportCount,
      noObservationReports:
        row.noObservationCount,
      observations: row.observationCount,
      closuresApproved: row.closuresApproved,
      closuresOpen: row.closuresOpen,
    });

    unit.zones.push({
      zoneId: row.zoneId,
      zoneName: row.zoneName,
      totals: zoneTotals,
      weeks: weeksByZone.get(row.zoneId) ?? [],
    });

    addToTotals(unit.totals, zoneTotals);
    addToTotals(locationTotals, zoneTotals);
  });

  units.forEach((unit) => {
    finishTotals(unit.totals);
  });

  return {
    type: "YEARLY",
    plant: {
      name: location.name,
      code: location.code,
    },
    year,
    fromDate,
    cutoffDate,
    isPartialYear,
    generatedAt: today,
    totals: finishTotals(locationTotals),
    units,
  };
}

export async function getYearlyReport(input) {
  return {
    message: "Yearly inspection report loaded.",
    report: await buildYearlyReportModel(input),
  };
}

export async function getYearlyReportPdf({
  generatedBy,
  ...input
}) {
  const model =
    await buildYearlyReportModel(input);

  return {
    buffer: await buildYearlyInspectionPdf(
      model,
      { generatedBy },
    ),

    fileName: toFileName([
      "yearly-inspection-report",
      model.plant.code ?? model.plant.name,
      model.year,
    ]),
  };
}
