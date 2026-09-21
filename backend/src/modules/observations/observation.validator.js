import {
  body,
  param,
  query,
} from "express-validator";

const ALLOWED_CATEGORIES = [
  "UA",
  "UC",
];

const ALLOWED_RISK_CATEGORIES = [
  "HIGH",
  "MEDIUM",
  "LOW",
];

const MAX_OBSERVATIONS_PER_REPORT = 10;
const MAX_DESCRIPTION_WORDS = 500;

const ALLOWED_HISTORY_FILTERS = [
  "all",
  "closed",
  "no_observations",
  "in_progress",
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

/*
 * Validates and normalises one observation item from the parsed
 * `observations` array. Throws with the message prefixed by the
 * observation's 1-based position, so a bad item in a multi-observation
 * submission is identifiable.
 */
function normalizeObservationItem(
  item,
  index,
) {
  const label = `Observation ${index + 1}:`;

  if (!item || typeof item !== "object") {
    throw new Error(
      `${label} invalid observation data.`,
    );
  }

  const zoneAreaId = Number.parseInt(
    item.zoneAreaId,
    10,
  );

  if (
    !Number.isInteger(zoneAreaId) ||
    zoneAreaId < 1
  ) {
    throw new Error(
      `${label} select the area where the observation was made.`,
    );
  }

  const category = String(
    item.category ?? "",
  )
    .trim()
    .toUpperCase();

  if (
    !ALLOWED_CATEGORIES.includes(category)
  ) {
    throw new Error(
      `${label} select UA or UC as the observation category.`,
    );
  }

  const description = String(
    item.description ?? "",
  ).trim();

  if (!description) {
    throw new Error(
      `${label} enter the observation description.`,
    );
  }

  if (
    countWords(description) >
    MAX_DESCRIPTION_WORDS
  ) {
    throw new Error(
      `${label} description cannot exceed ${MAX_DESCRIPTION_WORDS} words.`,
    );
  }

  const riskCategory = String(
    item.riskCategory ?? "",
  )
    .trim()
    .toUpperCase();

  if (
    !ALLOWED_RISK_CATEGORIES.includes(
      riskCategory,
    )
  ) {
    throw new Error(
      `${label} select a valid risk category.`,
    );
  }

  return {
    zoneAreaId,
    category,
    description,
    riskCategory,
  };
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

export const observationItemIdValidationRules = [
  ...observationReportIdValidationRules,

  param("itemId")
    .isInt({ min: 1 })
    .withMessage(
      "Observation item ID must be a positive integer.",
    )
    .toInt(),
];

export const historyValidationRules = [
  query("filter")
    .optional()
    .isIn(ALLOWED_HISTORY_FILTERS)
    .withMessage(
      "Invalid history filter.",
    ),
];

export const noObservationValidationRules = [
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

  /*
   * `observations` is a JSON-encoded array (1-10 items) submitted as a
   * multipart text field alongside the `photographs` files, which
   * multer keeps in the same order (docs/15-observations-refinement-
   * plan.md, D11). Each item names the area the auditor found it in;
   * the service checks it belongs to this patrol's zone.
   */
  body("observations")
    .notEmpty()
    .withMessage(
      "Add at least one observation.",
    )
    .bail()
    .customSanitizer((value) => {
      if (Array.isArray(value)) {
        return value;
      }

      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    })
    .custom((items) => {
      if (
        !Array.isArray(items) ||
        items.length === 0
      ) {
        throw new Error(
          "Add at least one observation.",
        );
      }

      if (
        items.length >
        MAX_OBSERVATIONS_PER_REPORT
      ) {
        throw new Error(
          `Up to ${MAX_OBSERVATIONS_PER_REPORT} observations per report.`,
        );
      }

      items.forEach(
        normalizeObservationItem,
      );

      return true;
    })
    .customSanitizer((items) =>
      Array.isArray(items)
        ? items.map(
            normalizeObservationItem,
          )
        : items,
    ),
];
