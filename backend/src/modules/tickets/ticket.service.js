import {
  access,
  unlink,
} from "node:fs/promises";

import path from "node:path";

import {
  withTransaction,
} from "../../config/database.js";

import AppError
  from "../../shared/errors/AppError.js";

import * as ticketRepository
  from "./ticket.repository.js";

import {
  recomputeClosureStatus,
} from "../closures/closureStatus.js";

const CLOSED_WINDOW_DAYS = 30;

const MAX_EVIDENCE_FILES = 3;

const HISTORY_WINDOW_MONTHS = 6;

const STATUS_LABELS = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  PENDING_APPROVAL: "Pending Approval",
  CLOSED: "Closed",
};

const DECISION_LABELS = {
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
};

function normalizeStatus(status) {
  return String(status ?? "")
    .trim()
    .toUpperCase();
}

function getCurrentLocalDate() {
  const date = new Date();

  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1,
  ).padStart(2, "0");

  const day = String(
    date.getDate(),
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
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
        "Unable to remove uploaded ticket evidence file:",
        error,
      );
    }
  }
}

function createTicketResponse(
  ticket,
  { evidence = [], evidenceCount } = {},
) {
  if (!ticket) {
    return null;
  }

  const normalizedStatus =
    normalizeStatus(ticket.status);

  const resolvedEvidenceCount =
    evidenceCount ?? evidence.length;

  const today =
    getCurrentLocalDate();

  return {
    ...ticket,

    status: normalizedStatus,

    displayStatus:
      STATUS_LABELS[normalizedStatus] ??
      normalizedStatus,

    displayDecision:
      ticket.decision
        ? (DECISION_LABELS[ticket.decision] ??
          ticket.decision)
        : null,

    canDecide:
      normalizedStatus === "OPEN",

    canAddEvidence:
      normalizedStatus === "IN_PROGRESS",

    /*
     * The HOD sends their work to the EHS Officer rather than closing
     * the ticket themselves (docs/17, D5): at least one photograph is
     * needed, and the resolution comments are checked on submit.
     */
    canSubmitResolution:
      normalizedStatus === "IN_PROGRESS" &&
      resolvedEvidenceCount >= 1 &&
      resolvedEvidenceCount <=
        MAX_EVIDENCE_FILES,

    awaitingApproval:
      normalizedStatus ===
      "PENDING_APPROVAL",

    /* What the officer is being asked to approve. */
    pendingOutcome:
      normalizedStatus ===
      "PENDING_APPROVAL"
        ? (ticket.decision === "REJECTED"
            ? "REJECTION"
            : "RESOLUTION")
        : null,

    wasReopened:
      normalizedStatus === "OPEN" &&
      Number(ticket.reopenCount ?? 0) > 0,

    isOverdue:
      normalizedStatus !== "CLOSED" &&
      Boolean(ticket.targetDate) &&
      String(ticket.targetDate).slice(0, 10) <
        today,

    evidenceCount: resolvedEvidenceCount,

    evidence: evidence.map((item) => ({
      id: item.id,
      originalName: item.originalName,
      mimeType: item.mimeType,
      size: item.size,
      uploadedAt: item.uploadedAt,
    })),
  };
}

/**
 * The Action Team HOD's Ticket page in one response: open, in progress,
 * and closed in the last 30 days.
 */
export async function getHodTickets({
  userId,
}) {
  const tickets =
    await ticketRepository
      .findTicketsForHod({
        hodId: userId,
        closedDaysBack: CLOSED_WINDOW_DAYS,
      });

  const evidenceCounts =
    await Promise.all(
      tickets.map((ticket) =>
        ticketRepository.countEvidence(
          ticket.id,
        ),
      ),
    );

  const decorated = tickets.map(
    (ticket, index) =>
      createTicketResponse(ticket, {
        evidenceCount:
          evidenceCounts[index],
      }),
  );

  const open = decorated.filter(
    (ticket) => ticket.status === "OPEN",
  );

  const inProgress = decorated.filter(
    (ticket) =>
      ticket.status === "IN_PROGRESS",
  );

  const pendingApproval = decorated.filter(
    (ticket) =>
      ticket.status === "PENDING_APPROVAL",
  );

  const closed = decorated.filter(
    (ticket) =>
      ticket.status === "CLOSED",
  );

  return {
    closedWindowDays: CLOSED_WINDOW_DAYS,

    openCount: open.length,
    inProgressCount: inProgress.length,
    pendingApprovalCount:
      pendingApproval.length,
    closedCount: closed.length,

    open,
    inProgress,
    pendingApproval,
    closed,
  };
}

