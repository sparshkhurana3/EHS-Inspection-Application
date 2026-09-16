import {
  validationResult,
} from "express-validator";

import AppError from "../shared/errors/AppError.js";

export function validate(
  req,
  res,
  next,
) {
  const validationErrors =
    validationResult(req);

  if (validationErrors.isEmpty()) {
    next();
    return;
  }

  const details =
    validationErrors.array().map(
      (validationError) => ({
        field: validationError.path,
        message: validationError.msg,
      }),
    );

  next(
    new AppError(
      "The submitted data is invalid.",
      400,
      "VALIDATION_ERROR",
      details,
    ),
  );
}