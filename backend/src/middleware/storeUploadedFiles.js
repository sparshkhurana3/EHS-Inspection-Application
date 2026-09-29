import { unlink } from "node:fs/promises";

import {
  environment,
} from "../config/environment.js";

import {
  logger,
} from "../config/logger.js";

import {
  uploadFile,
} from "../shared/storage/sharePointClient.js";

import {
  photoStorageUnavailableError,
  removeStoredFiles,
} from "../shared/storage/storedFiles.js";

/*
 * With PHOTO_STORAGE=sharepoint, moves each (already compressed) upload
 * from the local staging directory into the SharePoint library and
 * repoints the multer record's `path` at the "sharepoint:" reference.
 * The services store and clean up `file.path` exactly as before, and
 * the shared removal helper knows what to do with either kind.
 *
 * This runs before the service's database transaction, not inside it:
 * uploading is several round trips to Microsoft, and holding a pooled
 * connection across them would starve the pool when a shift's worth of
 * auditors submit at once. If the transaction then fails, the service's
 * cleanup deletes what was uploaded here.
 *
 * With local storage selected this does nothing.
 */
/**
 * Error-handling middleware for the upload routes, placed after the
 * upload steps and BEFORE the controller. An error from validation (or
 * from compression or storage, which also clean up after themselves)
 * would otherwise leave the uploaded files behind with nothing
 * referring to them - uncompressed originals, GPS data included.
 *
 * It must not sit after the controller: once the service has committed
 * the rows, the files belong to them, and a later error (say, while
 * re-reading the result) must not delete what the rows point at. The
 * services clean up their own failed writes.
 */
export async function discardUploadsOnError(
  error,
  req,
  res,
  next,
) {
  await removeStoredFiles(
    (req.files ?? []).map(
      (file) => file.path,
    ),
  );

  next(error);
}

export function storeUploadedFiles({
  folder,
}) {
  return async function storeUploadedFilesMiddleware(
    req,
    res,
    next,
  ) {
    if (
      environment.photoStorage.driver !==
      "sharepoint"
    ) {
      next();

      return;
    }

    const files = req.files ?? [];

    const now = new Date();

    /*
     * Year and month folders keep any one folder well under
     * SharePoint's 5,000-item list view threshold.
     */
    const datedFolder = [
      folder,
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(
        2,
        "0",
      ),
    ].join("/");

    try {
      for (const file of files) {
        const reference = await uploadFile({
          localPath: file.path,
          folder: datedFolder,
          fileName: file.filename,
          mimeType: file.mimetype,
        });

        const stagedPath = file.path;

        file.path = reference;

        try {
          await unlink(stagedPath);
        } catch (error) {
          if (error.code !== "ENOENT") {
            logger.warn(
              "Could not remove a staged upload after moving it to SharePoint.",
              {
                stagedPath,
                reason: error.message,
              },
            );
          }
        }
      }
    } catch (error) {
      /*
       * Every record's `path` is now either a SharePoint reference
       * (uploaded) or a staged local file (not yet), and the removal
       * helper handles both.
       */
      await removeStoredFiles(
        files.map((file) => file.path),
      );

      logger.error(
        "Could not store uploaded photographs in SharePoint.",
        {
          reason: error.message,
          status: error.status,
          code: error.graphCode,
        },
      );

      next(
        photoStorageUnavailableError(
          "The photographs could not be saved to document storage. Nothing was submitted; try again in a few minutes.",
        ),
      );

      return;
    }

    next();
  };
}
