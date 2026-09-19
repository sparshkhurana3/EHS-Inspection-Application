import {
  withTransaction,
} from "../../config/database.js";

import AppError
  from "../../shared/errors/AppError.js";

import * as closureRepository
  from "./closure.repository.js";

import * as ticketService
  from "../tickets/ticket.service.js";

const MAX_ACTION_PLAN_WORDS = 255;

const EDITABLE_CLOSURE_STATUSES =
  new Set([
    "OPEN",
    "IN_PROGRESS",
    "REEXAMINATION_REQUIRED",
  ]);

function normalizeStatus(status) {
  return String(status ?? "")
    .trim()
    .toUpperCase();
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

function getCurrentLocalDate() {
  const currentDate = new Date();

  const year =
    currentDate.getFullYear();

  const month =
    String(
      currentDate.getMonth() + 1,
    ).padStart(2, "0");

  const day =
    String(
      currentDate.getDate(),
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/*
 * Before completion the auditee sees only two labels: a closure waiting
 * on the EHS Officer reads "Pending Approval", anything else reads
 * "Open".
 *
 * Only the label collapses. IN_PROGRESS and REEXAMINATION_REQUIRED stay
 * distinct in the database because they drive different behaviour:
 * whether submit is enabled, and whether this is a first attempt or a
 * rework. Merging them would break the approval loop.
 */
function getDisplayStatus(status) {
  const normalizedStatus =
    normalizeStatus(status);

  if (
    normalizedStatus ===
      "SUBMITTED_FOR_CLOSURE" ||
    normalizedStatus ===
      "PENDING_EHS_APPROVAL"
  ) {
    return "Pending Approval";
  }

  if (
    normalizedStatus === "APPROVED" ||
    normalizedStatus === "CLOSED"
  ) {
    return "Completed";
  }

  return "Open";
}

/*
 * Mirrors the label map in tickets/ticket.service.js. Kept local rather
 * than imported so this module does not depend on ticket internals for
 * a three-entry lookup.
 */
const TICKET_STATUS_LABELS = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  CLOSED: "Closed",
};

function createClosureResponse(closure) {
  if (!closure) {
    return null;
  }

  const normalizedStatus =
    normalizeStatus(closure.status);

  const hasCompleteActionPlan =
    Boolean(
      String(
        closure.actionPlan ?? "",
      ).trim(),
    ) &&
    Boolean(closure.targetDate) &&
    Boolean(
      String(
        closure.responsibleHodName ??
          "",
      ).trim(),
    );

  return {
    ...closure,

    status: normalizedStatus,

    displayStatus:
      getDisplayStatus(
        normalizedStatus,
      ),

    canEditActionPlan:
      EDITABLE_CLOSURE_STATUSES.has(
        normalizedStatus,
      ),

    canSubmitForClosure:
      normalizedStatus ===
        "IN_PROGRESS" &&
      hasCompleteActionPlan,

    /*
     * A returned closure reads "Open", exactly like one never touched,
     * so the card needs a second signal to show rework is expected.
     */
    wasReturned:
      normalizedStatus ===
      "REEXAMINATION_REQUIRED",

    ticketDisplayStatus:
      closure.ticketStatus
        ? (TICKET_STATUS_LABELS[
            closure.ticketStatus
          ] ?? closure.ticketStatus)
        : null,
  };
}

function validateActionPlanInput({
  actionPlan,
  targetDate,
  responsibleHodName,
}) {
  if (!actionPlan) {
    throw new AppError(
      "Action plan is required.",
      400,
      "ACTION_PLAN_REQUIRED",
    );
  }

  if (
    countWords(actionPlan) >
    MAX_ACTION_PLAN_WORDS
  ) {
    throw new AppError(
      `Action plan cannot exceed ${MAX_ACTION_PLAN_WORDS} words.`,
      400,
      "ACTION_PLAN_TOO_LONG",
    );
  }

  if (!targetDate) {
    throw new AppError(
      "Target date is required.",
      400,
      "TARGET_DATE_REQUIRED",
    );
  }

  const parsedTargetDate =
    new Date(
      `${targetDate}T00:00:00`,
    );

  if (
    Number.isNaN(
      parsedTargetDate.getTime(),
    )
  ) {
    throw new AppError(
      "Target date must be a valid date.",
      400,
      "INVALID_TARGET_DATE",
    );
  }

  if (!responsibleHodName) {
    throw new AppError(
      "Responsible HOD name is required.",
      400,
      "RESPONSIBLE_HOD_REQUIRED",
    );
  }

  if (
    responsibleHodName.length > 255
  ) {
    throw new AppError(
      "Responsible HOD name cannot exceed 255 characters.",
      400,
      "RESPONSIBLE_HOD_NAME_TOO_LONG",
    );
  }
}

/*
 * Window sizes live here so "6 months" and "1 week" are changed in one
 * place rather than scattered through the queries.
 */
const PENDING_WINDOW_MONTHS = 6;
const COMPLETED_WINDOW_DAYS = 7;

/**
 * The auditee's Closure page in one response: what they still owe,
 * what has lapsed, and what was completed in the last week.
 */
export async function getAuditeeClosures({ userId }) {
  if (!userId) {
    throw new AppError(
      "Authentication is required.",
      401,
      "AUTHENTICATION_REQUIRED",
    );
  }

  const [openClosures, completedClosures] =
    await Promise.all([
      closureRepository
        .findOpenClosuresForAuditee({
          auditeeId: userId,
          lapseMonths: PENDING_WINDOW_MONTHS,
        }),

      closureRepository
        .findRecentlyCompletedClosuresForAuditee({
          auditeeId: userId,
          daysBack: COMPLETED_WINDOW_DAYS,
        }),
    ]);

  const decorated = openClosures.map(
    (closure) => ({
      ...createClosureResponse(closure),
      isLapsed: closure.isLapsed === true,
    }),
  );

  const pending = decorated.filter(
    (closure) => !closure.isLapsed,
  );

  const lapsed = decorated.filter(
    (closure) => closure.isLapsed,
  );

  const completed = completedClosures.map(
    (closure) => ({
      ...createClosureResponse(closure),
      isLapsed: false,
    }),
  );

  return {
    pendingWindowMonths:
      PENDING_WINDOW_MONTHS,

    completedWindowDays:
      COMPLETED_WINDOW_DAYS,

    pendingCount: pending.length,
    lapsedCount: lapsed.length,
    completedCount: completed.length,

    pending,
    lapsed,
    completed,
  };
}

/**
 * One closure with its observation report, for the detail view.
 */
export async function getClosureById({
  userId,
  closureId,
}) {
  const closure =
    await closureRepository
      .findClosureByIdForUser({
        closureId,
        userId,
      });

  if (!closure) {
    throw new AppError(
      "The closure was not found.",
      404,
      "CLOSURE_ASSIGNMENT_NOT_FOUND",
    );
  }

  /*
   * Embed the full ticket (with evidence) so the auditee and the EHS
   * Officer see the Action Team HOD's decision without a second round
   * trip. The read predicates line up: whoever can see this closure can
   * see the ticket that belongs to it.
   */
  let ticket = null;

  if (closure.ticketId) {
    try {
      const ticketResult =
        await ticketService.getTicketById({
          userId,
          ticketId: closure.ticketId,
        });

      ticket = ticketResult.ticket;
    } catch {
      ticket = null;
    }
  }

  return {
    closure: {
      ...createClosureResponse(closure),
      ticket,
    },
  };
}

/**
 * The EHS Officer's review queue.
 */
export async function getPendingApprovals({ userId }) {
  const closures =
    await closureRepository
      .findClosuresPendingApproval({
        officerId: userId,
      });

  return {
    closures: closures.map(
      createClosureResponse,
    ),
  };
}

/**
 * Approve or send back a submitted closure.
 *
 * Nothing else can complete a closure: approval by an EHS Officer is
 * the only path to APPROVED, and it moves the observation report and
 * the patrol in the same transaction so the three never disagree.
 */
async function reviewClosure({
  userId,
  closureId,
  reviewComments,
  approve,
}) {
  if (!approve) {
    const comments = String(
      reviewComments ?? "",
    ).trim();

    if (!comments) {
      throw new AppError(
        "Review comments are required when sending a report back for re-examination.",
        400,
        "REVIEW_COMMENTS_REQUIRED",
      );
    }
  }

  await withTransaction(async (client) => {
    const existing =
      await closureRepository
        .findClosureByIdForUser(
          { closureId, userId },
          client,
        );

    if (!existing) {
      throw new AppError(
        "The closure was not found.",
        404,
        "CLOSURE_ASSIGNMENT_NOT_FOUND",
      );
    }

    if (
      normalizeStatus(existing.status) !==
      "SUBMITTED_FOR_CLOSURE"
    ) {
      throw new AppError(
        "This closure is not awaiting approval.",
        409,
        "CLOSURE_NOT_AWAITING_APPROVAL",
      );
    }

    const updated = approve
      ? await closureRepository.approveClosure(
          {
            closureId,
            reviewerId: userId,
            reviewComments,
          },
          client,
        )
      : await closureRepository.rejectClosure(
          {
            closureId,
            reviewerId: userId,
            reviewComments: String(
              reviewComments ?? "",
            ).trim(),
          },
          client,
        );

    /*
     * Null means another reviewer got there first: the WHERE clause no
     * longer matched. Fail rather than reporting a decision that was
     * not recorded.
     */
    if (!updated) {
      throw new AppError(
        "This closure was reviewed by someone else. Reload and try again.",
        409,
        "CLOSURE_STATUS_CHANGED",
      );
    }

    await closureRepository
      .applyReviewToPatrolAndReport(
        {
          closureId,

          patrolStatus: approve
            ? "COMPLETED"
            : "REEXAMINATION_REQUIRED",

          reportStatus: approve
            ? "CLOSED"
            : "REEXAMINATION_REQUIRED",

          closeReport: approve,
        },
        client,
      );
  });

  const closure =
    await closureRepository
      .findClosureByIdForUser({
        closureId,
        userId,
      });

  return {
    message: approve
      ? "Closure approved."
      : "Closure sent back for re-examination.",

    closure: createClosureResponse(closure),
  };
}

export async function approveClosure(input) {
  return reviewClosure({
    ...input,
    approve: true,
  });
}

export async function rejectClosure(input) {
  return reviewClosure({
    ...input,
    approve: false,
  });
}

/**
 * The Action Team HOD options for the auditee's assignment dropdown:
 * active ACTION_HOD users at this closure's own plant. An empty array
 * is a normal 200; the frontend explains it rather than treating it as
 * an error.
 */
export async function getActionHodOptions({
  userId,
  closureId,
}) {
  const existingClosure =
    await closureRepository
      .findClosureByIdForAuditee({
        closureId,
        auditeeId: userId,
      });

  if (!existingClosure) {
    throw new AppError(
      "The closure assignment was not found or is not assigned to the authenticated auditee.",
      404,
      "CLOSURE_ASSIGNMENT_NOT_FOUND",
    );
  }

  const [actionHods, plantName] =
    await Promise.all([
      closureRepository
        .findActionHodsForClosure({
          closureId,
          auditeeId: userId,
        }),

      closureRepository
        .findPlantNameForClosure({
          closureId,
          auditeeId: userId,
        }),
    ]);

  return {
    actionHods,
    plantName,
  };
}

export async function saveActionPlan({
  userId,
  closureId,
  actionPlan,
  targetDate,
  actionHodId,
}) {
  if (!userId) {
    throw new AppError(
      "An authenticated user is required.",
      401,
      "AUTHENTICATION_REQUIRED",
    );
  }

  const normalizedActionPlan =
    String(actionPlan ?? "").trim();

  const normalizedTargetDate =
    String(targetDate ?? "")
      .trim()
      .slice(0, 10);

  const existingClosure =
    await closureRepository
      .findClosureByIdForAuditee({
        closureId,
        auditeeId: userId,
      });

  if (!existingClosure) {
    throw new AppError(
      "The closure assignment was not found or is not assigned to the authenticated auditee.",
      404,
      "CLOSURE_ASSIGNMENT_NOT_FOUND",
    );
  }

  const existingStatus =
    normalizeStatus(
      existingClosure.status,
    );

  if (
    !EDITABLE_CLOSURE_STATUSES.has(
      existingStatus,
    )
  ) {
    throw new AppError(
      "The action plan cannot be changed in the current status.",
      409,
      "CLOSURE_ACTION_PLAN_LOCKED",
    );
  }

  /*
   * The Action Team HOD is chosen from a dropdown scoped to this
   * closure's plant, never typed. The name stored on the closure is
   * derived from the chosen user, never accepted from the client.
   */
  const actionHodOptions =
    await closureRepository
      .findActionHodsForClosure({
        closureId,
        auditeeId: userId,
      });

  const selectedActionHod =
    actionHodOptions.find(
      (hod) =>
        Number(hod.id) ===
        Number(actionHodId),
    );

  if (!selectedActionHod) {
    throw new AppError(
      "Select an Action Team HOD registered at this location.",
      400,
      "INVALID_ACTION_HOD",
    );
  }

  validateActionPlanInput({
    actionPlan:
      normalizedActionPlan,

    targetDate:
      normalizedTargetDate,

    responsibleHodName:
      selectedActionHod.fullName,
  });

  const savedClosure =
    await withTransaction(
      async (client) => {
        const saved =
          await closureRepository
            .saveActionPlan(
              {
                closureId,
                auditeeId: userId,

                actionPlan:
                  normalizedActionPlan,

                targetDate:
                  normalizedTargetDate,

                responsibleHodName:
                  selectedActionHod.fullName,

                actionHodId:
                  selectedActionHod.id,
              },
              client,
            );

        if (!saved) {
          throw new AppError(
            "The closure action plan could not be saved. Confirm that the report is assigned to the authenticated auditee and is still editable.",
            409,
            "ACTION_PLAN_SAVE_FAILED",
          );
        }

        /*
         * Open (or, while still OPEN, refresh) the ticket for this
         * closure's current approval round. Failing to open a ticket
         * must not save a plan with nobody assigned to act on it, so
         * this runs in the same transaction as the save above.
         */
        await closureRepository
          .upsertTicketForClosureRound(
            {
              closureId,

              observationReportId:
                saved.observation_report_id,

              patrolId: saved.patrol_id,

              closureRound:
                saved.approval_iteration,

              actionHodId:
                selectedActionHod.id,

              actionHodName:
                selectedActionHod.fullName,

              proposedActionPlan:
                normalizedActionPlan,

              targetDate:
                normalizedTargetDate,

              assignedBy: userId,
            },
            client,
          );

        return saved;
      },
    );

  const updatedClosure =
    await closureRepository
      .findClosureByIdForAuditee({
        closureId,
        auditeeId: userId,
      });

  if (!updatedClosure) {
    throw new AppError(
      "The saved closure report could not be retrieved.",
      500,
      "SAVED_CLOSURE_NOT_FOUND",
    );
  }

  return {
    message:
      "Action plan saved successfully.",

    closure:
      createClosureResponse(
        updatedClosure,
      ),
  };
}

export async function submitClosure({
  userId,
  closureId,
}) {
  if (!userId) {
    throw new AppError(
      "An authenticated user is required.",
      401,
      "AUTHENTICATION_REQUIRED",
    );
  }

  const existingClosure =
    await closureRepository
      .findClosureByIdForAuditee({
        closureId,
        auditeeId: userId,
      });

  if (!existingClosure) {
    throw new AppError(
      "The closure assignment was not found or is not assigned to the authenticated auditee.",
      404,
      "CLOSURE_ASSIGNMENT_NOT_FOUND",
    );
  }

  const existingStatus =
    normalizeStatus(
      existingClosure.status,
    );

  if (
    existingStatus !== "IN_PROGRESS"
  ) {
    throw new AppError(
      "The closure report must be In Progress before it can be submitted.",
      409,
      "CLOSURE_NOT_IN_PROGRESS",
    );
  }

  const hasCompleteActionPlan =
    Boolean(
      String(
        existingClosure.actionPlan ??
          "",
      ).trim(),
    ) &&
    Boolean(
      existingClosure.targetDate,
    ) &&
    Boolean(
      String(
        existingClosure
          .responsibleHodName ??
          "",
      ).trim(),
    );

  if (!hasCompleteActionPlan) {
    throw new AppError(
      "Complete and save the action plan, target date, and responsible HOD name before submission.",
      400,
      "INCOMPLETE_CLOSURE_REPORT",
    );
  }

  const completionDate =
    getCurrentLocalDate();

  const updatedClosure =
    await withTransaction(
      async (client) => {
        /*
         * Re-read inside the transaction so that the
         * auditee assignment and current status are
         * checked against the latest database state.
         */
        const transactionClosure =
          await closureRepository
            .findClosureByIdForAuditee(
              {
                closureId,
                auditeeId: userId,
              },
              client,
            );

        if (!transactionClosure) {
          throw new AppError(
            "The closure assignment was not found.",
            404,
            "CLOSURE_ASSIGNMENT_NOT_FOUND",
          );
        }

        if (
          normalizeStatus(
            transactionClosure.status,
          ) !== "IN_PROGRESS"
        ) {
          throw new AppError(
            "The closure report is no longer available for submission.",
            409,
            "CLOSURE_STATUS_CHANGED",
          );
        }

        const submittedClosure =
          await closureRepository
            .submitForClosure(
              {
                closureId,
                auditeeId: userId,
                completionDate,
              },
              client,
            );

        if (!submittedClosure) {
          throw new AppError(
            "The closure report could not be submitted.",
            409,
            "CLOSURE_SUBMISSION_FAILED",
          );
        }

        await closureRepository
          .updatePatrolAfterClosureSubmission(
            submittedClosure.patrol_id,
            client,
          );

        await closureRepository
          .updateObservationAfterClosureSubmission(
            submittedClosure
              .observation_report_id,
            client,
          );

        const refreshedClosure =
          await closureRepository
            .findClosureByIdForAuditee(
              {
                closureId,
                auditeeId: userId,
              },
              client,
            );

        if (!refreshedClosure) {
          throw new AppError(
            "The submitted closure report could not be retrieved.",
            500,
            "SUBMITTED_CLOSURE_NOT_FOUND",
          );
        }

        return refreshedClosure;
      },
    );

  return {
    message:
      "Report sent for closure successfully.",

    closure:
      createClosureResponse(
        updatedClosure,
      ),
  };
}