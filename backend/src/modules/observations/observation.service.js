import {
  unlink,
  access,
} from "node:fs/promises";

import path from "node:path";

import {
  withTransaction,
} from "../../config/database.js";

import AppError
  from "../../shared/errors/AppError.js";

import * as observationRepository
  from "./observation.repository.js";

const MAX_DESCRIPTION_WORDS = 500;
const MAX_OBSERVATIONS_PER_REPORT = 10;
const HISTORY_WINDOW_MONTHS = 6;

const MANAGEMENT_ROLE_CODES = new Set([
  "EHS_OFFICER",
  "HOD",
  "PLANT_HEAD",
  "ADMIN",
]);

/**
 * Today in the server's timezone, as YYYY-MM-DD. Containers run UTC so
 * this matches the dashboard, which works in UTC throughout.
 */
function getCurrentDate() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}

/*
 * A DATE column comes back from `pg` as a JS Date, not a string. Used
 * only for values read back from the database.
 */
function toDateOnlyString(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value ?? "").slice(0, 10);
}

/** Monday of the ISO week containing dateOnly, as "YYYY-MM-DD". */
function getIsoWeekStart(dateOnly) {
  const date = new Date(
    `${dateOnly}T00:00:00Z`,
  );

  const daysFromMonday =
    (date.getUTCDay() + 6) % 7;

  date.setUTCDate(
    date.getUTCDate() - daysFromMonday,
  );

  return date
    .toISOString()
    .slice(0, 10);
}

/** Thursday of the ISO week the audit falls in: Monday + 3 days. */
function getDueDate(scheduledDateOnly) {
  const weekStart = getIsoWeekStart(
    scheduledDateOnly,
  );

  const date = new Date(
    `${weekStart}T00:00:00Z`,
  );

  date.setUTCDate(
    date.getUTCDate() + 3,
  );

  return date
    .toISOString()
    .slice(0, 10);
}

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

async function safelyDeleteFiles(files) {
  await Promise.all(
    (files ?? []).map((file) =>
      safelyDeleteFile(file?.path),
    ),
  );
}

/**
 * Resolves a stored photograph's absolute path, guarding against a
 * path escaping the observations upload directory and confirming the
 * file still exists on disk. Shared by the report-level (item #1) and
 * item-level photograph routes.
 */
async function resolvePhotographFile(
  photograph,
) {
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

  return resolvePhotographFile(
    photograph,
  );
}

/**
 * One observation's own photograph, for a multi-observation report.
 */
export async function getObservationItemPhotograph({
  userId,
  reportId,
  itemId,
}) {
  const photograph =
    await observationRepository
      .findItemPhotograph({
        reportId,
        itemId,
        userId,
      });

  return resolvePhotographFile(
    photograph,
  );
}

/*
 * Reads the closure/ticket status off either shape the repository
 * returns: the flat closureStatus/ticketStatus fields carried by the
 * weekly-assignments and history rows, or the nested closure/ticket
 * objects findReportByIdForUser builds.
 */
function resolveLifecycleInputs(
  report,
) {
  return {
    closureStatus:
      report.closureStatus ??
      report.closure?.status ??
      null,

    ticketStatus:
      report.ticketStatus ??
      report.ticket?.status ??
      null,

    ticketDecision:
      report.ticketDecision ??
      report.ticket?.decision ??
      null,
  };
}

/*
 * A ticket closed on this report's closure always means "closed via
 * ticket", even if the closure itself was later approved: the ticket
 * outcome is the fact that answers "was the plan implemented or
 * rejected", which is what this label is for.
 */
function computeLifecycle({
  noObservations,
  closureStatus,
  ticketStatus,
  ticketDecision,
}) {
  if (noObservations) {
    return {
      lifecycleStatus: "NO_OBSERVATIONS",
      lifecycleLabel:
        "Closed – no observations",
    };
  }

  if (
    String(ticketStatus ?? "")
      .toUpperCase() === "CLOSED"
  ) {
    return {
      lifecycleStatus:
        "CLOSED_VIA_TICKET",

      lifecycleLabel:
        String(ticketDecision ?? "")
          .toUpperCase() === "REJECTED"
          ? "Closed – plan rejected"
          : "Closed – action implemented",
    };
  }

  const normalizedClosureStatus = String(
    closureStatus ?? "",
  ).toUpperCase();

  if (
    normalizedClosureStatus ===
    "SUBMITTED_FOR_CLOSURE"
  ) {
    return {
      lifecycleStatus:
        "EHS_OFFICER_ACTION_REQUIRED",
      lifecycleLabel:
        "EHS Officer action required",
    };
  }

  if (normalizedClosureStatus === "APPROVED") {
    return {
      lifecycleStatus: "APPROVED",
      lifecycleLabel:
        "Approved by EHS Officer",
    };
  }

  if (
    normalizedClosureStatus === "IN_PROGRESS"
  ) {
    return {
      lifecycleStatus:
        "ACTION_PLAN_IN_PROGRESS",
      lifecycleLabel:
        "Action plan being implemented",
    };
  }

  return {
    lifecycleStatus: "WITH_AUDITEE",
    lifecycleLabel: "With auditee",
  };
}

