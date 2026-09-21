import * as patrolService
  from "./patrol.service.js";

export async function getPlanningLookups(
  req,
  res,
  next,
) {
  try {
    const result =
      await patrolService.getPlanningLookups({
        userId: req.user.id,
      });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function createPatrol(
  req,
  res,
  next,
) {
  try {
    const result =
      await patrolService.schedulePatrol({
        userId: req.user.id,
        zoneId: req.body.zoneId,
        scheduledDate: req.body.scheduledDate,
        auditorId: req.body.auditorId,
        auditeeId: req.body.auditeeId,
      });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function updatePatrolAssignment(
  req,
  res,
  next,
) {
  try {
    const result =
      await patrolService
        .updatePatrolAssignment({
          userId: req.user.id,
          patrolId: req.params.patrolId,
          auditorId: req.body.auditorId,
          auditeeId: req.body.auditeeId,
          applyToUpcoming:
            req.body.applyToUpcoming,
        });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getRoster(
  req,
  res,
  next,
) {
  try {
    const result =
      await patrolService.getRoster({
        userId: req.user.id,
      });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function uploadRoster(
  req,
  res,
  next,
) {
  try {
    const result =
      await patrolService.uploadRoster({
        userId: req.user.id,
        file: req.file,
      });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}
