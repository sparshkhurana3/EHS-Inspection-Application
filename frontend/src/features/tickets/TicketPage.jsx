import { useSearchParams } from "react-router-dom";

import Alert from "../../components/Alert.jsx";
import LoadingSpinner from "../../components/LoadingSpinner.jsx";

import TicketDetail from "./TicketDetail.jsx";
import TicketList from "./TicketList.jsx";

import { useHodTickets } from "./useTickets.js";

export default function TicketPage() {
  const [searchParams, setSearchParams] =
    useSearchParams();

  const {
    open,
    inProgress,
    closed,
    openCount,
    inProgressCount,
    closedCount,
    closedWindowDays,
    loading,
    error,
    reload,
  } = useHodTickets();

  const ticketId = searchParams.get("ticketId");

  if (ticketId) {
    return (
      <TicketDetail
        ticketId={ticketId}
        onBack={() => {
          setSearchParams({});
          reload();
        }}
      />
    );
  }

  if (loading) {
    return (
      <LoadingSpinner message="Loading your tickets..." />
    );
  }

  function openTicket(id) {
    setSearchParams({ ticketId: String(id) });
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

      {error ? (
        <Alert
          type="error"
          title="Unable to load your tickets"
        >
          {error}
        </Alert>
      ) : null}

      <h2>Open ({openCount})</h2>

      <TicketList
        tickets={open}
        onOpen={openTicket}
        emptyMessage="No tickets are waiting for a decision."
      />

      <h2>In progress ({inProgressCount})</h2>

      <TicketList
        tickets={inProgress}
        onOpen={openTicket}
        emptyMessage="No tickets are in progress."
      />

      <h2>
        Closed in the last {closedWindowDays}{" "}
        days ({closedCount})
      </h2>

      <TicketList
        tickets={closed}
        onOpen={openTicket}
        emptyMessage="No tickets were closed in this period."
      />
    </section>
  );
}
