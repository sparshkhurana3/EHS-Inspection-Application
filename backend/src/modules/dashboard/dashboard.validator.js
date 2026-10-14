import {
  query,
} from "express-validator";

export const dashboardValidationRules = [
  query("year")
    .optional()
    .isInt({
      min: 2020,
      max: 2100,
    })
    .withMessage(
      "Dashboard year must be between 2020 and 2100.",
    )
    .toInt(),

  query("month")
    .optional()
    .isInt({
      min: 1,
      max: 12,
    })
    .withMessage(
      "Dashboard month must be between 1 and 12.",
    )
    .toInt(),
];

/*
 * Only the shape is checked here; the service parses the date, moves
 * it to its Monday and bounds the year, because Express 5's req.query
 * does not keep sanitised values.
 */
export const officerWeekValidationRules = [
  query("weekStart")
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage(
      "Week start must be a date in YYYY-MM-DD format.",
    ),
];