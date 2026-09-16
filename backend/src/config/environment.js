import dotenv from "dotenv";

dotenv.config();

function requireEnvironmentVariable(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Required environment variable "${name}" is missing.`,
    );
  }

  return value;
}

function parsePositiveInteger(value, fallback) {
  const parsedValue = Number.parseInt(value, 10);

  if (
    Number.isNaN(parsedValue) ||
    parsedValue < 1
  ) {
    return fallback;
  }

  return parsedValue;
}

export const environment = Object.freeze({
  nodeEnvironment:
    process.env.NODE_ENV ?? "development",

  port: parsePositiveInteger(
    process.env.PORT,
    3000,
  ),

  database: {
    host: requireEnvironmentVariable(
      "DATABASE_HOST",
    ),

    port: parsePositiveInteger(
      process.env.DATABASE_PORT,
      5432,
    ),

    name: requireEnvironmentVariable(
      "DATABASE_NAME",
    ),

    user: requireEnvironmentVariable(
      "DATABASE_USER",
    ),

    password: requireEnvironmentVariable(
      "DATABASE_PASSWORD",
    ),

    ssl:
      process.env.DATABASE_SSL === "true",
  },

  authentication: {
    jwtSecret:
      requireEnvironmentVariable("JWT_SECRET"),

    jwtExpiresIn:
      process.env.JWT_EXPIRES_IN ?? "8h",

    passwordSaltRounds:
      parsePositiveInteger(
        process.env.PASSWORD_SALT_ROUNDS,
        12,
      ),
  },

  frontendOrigin:
    process.env.FRONTEND_ORIGIN ??
    "http://localhost:5173",
});
