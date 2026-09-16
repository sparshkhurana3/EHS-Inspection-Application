import Alert
  from "../../components/Alert.jsx";

import LoadingSpinner
  from "../../components/LoadingSpinner.jsx";

import ActionPlanForm
  from "./ActionPlanForm.jsx";

import ApprovalPanel
  from "./ApprovalPanel.jsx";

import useClosures
  from "./useClosures.js";

function getDisplayValue(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "Not available";
  }

  return value;
}

function formatDate(dateValue) {
  if (!dateValue) {
    return "Not available";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return String(dateValue);
  }

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    },
  ).format(date);
}

function normalizeStatus(status) {
  return String(status ?? "")
    .trim()
    .toUpperCase();
}

function getClosureId(closure) {
  return (
    closure?.id ??
    closure?.closureId ??
    closure?.closure_id
  );
}

function getStatusDetails(closure) {
  const status =
    normalizeStatus(
      closure?.status,
    );

  switch (status) {
    case "APPROVED":
    case "CLOSED":
      return {
        label: "Closed",
        className:
          "observation-report-status-closed",
      };

    case "SUBMITTED_FOR_CLOSURE":
    case "PENDING_EHS_APPROVAL":
      return {
        label: "Pending EHS Approval",
        className:
          "observation-report-status-submitted",
      };

    case "REEXAMINATION_REQUIRED":
      return {
        label:
          "Re-examination Required",
        className:
          "observation-report-status-reexamination",
      };

    case "IN_PROGRESS":
      return {
        label: "In Progress",
        className:
          "observation-report-status-progress",
      };

    default:
      return {
        label: "Open",
        className:
          "observation-report-status-open",
      };
  }
}

function StaticField({
  label,
  value,
}) {
  return (
    <div className="closure-static-field">
      <span>{label}</span>

      <strong>
        {getDisplayValue(value)}
      </strong>
    </div>
  );
}

function ObservationPhotograph({
  closure,
  photographPreview,
  photographLoading,
  photographError,
}) {
  const photographName =
    closure?.photographOriginalName ??
    closure?.photograph_original_name ??
    "Observation photograph";

  if (photographLoading) {
    return (
      <div className="closure-photograph-loading">
        Loading observation photograph...
      </div>
    );
  }

  if (photographError) {
    return (
      <div className="closure-photograph-unavailable">
        {photographError}
      </div>
    );
  }

  if (!photographPreview) {
    return (
      <div className="closure-photograph-unavailable">
        Observation photograph is not
        available.
      </div>
    );
  }

  return (
    <div className="closure-observation-photograph">
      <span>
        Observation photograph
      </span>

      <img
        className="closure-observation-image"
        src={photographPreview}
        alt={photographName}
      />

      <small>{photographName}</small>
    </div>
  );
}

