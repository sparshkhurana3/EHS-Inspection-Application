import {
  body,
  param,
  query,
} from "express-validator";

const TICKET_HISTORY_FILTERS = [
  "all",
  "open",
  "in_progress",
  "pending_approval",
  "closed",
];

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

export const submitResolutionValidationRules = [
  ...ticketIdValidationRules,

  body("resolutionComments")
    .trim()
    .notEmpty()
    .withMessage(
      "Describe what was done before submitting the resolution.",
    )
    .bail()
    .isLength({
      min: 3,
      max: 1000,
    })
    .withMessage(
      "Resolution comments must contain between 3 and 1000 characters.",
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

export const ticketApprovalValidationRules = [
  ...ticketIdValidationRules,

  body("comments")
    .optional({
      nullable: true,
    })
    .trim()
    .isLength({
      max: 1000,
    })
    .withMessage(
      "Comments cannot exceed 1000 characters.",
    ),
];

export const ticketReopenValidationRules = [
  ...ticketIdValidationRules,

  body("comments")
    .trim()
    .notEmpty()
    .withMessage(
      "Explain what the Action Team HOD needs to redo before reopening the ticket.",
    )
    .bail()
    .isLength({
      min: 3,
      max: 1000,
    })
    .withMessage(
      "Comments must contain between 3 and 1000 characters.",
    ),
];

export const ticketHistoryValidationRules = [
  query("filter")
    .optional()
    .isIn(TICKET_HISTORY_FILTERS)
    .withMessage(
      "Invalid ticket history filter.",
    ),
];
