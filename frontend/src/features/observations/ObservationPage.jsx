import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import Alert from "../../components/Alert.jsx";
import LoadingSpinner from "../../components/LoadingSpinner.jsx";

import { formatDate } from "../../lib/errorMessage.js";

import ObservationCard from "./ObservationCard.jsx";
import ObservationDetail from "./ObservationDetail.jsx";

import {
  PendingObservationList,
  SubmittedObservationList,
} from "./ObservationList.jsx";

import {
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
        descriptionWordCount={
          form.descriptionWordCount
        }
        maxDescriptionWords={
          form.maxDescriptionWords
        }
        submitting={form.submitting}
        onFieldChange={form.updateField}
        onPhotographChange={
          form.updatePhotograph
        }
        onPhotographRemove={
          form.removePhotograph
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
    weekStartDate,
    weekEndDate,
    loading,
    error,
    reload,
  } = useWeeklyObservations();

  /*
   * Page state lives in the query string, so cards are linkable, the
   * back button works, and the dashboard's deep links resolve.
   */
  const patrolId = searchParams.get("patrolId");
  const reportId = searchParams.get("reportId");

  const selectedAssignment = useMemo(
    () =>
      assignments.find(
        (assignment) =>
          String(assignment.id) ===
          String(patrolId),
      ) ?? null,
    [assignments, patrolId],
  );

  function openForm(assignment) {
    setSearchParams({
      patrolId: String(assignment.id),
    });
  }

  function openDetail(id) {
    setSearchParams({ reportId: String(id) });
  }

  function backToList() {
    setSearchParams({});
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
              {formatDate(weekEndDate)}
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

      {error ? (
        <Alert
          type="error"
          title="Unable to load your observations"
        >
          {error}
        </Alert>
      ) : null}

      {patrolId && !selectedAssignment ? (
        <Alert type="warning">
          That audit is not in your list for this
          week.
        </Alert>
      ) : null}

      <h2>Pending ({pendingCount})</h2>

      <PendingObservationList
        assignments={pending}
        onOpen={openForm}
      />

      <h2>Submitted ({submittedCount})</h2>

      <SubmittedObservationList
        assignments={submitted}
        onOpen={openDetail}
      />
    </section>
  );
}
