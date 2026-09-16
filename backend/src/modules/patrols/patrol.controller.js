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
