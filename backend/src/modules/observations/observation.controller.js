import * as observationService
  from "./observation.service.js";

import {
  sendStoredFile,
} from "../../shared/storage/storedFiles.js";

export async function getWeeklyAssignments(
  req,
  res,
  next,
) {
  try {
    const result =
      await observationService
        .getWeeklyAssignments({
          userId: req.user.id,
        });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getObservationHistory(
  req,
  res,
  next,
) {
  try {
    const result =
      await observationService
        .getObservationHistory({
          user: req.user,
          filter:
            req.query.filter ?? "all",
        });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getObservationReport(
  req,
  res,
  next,
) {
  try {
    const result =
      await observationService
        .getObservationReport({
          userId: req.user.id,
          reportId: req.params.reportId,
        });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function createObservation(
  req,
  res,
  next,
) {
  try {
    const result =
      await observationService
        .submitObservation({
          userId: req.user.id,

          patrolId:
            req.body.patrolId,

          findingDate:
            req.body.findingDate,

          observations:
            req.body.observations,

          photographs:
            req.files,
        });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function recordNoObservation(
  req,
  res,
  next,
) {
  try {
    const result =
      await observationService
        .recordNoObservation({
          userId: req.user.id,
          patrolId:
            req.body.patrolId,
        });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getObservationPhotograph(
  req,
  res,
  next,
) {
  try {
    const photograph =
      await observationService
        .getObservationPhotograph({
          userId: req.user.id,
          reportId:
            req.params.reportId,
        });

    await sendStoredFile(
      res,
      photograph,
    );
  } catch (error) {
    next(error);
  }
}

export async function getObservationItemPhotograph(
  req,
  res,
  next,
) {
  try {
    const photograph =
      await observationService
        .getObservationItemPhotograph({
          userId: req.user.id,
          reportId:
            req.params.reportId,
          itemId:
            req.params.itemId,
        });

    await sendStoredFile(
      res,
      photograph,
    );
  } catch (error) {
    next(error);
  }
}
