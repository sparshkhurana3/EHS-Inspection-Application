import {
  Router,
} from "express";

import {
  authenticate,
} from "../../middleware/authenticate.js";

import {
  authorize,
} from "../../middleware/authorize.js";

import {
  validate,
} from "../../middleware/validate.js";

import {
  REPORT_ROLES,
} from "../../shared/constants/roles.js";

import {
  getWeeklyReport,
  getWeeklyReportPdf,
  getWeeklyReportWeeks,
  getYearlyReport,
  getZoneWeeksSpreadsheet,
  getYearlyReportPdf,
  getYearlyReportYears,
} from "./reports.controller.js";

import {
  weeklyReportValidationRules,
  yearlyReportValidationRules,
} from "./reports.validator.js";

/*
 * The weekly and yearly inspection reports (docs/23). Every route is
 * for the EHS Officer only and is scoped to the officer's own location
 * in the service.
 *
 * Request flow:
 * authenticate
 * -> authorize EHS Officer
 * -> validate request
 * -> controller
 */
const router = Router();

/*
 * The weeks a weekly report can be generated for: those with at least
 * one audit at the officer's location.
 */
router.get(
  "/weekly/weeks",
  authenticate,
  authorize(...REPORT_ROLES),
  getWeeklyReportWeeks,
);

/*
 * One week as JSON for the Report page, by `weekStart` or by
 * `fiscalYear` + `fiscalWeek`.
 */
router.get(
  "/weekly",
  authenticate,
  authorize(...REPORT_ROLES),
  weeklyReportValidationRules,
  validate,
  getWeeklyReport,
);

/*
 * The same week as a branded PDF.
 */
router.get(
  "/weekly/pdf",
  authenticate,
  authorize(...REPORT_ROLES),
  weeklyReportValidationRules,
  validate,
  getWeeklyReportPdf,
);

router.get(
  "/yearly/years",
  authenticate,
  authorize(...REPORT_ROLES),
  getYearlyReportYears,
);

router.get(
  "/yearly",
  authenticate,
  authorize(...REPORT_ROLES),
  yearlyReportValidationRules,
  validate,
  getYearlyReport,
);

router.get(
  "/yearly/pdf",
  authenticate,
  authorize(...REPORT_ROLES),
  yearlyReportValidationRules,
  validate,
  getYearlyReportPdf,
);

/*
 * The year's zone-by-week spreadsheet: one row per zone, one column per
 * inspection week, green where the audit happened and red where not.
 */
router.get(
  "/zone-weeks.xlsx",
  authenticate,
  authorize(...REPORT_ROLES),
  getZoneWeeksSpreadsheet,
);

export default router;
