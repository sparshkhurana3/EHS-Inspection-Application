import AppError from "../../shared/errors/AppError.js";

import {
  withTransaction,
} from "../../config/database.js";

import * as patrolRepository
  from "./patrol.repository.js";

/**
 * Today in the server's timezone, as YYYY-MM-DD. Containers run UTC so
 * this matches the dashboard, which works in UTC throughout.
 */
function getCurrentDate() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}

function normalizeDateOnly(value) {
  return String(value ?? "").slice(0, 10);
}

/**
 * A DATE column comes back from `pg` as a JS Date, not a string, so
 * String(value).slice(0, 10) (normalizeDateOnly, above) would slice the
 * long-form Date#toString() output instead of an ISO date. Used only
 * for values read back from the database; a user-submitted date is
 * already a "YYYY-MM-DD" string and goes through normalizeDateOnly.
 */
function toDateOnlyString(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return normalizeDateOnly(value);
}

function toPositiveInteger(value) {
  const parsed = Number.parseInt(value, 10);

  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : null;
}

/**
 * The officer's own location, which bounds everything they may plan.
 */
async function requireOfficerLocation(
  userId,
  client,
) {
  const location =
    await patrolRepository.findUserLocation(
      userId,
      client,
    );

  if (!location) {
    throw new AppError(
      "Your account is not assigned to a location, so audits cannot be planned. Ask an administrator to set your location.",
      400,
      "EHS_OFFICER_LOCATION_NOT_SET",
    );
  }

  return location;
}

/**
 * Everything the planning form needs, scoped to the officer's location:
 * their units and zones, each zone's fixed areas, and the colleagues who
 * can be assigned as auditor or auditee.
 */
export async function getPlanningLookups({ userId }) {
  const location =
    await requireOfficerLocation(userId);

  const [scope, users] = await Promise.all([
    patrolRepository.findPlanningScope(
      location.id,
    ),

    patrolRepository.findUsersAtLocation({
      plantId: location.id,

      /*
       * The officer plans the audit; they do not walk it. Excluding
       * them keeps them out of both dropdowns.
       */
      excludeUserId: userId,
    }),
  ]);

  return {
    location,
    units: scope.units,
    zones: scope.zones,
    users,
  };
}

function validateScheduleInput({
  zoneId,
  scheduledDate,
  auditorId,
  auditeeId,
}) {
  const normalizedZoneId =
    toPositiveInteger(zoneId);

  if (!normalizedZoneId) {
    throw new AppError(
      "Select the zone to be audited.",
      400,
      "INSPECTION_ZONE_REQUIRED",
    );
  }

  const normalizedDate =
    normalizeDateOnly(scheduledDate);

  if (!normalizedDate) {
    throw new AppError(
      "Audit date is required.",
      400,
      "SCHEDULED_DATE_REQUIRED",
    );
  }

  if (
    Number.isNaN(
      new Date(
        `${normalizedDate}T00:00:00Z`,
      ).getTime(),
    )
  ) {
    throw new AppError(
      "Select a valid audit date.",
      400,
      "INVALID_SCHEDULED_DATE",
    );
  }

  /*
   * Both sides are YYYY-MM-DD, so a string comparison is a date
   * comparison. Today is allowed.
   */
  if (normalizedDate < getCurrentDate()) {
    throw new AppError(
      "The audit date cannot be in the past.",
      400,
      "AUDIT_DATE_IN_PAST",
    );
  }

  const normalizedAuditorId =
    toPositiveInteger(auditorId);

  if (!normalizedAuditorId) {
    throw new AppError(
      "Select the auditor for this audit.",
      400,
      "INVALID_AUDITOR_ID",
    );
  }

  const normalizedAuditeeId =
    toPositiveInteger(auditeeId);

  if (!normalizedAuditeeId) {
    throw new AppError(
      "Select the auditee for this audit.",
      400,
      "INVALID_AUDITEE_ID",
    );
  }

  if (
    normalizedAuditorId ===
    normalizedAuditeeId
  ) {
    throw new AppError(
      "The auditor and auditee must be different users.",
      400,
      "AUDITOR_AUDITEE_MUST_DIFFER",
    );
  }

  return {
    zoneId: normalizedZoneId,
    scheduledDate: normalizedDate,
    auditorId: normalizedAuditorId,
    auditeeId: normalizedAuditeeId,
  };
}

