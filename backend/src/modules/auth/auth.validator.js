import {
  body,
} from "express-validator";

export const signupValidationRules = [
  body("fullName")
    .trim()
    .notEmpty()
    .withMessage("Full name is required.")
    .isLength({
      min: 2,
      max: 150,
    })
    .withMessage(
      "Full name must contain between 2 and 150 characters.",
    ),

  body("username")
    .trim()
    .notEmpty()
    .withMessage("Username is required.")
    .isLength({
      min: 3,
      max: 100,
    })
    .withMessage(
      "Username must contain between 3 and 100 characters.",
    )
    .matches(/^[a-zA-Z0-9._-]+$/)
    .withMessage(
      "Username may contain letters, numbers, periods, underscores, and hyphens only.",
    ),

  body("email")
    .trim()
    .notEmpty()
    .withMessage("Company email is required.")
    .isEmail()
    .withMessage(
      "Enter a valid company email address.",
    )
    .normalizeEmail(),

  body("password")
    .isString()
    .isLength({
      min: 8,
      max: 128,
    })
    .withMessage(
      "Password must contain between 8 and 128 characters.",
    )
    .matches(/[a-z]/)
    .withMessage(
      "Password must contain a lowercase letter.",
    )
    .matches(/[A-Z]/)
    .withMessage(
      "Password must contain an uppercase letter.",
    )
    .matches(/[0-9]/)
    .withMessage(
      "Password must contain a number.",
    )
    .matches(/[^a-zA-Z0-9]/)
    .withMessage(
      "Password must contain a special character.",
    ),

  body("confirmPassword")
    .custom((confirmPassword, { req }) => {
      if (
        confirmPassword !==
        req.body.password
      ) {
        throw new Error(
          "Password and confirm password do not match.",
        );
      }

      return true;
    }),
];

export const loginValidationRules = [
  body("identifier")
    .trim()
    .notEmpty()
    .withMessage(
      "Username or email is required.",
    )
    .isLength({
      max: 255,
    })
    .withMessage(
      "Username or email is too long.",
    ),

  body("password")
    .isString()
    .notEmpty()
    .withMessage("Password is required.")
    .isLength({
      max: 128,
    })
    .withMessage("Password is too long."),
];