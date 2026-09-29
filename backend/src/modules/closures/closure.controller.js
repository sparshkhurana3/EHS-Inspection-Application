import * as closureService
  from "./closure.service.js";

import {
  sendStoredFile,
} from "../../shared/storage/storedFiles.js";

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


export async function saveClosureItem(
  req,
  res,
  next,
) {
  try {
    const result =
      await closureService
        .saveClosureItem({
          userId: req.user.id,

          closureId:
            req.params.closureId,

          closureItemId:
            req.params.closureItemId,

          actionPlan:
            req.body.actionPlan,

          targetDate:
            req.body.targetDate,

          departmentId:
            req.body.departmentId,
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
export async function addClosureItemEvidence(
  req,
  res,
  next,
) {
  try {
    const result =
      await closureService
        .addClosureItemEvidence({
          userId: req.user.id,

          closureId:
            req.params.closureId,

          closureItemId:
            req.params.closureItemId,

          files: req.files,
        });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function deleteClosureItemEvidence(
  req,
  res,
  next,
) {
  try {
    const result =
      await closureService
        .deleteClosureItemEvidence({
          userId: req.user.id,

          closureId:
            req.params.closureId,

          closureItemId:
            req.params.closureItemId,

          evidenceId:
            req.params.evidenceId,
        });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getClosureItemEvidence(
  req,
  res,
  next,
) {
  try {
    const evidence =
      await closureService
        .getClosureItemEvidenceFile({
          userId: req.user.id,

          closureId:
            req.params.closureId,

          closureItemId:
            req.params.closureItemId,

          evidenceId:
            req.params.evidenceId,
        });

    await sendStoredFile(
      res,
      evidence,
    );
  } catch (error) {
    next(error);
  }
}
