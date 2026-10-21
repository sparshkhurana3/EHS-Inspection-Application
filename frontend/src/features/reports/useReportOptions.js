import {
  useEffect,
  useState,
} from "react";

import {
  fetchWeeklyReportWeeks,
  fetchYearlyReportYears,
} from "./reports.service.js";

import {
  getErrorMessage,
} from "../../lib/errorMessage.js";

/**
 * The weeks and years the Report page offers, loaded once. The server
 * decides which exist, so the page never offers an empty period.
 */
export default function useReportOptions() {
  const [weeks, setWeeks] = useState([]);
  const [years, setYears] = useState([]);
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchWeeklyReportWeeks(),
      fetchYearlyReportYears(),
    ])
      .then(([weekResult, yearResult]) => {
        if (cancelled) {
          return;
        }

        setWeeks(weekResult?.weeks ?? []);
        setYears(yearResult?.years ?? []);
        setLocation(weekResult?.location ?? null);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(
            getErrorMessage(requestError),
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    weeks,
    years,
    location,
    loading,
    error,
  };
}
