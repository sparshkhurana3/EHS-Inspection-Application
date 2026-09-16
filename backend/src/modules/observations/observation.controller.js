import * as observationService
  from "./observation.service.js";

import path from "node:path";

export async function getCurrentAssignment(
  req,
  res,
  next,
) {
  try {
    const result =
      await observationService
        .getCurrentAssignment({
          userId: req.user.id,
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

          location:
            req.body.location,

          category:
            req.body.category,

          description:
            req.body.description,

          riskCategory:
            req.body.riskCategory,

          photograph:
            req.file,
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

    res.type(photograph.mimeType);

    res.setHeader(
      "Content-Disposition",
      `inline; filename="${path.basename(
        photograph.originalName,
      )}"`,
    );

    res.setHeader(
      "Cache-Control",
      "private, max-age=300",
    );

    res.sendFile(
      photograph.absolutePath,
    );
  } catch (error) {
    next(error);
  }
}