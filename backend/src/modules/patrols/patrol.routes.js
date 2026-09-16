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
  createPatrol,
  getPlanningLookups,
} from "./patrol.controller.js";

import {
  createPatrolValidationRules,
} from "./patrol.validator.js";

import {
  PLANNING_ROLES,
} from "../../shared/constants/roles.js";

const router = Router();

/*
 * Returns active registered users who can be selected
 * as auditors and auditees on the Planning page.
 */
router.get(
  "/planning-lookups",
  authenticate,
  authorize(...PLANNING_ROLES),
  getPlanningLookups,
);

/*
 * Creates a scheduled audit.
 *
 * Request flow:
 * authenticate
 * -> authorize EHS Officer
 * -> validate request
 * -> controller
 */
router.post(
  "/",
  authenticate,
  authorize(...PLANNING_ROLES),
  createPatrolValidationRules,
  validate,
  createPatrol,
);

export default router;