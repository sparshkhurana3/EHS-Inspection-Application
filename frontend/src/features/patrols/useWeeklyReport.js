import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  fetchWeeklyInspectionReport,
  fetchWeeklyReportWeeks,
} from "./patrol.service.js";

import {
  getErrorMessage,
} from "../../lib/errorMessage.js";

/**
 * The Plan page's weekly report: the weeks to choose from, the chosen
 * week, and the PDF download.
 *
 * The file arrives as a blob because the route is authenticated, so it
 * is handed to the browser through a temporary object URL.
 */
export default function useWeeklyReport() {
  const [weeks, setWeeks] = useState([]);

  const [
    selectedWeekStart,
    setSelectedWeekStart,
  ] = useState("");

  const [loading, setLoading] =
    useState(true);

  const [downloading, setDownloading] =
    useState(false);

  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetchWeeklyReportWeeks()
      .then((result) => {
        if (cancelled) {
          return;
        }

        const loadedWeeks =
          result?.weeks ?? [];

        setWeeks(loadedWeeks);

        setSelectedWeekStart(
          loadedWeeks[0]?.weekStart ?? "",
        );
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

  const download = useCallback(async () => {
    const week = weeks.find(
      (candidate) =>
        candidate.weekStart ===
        selectedWeekStart,
    );

    if (!week || downloading) {
      return;
    }

    setDownloading(true);
    setError("");

    let objectUrl = null;

    try {
      const blob =
        await fetchWeeklyInspectionReport(
          week.weekStart,
        );

      objectUrl = URL.createObjectURL(blob);

      const link =
        document.createElement("a");

      link.href = objectUrl;

      link.download = `weekly-inspection-report-${
        week.isoYear
      }-w${String(week.isoWeek).padStart(
        2,
        "0",
      )}.pdf`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }

      setDownloading(false);
    }
  }, [
    weeks,
    selectedWeekStart,
    downloading,
  ]);

  return {
    weeks,
    selectedWeekStart,
    setSelectedWeekStart,
    loading,
    downloading,
    error,
    download,
  };
}
