import bcrypt from "bcryptjs";

import {
  environment,
} from "../../config/environment.js";

import {
  withTransaction,
} from "../../config/database.js";

import {
  DEFAULT_SIGNUP_ROLE,
} from "../../shared/constants/roles.js";

import AppError from "../../shared/errors/AppError.js";

import {
  createAccessToken,
  createPublicUser,
  determineRedirectPath,
} from "./authSession.js";

import * as authRepository from "./auth.repository.js";

function normalizeUsername(username) {
  return username.trim().toLowerCase();
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export async function signup(
  {
    fullName,
    username,
    email,
    password,
  },
  requestContext,
) {
  if (!environment.selfSignupEnabled) {
    throw new AppError(
      "Self sign-up is turned off for this deployment. Sign in with your company Microsoft account, or ask the EHS application administrator for an account.",
      403,
      "SELF_SIGNUP_DISABLED",
    );
  }

  const normalizedUsername =
    normalizeUsername(username);

  const normalizedEmail =
    normalizeEmail(email);

  const existingUsername =
    await authRepository
      .findUserByUsernameOrEmail(
        normalizedUsername,
      );

  if (existingUsername) {
    throw new AppError(
      "The username is already registered.",
      409,
      "USERNAME_ALREADY_EXISTS",
    );
  }

  const existingEmail =
    await authRepository
      .findUserByUsernameOrEmail(
        normalizedEmail,
      );

  if (existingEmail) {
    throw new AppError(
      "The email address is already registered.",
      409,
      "EMAIL_ALREADY_EXISTS",
    );
  }

  const passwordHash = await bcrypt.hash(
    password,
    environment.authentication
      .passwordSaltRounds,
  );

  try {
    const createdUser =
      await withTransaction(
        async (client) => {
          const user =
            await authRepository.createUser(
              {
                fullName: fullName.trim(),
                username:
                  normalizedUsername,
                email: normalizedEmail,
                passwordHash,
                authenticationSource:
                  "LOCAL",
              },
              client,
            );

          await authRepository
            .assignRoleToUser(
              user.id,
              DEFAULT_SIGNUP_ROLE,
              client,
            );

          await authRepository
            .createAuthenticationEvent(
              {
                userId: user.id,
                usernameAttempted:
                  normalizedUsername,
                eventType: "SIGNUP",
                success: true,
                ipAddress:
                  requestContext.ipAddress,
                userAgent:
                  requestContext.userAgent,
              },
              client,
            );

          return {
            ...user,
            roles: [DEFAULT_SIGNUP_ROLE],
          };
        },
      );

    const token =
      createAccessToken(createdUser);

    return {
      message:
        "Your account was created successfully.",
      token,
      user: createPublicUser(createdUser),
      redirectTo:
        determineRedirectPath(
          createdUser.roles,
        ),
    };
  } catch (error) {
    if (error?.code === "23505") {
      throw new AppError(
        "The username or email address is already registered.",
        409,
        "ACCOUNT_ALREADY_EXISTS",
      );
    }

    throw error;
  }
}

export async function login(
  {
    identifier,
    password,
  },
  requestContext,
) {
  const normalizedIdentifier =
    identifier.trim().toLowerCase();

  const user =
    await authRepository
      .findUserByUsernameOrEmail(
        normalizedIdentifier,
      );

  if (!user) {
    await authRepository
      .createAuthenticationEvent({
        usernameAttempted:
          normalizedIdentifier,
        eventType: "LOGIN_FAILURE",
        success: false,
        ipAddress:
          requestContext.ipAddress,
        userAgent:
          requestContext.userAgent,
      });

    throw new AppError(
      "Invalid username, email, or password.",
      401,
      "INVALID_CREDENTIALS",
    );
  }

  if (!user.isActive) {
    throw new AppError(
      "This account has been disabled. Contact the EHS application administrator.",
      403,
      "ACCOUNT_DISABLED",
    );
  }

  if (
    user.lockedUntil &&
    new Date(user.lockedUntil) > new Date()
  ) {
    throw new AppError(
      "This account is temporarily locked due to repeated failed login attempts. Try again later.",
      423,
      "ACCOUNT_TEMPORARILY_LOCKED",
    );
  }

  /*
   * Password sign-in is the failsafe for the day Entra is unreachable,
   * so the test is "does this account have a password", not "was it
   * created locally". An account that started out local and has since
   * been linked to a directory identity keeps both routes in; an
   * account provisioned by Entra never had a password and has only one.
   */
  if (!user.passwordHash) {
    throw new AppError(
      "This account must sign in using Microsoft Entra ID.",
      400,
      "ENTRA_SIGN_IN_REQUIRED",
    );
  }

  const passwordMatches =
    await bcrypt.compare(
      password,
      user.passwordHash,
    );

  if (!passwordMatches) {
    await authRepository
      .recordFailedLogin(user.id);

    await authRepository
      .createAuthenticationEvent({
        userId: user.id,
        usernameAttempted:
          normalizedIdentifier,
        eventType: "LOGIN_FAILURE",
        success: false,
        ipAddress:
          requestContext.ipAddress,
        userAgent:
          requestContext.userAgent,
      });

    throw new AppError(
      "Invalid username, email, or password.",
      401,
      "INVALID_CREDENTIALS",
    );
  }

  await authRepository
    .recordSuccessfulLogin(user.id);

  await authRepository
    .createAuthenticationEvent({
      userId: user.id,
      usernameAttempted:
        normalizedIdentifier,
      eventType: "LOGIN",
      success: true,
      ipAddress:
        requestContext.ipAddress,
      userAgent:
        requestContext.userAgent,
    });

  const authenticatedUser = {
    ...user,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt:
      new Date().toISOString(),
  };

  const token =
    createAccessToken(authenticatedUser);

  return {
    message: "Sign-in successful.",
    token,
    user: createPublicUser(
      authenticatedUser,
    ),
    redirectTo:
      determineRedirectPath(
        authenticatedUser.roles,
      ),
  };
}

export async function getCurrentUser(userId) {
  const user =
    await authRepository.findUserById(
      userId,
    );

  if (!user || !user.isActive) {
    throw new AppError(
      "The authenticated user could not be found.",
      401,
      "AUTHENTICATED_USER_NOT_FOUND",
    );
  }

  return createPublicUser(user);
}