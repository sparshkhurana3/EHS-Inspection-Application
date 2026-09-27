import { Router } from "express";
import { rateLimit } from "express-rate-limit";

import {
  authenticate,
} from "../../middleware/authenticate.js";

import {
  validate,
} from "../../middleware/validate.js";

import {
  authProviders,
  currentUser,
  entraCallback,
  entraExchange,
  entraStart,
  login,
  signup,
} from "./auth.controller.js";

import {
  entraExchangeValidationRules,
  loginValidationRules,
  signupValidationRules,
} from "./auth.validator.js";

const router = Router();

const authenticationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message:
      "Too many authentication attempts. Try again after 15 minutes.",
    code:
      "AUTHENTICATION_RATE_LIMIT_EXCEEDED",
  },
});

/*
 * Deliberately far looser than the password limiter above, and counted
 * separately. Everyone on a company network reaches this API from the
 * same egress address, so a limit sized for guessing one person's
 * password would lock out the whole site the moment a shift changes.
 * The single sign-on endpoints do not accept a guessable secret: state
 * and the one-time code are 256-bit random values that the server
 * issued itself, so the limit here is about absorbing abuse, not about
 * slowing down guessing.
 */
const singleSignOnRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message:
      "Too many sign-in attempts from this network. Try again shortly.",
    code:
      "AUTHENTICATION_RATE_LIMIT_EXCEEDED",
  },
});

/*
 * Public and unauthenticated: the sign-in page has to know whether to
 * draw the Entra button before anybody has signed in.
 */
router.get(
  "/providers",
  authProviders,
);

/*
 * Visited by the browser, not by fetch. /start sends the person to
 * Microsoft and /callback is where Microsoft sends them back, so
 * neither can require a token and both answer with a redirect.
 */
router.get(
  "/entra/start",
  singleSignOnRateLimiter,
  entraStart,
);

router.get(
  "/entra/callback",
  singleSignOnRateLimiter,
  entraCallback,
);

/*
 * The single-page app trades the one-time code from that callback for
 * the same session envelope a password sign-in returns.
 */
router.post(
  "/entra/exchange",
  singleSignOnRateLimiter,
  entraExchangeValidationRules,
  validate,
  entraExchange,
);

router.post(
  "/signup",
  authenticationRateLimiter,
  signupValidationRules,
  validate,
  signup,
);

router.post(
  "/login",
  authenticationRateLimiter,
  loginValidationRules,
  validate,
  login,
);

router.get(
  "/me",
  authenticate,
  currentUser,
);

export default router;