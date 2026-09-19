import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  fetchDashboardData,
} from "./dashboard.service.js";

function getInitialMonth() {
  const currentDate = new Date();

  return {
    year: currentDate.getFullYear(),
    month: currentDate.getMonth() + 1,
  };
}

function getErrorMessage(error) {
  if (
    error instanceof TypeError &&
    error.message === "Failed to fetch"
  ) {
    return (
      "Unable to connect to the EHS API. " +
      "Check that the backend is running."
    );
  }

  return (
    error?.message ??
    "Unable to load the dashboard."
  );
}

export default function useDashboard() {
  const [selectedPeriod, setSelectedPeriod] =
    useState(getInitialMonth);

  const [dashboardData, setDashboardData] =
    useState({
      role: "USER",
      audits: [],
      nextAudit: null,
      nextWeek: null,
      unitWeeks: null,
    });

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const loadDashboard = useCallback(
    async () => {
      setLoading(true);
      setError("");

      try {
        const data =
          await fetchDashboardData({
            year: selectedPeriod.year,
            month:
              selectedPeriod.month,
          });

        setDashboardData({
          role: data?.role ?? "USER",

          audits: Array.isArray(
            data?.audits,
          )
            ? data.audits
            : [],

          nextAudit:
            data?.nextAudit ?? null,

          nextWeek:
            data?.nextWeek ?? null,

          unitWeeks:
            data?.unitWeeks ?? null,
        });
      } catch (requestError) {
        setDashboardData({
          role: "USER",
          audits: [],
          nextAudit: null,
          nextWeek: null,
          unitWeeks: null,
        });

        setError(
          getErrorMessage(requestError),
        );
      } finally {
        setLoading(false);
      }
    },
    [selectedPeriod],
  );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const goToPreviousMonth =
    useCallback(() => {
      setSelectedPeriod(
        (currentPeriod) => {
          if (currentPeriod.month === 1) {
            return {
              year:
                currentPeriod.year - 1,
              month: 12,
            };
          }

          return {
            year: currentPeriod.year,
            month:
              currentPeriod.month - 1,
          };
        },
      );
    }, []);

  const goToNextMonth =
    useCallback(() => {
      setSelectedPeriod(
        (currentPeriod) => {
          if (
            currentPeriod.month === 12
          ) {
            return {
              year:
                currentPeriod.year + 1,
              month: 1,
            };
          }

          return {
            year: currentPeriod.year,
            month:
              currentPeriod.month + 1,
          };
        },
      );
    }, []);

  return {
    selectedPeriod,
    role: dashboardData.role,
    audits: dashboardData.audits,
    nextAudit:
      dashboardData.nextAudit,
    nextWeek:
      dashboardData.nextWeek,
    unitWeeks:
      dashboardData.unitWeeks,
    loading,
    error,
    goToPreviousMonth,
    goToNextMonth,
    reloadDashboard:
      loadDashboard,
  };
}