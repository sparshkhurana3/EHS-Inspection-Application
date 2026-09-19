import {
  Router,
} from "express";

import {
  authenticate,
} from "../../middleware/authenticate.js";

import {
  authorize,
} from "../../middleware/authorize.js";

import {
  validate,
} from "../../middleware/validate.js";

import {
  TICKET_ROLES,
} from "../../shared/constants/roles.js";

import {
  acceptTicket,
  addEvidence,
  closeTicket,
  getHodTickets,
  getTicketById,
  getTicketEvidence,
  getTicketLookups,
  rejectTicket,
  removeEvidence,
} from "./ticket.controller.js";

import {
  acceptTicketValidationRules,
  closeTicketValidationRules,
  evidenceIdValidationRules,
  rejectTicketValidationRules,
  ticketIdValidationRules,
} from "./ticket.validator.js";

import {
  handleTicketUploadError,
  uploadTicketEvidence,
} from "./ticketUpload.js";

const router = Router();

/*
 * The Action Team HOD's own list: open, in progress, and closed in the
 * last 30 days.
 */
router.get(
  "/",
  authenticate,
  authorize(...TICKET_ROLES),
  getHodTickets,
);

/*
 * Registered before "/:ticketId" so the literal path is matched first.
 */
router.get(
  "/lookups",
  authenticate,
  getTicketLookups,
);

/*
 * Readable by the assigned HOD, the auditee who assigned it, the
 * auditor, and the patrol's EHS Officer; enforced in the repository's
 * WHERE clause rather than by role, so no authorize() here.
 */
router.get(
  "/:ticketId",
  authenticate,
  ticketIdValidationRules,
  validate,
  getTicketById,
);

router.get(
  "/:ticketId/evidence/:evidenceId",
  authenticate,
  evidenceIdValidationRules,
  validate,
  getTicketEvidence,
);

router.post(
  "/:ticketId/accept",
  authenticate,
  authorize(...TICKET_ROLES),
  acceptTicketValidationRules,
  validate,
  acceptTicket,
);

router.post(
  "/:ticketId/reject",
  authenticate,
  authorize(...TICKET_ROLES),
  rejectTicketValidationRules,
  validate,
  rejectTicket,
);

/*
 * The ticket id is validated here, before multer runs, so a bad id
 * never writes files to disk.
 */
router.post(
  "/:ticketId/evidence",
  authenticate,
  authorize(...TICKET_ROLES),
  ticketIdValidationRules,
  validate,
  uploadTicketEvidence,
  handleTicketUploadError,
  addEvidence,
);

router.delete(
  "/:ticketId/evidence/:evidenceId",
  authenticate,
  authorize(...TICKET_ROLES),
  evidenceIdValidationRules,
  validate,
  removeEvidence,
);

router.post(
  "/:ticketId/close",
  authenticate,
  authorize(...TICKET_ROLES),
  closeTicketValidationRules,
  validate,
  closeTicket,
);

export default router;
