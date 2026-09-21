import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  fetchRoster,
  uploadRoster as uploadRosterRequest,
} from "./patrol.service.js";

import {
  getErrorMessage,
} from "../../lib/errorMessage.js";

const MAX_ROSTER_FILE_SIZE =
  2 * 1024 * 1024;

const ALLOWED_EXTENSIONS = [".csv", ".xlsx"];

function getExtension(fileName) {
  const match = /\.[^.]+$/.exec(
    fileName ?? "",
  );

  return match
    ? match[0].toLowerCase()
    : "";
}

function csvField(value) {
  const text = String(value ?? "");

  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll(
      '"',
      '""',
    )}"`;
  }

  return text;
}

/**
 * The EHS Officer's weekly roster: the current upload, plus the state
 * for selecting and submitting a new one.
 */
export default function useRoster() {
  const [roster, setRoster] = useState(null);
  const [loading, setLoading] =
    useState(true);
  const [uploading, setUploading] =
    useState(false);
  const [selectedFile, setSelectedFile] =
    useState(null);
  const [error, setError] = useState("");
  const [rowErrors, setRowErrors] =
    useState([]);
  const [summary, setSummary] =
    useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await fetchRoster();

      setRoster(result?.roster ?? null);
    } catch (requestError) {
      setError(
        getErrorMessage(requestError),
      );

      setRoster(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectFile = useCallback(
    (file) => {
      setSelectedFile(file ?? null);
      setError("");
      setRowErrors([]);
      setSummary(null);
    },
    [],
  );

  const upload = useCallback(async () => {
    if (!selectedFile || uploading) {
      return null;
    }

    setError("");
    setRowErrors([]);
    setSummary(null);

    const extension = getExtension(
      selectedFile.name,
    );

    if (
      !ALLOWED_EXTENSIONS.includes(
        extension,
      )
    ) {
      setError(
        "Upload a .csv or .xlsx file.",
      );

      return null;
    }

    if (
      selectedFile.size >
      MAX_ROSTER_FILE_SIZE
    ) {
      setError(
        "The roster file must be 2 MB or smaller.",
      );

      return null;
    }

    setUploading(true);

    try {
      const result =
        await uploadRosterRequest(
          selectedFile,
        );

      setRoster(result?.roster ?? null);
      setSummary(result?.summary ?? null);
      setSelectedFile(null);

      return result;
    } catch (requestError) {
      if (
        requestError?.code ===
          "ROSTER_INVALID" &&
        Array.isArray(
          requestError.details,
        )
      ) {
        setRowErrors(
          requestError.details,
        );
      }

      setError(
        getErrorMessage(requestError),
      );

      return null;
    } finally {
      setUploading(false);
    }
  }, [selectedFile, uploading]);

  /**
   * Builds a starter CSV from the officer's own units and zones (the
   * same lookups the manual form uses), with the auditor/auditee
   * columns left blank, and triggers a browser download.
   */
  const downloadTemplate = useCallback(
    (zones, units, location) => {
      const unitsById = new Map(
        (units ?? []).map((unit) => [
          unit.id,
          unit,
        ]),
      );

      const lines = [
        "Location,Unit,Zone,Auditor (email),Auditee (email)",

        ...(zones ?? []).map((zone) => {
          const unit = unitsById.get(
            zone.unitId,
          );

          return [
            csvField(location?.name),
            csvField(unit?.name),
            csvField(zone.name),
            "",
            "",
          ].join(",");
        }),
      ];

      const blob = new Blob(
        [lines.join("\n")],
        { type: "text/csv" },
      );

      const url =
        URL.createObjectURL(blob);

      const link =
        document.createElement("a");

      link.href = url;
      link.download =
        "weekly-roster-template.csv";

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);
    },
    [],
  );

  return {
    roster,
    loading,
    uploading,
    selectedFile,
    error,
    rowErrors,
    summary,
    selectFile,
    upload,
    reload: load,
    downloadTemplate,
  };
}
