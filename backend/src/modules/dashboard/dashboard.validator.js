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