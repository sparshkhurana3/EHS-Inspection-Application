import AppError from "../../shared/errors/AppError.js";

import {
  withTransaction,
} from "../../config/database.js";

import * as patrolRepository
  from "./patrol.repository.js";

import {
  parseRosterFile,
} from "./rosterParser.js";

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
 * The first Monday on or after a "YYYY-MM-DD" date, as the same shape.
 * (8 - day) % 7: Sunday (0) -> +1, Monday (1) -> +0, ... Saturday (6) -> +2.
 */
function getFirstMondayOnOrAfter(dateOnly) {
  const date = new Date(
    `${dateOnly}T00:00:00Z`,
  );

  date.setUTCDate(
    date.getUTCDate() +
      ((8 - date.getUTCDay()) % 7),
  );

  return date
    .toISOString()
    .slice(0, 10);
}

/**
 * Every Monday from firstMonday to lastDate inclusive, as
 * "YYYY-MM-DD" strings.
 */
function listMondays(firstMonday, lastDate) {
  const mondays = [];

  let cursor = new Date(
    `${firstMonday}T00:00:00Z`,
  );

  const end = new Date(
    `${lastDate}T00:00:00Z`,
  );

  while (cursor.getTime() <= end.getTime()) {
    mondays.push(
      cursor.toISOString().slice(0, 10),
    );

    cursor = new Date(
      cursor.getTime() +
        7 * 24 * 60 * 60 * 1000,
    );
  }

  return mondays;
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

      /*
       * One person may audit, or be audited on, several zones on the
       * same day: the only rule is that they cannot be both sides of
       * the same zone, which validateScheduleInput and the patrols
       * table's own CHECK both enforce.
       */
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
 *
 * When applyToUpcoming is true (the default), the change is propagated
 * to every SCHEDULED patrol for the same zone from the edited patrol's
 * date to 31 December of that year, roster-generated or manually
 * planned alike, and the zone's roster row (if any) is updated to
 * match. When false, only the one patrol changes.
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

  const applyToUpcoming =
    input.applyToUpcoming !== false;

  let updatedCount = 0;

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

    if (!applyToUpcoming) {
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

      updatedCount = 1;
      return;
    }

    const fromDate = toDateOnlyString(
      existingPatrol.scheduledDate,
    );

    const toDate =
      `${fromDate.slice(0, 4)}-12-31`;

    const targets =
      await patrolRepository
        .findUpcomingZonePatrolsForAssignment(
          {
            zoneId: existingPatrol.zoneId,
            fromDate,
            toDate,
          },
          client,
        );

    /*
     * target.id comes back from `pg` as a string (BIGINT), while
     * patrolId is the parsed number from the route param, so the
     * membership check below needs both sides normalized the same way.
     */
    const targetIds = targets.map(
      (target) => Number(target.id),
    );

    if (!targetIds.includes(patrolId)) {
      throw new AppError(
        "The auditor and auditee can only be changed before an observation report has been filed for this audit.",
        409,
        "PATROL_NOT_EDITABLE",
      );
    }

    updatedCount =
      await patrolRepository
        .updatePatrolAssignments(
          {
            patrolIds: targetIds,
            auditorId,
            auditeeId,
          },
          client,
        );

    if (updatedCount === 0) {
      throw new AppError(
        "The auditor and auditee can only be changed before an observation report has been filed for this audit.",
        409,
        "PATROL_NOT_EDITABLE",
      );
    }

    await patrolRepository
      .updateRosterAssignmentForZone(
        {
          zoneId: existingPatrol.zoneId,
          auditorId,
          auditeeId,
        },
        client,
      );
  });

  return {
    message: applyToUpcoming
      ? `Assignment updated for ${updatedCount} upcoming audit${
          updatedCount === 1 ? "" : "s"
        } of this zone.`
      : "Audit assignment updated successfully.",

    updatedCount,

    patrol:
      await patrolRepository.findPatrolById(
        patrolId,
      ),
  };
}

/*
 * ---------------------------------------------------------------------
 * Weekly roster: one-time upload that generates every upcoming Monday's
 * patrol per zone. See docs/14-weekly-roster-plan.md.
 * ---------------------------------------------------------------------
 */

const MAX_ROSTER_ROW_ERRORS = 100;

/**
 * The officer's current roster, one row per zone.
 */
