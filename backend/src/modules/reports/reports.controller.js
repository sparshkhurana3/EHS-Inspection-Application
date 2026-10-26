import * as patrolService
  from "../patrols/patrol.service.js";

import * as reportsService
  from "./reports.service.js";

function getGeneratedBy(req) {
  return req.user.fullName ?? req.user.username;
}

function getWeekQuery(req) {
  return {
    weekStart: req.query.weekStart,
    fiscalYear: req.query.fiscalYear,
    fiscalWeek: req.query.fiscalWeek,
  };
}

/*
 * The same four headers as the spreadsheet report: the browser fetches
 * a PDF through apiClient, which can only read a response header it was
 * told is exposed, and a report must never be cached.
 */
function sendPdf(res, { buffer, fileName }) {
  res.setHeader(
    "Content-Type",
    "application/pdf",
  );

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${fileName}"`,
  );

  res.setHeader(
    "Access-Control-Expose-Headers",
    "Content-Disposition",
  );

  res.setHeader(
    "Cache-Control",
    "no-store",
  );

  res.status(200).send(buffer);
}

export async function getWeeklyReportWeeks(
  req,
  res,
  next,
) {
  try {
    const result =
      await reportsService.getWeeklyReportWeeks({
        userId: req.user.id,
      });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getWeeklyReport(
  req,
  res,
  next,
) {
  try {
    const result =
      await reportsService.getWeeklyReport({
        userId: req.user.id,
        query: getWeekQuery(req),
      });

    res.setHeader("Cache-Control", "no-store");

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getWeeklyReportPdf(
  req,
  res,
  next,
) {
  try {
    sendPdf(
      res,
      await reportsService.getWeeklyReportPdf({
        userId: req.user.id,
        generatedBy: getGeneratedBy(req),
        includePhotos:
          req.query.includePhotos !== "false",
        query: getWeekQuery(req),
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getYearlyReportYears(
  req,
  res,
  next,
) {
  try {
    const result =
      await reportsService.getYearlyReportYears({
        userId: req.user.id,
      });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getYearlyReport(
  req,
  res,
  next,
) {
  try {
    const result =
      await reportsService.getYearlyReport({
        userId: req.user.id,
        year: req.query.year,
      });

    res.setHeader("Cache-Control", "no-store");

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getYearlyReportPdf(
  req,
  res,
  next,
) {
  try {
    sendPdf(
      res,
      await reportsService.getYearlyReportPdf({
        userId: req.user.id,
        generatedBy: getGeneratedBy(req),
        year: req.query.year,
      }),
    );
  } catch (error) {
    next(error);
  }
}

/*
 * The zone-by-week spreadsheet is built by the patrols module (the Plan
 * page's download); the Report page offers it too, for the Plant Head as
 * well as the officer. getInspectionReport scopes it to the caller's own
 * plant, so reusing it here shares the one builder and the one scope
 * rule rather than copying them.
 */
export async function getZoneWeeksSpreadsheet(
  req,
  res,
  next,
) {
  try {
    const report =
      await patrolService.getInspectionReport({
        userId: req.user.id,
      });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${report.fileName}"`,
    );

    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Disposition",
    );

    res.setHeader(
      "Cache-Control",
      "no-store",
    );

    res.status(200).send(report.buffer);
  } catch (error) {
    next(error);
  }
}
