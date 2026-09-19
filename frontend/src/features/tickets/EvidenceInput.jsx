import {
  useRef,
} from "react";

/**
 * Up to 3 evidence photographs: files already selected but not yet
 * uploaded, shown as local previews, plus a picker constrained by how
 * many slots remain.
 */
export default function EvidenceInput({
  selectedFiles,
  remainingSlots,
  disabled = false,
  onAddFiles,
  onRemoveSelected,
}) {
  const inputRef = useRef(null);

  function openFilePicker() {
    if (disabled || remainingSlots === 0) {
      return;
    }

    inputRef.current?.click();
  }

  function handleFileChange(event) {
    const files = event.target.files;

    if (files?.length) {
      onAddFiles(files);
    }

    /*
     * Allows the same file to be selected again after removing it.
     */
    event.target.value = "";
  }

  return (
    <div className="observation-form-field">
      <label htmlFor="ticket-evidence">
        Evidence photographs
      </label>

      <small>
        JPG, JPEG, PNG, or SVG. Maximum 10 MB
        each, up to 3 total.{" "}
        {remainingSlots > 0
          ? `${remainingSlots} slot${
              remainingSlots === 1 ? "" : "s"
            } left.`
          : "No slots left."}
      </small>

      {selectedFiles.length > 0 ? (
        <ul className="observation-file-details">
          {selectedFiles.map(
            (file, index) => (
              <li key={`${file.name}-${index}`}>
                <span className="observation-file-name">
                  {file.name}
                </span>

                <span className="observation-file-size">
                  {(
                    file.size /
                    (1024 * 1024)
                  ).toFixed(2)}{" "}
                  MB
                </span>

                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onRemoveSelected(index)
                  }
                >
                  Remove
                </button>
              </li>
            ),
          )}
        </ul>
      ) : null}

      <button
        type="button"
        className="observation-photo-upload"
        onClick={openFilePicker}
        disabled={
          disabled || remainingSlots === 0
        }
      >
        <span
          className="observation-upload-icon"
          aria-hidden="true"
        >
          +
        </span>

        <span>
          <strong>Add evidence photograph</strong>
        </span>
      </button>

      <input
        ref={inputRef}
        id="ticket-evidence"
        className="visually-hidden"
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.svg,image/jpeg,image/png,image/svg+xml"
        onChange={handleFileChange}
        disabled={disabled}
      />
    </div>
  );
}
