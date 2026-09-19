import fs from "node:fs";
import path from "node:path";

import app from "./app.js";

import {
  runMigrations,
} from "../scripts/migrate.js";

import {
  environment,
} from "./config/environment.js";

import {
  databasePool,
  verifyDatabaseConnection,
} from "./config/database.js";

import {
  logger,
} from "./config/logger.js";

let server;

async function startServer() {
  try {
    /*
     * multer's diskStorage destination callback does not create the
     * directory, so an image upload fails if it is missing. Creating it
     * here keeps the app working regardless of how it was deployed.
     */
    fs.mkdirSync(
      path.resolve(
        process.cwd(),
        "uploads",
        "observations",
      ),
      { recursive: true },
    );

    fs.mkdirSync(
      path.resolve(
        process.cwd(),
        "uploads",
        "tickets",
      ),
      { recursive: true },
    );

    const databaseStatus =
      await verifyDatabaseConnection();

    logger.info(
      "PostgreSQL connection verified.",
      {
        databaseTime:
          databaseStatus.database_time,
      },
    );

    await runMigrations();

    server = app.listen(
      environment.port,
      "0.0.0.0",
      () => {
        logger.info(
          "EHS API started.",
          {
            port: environment.port,
            healthEndpoint:
              `http://localhost:${environment.port}/api/health`,
          },
        );
      },
    );
  } catch (error) {
    logger.error(
      "Backend startup failed.",
      {
        error: error.message,
        stack: error.stack,
      },
    );

    process.exit(1);
  }
}

async function shutdown(signal) {
  logger.info(
    "Backend shutdown initiated.",
    {
      signal,
    },
  );

  if (server) {
    server.close(async () => {
      await databasePool.end();

      logger.info(
        "Backend shutdown completed.",
      );

      process.exit(0);
    });

    return;
  }

  await databasePool.end();
  process.exit(0);
}

process.on(
  "SIGTERM",
  () => shutdown("SIGTERM"),
);

process.on(
  "SIGINT",
  () => shutdown("SIGINT"),
);

startServer();