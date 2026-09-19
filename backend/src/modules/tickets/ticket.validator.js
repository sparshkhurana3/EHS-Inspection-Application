import {
  body,
  param,
} from "express-validator";

export const ticketIdValidationRules = [
  param("ticketId")
    .isInt({
      min: 1,
    })
    .withMessage(
      "Ticket ID must be a positive integer.",
    )
    .toInt(),
];

export const evidenceIdValidationRules = [
  ...ticketIdValidationRules,

  param("evidenceId")
    .isInt({
      min: 1,
    })
    .withMessage(
      "Evidence ID must be a positive integer.",
    )
    .toInt(),
];

export const acceptTicketValidationRules = [
  ...ticketIdValidationRules,

  body("comments")
    .trim()
    .notEmpty()
    .withMessage(
      "Comments are required.",
    )
    .bail()
    .isLength({
      min: 3,
      max: 1000,
    })
    .withMessage(
      "Comments must contain between 3 and 1000 characters.",
    ),

  body("correctiveActionTypeId")
    .notEmpty()
    .withMessage(
      "Select the type of corrective action.",
    )
    .bail()
    .isInt({
      min: 1,
    })
    .withMessage(
      "Corrective action type must be a positive integer.",
    )
    .toInt(),
];

export const rejectTicketValidationRules = [
  ...ticketIdValidationRules,

  body("comments")
    .trim()
    .notEmpty()
    .withMessage(
      "Comments are required.",
    )
    .bail()
    .isLength({
      min: 3,
      max: 1000,
    })
    .withMessage(
      "Comments must contain between 3 and 1000 characters.",
    ),

  body("correctiveActionTypeId")
    .optional({
      nullable: true,
    })
    .isInt({
      min: 1,
    })
    .withMessage(
      "Corrective action type must be a positive integer.",
    )
    .toInt(),
];

export const closeTicketValidationRules = [
  ...ticketIdValidationRules,

  body("completionNotes")
    .optional({
      nullable: true,
    })
    .trim()
    .isLength({
      max: 1000,
    })
    .withMessage(
      "Completion notes cannot exceed 1000 characters.",
    ),
];
