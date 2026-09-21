import { useState } from "react";

import Alert from "../../components/Alert.jsx";

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

/**
 * One zone within a unit's weekly plan: its assignment, its status, an
 * inline auditor/auditee edit, and (once an observation report exists)
 * an expandable "current progress" view.
 */
export default function ZoneAssignmentRow({
  zone,
  users,
  onSaveAssignment,
}) {
  const [editing, setEditing] = useState(false);
  const [detailOpen, setDetailOpen] =
    useState(false);

  const [auditorId, setAuditorId] = useState(
    zone.auditorId,
  );
  const [auditeeId, setAuditeeId] = useState(
    zone.auditeeId,
  );

  const [
    applyToUpcoming,
    setApplyToUpcoming,
  ] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] =
    useState("");

  function startEditing(event) {
    event.stopPropagation();
    setAuditorId(zone.auditorId);
    setAuditeeId(zone.auditeeId);
    setApplyToUpcoming(true);
    setError("");
    setSuccessMessage("");
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
    setSuccessMessage("");

    const result = await onSaveAssignment({
      patrolId: zone.patrolId,
      auditorId,
      auditeeId,
      applyToUpcoming,
    });

    setSaving(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    setSuccessMessage(
      result?.message ?? "",
    );
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
                {users.map((candidate) => (
                  <option
                    key={candidate.id}
                    value={candidate.id}
                  >
                    {candidate.fullName}
                  </option>
                ))}
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
                {users.map((candidate) => (
                  <option
                    key={candidate.id}
                    value={candidate.id}
                  >
                    {candidate.fullName}
                  </option>
                ))}
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
                disabled={saving}
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
          ) : zone.canEditAssignment ? (
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
        <label
          className="zone-assignment-scope"
          onClick={(event) =>
            event.stopPropagation()
          }
        >
          <input
            type="checkbox"
            checked={applyToUpcoming}
            disabled={saving}
            onChange={(event) =>
              setApplyToUpcoming(
                event.target.checked,
              )
            }
          />
          Apply to every upcoming Monday
          for this zone until 31 December
        </label>
      ) : null}

      {error ? (
        <Alert type="error">{error}</Alert>
      ) : null}

      {successMessage ? (
        <Alert type="success">
          {successMessage}
        </Alert>
      ) : null}

      {detailOpen ? (
        zone.observationReportId ? (
          <ZoneProgressDetail
            closureId={zone.closureId}
          />
        ) : (
          <p className="closure-empty-note">
            No observation report has been
            filed for this audit yet.
          </p>
        )
      ) : null}
    </li>
  );
}
