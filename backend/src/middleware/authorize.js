import AppError
  from "../shared/errors/AppError.js";

export function authorize(
  ...allowedRoles
) {
  return function authorizationMiddleware(
    req,
    res,
    next,
  ) {
    // If the request has no user attribute, then throw error //
    if (!req.user) {
      next(
        new AppError(
          "Authentication is required.",
          401,
          "AUTHENTICATION_REQUIRED",
        ),
      );

      return;
    }

    // If the requested user role is in the array then return
    // the user role, otherwise return an empty array
    const userRoles =
      Array.isArray(req.user.roles)
        ? req.user.roles
        : [];

    // Authorize if and only if the user role exists in the allowed roles
    const authorized =
      userRoles.some((role) =>
        allowedRoles.includes(role),
      );

    // If there is no authorization then throw error
    if (!authorized) {
      next(
        new AppError(
          "You are not authorized to perform this action.",
          403,
          "INSUFFICIENT_PERMISSIONS",
        ),
      );

      return;
    }
    // Resume execution
    next();
  };
}