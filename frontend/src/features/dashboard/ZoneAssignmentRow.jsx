import {
  useId,
  useState,
} from "react";

import Alert from "../../components/Alert.jsx";

import {
  useAuthenticatedUser,
} from "../../app/authProvider.jsx";

import { formatDate } from "../../lib/errorMessage.js";

import ZoneProgressDetail from "./ZoneProgressDetail.jsx";

const STATUS_CLASS_BY_CODE = {
  OPEN: "weekly-status-open",
  WITH_AUDITEE: "weekly-status-with-auditee",
  ACTION_PLAN_IN_PROGRESS:
    "weekly-status-in-progress",
  EHS_OFFICER_ACTION_REQUIRED:
    "weekly-status-action-required",
  CLOSED: "weekly-status-closed",
  CLOSED_NO_OBSERVATIONS:
    "weekly-status-closed",
};

/*
 * What a save changes, passed to OfficerWeekCard's save: ZONE
 * reassigns every audit of the zone that can still be reassigned from
 * this week on, AUDIT swaps the people on this one audit only.
 */
const SCOPE_ZONE = "ZONE";
const SCOPE_AUDIT = "AUDIT";

function formatAuditCount(count) {
  return count === 1
    ? "1 audit"
    : `${count} audits`;
}

/**
 * The options for one select: every active user at the location, plus
 * the person on the audit now when they are not among them
 * (deactivated, or moved to another location). Without that option the
 * select would silently show somebody else as the current choice.
 */
function getCandidates(
  users,
  currentId,
  currentName,
) {
  const listed = users.some(
    (candidate) =>
      String(candidate.id) ===
      String(currentId),
  );

  if (
    listed ||
    currentId === null ||
    currentId === undefined
  ) {
    return users;
  }

  return [
    {
      id: currentId,
      fullName: currentName,
    },
    ...users,
  ];
}

function getCandidateLabel(
  candidate,
  signedInUserId,
) {
  const name =
    candidate.fullName ??
    candidate.username ??
    `User ${candidate.id}`;

  return String(candidate.id) ===
    String(signedInUserId)
    ? `${name} (you)`
    : name;
}

/**
 * What opens under a row: nothing filed yet, an audit closed with no
 * observations (which has no closure to load), or the closure's
 * progress.
 */
function ZoneDetail({ zone }) {
  if (!zone.observationReportId) {
    return (
      <p className="closure-empty-note">
        No observation report has been
        filed for this audit yet.
      </p>
    );
  }

  if (!zone.closureId) {
    return (
      <p className="closure-empty-note">
        This audit was closed with no
        observations to record, so there
        is no action plan to follow.
      </p>
    );
  }

  return (
    <ZoneProgressDetail
      closureId={zone.closureId}
    />
  );
}

/**
 * One zone within a unit's weekly plan: its assignment, its status, an
 * inline auditor/auditee edit, and an expandable "current progress"
 * view.
 *
 * The edit either reassigns the zone from this week to 31 December or
 * swaps the people on this one audit. The zone option stays available
 * after this week's audit has been filed, so a filed audit never
 * blocks changing the zone's future.
 */
