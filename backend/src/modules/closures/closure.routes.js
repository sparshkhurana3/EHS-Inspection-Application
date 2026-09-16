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
} from "../../shared/constants/roles.js";

import {
  approveClosure,
  getAuditeeClosures,
  getClosureById,
  getPendingApprovals,
  rejectClosure,
  saveActionPlan,
  submitClosure,
} from "./closure.controller.js";

import {
  closureIdValidationRules,
  closureReviewValidationRules,
  rejectClosureValidationRules,
  saveActionPlanValidationRules,
} from "./closure.validator.js";

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

router.patch(
  "/:closureId/action-plan",
  authenticate,
  saveActionPlanValidationRules,
  validate,
  saveActionPlan,
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
