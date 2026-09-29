import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import bcrypt from "bcryptjs";
import { parse as parseCsv } from "csv-parse/sync";

import {
  databasePool,
  withTransaction,
} from "../src/config/database.js";

import {
  environment,
} from "../src/config/environment.js";

import {
  USER_ROLES,
  normalizeRole,
} from "../src/shared/constants/roles.js";

/*
 * Account administration from the command line, for the jobs that have
 * no screen: creating break-glass accounts once self sign-up is closed,
 * resetting their passwords, and setting the plant an account belongs
 * to (Entra provisions accounts without one). Run inside the backend
 * container so it uses the deployment's own database settings:
 *
 *   docker compose exec backend node scripts/admin.js help
 *
 * Passwords are generated, never typed, so none ever lands in shell
 * history; each is printed once and must be stored in the password
 * safe straight away.
 */

const USAGE = `
Usage: node scripts/admin.js <command> [options]

  create-local-user --username <name> --email <address> --full-name "<name>"
                    [--role <ROLE>]... [--plant <code|name|id>]
      Creates a password account (a break-glass account) and prints its
      generated password once. Every account also gets USER.

  reset-password --user <username|email>
      Generates and prints a new password and clears any lockout.

  set-plant --user <username|email> --plant <code|name|id|none>
      Sets the location an account belongs to. EHS Officers need one to
      plan audits and download the inspection report.

  import-users --file <path.csv | -> [--dry-run]
      Creates or updates accounts in bulk from a CSV with the columns
      Email, Name and Plant (code or name), so the weekly roster can name
      people before they have ever signed in. New accounts have no
      password and are linked to Entra ID by email at their first
      sign-in; existing accounts get their plant set. All rows or none.
      Use "--file -" to read the CSV from standard input.

  grant-role --user <username|email> --role <ROLE>
  revoke-role --user <username|email> --role <ROLE>
      Only lasting for accounts that do not sign in with Entra ID:
      Entra rewrites an SSO account's roles at every sign-in.

  deactivate-user --user <username|email>
  activate-user --user <username|email>
      A deactivated account is refused on its very next request, even
      mid-session, and drops out of the auditor/auditee choices. Use it
      for leavers: disabling someone in Entra only stops new sign-ins.

  reassign-officer --from <username|email> --to <username|email>
      Hands every open patrol (not completed or cancelled) from one EHS
      Officer to another, so the new officer can approve their closures.

  list-users [--role <ROLE>]
  list-plants

Roles: ${Object.values(USER_ROLES).join(", ")}
`;

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,100}$/;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class UsageError extends Error {}

function requireOption(options, name) {
  const value = options[name];

  if (
    value === undefined ||
    String(value).trim() === ""
  ) {
    throw new UsageError(
      `--${name} is required.`,
    );
  }

  return String(value).trim();
}

function parseRole(value) {
  const role = normalizeRole(value);

  if (
    !Object.values(USER_ROLES).includes(role)
  ) {
    throw new UsageError(
      `"${value}" is not a role. Use one of: ${Object.values(USER_ROLES).join(", ")}.`,
    );
  }

  return role;
}

/**
 * 20 characters with at least one of each class the sign-up rules
 * demand, so a generated password also passes the password form.
 */
function generatePassword() {
  const classes = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "abcdefghijkmnopqrstuvwxyz",
    "23456789",
    "!#%+-=?@^_",
  ];

  const everything = classes.join("");

  const characters = [
    ...classes.map(
      (set) => set[crypto.randomInt(set.length)],
    ),

    ...Array.from(
      { length: 16 },
      () =>
        everything[
          crypto.randomInt(everything.length)
        ],
    ),
  ];

  for (
    let index = characters.length - 1;
    index > 0;
    index -= 1
  ) {
    const swapIndex = crypto.randomInt(
      index + 1,
    );

    [characters[index], characters[swapIndex]] =
      [characters[swapIndex], characters[index]];
  }

  return characters.join("");
}