function PendingApprovalList({
  approvals,
  selectedApprovalId,
  onSelect,
}) {
  if (approvals.length === 0) {
    return (
      <section className="empty-dashboard-card">
        <strong>
          No closure approvals pending
        </strong>

        <p>
          No closure report is currently
          waiting for EHS Officer review.
        </p>
      </section>
    );
  }

  return (
    <section className="closure-approval-queue">
      <header className="approval-queue-header">
        <div>
          <span className="dashboard-eyebrow">
            Approval queue
          </span>

          <h2>
            Reports awaiting review
          </h2>
        </div>

        <span>
          {approvals.length} pending
        </span>
      </header>

      <div className="approval-queue-list">
        {approvals.map((approval) => {
          const closureId =
            getClosureId(approval);

          const selected =
            String(closureId) ===
            String(selectedApprovalId);

          const reportNumber =
            approval.reportNumber ??
            approval.report_number ??
            `Closure ${closureId}`;

          const auditeeName =
            approval.auditeeName ??
            approval.auditee_name ??
            "Not available";

          const submittedAt =
            approval
              .submittedForClosureAt ??
            approval
              .submitted_for_closure_at;

          return (
            <button
              key={closureId}
              type="button"
              className={[
                "approval-queue-item",
                selected
                  ? "approval-queue-item-selected"
                  : "",
              ].join(" ")}
              onClick={() => {
                onSelect(closureId);
              }}
            >
              <span>
                <strong>
                  {reportNumber}
                </strong>

                <small>
                  Auditee: {auditeeName}
                </small>
              </span>

              <span>
                <small>Submitted</small>

                <strong>
                  {formatDate(
                    submittedAt,
                  )}
                </strong>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function ClosurePage() {
  const {
    isEhsOfficer,
    closure,
    pendingApprovals,
    selectedApprovalId,
    formValues,
    photographPreview,
    photographLoading,
    photographError,
    actionPlanWordCount,
    maxActionPlanWords,
    loading,
    saving,
    submitting,
    approving,
    rejecting,
    error,
    successMessage,
    selectApproval,
    updateField,
    saveActionPlan,
    sendForClosure,
    approveClosure,
    rejectClosure,
    reload,
  } = useClosures();

  if (loading) {
    return (
      <main className="closure-page">
        <LoadingSpinner
          message={
            isEhsOfficer
              ? "Loading closure approval queue..."
              : "Loading closure assignment..."
          }
        />
      </main>
    );
  }

  const normalizedStatus =
    normalizeStatus(
      closure?.status,
    );

  const statusDetails =
    getStatusDetails(closure);

  const awaitingApproval = [
    "SUBMITTED_FOR_CLOSURE",
    "PENDING_EHS_APPROVAL",
  ].includes(normalizedStatus);

  const reportNumber =
    closure?.reportNumber ??
    closure?.report_number ??
    "Observation Report";

  const weekNumber =
    closure?.weekNumber ??
    closure?.week_number;

  const unitNumber =
    closure?.unitNumber ??
    closure?.unit_number ??
    closure?.unitName ??
    closure?.unit_name;

  const zoneNumber =
    closure?.zoneNumber ??
    closure?.zone_number ??
    closure?.zoneName ??
    closure?.zone_name;

  const scheduledDate =
    closure?.scheduledDate ??
    closure?.scheduled_date;

  const findingDate =
    closure?.findingDate ??
    closure?.finding_date;

  const plantLocation =
    closure?.plantLocation ??
    closure?.plant_location;

  const observationLocation =
    closure?.observationLocation ??
    closure?.observation_location ??
    closure?.areaDetail ??
    closure?.area_detail;

  const auditorName =
    closure?.auditorName ??
    closure?.auditor_name;

  const auditeeName =
    closure?.auditeeName ??
    closure?.auditee_name;

  const ehsOfficerName =
    closure?.ehsOfficerName ??
    closure?.ehs_officer_name;

  const riskCategory =
    closure?.riskCategory ??
    closure?.risk_category;

  const observationDescription =
    closure?.observationDescription ??
    closure?.observation_description ??
    closure?.description;

  return (
    <main className="closure-page">
      <header className="closure-page-header">
        <div>
          <span className="dashboard-eyebrow">
            {isEhsOfficer
              ? "EHS Officer workflow"
              : "Auditee workflow"}
          </span>

          <h1>
            {isEhsOfficer
              ? "Closure Approvals"
              : "Closure"}
          </h1>

          <p>
            {isEhsOfficer
              ? (
                "Review submitted corrective " +
                "action plans and either close " +
                "the audit or return the report " +
                "for re-examination."
              )
              : (
                "Review the auditor observation, " +
                "define the corrective action, " +
                "and submit the report for closure."
              )}
          </p>
        </div>

        <button
          type="button"
          className="dashboard-refresh-button"
          onClick={reload}
          disabled={
            saving ||
            submitting ||
            approving ||
            rejecting
          }
        >
          Refresh
        </button>
      </header>

      {error && (
        <Alert
          type="error"
          title="Unable to continue"
        >
          {error}
        </Alert>
      )}

      {successMessage && (
        <Alert
          type="success"
          title="Closure workflow updated"
        >
          {successMessage}
        </Alert>
      )}

      {isEhsOfficer && (
        <PendingApprovalList
          approvals={pendingApprovals}
          selectedApprovalId={
            selectedApprovalId
          }
          onSelect={selectApproval}
        />
      )}

      {!closure &&
        !error &&
        !isEhsOfficer && (
          <section className="empty-dashboard-card">
            <strong>
              No closure assignment found
            </strong>

            <p>
              No observation report is
              currently assigned to you for
              closure.
            </p>
          </section>
        )}

      {closure && (
        <>
          <section className="closure-observation-card">
            <header className="observation-section-header">
              <div>
                <span className="dashboard-eyebrow">
                  Auditor observation
                </span>

                <h2>{reportNumber}</h2>
              </div>

              <span
                className={[
                  "observation-report-status",
                  statusDetails.className,
                ].join(" ")}
                role="status"
              >
                {statusDetails.label}
              </span>
            </header>

            <div className="closure-static-grid">
              <StaticField
                label="Week number"
                value={weekNumber}
              />

              <StaticField
                label="Scheduled date"
                value={formatDate(
                  scheduledDate,
                )}
              />

              <StaticField
                label="Finding date"
                value={formatDate(
                  findingDate,
                )}
              />

              <StaticField
                label="Unit"
                value={unitNumber}
              />

              <StaticField
                label="Zone"
                value={zoneNumber}
              />

              <StaticField
                label="Plant location"
                value={plantLocation}
              />

              <StaticField
                label="Observation location"
                value={
                  observationLocation
                }
              />

              <StaticField
                label="Category"
                value={closure.category}
              />

              <StaticField
                label="Risk category"
                value={riskCategory}
              />

              <StaticField
                label="Auditor"
                value={auditorName}
              />

              <StaticField
                label="Auditee"
                value={auditeeName}
              />

              <StaticField
                label="EHS Officer"
                value={ehsOfficerName}
              />
            </div>

            <div className="closure-observation-description">
              <span>
                Observation description
              </span>

              <p>
                {getDisplayValue(
                  observationDescription,
                )}
              </p>
            </div>

            <ObservationPhotograph
              closure={closure}
              photographPreview={
                photographPreview
              }
              photographLoading={
                photographLoading
              }
              photographError={
                photographError
              }
            />
          </section>

          {!isEhsOfficer &&
            !awaitingApproval &&
            normalizedStatus !==
              "APPROVED" && (
              <section className="closure-action-card">
                <ActionPlanForm
                  closure={closure}
                  formValues={formValues}
                  actionPlanWordCount={
                    actionPlanWordCount
                  }
                  maxActionPlanWords={
                    maxActionPlanWords
                  }
                  saving={saving}
                  submitting={submitting}
                  onFieldChange={
                    updateField
                  }
                  onSave={saveActionPlan}
                  onSubmitForClosure={
                    sendForClosure
                  }
                />
              </section>
            )}

          <ApprovalPanel
            closure={closure}
            canReview={
              isEhsOfficer &&
              awaitingApproval
            }
            approving={approving}
            rejecting={rejecting}
            onApprove={approveClosure}
            onReject={rejectClosure}
          />
        </>
      )}
    </main>
  );
}