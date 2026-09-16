import app from "./app.js";

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
    const databaseStatus =
      await verifyDatabaseConnection();

    logger.info(
      "PostgreSQL connection verified.",
      {
        databaseTime:
          databaseStatus.database_time,
      },
    );

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