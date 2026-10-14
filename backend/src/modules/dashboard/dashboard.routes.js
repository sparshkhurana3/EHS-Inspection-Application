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
  getDashboard,
  getOfficerWeek,
} from "./dashboard.controller.js";

import {
  dashboardValidationRules,
  officerWeekValidationRules,
} from "./dashboard.validator.js";

import {
  PLANNING_ROLES,
} from "../../shared/constants/roles.js";

const router = Router();

router.get(
  "/",
  authenticate,
  dashboardValidationRules,
  validate,
  getDashboard,
);

/*
 * One week of the officer's plant for the dashboard week card, so it
 * can move between weeks and reload after a save without re-fetching
 * the whole dashboard.
 */
router.get(
  "/officer-week",
  authenticate,
  authorize(...PLANNING_ROLES),
  officerWeekValidationRules,
  validate,
  getOfficerWeek,
);

export default router;