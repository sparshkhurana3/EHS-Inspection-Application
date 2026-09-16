import pg from "pg";
import { environment } from "./environment.js";

const { Pool } = pg;

export const databasePool = new Pool({
  host: environment.database.host,
  port: environment.database.port,
  database: environment.database.name,
  user: environment.database.user,
  password: environment.database.password,

  ssl: environment.database.ssl
    ? {
        rejectUnauthorized: true,
      }
    : false,

  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

databasePool.on("error", (error) => {
  console.error(
    "Unexpected idle PostgreSQL connection error:",
    error,
  );
});

export async function verifyDatabaseConnection() {
  const result = await databasePool.query(
    "SELECT NOW() AS database_time",
  );

  return result.rows[0];
}

export async function withTransaction(work) {
  const client =
    await databasePool.connect();

  try {
    await client.query("BEGIN");

    const result = await work(client);

    await client.query("COMMIT");

    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}