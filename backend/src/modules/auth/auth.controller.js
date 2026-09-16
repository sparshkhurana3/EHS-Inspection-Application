import * as authService from "./auth.service.js";

function getRequestContext(req) {
  const forwardedFor =
    req.headers["x-forwarded-for"];

  const ipAddress =
    typeof forwardedFor === "string"
      ? forwardedFor
          .split(",")[0]
          .trim()
      : req.ip;

  return {
    ipAddress,
    userAgent:
      req.headers["user-agent"] ?? null,
  };
}

export async function signup(
  req,
  res,
  next,
) {
  try {
    const result =
      await authService.signup(
        {
          fullName: req.body.fullName,
          username: req.body.username,
          email: req.body.email,
          password: req.body.password,
        },
        getRequestContext(req),
      );

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function login(
  req,
  res,
  next,
) {
  try {
    const result =
      await authService.login(
        {
          identifier:
            req.body.identifier,
          password: req.body.password,
        },
        getRequestContext(req),
      );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function currentUser(
  req,
  res,
  next,
) {
  try {
    const user =
      await authService.getCurrentUser(
        req.user.id,
      );

    res.status(200).json({
      user,
    });
  } catch (error) {
    next(error);
  }
}