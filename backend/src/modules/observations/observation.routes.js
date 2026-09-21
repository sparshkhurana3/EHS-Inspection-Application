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
  getObservationHistory,
  getObservationReport,
  getObservationPhotograph,
  getObservationItemPhotograph,
  recordNoObservation,
} from "./observation.controller.js";

import {
  createObservationValidationRules,
  historyValidationRules,
  noObservationValidationRules,
  observationItemIdValidationRules,
  observationReportIdValidationRules,
} from "./observation.validator.js";

import {
  handleObservationUploadError,
  uploadObservationPhotographs,
} from "./observationUpload.js";

const router = Router();

router.get(
  "/current-assignments",
  authenticate,
  getWeeklyAssignments,
);

/*
 * Literal paths registered before the parameterised routes below so
 * "history" and "no-observation" are never parsed as a report id.
 */
router.get(
  "/history",
  authenticate,
  historyValidationRules,
  validate,
  getObservationHistory,
);

router.post(
  "/no-observation",
  authenticate,
  noObservationValidationRules,
  validate,
  recordNoObservation,
);

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

router.get(
  "/:reportId/items/:itemId/photograph",
  authenticate,
  observationItemIdValidationRules,
  validate,
  getObservationItemPhotograph,
);

router.post(
  "/",
  authenticate,
  uploadObservationPhotographs,
  handleObservationUploadError,
  createObservationValidationRules,
  validate,
  createObservation,
);

export default router;
