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
  getCurrentClosure,
  saveActionPlan,
  submitClosure,
} from "./closure.controller.js";

import {
  saveActionPlanValidationRules,
} from "./closure.validator.js";

const router = Router();

router.get(
  "/current",
  authenticate,
  authorize("USER"),
  getCurrentClosure,
);

router.patch(
  "/:closureId/action-plan",
  authenticate,
  authorize("USER"),
  saveActionPlanValidationRules,
  validate,
  saveActionPlan,
);

router.post(
  "/:closureId/submit",
  authenticate,
  authorize("USER"),
  validate,
  submitClosure,
);

export default router;