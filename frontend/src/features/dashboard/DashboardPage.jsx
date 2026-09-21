import { useState } from "react";
import { useNavigate } from "react-router-dom";

import Alert from "../../components/Alert.jsx";
import LoadingSpinner from "../../components/LoadingSpinner.jsx";
import PatrolCalendar from "../patrols/PatrolCalendar.jsx";

import {
  hasManagementRole,
  normalizeRole,
} from "../../constants/roles.js";

import {
  useAuthenticatedUser,
} from "../../app/authProvider.jsx";

import AuditStatusCards from "./AuditStatusCards.jsx";
import OfficerWeekCard from "./OfficerWeekCard.jsx";
import WeeklySummary from "./WeeklySummary.jsx";
import useDashboard from "./useDashboard.js";

/**
 * Gets the authenticated user's application roles.
 *
 * The authenticated user is the preferred source. The role
 * returned by the dashboard API is used only as a fallback.
 */
function getUserRoles(user, dashboardRole) {
  if (
    Array.isArray(user?.roles) &&
    user.roles.length > 0
  ) {
    return user.roles.map(normalizeRole);
  }

  if (user?.role) {
    return [
      normalizeRole(user.role),
    ];
  }

  if (dashboardRole) {
    return [
      normalizeRole(dashboardRole),
    ];
  }

  return ["USER"];
}

/**
 * Determines which workflow page should open for an assigned
 * audit.
 *
 * Auditor:
 * Opens the observation page.
 *
 * Auditee:
 * Opens the closure page only when an observation report is
 * available for closure.
 */
function getAuditDestination(audit) {
  const assignmentRole = normalizeRole(
    audit.assignmentRole ??
      audit.assignment_role,
  );

  if (assignmentRole === "AUDITOR") {
    const query = new URLSearchParams({
      auditId: String(audit.id),
    });

    return `/observations?${query.toString()}`;
  }

  const hasOpenObservationReport =
    audit.hasOpenObservationReport === true ||
    audit.has_open_observation_report === true;

  if (
    assignmentRole === "AUDITEE" &&
    hasOpenObservationReport
  ) {
    const reportId =
      audit.observationReportId ??
      audit.observation_report_id;

    const query = new URLSearchParams({
      auditId: String(audit.id),
    });

    if (reportId) {
      query.set(
        "reportId",
        String(reportId),
      );
    }

    return `/closures?${query.toString()}`;
  }

  return null;
}

export default function DashboardPage() {
  const navigate = useNavigate();

  const { user } =
    useAuthenticatedUser();

  const {
    selectedPeriod,
    role,
    audits,
    nextAudit,
    nextWeek,
    officerWeek,
    loading,
    error,
    goToPreviousMonth,
    goToNextMonth,
    reloadDashboard,
  } = useDashboard();

  const [
    weeklyPlanExpanded,
    setWeeklyPlanExpanded,
  ] = useState(false);

  const [
    navigationMessage,
    setNavigationMessage,
  ] = useState("");

  const userRoles =
    getUserRoles(user, role);

  const managementUser =
    hasManagementRole(userRoles);

  function handleOpenAudit(audit) {
    setNavigationMessage("");

    const destination =
      getAuditDestination(audit);

    if (!destination) {
      setNavigationMessage(
        "This audit does not currently have an available action. An auditor can open the observation page, while an auditee can open the closure page after an observation report has been submitted.",
      );

      return;
    }

    navigate(destination);
  }

  function handlePreviousMonth() {
    setWeeklyPlanExpanded(false);
    setNavigationMessage("");
    goToPreviousMonth();
  }

  function handleNextMonth() {
    setWeeklyPlanExpanded(false);
    setNavigationMessage("");
    goToNextMonth();
  }

  function handleReloadDashboard() {
    setNavigationMessage("");
    reloadDashboard();
  }

  if (loading) {
    return (
      <div className="dashboard-page">
        <LoadingSpinner
          message="Loading assigned audits..."
        />
      </div>
    );
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-page-header">
        <div>
          <span className="dashboard-eyebrow">
            EHS workspace
          </span>

          <h1>Dashboard</h1>

          <p>
            {managementUser
              ? "Review the monthly patrol calendar and the next upcoming weekly Zone-wise audit plan."
              : "Review audits assigned to you and open your next required inspection action."}
          </p>
        </div>

        <button
          type="button"
          className="dashboard-refresh-button"
          onClick={handleReloadDashboard}
        >
          Refresh dashboard
        </button>
      </header>

      {error && (
        <Alert
          type="error"
          title="Unable to load dashboard"
        >
          {error}
        </Alert>
      )}

      {navigationMessage && (
        <Alert
          type="warning"
          title="Audit action unavailable"
        >
          {navigationMessage}
        </Alert>
      )}

      <PatrolCalendar
        year={selectedPeriod.year}
        month={selectedPeriod.month}
        audits={audits}
        onPreviousMonth={
          handlePreviousMonth
        }
        onNextMonth={
          handleNextMonth
        }
      />

      {managementUser ? (
        normalizeRole(role) ===
        "EHS_OFFICER" ? (
          <OfficerWeekCard
            week={officerWeek}
            onAssignmentChanged={
              reloadDashboard
            }
          />
        ) : (
          <WeeklySummary
            week={nextWeek}
            expanded={weeklyPlanExpanded}
            onToggle={() => {
              setWeeklyPlanExpanded(
                (currentValue) =>
                  !currentValue,
              );
            }}
          />
        )
      ) : (
        <AuditStatusCards
          audit={nextAudit}
          onOpen={handleOpenAudit}
        />
      )}
    </main>
  );
}