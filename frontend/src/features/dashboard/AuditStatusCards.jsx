function formatDate(dateValue) {
  if (!dateValue) {
    return "Date not available";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return String(dateValue);
  }

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    },
  ).format(date);
}

function getAssignmentDetails(audit) {
  const assignmentRole = String(
    audit?.assignmentRole ??
      audit?.assignment_role ??
      "",
  ).toUpperCase();

  if (assignmentRole === "AUDITOR") {
    return {
      label: "Assigned as auditor",
      action: "Conduct observation",
      description:
        "Open the assigned patrol and record the observation report.",
    };
  }

  const hasOpenObservationReport =
    audit?.hasOpenObservationReport === true ||
    audit?.has_open_observation_report === true;

  if (
    assignmentRole === "AUDITEE" &&
    hasOpenObservationReport
  ) {
    return {
      label: "Assigned as auditee",
      action: "Review closure",
      description:
        "An observation report is open for your action plan and closure response.",
    };
  }

  return {
    label: "Assigned audit",
    action: "View audit",
    description:
      "Review the details of the assigned safety patrol.",
  };
}

function CompletedTaskCard({ audit }) {
  const weekLabel =
    audit.weekLabel ??
    audit.week_label ??
    "Current week";

  return (
    <section className="upcoming-section">
      <div className="dashboard-section-heading">
        <div>
          <span className="dashboard-eyebrow">
            Current assignment
          </span>

          <h2>Weekly audit status</h2>
        </div>

        <span className="dashboard-single-record">
          {weekLabel}
        </span>
      </div>

      <div
        className="empty-dashboard-card"
        role="status"
      >
        <strong>
          Task completed for this week
        </strong>

        <p>
          {audit.message ??
            "You do not have any pending auditor or auditee action for the current weekly audit."}
        </p>
      </div>
    </section>
  );
}

export default function AuditStatusCards({
  audit,
  onOpen,
}) {
  if (!audit) {
    return (
      <section className="upcoming-section">
        <div className="dashboard-section-heading">
          <div>
            <span className="dashboard-eyebrow">
              Next assignment
            </span>

            <h2>Upcoming audit</h2>
          </div>
        </div>

        <div className="empty-dashboard-card">
          <strong>
            No upcoming audit found
          </strong>

          <p>
            No assigned audit is currently available for the
            selected period.
          </p>
        </div>
      </section>
    );
  }

  const taskCompleted =
    audit.taskCompleted === true ||
    audit.task_completed === true ||
    audit.taskState === "TASK_COMPLETED" ||
    audit.task_state === "TASK_COMPLETED";

  if (taskCompleted) {
    return (
      <CompletedTaskCard audit={audit} />
    );
  }

  const assignmentDetails =
    getAssignmentDetails(audit);

  const scheduledDate =
    audit.scheduledDate ??
    audit.scheduled_date;

  const weekLabel =
    audit.weekLabel ??
    audit.week_label ??
    "Upcoming";

  const zoneName =
    audit.zoneName ??
    audit.zone_name ??
    "Assigned Zone";

  const areaDetail =
    audit.areaDetail ??
    audit.area_detail ??
    assignmentDetails.description;

  const unitName =
    audit.unitName ??
    audit.unit_name ??
    "Not available";

  const status =
    audit.status ?? "Scheduled";

  const canOpen =
    typeof onOpen === "function";

  function handleOpen() {
    if (canOpen) {
      onOpen(audit);
    }
  }

  return (
    <section className="upcoming-section">
      <div className="dashboard-section-heading">
        <div>
          <span className="dashboard-eyebrow">
            Next assignment
          </span>

          <h2>Upcoming audit</h2>
        </div>

        <span className="dashboard-single-record">
          Showing next audit only
        </span>
      </div>

      <button
        type="button"
        className="upcoming-audit-card"
        onClick={handleOpen}
        disabled={!canOpen}
        aria-label={`${assignmentDetails.action} for ${zoneName}`}
      >
        <div className="upcoming-card-date">
          <span>
            {formatDate(scheduledDate)}
          </span>

          <strong>{weekLabel}</strong>
        </div>

        <div className="upcoming-card-content">
          <span className="assignment-role-label">
            {assignmentDetails.label}
          </span>

          <h3>{zoneName}</h3>

          <p>{areaDetail}</p>

          <div className="upcoming-audit-meta">
            <span>
              Unit:{" "}
              <strong>{unitName}</strong>
            </span>

            <span>
              Status:{" "}
              <strong>{status}</strong>
            </span>
          </div>
        </div>

        <div className="upcoming-card-action">
          <span>
            {assignmentDetails.action}
          </span>

          <span aria-hidden="true">
            →
          </span>
        </div>
      </button>
    </section>
  );
}