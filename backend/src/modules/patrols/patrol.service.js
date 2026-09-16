import {
  withTransaction,
} from "../../config/database.js";

import AppError
  from "../../shared/errors/AppError.js";

import * as patrolRepository
  from "./patrol.repository.js";

// Get the current date
function getCurrentLocalDate() {
  const date = new Date();

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1,
    ).padStart(2, "0");

  const day =
    String(
      date.getDate(),
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// Validate if the scheduled inspection date is not in the past
function validateScheduledDate(
  scheduledDate,
) {
  if (!scheduledDate) {
    throw new AppError(
      "Scheduled date is required.",
      400,
      "SCHEDULED_DATE_REQUIRED",
    );
  }

  const parsedDate =
    new Date(
      `${scheduledDate}T00:00:00`,
    );

  if (
    Number.isNaN(
      parsedDate.getTime(),
    )
  ) {
    throw new AppError(
      "Select a valid scheduled date.",
      400,
      "INVALID_SCHEDULED_DATE",
    );
  }

  if (
    scheduledDate <
    getCurrentLocalDate()
  ) {
    throw new AppError(
      "An audit cannot be scheduled in the past.",
      400,
      "AUDIT_DATE_IN_PAST",
    );
  }
}

// Validate the required values
function validateRequiredValue({
  value,
  message,
  code,
}) {
  if (!String(value ?? "").trim()) {
    throw new AppError(
      message,
      400,
      code,
    );
  }
}

// Find the location, unit, zone, area details, auditors and auditees
// from the Postgres database for planning
export async function getPlanningLookups() {
  const [
    locations,
    units,
    zones,
    areaDetails,
    auditors,
    auditees,
  ] = await Promise.all([
    patrolRepository
      .findActivePlanningLocations(),

    patrolRepository
      .findActivePlanningUnits(),

    patrolRepository
      .findActivePlanningZones(),

    patrolRepository
      .findActivePlanningAreaDetails(),

    patrolRepository
      .findActiveUsersByRole(
        "AUDITOR",
      ),

    patrolRepository
      .findActiveUsersByRole(
        "AUDITEE",
      ),
  ]);

  return {
    locations,
    units,
    zones,
    areaDetails,
    auditors,
    auditees,
  };
}

// Schedule a patrol //
// Validates all the attributes first if they are empty //
// Validate if all the selected attributes exist for the heirarchy //
// Assign the values and create inspection //
export async function schedulePatrol({
  userId,
  location,
  unit,
  zone,
  areaDetail,
  scheduledDate,
  auditorId,
  auditeeId,
}) {
  const normalizedLocation =
    String(location ?? "").trim();

  const normalizedUnit =
    String(unit ?? "").trim();

  const normalizedZone =
    String(zone ?? "").trim();

  const normalizedAreaDetail =
    String(areaDetail ?? "").trim();

  const normalizedDate =
    String(scheduledDate ?? "")
      .trim()
      .slice(0, 10);

  const normalizedAuditorId =
    Number(auditorId);

  const normalizedAuditeeId =
    Number(auditeeId);

  const normalizedUserId =
    Number(userId);

  validateRequiredValue({
    value:
      normalizedLocation,

    message:
      "Location is required.",

    code:
      "INSPECTION_LOCATION_REQUIRED",
  });

  validateRequiredValue({
    value:
      normalizedUnit,

    message:
      "Unit is required.",

    code:
      "INSPECTION_UNIT_REQUIRED",
  });

  validateRequiredValue({
    value:
      normalizedZone,

    message:
      "Zone is required.",

    code:
      "INSPECTION_ZONE_REQUIRED",
  });

  validateRequiredValue({
    value:
      normalizedAreaDetail,

    message:
      "Area detail is required.",

    code:
      "INSPECTION_AREA_REQUIRED",
  });

  validateScheduledDate(
    normalizedDate,
  );

  if (
    !Number.isInteger(
      normalizedAuditorId,
    ) ||
    normalizedAuditorId < 1
  ) {
    throw new AppError(
      "Select a valid auditor.",
      400,
      "INVALID_AUDITOR_ID",
    );
  }

  if (
    !Number.isInteger(
      normalizedAuditeeId,
    ) ||
    normalizedAuditeeId < 1
  ) {
    throw new AppError(
      "Select a valid auditee.",
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

  const patrol =
    await withTransaction(
      async (client) => {
        /*
         * Confirm that the authenticated user remains an
         * active EHS Officer.
         */
        const ehsOfficer =
          await patrolRepository
            .findActiveUserWithRole(
              {
                userId:
                  normalizedUserId,

                roleCode:
                  "EHS_OFFICER",
              },
              client,
            );

        if (!ehsOfficer) {
          throw new AppError(
            "Only an active EHS Officer can schedule an audit.",
            403,
            "EHS_OFFICER_REQUIRED",
          );
        }

        /*
         * Validate the selected auditor against registered
         * active users and role assignments.
         */
        const auditor =
          await patrolRepository
            .findActiveUserWithRole(
              {
                userId:
                  normalizedAuditorId,

                roleCode:
                  "AUDITOR",
              },
              client,
            );

        if (!auditor) {
          throw new AppError(
            "The selected auditor is not an active registered Auditor.",
            400,
            "INVALID_AUDITOR",
          );
        }

        /*
         * Validate the selected auditee against registered
         * active users and role assignments.
         */
        const auditee =
          await patrolRepository
            .findActiveUserWithRole(
              {
                userId:
                  normalizedAuditeeId,

                roleCode:
                  "AUDITEE",
              },
              client,
            );

        if (!auditee) {
          throw new AppError(
            "The selected auditee is not an active registered Auditee.",
            400,
            "INVALID_AUDITEE",
          );
        }

        /*
         * Validate the submitted location against the
         * active plants stored in PostgreSQL.
         */
        const plantRecord =
          await patrolRepository
            .findActivePlanningPlant(
              normalizedLocation,
              client,
            );

        if (!plantRecord) {
          throw new AppError(
            "The selected location is not available for audit planning.",
            400,
            "INSPECTION_LOCATION_NOT_FOUND",
          );
        }

        /*
         * Validate that the selected unit belongs to the
         * selected canonical plant.
         */
        const unitRecord =
          await patrolRepository
            .findActiveUnitForPlant(
              {
                plantId:
                  plantRecord.id,

                unitNumber:
                  normalizedUnit,
              },
              client,
            );

        if (!unitRecord) {
          throw new AppError(
            "The selected unit does not exist for the selected location.",
            400,
            "UNIT_NOT_FOUND_FOR_LOCATION",
          );
        }

        /*
         * Validate that the selected zone belongs to the
         * selected unit.
         */
        const zoneRecord =
          await patrolRepository
            .findActiveZoneForUnit(
              {
                unitId:
                  unitRecord.id,

                zoneNumber:
                  normalizedZone,
              },
              client,
            );

        if (!zoneRecord) {
          throw new AppError(
            "The selected zone does not exist for the selected unit.",
            400,
            "ZONE_NOT_FOUND_FOR_UNIT",
          );
        }

        /*
         * Validate the area detail against the database
         * configuration for the selected zone.
         */
        const areaDetailRecord =
          await patrolRepository
            .findActiveAreaDetail(
              {
                areaDetail:
                  normalizedAreaDetail,

                zoneId:
                  zoneRecord.id,
              },
              client,
            );

        if (!areaDetailRecord) {
          throw new AppError(
            "The selected area detail is not available for the selected zone.",
            400,
            "AREA_DETAIL_NOT_FOUND_FOR_ZONE",
          );
        }

        /*
         * Prevent role-specific scheduling conflicts.
         */
        const conflict =
          await patrolRepository
            .findSchedulingConflict(
              {
                scheduledDate:
                  normalizedDate,

                auditorId:
                  normalizedAuditorId,

                auditeeId:
                  normalizedAuditeeId,
              },
              client,
            );

        if (conflict) {
          if (
            conflict.conflict_type ===
            "AUDITOR_ALREADY_ASSIGNED"
          ) {
            throw new AppError(
              "The selected auditor already has an audit scheduled for this date.",
              409,
              "AUDITOR_SCHEDULING_CONFLICT",
            );
          }

          if (
            conflict.conflict_type ===
            "AUDITEE_ALREADY_ASSIGNED"
          ) {
            throw new AppError(
              "The selected auditee already has an audit scheduled for this date.",
              409,
              "AUDITEE_SCHEDULING_CONFLICT",
            );
          }

          throw new AppError(
            "The selected users already have an audit scheduled for this date.",
            409,
            "AUDIT_SCHEDULING_CONFLICT",
          );
        }

        const createdPatrol =
          await patrolRepository
            .createPatrol(
              {
                location:
                  plantRecord.name,

                unitId:
                  unitRecord.id,

                zoneId:
                  zoneRecord.id,

                areaDetail:
                  areaDetailRecord
                    .area_detail,

                scheduledDate:
                  normalizedDate,

                auditorId:
                  normalizedAuditorId,

                auditeeId:
                  normalizedAuditeeId,

                ehsOfficerId:
                  normalizedUserId,
              },
              client,
            );

        if (!createdPatrol) {
          throw new AppError(
            "The audit could not be scheduled.",
            500,
            "AUDIT_SCHEDULING_FAILED",
          );
        }

        const completePatrol =
          await patrolRepository
            .findPatrolById(
              createdPatrol.id,
              client,
            );

        if (!completePatrol) {
          throw new AppError(
            "The scheduled audit could not be retrieved.",
            500,
            "SCHEDULED_AUDIT_NOT_FOUND",
          );
        }

        return completePatrol;
      },
    );

  return {
    message:
      "Audit scheduled successfully.",

    patrol,
  };
}