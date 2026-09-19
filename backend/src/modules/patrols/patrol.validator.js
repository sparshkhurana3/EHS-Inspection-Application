import {
  body,
  param,
} from "express-validator";

/*
 * The form submits identifiers, not names. The unit and the location
 * follow from the zone, and the areas follow from it too, so a single
 * zone id replaces the four free-text fields this endpoint used to
 * resolve by name.
 */
export const createPatrolValidationRules = [
  body("zoneId")
    .exists({
      checkNull: true,
      checkFalsy: true,
    })
    .withMessage("Zone is required.")
    .bail()
    .isInt({ min: 1 })
    .withMessage(
      "Zone must be a positive integer.",
    )
    .toInt(),

  body("scheduledDate")
    .exists({
      checkNull: true,
      checkFalsy: true,
    })
    .withMessage("Audit date is required.")
    .bail()
    .isISO8601({ strictSeparator: true })
    .withMessage(
      "Audit date must be a valid date in YYYY-MM-DD format.",
    )
    .bail()
    .custom((value) => {
      if (
        String(value).slice(0, 10) !==
        String(value)
      ) {
        throw new Error(
          "Audit date must not include a time component.",
        );
      }

      return true;
    }),

  body("auditorId")
    .exists({
      checkNull: true,
      checkFalsy: true,
    })
    .withMessage("Auditor is required.")
    .bail()
    .isInt({ min: 1 })
    .withMessage(
      "Auditor must be a positive integer.",
    )
    .toInt(),

  body("auditeeId")
    .exists({
      checkNull: true,
      checkFalsy: true,
    })
    .withMessage("Auditee is required.")
    .bail()
    .isInt({ min: 1 })
    .withMessage(
      "Auditee must be a positive integer.",
    )
    .toInt(),

  body()
    .custom((value) => {
      if (
        Number(value?.auditorId) ===
        Number(value?.auditeeId)
      ) {
        throw new Error(
          "The auditor and auditee must be different users.",
        );
      }

      return true;
    }),
];

export const updatePatrolAssignmentValidationRules = [
  param("patrolId")
    .isInt({ min: 1 })
    .withMessage(
      "Patrol ID must be a positive integer.",
    )
    .toInt(),

  body("auditorId")
    .exists({
      checkNull: true,
      checkFalsy: true,
    })
    .withMessage("Auditor is required.")
    .bail()
    .isInt({ min: 1 })
    .withMessage(
      "Auditor must be a positive integer.",
    )
    .toInt(),

  body("auditeeId")
    .exists({
      checkNull: true,
      checkFalsy: true,
    })
    .withMessage("Auditee is required.")
    .bail()
    .isInt({ min: 1 })
    .withMessage(
      "Auditee must be a positive integer.",
    )
    .toInt(),

  body()
    .custom((value) => {
      if (
        Number(value?.auditorId) ===
        Number(value?.auditeeId)
      ) {
        throw new Error(
          "The auditor and auditee must be different users.",
        );
      }

      return true;
    }),
];
