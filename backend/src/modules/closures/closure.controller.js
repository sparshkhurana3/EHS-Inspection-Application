import * as closureService
  from "./closure.service.js";

export async function getAuditeeClosures(
  req,
  res,
  next,
) {
  try {
    const result =
      await closureService.getAuditeeClosures({
        userId: req.user.id,
      });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getPendingApprovals(
  req,
  res,
  next,
) {
  try {
    const result =
      await closureService.getPendingApprovals({
        userId: req.user.id,
      });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getClosureById(
  req,
  res,
  next,
) {
  try {
    const result =
      await closureService.getClosureById({
        userId: req.user.id,
        closureId: req.params.closureId,
      });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function approveClosure(
  req,
  res,
  next,
) {
  try {
    const result =
      await closureService.approveClosure({
        userId: req.user.id,
        closureId: req.params.closureId,
        reviewComments: req.body.reviewComments,
      });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function rejectClosure(
  req,
  res,
  next,
) {
  try {
    const result =
      await closureService.rejectClosure({
        userId: req.user.id,
        closureId: req.params.closureId,
        reviewComments: req.body.reviewComments,
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

          actionHodId:
            req.body.actionHodId,
        });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getActionHodOptions(
  req,
  res,
  next,
) {
  try {
    const result =
      await closureService
        .getActionHodOptions({
          userId: req.user.id,

          closureId:
            req.params.closureId,
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