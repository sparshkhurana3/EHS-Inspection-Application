import path from "node:path";
import { unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  logger,
} from "../../config/logger.js";

import AppError from "../errors/AppError.js";

import {
  SHAREPOINT_REFERENCE_PREFIX,
  deleteFile,
  downloadFile,
} from "./sharePointClient.js";

/*
 * A stored photograph is either a path on the uploads volume (every
 * photograph taken before SharePoint storage, and every one taken with
 * PHOTO_STORAGE=local) or a "sharepoint:" reference. The two coexist
 * indefinitely, so everything that removes or serves a stored file goes
 * through here rather than assuming one or the other.
 */

export function isSharePointReference(reference) {
  return String(reference ?? "").startsWith(
    SHAREPOINT_REFERENCE_PREFIX,
  );
}

export function photoStorageUnavailableError(
  message = "Photographs cannot be reached in document storage right now. Try again in a few minutes.",
) {
  const error = new AppError(
    message,
    503,
    "PHOTO_STORAGE_UNAVAILABLE",
  );

  error.expose = true;

  return error;
}

/**
 * Removes one stored file. Never throws: it runs on paths where the
 * request has already failed or succeeded on its own terms, and a
 * leftover file is a smaller problem than masking that outcome.
 */
export async function removeStoredFile(reference) {
  if (!reference) {
    return;
  }

  try {
    if (isSharePointReference(reference)) {
      await deleteFile(reference);

      return;
    }

    await unlink(
      path.resolve(
        process.cwd(),
        reference,
      ),
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }

    logger.warn(
      "Could not remove a stored photograph.",
      {
        reference,
        reason: error.message,
        status: error.status,
      },
    );
  }
}

export async function removeStoredFiles(references) {
  await Promise.all(
    (references ?? []).map(
      removeStoredFile,
    ),
  );
}

/**
 * `inline; filename=...` for a name that may hold any character. Node
 * refuses a header value outside Latin-1 with a 500, and a quote would
 * end the value early, so the plain `filename` carries a safe ASCII
 * stand-in and `filename*` (RFC 6266 / 5987) the real name.
 */
function inlineDisposition(originalName) {
  const name = path.basename(
    String(originalName ?? "photograph"),
  );

  const asciiName = name
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");

  /*
   * encodeURIComponent leaves ' ( ) * alone, but RFC 5987 does not
   * allow them - and ' is the delimiter in UTF-8''...
   */
  const encodedName = encodeURIComponent(
    name,
  ).replace(
    /['()*]/g,
    (character) =>
      `%${character
        .charCodeAt(0)
        .toString(16)
        .toUpperCase()}`,
  );

  return `inline; filename="${asciiName}"; filename*=UTF-8''${encodedName}`;
}

/**
 * Sends a stored photograph as the response. `file` is what the
 * service resolved: `{ absolutePath }` for a file on the volume, or
 * `{ sharePointReference }`, plus `originalName`, `mimeType` and the
 * `missingMessage`/`missingCode` to answer with if the file is gone.
 *
 * The file is opened before any header is set, so a missing or
 * unreachable file ends in a clean JSON error rather than a response
 * already marked as a cacheable image.
 */
export async function sendStoredFile(
  res,
  file,
) {
  let download = null;

  if (file.sharePointReference) {
    try {
      download = await downloadFile(
        file.sharePointReference,
      );
    } catch (error) {
      if (error.status === 404) {
        throw new AppError(
          file.missingMessage,
          404,
          file.missingCode,
        );
      }

      logger.error(
        "Could not read a photograph from SharePoint.",
        {
          reference:
            file.sharePointReference,
          reason: error.message,
          status: error.status,
          code: error.graphCode,
        },
      );

      throw photoStorageUnavailableError();
    }
  }

  res.type(file.mimeType);

  res.setHeader(
    "Content-Disposition",
    inlineDisposition(file.originalName),
  );

  res.setHeader(
    "Cache-Control",
    "private, max-age=300",
  );

  if (!download) {
    res.sendFile(file.absolutePath);

    return;
  }

  if (download.contentLength) {
    res.setHeader(
      "Content-Length",
      download.contentLength,
    );
  }

  try {
    await pipeline(
      Readable.fromWeb(download.body),
      res,
    );
  } catch (error) {
    /*
     * Headers are gone by now, so there is no error response left to
     * send; the usual cause is the viewer navigating away mid-image.
     */
    logger.warn(
      "Streaming a photograph from SharePoint stopped early.",
      {
        reference:
          file.sharePointReference,
        reason: error.message,
      },
    );

    res.destroy();
  }
}