async function findUser(identifier, client) {
  const result = await client.query(
    `
      SELECT
        id,
        full_name,
        username,
        email,
        password_hash IS NOT NULL AS has_password,
        entra_object_id IS NOT NULL AS is_entra_linked
      FROM users
      WHERE LOWER(username) = LOWER($1)
         OR LOWER(email) = LOWER($1)
    `,
    [identifier],
  );

  if (result.rows.length === 0) {
    throw new UsageError(
      `No account matches "${identifier}".`,
    );
  }

  return result.rows[0];
}

async function findPlant(reference, client) {
  const result = await client.query(
    `
      SELECT id, name, code, is_active
      FROM plants
      WHERE id::TEXT = $1
         OR LOWER(code) = LOWER($1)
         OR LOWER(name) = LOWER($1)
      ORDER BY id
    `,
    [reference],
  );

  if (result.rows.length === 0) {
    throw new UsageError(
      `No plant matches "${reference}". Run list-plants to see them.`,
    );
  }

  if (result.rows.length > 1) {
    throw new UsageError(
      `"${reference}" matches ${result.rows.length} plants (${result.rows
        .map((plant) => `${plant.code} #${plant.id}`)
        .join(", ")}). Use the code or the id.`,
    );
  }

  return result.rows[0];
}

async function assignRole(userId, role, client) {
  await client.query(
    `
      INSERT INTO user_roles (user_id, role_id)
      SELECT $1, id FROM roles WHERE code = $2
      ON CONFLICT (user_id, role_id) DO NOTHING
    `,
    [userId, role],
  );
}

function warnIfEntraLinked(user) {
  if (user.is_entra_linked) {
    console.warn(
      `Warning: ${user.username} signs in with Entra ID, which rewrites this account's roles at every sign-in. Assign the app role in the Microsoft Entra admin center instead.`,
    );
  }
}

async function createLocalUser(options) {
  const username = requireOption(
    options,
    "username",
  ).toLowerCase();

  const email = requireOption(
    options,
    "email",
  ).toLowerCase();

  const fullName = requireOption(
    options,
    "full-name",
  );

  if (!USERNAME_PATTERN.test(username)) {
    throw new UsageError(
      "--username must be 3-100 characters: letters, digits, dot, underscore or hyphen.",
    );
  }

  if (!EMAIL_PATTERN.test(email)) {
    throw new UsageError(
      "--email is not a valid email address.",
    );
  }

  if (
    fullName.length < 2 ||
    fullName.length > 150
  ) {
    throw new UsageError(
      "--full-name must be 2-150 characters.",
    );
  }

  const roles = [
    USER_ROLES.USER,
    ...(options.role ?? []).map(parseRole),
  ];

  const password = generatePassword();

  const passwordHash = await bcrypt.hash(
    password,
    environment.authentication
      .passwordSaltRounds,
  );

  const user = await withTransaction(
    async (client) => {
      const existing = await client.query(
        `
          SELECT username
          FROM users
          WHERE LOWER(username) = $1
             OR LOWER(email) = $2
        `,
        [username, email],
      );

      if (existing.rows.length > 0) {
        throw new UsageError(
          "An account with that username or email already exists.",
        );
      }

      const plant = options.plant
        ? await findPlant(
            options.plant,
            client,
          )
        : null;

      const created = await client.query(
        `
          INSERT INTO users (
            full_name,
            username,
            email,
            password_hash,
            authentication_source,
            plant_id
          )
          VALUES ($1, $2, $3, $4, 'LOCAL', $5)
          RETURNING id, username
        `,
        [
          fullName,
          username,
          email,
          passwordHash,
          plant?.id ?? null,
        ],
      );

      for (const role of new Set(roles)) {
        await assignRole(
          created.rows[0].id,
          role,
          client,
        );
      }

      return {
        ...created.rows[0],
        plant,
      };
    },
  );

  console.log(
    `Created ${user.username} (id ${user.id}) with roles ${[
      ...new Set(roles),
    ].join(", ")}${
      user.plant
        ? ` at ${user.plant.name} (${user.plant.code})`
        : ""
    }.`,
  );

  console.log(
    `Password (shown once, store it in the password safe now): ${password}`,
  );
}

