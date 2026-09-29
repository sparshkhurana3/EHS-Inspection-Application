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
  discardUploadsOnError,
} from "../../middleware/storeUploadedFiles.js";

import {
  MANAGEMENT_ROLES,
} from "../../shared/constants/roles.js";

import {
  addClosureItemEvidence,
  approveClosure,
  deleteClosureItemEvidence,
  getAuditeeClosures,
  getClosureById,
  getClosureItemEvidence,
  getPendingApprovals,
  rejectClosure,
  saveClosureItem,
  submitClosure,
} from "./closure.controller.js";

import {
  closureEvidenceValidationRules,
  closureIdValidationRules,
  closureItemValidationRules,
  closureReviewValidationRules,
  rejectClosureValidationRules,
  saveClosureItemValidationRules,
} from "./closure.validator.js";

import {
  compressClosureEvidence,
  handleClosureUploadError,
  storeClosureEvidence,
  uploadClosureEvidence,
} from "./closureUpload.js";

const router = Router();

/*
 * The auditee's page: pending, lapsed, and completed in the last week.
 * Every query below is scoped by membership of the patrol in SQL, so no
 * role gate is needed and management accounts are not wrongly excluded.
 */
router.get(
  "/",
  authenticate,
  getAuditeeClosures,
);

/*
 * The EHS Officer's review queue. Registered before "/:closureId" so
 * the literal path is matched first.
 */
router.get(
  "/pending-approvals",
  authenticate,
  authorize(...MANAGEMENT_ROLES),
  getPendingApprovals,
);

router.get(
  "/:closureId",
  authenticate,
  closureIdValidationRules,
  validate,
  getClosureById,
);

/*
 * One action plan per observation: the item id says which observation
 * on this closure's report the plan belongs to.
 */
router.patch(
  "/:closureId/items/:closureItemId/action-plan",
  authenticate,
  saveClosureItemValidationRules,
  validate,
  saveClosureItem,
);

/*
 * Evidence that an observation's action plan was carried out: up to
 * three photographs, attached by the auditee.
 *
 * The upload middleware runs before validation because multer is what
 * parses a multipart body; the route parameters are checked straight
 * afterwards, before anything touches the database. Compression comes
 * last, so a request that fails validation never decodes its images.
 */
router.post(
  "/:closureId/items/:closureItemId/evidence",
  authenticate,
  uploadClosureEvidence,
  handleClosureUploadError,
  closureItemValidationRules,
  validate,
  compressClosureEvidence,
  storeClosureEvidence,
  discardUploadsOnError,
  addClosureItemEvidence,
);

router.delete(
  "/:closureId/items/:closureItemId/evidence/:evidenceId",
  authenticate,
  closureEvidenceValidationRules,
  validate,
  deleteClosureItemEvidence,
);

/*
 * Served through an authenticated route rather than as a static file,
 * so the closure's own read rules decide who sees the photograph.
 */
router.get(
  "/:closureId/items/:closureItemId/evidence/:evidenceId",
  authenticate,
  closureEvidenceValidationRules,
  validate,
  getClosureItemEvidence,
);

/*
 * closureId is validated here too. It previously ran `validate` with no
 * rules, so a non-numeric id reached PostgreSQL and surfaced as a 500.
 */
router.post(
  "/:closureId/submit",
  authenticate,
  closureIdValidationRules,
  validate,
  submitClosure,
);

/*
 * Only an EHS Officer can complete a closure.
 */
router.post(
  "/:closureId/approve",
  authenticate,
  authorize(...MANAGEMENT_ROLES),
  closureReviewValidationRules,
  validate,
  approveClosure,
);

router.post(
  "/:closureId/reject",
  authenticate,
  authorize(...MANAGEMENT_ROLES),
  rejectClosureValidationRules,
  validate,
  rejectClosure,
);

export default router;
