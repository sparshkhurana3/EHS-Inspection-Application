import {
  useCallback,
  useRef,
  useState,
} from "react";

import {
  fetchReport,
  fetchReportPdf,
} from "./reports.service.js";

import {
  getErrorMessage,
} from "../../lib/errorMessage.js";

/**
 * The report on screen and its PDF.
 *
 * `generate` loads the report as JSON for the page to draw. `download`
 * saves the same report as a PDF through a temporary object URL, and
 * does not need a generated report. A response that arrives after a
 * newer generate was asked for is ignored, so a slow answer can never
 * replace a newer report.
 */
export default function useReport() {
  const [report, setReport] = useState(null);

  const [generating, setGenerating] =
    useState(false);

  const [downloading, setDownloading] =
    useState(false);

  const [error, setError] = useState("");

  const requestCounter = useRef(0);

  const generate = useCallback(
    async (type, params) => {
      requestCounter.current += 1;

      const requestId = requestCounter.current;

      setGenerating(true);
      setError("");

      try {
        const result = await fetchReport(
          type,
          params,
        );

        if (requestId !== requestCounter.current) {
          return null;
        }

        setReport(result.report);

        return result.report;
      } catch (requestError) {
        if (requestId === requestCounter.current) {
          setReport(null);

          setError(
            getErrorMessage(requestError),
          );
        }

        return null;
      } finally {
        if (requestId === requestCounter.current) {
          setGenerating(false);
        }
      }
    },
    [],
  );

  const download = useCallback(
    async (type, params, fileName) => {
      if (downloading) {
        return;
      }

      setDownloading(true);
      setError("");

      let objectUrl = null;

      try {
        const blob = await fetchReportPdf(
          type,
          params,
        );

        objectUrl = URL.createObjectURL(blob);

        const link =
          document.createElement("a");

        link.href = objectUrl;
        link.download = fileName;

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
    },
    [downloading],
  );

  const clear = useCallback(() => {
    requestCounter.current += 1;

    setReport(null);
    setError("");
    setGenerating(false);
  }, []);

  return {
    report,
    generating,
    downloading,
    error,
    generate,
    download,
    clear,
  };
}
