import crypto from "node:crypto";
import path from "node:path";
import {
  unlink,
  writeFile,
} from "node:fs/promises";

import sharp from "sharp";

import {
  logger,
} from "../config/logger.js";

import AppError from "../shared/errors/AppError.js";

/*
 * Every uploaded photograph is re-encoded before anything records it,
 * so what is stored - on this server's disk, or in SharePoint - is the
 * compressed copy, never the camera original. A phone photograph
 * arrives at 3-8 MB and 4000 px or more across; nobody reviewing a
 * safety finding on screen needs more than 2048 px, and at that size a
 * JPEG is a few hundred KB.
 *
 * Re-encoding also strips the EXIF block, which carries the phone's GPS
 * position, after first applying its orientation so the picture still
 * stands the right way up. Colour is converted to sRGB, which is what
 * every browser assumes.
 *
 * SVG is a drawing, not a photograph, and passes through untouched.
 */

const MAX_DIMENSION = 2048;

const JPEG_QUALITY = 80;

/*
 * Pixels, not bytes, are what decoding costs: a 1 MB PNG can describe
 * a 16000 x 16000 canvas. 120 megapixels still admits the largest phone
 * cameras (108 MP) and refuses anything bigger before it is decoded.
 */
const MAX_INPUT_PIXELS = 120_000_000;

/*
 * Each compression holds one of libuv's four worker threads, which the
 * rest of the API shares for file and DNS work. Two at a time leaves
 * room for everything else; further uploads wait their turn.
 */
const MAX_CONCURRENT_COMPRESSIONS = 2;

const JPEG_OUTPUT = {
  mimeType: "image/jpeg",
  extension: ".jpg",
};

const PNG_OUTPUT = {
  mimeType: "image/png",
  extension: ".png",
};

const RASTER_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
]);

/*
 * libvips' file cache would hold each upload open after it has been
 * read, which stops the original being deleted on Windows and keeps a
 * deleted file's space in use on Linux. Every upload is read exactly
 * once, so there is nothing to gain from caching it.
 */
sharp.cache(false);

/*
 * The declared type comes from the client, but sharp decides the
 * format from the bytes. Without this, an SVG labelled image/jpeg would
 * be rendered by librsvg - which follows references to neighbouring
 * files in the upload directory - and WebP, GIF, TIFF and the rest
 * would be decoded too. Only the two formats the app accepts may load.
 */
sharp.block({
  operation: ["VipsForeignLoad"],
});

sharp.unblock({
  operation: [
    "VipsForeignLoadJpegFile",
    "VipsForeignLoadPngFile",
  ],
});

let runningCompressions = 0;
const waitingCompressions = [];

async function withCompressionSlot(work) {
  if (
    runningCompressions >=
    MAX_CONCURRENT_COMPRESSIONS
  ) {
    await new Promise((resolve) =>
      waitingCompressions.push(resolve),
    );
  }

  runningCompressions += 1;

  try {
    return await work();
  } finally {
    runningCompressions -= 1;
    waitingCompressions.shift()?.();
  }
}

async function removeQuietly(filePath) {
  if (!filePath) {
    return;
  }

  try {
    await unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      logger.warn(
        "Could not remove an uploaded image file.",
        {
          filePath,
          reason: error.message,
        },
      );
    }
  }
}

function replaceExtension(
  originalName,
  extension,
) {
  const baseName =
    path.parse(originalName ?? "").name ||
    "photograph";

  return `${baseName}${extension}`;
}

function hasTransparentPixel(data, channels) {
  if (channels !== 4) {
    return false;
  }

  for (
    let index = 3;
    index < data.length;
    index += 4
  ) {
    if (data[index] < 255) {
      return true;
    }
  }

  return false;
}

/**
 * Decodes the upload once, already oriented, shrunk to at most 2048 px
 * and in sRGB, into a raw pixel buffer of at most 16 MB; every decision
 * and every encode below works from that buffer, so a large upload is
 * decoded exactly once and never held at full resolution.
 *
 * Returns the encoded bytes and the format chosen:
 * - a JPEG upload becomes a JPEG;
 * - a PNG with real transparency stays a PNG, which JPEG cannot hold;
 * - any other PNG becomes whichever of JPEG and PNG is smaller - a
 *   photograph saved as PNG shrinks enormously as JPEG, while a small
 *   diagram or screenshot is smaller left as PNG.
 */
