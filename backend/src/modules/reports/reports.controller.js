import * as reportsService
  from "./reports.service.js";

function getGeneratedBy(req) {
  return req.user.fullName ?? req.user.username;
}

function getWeekQuery(req) {
  return {
    weekStart: req.query.weekStart,
    isoYear: req.query.isoYear,
    isoWeek: req.query.isoWeek,
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