export default function ZoneAssignmentRow({
  zone,
  users,
  zoneEditFromDate,
  zoneEditToDate,
  onSaveAssignment,
}) {
  const { user } =
    useAuthenticatedUser();

  const scopeLabelId = useId();

  const [editing, setEditing] = useState(false);
  const [detailOpen, setDetailOpen] =
    useState(false);

  const [auditorId, setAuditorId] = useState(
    zone.auditorId,
  );
  const [auditeeId, setAuditeeId] = useState(
    zone.auditeeId,
  );

  const [scope, setScope] = useState(
    SCOPE_ZONE,
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canEdit =
    zone.canEditAssignment ||
    zone.canEditZone;

  const usersLoaded = users.length > 0;

  const auditorCandidates = getCandidates(
    users,
    zone.auditorId,
    zone.auditorName,
  );

  const auditeeCandidates = getCandidates(
    users,
    zone.auditeeId,
    zone.auditeeName,
  );

  function startEditing(event) {
    event.stopPropagation();
    setAuditorId(zone.auditorId);
    setAuditeeId(zone.auditeeId);
    setScope(
      zone.canEditZone
        ? SCOPE_ZONE
        : SCOPE_AUDIT,
    );
    setError("");
    setEditing(true);
  }

  function cancelEditing(event) {
    event.stopPropagation();
    setEditing(false);
    setError("");
  }

  async function saveAssignment(event) {
    event.stopPropagation();

    if (
      String(auditorId) === String(auditeeId)
    ) {
      setError(
        "The auditor and auditee must be different users.",
      );

      return;
    }

    setSaving(true);
    setError("");

    const result = await onSaveAssignment({
      scope,
      patrolId: zone.patrolId,
      zoneId: zone.zoneId,
      auditorId,
      auditeeId,
    });

    setSaving(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    setEditing(false);
  }

  function toggleDetail() {
    if (editing) {
      return;
    }

    setDetailOpen((current) => !current);
  }

  return (
    <li className="zone-assignment-row-wrapper">
      <div
        className="weekly-list-row zone-assignment-row"
        role="button"
        tabIndex={0}
        onClick={toggleDetail}
        onKeyDown={(event) => {
          /*
           * Keys pressed on the selects and buttons inside the row
           * bubble up here too. Taking them over would stop Enter and
           * Space from working on Edit, Save, Cancel and the selects.
           */
          if (
            event.target !==
            event.currentTarget
          ) {
            return;
          }

          if (
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();
            toggleDetail();
          }
        }}
      >
        <span
          data-label="Zone"
          className="weekly-zone-name"
        >
          {zone.zoneName}
        </span>

        <span data-label="Date">
          {formatDate(zone.scheduledDate)}
        </span>

        {editing ? (
          <>
            <span
              data-label="Auditor"
              onClick={(event) =>
                event.stopPropagation()
              }
            >
              <select
                value={auditorId ?? ""}
                disabled={saving}
                onChange={(event) =>
                  setAuditorId(
                    event.target.value,
                  )
                }
              >
                {auditorCandidates.map(
                  (candidate) => (
                    <option
                      key={candidate.id}
                      value={candidate.id}
                    >
                      {getCandidateLabel(
                        candidate,
                        user?.id,
                      )}
                    </option>
                  ),
                )}
              </select>
            </span>

            <span
              data-label="Auditee"
              onClick={(event) =>
                event.stopPropagation()
              }
            >
              <select
                value={auditeeId ?? ""}
                disabled={saving}
                onChange={(event) =>
                  setAuditeeId(
                    event.target.value,
                  )
                }
              >
                {auditeeCandidates.map(
                  (candidate) => (
                    <option
                      key={candidate.id}
                      value={candidate.id}
                    >
                      {getCandidateLabel(
                        candidate,
                        user?.id,
                      )}
                    </option>
                  ),
                )}
              </select>
            </span>
          </>
        ) : (
          <>
            <span data-label="Auditor">
              {zone.auditorName}
            </span>

            <span data-label="Auditee">
              {zone.auditeeName}
            </span>
          </>
        )}

        <span data-label="Status">
          <span
            className={`weekly-status ${
              STATUS_CLASS_BY_CODE[
                zone.status
              ] ?? ""
            }`}
          >
            {zone.displayStatus}
          </span>
        </span>

        <span
          data-label=""
          className="zone-assignment-actions"
          onClick={(event) =>
            event.stopPropagation()
          }
        >
          {editing ? (
            <>
              <button
                type="button"
                className="button button-primary"
                disabled={
                  saving || !usersLoaded
                }
                onClick={saveAssignment}
              >
                {saving ? "Saving..." : "Save"}
              </button>

              <button
                type="button"
                className="button button-secondary"
                disabled={saving}
                onClick={cancelEditing}
              >
                Cancel
              </button>
            </>
          ) : canEdit ? (
            <button
              type="button"
              className="button button-secondary"
              onClick={startEditing}
            >
              Edit
            </button>
          ) : null}
        </span>
      </div>

      {editing ? (
        <div
          className="zone-assignment-scope zone-assignment-scope-group"
          role="radiogroup"
          aria-labelledby={scopeLabelId}
          onClick={(event) =>
            event.stopPropagation()
          }
        >
          <span
            id={scopeLabelId}
            className="zone-assignment-scope-title"
          >
            Apply the new auditor and
            auditee to
          </span>

          <label
            className="zone-assignment-scope-option"
            aria-disabled={!zone.canEditZone}
          >
            <input
              type="radio"
              name={`${scopeLabelId}-scope`}
              value={SCOPE_ZONE}
              checked={scope === SCOPE_ZONE}
              disabled={
                saving || !zone.canEditZone
              }
              onChange={() =>
                setScope(SCOPE_ZONE)
              }
            />
            {`Every audit of this zone from ${formatDate(
              zoneEditFromDate,
            )} to ${formatDate(
              zoneEditToDate,
            )} (${formatAuditCount(
              zone.reassignableCount ?? 0,
            )})`}
          </label>

          <label
            className="zone-assignment-scope-option"
            aria-disabled={
              !zone.canEditAssignment
            }
          >
            <input
              type="radio"
              name={`${scopeLabelId}-scope`}
              value={SCOPE_AUDIT}
              checked={scope === SCOPE_AUDIT}
              disabled={
                saving ||
                !zone.canEditAssignment
              }
              onChange={() =>
                setScope(SCOPE_AUDIT)
              }
            />
            {`Only this audit on ${formatDate(
              zone.scheduledDate,
            )}`}
          </label>

          {!zone.canEditAssignment ? (
            <p className="zone-assignment-scope-note">
              {`The audit on ${formatDate(
                zone.scheduledDate,
              )} is already under way, so it keeps its auditor and auditee.`}
            </p>
          ) : null}

          {!usersLoaded ? (
            <p className="zone-assignment-scope-note">
              Assignments cannot be changed
              until the user list loads.
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <Alert type="error">{error}</Alert>
      ) : null}

      {detailOpen ? (
        <ZoneDetail zone={zone} />
      ) : null}
    </li>
  );
}
