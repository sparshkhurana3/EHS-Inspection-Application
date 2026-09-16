import {
  unlink,
} from "node:fs/promises";

import {
  withTransaction,
} from "../../config/database.js";

import AppError
  from "../../shared/errors/AppError.js";

import * as observationRepository
  from "./observation.repository.js";

import {
  access,
} from "node:fs/promises";

import path from "node:path";

const ALLOWED_PLANT_LOCATIONS =
  new Set([
    "Gurugram",
    "Pune",
    "Chennai",
    "Manesar",
    "China",
  ]);

const ALLOWED_CATEGORY_VALUES =
  new Set([
    "UA",
    "UC",
  ]);

const ALLOWED_RISK_VALUES =
  new Set([
    "HIGH",
    "MEDIUM",
    "LOW",
  ]);

// Get the current date //
function getCurrentDate() {
  const date = new Date();

  const year =
    date.getFullYear();

  const month =
    String(date.getMonth() + 1)
      .padStart(2, "0");

  const day =
    String(date.getDate())
      .padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// Count the number of words, required for the observation text
function countWords(value) {
  const normalizedValue =
    String(value ?? "").trim();

  if (!normalizedValue) {
    return 0;
  }

  return normalizedValue
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

// 
export async function getObservationPhotograph({
  userId,
  reportId,
}) {
  const photograph =
    await observationRepository
      .findPhotographByReportId({
        reportId,
        userId,
      });

  if (
    !photograph ||
    !photograph.photograph_path
  ) {
    throw new AppError(
      "The observation photograph was not found.",
      404,
      "OBSERVATION_PHOTOGRAPH_NOT_FOUND",
    );
  }

  const absolutePath = path.resolve(
    process.cwd(),
    photograph.photograph_path,
  );

  const allowedUploadDirectory =
    path.resolve(
      process.cwd(),
      "uploads",
      "observations",
    );
    // Microsoft Graph API to get the access 

  if (
    !absolutePath.startsWith(
      `${allowedUploadDirectory}${path.sep}`,
    )
  ) {
    throw new AppError(
      "The stored photograph path is invalid.",
      500,
      "INVALID_PHOTOGRAPH_PATH",
    );
  }

  try {
    await access(absolutePath);
  } catch {
    throw new AppError(
      "The observation photograph file is unavailable.",
      404,
      "OBSERVATION_PHOTOGRAPH_FILE_NOT_FOUND",
    );
  }

  return {
    absolutePath,

    originalName:
      photograph
        .photograph_original_name ??
      "observation-photograph",

    mimeType:
      photograph
        .photograph_mime_type ??
      "application/octet-stream",
  };
}

function normalizeReportStatus(status) {
  const normalizedStatus =
    String(status ?? "")
      .trim()
      .toUpperCase();

  if (
    normalizedStatus === "CLOSED" ||
    normalizedStatus === "COMPLETED" ||
    normalizedStatus === "APPROVED"
  ) {
    return "CLOSED";
  }

  return normalizedStatus;
}

function createReportResponse(report) {
  return {
    ...report,

    status:
      normalizeReportStatus(
        report.status,
      ),

    displayStatus:
      normalizeReportStatus(
        report.status,
      ) === "CLOSED"
        ? "Closed"
        : "In Progress",
  };
}

async function safelyDeleteFile(
  filePath,
) {
  if (!filePath) {
    return;
  }

  try {
    await unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(
        "Unable to remove uploaded observation file:",
        error,
      );
    }
  }
}

/**
 * Returns the current weekly patrol assigned to the
 * authenticated user as an auditor.
 * Should return all the assignments for a user
 */
export async function getCurrentAssignments({
  userId,
  currentDate = getCurrentDate(),
}) {
  const assignments =
    await observationRepository
      .findCurrentAuditorAssignments({
        auditorId: userId,
        currentDate,
      });

  if (!assignment) {
    return {
      assignment: null,
      report: null,
    };
  }

  const existingReport =
    await observationRepository
      .findReportByPatrolId(
        assignment.id,
      );

  return {
    assignment,

    report: existingReport
      ? createReportResponse(
          existingReport,
        )
      : null,
  };
}

/**
 * Creates one Patrol Observation Report for the authenticated
 * auditor's assigned patrol.
 */
export async function submitObservation({
  userId,
  patrolId,
  findingDate,
  location,
  category,
  description,
  riskCategory,
  photograph,
}) {
  if (!photograph) {
    throw new AppError(
      "An observation photograph is required.",
      400,
      "OBSERVATION_PHOTOGRAPH_REQUIRED",
    );
  }

  const normalizedLocation =
    String(location ?? "").trim();

  const normalizedCategory =
    String(category ?? "")
      .trim()
      .toUpperCase();

  const normalizedRiskCategory =
    String(riskCategory ?? "")
      .trim()
      .toUpperCase();

  const normalizedDescription =
    String(description ?? "").trim();

  if (
    !ALLOWED_PLANT_LOCATIONS.has(
      normalizedLocation,
    )
  ) {
    await safelyDeleteFile(
      photograph.path,
    );

    throw new AppError(
      "The selected plant location is invalid.",
      400,
      "INVALID_PLANT_LOCATION",
    );
  }

  if (
    !ALLOWED_CATEGORY_VALUES.has(
      normalizedCategory,
    )
  ) {
    await safelyDeleteFile(
      photograph.path,
    );

    throw new AppError(
      "Observation category must be UA or UC.",
      400,
      "INVALID_OBSERVATION_CATEGORY",
    );
  }

  if (
    !ALLOWED_RISK_VALUES.has(
      normalizedRiskCategory,
    )
  ) {
    await safelyDeleteFile(
      photograph.path,
    );

    throw new AppError(
      "Risk category must be High, Medium, or Low.",
      400,
      "INVALID_RISK_CATEGORY",
    );
  }

  if (
    countWords(normalizedDescription) >
    500
  ) {
    await safelyDeleteFile(
      photograph.path,
    );

    throw new AppError(
      "Observation description cannot exceed 500 words.",
      400,
      "OBSERVATION_DESCRIPTION_TOO_LONG",
    );
  }

  try {
    const report =
      await withTransaction(
        async (client) => {
          const patrol =
            await observationRepository
              .findPatrolForSubmission(
                {
                  patrolId,
                  auditorId: userId,
                },
                client,
              );

          if (!patrol) {
            throw new AppError(
              "The patrol was not found or is not assigned to the authenticated auditor.",
              404,
              "ASSIGNED_PATROL_NOT_FOUND",
            );
          }

          const existingReport =
            await observationRepository
              .findReportByPatrolId(
                patrolId,
                client,
              );

          if (existingReport) {
            throw new AppError(
              "A Patrol Observation Report already exists for this audit.",
              409,
              "OBSERVATION_REPORT_ALREADY_EXISTS",
            );
          }

          if (
            ![
              "SCHEDULED",
              "IN_PROGRESS",
            ].includes(patrol.status)
          ) {
            throw new AppError(
              "This patrol cannot accept a new observation report in its current status.",
              409,
              "PATROL_STATUS_NOT_ELIGIBLE",
            );
          }

          const createdReport =
            await observationRepository
              .createReport(
                {
                  patrolId,
                  auditorId: userId,
                  auditeeId:
                    patrol.auditeeId,

                  findingDate,

                  /*
                   * The plant location is selected from the
                   * approved dropdown, while the location of
                   * observation comes from the assignment.
                   */
                  plantLocation:
                    normalizedLocation,

                  observationLocation:
                    patrol
                      .observationLocation,

                  category:
                    normalizedCategory,

                  description:
                    normalizedDescription,

                  riskCategory:
                    normalizedRiskCategory,

                  photograph: {
                    path:
                      photograph.path,

                    originalName:
                      photograph.originalname,

                    mimeType:
                      photograph.mimetype,

                    size:
                      photograph.size,
                  },
                },
                client,
              );

          await observationRepository
            .createClosureAssignment(
              {
                observationReportId:
                  createdReport.id,

                patrolId,

                auditeeId:
                  patrol.auditeeId,
              },
              client,
          );

          await observationRepository
            .updatePatrolAfterSubmission(
              patrolId,
              client,
            );

          return createdReport;

          await observationRepository
            .updatePatrolAfterSubmission(
              patrolId,
              client,
            );

          return createdReport;
        },
      );

    return {
      message:
        "Observation Sent Successfully!",

      report:
        createReportResponse(report),
    };
  } catch (error) {
    await safelyDeleteFile(
      photograph.path,
    );

    if (error?.code === "23505") {
      throw new AppError(
        "A Patrol Observation Report already exists for this audit.",
        409,
        "OBSERVATION_REPORT_ALREADY_EXISTS",
      );
    }

    throw error;
  }

  const report =
  await withTransaction(
    async (client) => {
      const patrol =
        await observationRepository
          .findPatrolForSubmission(
            {
              patrolId,
              auditorId: userId,
            },
            client,
          );

      if (!patrol) {
        throw new AppError(
          "The patrol was not found or is not assigned to the authenticated auditor.",
          404,
          "ASSIGNED_PATROL_NOT_FOUND",
        );
      }

      const existingReport =
        await observationRepository
          .findReportByPatrolId(
            patrolId,
            client,
          );

      if (existingReport) {
        throw new AppError(
          "A Patrol Observation Report already exists for this audit.",
          409,
          "OBSERVATION_REPORT_ALREADY_EXISTS",
        );
      }

      if (
        ![
          "SCHEDULED",
          "IN_PROGRESS",
        ].includes(patrol.status)
      ) {
        throw new AppError(
          "This patrol cannot accept a new observation report in its current status.",
          409,
          "PATROL_STATUS_NOT_ELIGIBLE",
        );
      }

      if (!patrol.auditeeId) {
        throw new AppError(
          "The patrol does not have an assigned auditee.",
          409,
          "PATROL_AUDITEE_NOT_ASSIGNED",
        );
      }

      const createdReport =
        await observationRepository
          .createReport(
            {
              patrolId,
              auditorId: userId,
              auditeeId:
                patrol.auditeeId,

              findingDate,

              plantLocation:
                normalizedLocation,

              observationLocation:
                patrol.observationLocation,

              category:
                normalizedCategory,

              description:
                normalizedDescription,

              riskCategory:
                normalizedRiskCategory,

              photograph: {
                path:
                  photograph.path,

                originalName:
                  photograph.originalname,

                mimeType:
                  photograph.mimetype,

                size:
                  photograph.size,
              },
            },
            client,
          );

      const closureAssignment =
        await observationRepository
          .createClosureAssignment(
            {
              observationReportId:
                createdReport.id,

              patrolId,

              auditeeId:
                patrol.auditeeId,
            },
            client,
          );

      if (!closureAssignment) {
        throw new AppError(
          "The closure assignment could not be created.",
          500,
          "CLOSURE_ASSIGNMENT_CREATION_FAILED",
        );
      }

      await observationRepository
        .updatePatrolAfterSubmission(
          patrolId,
          client,
        );

      return createdReport;
    },
  );
}