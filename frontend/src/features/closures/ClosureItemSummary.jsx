import { formatDate } from "../../lib/errorMessage.js";

import ClosureEvidencePanel from "./ClosureEvidencePanel.jsx";

function Field({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || "Not recorded"}</strong>
    </div>
  );
}

/**
 * Read-only view of one observation's action plan and the evidence
 * attached to it. Used by the EHS Officer's approval panel
 * and the officer's zone progress view, which both show the closure
 * without editing it.
 */
export default function ClosureItemSummary({
  closureId,
  item,
  total,
}) {
  return (
    <section className="closure-item-card">
      <header className="observation-section-header">
        <div>
          <h3>
            Observation {item.sequenceNumber}
            {total ? ` of ${total}` : ""}
          </h3>

          <p>
            {[
              item.observation?.areaName,
              item.observation?.category,
              item.observation?.riskCategory
                ? `${item.observation.riskCategory} risk`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        <span className="closure-status-chip">
          {item.actionPlan
            ? "Action plan saved"
            : "No action plan"}
        </span>
      </header>

      <div className="closure-detail-grid">
        <Field
          label="Target date"
          value={formatDate(item.targetDate)}
        />
        <Field
          label="Plan saved"
          value={formatDate(
            item.actionPlanSavedAt,
          )}
        />
        <Field
          label="Evidence"
          value={
            item.evidenceCount
              ? `${item.evidenceCount} photograph${
                  item.evidenceCount === 1
                    ? ""
                    : "s"
                }`
              : "None attached"
          }
        />
      </div>

      <div className="observation-detail-body">
        <span>What was observed</span>
        <p>
          {item.observation?.description ??
            "Not recorded"}
        </p>
      </div>

      <div className="observation-detail-body">
        <span>Action plan</span>
        <p>
          {item.actionPlan ??
            "Not yet submitted."}
        </p>
      </div>

      {/*
        * Read-only here: this is the officer's view of what the
        * auditee attached, not a place to change it.
        */}
      <ClosureEvidencePanel
        closureId={closureId}
        item={item}
        editable={false}
      />
    </section>
  );
}
