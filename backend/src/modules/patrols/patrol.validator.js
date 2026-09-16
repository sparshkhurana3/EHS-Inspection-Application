import {
  body,
} from "express-validator";

export const createPatrolValidationRules = [
  body("location")
    .exists({
      checkNull: true,
      checkFalsy: true,
    })
    .withMessage(
      "Location is required.",
    )
    .bail()
    .isString()
    .withMessage(
      "Location must be a text value.",
    )
    .bail()
    .trim()
    .isLength({
      min: 1,
      max: 100,
    })
    .withMessage(
      "Location must contain between 1 and 100 characters.",
    ),

  body("unit")
    .exists({
      checkNull: true,
      checkFalsy: true,
    })
    .withMessage(
      "Unit is required.",
    )
    .bail()
    .isString()
    .withMessage(
      "Unit must be a text value.",
    )
    .bail()
    .trim()
    .isLength({
      min: 1,
      max: 50,
    })
    .withMessage(
      "Unit must contain between 1 and 50 characters.",
    ),

  body("zone")
    .exists({
      checkNull: true,
      checkFalsy: true,
    })
    .withMessage(
      "Zone is required.",
    )
    .bail()
    .isString()
    .withMessage(
      "Zone must be a text value.",
    )
    .bail()
    .trim()
    .isLength({
      min: 1,
      max: 50,
    })
    .withMessage(
      "Zone must contain between 1 and 50 characters.",
    ),

  body("areaDetail")
    .exists({
      checkNull: true,
      checkFalsy: true,
    })
    .withMessage(
      "Area detail is required.",
    )
    .bail()
    .isString()
    .withMessage(
      "Area detail must be a text value.",
    )
    .bail()
    .trim()
    .isLength({
      min: 1,
      max: 255,
    })
    .withMessage(
      "Area detail must contain between 1 and 255 characters.",
    ),

  body("scheduledDate")
    .exists({
      checkNull: true,
      checkFalsy: true,
    })
    .withMessage(
      "Scheduled date is required.",
    )
    .bail()
    .isISO8601({
      strict: true,
      strictSeparator: true,
    })
    .withMessage(
      "Scheduled date must use YYYY-MM-DD format.",
    )
    .bail()
    .custom((value) => {
      const normalizedDate =
        String(value).slice(0, 10);

      if (normalizedDate !== value) {
        throw new Error(
          "Scheduled date must contain only the date in YYYY-MM-DD format.",
        );
      }

      return true;
    }),

  body("auditorId")
    .exists({
      checkNull: true,
      checkFalsy: true,
    })
    .withMessage(
      "Auditor is required.",
    )
    .bail()
    .isInt({
      min: 1,
    })
    .withMessage(
      "Auditor ID must be a positive integer.",
    )
    .toInt(),

  body("auditeeId")
    .exists({
      checkNull: true,
      checkFalsy: true,
    })
    .withMessage(
      "Auditee is required.",
    )
    .bail()
    .isInt({
      min: 1,
    })
    .withMessage(
      "Auditee ID must be a positive integer.",
    )
    .toInt(),

  body().custom((requestBody) => {
    const auditorId =
      Number(requestBody.auditorId);

    const auditeeId =
      Number(requestBody.auditeeId);

    /*
     * Let the field-level validators report missing
     * or invalid IDs.
     */
    if (
      !Number.isInteger(auditorId) ||
      !Number.isInteger(auditeeId)
    ) {
      return true;
    }

    if (auditorId === auditeeId) {
      throw new Error(
        "The auditor and auditee must be different users.",
      );
    }

    return true;
  }),
];