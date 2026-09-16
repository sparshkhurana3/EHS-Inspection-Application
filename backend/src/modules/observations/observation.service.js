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

const MAX_DESCRIPTION_WORDS = 500;

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
/**
 * Every patrol this user is auditing this week, split into the ones
 * still needing a report and the ones already filed.
 */
export async function getWeeklyAssignments({
  userId,
  currentDate = getCurrentDate(),
}) {
  const assignments =
    await observationRepository
      .findWeeklyAuditorAssignments({
        auditorId: userId,
        currentDate,
      });

  const weekStart = new Date(
    `${currentDate}T00:00:00Z`,
  );

  /* DATE_TRUNC('week') is Monday-based, and so is this. */
  const daysFromMonday =
    (weekStart.getUTCDay() + 6) % 7;

  weekStart.setUTCDate(
    weekStart.getUTCDate() - daysFromMonday,
  );

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(
    weekEnd.getUTCDate() + 6,
  );

  const decorated = assignments.map(
    (assignment) => ({
      ...assignment,

      report: assignment.report
        ? createReportResponse(
            assignment.report,
          )
        : null,
    }),
  );

  const pending = decorated.filter(
    (assignment) => !assignment.report,
  );

  const submitted = decorated.filter(
    (assignment) => assignment.report,
  );

  return {
    weekStartDate: weekStart
      .toISOString()
      .slice(0, 10),

    weekEndDate: weekEnd
      .toISOString()
      .slice(0, 10),

    pendingCount: pending.length,
    submittedCount: submitted.length,
    assignments: decorated,
  };
}

/**
 * One filed report, for the read-only detail view.
 */
export async function getObservationReport({
  userId,
  reportId,
}) {
  const report =
    await observationRepository
      .findReportByIdForUser({
        reportId,
        userId,
      });

  if (!report) {
    throw new AppError(
      "The observation report was not found.",
      404,
      "OBSERVATION_REPORT_NOT_FOUND",
    );
  }

  return {
    report: createReportResponse(report),
  };
}

export async function submitObservation({
  userId,
  patrolId,
  findingDate,
  category,
  description,
  riskCategory,
  zoneAreaId,
  photograph,
}) {
  if (!photograph) {
    throw new AppError(
      "An observation photograph is required.",
      400,
      "OBSERVATION_PHOTOGRAPH_REQUIRED",
    );
  }

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

  /*
   * Every rejection below deletes the uploaded file first. multer has
   * already written it to disk by the time this runs, so returning
   * early without unlinking would leak an orphan for every bad request.
   */
  async function reject(message, code) {
    await safelyDeleteFile(photograph.path);
    throw new AppError(message, 400, code);
  }

  if (
    !ALLOWED_CATEGORY_VALUES.has(
      normalizedCategory,
    )
  ) {
    await reject(
      "Select UA or UC as the observation category.",
      "INVALID_OBSERVATION_CATEGORY",
    );
  }

  if (
    !ALLOWED_RISK_VALUES.has(
      normalizedRiskCategory,
    )
  ) {
    await reject(
      "Select a valid risk category.",
      "INVALID_RISK_CATEGORY",
    );
  }

  if (!normalizedDescription) {
    await reject(
      "Enter the observation description.",
      "OBSERVATION_DESCRIPTION_REQUIRED",
    );
  }

  if (
    countWords(normalizedDescription) >
    MAX_DESCRIPTION_WORDS
  ) {
    await reject(
      `Observation description cannot exceed ${MAX_DESCRIPTION_WORDS} words.`,
      "OBSERVATION_DESCRIPTION_TOO_LONG",
    );
  }

  try {
    const report = await withTransaction(
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
            "The patrol was not found or is not assigned to you as auditor.",
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

        /*
         * A patrol covers the whole zone, so the auditor names the area
         * the finding occurred in. It must be one of that zone's own
         * areas; an id from another zone is rejected rather than stored.
         */
        const areas = Array.isArray(patrol.areas)
          ? patrol.areas
          : [];

        const selectedArea = areas.find(
          (area) =>
            Number(area.id) ===
            Number(zoneAreaId),
        );

        if (!selectedArea) {
          throw new AppError(
            "Select the area of the zone where the observation was made.",
            400,
            "AREA_NOT_IN_PATROL_ZONE",
          );
        }

        if (!patrol.auditeeId) {
          throw new AppError(
            "This patrol has no auditee assigned, so a closure cannot be opened.",
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
                auditeeId: patrol.auditeeId,
                findingDate,

                /*
                 * Both derived from the patrol. Trusting a submitted
                 * location would let a report claim a different site
                 * from the audit it belongs to.
                 */
                plantLocation:
                  patrol.plantLocation,

                observationLocation:
                  selectedArea.name,

                category: normalizedCategory,
                description: normalizedDescription,
                riskCategory:
                  normalizedRiskCategory,
                zoneAreaId: selectedArea.id,
                photograph: {
                  path: photograph.path,
                  originalName:
                    photograph.originalname,
                  mimeType:
                    photograph.mimetype,
                  size: photograph.size,
                },
              },
              client,
            );

        /*
         * Filing the report is what opens the auditee's closure. The
         * two must commit together, or an observation could exist that
         * nobody is asked to act on.
         */
        const closure =
          await observationRepository
            .createClosureAssignment(
              {
                observationReportId:
                  createdReport.id,
                patrolId,
                auditeeId: patrol.auditeeId,
              },
              client,
            );

        if (!closure) {
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

        return {
          ...createdReport,
          areaName: selectedArea.name,
        };
      },
    );

    return {
      message:
        "Observation Sent Successfully!",

      report: createReportResponse(report),
    };
  } catch (error) {
    await safelyDeleteFile(photograph.path);

    if (error?.code === "23505") {
      throw new AppError(
        "A Patrol Observation Report already exists for this audit.",
        409,
        "OBSERVATION_REPORT_ALREADY_EXISTS",
      );
    }

    throw error;
  }
}
