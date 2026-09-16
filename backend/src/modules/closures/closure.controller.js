import * as closureService
  from "./closure.service.js";

export async function getCurrentClosure(
  req,
  res,
  next,
) {
  try {
    const result =
      await closureService
        .getCurrentClosure({
          userId: req.user.id,
        });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function saveActionPlan(
  req,
  res,
  next,
) {
  try {
    const result =
      await closureService
        .saveActionPlan({
          userId: req.user.id,

          closureId:
            req.params.closureId,

          actionPlan:
            req.body.actionPlan,

          targetDate:
            req.body.targetDate,

          responsibleHodName:
            req.body
              .responsibleHodName,
        });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function submitClosure(
  req,
  res,
  next,
) {
  try {
    const result =
      await closureService
        .submitClosure({
          userId: req.user.id,

          closureId:
            req.params.closureId,
        });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}