export async function getRoster({ userId }) {
  const location =
    await requireOfficerLocation(userId);

  const rows =
    await patrolRepository.findRosterForPlant(
      location.id,
    );

  return {
    location,

    roster: {
      effectiveFrom:
        rows[0]?.effectiveFrom ?? null,
      effectiveTo:
        rows[0]?.effectiveTo ?? null,
      rows,
    },
  };
}

/**
 * Parses an uploaded roster file, resolves every row against the
 * officer's own plant, and, if every row is valid, replaces the roster
 * and regenerates every upcoming Monday's patrols from it. All or
 * nothing: any row error rolls back the whole upload untouched.
 */
export async function uploadRoster({
  userId,
  file,
}) {
  if (!file) {
    throw new AppError(
      "Select a .csv or .xlsx file to upload.",
      400,
      "ROSTER_FILE_REQUIRED",
    );
  }

  let parsed;

  try {
    parsed = await parseRosterFile({
      buffer: file.buffer,
      originalName: file.originalname,
    });
  } catch {
    throw new AppError(
      "The file could not be read. Check that it is a valid .csv or .xlsx file.",
      400,
      "ROSTER_UNREADABLE",
    );
  }

  const { rows, errors: parseErrors } = parsed;

  if (parseErrors.length > 0) {
    throw new AppError(
      "The roster file could not be read. Fix the listed rows and upload it again.",
      400,
      "ROSTER_INVALID",
      parseErrors.slice(
        0,
        MAX_ROSTER_ROW_ERRORS,
      ),
    );
  }

  if (rows.length === 0) {
    throw new AppError(
      "The roster file has no rows to schedule.",
      400,
      "ROSTER_EMPTY",
    );
  }

  const firstMonday =
    getFirstMondayOnOrAfter(
      getCurrentDate(),
    );

  const currentYear = Number(
    firstMonday.slice(0, 4),
  );

  const lastDate = `${currentYear}-12-31`;

  if (firstMonday > lastDate) {
    throw new AppError(
      "There are no Mondays left this year to schedule.",
      400,
      "NO_MONDAYS_REMAINING",
    );
  }

  const summary = await withTransaction(
    async (client) => {
      const location =
        await requireOfficerLocation(
          userId,
          client,
        );

      const scope =
        await patrolRepository
          .findRosterLookupScope(
            location.id,
            client,
          );

      const emails = [
        ...new Set(
          rows.flatMap((row) => [
            row.auditorEmail,
            row.auditeeEmail,
          ]),
        ),
      ];

      const usersByEmail =
        await patrolRepository
          .findActiveUsersByEmail(
            {
              plantId: location.id,
              emails,
              excludeUserId: userId,
            },
            client,
          );

      const normalizedLocationName =
        location.name.trim().toLowerCase();

      const normalizedLocationCode = (
        location.code ?? ""
      )
        .trim()
        .toLowerCase();

      const errors = [];
      const resolvedRows = [];
      const seenZoneIds = new Map();

      for (const row of rows) {
        const rowLocation =
          row.location.toLowerCase();

        if (
          rowLocation !==
            normalizedLocationName &&
          (normalizedLocationCode === "" ||
            rowLocation !==
              normalizedLocationCode)
        ) {
          errors.push({
            row: row.rowNumber,
            field: "location",
            message: `Location "${row.location}" is not the location you are responsible for (${location.name}).`,
          });

          continue;
        }

        const rowUnitText =
          row.unit.toLowerCase();

        const unitEntries = scope.filter(
          (entry) =>
            String(entry.unitName ?? "")
              .trim()
              .toLowerCase() ===
              rowUnitText ||
            String(entry.unitCode ?? "")
              .trim()
              .toLowerCase() ===
              rowUnitText ||
            String(entry.unitNumber ?? "")
              .trim()
              .toLowerCase() ===
              rowUnitText,
        );

        if (unitEntries.length === 0) {
          errors.push({
            row: row.rowNumber,
            field: "unit",
            message: `Unit "${row.unit}" was not found at ${location.name}.`,
          });

          continue;
        }

        const rowZoneText =
          row.zone.toLowerCase();

        const zoneEntry = unitEntries.find(
          (entry) =>
            String(entry.zoneName ?? "")
              .trim()
              .toLowerCase() ===
              rowZoneText ||
            String(entry.zoneCode ?? "")
              .trim()
              .toLowerCase() ===
              rowZoneText ||
            String(entry.zoneNumber ?? "")
              .trim()
              .toLowerCase() ===
              rowZoneText,
        );

        if (!zoneEntry) {
          errors.push({
            row: row.rowNumber,
            field: "zone",
            message: `Zone "${row.zone}" was not found in unit ${row.unit}.`,
          });

          continue;
        }

        if (zoneEntry.areaCount === 0) {
          errors.push({
            row: row.rowNumber,
            field: "zone",
            message:
              "The selected zone has no areas configured, so an audit cannot be scheduled for it.",
          });

          continue;
        }

        if (
          seenZoneIds.has(zoneEntry.zoneId)
        ) {
          errors.push({
            row: row.rowNumber,
            field: "zone",
            message: `Zone ${row.zone} appears more than once (also row ${seenZoneIds.get(zoneEntry.zoneId)}).`,
          });

          continue;
        }

        const auditor = usersByEmail.get(
          row.auditorEmail,
        );

        const auditee = usersByEmail.get(
          row.auditeeEmail,
        );

        let rowValid = true;

        if (!auditor) {
          errors.push({
            row: row.rowNumber,
            field: "auditorEmail",
            message: `No active user at ${location.name} has the email ${row.auditorEmail}.`,
          });

          rowValid = false;
        }

        if (!auditee) {
          errors.push({
            row: row.rowNumber,
            field: "auditeeEmail",
            message: `No active user at ${location.name} has the email ${row.auditeeEmail}.`,
          });

          rowValid = false;
        }

        if (
          auditor &&
          auditee &&
          auditor.id === auditee.id
        ) {
          errors.push({
            row: row.rowNumber,
            field: "auditeeEmail",
            message:
              "The auditor and auditee must be different users.",
          });

          rowValid = false;
        }

        if (!rowValid) {
          continue;
        }

        seenZoneIds.set(
          zoneEntry.zoneId,
          row.rowNumber,
        );

        resolvedRows.push({
          unitId: zoneEntry.unitId,
          zoneId: zoneEntry.zoneId,
          auditorId: auditor.id,
          auditeeId: auditee.id,
        });
      }

      if (errors.length > 0) {
        throw new AppError(
          `The roster file could not be read. ${errors.length} row${
            errors.length === 1 ? "" : "s"
          } need fixing.`,
          400,
          "ROSTER_INVALID",
          errors.slice(
            0,
            MAX_ROSTER_ROW_ERRORS,
          ),
        );
      }

      const mondays = listMondays(
        firstMonday,
        lastDate,
      );

      const zoneIds = resolvedRows.map(
        (row) => row.zoneId,
      );

      /*
       * No person-level conflict scan: one auditor or auditee may cover
       * several zones on the same Monday. A zone that already has a
       * patrol for a given Monday is skipped by generateRosterPatrols'
       * own NOT EXISTS check, so a hand-planned audit keeps its place.
       */
      const patrolsReplaced =
        await patrolRepository
          .deleteUpcomingRosterPatrols(
            {
              plantId: location.id,
              fromDate: firstMonday,
            },
            client,
          );

      await patrolRepository
        .deleteRosterRowsNotIn(
          {
            plantId: location.id,
            zoneIds,
          },
          client,
        );

      for (const row of resolvedRows) {
        await patrolRepository
          .upsertRosterRow(
            {
              plantId: location.id,
              unitId: row.unitId,
              zoneId: row.zoneId,
              auditorId: row.auditorId,
              auditeeId: row.auditeeId,
              effectiveFrom: firstMonday,
              effectiveTo: lastDate,
              uploadedBy: userId,
              sourceFileName:
                file.originalname ?? null,
            },
            client,
          );
      }

      const patrolsCreated =
        await patrolRepository
          .generateRosterPatrols(
            {
              plantId: location.id,
              plantName: location.name,
              firstMonday,
              lastDate,
              ehsOfficerId: userId,
            },
            client,
          );

      return {
        zones: resolvedRows.length,
        mondays: mondays.length,
        firstMonday,
        lastDate,
        patrolsCreated,
        patrolsReplaced,
      };
    },
  );

  const { roster } = await getRoster({
    userId,
  });

  return {
    message: `Roster uploaded. ${summary.zones} zone${
      summary.zones === 1 ? "" : "s"
    } scheduled for ${summary.mondays} Monday${
      summary.mondays === 1 ? "" : "s"
    } from ${summary.firstMonday} to ${summary.lastDate}.`,

    roster,
    summary,
  };
}
