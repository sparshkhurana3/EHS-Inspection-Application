import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  createObservationReport,
  fetchObservationPhotograph,
  fetchObservationReport,
  fetchWeeklyAssignments,
} from "./observation.service.js";

import {
  getErrorMessage,
} from "../../lib/errorMessage.js";

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
export const MAX_DESCRIPTION_WORDS = 500;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/svg+xml",
]);

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

export function countWords(value) {
  const trimmed = String(value ?? "").trim();

  return trimmed
    ? trimmed.split(/\s+/).filter(Boolean).length
    : 0;
}

/**
 * The auditor's week: every patrol they are auditing, split into the
 * ones still needing a report and the ones already filed.
 */
export function useWeeklyObservations() {
  const [data, setData] = useState({
    assignments: [],
    pendingCount: 0,
    submittedCount: 0,
    weekStartDate: null,
    weekEndDate: null,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result =
        await fetchWeeklyAssignments();

      setData({
        assignments: Array.isArray(
          result?.assignments,
        )
          ? result.assignments
          : [],
        pendingCount: result?.pendingCount ?? 0,
        submittedCount:
          result?.submittedCount ?? 0,
        weekStartDate: result?.weekStartDate,
        weekEndDate: result?.weekEndDate,
      });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pending = data.assignments.filter(
    (assignment) => !assignment.report,
  );

  const submitted = data.assignments.filter(
    (assignment) => assignment.report,
  );

  return {
    ...data,
    pending,
    submitted,
    loading,
    error,
    reload: load,
  };
}

const EMPTY_FORM = {
  findingDate: "",
  zoneAreaId: "",
  category: "",
  photograph: null,
  photographPreview: "",
  description: "",
  riskCategory: "",
};

/**
 * Form state for one assignment. Keyed to that assignment so switching
 * between patrols cannot carry a half-filled report across.
 */
export function useObservationForm(assignment) {
  const [values, setValues] = useState(() => ({
    ...EMPTY_FORM,
    findingDate: todayValue(),
  }));

  const [submitting, setSubmitting] =
    useState(false);
  const [error, setError] = useState("");

  const previewRef = useRef("");

  useEffect(() => {
    previewRef.current =
      values.photographPreview;
  }, [values.photographPreview]);

  /* Reset when the assignment changes, and release the object URL. */
  useEffect(() => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
    }

    setValues({
      ...EMPTY_FORM,
      findingDate: todayValue(),
    });

    setError("");
  }, [assignment?.id]);

  useEffect(
    () => () => {
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current);
      }
    },
    [],
  );

  const updateField = useCallback(
    (name, value) => {
      setError("");

      setValues((current) => ({
        ...current,
        [name]: value,
      }));
    },
    [],
  );

  const updatePhotograph = useCallback((file) => {
    setError("");

    if (!file) {
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setError(
        "Only JPG, JPEG, PNG, or SVG images are allowed.",
      );

      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setError(
        "The observation photograph must be 10 MB or smaller.",
      );

      return;
    }

    setValues((current) => {
      if (current.photographPreview) {
        URL.revokeObjectURL(
          current.photographPreview,
        );
      }

      return {
        ...current,
        photograph: file,
        photographPreview:
          URL.createObjectURL(file),
      };
    });
  }, []);

  const removePhotograph = useCallback(() => {
    setError("");

    setValues((current) => {
      if (current.photographPreview) {
        URL.revokeObjectURL(
          current.photographPreview,
        );
      }

      return {
        ...current,
        photograph: null,
        photographPreview: "",
      };
    });
  }, []);

  function validate() {
    if (!assignment?.id) {
      return "No patrol is selected.";
    }

    if (!values.findingDate) {
      return "Finding date is required.";
    }

    if (!values.zoneAreaId) {
      return "Select the area where the observation was made.";
    }

    if (
      !["UA", "UC"].includes(values.category)
    ) {
      return "Select UA or UC as the observation category.";
    }

    if (!values.photograph) {
      return "Add a photograph of the observation.";
    }

    if (!values.description.trim()) {
      return "Enter the observation description.";
    }

    if (
      countWords(values.description) >
      MAX_DESCRIPTION_WORDS
    ) {
      return `Observation description cannot exceed ${MAX_DESCRIPTION_WORDS} words.`;
    }

    if (
      !["HIGH", "MEDIUM", "LOW"].includes(
        values.riskCategory,
      )
    ) {
      return "Select a risk category.";
    }

    return "";
  }

  const submit = useCallback(async () => {
    if (submitting) {
      return null;
    }

    const validationError = validate();

    if (validationError) {
      setError(validationError);
      return null;
    }

    setSubmitting(true);
    setError("");

    try {
      return await createObservationReport({
        patrolId: assignment.id,
        findingDate: values.findingDate,
        zoneAreaId: values.zoneAreaId,
        category: values.category,
        photograph: values.photograph,
        description: values.description,
        riskCategory: values.riskCategory,
      });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      return null;
    } finally {
      setSubmitting(false);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [assignment, values, submitting]);

  return {
    values,
    descriptionWordCount: countWords(
      values.description,
    ),
    maxDescriptionWords:
      MAX_DESCRIPTION_WORDS,
    submitting,
    error,
    updateField,
    updatePhotograph,
    removePhotograph,
    submit,
  };
}

/**
 * One filed report plus its photograph, for the read-only detail view.
 */
export function useObservationDetail(reportId) {
  const [report, setReport] = useState(null);
  const [photograph, setPhotograph] =
    useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const previewRef = useRef("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const result =
          await fetchObservationReport(reportId);

        if (cancelled) {
          return;
        }

        setReport(result?.report ?? null);

        try {
          const blob =
            await fetchObservationPhotograph(
              reportId,
            );

          if (cancelled) {
            return;
          }

          const url =
            URL.createObjectURL(blob);

          previewRef.current = url;
          setPhotograph(url);
        } catch {
          /*
           * A missing photo should not hide the rest of the report.
           */
          if (!cancelled) {
            setPhotograph("");
          }
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            getErrorMessage(requestError),
          );
          setReport(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (reportId) {
      load();
    }

    return () => {
      cancelled = true;

      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current);
        previewRef.current = "";
      }
    };
  }, [reportId]);

  return { report, photograph, loading, error };
}
