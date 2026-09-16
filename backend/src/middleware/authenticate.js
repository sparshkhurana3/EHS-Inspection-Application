import jwt from "jsonwebtoken";

import {
  environment,
} from "../config/environment.js";

import AppError from "../shared/errors/AppError.js";

import {
  findUserById,
} from "../modules/auth/auth.repository.js";

export async function authenticate(
  req,
  res,
  next,
) {
  try {
    // Get the authorization header from the request
    const authorizationHeader =
      req.headers.authorization;

    // If authorization header exists and starts with Bearer continue
    // otherwise throw error
    if (
      !authorizationHeader ||
      !authorizationHeader.startsWith(
        "Bearer ",
      )
    ) {
      throw new AppError(
        "Authentication is required.",
        401,
        "AUTHENTICATION_REQUIRED",
      );
    }

    // Get the JWT from the authorization header
    const token =
      authorizationHeader.slice(7);

    // Verify the token and secret and see if the issuer and audience match
    const payload = jwt.verify(
      token,
      environment.authentication.jwtSecret,
      {
        issuer: "ehs-inspection-api",
        audience:
          "ehs-inspection-frontend",
      },
    );

    // If it is not an access token then throw error
    if (payload.tokenType !== "access") {
      throw new AppError(
        "The authentication token is invalid.",
        401,
        "INVALID_TOKEN_TYPE",
      );
    }

    // Find the user by ID in the Postgres database
    const user = await findUserById(
      Number(payload.sub),
    );

    // If the user does not exist or is inactive, throw error
    if (!user || !user.isActive) {
      throw new AppError(
        "The authenticated account is unavailable.",
        401,
        "ACCOUNT_UNAVAILABLE",
      );
    }

    // Map user attributes
    req.user = {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      roles: user.roles,
    };

    next();
  } catch (error) {
    if (
      error.name === "JsonWebTokenError"
    ) {
      next(
        new AppError(
          "The authentication token is invalid.",
          401,
          "INVALID_AUTHENTICATION_TOKEN",
        ),
      );

      return;
    }

    if (error.name === "TokenExpiredError") {
      next(
        new AppError(
          "The authentication session has expired.",
          401,
          "AUTHENTICATION_TOKEN_EXPIRED",
        ),
      );

      return;
    }
    // Continue execution
    next(error);
  }
}