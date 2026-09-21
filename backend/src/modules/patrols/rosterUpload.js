import path from "node:path";

import multer from "multer";

import AppError from "../../shared/errors/AppError.js";

const MAX_ROSTER_FILE_SIZE =
  2 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  ".csv",
  ".xlsx",
]);

/*
 * CSV MIME types vary across browsers and operating systems
 * (text/csv, application/vnd.ms-excel, application/octet-stream), so
 * the file extension is checked instead of the reported MIME type.
 */
function fileFilter(
  request,
  file,
  callback,
) {
  const extension = path
    .extname(file.originalname)
    .toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    callback(
      new AppError(
        "Upload a .csv or .xlsx file.",
        400,
        "UNSUPPORTED_ROSTER_FILE",
      ),
    );

    return;
  }

  callback(null, true);
}

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_ROSTER_FILE_SIZE,
    files: 1,
  },

  fileFilter,
});

export const uploadRosterFile =
  upload.single("roster");

export function handleRosterUploadError(
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
          "The roster file must be 2 MB or smaller.",
          400,
          "ROSTER_FILE_TOO_LARGE",
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
          "Only one roster file can be uploaded at a time.",
          400,
          "ROSTER_UPLOAD_FAILED",
        ),
      );

      return;
    }

    next(
      new AppError(
        "The roster file could not be uploaded.",
        400,
        "ROSTER_UPLOAD_FAILED",
      ),
    );

    return;
  }

  next(error);
}