/**
 * Every ticket assigned to this HOD in the last six months, open or
 * closed, optionally filtered by status (docs/17, D8).
 */
export async function getHodTicketHistory({
  userId,
  filter = "all",
}) {
  const fromDate = new Date();

  fromDate.setUTCMonth(
    fromDate.getUTCMonth() -
      HISTORY_WINDOW_MONTHS,
  );

  const tickets =
    await ticketRepository
      .findTicketHistoryForHod({
        hodId: userId,
        fromDate: fromDate
          .toISOString()
          .slice(0, 10),
        filter,
      });

  const evidenceCounts =
    await Promise.all(
      tickets.map((ticket) =>
        ticketRepository.countEvidence(
          ticket.id,
        ),
      ),
    );

  return {
    windowMonths: HISTORY_WINDOW_MONTHS,
    filter,
    count: tickets.length,

    tickets: tickets.map(
      (ticket, index) =>
        createTicketResponse(ticket, {
          evidenceCount:
            evidenceCounts[index],
        }),
    ),
  };
}

/**
 * One ticket with its evidence, for the detail view. Readable by the
 * assigned HOD, the auditee who assigned it, the auditor, and the
 * patrol's EHS Officer.
 */
export async function getTicketById({
  userId,
  ticketId,
}) {
  const ticket =
    await ticketRepository
      .findTicketByIdForUser({
        ticketId,
        userId,
      });

  if (!ticket) {
    throw new AppError(
      "The ticket was not found.",
      404,
      "TICKET_NOT_FOUND",
    );
  }

  const evidence =
    await ticketRepository
      .findEvidenceForTicket(ticket.id);

  return {
    ticket: createTicketResponse(
      ticket,
      { evidence },
    ),
  };
}

export async function getTicketLookups() {
  const correctiveActionTypes =
    await ticketRepository
      .findActiveCorrectiveActionTypes();

  return {
    correctiveActionTypes:
      correctiveActionTypes.map(
        (type) => ({
          id: type.id,
          code: type.code,
          name: type.name,
        }),
      ),
  };
}

/**
 * Accept or reject the proposed plan. Accept moves the ticket to
 * IN_PROGRESS; reject sends it to the EHS Officer, who closes it or
 * sends it back (docs/17, D4). No work is done on the ground for a
 * rejected plan either way.
 */
