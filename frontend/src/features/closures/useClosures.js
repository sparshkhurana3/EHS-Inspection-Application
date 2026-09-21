import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  approveClosureReport,
  fetchDepartmentOptions,
  fetchAuditeeClosures,
  fetchClosureById,
  fetchPendingApprovals,
  rejectClosureReport,
  saveClosureItem,
  submitClosureReport,
} from "./closure.service.js";

import {
  fetchObservationItemPhotograph,
  fetchObservationPhotograph,
} from "../observations/observation.service.js";

import {
  getErrorMessage,
} from "../../lib/errorMessage.js";

export const MAX_ACTION_PLAN_WORDS = 255;

export function countWords(value) {
  const trimmed = String(value ?? "").trim();

  return trimmed
    ? trimmed.split(/\s+/).filter(Boolean).length
    : 0;
}

function toDateInputValue(value) {
  return value
    ? String(value).slice(0, 10)
    : "";
}

/**
 * The auditee's page: what they still owe, what has lapsed, and what
 * was completed in the last week.
 */
export function useAuditeeClosures() {
  const [data, setData] = useState({
    pending: [],
    lapsed: [],
    completed: [],
    pendingCount: 0,
    lapsedCount: 0,
    completedCount: 0,
    pendingWindowMonths: 6,
    completedWindowDays: 7,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result =
        await fetchAuditeeClosures();

      setData({
        pending: result?.pending ?? [],
        lapsed: result?.lapsed ?? [],
        completed: result?.completed ?? [],
        pendingCount: result?.pendingCount ?? 0,
        lapsedCount: result?.lapsedCount ?? 0,
        completedCount:
          result?.completedCount ?? 0,
        pendingWindowMonths:
          result?.pendingWindowMonths ?? 6,
        completedWindowDays:
          result?.completedWindowDays ?? 7,
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

  return { ...data, loading, error, reload: load };
}

/**
 * One closure with every observation's photograph, for the detail and
 * form views. `photograph` stays as observation #1's image for callers
 * that show a single one; `photographs` is keyed by observation id.
 */
export function useClosureDetail(closureId) {
  const [closure, setClosure] = useState(null);
  const [photograph, setPhotograph] =
    useState("");
  const [photographs, setPhotographs] =
    useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const urlsRef = useRef([]);

  const revokeAll = useCallback(() => {
    urlsRef.current.forEach((url) =>
      URL.revokeObjectURL(url),
    );
    urlsRef.current = [];
  }, []);

  const load = useCallback(async () => {
    if (!closureId) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result =
        await fetchClosureById(closureId);

      const loaded = result?.closure ?? null;
      setClosure(loaded);

      revokeAll();
      setPhotograph("");
      setPhotographs({});

      const reportId =
        loaded?.observationReportId;

      if (reportId) {
        try {
          const blob =
            await fetchObservationPhotograph(
              reportId,
            );

          const url =
            URL.createObjectURL(blob);

          urlsRef.current.push(url);
          setPhotograph(url);
        } catch {
          /* the report is still worth showing without its photo */
          setPhotograph("");
        }

        const observations =
          loaded.observations ?? [];

        if (observations.length > 0) {
          const entries = await Promise.all(
            observations.map((item) =>
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
                .catch(() => [item.id, ""]),
            ),
          );

          setPhotographs(
            Object.fromEntries(entries),
          );
        }
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setClosure(null);
    } finally {
      setLoading(false);
    }
  }, [closureId, revokeAll]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => revokeAll, [revokeAll]);

  return {
    closure,
    photograph,
    photographs,
    loading,
    error,
    reload: load,
  };
}

/**
 * The departments this closure's observations can be assigned to,
 * scoped to its own plant, each with the Action Team HOD the ticket
 * will go to. Loaded once per closure and shared by every observation.
 */
export function useDepartmentOptions(closureId) {
  const [options, setOptions] = useState([]);
  const [plantName, setPlantName] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!closureId) {
      return;
    }

    let cancelled = false;

    setLoading(true);
    setError("");

    fetchDepartmentOptions(closureId)
      .then((result) => {
        if (cancelled) {
          return;
        }

        setOptions(result?.departments ?? []);
        setPlantName(result?.plantName ?? null);
      })
      .catch((requestError) => {
        if (cancelled) {
          return;
        }

        setError(getErrorMessage(requestError));
        setOptions([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [closureId]);

  return {
    options,
    plantName,
    loading,
    error,
  };
}

/**
 * Action plan state for one closure.
 *
 * After a rejection the server returns a null action plan with the
 * target date intact, so the form opens with an empty plan field and
 * the original commitment still in place.
 */
/**
 * One observation's action plan. Each observation is an independent
 * unit — its own plan, its own department, its own ticket — so the form
 * state is per item and keyed to it, and saving one does not touch the
 * others.
 */
export function useClosureItemForm({
  closureId,
  item,
  onSaved,
}) {
  const [values, setValues] = useState({
    actionPlan: "",
    targetDate: "",
    departmentId: "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setValues({
      actionPlan: item?.actionPlan ?? "",
      targetDate: toDateInputValue(
        item?.targetDate,
      ),
      departmentId: item?.departmentId
        ? String(item.departmentId)
        : "",
    });

    setError("");
  }, [
    item?.id,
    item?.actionPlan,
    item?.targetDate,
    item?.departmentId,
  ]);

  const updateField = useCallback(
    (name, value) => {
      setError("");

      if (
        name === "actionPlan" &&
        countWords(value) >
          MAX_ACTION_PLAN_WORDS
      ) {
        setError(
          `Action plan cannot exceed ${MAX_ACTION_PLAN_WORDS} words.`,
        );

        return;
      }

      setValues((current) => ({
        ...current,
        [name]: value,
      }));
    },
    [],
  );

  const save = useCallback(async () => {
    if (saving) {
      return null;
    }

    if (
      !values.actionPlan.trim() ||
      !values.targetDate ||
      !values.departmentId
    ) {
      setError(
        "Complete the action plan, target date, and department for this observation.",
      );

      return null;
    }

    setSaving(true);
    setError("");

    try {
      const result = await saveClosureItem({
        closureId,
        closureItemId: item.id,
        actionPlan: values.actionPlan,
        targetDate: values.targetDate,
        departmentId: values.departmentId,
      });

      await onSaved?.();

      return result;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      return null;
    } finally {
      setSaving(false);
    }
  }, [closureId, item, values, saving, onSaved]);

  return {
    values,
    actionPlanWordCount: countWords(
      values.actionPlan,
    ),
    maxActionPlanWords:
      MAX_ACTION_PLAN_WORDS,
    saving,
    error,
    updateField,
    save,
  };
}

/**
 * Sending the whole closure to the EHS Officer, once every observation
 * has a plan and every department has resolved its ticket.
 */
export function useClosureSubmission({
  closureId,
  onSubmitted,
}) {
  const [submitting, setSubmitting] =
    useState(false);
  const [error, setError] = useState("");

  const sendForApproval =
    useCallback(async () => {
      if (submitting) {
        return null;
      }

      setSubmitting(true);
      setError("");

      try {
        const result =
          await submitClosureReport(closureId);

        await onSubmitted?.();

        return result;
      } catch (requestError) {
        setError(
          getErrorMessage(requestError),
        );
        return null;
      } finally {
        setSubmitting(false);
      }
    }, [closureId, submitting, onSubmitted]);

  return { submitting, error, sendForApproval };
}

/**
 * The EHS Officer's review queue.
 */
export function useApprovalQueue() {
  const [closures, setClosures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result =
        await fetchPendingApprovals();

      setClosures(result?.closures ?? []);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setClosures([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const review = useCallback(
    async (closureId, reviewComments, approve) => {
      if (busy) {
        return null;
      }

      setBusy(true);
      setError("");

      try {
        const result = approve
          ? await approveClosureReport({
              closureId,
              reviewComments,
            })
          : await rejectClosureReport({
              closureId,
              reviewComments,
            });

        await load();
        return result;
      } catch (requestError) {
        setError(getErrorMessage(requestError));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [busy, load],
  );

  return {
    closures,
    loading,
    error,
    busy,
    reload: load,
    approve: (id, comments) =>
      review(id, comments, true),
    reject: (id, comments) =>
      review(id, comments, false),
  };
}
