import crypto from "node:crypto";
import path from "node:path";

import multer from "multer";

import {
  compressUploadedImages,
} from "../../middleware/compressUploadedImages.js";

import {
  storeUploadedFiles,
} from "../../middleware/storeUploadedFiles.js";

import {
  removeStoredFiles,
} from "../../shared/storage/storedFiles.js";

import AppError from "../../shared/errors/AppError.js";

/*
 * Photographs the auditee attaches to an observation's action plan as
 * evidence that the action was carried out. Same limits as an
 * observation photograph - JPEG, PNG or SVG, 10 MB each - but up to
 * three per observation rather than one.
 *
 * This replaces the old ticket evidence upload, which attached the
 * proof to an Action Team HOD's ticket. The auditee now does the work
 * and supplies the proof themselves.
 */

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

export const MAX_EVIDENCE_FILES = 3;

export const UPLOAD_DIRECTORY = path.resolve(
  process.cwd(),
  "uploads",
  "closures",
);

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/svg+xml",
]);

const EXTENSIONS_BY_MIME_TYPE = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
};

const storage = multer.diskStorage({
  destination(request, file, callback) {
    callback(null, UPLOAD_DIRECTORY);
  },

  filename(request, file, callback) {
    const extension =
      EXTENSIONS_BY_MIME_TYPE[file.mimetype];

    callback(
      null,
      `${crypto.randomUUID()}${extension}`,
    );
  },
});

function fileFilter(
  request,
  file,
  callback,
) {
  if (
    !ALLOWED_IMAGE_TYPES.has(file.mimetype)
  ) {
    callback(
      new AppError(
        "Only JPG, JPEG, PNG, or SVG images are allowed.",
        400,
        "UNSUPPORTED_EVIDENCE_IMAGE",
      ),
    );

    return;
  }

  callback(null, true);
}

const upload = multer({
  storage,

  limits: {
    fileSize: MAX_IMAGE_SIZE,
    files: MAX_EVIDENCE_FILES,
  },

  fileFilter,
});

export const uploadClosureEvidence =
  upload.array(
    "evidence",
    MAX_EVIDENCE_FILES,
  );

/*
 * The 10 MB limit above applies to what the phone sends; what is stored
 * is the compressed copy this produces.
 */
export const compressClosureEvidence =
  compressUploadedImages({
    errorCode: "UNREADABLE_EVIDENCE_IMAGE",
    errorMessage:
      "An evidence photograph could not be read as an image. Take or attach it again.",
  });

/* Moves them into SharePoint when PHOTO_STORAGE=sharepoint. */
export const storeClosureEvidence =
  storeUploadedFiles({
    folder: "Closure evidence",
  });

/**
 * Removes files that were stored for a write that did not happen, or
 * whose row has just been deleted. Accepts multer records or stored
 * references, on the uploads volume or in SharePoint. Never throws: the
 * request has already failed (or succeeded) on its own terms and a
 * leftover file is a smaller problem than masking that outcome.
 */
export async function removeUploadedFiles(files) {
  await removeStoredFiles(
    (files ?? []).map(
      (file) => file?.path ?? file,
    ),
  );
}

export function handleClosureUploadError(
  error,
  request,
  response,
  next,
) {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      next(
        new AppError(
          "Each evidence photograph must be 10 MB or smaller.",
          400,
          "EVIDENCE_IMAGE_TOO_LARGE",
        ),
      );

      return;
    }

    if (
      error.code === "LIMIT_FILE_COUNT" ||
      error.code === "LIMIT_UNEXPECTED_FILE"
    ) {
      next(
        new AppError(
          `Up to ${MAX_EVIDENCE_FILES} evidence photographs can be attached to an observation.`,
          400,
          "TOO_MANY_EVIDENCE_IMAGES",
        ),
      );

      return;
    }

    next(
      new AppError(
        "The evidence photograph could not be uploaded.",
        400,
        "EVIDENCE_UPLOAD_FAILED",
      ),
    );

    return;
  }

  next(error);
}
