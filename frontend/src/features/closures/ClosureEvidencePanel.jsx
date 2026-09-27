import { useRef } from "react";

import Alert from "../../components/Alert.jsx";

import { useClosureEvidence } from "./useClosures.js";

/**
 * The photographs the auditee attaches to one observation as evidence
 * that its action plan was carried out.
 *
 * Optional throughout: an observation can be closed on its plan alone.
 * The wording says "can attach" rather than "must", so nobody reads a
 * missing photograph as something owed.
 */
export default function ClosureEvidencePanel({
  closureId,
  item,
  editable,
  onChanged,
}) {
  const fileInputRef = useRef(null);

  const {
    evidence,
    previews,
    busy,
    error,
    maxFiles,
    remainingSlots,
    upload,
    remove,
  } = useClosureEvidence({
    closureId,
    item,
    onChanged,
  });

  async function handleFileChange(event) {
    await upload(event.target.files);

    /*
     * Cleared so that picking the same file again still fires a
     * change event.
     */
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  const canAdd =
    editable && remainingSlots > 0 && !busy;

  return (
    <div className="closure-evidence">
      <div className="closure-evidence-header">
        <span>Evidence of closure</span>

        <span className="closure-empty-note">
          {evidence.length} of {maxFiles}{" "}
          photographs
        </span>
      </div>

      {error ? (
        <Alert type="error">{error}</Alert>
      ) : null}

      {evidence.length > 0 ? (
        <ul className="closure-evidence-list">
          {evidence.map((entry) => (
            <li key={entry.id}>
              {previews[entry.id] ? (
                <img
                  src={previews[entry.id]}
                  alt={
                    entry.originalName ??
                    "Evidence photograph"
                  }
                />
              ) : (
                <span className="closure-evidence-loading">
                  Loading...
                </span>
              )}

              <div className="closure-evidence-meta">
                <span title={entry.originalName}>
                  {entry.originalName ??
                    "Photograph"}
                </span>

                {editable ? (
                  <button
                    type="button"
                    className="closure-evidence-remove"
                    disabled={busy}
                    onClick={() =>
                      remove(entry.id)
                    }
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="closure-empty-note">
          {editable
            ? "No photographs attached yet. You can attach up to three."
            : "No photographs were attached."}
        </p>
      )}

      {editable ? (
        <div className="closure-evidence-actions">
          <input
            ref={fileInputRef}
            id={`evidence-${item.id}`}
            type="file"
            accept="image/jpeg,image/png,image/svg+xml"
            multiple
            disabled={!canAdd}
            onChange={handleFileChange}
          />

          <label
            htmlFor={`evidence-${item.id}`}
            className="button button-secondary"
            aria-disabled={!canAdd}
          >
            {busy
              ? "Uploading..."
              : "Attach photographs"}
          </label>

          <span className="closure-empty-note">
            {remainingSlots === 0
              ? `All ${maxFiles} photographs attached.`
              : "JPG, PNG or SVG, up to 10 MB each. Optional."}
          </span>
        </div>
      ) : null}
    </div>
  );
}