async function decideTicket({
  userId,
  ticketId,
  accept,
  comments,
  correctiveActionTypeId,
}) {
  const normalizedComments = String(
    comments ?? "",
  ).trim();

  if (!normalizedComments) {
    throw new AppError(
      "Comments are required to accept or reject the action plan.",
      400,
      "TICKET_COMMENTS_REQUIRED",
    );
  }

  let resolvedTypeId = null;

  if (accept) {
    if (!correctiveActionTypeId) {
      throw new AppError(
        "Select the type of corrective action.",
        400,
        "CORRECTIVE_ACTION_TYPE_REQUIRED",
      );
    }

    const type =
      await ticketRepository
        .findCorrectiveActionTypeById(
          correctiveActionTypeId,
        );

    if (!type) {
      throw new AppError(
        "Select a valid type of corrective action.",
        400,
        "INVALID_CORRECTIVE_ACTION_TYPE",
      );
    }

    resolvedTypeId = type.id;
  } else if (correctiveActionTypeId) {
    const type =
      await ticketRepository
        .findCorrectiveActionTypeById(
          correctiveActionTypeId,
        );

    if (!type) {
      throw new AppError(
        "Select a valid type of corrective action.",
        400,
        "INVALID_CORRECTIVE_ACTION_TYPE",
      );
    }

    resolvedTypeId = type.id;
  }

  await withTransaction(async (client) => {
    const existing =
      await ticketRepository
        .findTicketByIdForHod(
          {
            ticketId,
            hodId: userId,
            forUpdate: true,
          },
          client,
        );

    if (!existing) {
      throw new AppError(
        "The ticket was not found.",
        404,
        "TICKET_NOT_FOUND",
      );
    }

    if (
      normalizeStatus(existing.status) !==
      "OPEN"
    ) {
      throw new AppError(
        "This ticket is not awaiting a decision.",
        409,
        "TICKET_NOT_OPEN",
      );
    }

    const updated = accept
      ? await ticketRepository.acceptTicket(
          {
            ticketId,
            hodId: userId,
            comments: normalizedComments,
            correctiveActionTypeId:
              resolvedTypeId,
          },
          client,
        )
      : await ticketRepository.rejectTicket(
          {
            ticketId,
            hodId: userId,
            comments: normalizedComments,
            correctiveActionTypeId:
              resolvedTypeId,
          },
          client,
        );

    if (!updated) {
      throw new AppError(
        "This ticket was already decided. Reload and try again.",
        409,
        "TICKET_STATUS_CHANGED",
      );
    }

    /*
     * The closure's status is derived from every observation and its
     * ticket, so it moves with this decision, in the same transaction
     * (docs/16-closure-refinement-plan.md, D5).
     */
    await recomputeClosureStatus(
      existing.closureRequestId,
      client,
    );
  });

  return getTicketById({
    userId,
    ticketId,
  }).then((result) => ({
    message: accept
      ? "Action plan accepted."
      : "Action plan rejected and sent to the EHS Officer for approval.",

    ticket: result.ticket,
  }));
}

export async function acceptTicket(input) {
  return decideTicket({
    ...input,
    accept: true,
  });
}

export async function rejectTicket(input) {
  return decideTicket({
    ...input,
    accept: false,
  });
}

/**
 * Attach up to 3 evidence photographs while the ticket is in progress.
 * Every uploaded file is unlinked on failure, since multer has already
 * written it to disk by the time this runs.
 */
export async function addEvidence({
  userId,
  ticketId,
  files,
}) {
  const uploadedFiles = files ?? [];

  if (!uploadedFiles.length) {
    throw new AppError(
      "Select at least one evidence photograph.",
      400,
      "EVIDENCE_REQUIRED",
    );
  }

  async function rejectAll(message, code) {
    await Promise.all(
      uploadedFiles.map((file) =>
        safelyDeleteFile(file.path),
      ),
    );

    throw new AppError(message, 400, code);
  }

  try {
    await withTransaction(async (client) => {
      const existing =
        await ticketRepository
          .findTicketByIdForHod(
            {
              ticketId,
              hodId: userId,
              forUpdate: true,
            },
            client,
          );

      if (!existing) {
        throw new AppError(
          "The ticket was not found.",
          404,
          "TICKET_NOT_FOUND",
        );
      }

      if (
        normalizeStatus(existing.status) !==
        "IN_PROGRESS"
      ) {
        throw new AppError(
          "Evidence can only be added while the ticket is in progress.",
          409,
          "TICKET_NOT_IN_PROGRESS",
        );
      }

      const currentCount =
        await ticketRepository.countEvidence(
          ticketId,
          client,
        );

      if (
        currentCount + uploadedFiles.length >
        MAX_EVIDENCE_FILES
      ) {
        const remaining = Math.max(
          MAX_EVIDENCE_FILES - currentCount,
          0,
        );

        throw new AppError(
          remaining > 0
            ? `This ticket can hold ${MAX_EVIDENCE_FILES} evidence photographs; ${remaining} more can be added.`
            : `This ticket already has the maximum of ${MAX_EVIDENCE_FILES} evidence photographs.`,
          400,
          "TOO_MANY_EVIDENCE_IMAGES",
        );
      }

      await ticketRepository.insertEvidence(
        {
          ticketId,
          files: uploadedFiles,
          uploadedBy: userId,
        },
        client,
      );
    });
  } catch (error) {
    await Promise.all(
      uploadedFiles.map((file) =>
        safelyDeleteFile(file.path),
      ),
    );

    throw error;
  }

  const result = await getTicketById({
    userId,
    ticketId,
  });

  return {
    message: "Evidence added.",
    ticket: result.ticket,
  };
}

