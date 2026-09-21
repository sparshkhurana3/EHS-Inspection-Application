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
  MANAGEMENT_ROLES,
  TICKET_ROLES,
} from "../../shared/constants/roles.js";

import {
  acceptTicket,
  addEvidence,
  approveTicket,
  getHodTicketHistory,
  getHodTickets,
  getPendingTicketApprovals,
  getTicketById,
  getTicketEvidence,
  getTicketLookups,
  rejectTicket,
  removeEvidence,
  reopenTicket,
  submitResolution,
} from "./ticket.controller.js";

import {
  acceptTicketValidationRules,
  evidenceIdValidationRules,
  rejectTicketValidationRules,
  submitResolutionValidationRules,
  ticketApprovalValidationRules,
  ticketHistoryValidationRules,
  ticketIdValidationRules,
  ticketReopenValidationRules,
} from "./ticket.validator.js";

import {
  handleTicketUploadError,
  uploadTicketEvidence,
} from "./ticketUpload.js";

const router = Router();

/*
 * The Action Team HOD's own list: open, in progress, waiting on the EHS
 * Officer, and closed in the last 30 days.
 */
router.get(
  "/",
  authenticate,
  authorize(...TICKET_ROLES),
  getHodTickets,
);

/*
 * Literal paths registered before "/:ticketId" so they are matched
 * first.
 */
router.get(
  "/lookups",
  authenticate,
  getTicketLookups,
);

/*
 * The HOD's six-month history, any status.
 */
router.get(
  "/history",
  authenticate,
  authorize(...TICKET_ROLES),
  ticketHistoryValidationRules,
  validate,
  getHodTicketHistory,
);

/*
 * The EHS Officer's ticket review queue. Deliberately not on the Ticket
 * page, which stays Action Team HOD only
 * (docs/17-ticket-refinement-plan.md, D7).
 */
router.get(
  "/pending-approvals",
  authenticate,
  authorize(...MANAGEMENT_ROLES),
  getPendingTicketApprovals,
);

/*
 * Readable by the assigned HOD, the auditee who assigned it, the
 * auditor, the patrol's EHS Officer, and management at that plant;
 * enforced in the repository's WHERE clause rather than by role, so no
 * authorize() here.
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

/*
 * The HOD sends the completed work to the EHS Officer; the officer is
 * the one who closes the ticket.
 */
router.post(
  "/:ticketId/submit-resolution",
  authenticate,
  authorize(...TICKET_ROLES),
  submitResolutionValidationRules,
  validate,
  submitResolution,
);

router.post(
  "/:ticketId/approve",
  authenticate,
  authorize(...MANAGEMENT_ROLES),
  ticketApprovalValidationRules,
  validate,
  approveTicket,
);

router.post(
  "/:ticketId/reopen",
  authenticate,
  authorize(...MANAGEMENT_ROLES),
  ticketReopenValidationRules,
  validate,
  reopenTicket,
);

export default router;
