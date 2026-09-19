import crypto from "node:crypto";
import path from "node:path";

import multer from "multer";

import AppError from "../../shared/errors/AppError.js";

const MAX_IMAGE_SIZE =
  10 * 1024 * 1024;

const MAX_EVIDENCE_FILES = 3;

const UPLOAD_DIRECTORY = path.resolve(
  process.cwd(),
  "uploads",
  "tickets",
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

    const generatedName =
      `${crypto.randomUUID()}${extension}`;

    callback(null, generatedName);
  },
});

function fileFilter(
  request,
  file,
  callback,
) {
  if (
    !ALLOWED_IMAGE_TYPES.has(
      file.mimetype,
    )
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

export const uploadTicketEvidence =
  upload.array("evidence", MAX_EVIDENCE_FILES);

export function handleTicketUploadError(
  error,
  request,
  response,
  next,
) {
  if (
    error instanceof multer.MulterError
  ) {
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
          "Up to 3 evidence photographs can be attached.",
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
