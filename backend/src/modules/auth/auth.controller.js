import {
  environment,
} from "../../config/environment.js";

import {
  logger,
} from "../../config/logger.js";

import {
  sanitizeRedirectPath,
} from "./authSession.js";

import * as authService from "./auth.service.js";
import * as entraService from "./entra.service.js";

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
/**
 * Lets the sign-in page decide whether to draw the Entra button,
 * without it having to know how the server is configured.
 */
export function authProviders(req, res) {
  res.status(200).json(
    entraService.describeProviders(),
  );
}

/*
 * The two routes below are visited by the browser itself, not by fetch,
 * so neither can answer with JSON: a failure has to put the person back
 * on a page they can read and act on. That means errorHandler is
 * bypassed here and masking 5xx detail is this function's job.
 */
function redirectToSignIn(res, error) {
  const statusCode =
    error.statusCode ?? 500;

  logger.error(
    "Entra ID sign-in failed.",
    {
      statusCode,
      errorCode: error.code,
      errorName: error.name,
      reason: error.message,
    },
  );

  const message =
    statusCode >= 500 && !error.isOperational
      ? "Microsoft sign-in could not be completed. Sign in with your username and password instead."
      : error.message;

  const target = new URL(
    "/sign-in",
    environment.frontendOrigin,
  );

  target.searchParams.set(
    "ssoError",
    message,
  );

  res.redirect(302, target.toString());
}

export async function entraStart(
  req,
  res,
) {
  try {
    const authorizationUrl =
      await entraService.startLogin({
        redirectTo: req.query.redirectTo,
      });

    res.redirect(302, authorizationUrl);
  } catch (error) {
    redirectToSignIn(res, error);
  }
}

export async function entraCallback(
  req,
  res,
) {
  try {
    /*
     * Entra reports a refusal in the query string rather than by
     * failing the request: the person cancelled at the Microsoft
     * prompt, or consent or a conditional access policy stopped them.
     */
    if (req.query.error) {
      logger.warn(
        "Entra ID returned an error on the sign-in callback.",
        {
          entraError: req.query.error,
          entraErrorDescription:
            req.query.error_description,
        },
      );

      const wasCancelled =
        req.query.error === "access_denied";

      res.redirect(
        302,
        `${environment.frontendOrigin}/sign-in?ssoError=${
          encodeURIComponent(
            wasCancelled
              ? "Microsoft sign-in was cancelled."
              : "Microsoft sign-in was refused. Contact the EHS application administrator.",
          )
        }`,
      );

      return;
    }

    if (!req.query.code || !req.query.state) {
      res.redirect(
        302,
        `${environment.frontendOrigin}/sign-in?ssoError=${
          encodeURIComponent(
            "Microsoft sign-in did not complete. Start signing in again.",
          )
        }`,
      );

      return;
    }

    const { exchangeCode, redirectTo } =
      await entraService.completeCallback({
        code: String(req.query.code),
        state: String(req.query.state),
        requestContext:
          getRequestContext(req),
      });

    /*
     * The browser is handed a one-time code, never the session token
     * itself, so nothing reusable is written to browser history or to
     * any proxy log along the way.
     */
    const target = new URL(
      "/auth/entra/callback",
      environment.frontendOrigin,
    );

    target.searchParams.set(
      "code",
      exchangeCode,
    );

    const safeRedirect =
      sanitizeRedirectPath(redirectTo);

    if (safeRedirect) {
      target.searchParams.set(
        "redirectTo",
        safeRedirect,
      );
    }

    res.redirect(302, target.toString());
  } catch (error) {
    redirectToSignIn(res, error);
  }
}

export async function entraExchange(
  req,
  res,
  next,
) {
  try {
    const result =
      await entraService.exchangeSession({
        code: req.body.code,
      });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
