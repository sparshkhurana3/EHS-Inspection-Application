import { useSearchParams } from "react-router-dom";

import Alert from "../../components/Alert.jsx";
import LoadingSpinner from "../../components/LoadingSpinner.jsx";

import {
  useAuthenticatedUser,
} from "../../app/authProvider.jsx";

import {
  canPlanAudits,
} from "../../constants/roles.js";

import ActionPlanForm from "./ActionPlanForm.jsx";
import ApprovalQueuePage from "./ApprovalQueuePage.jsx";
import TicketApprovalQueuePage from "./TicketApprovalQueuePage.jsx";
import ClosureList from "./ClosureList.jsx";
import ObservationSummary from "./ObservationSummary.jsx";

import {
  useDepartmentOptions,
  useAuditeeClosures,
  useClosureDetail,
  useClosureSubmission,
} from "./useClosures.js";

/**
 * One closure: what was found, and what is being done about it.
 */
function ClosureDetailPanel({
  closureId,
  onBack,
}) {
  const {
    closure,
    photograph,
    photographs,
    loading,
    error,
    reload,
  } = useClosureDetail(closureId);

  const submission = useClosureSubmission({
    closureId,
    onSubmitted: reload,
  });

  const departmentOptions =
    useDepartmentOptions(closureId);

  if (loading) {
    return (
      <LoadingSpinner message="Loading closure..." />
    );
  }

  if (error || !closure) {
    return (
      <>
        <Alert
          type="error"
          title="Unable to load the closure"
        >
          {error || "The closure was not found."}
        </Alert>

        <button
          type="button"
          className="button button-secondary"
          onClick={onBack}
        >
          Back to closures
        </button>
      </>
    );
  }

  return (
    <section className="closure-page">
      <header className="observation-section-header">
        <div>
          <span className="dashboard-eyebrow">
            Auditee workflow
          </span>

          <h1>
            {closure.reportNumber ?? "Closure"}
          </h1>
        </div>

        <button
          type="button"
          className="button button-secondary"
          onClick={onBack}
        >
          Back
        </button>
      </header>

      <ObservationSummary
        closure={closure}
        photograph={photograph}
        photographs={photographs}
      />

      <ActionPlanForm
        closure={closure}
        photograph={photograph}
        photographs={photographs}
        submitting={submission.submitting}
        submitError={submission.error}
        onItemSaved={reload}
        onSendForApproval={
          submission.sendForApproval
        }
        departmentOptions={
          departmentOptions.options
        }
        departmentOptionsLoading={
          departmentOptions.loading
        }
        plantName={
          departmentOptions.plantName
        }
      />
    </section>
  );
}

export default function ClosurePage() {
  const [searchParams, setSearchParams] =
    useSearchParams();

  const { user } = useAuthenticatedUser();

  const {
    pending,
    lapsed,
    completed,
    pendingCount,
    lapsedCount,
    completedCount,
    pendingWindowMonths,
    completedWindowDays,
    loading,
    error,
    reload,
  } = useAuditeeClosures();

  const closureId =
    searchParams.get("closureId");

  const view = searchParams.get("view");
  const showApprovals = view === "approvals";
  const showTicketApprovals =
    view === "ticket-approvals";

  const isOfficer = canPlanAudits(user);

  if (isOfficer && showApprovals) {
    return <ApprovalQueuePage />;
  }

  /*
   * The EHS Officer reviews tickets here rather than on the Ticket
   * page, which stays Action Team HOD only (docs/17, D7).
   */
  if (isOfficer && showTicketApprovals) {
    return (
      <section className="closure-page">
        <header className="observation-section-header">
          <div>
            <span className="dashboard-eyebrow">
              EHS Officer workflow
            </span>

            <h1>Ticket approvals</h1>

            <p>
              Tickets the Action Team HODs have
              sent for your decision.
            </p>
          </div>

          <button
            type="button"
            className="button button-secondary"
            onClick={() => setSearchParams({})}
          >
            Back to closures
          </button>
        </header>

        <TicketApprovalQueuePage />
      </section>
    );
  }

  if (closureId) {
    return (
      <ClosureDetailPanel
        closureId={closureId}
        onBack={() => {
          setSearchParams({});
          reload();
        }}
      />
    );
  }

  if (loading) {
    return (
      <LoadingSpinner message="Loading your closures..." />
    );
  }

  function openClosure(id) {
    setSearchParams({ closureId: String(id) });
  }

  return (
    <section className="closure-page">
      <header className="observation-section-header">
        <div>
          <span className="dashboard-eyebrow">
            Auditee workflow
          </span>

          <h1>Closure</h1>

          <p>
            Pending from the last{" "}
            {pendingWindowMonths} months
          </p>
        </div>

        <div className="closure-header-actions">
          {isOfficer ? (
            <>
              <button
                type="button"
                className="button button-secondary"
                onClick={() =>
                  setSearchParams({
                    view: "approvals",
                  })
                }
              >
                Closure approvals
              </button>

              <button
                type="button"
                className="button button-secondary"
                onClick={() =>
                  setSearchParams({
                    view: "ticket-approvals",
                  })
                }
              >
                Ticket approvals
              </button>
            </>
          ) : null}

          <button
            type="button"
            className="button button-secondary"
            onClick={reload}
          >
            Refresh
          </button>
        </div>
      </header>

      {error ? (
        <Alert
          type="error"
          title="Unable to load your closures"
        >
          {error}
        </Alert>
      ) : null}

      {/*
        * Lapsed sits above Pending because it is the most overdue work
        * and the easiest to lose track of. These stay fully actionable:
        * flagging an obligation without letting it be discharged would
        * strand it.
        */}
      {lapsedCount > 0 ? (
        <>
          <h2>Lapsed ({lapsedCount})</h2>

          <ClosureList
            closures={lapsed}
            onOpen={openClosure}
            variant="lapsed"
            emptyMessage="No lapsed closures."
          />
        </>
      ) : null}

      <h2>Pending ({pendingCount})</h2>

      <ClosureList
        closures={pending}
        onOpen={openClosure}
        emptyMessage="You have no pending closures."
      />

      <h2>
        Completed in the last{" "}
        {completedWindowDays} days (
        {completedCount})
      </h2>

      <ClosureList
        closures={completed}
        onOpen={openClosure}
        variant="completed"
        emptyMessage="No closures were completed in this period."
      />
    </section>
  );
}
