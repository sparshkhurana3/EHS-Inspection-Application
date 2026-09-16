import * as patrolService
  from "./patrol.service.js";

// Delete Patrol functionality to be added //

export async function getPlanningLookups(
  req,
  res,
  next,
) {
  try {
    const result =
      await patrolService
        .getPlanningLookups();

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
      await patrolService
        .schedulePatrol({
          userId:
            req.user.id,

          location:
            req.body.location,

          unit:
            req.body.unit,

          zone:
            req.body.zone,

          areaDetail:
            req.body.areaDetail,

          scheduledDate:
            req.body.scheduledDate,

          auditorId:
            req.body.auditorId,

          auditeeId:
            req.body.auditeeId,
        });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}