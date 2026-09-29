import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import {
  access,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";

import {
  databasePool,
  withTransaction,
} from "../src/config/database.js";

import {
  environment,
} from "../src/config/environment.js";

import {
  deleteFile,
  downloadFile,
  isSharePointConfigured,
  resolveDrive,
  uploadFile,
} from "../src/shared/storage/sharePointClient.js";

import {
  isSharePointReference,
} from "../src/shared/storage/storedFiles.js";

/*
 * SharePoint photograph storage, from the command line. Run inside the
 * backend container so it uses the deployment's own settings:
 *
 *   docker compose exec backend node scripts/sharepoint.js check
 *   docker compose exec backend node scripts/sharepoint.js migrate --dry-run
 *   docker compose exec backend node scripts/sharepoint.js migrate
 */

const USAGE = `
Usage: node scripts/sharepoint.js <command>

  check              Proves the configured site and library can be reached:
                     resolves them, creates the app's folder, and uploads,
                     reads back and deletes a small test file.

  migrate [--dry-run]
                     Moves photographs still on the uploads volume into
                     SharePoint and repoints their database rows. Safe to
                     re-run: rows already in SharePoint are skipped.
`;

/*
 * Plain-language causes for the failures an administrator actually
 * meets while setting this up.
 */
function explain(error) {
  const status = error.status;

  if (status === 400 || status === 401) {
    return "The app registration's credentials were refused. Check SHAREPOINT_TENANT_ID / SHAREPOINT_CLIENT_ID / SHAREPOINT_CLIENT_SECRET (or the ENTRA_* values used in their place), and that the client secret has not expired.";
  }

  if (status === 403) {
    return "Signed in, but not allowed. Check that Sites.Selected (Application) has admin consent on the app registration and that the app was granted 'write' on this site.";
  }

  if (status === 404) {
    return "Not found. Check SHAREPOINT_SITE_URL (or SHAREPOINT_SITE_ID) and SHAREPOINT_LIBRARY.";
  }

  return "See the error above. If SharePoint is throttling (429/503), wait and retry.";
}

async function check() {
  if (!isSharePointConfigured()) {
    throw new Error(
      "SHAREPOINT_SITE_URL is not set, so there is nothing to check.",
    );
  }

  const settings =
    environment.photoStorage.sharePoint;

  console.log(
    `Photo storage for new uploads: ${environment.photoStorage.driver}`,
  );

  console.log(
    `Site: ${settings.siteUrl}${
      settings.siteId
        ? ` (id ${settings.siteId})`
        : ""
    }`,
  );

  const drive = await resolveDrive();

  console.log(
    `OK  library "${drive.driveName}" found: ${drive.driveWebUrl}`,
  );

  const content = Buffer.from(
    `EHS Inspection storage check ${new Date().toISOString()} ${crypto.randomUUID()}\n`,
  );

  const localPath = path.join(
    os.tmpdir(),
    `ehs-storage-check-${crypto.randomUUID()}.txt`,
  );

  await writeFile(localPath, content);

  let reference = null;

  try {
    reference = await uploadFile({
      localPath,
      folder: "Storage checks",
      fileName: path.basename(localPath),
      mimeType: "text/plain",
    });

    console.log(
      `OK  uploaded a test file into "${settings.folder}/Storage checks"`,
    );

    const download = await downloadFile(
      reference,
    );

    const readBack = Buffer.from(
      await new Response(
        download.body,
      ).arrayBuffer(),
    );

    if (!readBack.equals(content)) {
      throw new Error(
        "The test file came back different from what was uploaded.",
      );
    }

    console.log(
      "OK  read the test file back unchanged",
    );
  } finally {
    await rm(localPath, { force: true });

    if (reference) {
      await deleteFile(reference);

      console.log(
        "OK  deleted the test file (it is in the site's recycle bin)",
      );
    }
  }

  console.log(
    "SharePoint storage is working.",
  );
}

function monthFolder(base, timestamp) {
  const date = timestamp
    ? new Date(timestamp)
    : new Date();

  return [
    base,
    String(date.getUTCFullYear()),
    String(date.getUTCMonth() + 1).padStart(
      2,
      "0",
    ),
  ].join("/");
}

/*
 * Every distinct local file, with the rows that point at it. An
 * observation report mirrors its first observation's photograph, so
 * one file can be referenced from both tables and moves once.
 */
async function findLocalFiles() {
  const observationFiles =
    await databasePool.query(
      `
        SELECT
          stored.photograph_path AS stored_path,
          MAX(stored.photograph_mime_type) AS mime_type,
          MIN(stored.submitted_at) AS taken_at
        FROM (
          SELECT
            item.photograph_path,
            item.photograph_mime_type,
            report.submitted_at
          FROM observation_items item
          JOIN observation_reports report
            ON report.id = item.observation_report_id

          UNION ALL

          SELECT
            report.photograph_path,
            report.photograph_mime_type,
            report.submitted_at
          FROM observation_reports report
          WHERE report.photograph_path IS NOT NULL
        ) AS stored
        WHERE stored.photograph_path NOT LIKE 'sharepoint:%'
        GROUP BY stored.photograph_path
      `,
    );

  const evidenceFiles =
    await databasePool.query(
      `
        SELECT
          file_path AS stored_path,
          MAX(mime_type) AS mime_type,
          MIN(uploaded_at) AS taken_at
        FROM closure_item_evidence
        WHERE file_path NOT LIKE 'sharepoint:%'
        GROUP BY file_path
      `,
    );

  return [
    ...observationFiles.rows.map((row) => ({
      ...row,
      kind: "observation",
      folder: monthFolder(
        "Observations",
        row.taken_at,
      ),
    })),

    ...evidenceFiles.rows.map((row) => ({
      ...row,
      kind: "evidence",
      folder: monthFolder(
        "Closure evidence",
        row.taken_at,
      ),
    })),
  ];
}

async function repoint(file, reference) {
  await withTransaction(async (client) => {
    if (file.kind === "observation") {
      await client.query(
        `
          UPDATE observation_items
          SET photograph_path = $2
          WHERE photograph_path = $1
        `,
        [file.stored_path, reference],
      );

      await client.query(
        `
          UPDATE observation_reports
          SET photograph_path = $2
          WHERE photograph_path = $1
        `,
        [file.stored_path, reference],
      );

      return;
    }

    await client.query(
      `
        UPDATE closure_item_evidence
        SET file_path = $2
        WHERE file_path = $1
      `,
      [file.stored_path, reference],
    );
  });
}

async function migrate({ dryRun }) {
  if (!isSharePointConfigured()) {
    throw new Error(
      "SHAREPOINT_SITE_URL is not set; configure SharePoint storage first.",
    );
  }

  const files = await findLocalFiles();

  console.log(
    `${files.length} photograph file(s) still on the uploads volume.`,
  );

  let moved = 0;
  let missing = 0;
  let failed = 0;

  for (const file of files) {
    const localPath = path.resolve(
      process.cwd(),
      file.stored_path,
    );

    try {
      await access(localPath);
    } catch {
      missing += 1;

      console.warn(
        `MISSING  ${file.stored_path} is referenced but not on disk; left as it is.`,
      );

      continue;
    }

    if (dryRun) {
      console.log(
        `WOULD MOVE  ${file.stored_path} -> ${file.folder}/`,
      );

      continue;
    }

    let reference = null;

    try {
      reference = await uploadFile({
        localPath,
        folder: file.folder,
        fileName: path.basename(localPath),
        mimeType:
          file.mime_type ??
          "application/octet-stream",
      });

      await repoint(file, reference);
    } catch (error) {
      failed += 1;

      console.error(
        `FAILED  ${file.stored_path}: ${error.message}`,
      );

      /*
       * Uploaded but not recorded: remove the copy so a re-run does
       * not leave a duplicate behind.
       */
      if (
        reference &&
        isSharePointReference(reference)
      ) {
        await deleteFile(reference).catch(
          () => {},
        );
      }

      continue;
    }

    /*
     * Only once the rows point at SharePoint is the local copy
     * removed, so an interruption at any point loses nothing.
     */
    await unlink(localPath).catch(() => {});

    moved += 1;

    console.log(
      `MOVED  ${file.stored_path}`,
    );
  }

  console.log(
    dryRun
      ? "Dry run: nothing was changed."
      : `Moved ${moved}, missing ${missing}, failed ${failed}.`,
  );

  if (failed > 0) {
    process.exitCode = 1;
  }
}

async function main() {
  const [command, ...rest] =
    process.argv.slice(2);

  switch (command) {
    case "check":
      return check();
    case "migrate":
      return migrate({
        dryRun: rest.includes("--dry-run"),
      });
    case undefined:
    case "help":
    case "--help":
      console.log(USAGE);
      return undefined;
    default:
      console.error(
        `Unknown command "${command}".`,
      );
      console.error(USAGE);
      process.exitCode = 1;
      return undefined;
  }
}

try {
  await main();
} catch (error) {
  console.error(
    `FAILED  ${error.message}`,
  );

  if (error.status) {
    console.error(
      `        ${explain(error)}`,
    );
  }

  process.exitCode = 1;
} finally {
  await databasePool.end();
}
