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
  createObservation,
  getWeeklyAssignments,
  getObservationReport,
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
  getWeeklyAssignments,
);

/*
 * Registered before the parameterised routes below so the literal path
 * is matched first.
 */
router.get(
  "/:reportId",
  authenticate,
  observationReportIdValidationRules,
  validate,
  getObservationReport,
);

router.get(
  "/:reportId/photograph",
  authenticate,
  observationReportIdValidationRules,
  validate,
  getObservationPhotograph,
);

router.post(
  "/",
  authenticate,
  uploadObservationPhotograph,
  handleObservationUploadError,
  createObservationValidationRules,
  validate,
  createObservation,
);

export default router;