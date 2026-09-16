import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  approveClosureReport,
  fetchAuditeeClosures,
  fetchClosureById,
  fetchPendingApprovals,
  rejectClosureReport,
  saveClosureActionPlan,
  submitClosureReport,
} from "./closure.service.js";

import {
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
 * One closure with its photograph, for the detail and form views.
 */
export function useClosureDetail(closureId) {
  const [closure, setClosure] = useState(null);
  const [photograph, setPhotograph] =
    useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const previewRef = useRef("");

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

      if (loaded?.observationReportId) {
        try {
          const blob =
            await fetchObservationPhotograph(
              loaded.observationReportId,
            );

          if (previewRef.current) {
            URL.revokeObjectURL(
              previewRef.current,
            );
          }

          const url =
            URL.createObjectURL(blob);

          previewRef.current = url;
          setPhotograph(url);
        } catch {
          /* the report is still worth showing without its photo */
          setPhotograph("");
        }
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setClosure(null);
    } finally {
      setLoading(false);
    }
  }, [closureId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(
    () => () => {
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current);
        previewRef.current = "";
      }
    },
    [],
  );

  return {
    closure,
    photograph,
    loading,
    error,
    reload: load,
  };
}

/**
 * Action plan state for one closure.
 *
 * After a rejection the server returns a null action plan with the
 * target date intact, so the form opens with an empty plan field and
 * the original commitment still in place.
 */
export function useClosureForm(closure) {
  const [values, setValues] = useState({
    actionPlan: "",
    targetDate: "",
    responsibleHodName: "",
  });

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] =
    useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setValues({
      actionPlan: closure?.actionPlan ?? "",
      targetDate: toDateInputValue(
        closure?.targetDate,
      ),
      responsibleHodName:
        closure?.responsibleHodName ?? "",
    });

    setError("");
  }, [
    closure?.id,
    closure?.actionPlan,
    closure?.targetDate,
    closure?.responsibleHodName,
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

      /*
       * This used to spread a variable named fieldValue, creating a key
       * literally called "fieldValue", so the controlled inputs could
       * never be typed into.
       */
      setValues((current) => ({
        ...current,
        [name]: value,
      }));
    },
    [],
  );

  const save = useCallback(async () => {
    if (saving || submitting) {
      return null;
    }

    if (
      !values.actionPlan.trim() ||
      !values.targetDate ||
      !values.responsibleHodName.trim()
    ) {
      setError(
        "Complete the action plan, target date, and responsible HOD name.",
      );

      return null;
    }

    setSaving(true);
    setError("");

    try {
      return await saveClosureActionPlan({
        closureId: closure.id,
        actionPlan: values.actionPlan,
        targetDate: values.targetDate,
        responsibleHodName:
          values.responsibleHodName,
      });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      return null;
    } finally {
      setSaving(false);
    }
  }, [closure, values, saving, submitting]);

  const sendForApproval = useCallback(async () => {
    if (saving || submitting) {
      return null;
    }

    setSubmitting(true);
    setError("");

    try {
      return await submitClosureReport(
        closure.id,
      );
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      return null;
    } finally {
      setSubmitting(false);
    }
  }, [closure, saving, submitting]);

  return {
    values,
    actionPlanWordCount: countWords(
      values.actionPlan,
    ),
    maxActionPlanWords:
      MAX_ACTION_PLAN_WORDS,
    saving,
    submitting,
    error,
    updateField,
    save,
    sendForApproval,
  };
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
