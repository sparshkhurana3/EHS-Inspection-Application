import {
  body,
  param,
} from "express-validator";

const ALLOWED_PLANT_LOCATIONS = [
  "Gurugram",
  "Pune",
  "Chennai",
  "Manesar",
  "China",
];

const ALLOWED_CATEGORIES = [
  "UA",
  "UC",
];

const ALLOWED_RISK_CATEGORIES = [
  "HIGH",
  "MEDIUM",
  "LOW",
];

function countWords(value) {
  const normalizedValue =
    String(value ?? "").trim();

  if (!normalizedValue) {
    return 0;
  }

  return normalizedValue
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

export const observationReportIdValidationRules = [
  param("reportId")
    .isInt({
      min: 1,
    })
    .withMessage(
      "Observation report ID must be a positive integer.",
    )
    .toInt(),
];

export const createObservationValidationRules = [
  body("patrolId")
    .notEmpty()
    .withMessage(
      "Patrol ID is required.",
    )
    .bail()
    .isInt({
      min: 1,
    })
    .withMessage(
      "Patrol ID must be a positive integer.",
    )
    .toInt(),

  body("findingDate")
    .notEmpty()
    .withMessage(
      "Finding date is required.",
    )
    .bail()
    .isISO8601({
      strict: true,
    })
    .withMessage(
      "Finding date must be a valid date in YYYY-MM-DD format.",
    )
    .toDate(),

  body("location")
    .trim()
    .notEmpty()
    .withMessage(
      "Plant location is required.",
    )
    .bail()
    .isIn(ALLOWED_PLANT_LOCATIONS)
    .withMessage(
      "Plant location must be Gurugram, Pune, Chennai, Manesar, or China.",
    ),

  body("category")
    .trim()
    .notEmpty()
    .withMessage(
      "Observation category is required.",
    )
    .bail()
    .toUpperCase()
    .isIn(ALLOWED_CATEGORIES)
    .withMessage(
      "Observation category must be UA or UC.",
    ),

  body("description")
    .trim()
    .notEmpty()
    .withMessage(
      "Observation description is required.",
    )
    .bail()
    .custom((description) => {
      const wordCount =
        countWords(description);

      if (wordCount > 500) {
        throw new Error(
          "Observation description cannot exceed 500 words.",
        );
      }

      return true;
    }),

  body("riskCategory")
    .trim()
    .notEmpty()
    .withMessage(
      "Risk category is required.",
    )
    .bail()
    .toUpperCase()
    .isIn(ALLOWED_RISK_CATEGORIES)
    .withMessage(
      "Risk category must be High, Medium, or Low.",
    ),
];