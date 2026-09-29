import path from "node:path";
import { access } from "node:fs/promises";

import {
  withTransaction,
} from "../../config/database.js";

import AppError
  from "../../shared/errors/AppError.js";

import {
  isSharePointReference,
} from "../../shared/storage/storedFiles.js";

import * as closureRepository
  from "./closure.repository.js";

import {
  recomputeClosureStatus,
} from "./closureStatus.js";

import {
  MAX_EVIDENCE_FILES,
  UPLOAD_DIRECTORY,
  removeUploadedFiles,
} from "./closureUpload.js";

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
 * The three states the closure report has: Open while any observation
 * still needs an action plan, In Progress once every observation has
 * one and the auditee may submit, Closed once the EHS Officer has
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
 * An observation's plan and its evidence stay editable for as long as
 * the closure itself is. Nothing freezes an individual observation any
 * more: there is no department decision to snapshot it against, and
 * while the closure is with the auditee every part of it is theirs to
 * revise. Submitting, or the officer's approval, is what locks it.
 */
function canEditClosureItem(
  closureStatus,
) {
  return EDITABLE_CLOSURE_STATUSES.has(
    normalizeStatus(closureStatus),
  );
}

function createClosureResponse(closure) {
  if (!closure) {
    return null;
  }

  const normalizedStatus =
    normalizeStatus(closure.status);

  const itemsEditable = canEditClosureItem(
    normalizedStatus,
  );

  const items = (closure.items ?? []).map(
    (item) => {
      const evidence = item.evidence ?? [];

      return {
        ...item,
        evidence,
        evidenceCount: evidence.length,

        canEdit: itemsEditable,

        /*
         * Evidence is optional, so this only reports whether there is
         * room for another photograph, never that one is owed.
         */
        canAddEvidence:
          itemsEditable &&
          evidence.length <
            MAX_EVIDENCE_FILES,
      };
    },
  );

  const everyItemPlanned =
    items.length > 0 &&
    items.every((item) =>
      String(item.actionPlan ?? "").trim(),
    );

  const evidenceCount = items.reduce(
    (total, item) =>
      total + item.evidenceCount,
    0,
  );

  const plannedItemCount = items.filter(
    (item) =>
      String(item.actionPlan ?? "").trim(),
  ).length;

  return {
    ...closure,

    status: normalizedStatus,

    displayStatus:
      getDisplayStatus(
        normalizedStatus,
      ),

    canEditActionPlan: itemsEditable,

    items,

    maxEvidencePerObservation:
      MAX_EVIDENCE_FILES,

    /*
     * A closure goes to the EHS Officer once every observation has an
     * action plan. Evidence is not part of the test: it is optional
     * supporting material, and the officer can send the closure back
     * if what was attached does not convince them.
     */
    canSubmitForClosure:
      normalizedStatus ===
        "IN_PROGRESS" &&
      everyItemPlanned,

    itemCount: items.length,
    plannedItemCount,
    evidenceCount,

    /*
     * A returned closure reads "Open", exactly like one never touched,
     * so the card needs a second signal to show rework is expected.
     */
    wasReturned:
      normalizedStatus ===
      "REEXAMINATION_REQUIRED",
  };
}