/**
 * From the auditor's point of view a report is Open (nothing filed) or
 * Closed (filed and sent to the auditee, or closed with no observation
 * to record). `lifecycleStatus`/`lifecycleLabel` carry the fuller
 * downstream journey (closure, ticket) for views that want it; the
 * stored `status` column itself is passed through unchanged.
 */
function createReportResponse(report) {
  if (!report) {
    return null;
  }

  const noObservations =
    report.noObservations === true;

  const {
    closureStatus,
    ticketStatus,
    ticketDecision,
  } = resolveLifecycleInputs(report);

  const {
    lifecycleStatus,
    lifecycleLabel,
  } = computeLifecycle({
    noObservations,
    closureStatus,
    ticketStatus,
    ticketDecision,
  });

  const closure =
    report.closure ??
    (report.closureId
      ? {
          id: report.closureId,
          status: report.closureStatus,
        }
      : null);

  const ticket =
    report.ticket ??
    (report.ticketId
      ? {
          id: report.ticketId,
          status: report.ticketStatus,
          decision: report.ticketDecision,
          closureDate:
            report.ticketClosureDate,
        }
      : null);

  return {
    ...report,

    noObservations,

    outcome: noObservations
      ? "NO_OBSERVATIONS"
      : "SENT_TO_AUDITEE",

    displayStatus: noObservations
      ? "Closed – no observations"
      : "Closed – sent to auditee",

    closure,
    ticket,

    lifecycleStatus,
    lifecycleLabel,
  };
}

