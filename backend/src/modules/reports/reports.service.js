import path from "node:path";

import sharp from "sharp";

import AppError from "../../shared/errors/AppError.js";

import {
  logger,
} from "../../config/logger.js";

import {
  readStoredFile,
} from "../../shared/storage/storedFiles.js";

/*
 * Loaded for its side effect: it restricts sharp to the JPEG and PNG
 * decoders (docs/24 D21), which must also hold for the photographs
 * decoded here. An SVG is never decoded by this module.
 */
import "../../middleware/compressUploadedImages.js";

import * as reportsRepository
  from "./reports.repository.js";

import {
  formatFiscalYear,
  getFiscalYearOfDate,
  getFiscalYearRange,
} from "../../shared/fiscalYear.js";

import {
  addDays,
  formatReportDate,
  getFiscalWeekMondayOf,
  getFiscalWeekNumberOf,
  getFiscalYearOfWeek,
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
 * year and week number of the company year (docs/23 D12, docs/24 D23),
 * which starts on 1 April: week 1 is the first Monday on or after it.
 * A week that has not started is refused.
 */
function resolveWeekStart(
  { weekStart, fiscalYear, fiscalWeek },
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
    fiscalYear !== undefined &&
    fiscalWeek !== undefined
  ) {
    const year = Number.parseInt(fiscalYear, 10);
    const week = Number.parseInt(fiscalWeek, 10);

    monday =
      year >= 2000
        ? getFiscalWeekMondayOf(year, week)
        : null;

    if (!monday) {
      throw new AppError(
        "That week does not exist. Enter a week number from 1 to 52 (53 in some years) and the year the company year starts in (for April 2026 to March 2027, 2026).",
        400,
        "INVALID_FISCAL_WEEK",
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
      fiscalWeek: getFiscalWeekNumberOf(
        week.weekStart,
      ),
      fiscalYear: getFiscalYearOfWeek(week.weekStart),
      fiscalYearLabel: formatFiscalYear(
        getFiscalYearOfWeek(week.weekStart),
      ),
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

  /*
   * Where each observation's photograph is stored, for the PDF only.
   * It stays out of the JSON model, which the page draws.
   */
  const photoRefs = new Map();

  items.forEach((item) => {
    photoRefs.set(item.itemId, {
      path: item.photographPath,
      mimeType: item.photographMimeType,
    });

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
            itemId: item.itemId,
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
      reportId: patrol.reportId,
      zoneId: patrol.zoneId,
      zoneName: patrol.zoneName,
      scheduledDate: patrol.scheduledDate,
      auditorName: patrol.auditorName,
      auditeeName: patrol.auditeeName,
      hodName: patrol.hodName,
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

  const model = {
    type: "WEEKLY",
    plant: {
      name: location.name,
      code: location.code,
    },
    weekStart,
    weekEnd,
    fiscalWeek: getFiscalWeekNumberOf(weekStart),
    fiscalYear: getFiscalYearOfWeek(weekStart),
    fiscalYearLabel: formatFiscalYear(
      getFiscalYearOfWeek(weekStart),
    ),
    dueDate,
    generatedAt: today,
    units,
    summary,
  };

  return { model, photoRefs };
}

export async function getWeeklyReport(input) {
  const { model } =
    await buildWeeklyReportModel(input);

  return {
    message: "Weekly inspection report loaded.",
    report: model,
  };
}

/*
 * The photographs in the PDF (docs/24 D21): each is read, turned into
 * a JPEG at most 800 px on its long side, and embedded. SVG, a missing
 * file and a file that will not decode all become a placeholder, so one
 * bad photograph never loses the report. Fetched four at a time, with a
 * limit on each, because with SharePoint storage every one is a
 * download.
 */
const PHOTO_CONCURRENCY = 4;
const PHOTO_TIMEOUT_MILLISECONDS = 20 * 1000;
const PHOTO_MAX_SIDE = 800;

async function loadPdfPhoto(reference) {
  if (!reference?.path) {
    return null;
  }

  const looksLikeSvg =
    String(reference.mimeType ?? "")
      .toLowerCase()
      .includes("svg") ||
    /\.svg$/i.test(reference.path);

  if (looksLikeSvg) {
    return null;
  }

  const bytes = await readStoredFile(
    reference.path,
    {
      allowedDirectory: path.resolve(
        process.cwd(),
        "uploads",
        "observations",
      ),
    },
  );

  return sharp(bytes)
    .rotate()
    .resize({
      width: PHOTO_MAX_SIDE,
      height: PHOTO_MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 70 })
    .toBuffer();
}

async function withTimeout(promise, milliseconds) {
  let timer;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "The photograph took too long to read.",
              ),
            ),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function loadPdfPhotos(photoRefs, itemIds) {
  const photos = new Map();
  const queue = [...itemIds];

  async function worker() {
    while (queue.length > 0) {
      const itemId = queue.shift();

      try {
        photos.set(
          itemId,
          await withTimeout(
            loadPdfPhoto(photoRefs.get(itemId)),
            PHOTO_TIMEOUT_MILLISECONDS,
          ),
        );
      } catch (error) {
        photos.set(itemId, null);

        logger.warn(
          "A photograph could not be added to the weekly report PDF.",
          {
            itemId,
            reason: error.message,
          },
        );
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: PHOTO_CONCURRENCY },
      worker,
    ),
  );

  return photos;
}

export async function getWeeklyReportPdf({
  generatedBy,
  includePhotos = true,
  ...input
}) {
  const { model, photoRefs } =
    await buildWeeklyReportModel(input);

  const photos = includePhotos
    ? await loadPdfPhotos(
        photoRefs,
        model.units.flatMap((unit) =>
          unit.inspections.flatMap(
            (inspection) =>
              inspection.observations.map(
                (observation) =>
                  observation.itemId,
              ),
          ),
        ),
      )
    : null;

  return {
    buffer: await buildWeeklyInspectionPdf(
      model,
      { generatedBy, photos },
    ),

    fileName: toFileName([
      "weekly-inspection-report",
      model.plant.code ?? model.plant.name,
      `fy${model.fiscalYearLabel}`,
      `w${String(model.fiscalWeek).padStart(2, "0")}`,
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

  if (year > getFiscalYearOfDate(today)) {
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
  const currentYear = getFiscalYearOfDate(today);

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
 * One company year, 1 April to today (or to the following 31 March for
 * a past year). Every active zone is listed, including zones with nothing
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
    year === getFiscalYearOfDate(today);

  const { from: fromDate, to: yearEnd } =
    getFiscalYearRange(year);

  const cutoffDate = isPartialYear
    ? today
    : yearEnd;

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
      fiscalWeek: getFiscalWeekNumberOf(row.weekStart),
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
    yearLabel: formatFiscalYear(year),
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
      `fy${model.yearLabel}`,
    ]),
  };
}
