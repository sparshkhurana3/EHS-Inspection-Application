import { useSearchParams } from "react-router-dom";

import Alert from "../../components/Alert.jsx";
import LoadingSpinner from "../../components/LoadingSpinner.jsx";

import TicketDetail from "./TicketDetail.jsx";
import TicketHistory from "./TicketHistory.jsx";
import TicketList from "./TicketList.jsx";

import { useHodTickets } from "./useTickets.js";

export default function TicketPage() {
  const [searchParams, setSearchParams] =
    useSearchParams();

  const {
    open,
    inProgress,
    pendingApproval,
    closed,
    openCount,
    inProgressCount,
    pendingApprovalCount,
    closedCount,
    closedWindowDays,
    loading,
    error,
    reload,
  } = useHodTickets();

  const ticketId = searchParams.get("ticketId");
  const view = searchParams.get("view") ?? "current";
  const historyFilter =
    searchParams.get("filter") ?? "all";

  function historyParams(
    filter = historyFilter,
  ) {
    return filter === "all"
      ? { view: "history" }
      : { view: "history", filter };
  }

  function openTicket(id) {
    setSearchParams({
      ...(view === "history"
        ? historyParams()
        : {}),
      ticketId: String(id),
    });
  }

  function backToList() {
    setSearchParams(
      view === "history" ? historyParams() : {},
    );
    reload();
  }

  if (ticketId) {
    return (
      <TicketDetail
        ticketId={ticketId}
        backLabel={
          view === "history"
            ? "Back to history"
            : "Back to tickets"
        }
        onBack={backToList}
      />
    );
  }

  if (loading && view !== "history") {
    return (
      <LoadingSpinner message="Loading your tickets..." />
    );
  }

  return (
    <section className="closure-page ticket-page">
      <header className="observation-section-header">
        <div>
          <span className="dashboard-eyebrow">
            Action Team workflow
          </span>

          <h1>Ticket</h1>
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
          onClick={() => setSearchParams({})}
        >
          Tickets
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
          onClick={() =>
            setSearchParams(
              historyParams("all"),
            )
          }
        >
          History
        </button>
      </div>

      {error ? (
        <Alert
          type="error"
          title="Unable to load your tickets"
        >
          {error}
        </Alert>
      ) : null}

      {view === "history" ? (
        <TicketHistory
          filter={historyFilter}
          onFilterChange={(filter) =>
            setSearchParams(
              historyParams(filter),
            )
          }
          onOpen={openTicket}
        />
      ) : (
        <>
          <h2>Open ({openCount})</h2>

          <TicketList
            tickets={open}
            onOpen={openTicket}
            emptyMessage="No tickets are waiting for a decision."
          />

          <h2>
            In progress ({inProgressCount})
          </h2>

          <TicketList
            tickets={inProgress}
            onOpen={openTicket}
            emptyMessage="No tickets are in progress."
          />

          <h2>
            Pending approval (
            {pendingApprovalCount})
          </h2>

          <TicketList
            tickets={pendingApproval}
            onOpen={openTicket}
            emptyMessage="No tickets are waiting on the EHS Officer."
          />

          <h2>
            Closed in the last{" "}
            {closedWindowDays} days (
            {closedCount})
          </h2>

          <TicketList
            tickets={closed}
            onOpen={openTicket}
            emptyMessage="No tickets were closed in this period."
          />
        </>
      )}
    </section>
  );
}
