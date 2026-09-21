import * as closureRepository
  from "./closure.repository.js";

/*
 * Lives in its own module, depending only on the repository, because
 * both closure.service.js and ticket.service.js need it: the ticket
 * service recomputes the closure's status when a department accepts,
 * rejects or closes a ticket, and closure.service.js already imports
 * ticket.service.js, so importing it the other way round would cycle.
 */

const READY_FOR_SUBMISSION =
  "READY_FOR_SUBMISSION";

/*
 * Statuses the EHS Officer's review owns. A recompute never moves a
 * closure out of one of these: only the officer (or the auditee's
 * submit) may.
 */
const REVIEW_OWNED_STATUSES = new Set([
  "SUBMITTED_FOR_CLOSURE",
  "APPROVED",
  "REJECTED",
]);

function normalizeStatus(status) {
  return String(status ?? "")
    .trim()
    .toUpperCase();
}

function hasPlan(item) {
  return Boolean(
    String(item.actionPlan ?? "").trim(),
  );
}

/**
 * The closure's status as the spec defines it, from its observations
 * and their latest tickets (docs/16-closure-refinement-plan.md, D5):
 *
 * - Open: any observation still has no action plan, or has one that no
 *   department has taken up yet (its ticket is missing or still OPEN).
 * - In Progress: every observation's plan is with a department and at
 *   least one is still being worked.
 * - Every ticket resolved: returns the READY_FOR_SUBMISSION sentinel,
 *   which the caller maps, because "closed" additionally needs the EHS
 *   Officer's approval (D6).
 */
export function deriveClosureStatus(items) {
  if (
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return "OPEN";
  }

  if (!items.every(hasPlan)) {
    return "OPEN";
  }

  const everyTicketTakenUp = items.every(
    (item) =>
      item.ticket &&
      normalizeStatus(item.ticket.status) !==
        "OPEN",
  );

  if (!everyTicketTakenUp) {
    return "OPEN";
  }

  const everyTicketClosed = items.every(
    (item) =>
      normalizeStatus(item.ticket.status) ===
      "CLOSED",
  );

  if (!everyTicketClosed) {
    return "IN_PROGRESS";
  }

  return READY_FOR_SUBMISSION;
}

/**
 * True when every observation has a plan and every ticket has been
 * resolved, so the auditee may send the closure for approval.
 */
export function isReadyForSubmission(items) {
  return (
    deriveClosureStatus(items) ===
    READY_FOR_SUBMISSION
  );
}

/**
 * Recomputes and stores the closure's status after an item or a ticket
 * changed. Returns the status the closure now holds.
 */
export async function recomputeClosureStatus(
  closureId,
  client,
) {
  const [items, currentStatus] =
    await Promise.all([
      closureRepository.findClosureItems(
        closureId,
        client,
      ),

      closureRepository.findClosureStatus(
        closureId,
        client,
      ),
    ]);

  const normalizedCurrent =
    normalizeStatus(currentStatus);

  /*
   * Once the closure is with the EHS Officer (or already decided), its
   * status is theirs to move; a late ticket event must not drag it
   * backwards.
   */
  if (
    REVIEW_OWNED_STATUSES.has(
      normalizedCurrent,
    )
  ) {
    return normalizedCurrent;
  }

  const derived =
    deriveClosureStatus(items);

  /*
   * Every ticket resolved means "ready to submit", not "submitted":
   * the closure waits in IN_PROGRESS for the auditee to send it.
   */
  const nextStatus =
    derived === READY_FOR_SUBMISSION
      ? "IN_PROGRESS"
      : derived;

  if (nextStatus === normalizedCurrent) {
    return normalizedCurrent;
  }

  await closureRepository.updateClosureStatus(
    {
      closureId,
      status: nextStatus,
    },
    client,
  );

  return nextStatus;
}
