import { useState } from "react";

import Alert from "../../components/Alert.jsx";
import LoadingSpinner from "../../components/LoadingSpinner.jsx";

import ApprovalPanel from "./ApprovalPanel.jsx";
import ObservationSummary from "./ObservationSummary.jsx";

import { formatDate } from "../../lib/errorMessage.js";

import { useApprovalQueue } from "./useClosures.js";

/**
 * The EHS Officer's review queue: everything submitted and waiting.
 */
export default function ApprovalQueuePage() {
  const {
    closures,
    loading,
    error,
    busy,
    approve,
    reject,
  } = useApprovalQueue();

  const [selectedId, setSelectedId] =
    useState(null);

  const selected =
    closures.find(
      (closure) =>
        String(closure.id) ===
        String(selectedId),
    ) ?? null;

  if (loading) {
    return (
      <LoadingSpinner message="Loading closures awaiting your approval..." />
    );
  }

  return (
    <section className="closure-page">
      <header className="observation-section-header">
        <div>
          <span className="dashboard-eyebrow">
            EHS Officer workflow
          </span>

          <h1>Closure approvals</h1>
        </div>
      </header>

      {error ? (
        <Alert
          type="error"
          title="Unable to load the queue"
        >
          {error}
        </Alert>
      ) : null}

      <h2>
        Awaiting approval ({closures.length})
      </h2>

      {closures.length === 0 ? (
        <p className="closure-empty-note">
          Nothing is waiting for your approval.
        </p>
      ) : (
        <ul className="closure-list">
          {closures.map((closure) => (
            <li key={closure.id}>
              <button
                type="button"
                className={`closure-list-item${
                  String(closure.id) ===
                  String(selectedId)
                    ? " approval-queue-item-selected"
                    : ""
                }`}
                onClick={() =>
                  setSelectedId(closure.id)
                }
              >
                <span className="closure-list-main">
                  <strong>
                    {closure.reportNumber}
                  </strong>

                  <span>
                    {closure.auditeeName} ·{" "}
                    {[
                      closure.unitName,
                      closure.zoneName,
                      closure.areaName,
                    ]
                      .filter(Boolean)
                      .join(" / ")}
                  </span>
                </span>

                <span className="closure-list-meta">
                  <span>
                    Submitted{" "}
                    {formatDate(
                      closure.submittedForClosureAt,
                    )}
                  </span>

                  <span className="closure-status-chip">
                    {closure.displayStatus}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected ? (
        <>
          <ObservationSummary
            closure={selected}
            photograph=""
          />

          <ApprovalPanel
            closure={selected}
            busy={busy}
            onApprove={async (id, comments) => {
              await approve(id, comments);
              setSelectedId(null);
            }}
            onReject={async (id, comments) => {
              await reject(id, comments);
              setSelectedId(null);
            }}
          />
        </>
      ) : null}
    </section>
  );
}
