import {
  body,
  param,
} from "express-validator";

export const closureIdValidationRules = [
  param("closureId")
    .isInt({
      min: 1,
    })
    .withMessage(
      "Closure ID must be a positive integer.",
    )
    .toInt(),
];

export const saveActionPlanValidationRules = [
  ...closureIdValidationRules,

  body("actionPlan")
    .trim()
    .notEmpty()
    .withMessage(
      "Action plan is required.",
    )
    .bail()
    .custom((value) => {
      const wordCount =
        String(value)
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .length;

      if (wordCount > 255) {
        throw new Error(
          "Action plan cannot exceed 255 words.",
        );
      }

      return true;
    }),

  body("targetDate")
    .notEmpty()
    .withMessage(
      "Target date is required.",
    )
    .bail()
    .isISO8601({
      strict: true,
    })
    .withMessage(
      "Target date must use YYYY-MM-DD format.",
    ),

  body("responsibleHodName")
    .trim()
    .notEmpty()
    .withMessage(
      "Responsible HOD name is required.",
    )
    .bail()
    .isLength({
      max: 255,
    })
    .withMessage(
      "Responsible HOD name cannot exceed 255 characters.",
    ),
];

export const closureReviewValidationRules = [
  ...closureIdValidationRules,

  body("reviewComments")
    .optional({
      nullable: true,
    })
    .trim()
    .isLength({
      max: 1000,
    })
    .withMessage(
      "Review comments cannot exceed 1000 characters.",
    ),
];

export const rejectClosureValidationRules = [
  ...closureIdValidationRules,

  body("reviewComments")
    .trim()
    .notEmpty()
    .withMessage(
      "Review comments are required when sending a report back for re-examination.",
    )
    .bail()
    .isLength({
      min: 3,
      max: 1000,
    })
    .withMessage(
      "Review comments must contain between 3 and 1000 characters.",
    ),
];