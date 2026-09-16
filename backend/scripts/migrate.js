import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  databasePool,
} from "../src/config/database.js";

import { logger } from "../src/config/logger.js";

const MIGRATIONS_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "database",
  "migrations",
);

/**
 * Records which migration files have already run. Without this every
 * deploy would re-apply the whole directory and rely on each file being
 * idempotent, which is a guarantee that is easy to break by accident.
 */
async function ensureMigrationsTable(client) {
  await client.query(
    `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
  );
}

async function readAppliedMigrations(client) {
  const result = await client.query(
    "SELECT filename FROM schema_migrations",
  );

  return new Set(
    result.rows.map((row) => row.filename),
  );
}

async function readMigrationFiles() {
  const entries = await fs.readdir(
    MIGRATIONS_DIRECTORY,
  );

  return entries
    .filter((entry) => entry.endsWith(".sql"))
    .sort();
}

/*
 * Each migration runs inside its own transaction, so a failure leaves
 * the database on the last complete migration rather than half-way
 * through one. The files already open with BEGIN and end with COMMIT;
 * nesting is harmless in PostgreSQL beyond a warning, and the outer
 * transaction is what guarantees the bookkeeping row and the schema
 * change commit together.
 */
async function applyMigration(client, filename) {
  const sql = await fs.readFile(
    path.join(MIGRATIONS_DIRECTORY, filename),
    "utf8",
  );

  await client.query("BEGIN");

  try {
    await client.query(sql);

    await client.query(
      "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
      [filename],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function runMigrations() {
  const client = await databasePool.connect();

  try {
    await ensureMigrationsTable(client);

    const applied =
      await readAppliedMigrations(client);

    const files = await readMigrationFiles();

    const pending = files.filter(
      (file) => !applied.has(file),
    );

    if (pending.length === 0) {
      logger.info(
        "Database schema is up to date.",
        { migrations: files.length },
      );

      return;
    }

    for (const filename of pending) {
      await applyMigration(client, filename);

      logger.info("Migration applied.", {
        filename,
      });
    }

    logger.info("Migrations complete.", {
      applied: pending.length,
    });
  } finally {
    client.release();
  }
}

/*
 * Only run automatically when invoked directly (npm run migrate), not
 * when imported by the server.
 */
const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    fileURLToPath(import.meta.url);

if (invokedDirectly) {
  runMigrations()
    .then(async () => {
      await databasePool.end();
      process.exit(0);
    })
    .catch(async (error) => {
      logger.error("Migration failed.", {
        error: error.message,
      });

      await databasePool.end();
      process.exit(1);
    });
}