function validateActionPlanInput({
  actionPlan,
  targetDate,
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

  return {
    closure:
      createClosureResponse(closure),
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
 * Saves one observation's action plan.
 *
 * Each observation is an independent unit: the auditee writes a plan
 * against each one, and the closure's status is re-derived from all of
 * them afterwards.
 */
export async function saveClosureItem({
  userId,
  closureId,
  closureItemId,
  actionPlan,
  targetDate,
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

  validateActionPlanInput({
    actionPlan:
      normalizedActionPlan,

    targetDate:
      normalizedTargetDate,
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
          lockedClosure.status,
        )
      ) {
        throw new AppError(
          "The action plan cannot be changed in the current status.",
          409,
          "CLOSURE_ACTION_PLAN_LOCKED",
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

      /* Item #1 mirrors onto the closure's own columns. */
      await closureRepository
        .syncClosureHeaderFromItemOne(
          closureId,
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
   * Every observation needs an action plan before the closure can go to
   * the EHS Officer. Evidence photographs are optional.
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
/*
 * ----------------------------------------------------------------
 * Evidence of closure
 *
 * Up to three photographs per observation, showing that the action
 * plan written against it was actually carried out. Optional: an
 * observation can be closed on its plan alone, and it is the EHS
 * Officer's approval that decides whether that was enough.
 * ----------------------------------------------------------------
 */

/**
 * Finds one observation of a closure the auditee owns, and confirms
 * the closure is still theirs to change. Shared by the upload and the
 * delete, which need exactly the same checks.
 */
async function findEditableClosureItem({
  userId,
  closureId,
  closureItemId,
  client,
}) {
  const closure =
    await closureRepository
      .findClosureByIdForAuditee(
        {
          closureId,
          auditeeId: userId,
        },
        client,
      );

  if (!closure) {
    throw new AppError(
      "The closure assignment was not found or is not assigned to the authenticated auditee.",
      404,
      "CLOSURE_ASSIGNMENT_NOT_FOUND",
    );
  }

  if (
    !canEditClosureItem(closure.status)
  ) {
    throw new AppError(
      "Evidence cannot be changed in the current status.",
      409,
      "CLOSURE_ACTION_PLAN_LOCKED",
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

  return { closure, item };
}

/**
 * Attaches photographs to one observation's action plan.
 *
 * The files are already on disk by the time this runs, because multer
 * writes them before the handler. So every path out of here that does
 * not record them in the database has to delete them again, or the
 * upload directory fills with files nothing points at.
 */
export async function addClosureItemEvidence({
  userId,
  closureId,
  closureItemId,
  files,
}) {
  const uploaded = files ?? [];

  if (uploaded.length === 0) {
    throw new AppError(
      "Attach at least one photograph.",
      400,
      "EVIDENCE_REQUIRED",
    );
  }

  let evidence;

  /*
   * Only a failed write removes the files. Once the rows have
   * committed they own the files, so a failure while re-reading the
   * closure below must not delete what the rows now point at.
   */
  try {
    evidence =
      await withTransaction(
        async (client) => {
          await findEditableClosureItem({
            userId,
            closureId,
            closureItemId,
            client,
          });

          /*
           * Locked and counted inside the transaction: two uploads
           * arriving together would otherwise each see room and
           * between them exceed the limit.
           */
          const existingCount =
            await closureRepository
              .countClosureItemEvidenceForUpdate(
                closureItemId,
                client,
              );

          if (
            existingCount +
              uploaded.length >
            MAX_EVIDENCE_FILES
          ) {
            throw new AppError(
              `An observation can hold up to ${MAX_EVIDENCE_FILES} evidence photographs, and this one already has ${existingCount}.`,
              400,
              "TOO_MANY_EVIDENCE_IMAGES",
            );
          }

          return Promise.all(
            uploaded.map((file) =>
              closureRepository
                .insertClosureItemEvidence(
                  {
                    closureItemId,

                    /*
                     * A SharePoint reference is stored as it is; a
                     * file on the volume, relative to the backend's
                     * working directory as it always has been.
                     */
                    filePath:
                      isSharePointReference(
                        file.path,
                      )
                        ? file.path
                        : path.relative(
                            process.cwd(),
                            file.path,
                          ),

                    originalName:
                      file.originalname,

                    mimeType:
                      file.mimetype,

                    size: file.size,

                    uploadedBy: userId,
                  },
                  client,
                ),
            ),
          );
        },
      );
  } catch (error) {
    await removeUploadedFiles(uploaded);

    throw error;
  }

  const refreshed = await getClosureById({
    userId,
    closureId,
  });

  return {
    message:
      evidence.length === 1
        ? "Evidence photograph attached."
        : "Evidence photographs attached.",

    closure: refreshed.closure,
  };
}

/**
 * Removes one evidence photograph.
 *
 * The row goes first and the file only once that has committed: a
 * deleted file with a surviving row would be a broken image on the
 * page, whereas the reverse is a file nothing references.
 */
export async function deleteClosureItemEvidence({
  userId,
  closureId,
  closureItemId,
  evidenceId,
}) {
  const filePath = await withTransaction(
    async (client) => {
      await findEditableClosureItem({
        userId,
        closureId,
        closureItemId,
        client,
      });

      const evidence =
        await closureRepository
          .findEvidenceById(
            evidenceId,
            client,
          );

      if (
        !evidence ||
        Number(evidence.closureItemId) !==
          Number(closureItemId)
      ) {
        throw new AppError(
          "That evidence photograph was not found on this observation.",
          404,
          "EVIDENCE_NOT_FOUND",
        );
      }

      return closureRepository
        .deleteEvidenceById(
          evidenceId,
          client,
        );
    },
  );

  if (filePath) {
    await removeUploadedFiles([filePath]);
  }

  const refreshed = await getClosureById({
    userId,
    closureId,
  });

  return {
    message:
      "Evidence photograph removed.",

    closure: refreshed.closure,
  };
}

/**
 * Serves one evidence photograph to anybody entitled to read the
 * closure it belongs to, which is the auditee, the auditor and the EHS
 * Officer of the patrol. Files are never exposed statically.
 */
export async function getClosureItemEvidenceFile({
  userId,
  closureId,
  closureItemId,
  evidenceId,
}) {
  /*
   * The access decision is the closure's, not the file's: if this
   * returns nothing, the caller has no business seeing anything
   * attached to it.
   */
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

  const evidence =
    await closureRepository
      .findEvidenceById(evidenceId);

  const belongsHere =
    evidence &&
    Number(evidence.closureItemId) ===
      Number(closureItemId) &&
    Number(evidence.closureId) ===
      Number(closureId);

  if (!belongsHere) {
    throw new AppError(
      "That evidence photograph was not found on this observation.",
      404,
      "EVIDENCE_NOT_FOUND",
    );
  }

  const originalName =
    evidence.originalName ??
    "closure-evidence";

  const mimeType =
    evidence.mimeType ??
    "application/octet-stream";

  if (
    isSharePointReference(evidence.filePath)
  ) {
    return {
      sharePointReference:
        evidence.filePath,
      originalName,
      mimeType,
      missingMessage:
        "The evidence photograph file is unavailable.",
      missingCode:
        "EVIDENCE_FILE_NOT_FOUND",
    };
  }

  const absolutePath = path.resolve(
    process.cwd(),
    evidence.filePath,
  );

  /*
   * The stored path is ours, but resolving it and serving whatever
   * comes out would turn a bad row into an arbitrary file read.
   */
  if (
    !absolutePath.startsWith(
      `${UPLOAD_DIRECTORY}${path.sep}`,
    )
  ) {
    throw new AppError(
      "The stored evidence path is invalid.",
      500,
      "INVALID_EVIDENCE_PATH",
    );
  }

  try {
    await access(absolutePath);
  } catch {
    throw new AppError(
      "The evidence photograph file is unavailable.",
      404,
      "EVIDENCE_FILE_NOT_FOUND",
    );
  }

  return {
    absolutePath,
    originalName,
    mimeType,
  };
}