export async function removeEvidence({
  userId,
  ticketId,
  evidenceId,
}) {
  let deletedFilePath = null;

  await withTransaction(async (client) => {
    const existing =
      await ticketRepository
        .findTicketByIdForHod(
          {
            ticketId,
            hodId: userId,
            forUpdate: true,
          },
          client,
        );

    if (!existing) {
      throw new AppError(
        "The ticket was not found.",
        404,
        "TICKET_NOT_FOUND",
      );
    }

    if (
      normalizeStatus(existing.status) !==
      "IN_PROGRESS"
    ) {
      throw new AppError(
        "Evidence can only be removed while the ticket is in progress.",
        409,
        "TICKET_NOT_IN_PROGRESS",
      );
    }

    const deleted =
      await ticketRepository.deleteEvidence(
        { ticketId, evidenceId },
        client,
      );

    if (!deleted) {
      throw new AppError(
        "The evidence photograph was not found.",
        404,
        "EVIDENCE_NOT_FOUND",
      );
    }

    deletedFilePath = deleted.file_path;
  });

  await safelyDeleteFile(deletedFilePath);

  const result = await getTicketById({
    userId,
    ticketId,
  });

  return {
    message: "Evidence removed.",
    ticket: result.ticket,
  };
}

/**
 * Close an in-progress ticket once the work is done on the ground.
 * Requires at least one evidence photograph.
 */
/**
 * The HOD's completed work goes to the EHS Officer for approval, with
 * the evidence photographs and a written resolution (docs/17, D5).
 */
export async function submitResolution({
  userId,
  ticketId,
  resolutionComments,
  correctiveActionTypeId,
}) {
  const normalizedComments = String(
    resolutionComments ?? "",
  ).trim();

  if (!normalizedComments) {
    throw new AppError(
      "Describe what was done before submitting the resolution.",
      400,
      "RESOLUTION_COMMENTS_REQUIRED",
    );
  }

  let resolvedTypeId = null;

  if (correctiveActionTypeId) {
    const type =
      await ticketRepository
        .findCorrectiveActionTypeById(
          correctiveActionTypeId,
        );

    if (!type) {
      throw new AppError(
        "Select a valid type of corrective action.",
        400,
        "INVALID_CORRECTIVE_ACTION_TYPE",
      );
    }

    resolvedTypeId = type.id;
  }

  await withTransaction(async (client) => {
    const existing =
      await ticketRepository
        .findTicketByIdForHod(
          {
            ticketId,
            hodId: userId,
            forUpdate: true,
          },
          client,
        );

    if (!existing) {
      throw new AppError(
        "The ticket was not found.",
        404,
        "TICKET_NOT_FOUND",
      );
    }

    if (
      normalizeStatus(existing.status) !==
      "IN_PROGRESS"
    ) {
      throw new AppError(
        "This ticket is not in progress.",
        409,
        "TICKET_NOT_IN_PROGRESS",
      );
    }

    const evidenceCount =
      await ticketRepository.countEvidence(
        ticketId,
        client,
      );

    if (evidenceCount < 1) {
      throw new AppError(
        "Attach at least one evidence photograph before submitting the resolution.",
        400,
        "EVIDENCE_REQUIRED_TO_CLOSE",
      );
    }

    const updated =
      await ticketRepository
        .submitResolution(
          {
            ticketId,
            hodId: userId,
            resolutionComments:
              normalizedComments,
            correctiveActionTypeId:
              resolvedTypeId,
          },
          client,
        );

    if (!updated) {
      throw new AppError(
        "This ticket was already submitted. Reload and try again.",
        409,
        "TICKET_STATUS_CHANGED",
      );
    }

    await recomputeClosureStatus(
      existing.closureRequestId,
      client,
    );
  });

  const result = await getTicketById({
    userId,
    ticketId,
  });

  return {
    message:
      "Resolution sent to the EHS Officer for approval.",

    ticket: result.ticket,
  };
}

/**
 * Every ticket waiting on this EHS Officer's decision.
 */
