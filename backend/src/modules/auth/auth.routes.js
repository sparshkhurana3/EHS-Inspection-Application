import { Router } from "express";
import { rateLimit } from "express-rate-limit";

import {
  authenticate,
} from "../../middleware/authenticate.js";

import {
  validate,
} from "../../middleware/validate.js";

import {
  currentUser,
  login,
  signup,
} from "./auth.controller.js";

import {
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