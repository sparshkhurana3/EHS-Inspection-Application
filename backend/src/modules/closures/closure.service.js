import {
  withTransaction,
} from "../../config/database.js";

import AppError
  from "../../shared/errors/AppError.js";

import * as closureRepository
  from "./closure.repository.js";

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

function getDisplayStatus(status) {
  const normalizedStatus =
    normalizeStatus(status);

  if (normalizedStatus === "OPEN") {
    return "Open";
  }

  if (
    normalizedStatus === "IN_PROGRESS" ||
    normalizedStatus ===
      "REEXAMINATION_REQUIRED"
  ) {
    return "In Progress";
  }

  if (
    normalizedStatus ===
      "SUBMITTED_FOR_CLOSURE" ||
    normalizedStatus ===
      "PENDING_EHS_APPROVAL"
  ) {
    return "Sent for Closure";
  }

  if (
    normalizedStatus === "APPROVED" ||
    normalizedStatus === "CLOSED"
  ) {
    return "Closed";
  }

  return status || "Not available";
}

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

export async function getCurrentClosure({
  userId,
}) {
  if (!userId) {
    throw new AppError(
      "An authenticated user is required.",
      401,
      "AUTHENTICATION_REQUIRED",
    );
  }

  const closure =
    await closureRepository
      .findCurrentClosureForAuditee(
        userId,
      );

  return {
    closure:
      createClosureResponse(closure),
  };
}

export async function saveActionPlan({
  userId,
  closureId,
  actionPlan,
  targetDate,
  responsibleHodName,
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

  const normalizedHodName =
    String(
      responsibleHodName ?? "",
    ).trim();

  validateActionPlanInput({
    actionPlan:
      normalizedActionPlan,

    targetDate:
      normalizedTargetDate,

    responsibleHodName:
      normalizedHodName,
  });

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

  const savedClosure =
    await closureRepository
      .saveActionPlan({
        closureId,
        auditeeId: userId,

        actionPlan:
          normalizedActionPlan,

        targetDate:
          normalizedTargetDate,

        responsibleHodName:
          normalizedHodName,
      });

  if (!savedClosure) {
    throw new AppError(
      "The closure action plan could not be saved. Confirm that the report is assigned to the authenticated auditee and is still editable.",
      409,
      "ACTION_PLAN_SAVE_FAILED",
    );
  }

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