async function encodeCompressed(file) {
  const { data, info } = await sharp(
    file.path,
    {
      /*
       * Decode what can be decoded: a phone JPEG missing only its end
       * marker is still a perfectly good photograph. Bytes that are not
       * an image at all still fail.
       */
      failOn: "none",
      limitInputPixels: MAX_INPUT_PIXELS,
    },
  )
    .autoOrient()
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toColourspace("srgb")
    .raw()
    .toBuffer({
      resolveWithObject: true,
    });

  const pixels = () =>
    sharp(data, {
      raw: {
        width: info.width,
        height: info.height,
        channels: info.channels,
      },
    });

  const asJpeg = async () => ({
    output: JPEG_OUTPUT,
    content: await pixels()
      .flatten({
        background: "#ffffff",
      })
      .jpeg({
        quality: JPEG_QUALITY,
        mozjpeg: true,
      })
      .toBuffer(),
  });

  const asPng = async () => ({
    output: PNG_OUTPUT,
    content: await pixels()
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
      })
      .toBuffer(),
  });

  if (file.mimetype === "image/jpeg") {
    return asJpeg();
  }

  if (
    hasTransparentPixel(
      data,
      info.channels,
    )
  ) {
    return asPng();
  }

  const [jpeg, png] = await Promise.all([
    asJpeg(),
    asPng(),
  ]);

  return png.content.length <
    jpeg.content.length
    ? png
    : jpeg;
}

class UnreadableImageError extends Error {}

/**
 * Writes the compressed copy beside the original under a fresh name,
 * then points the multer record at it and deletes the original. The
 * record is repointed before the delete, so a failure anywhere after
 * this leaves every cleanup path aimed at the file that exists.
 *
 * Decoding and encoding failures mean the upload is not a usable image
 * (a 400 for the person); failures writing the result are the server's
 * own - a full disk, a permissions problem - and keep their error.
 */
async function compressFile(file) {
  if (
    !RASTER_MIME_TYPES.has(file.mimetype)
  ) {
    return;
  }

  let encoded;

  try {
    encoded = await withCompressionSlot(() =>
      encodeCompressed(file),
    );
  } catch (error) {
    throw new UnreadableImageError(
      error.message,
    );
  }

  const outputPath = path.join(
    path.dirname(file.path),
    `${crypto.randomUUID()}${encoded.output.extension}`,
  );

  try {
    await writeFile(
      outputPath,
      encoded.content,
    );
  } catch (error) {
    await removeQuietly(outputPath);

    throw error;
  }

  const originalPath = file.path;

  if (
    file.mimetype !==
    encoded.output.mimeType
  ) {
    file.originalname = replaceExtension(
      file.originalname,
      encoded.output.extension,
    );
  }

  file.path = outputPath;
  file.filename = path.basename(outputPath);
  file.mimetype = encoded.output.mimeType;
  file.size = encoded.content.length;

  await removeQuietly(originalPath);
}

/**
 * Builds the middleware that compresses `req.files` in place. It runs
 * after validation and immediately before the controller, so the
 * service receives the compressed files through the same `path`,
 * `originalname`, `mimetype` and `size` fields it has always read.
 *
 * Images are processed one at a time within a request: ten camera
 * photographs decoded at once would hold hundreds of MB of pixels.
 *
 * A file that cannot be decoded is refused with a 400 naming the
 * module's own error code; any other failure keeps its own error and
 * surfaces as a 500. Either way every file in the request is deleted,
 * because the request stops here and no service will clean up after it.
 */
export function compressUploadedImages({
  errorCode,
  errorMessage,
}) {
  return async function compressUploadedImagesMiddleware(
    req,
    res,
    next,
  ) {
    const files = req.files ?? [];

    try {
      for (const file of files) {
        await compressFile(file);
      }
    } catch (error) {
      await Promise.all(
        files.map((file) =>
          removeQuietly(file.path),
        ),
      );

      if (
        !(error instanceof UnreadableImageError)
      ) {
        logger.error(
          "Storing a compressed upload failed.",
          {
            code: error.code,
            reason: error.message,
          },
        );

        next(error);

        return;
      }

      logger.warn(
        "An uploaded image could not be compressed.",
        {
          code: errorCode,
          reason: error.message,
        },
      );

      next(
        new AppError(
          errorMessage,
          400,
          errorCode,
        ),
      );

      return;
    }

    next();
  };
}