export async function schedulePatrol(input) {
  const {
    zoneId,
    scheduledDate,
    auditorId,
    auditeeId,
  } = validateScheduleInput(input);

  const patrolId = await withTransaction(
    async (client) => {
      /*
       * Re-read the officer's location inside the transaction. The
       * scoped dropdowns are presentation; this is the boundary that
       * actually stops an audit being planned somewhere else.
       */
      const location =
        await requireOfficerLocation(
          input.userId,
          client,
        );

      const zone =
        await patrolRepository
          .findZoneWithHierarchy(
            zoneId,
            client,
          );

      if (!zone) {
        throw new AppError(
          "The selected zone was not found.",
          400,
          "ZONE_NOT_FOUND",
        );
      }

      if (zone.plantId !== location.id) {
        throw new AppError(
          "The selected zone is outside the location you are responsible for.",
          403,
          "ZONE_OUTSIDE_OFFICER_DOMAIN",
        );
      }

      /*
       * An auditor sent to a zone with no areas configured has nothing
       * to inspect, and the observation form would have no area to
       * attribute a finding to.
       */
      if (zone.areaCount === 0) {
        throw new AppError(
          "The selected zone has no areas configured, so an audit cannot be scheduled for it.",
          400,
          "ZONE_HAS_NO_AREAS",
        );
      }

      const auditor =
        await patrolRepository
          .findActiveUserAtLocation(
            {
              userId: auditorId,
              plantId: location.id,
            },
            client,
          );

      if (!auditor) {
        throw new AppError(
          "The selected auditor is not an active user at this location.",
          400,
          "INVALID_AUDITOR",
        );
      }

      const auditee =
        await patrolRepository
          .findActiveUserAtLocation(
            {
              userId: auditeeId,
              plantId: location.id,
            },
            client,
          );

      if (!auditee) {
        throw new AppError(
          "The selected auditee is not an active user at this location.",
          400,
          "INVALID_AUDITEE",
        );
      }

      const conflict =
        await patrolRepository
          .findSchedulingConflict(
            {
              scheduledDate,
              auditorId,
              auditeeId,
            },
            client,
          );

      if (conflict) {
        throw new AppError(
          conflict.conflict_type === "AUDITOR"
            ? "The selected auditor already has an audit scheduled on this date."
            : "The selected auditee already has an audit scheduled on this date.",
          409,
          conflict.conflict_type === "AUDITOR"
            ? "AUDITOR_SCHEDULING_CONFLICT"
            : "AUDITEE_SCHEDULING_CONFLICT",
        );
      }

      const createdId =
        await patrolRepository.createPatrol(
          {
            unitId: zone.unitId,
            zoneId: zone.zoneId,
            plantName: zone.plantName,
            auditorId,
            auditeeId,
            scheduledDate,
            ehsOfficerId: input.userId,
          },
          client,
        );

      if (!createdId) {
        throw new AppError(
          "The audit could not be scheduled.",
          500,
          "AUDIT_SCHEDULING_FAILED",
        );
      }

      return createdId;
    },
  );

  const patrol =
    await patrolRepository.findPatrolById(
      patrolId,
    );

  return {
    message: "Audit scheduled successfully.",
    patrol,
  };
}

function validateAssignmentInput({
  auditorId,
  auditeeId,
}) {
  const normalizedAuditorId =
    toPositiveInteger(auditorId);

  if (!normalizedAuditorId) {
    throw new AppError(
      "Select the auditor for this audit.",
      400,
      "INVALID_AUDITOR_ID",
    );
  }

  const normalizedAuditeeId =
    toPositiveInteger(auditeeId);

  if (!normalizedAuditeeId) {
    throw new AppError(
      "Select the auditee for this audit.",
      400,
      "INVALID_AUDITEE_ID",
    );
  }

  if (
    normalizedAuditorId ===
    normalizedAuditeeId
  ) {
    throw new AppError(
      "The auditor and auditee must be different users.",
      400,
      "AUDITOR_AUDITEE_MUST_DIFFER",
    );
  }

  return {
    auditorId: normalizedAuditorId,
    auditeeId: normalizedAuditeeId,
  };
}

/**
 * Reassigns the auditor and/or auditee on a patrol the officer scheduled.
 * Only reachable while the patrol is still SCHEDULED: no observation
 * report has been filed and no closure opened, so nothing yet refers to
 * the people being replaced.
 */
export async function updatePatrolAssignment(
  input,
) {
  const {
    auditorId,
    auditeeId,
  } = validateAssignmentInput(input);

  const patrolId = toPositiveInteger(
    input.patrolId,
  );

  if (!patrolId) {
    throw new AppError(
      "The audit was not found.",
      404,
      "PATROL_NOT_FOUND",
    );
  }

  await withTransaction(async (client) => {
    const location =
      await requireOfficerLocation(
        input.userId,
        client,
      );

    const existingPatrol =
      await patrolRepository.findPatrolById(
        patrolId,
        client,
      );

    if (!existingPatrol) {
      throw new AppError(
        "The audit was not found.",
        404,
        "PATROL_NOT_FOUND",
      );
    }

    if (existingPatrol.plantId !== location.id) {
      throw new AppError(
        "This audit is outside the location you are responsible for.",
        403,
        "ZONE_OUTSIDE_OFFICER_DOMAIN",
      );
    }

    const auditor =
      await patrolRepository
        .findActiveUserAtLocation(
          {
            userId: auditorId,
            plantId: location.id,
          },
          client,
        );

    if (!auditor) {
      throw new AppError(
        "The selected auditor is not an active user at this location.",
        400,
        "INVALID_AUDITOR",
      );
    }

    const auditee =
      await patrolRepository
        .findActiveUserAtLocation(
          {
            userId: auditeeId,
            plantId: location.id,
          },
          client,
        );

    if (!auditee) {
      throw new AppError(
        "The selected auditee is not an active user at this location.",
        400,
        "INVALID_AUDITEE",
      );
    }

    const conflict =
      await patrolRepository
        .findSchedulingConflict(
          {
            scheduledDate:
              toDateOnlyString(
                existingPatrol.scheduledDate,
              ),
            auditorId,
            auditeeId,
            excludePatrolId: patrolId,
          },
          client,
        );

    if (conflict) {
      throw new AppError(
        conflict.conflict_type === "AUDITOR"
          ? "The selected auditor already has an audit scheduled on this date."
          : "The selected auditee already has an audit scheduled on this date.",
        409,
        conflict.conflict_type === "AUDITOR"
          ? "AUDITOR_SCHEDULING_CONFLICT"
          : "AUDITEE_SCHEDULING_CONFLICT",
      );
    }

    const updated =
      await patrolRepository
        .updatePatrolAssignment(
          { patrolId, auditorId, auditeeId },
          client,
        );

    if (!updated) {
      throw new AppError(
        "The auditor and auditee can only be changed before an observation report has been filed for this audit.",
        409,
        "PATROL_NOT_EDITABLE",
      );
    }
  });

  return {
    message:
      "Audit assignment updated successfully.",

    patrol:
      await patrolRepository.findPatrolById(
        patrolId,
      ),
  };
}