async function resetPassword(options) {
  const identifier = requireOption(
    options,
    "user",
  );

  const user = await findUser(
    identifier,
    databasePool,
  );

  const password = generatePassword();

  const passwordHash = await bcrypt.hash(
    password,
    environment.authentication
      .passwordSaltRounds,
  );

  await databasePool.query(
    `
      UPDATE users
      SET
        password_hash = $2,
        failed_login_attempts = 0,
        locked_until = NULL,
        updated_at = NOW()
      WHERE id = $1
    `,
    [user.id, passwordHash],
  );

  console.log(
    `New password for ${user.username} (shown once, store it in the password safe now): ${password}`,
  );

  if (user.is_entra_linked) {
    console.warn(
      `Note: ${user.username} is linked to Entra ID and can now also sign in with this password.`,
    );
  }
}

async function setPlant(options) {
  const user = await findUser(
    requireOption(options, "user"),
    databasePool,
  );

  const reference = requireOption(
    options,
    "plant",
  );

  const plant =
    reference.toLowerCase() === "none"
      ? null
      : await findPlant(
          reference,
          databasePool,
        );

  await databasePool.query(
    `
      UPDATE users
      SET plant_id = $2, updated_at = NOW()
      WHERE id = $1
    `,
    [user.id, plant?.id ?? null],
  );

  console.log(
    plant
      ? `${user.username} now belongs to ${plant.name} (${plant.code}).`
      : `${user.username} no longer belongs to a plant.`,
  );
}

async function changeRole(options, grant) {
  const user = await findUser(
    requireOption(options, "user"),
    databasePool,
  );

  const role = parseRole(
    requireOption(options, "role"),
  );

  warnIfEntraLinked(user);

  if (grant) {
    await assignRole(
      user.id,
      role,
      databasePool,
    );
  } else {
    await databasePool.query(
      `
        DELETE FROM user_roles
        WHERE user_id = $1
          AND role_id = (
            SELECT id FROM roles WHERE code = $2
          )
      `,
      [user.id, role],
    );
  }

  console.log(
    `${grant ? "Granted" : "Revoked"} ${role} ${
      grant ? "to" : "from"
    } ${user.username}.`,
  );
}

function normaliseHeader(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/**
 * The same derivation Entra sign-in uses for a new account, so an
 * imported account looks exactly like one provisioned at sign-in.
 */
async function availableUsername(email, client) {
  const base =
    email
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "")
      .slice(0, 80) || "user";

  let candidate = base.length >= 3
    ? base
    : `${base}.user`;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const taken = await client.query(
      `
        SELECT 1
        FROM users
        WHERE LOWER(username) = $1
      `,
      [candidate],
    );

    if (taken.rows.length === 0) {
      return candidate;
    }

    candidate = `${base}.${crypto
      .randomBytes(3)
      .toString("hex")}`;
  }

  throw new Error(
    `Could not find a free username for ${email}.`,
  );
}

