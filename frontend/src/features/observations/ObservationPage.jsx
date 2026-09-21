import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Alert from "../../components/Alert.jsx";
import LoadingSpinner from "../../components/LoadingSpinner.jsx";

import { formatDate } from "../../lib/errorMessage.js";

import ObservationCard from "./ObservationCard.jsx";
import ObservationDetail from "./ObservationDetail.jsx";
import ObservationHistory from "./ObservationHistory.jsx";

import {
  PendingObservationList,
  SubmittedObservationList,
} from "./ObservationList.jsx";

import {
  useNoObservation,
  useObservationForm,
  useWeeklyObservations,
} from "./useObservations.js";

/**
 * Form for one pending patrol. Kept as its own component so the form
 * hook mounts and resets with the assignment rather than living for the
 * lifetime of the page.
 */
function ObservationFormPanel({
  assignment,
  onDone,
  onCancel,
}) {
  const form = useObservationForm(assignment);

  async function handleSubmit() {
    const result = await form.submit();

    if (result) {
      onDone();
    }
  }

  return (
    <>
      {form.error ? (
        <Alert
          type="error"
          title="Unable to send the observation"
        >
          {form.error}
        </Alert>
      ) : null}

      <ObservationCard
        assignment={assignment}
        formValues={form.values}
        maxObservations={form.maxObservations}
        maxDescriptionWords={
          form.maxDescriptionWords
        }
        submitting={form.submitting}
        onFieldChange={form.updateField}
        onItemFieldChange={form.updateItemField}
        onItemPhotographChange={
          form.updateItemPhotograph
        }
        onItemPhotographRemove={
          form.removeItemPhotograph
        }
        onAddObservation={form.addObservation}
        onRemoveObservation={
          form.removeObservation
        }
        onSubmit={handleSubmit}
        onCancel={onCancel}
      />
    </>
  );
}

export default function ObservationPage() {
  const [searchParams, setSearchParams] =
    useSearchParams();

  const {
    assignments,
    pending,
    submitted,
    pendingCount,
    submittedCount,
    overdueCount,
    weekStartDate,
    weekEndDate,
    loading,
    error,
    reload,
  } = useWeeklyObservations();

  const noObservation = useNoObservation();

  const [busyPatrolId, setBusyPatrolId] =
    useState(null);

  const [noticeMessage, setNoticeMessage] =
    useState("");

  /*
   * Page state lives in the query string, so cards are linkable, the
   * back button works, and the dashboard's deep links resolve.
   */
  const patrolId = searchParams.get("patrolId");
  const reportId = searchParams.get("reportId");
  const view = searchParams.get("view") ?? "week";
  const historyFilter =
    searchParams.get("filter") ?? "all";

  const selectedAssignment = useMemo(
    () =>
      assignments.find(
        (assignment) =>
          String(assignment.id) ===
          String(patrolId),
      ) ?? null,
    [assignments, patrolId],
  );

  function historyParams(filter = historyFilter) {
    return filter === "all"
      ? { view: "history" }
      : { view: "history", filter };
  }

  function openForm(assignment) {
    setSearchParams({
      patrolId: String(assignment.id),
    });
  }

  function openDetail(id) {
    setSearchParams({
      ...(view === "history"
        ? historyParams()
        : {}),
      reportId: String(id),
    });
  }

  function backToList() {
    setSearchParams(
      view === "history" ? historyParams() : {},
    );
  }

  function showWeek() {
    setSearchParams({});
  }

  function showHistory() {
    setSearchParams(historyParams("all"));
  }

  async function handleNoObservation(assignment) {
    const confirmed = window.confirm(
      "Close this audit with no observation to record? The auditee will have nothing to act on and the EHS Officer will see it as closed.",
    );

    if (!confirmed) {
      return;
    }

    setNoticeMessage("");
    setBusyPatrolId(assignment.id);

    const result = await noObservation.record(
      assignment.id,
    );

    setBusyPatrolId(null);

    if (result) {
      setNoticeMessage(result.message ?? "");
      reload();
    }
  }

  if (loading) {
    return (
      <LoadingSpinner message="Loading your observations..." />
    );
  }

  if (reportId) {
    return (
      <ObservationDetail
        reportId={reportId}
        backLabel={
          view === "history"
            ? "Back to past 6 months"
            : "Back to this week"
        }
        onBack={backToList}
      />
    );
  }

  if (patrolId && selectedAssignment) {
    return (
      <ObservationFormPanel
        assignment={selectedAssignment}
        onCancel={backToList}
        onDone={() => {
          backToList();
          reload();
        }}
      />
    );
  }

  return (
    <section className="observation-page">
      <header className="observation-section-header">
        <div>
          <span className="dashboard-eyebrow">
            Auditor workflow
          </span>

          <h1>Observations</h1>

          {weekStartDate ? (
            <p>
              Week of{" "}
              {formatDate(weekStartDate)} to{" "}
              {formatDate(weekEndDate)}. Reports
              are due by Thursday of the audit
              week.
            </p>
          ) : null}
        </div>

        <button
          type="button"
          className="button button-secondary"
          onClick={reload}
        >
          Refresh
        </button>
      </header>

      <div
        className="observation-tabs"
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          aria-selected={view !== "history"}
          className={`observation-tab${
            view !== "history"
              ? " observation-tab-active"
              : ""
          }`}
          onClick={showWeek}
        >
          This week
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={view === "history"}
          className={`observation-tab${
            view === "history"
              ? " observation-tab-active"
              : ""
          }`}
          onClick={showHistory}
        >
          Past 6 months
        </button>
      </div>

      {error ? (
        <Alert
          type="error"
          title="Unable to load your observations"
        >
          {error}
        </Alert>
      ) : null}

      {noObservation.error ? (
        <Alert
          type="error"
          title="Unable to close the audit"
        >
          {noObservation.error}
        </Alert>
      ) : null}

      {noticeMessage ? (
        <Alert type="success" title="Audit closed">
          {noticeMessage}
        </Alert>
      ) : null}

      {patrolId && !selectedAssignment ? (
        <Alert type="warning">
          That audit is not in your list for this
          week.
        </Alert>
      ) : null}

      {view === "history" ? (
        <ObservationHistory
          filter={historyFilter}
          onFilterChange={(filter) =>
            setSearchParams(historyParams(filter))
          }
          onOpen={openDetail}
        />
      ) : (
        <>
          <h2>
            Pending ({pendingCount})
            {overdueCount > 0 ? (
              <span className="observation-due observation-due-overdue">
                Overdue ({overdueCount})
              </span>
            ) : null}
          </h2>

          <PendingObservationList
            assignments={pending}
            onOpen={openForm}
            onNoObservation={handleNoObservation}
            busyPatrolId={busyPatrolId}
          />

          <h2>Submitted ({submittedCount})</h2>

          <SubmittedObservationList
            assignments={submitted}
            onOpen={openDetail}
          />
        </>
      )}
    </section>
  );
}
