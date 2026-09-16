import {
  environment,
} from "../config/environment.js";

import {
  logger,
} from "../config/logger.js";

export function notFoundHandler(
  req,
  res,
) {
  res.status(404).json({
    message:
      `Route ${req.method} ${req.originalUrl} was not found.`,
    code: "ROUTE_NOT_FOUND",
  });
}

export function errorHandler(
  error,
  req,
  res,
  next,
) {
  const statusCode =
    error.statusCode ?? 500;

  const isProduction =
    environment.nodeEnvironment ===
    "production";

  logger.error(
    "HTTP request failed.",
    {
      method: req.method,
      path: req.originalUrl,
      statusCode,
      errorName: error.name,
      errorCode:
        error.code ??
        "INTERNAL_SERVER_ERROR",
      stack:
        isProduction
          ? undefined
          : error.stack,
    },
  );

  res.status(statusCode).json({
    message:
      statusCode >= 500
        ? "An unexpected server error occurred."
        : error.message,

    code:
      error.code ??
      "INTERNAL_SERVER_ERROR",

    details:
      error.details ?? undefined,

    stack:
      !isProduction &&
      statusCode >= 500
        ? error.stack
        : undefined,
  });
}