/**
 * Every patrol this user is auditing this week, plus any still-unfiled
 * audit from the previous 4 weeks (so a missed Thursday deadline does
 * not silently disappear when the week rolls over), split into pending
 * and submitted.
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

  const weekStartDate =
    getIsoWeekStart(currentDate);

  const weekEndDateObject = new Date(
    `${weekStartDate}T00:00:00Z`,
  );

  weekEndDateObject.setUTCDate(
    weekEndDateObject.getUTCDate() + 6,
  );

  const weekEndDate = weekEndDateObject
    .toISOString()
    .slice(0, 10);

  const decorated = assignments.map(
    (assignment) => {
      const scheduledDateOnly =
        toDateOnlyString(
          assignment.scheduledDate,
        );

      const dueDate = getDueDate(
        scheduledDateOnly,
      );

      return {
        ...assignment,

        dueDate,

        isFromEarlierWeek:
          scheduledDateOnly <
          weekStartDate,

        isOverdue:
          !assignment.report &&
          currentDate > dueDate,

        reportStatus: assignment.report
          ? "CLOSED"
          : "OPEN",

        report: assignment.report
          ? createReportResponse(
              assignment.report,
            )
          : null,
      };
    },
  );

  const pending = decorated.filter(
    (assignment) => !assignment.report,
  );

  const submitted = decorated.filter(
    (assignment) => assignment.report,
  );

  const overdueCount = pending.filter(
    (assignment) => assignment.isOverdue,
  ).length;

  return {
    weekStartDate,
    weekEndDate,

    pendingCount: pending.length,
    submittedCount: submitted.length,
    overdueCount,

    assignments: decorated,
  };
}

/**
 * One filed report, with its observations, for the read-only detail
 * view.
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

  const observations =
    report.noObservations
      ? []
      : await observationRepository
          .findItemsByReportId(
            reportId,
          );

  return {
    report: createReportResponse({
      ...report,
      observations,
    }),
  };
}

export async function submitObservation({
  userId,
  patrolId,
  findingDate,
  observations,
  photographs,
}) {
  const items = Array.isArray(
    observations,
  )
    ? observations
    : [];

  const files = Array.isArray(
    photographs,
  )
    ? photographs
    : [];

  /*
   * multer has already written every file to disk by the time this
   * runs, so any early return below must clean them all up first.
   */
  async function reject(message, code) {
    await safelyDeleteFiles(files);
    throw new AppError(message, 400, code);
  }

  if (items.length === 0) {
    await reject(
      "Add at least one observation.",
      "OBSERVATION_REQUIRED",
    );
  }

  if (
    items.length >
    MAX_OBSERVATIONS_PER_REPORT
  ) {
    await reject(
      `Up to ${MAX_OBSERVATIONS_PER_REPORT} observations per report.`,
      "TOO_MANY_OBSERVATIONS",
    );
  }

  if (files.length !== items.length) {
    await reject(
      "Attach exactly one photograph per observation.",
      "OBSERVATION_PHOTOGRAPH_COUNT_MISMATCH",
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
         * each observation was in. Every area must be one of that
         * zone's own; an id from another zone is rejected rather than
         * stored.
         */
        const areas = Array.isArray(
          patrol.areas,
        )
          ? patrol.areas
          : [];

        const resolvedItems = items.map(
          (item, index) => {
            const selectedArea =
              areas.find(
                (area) =>
                  Number(area.id) ===
                  Number(
                    item.zoneAreaId,
                  ),
              );

            if (!selectedArea) {
              throw new AppError(
                `Observation ${index + 1}: select the area of the zone where the observation was made.`,
                400,
                "AREA_NOT_IN_PATROL_ZONE",
              );
            }

            const file = files[index];

            return {
              zoneAreaId:
                selectedArea.id,
              observationLocation:
                selectedArea.name,
              category: item.category,
              description:
                item.description,
              riskCategory:
                item.riskCategory,
              photograph: {
                path: file.path,
                originalName:
                  file.originalname,
                mimeType: file.mimetype,
                size: file.size,
              },
            };
          },
        );

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
                auditeeId:
                  patrol.auditeeId,
                findingDate,

                /*
                 * Derived from the patrol. Trusting a submitted
                 * location would let a report claim a different site
                 * from the audit it belongs to.
                 */
                plantLocation:
                  patrol.plantLocation,

                items: resolvedItems,
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

        /*
         * One closure item per observation, so the auditee writes a
         * plan per observation and each can go to its own department.
         */
        await observationRepository
          .createClosureItems(
            {
              closureId: closure.id,
              observationReportId:
                createdReport.id,
            },
            client,
          );

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

      report: createReportResponse(report),
    };
  } catch (error) {
    await safelyDeleteFiles(files);

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

/**
 * "No observation to record": closes an open audit with nothing filed,
 * for the case where the auditor found nothing of note in the zone.
 * Opens no closure and completes the patrol directly.
 */
export async function recordNoObservation({
  userId,
  patrolId,
}) {
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

      if (!patrol.auditeeId) {
        throw new AppError(
          "This patrol has no auditee assigned.",
          409,
          "PATROL_AUDITEE_NOT_ASSIGNED",
        );
      }

      const createdReport =
        await observationRepository
          .createNoObservationReport(
            {
              patrolId,
              auditorId: userId,
              auditeeId:
                patrol.auditeeId,
              findingDate:
                getCurrentDate(),
              plantLocation:
                patrol.plantLocation,
            },
            client,
          );

      const completed =
        await observationRepository
          .completePatrolWithoutObservations(
            patrolId,
            client,
          );

      if (!completed) {
        throw new AppError(
          "The audit could not be closed.",
          500,
          "PATROL_COMPLETION_FAILED",
        );
      }

      return createdReport;
    },
  );

  return {
    message:
      "Audit closed with no observation to record. The auditee and EHS Officer can see this on their dashboards.",

    report: createReportResponse(report),
  };
}

/**
 * Every observation report from the last 6 months the caller can see:
 * their own patrols, or, for a management role, every report at their
 * plant.
 */
export async function getObservationHistory({
  user,
  filter = "all",
}) {
  const roles = Array.isArray(user?.roles)
    ? user.roles.map((role) =>
        String(role).toUpperCase(),
      )
    : [];

  const managementScope = roles.some(
    (role) =>
      MANAGEMENT_ROLE_CODES.has(role),
  );

  const plantId = managementScope
    ? await observationRepository
        .findUserPlantId(user.id)
    : null;

  const sixMonthsAgo = new Date();

  sixMonthsAgo.setUTCMonth(
    sixMonthsAgo.getUTCMonth() -
      HISTORY_WINDOW_MONTHS,
  );

  const fromDate = sixMonthsAgo
    .toISOString()
    .slice(0, 10);

  const rows =
    await observationRepository
      .findReportHistory({
        userId: user.id,
        plantId,
        managementScope:
          managementScope &&
          Boolean(plantId),
        fromDate,
        filter,
      });

  return {
    windowMonths: HISTORY_WINDOW_MONTHS,
    filter,
    count: rows.length,

    reports: rows.map((row) =>
      createReportResponse(row),
    ),
  };
}
