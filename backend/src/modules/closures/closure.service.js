import {
  withTransaction,
} from "../../config/database.js";

import AppError
  from "../../shared/errors/AppError.js";

import * as closureRepository
  from "./closure.repository.js";

import * as ticketService
  from "../tickets/ticket.service.js";

import {
  isReadyForSubmission,
  recomputeClosureStatus,
} from "./closureStatus.js";

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
 * The three states the closure report has (docs/16-closure-refinement-
 * plan.md): Open while any observation still needs a plan or a
 * department has not taken its ticket up, In Progress once every
 * observation is with a department, Closed once the EHS Officer has
 * approved it.
 *
 * REEXAMINATION_REQUIRED reads "Open" — the plan has to be redone — and
 * stays distinct in the database because `wasReturned` shows the
 * officer's reason and the approval loop depends on it.
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
    return "Closed";
  }

  if (normalizedStatus === "IN_PROGRESS") {
    return "In Progress";
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

/*
 * An observation's plan stays editable while the closure itself is
 * editable and no department has acted on that observation yet: once a
 * ticket is accepted or rejected, its snapshot is what the decision
 * refers to, so the text is frozen (docs/16, D8).
 */
function canEditClosureItem(
  item,
  closureStatus,
  approvalIteration = 0,
) {
  if (
    !EDITABLE_CLOSURE_STATUSES.has(
      normalizeStatus(closureStatus),
    )
  ) {
    return false;
  }

  if (!item.ticket) {
    return true;
  }

  /*
   * A ticket from an earlier round is history: when the EHS Officer
   * sends a closure back, the round advances and every observation is
   * open for rework again, with a fresh ticket raised on the next save
   * (docs/16, D7).
   */
  if (
    Number(item.ticket.closureRound ?? 0) <
    Number(approvalIteration ?? 0)
  ) {
    return true;
  }

  return (
    normalizeStatus(item.ticket.status) ===
    "OPEN"
  );
}

function createClosureResponse(closure) {
  if (!closure) {
    return null;
  }

  const normalizedStatus =
    normalizeStatus(closure.status);

  const items = (closure.items ?? []).map(
    (item) => ({
      ...item,

      canEdit: canEditClosureItem(
        item,
        normalizedStatus,
        closure.approvalIteration,
      ),

      ticketDisplayStatus: item.ticket
        ? (TICKET_STATUS_LABELS[
            item.ticket.status
          ] ?? item.ticket.status)
        : null,
    }),
  );

  const everyItemPlanned =
    items.length > 0 &&
    items.every((item) =>
      String(item.actionPlan ?? "").trim(),
    );

  const everyTicketClosed =
    items.length > 0 &&
    items.every(
      (item) =>
        normalizeStatus(
          item.ticket?.status,
        ) === "CLOSED",
    );

  const closedTicketCount = items.filter(
    (item) =>
      normalizeStatus(item.ticket?.status) ===
      "CLOSED",
  ).length;

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

    items,

    /*
     * A closure may be sent for approval only once every observation
     * has a plan and every department has resolved its ticket
     * (docs/16, D6).
     */
    canSubmitForClosure:
      normalizedStatus ===
        "IN_PROGRESS" &&
      everyItemPlanned &&
      everyTicketClosed,

    itemCount: items.length,
    closedTicketCount,

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
/**
 * The departments the auditee may assign an observation to: those at
 * this closure's plant with an Action Team HOD registered.
 */
export async function getDepartmentOptions({
  userId,
  closureId,
}) {
  const [plantName, departments] =
    await Promise.all([
      closureRepository
        .findPlantNameForClosure({
          closureId,
          auditeeId: userId,
        }),

      closureRepository
        .findDepartmentsForClosure({
          closureId,
          auditeeId: userId,
        }),
    ]);

  if (plantName === null) {
    throw new AppError(
      "The closure assignment was not found or is not assigned to the authenticated auditee.",
      404,
      "CLOSURE_ASSIGNMENT_NOT_FOUND",
    );
  }

  return {
    plantName,

    departments: departments.map(
      (department) => ({
        id: department.id,
        name: department.name,
        code: department.code,
        hodId: department.hodId,
        hodName: department.hodName,
      }),
    ),
  };
}

/**
 * Saves one observation's action plan and assigns it to a department.
 *
 * Each observation is an independent unit: saving one opens (or, while
 * still OPEN, refreshes) that observation's own ticket, and the
 * closure's status is then re-derived from every observation and its
 * ticket (docs/16-closure-refinement-plan.md).
 */
export async function saveClosureItem({
  userId,
  closureId,
  closureItemId,
  actionPlan,
  targetDate,
  departmentId,
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
   * The department is chosen from a dropdown scoped to this closure's
   * plant, and the ticket goes to that department's Action Team HOD.
   * Both the department and the HOD are resolved server-side, never
   * accepted from the client.
   */
  const departmentOptions =
    await closureRepository
      .findDepartmentsForClosure({
        closureId,
        auditeeId: userId,
      });

  const selectedDepartment =
    departmentOptions.find(
      (department) =>
        Number(department.id) ===
        Number(departmentId),
    );

  if (!selectedDepartment) {
    throw new AppError(
      "Select a department with an Action Team HOD registered at this location.",
      400,
      "INVALID_DEPARTMENT",
    );
  }

  validateActionPlanInput({
    actionPlan:
      normalizedActionPlan,

    targetDate:
      normalizedTargetDate,

    responsibleHodName:
      selectedDepartment.hodName,
  });

  await withTransaction(
    async (client) => {
      /*
       * Two observations of the same closure can be saved at once, and
       * each save re-derives the closure's status from all of them, so
       * the parent row is locked for the length of the write.
       */
      const lockedClosure =
        await closureRepository
          .lockClosureForUpdate(
            {
              closureId,
              auditeeId: userId,
            },
            client,
          );

      if (!lockedClosure) {
        throw new AppError(
          "The closure assignment was not found or is not assigned to the authenticated auditee.",
          404,
          "CLOSURE_ASSIGNMENT_NOT_FOUND",
        );
      }

      const items =
        await closureRepository
          .findClosureItems(
            closureId,
            client,
          );

      const item = items.find(
        (entry) =>
          Number(entry.id) ===
          Number(closureItemId),
      );

      if (!item) {
        throw new AppError(
          "That observation is not part of this closure.",
          404,
          "CLOSURE_ITEM_NOT_FOUND",
        );
      }

      if (
        !canEditClosureItem(
          item,
          lockedClosure.status,
          lockedClosure.approvalIteration,
        )
      ) {
        throw new AppError(
          "A decision has already been recorded for this observation, so its action plan can no longer be changed.",
          409,
          "CLOSURE_ITEM_LOCKED",
        );
      }

      const saved =
        await closureRepository
          .saveClosureItem(
            {
              closureId,
              closureItemId,

              actionPlan:
                normalizedActionPlan,

              targetDate:
                normalizedTargetDate,

              responsibleHodName:
                selectedDepartment.hodName,

              actionHodId:
                selectedDepartment.hodId,

              departmentId:
                selectedDepartment.id,
            },
            client,
          );

      if (!saved) {
        throw new AppError(
          "The action plan could not be saved. Confirm that the observation belongs to this closure and is still editable.",
          409,
          "ACTION_PLAN_SAVE_FAILED",
        );
      }

      /* Item #1 mirrors onto the closure's own columns (D2). */
      await closureRepository
        .syncClosureHeaderFromItemOne(
          closureId,
          client,
        );

      /*
       * Open (or, while still OPEN, refresh) this observation's ticket
       * for the closure's current approval round. Failing to open one
       * must not leave a plan with nobody assigned to act on it, so it
       * runs in the same transaction as the save.
       */
      await closureRepository
        .upsertTicketForClosureRound(
          {
            closureId,
            closureItemId,

            observationReportId:
              lockedClosure
                .observationReportId,

            patrolId:
              lockedClosure.patrolId,

            closureRound:
              lockedClosure
                .approvalIteration,

            actionHodId:
              selectedDepartment.hodId,

            actionHodName:
              selectedDepartment.hodName,

            departmentId:
              selectedDepartment.id,

            proposedActionPlan:
              normalizedActionPlan,

            targetDate:
              normalizedTargetDate,

            assignedBy: userId,
          },
          client,
        );

      await recomputeClosureStatus(
        closureId,
        client,
      );
    },
  );

  const refreshed = await getClosureById({
    userId,
    closureId,
  });

  return {
    message:
      "Action plan saved successfully.",

    closure: refreshed.closure,
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

  /*
   * Every observation needs a plan, and every department needs to have
   * resolved its ticket (implemented or rejected), before the closure
   * can go to the EHS Officer (docs/16, D6).
   */
  const items =
    await closureRepository
      .findClosureItems(closureId);

  if (
    items.length === 0 ||
    items.some(
      (item) =>
        !String(
          item.actionPlan ?? "",
        ).trim(),
    )
  ) {
    throw new AppError(
      "Every observation needs a saved action plan before this closure can be submitted.",
      400,
      "INCOMPLETE_CLOSURE_REPORT",
    );
  }

  if (!isReadyForSubmission(items)) {
    throw new AppError(
      "Every observation's ticket must be accepted or rejected and closed before this closure can be submitted.",
      400,
      "CLOSURE_TICKETS_OPEN",
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