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
  createObservation,
  getCurrentAssignment,
  getObservationPhotograph,
} from "./observation.controller.js";

import {
  createObservationValidationRules,
  observationReportIdValidationRules,
} from "./observation.validator.js";

import {
  handleObservationUploadError,
  uploadObservationPhotograph,
} from "./observationUpload.js";

const router = Router();

router.get(
  "/current-assignments",
  authenticate,
  authorize("USER"),
  getCurrentAssignments,
);

router.get(
  "/:reportId/photograph",
  authenticate,
  authorize("USER"),
  observationReportIdValidationRules,
  validate,
  getObservationPhotograph,
);

router.post(
  "/",
  authenticate,
  authorize("USER"),
  uploadObservationPhotograph,
  handleObservationUploadError,
  createObservationValidationRules,
  validate,
  createObservation,
);

export default router;