async function importUsers(options) {
  const source = requireOption(
    options,
    "file",
  );

  const text =
    source === "-"
      ? await new Promise((resolve, reject) => {
          const chunks = [];

          process.stdin.on("data", (chunk) =>
            chunks.push(chunk),
          );
          process.stdin.on("end", () =>
            resolve(
              Buffer.concat(chunks).toString(
                "utf8",
              ),
            ),
          );
          process.stdin.on("error", reject);
        })
      : await readFile(source, "utf8");

  const records = parseCsv(text, {
    bom: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  if (records.length < 2) {
    throw new UsageError(
      "The CSV needs a header row (Email, Name, Plant) and at least one person.",
    );
  }

  const headers = records[0].map(
    normaliseHeader,
  );

  const column = (...names) =>
    headers.findIndex((header) =>
      names.includes(header),
    );

  const emailColumn = column(
    "email",
    "emailaddress",
  );

  const nameColumn = column(
    "name",
    "fullname",
    "displayname",
  );

  const plantColumn = column(
    "plant",
    "plantcode",
    "location",
  );

  if (
    emailColumn < 0 ||
    nameColumn < 0 ||
    plantColumn < 0
  ) {
    throw new UsageError(
      "The CSV must have the columns Email, Name and Plant.",
    );
  }

  const rows = records
    .slice(1)
    .map((record, index) => ({
      line: index + 2,
      email: String(
        record[emailColumn] ?? "",
      ).toLowerCase(),
      fullName: String(
        record[nameColumn] ?? "",
      ),
      plant: String(
        record[plantColumn] ?? "",
      ),
    }))
    .filter(
      (row) =>
        row.email ||
        row.fullName ||
        row.plant,
    );

  const errors = [];
  const seen = new Map();

  let created = 0;
  let updated = 0;

  try {
    await withTransaction(async (client) => {
      for (const row of rows) {
        if (!EMAIL_PATTERN.test(row.email)) {
          errors.push(
            `Line ${row.line}: "${row.email}" is not an email address.`,
          );

          continue;
        }

        if (seen.has(row.email)) {
          errors.push(
            `Line ${row.line}: ${row.email} already appears on line ${seen.get(row.email)}.`,
          );

          continue;
        }

        seen.set(row.email, row.line);

        let plant;

        try {
          plant = await findPlant(
            row.plant,
            client,
          );
        } catch (error) {
          errors.push(
            `Line ${row.line}: ${error.message}`,
          );

          continue;
        }

        const existing = await client.query(
          `
            SELECT id
            FROM users
            WHERE LOWER(email) = $1
          `,
          [row.email],
        );

        if (existing.rows.length > 0) {
          await client.query(
            `
              UPDATE users
              SET plant_id = $2, updated_at = NOW()
              WHERE id = $1
            `,
            [existing.rows[0].id, plant.id],
          );

          updated += 1;

          continue;
        }

        const fullName =
          row.fullName ||
          row.email.split("@")[0];

        if (fullName.length > 150) {
          errors.push(
            `Line ${row.line}: the name is longer than 150 characters.`,
          );

          continue;
        }

        await client.query(
          `
            INSERT INTO users (
              full_name,
              username,
              email,
              password_hash,
              authentication_source,
              plant_id
            )
            VALUES ($1, $2, $3, NULL, 'ENTRA', $4)
          `,
          [
            fullName,
            await availableUsername(
              row.email,
              client,
            ),
            row.email,
            plant.id,
          ],
        );

        created += 1;
      }

      if (errors.length > 0 || options["dry-run"]) {
        throw new UsageError("rollback");
      }
    });
  } catch (error) {
    if (
      !(error instanceof UsageError) ||
      error.message !== "rollback"
    ) {
      throw error;
    }
  }

  if (errors.length > 0) {
    errors.forEach((message) =>
      console.error(message),
    );

    throw new UsageError(
      `Nothing was imported: fix the ${errors.length} problem(s) above and run it again.`,
    );
  }

  console.log(
    `${options["dry-run"] ? "Dry run - would create" : "Created"} ${created}, ${
      options["dry-run"] ? "would update" : "updated"
    } ${updated} (${rows.length} row(s)).`,
  );
}

async function setActive(options, active) {
  const user = await findUser(
    requireOption(options, "user"),
    databasePool,
  );

  await databasePool.query(
    `
      UPDATE users
      SET is_active = $2, updated_at = NOW()
      WHERE id = $1
    `,
    [user.id, active],
  );

  console.log(
    `${user.username} is now ${
      active ? "active" : "deactivated"
    }.`,
  );
}

async function reassignOfficer(options) {
  const from = await findUser(
    requireOption(options, "from"),
    databasePool,
  );

  const to = await findUser(
    requireOption(options, "to"),
    databasePool,
  );

  if (Number(from.id) === Number(to.id)) {
    throw new UsageError(
      "--from and --to are the same account.",
    );
  }

  const roles = await databasePool.query(
    `
      SELECT r.code
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1
    `,
    [to.id],
  );

  if (
    !roles.rows.some((row) =>
      ["EHS_OFFICER", "ADMIN"].includes(
        row.code,
      ),
    )
  ) {
    console.warn(
      `Warning: ${to.username} holds neither EHS_OFFICER nor ADMIN, so cannot approve closures until they do.`,
    );
  }

  const result = await databasePool.query(
    `
      UPDATE patrols
      SET ehs_officer_id = $2, updated_at = NOW()
      WHERE ehs_officer_id = $1
        AND status NOT IN ('COMPLETED', 'CANCELLED')
    `,
    [from.id, to.id],
  );

  console.log(
    `Moved ${result.rowCount} open patrol(s) from ${from.username} to ${to.username}.`,
  );
}

async function listUsers(options) {
  const role = options.role
    ? parseRole(options.role)
    : null;

  const result = await databasePool.query(
    `
      SELECT
        u.username,
        u.email,
        u.is_active,
        u.password_hash IS NOT NULL AS has_password,
        u.entra_object_id IS NOT NULL AS is_entra_linked,
        plant.code AS plant_code,
        COALESCE(
          STRING_AGG(r.code, ',' ORDER BY r.code),
          ''
        ) AS roles
      FROM users u
      LEFT JOIN plants plant
        ON plant.id = u.plant_id
      LEFT JOIN user_roles ur
        ON ur.user_id = u.id
      LEFT JOIN roles r
        ON r.id = ur.role_id
      GROUP BY u.id, plant.code
      HAVING $1::TEXT IS NULL
          OR BOOL_OR(r.code = $1)
      ORDER BY u.username
    `,
    [role],
  );

  console.table(
    result.rows.map((row) => ({
      username: row.username,
      email: row.email,
      active: row.is_active,
      password: row.has_password,
      entra: row.is_entra_linked,
      plant: row.plant_code ?? "",
      roles: row.roles,
    })),
  );
}

async function listPlants() {
  const result = await databasePool.query(
    `
      SELECT id, code, name, is_active
      FROM plants
      ORDER BY name, id
    `,
  );

  console.table(result.rows);
}

async function main() {
  const [command, ...rest] =
    process.argv.slice(2);

  const { values: options } = parseArgs({
    args: rest,
    options: {
      username: { type: "string" },
      email: { type: "string" },
      "full-name": { type: "string" },
      role: { type: "string", multiple: true },
      plant: { type: "string" },
      user: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
      file: { type: "string" },
      "dry-run": { type: "boolean" },
    },
    strict: true,
  });

  const singleRole = {
    ...options,
    role: options.role?.[0],
  };

  switch (command) {
    case "create-local-user":
      return createLocalUser(options);
    case "reset-password":
      return resetPassword(options);
    case "set-plant":
      return setPlant(options);
    case "grant-role":
      return changeRole(singleRole, true);
    case "revoke-role":
      return changeRole(singleRole, false);
    case "import-users":
      return importUsers(options);
    case "deactivate-user":
      return setActive(options, false);
    case "activate-user":
      return setActive(options, true);
    case "reassign-officer":
      return reassignOfficer(options);
    case "list-users":
      return listUsers(singleRole);
    case "list-plants":
      return listPlants();
    case undefined:
    case "help":
    case "--help":
      console.log(USAGE);
      return undefined;
    default:
      throw new UsageError(
        `Unknown command "${command}".`,
      );
  }
}

try {
  await main();
} catch (error) {
  if (
    error instanceof UsageError ||
    error.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION"
  ) {
    console.error(error.message);
    console.error(USAGE);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
} finally {
  await databasePool.end();
}
