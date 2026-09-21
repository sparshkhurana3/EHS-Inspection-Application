import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  createObservationReport,
  fetchObservationHistory,
  fetchObservationItemPhotograph,
  fetchObservationReport,
  fetchWeeklyAssignments,
  recordNoObservation,
} from "./observation.service.js";

import {
  getErrorMessage,
} from "../../lib/errorMessage.js";

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
export const MAX_DESCRIPTION_WORDS = 500;
export const MAX_OBSERVATIONS = 10;

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
 * ones still needing a report and the ones already filed, plus any
 * unfiled audit from the previous weeks that is now overdue.
 */
export function useWeeklyObservations() {
  const [data, setData] = useState({
    assignments: [],
    pendingCount: 0,
    submittedCount: 0,
    overdueCount: 0,
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
        overdueCount: result?.overdueCount ?? 0,
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

function createEmptyItem() {
  return {
    key: crypto.randomUUID(),
    zoneAreaId: "",
    category: "",
    description: "",
    riskCategory: "",
    photograph: null,
    photographPreview: "",
  };
}

function revokeItemPreviews(items) {
  items.forEach((item) => {
    if (item.photographPreview) {
      URL.revokeObjectURL(item.photographPreview);
    }
  });
}

/**
 * Form state for one assignment: the once-only header (finding date)
 * and 1-10 observation items, each with its own photograph. Keyed to
 * the assignment so switching patrols cannot carry a half-filled
 * report across.
 */
export function useObservationForm(assignment) {
  const [values, setValues] = useState(() => ({
    findingDate: todayValue(),
    observations: [createEmptyItem()],
  }));

  const [submitting, setSubmitting] =
    useState(false);
  const [error, setError] = useState("");

  const itemsRef = useRef(values.observations);

  useEffect(() => {
    itemsRef.current = values.observations;
  }, [values.observations]);

  /* Reset when the assignment changes, releasing every preview URL. */
  useEffect(() => {
    revokeItemPreviews(itemsRef.current);

    setValues({
      findingDate: todayValue(),
      observations: [createEmptyItem()],
    });

    setError("");
  }, [assignment?.id]);

  useEffect(
    () => () => revokeItemPreviews(itemsRef.current),
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

  const updateItemField = useCallback(
    (index, name, value) => {
      setError("");

      setValues((current) => ({
        ...current,
        observations: current.observations.map(
          (item, itemIndex) =>
            itemIndex === index
              ? { ...item, [name]: value }
              : item,
        ),
      }));
    },
    [],
  );

  const updateItemPhotograph = useCallback(
    (index, file) => {
      setError("");

      if (!file) {
        return;
      }

      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        setError(
          `Observation ${index + 1}: only JPG, JPEG, PNG, or SVG images are allowed.`,
        );

        return;
      }

      if (file.size > MAX_IMAGE_SIZE) {
        setError(
          `Observation ${index + 1}: the photograph must be 10 MB or smaller.`,
        );

        return;
      }

      setValues((current) => ({
        ...current,
        observations: current.observations.map(
          (item, itemIndex) => {
            if (itemIndex !== index) {
              return item;
            }

            if (item.photographPreview) {
              URL.revokeObjectURL(
                item.photographPreview,
              );
            }

            return {
              ...item,
              photograph: file,
              photographPreview:
                URL.createObjectURL(file),
            };
          },
        ),
      }));
    },
    [],
  );

  const removeItemPhotograph = useCallback(
    (index) => {
      setError("");

      setValues((current) => ({
        ...current,
        observations: current.observations.map(
          (item, itemIndex) => {
            if (itemIndex !== index) {
              return item;
            }

            if (item.photographPreview) {
              URL.revokeObjectURL(
                item.photographPreview,
              );
            }

            return {
              ...item,
              photograph: null,
              photographPreview: "",
            };
          },
        ),
      }));
    },
    [],
  );

  const addObservation = useCallback(() => {
    setError("");

    setValues((current) => {
      if (
        current.observations.length >=
        MAX_OBSERVATIONS
      ) {
        return current;
      }

      return {
        ...current,
        observations: [
          ...current.observations,
          createEmptyItem(),
        ],
      };
    });
  }, []);

  const removeObservation = useCallback(
    (index) => {
      setError("");

      setValues((current) => {
        if (current.observations.length <= 1) {
          return current;
        }

        const removed = current.observations[index];

        if (removed?.photographPreview) {
          URL.revokeObjectURL(
            removed.photographPreview,
          );
        }

        return {
          ...current,
          observations:
            current.observations.filter(
              (item, itemIndex) =>
                itemIndex !== index,
            ),
        };
      });
    },
    [],
  );

  function validate() {
    if (!assignment?.id) {
      return "No patrol is selected.";
    }

    if (!values.findingDate) {
      return "Finding date is required.";
    }

    if (values.observations.length === 0) {
      return "Add at least one observation.";
    }

    for (const [
      index,
      item,
    ] of values.observations.entries()) {
      const label = `Observation ${index + 1}:`;

      if (!item.zoneAreaId) {
        return `${label} select the area where the observation was made.`;
      }

      if (!["UA", "UC"].includes(item.category)) {
        return `${label} select UA or UC as the category.`;
      }

      if (!item.photograph) {
        return `${label} add a photograph.`;
      }

      if (!item.description.trim()) {
        return `${label} enter the observation description.`;
      }

      if (
        countWords(item.description) >
        MAX_DESCRIPTION_WORDS
      ) {
        return `${label} description cannot exceed ${MAX_DESCRIPTION_WORDS} words.`;
      }

      if (
        !["HIGH", "MEDIUM", "LOW"].includes(
          item.riskCategory,
        )
      ) {
        return `${label} select a risk category.`;
      }
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
        observations: values.observations,
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
    maxObservations: MAX_OBSERVATIONS,
    maxDescriptionWords:
      MAX_DESCRIPTION_WORDS,
    submitting,
    error,
    updateField,
    updateItemField,
    updateItemPhotograph,
    removeItemPhotograph,
    addObservation,
    removeObservation,
    submit,
  };
}

/**
 * "No observation to record" for one pending assignment.
 */
export function useNoObservation() {
  const [submitting, setSubmitting] =
    useState(false);
  const [error, setError] = useState("");

  const record = useCallback(
    async (patrolId) => {
      if (submitting) {
        return null;
      }

      setSubmitting(true);
      setError("");

      try {
        return await recordNoObservation(patrolId);
      } catch (requestError) {
        setError(getErrorMessage(requestError));
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [submitting],
  );

  return { submitting, error, record };
}

/**
 * The past six months of reports the caller may see, for one filter.
 */
export function useObservationHistory(filter) {
  const [reports, setReports] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result =
        await fetchObservationHistory(filter);

      setReports(
        Array.isArray(result?.reports)
          ? result.reports
          : [],
      );
      setCount(result?.count ?? 0);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setReports([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  return { reports, count, loading, error, reload: load };
}

/**
 * One filed report plus each observation's photograph, keyed by item
 * id, for the read-only detail view.
 */
export function useObservationDetail(reportId) {
  const [report, setReport] = useState(null);
  const [photographs, setPhotographs] =
    useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const urlsRef = useRef([]);

  useEffect(() => {
    let cancelled = false;

    function revokeAll() {
      urlsRef.current.forEach((url) =>
        URL.revokeObjectURL(url),
      );
      urlsRef.current = [];
    }

    async function load() {
      setLoading(true);
      setError("");
      revokeAll();
      setPhotographs({});

      try {
        const result =
          await fetchObservationReport(reportId);

        if (cancelled) {
          return;
        }

        const loaded = result?.report ?? null;
        setReport(loaded);

        const items = loaded?.observations ?? [];

        const entries = await Promise.all(
          items.map((item) =>
            fetchObservationItemPhotograph(
              reportId,
              item.id,
            )
              .then((blob) => {
                const url =
                  URL.createObjectURL(blob);

                urlsRef.current.push(url);

                return [item.id, url];
              })
              /* a missing photo should not hide the rest */
              .catch(() => [item.id, ""]),
          ),
        );

        if (!cancelled) {
          setPhotographs(
            Object.fromEntries(entries),
          );
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
      revokeAll();
    };
  }, [reportId]);

  return { report, photographs, loading, error };
}
