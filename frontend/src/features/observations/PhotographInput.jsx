import {
  useRef,
} from "react";

export default function PhotographInput({
  photograph,
  photographPreview,
  disabled = false,
  onChange,
  onRemove,
}) {
  const inputRef = useRef(null);

  function openFilePicker() {
    if (disabled) {
      return;
    }

    inputRef.current?.click();
  }

  function handleFileChange(event) {
    const selectedFile =
      event.target.files?.[0] ?? null;

    if (
      selectedFile &&
      typeof onChange === "function"
    ) {
      onChange(selectedFile);
    }

    /*
     * Allows the same file to be selected again
     * after replacing or removing it.
     */
    event.target.value = "";
  }

  function handleRemove() {
    if (
      disabled ||
      typeof onRemove !== "function"
    ) {
      return;
    }

    onRemove();
  }

  const photographName =
    photograph?.name ??
    "Observation photograph preview";

  const photographSize =
    photograph
      ? (
          photograph.size /
          (1024 * 1024)
        ).toFixed(2)
      : null;

  return (
    <div className="observation-form-field">
      <label htmlFor="observation-photograph">
        Observation photograph

        <span
          className="required-marker"
          aria-hidden="true"
        >
          {" "}*
        </span>
      </label>

      {photographPreview ? (
        <div className="observation-photo-preview">
          {photographPreview}

          <div className="observation-photo-actions">
            <button
              type="button"
              onClick={openFilePicker}
              disabled={disabled}
            >
              Replace
            </button>

            <button
              type="button"
              className="observation-photo-remove"
              onClick={handleRemove}
              disabled={disabled}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="observation-photo-upload"
          onClick={openFilePicker}
          disabled={disabled}
        >
          <span
            className="observation-upload-icon"
            aria-hidden="true"
          >
            +
          </span>

          <span>
            <strong>
              Add observation photograph
            </strong>

            <small>
              JPG, JPEG, PNG, or SVG.
              Maximum size 10 MB.
            </small>
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        id="observation-photograph"
        className="visually-hidden"
        type="file"
        accept=".jpg,.jpeg,.png,.svg,image/jpeg,image/png,image/svg+xml"
        onChange={handleFileChange}
        disabled={disabled}
      />

      {photograph && (
        <div className="observation-file-details">
          <span className="observation-file-name">
            Selected: {photographName}
          </span>

          <span className="observation-file-size">
            {photographSize} MB
          </span>
        </div>
      )}
    </div>
  );
}