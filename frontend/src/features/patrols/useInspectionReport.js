import {
  useCallback,
  useState,
} from "react";

import {
  fetchInspectionReport,
} from "./patrol.service.js";

import {
  getErrorMessage,
} from "../../lib/errorMessage.js";

/**
 * Downloads the zone-by-week inspection report.
 *
 * The file arrives as a blob because the route is authenticated, so it
 * is handed to the browser through a temporary object URL rather than
 * by navigating to the endpoint.
 */
export default function useInspectionReport() {
  const [downloading, setDownloading] =
    useState(false);

  const [error, setError] = useState("");

  const download = useCallback(async () => {
    if (downloading) {
      return;
    }

    setDownloading(true);
    setError("");

    let objectUrl = null;

    try {
      const blob =
        await fetchInspectionReport();

      objectUrl =
        URL.createObjectURL(blob);

      const link =
        document.createElement("a");

      link.href = objectUrl;

      link.download = `inspection-report-${
        new Date()
          .toISOString()
          .slice(0, 10)
      }.xlsx`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (requestError) {
      setError(
        getErrorMessage(requestError),
      );
    } finally {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }

      setDownloading(false);
    }
  }, [downloading]);

  return {
    downloading,
    error,
    download,
    clearError: () => setError(""),
  };
}
