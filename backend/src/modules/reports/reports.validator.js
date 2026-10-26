import {
  query,
} from "express-validator";

/*
 * Only the shape is checked here. The service decides which form of
 * week was given, rejects an impossible day or week, and refuses a
 * period that has not started, because Express 5's req.query does not
 * keep sanitised values.
 */
export const weeklyReportValidationRules = [
  query("weekStart")
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage(
      "Week start must be a date in YYYY-MM-DD format.",
    ),

  query("fiscalYear")
    .optional()
    .matches(/^\d{4}$/)
    .withMessage(
      "Year must be four digits, for example 2026.",
    ),

  query("includePhotos")
    .optional()
    .isIn(["true", "false"])
    .withMessage(
      "Include photographs must be true or false.",
    ),

  query("fiscalWeek")
    .optional()
    .matches(/^\d{1,2}$/)
    .withMessage(
      "Week number must be one or two digits.",
    ),
];

export const yearlyReportValidationRules = [
  query("year")
    .matches(/^\d{4}$/)
    .withMessage(
      "Year must be four digits, for example 2026.",
    ),
];
