import { useRef } from "react";

import Alert from "../../components/Alert.jsx";

import RosterTable from "./RosterTable.jsx";

/**
 * The Plan page's one-time roster upload: pick a .csv/.xlsx file,
 * upload it, see row-level problems or a success summary, and see the
 * roster it produced.
 */
export default function RosterUploadPanel({
  roster,
  loading,
  uploading,
  selectedFile,
  error,
  rowErrors,
  summary,
  onSelectFile,
  onUpload,
  onDownloadTemplate,
}) {
  const fileInputRef = useRef(null);

  function handleFileChange(event) {
    onSelectFile(
      event.target.files?.[0] ?? null,
    );
  }

  async function handleUploadClick() {
    if ((roster?.rows ?? []).length > 0) {
      const confirmed = window.confirm(
        "This replaces the current roster and every upcoming Monday audit generated from it. Continue?",
      );

      if (!confirmed) {
        return;
      }
    }

    const result = await onUpload();

    if (result && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <section className="roster-panel">
      <header className="observation-section-header">
        <div>
          <span className="dashboard-eyebrow">
            Weekly roster
          </span>

          <h2>
            Upload the roles and
            responsibilities sheet
          </h2>

          <p>
            Upload it once. Every zone in
            the file is scheduled for
            every Monday from today
            through 31 December. Columns:
            Location, Unit, Zone, Auditor
            (email), Auditee (email).
          </p>
        </div>
      </header>

      <div className="roster-controls">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx"
          onChange={handleFileChange}
          disabled={uploading}
        />

        <button
          type="button"
          className="button button-primary"
          onClick={handleUploadClick}
          disabled={
            !selectedFile || uploading
          }
        >
          {uploading
            ? "Uploading..."
            : "Upload roster"}
        </button>

        <button
          type="button"
          className="button button-secondary"
          onClick={onDownloadTemplate}
        >
          Download template
        </button>
      </div>

      {error ? (
        <Alert
          type="error"
          title="Unable to upload the roster"
        >
          {error}
        </Alert>
      ) : null}

      {rowErrors.length > 0 ? (
        <div className="roster-error-table">
          <div className="weekly-list-header">
            <span>Row</span>
            <span>Field</span>
            <span>Problem</span>
          </div>

          {rowErrors.map(
            (rowError, index) => (
              <div
                className="weekly-list-row"
                key={`${rowError.row}-${rowError.field}-${index}`}
              >
                <span data-label="Row">
                  {rowError.row ?? "-"}
                </span>

                <span data-label="Field">
                  {rowError.field ?? "-"}
                </span>

                <span data-label="Problem">
                  {rowError.message}
                </span>
              </div>
            ),
          )}
        </div>
      ) : null}

      {summary ? (
        <>
          <Alert
            type="success"
            title="Roster uploaded"
          >
            {`${summary.zones} zone${
              summary.zones === 1 ? "" : "s"
            } scheduled for ${
              summary.mondays
            } Monday${
              summary.mondays === 1
                ? ""
                : "s"
            } from ${
              summary.firstMonday
            } to ${summary.lastDate}.`}
          </Alert>

          <div className="patrol-summary">
            <div>
              <span>Zones</span>
              <strong>
                {summary.zones}
              </strong>
            </div>

            <div>
              <span>Mondays</span>
              <strong>
                {summary.mondays}
              </strong>
            </div>

            <div>
              <span>First Monday</span>
              <strong>
                {summary.firstMonday}
              </strong>
            </div>

            <div>
              <span>Last date</span>
              <strong>
                {summary.lastDate}
              </strong>
            </div>

            <div>
              <span>Audits created</span>
              <strong>
                {summary.patrolsCreated}
              </strong>
            </div>

            <div>
              <span>Audits replaced</span>
              <strong>
                {summary.patrolsReplaced}
              </strong>
            </div>
          </div>
        </>
      ) : null}

      {!loading ? (
        <RosterTable roster={roster} />
      ) : null}
    </section>
  );
}