export async function getPendingTicketApprovals({
  userId,
}) {
  const tickets =
    await ticketRepository
      .findTicketsPendingApproval({
        userId,
      });

  const evidenceLists =
    await Promise.all(
      tickets.map((ticket) =>
        ticketRepository
          .findEvidenceForTicket(
            ticket.id,
          ),
      ),
    );

  return {
    count: tickets.length,

    tickets: tickets.map(
      (ticket, index) =>
        createTicketResponse(ticket, {
          evidence: evidenceLists[index],
        }),
    ),
  };
}

/*
 * Shared by approve and reopen: both act on a ticket that is waiting on
 * the officer, and both move the closure's derived status.
 */
async function reviewTicket({
  userId,
  ticketId,
  comments,
  approve,
}) {
  let evidencePathsToDelete = [];

  await withTransaction(async (client) => {
    const existing =
      await ticketRepository
        .findTicketByIdForApprover(
          {
            ticketId,
            userId,
            forUpdate: true,
          },
          client,
        );

    if (!existing) {
      throw new AppError(
        "The ticket was not found.",
        404,
        "TICKET_NOT_FOUND",
      );
    }

    if (
      normalizeStatus(existing.status) !==
      "PENDING_APPROVAL"
    ) {
      throw new AppError(
        "This ticket is not awaiting approval.",
        409,
        "TICKET_NOT_AWAITING_APPROVAL",
      );
    }

    const updated = approve
      ? await ticketRepository.approveTicket(
          {
            ticketId,
            approverId: userId,
            comments: comments || null,
          },
          client,
        )
      : await ticketRepository.reopenTicket(
          {
            ticketId,
            approverId: userId,
            comments,
          },
          client,
        );

    if (!updated) {
      throw new AppError(
        "This ticket was reviewed by someone else. Reload and try again.",
        409,
        "TICKET_STATUS_CHANGED",
      );
    }

    /*
     * Reopening clears what the HOD attached, so they start again
     * (docs/17, D6). The files are unlinked only once the transaction
     * has committed: a rolled-back reopen must not lose photographs.
     */
    if (!approve) {
      evidencePathsToDelete =
        await ticketRepository
          .deleteEvidenceForTicket(
            ticketId,
            client,
          );
    }

    await recomputeClosureStatus(
      existing.closureRequestId,
      client,
    );
  });

  await Promise.all(
    evidencePathsToDelete.map((filePath) =>
      safelyDeleteFile(filePath),
    ),
  );

  const result = await getTicketById({
    userId,
    ticketId,
  });

  return {
    message: approve
      ? "Ticket approved and closed."
      : "Ticket reopened and sent back to the Action Team HOD.",

    ticket: result.ticket,
  };
}

export async function approveTicket({
  userId,
  ticketId,
  comments,
}) {
  return reviewTicket({
    userId,
    ticketId,
    comments: String(comments ?? "").trim(),
    approve: true,
  });
}

export async function reopenTicket({
  userId,
  ticketId,
  comments,
}) {
  const normalizedComments = String(
    comments ?? "",
  ).trim();

  if (!normalizedComments) {
    throw new AppError(
      "Explain what the Action Team HOD needs to redo before reopening the ticket.",
      400,
      "REOPEN_COMMENTS_REQUIRED",
    );
  }

  return reviewTicket({
    userId,
    ticketId,
    comments: normalizedComments,
    approve: false,
  });
}

/**
 * Serve one evidence photograph, subject to the same ownership check
 * used to read the ticket it belongs to.
 */
export async function getEvidenceFile({
  userId,
  ticketId,
  evidenceId,
}) {
  const evidence =
    await ticketRepository
      .findEvidenceByIdForUser({
        ticketId,
        evidenceId,
        userId,
      });

  if (!evidence || !evidence.filePath) {
    throw new AppError(
      "The evidence photograph was not found.",
      404,
      "EVIDENCE_NOT_FOUND",
    );
  }

  const absolutePath = path.resolve(
    process.cwd(),
    evidence.filePath,
  );

  const allowedUploadDirectory =
    path.resolve(
      process.cwd(),
      "uploads",
      "tickets",
    );

  if (
    !absolutePath.startsWith(
      `${allowedUploadDirectory}${path.sep}`,
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

    originalName:
      evidence.originalName ??
      "ticket-evidence",

    mimeType:
      evidence.mimeType ??
      "application/octet-stream",
  };
}
