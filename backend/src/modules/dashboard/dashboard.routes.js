import {
  Router,
} from "express";

import {
  authenticate,
} from "../../middleware/authenticate.js";

import {
  validate,
} from "../../middleware/validate.js";

import {
  getDashboard,
} from "./dashboard.controller.js";

import {
  dashboardValidationRules,
} from "./dashboard.validator.js";

const router = Router();

router.get(
  "/",
  authenticate,
  dashboardValidationRules,
  validate,
  getDashboard,
);

export default router;