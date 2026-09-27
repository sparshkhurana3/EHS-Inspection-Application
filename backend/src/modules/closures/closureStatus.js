import * as closureRepository
  from "./closure.repository.js";

/*
 * Where a closure's status comes from.
 *
 * It used to be derived from the action tickets raised against each
 * observation. With the tickets gone and the auditee responsible for
 * carrying the work out themselves, the only thing that moves a closure
 * forward is whether every observation has an action plan written
 * against it.
 *
 * The module stays separate from closure.service.js so the derivation
 * can be read on its own, and so it keeps depending on nothing but the
 * repository.
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
 * The closure's status, from its observations alone:
 *
 * - Open: at least one observation still has no action plan. A closure
 *   whose report carries no observations is Open too — there is
 *   nothing to have planned, and it should not look finished.
 * - Otherwise every observation is planned, and the closure is ready to
 *   go to the EHS Officer. That returns the READY_FOR_SUBMISSION
 *   sentinel rather than a stored status, because being ready is not
 *   the same as having been sent: the caller maps it to IN_PROGRESS and
 *   the auditee still has to submit.
 *
 * Evidence photographs deliberately do not gate this. They are optional
 * supporting material, and the EHS Officer can send a closure back if
 * what was attached does not convince them.
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

  return READY_FOR_SUBMISSION;
}

/**
 * True when every observation has an action plan, so the auditee may
 * send the closure for approval.
 */
export function isReadyForSubmission(items) {
  return (
    deriveClosureStatus(items) ===
    READY_FOR_SUBMISSION
  );
}

/**
 * Recomputes and stores the closure's status after an item changed.
 * Returns the status the closure now holds.
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
   * status is theirs to move; a late edit must not drag it backwards.
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
   * Every observation planned means "ready to submit", not
   * "submitted": the closure waits in IN_PROGRESS for the auditee to
   * send it.
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
