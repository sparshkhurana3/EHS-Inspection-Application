import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  approveClosureReport,
  deleteClosureEvidence,
  fetchAuditeeClosures,
  fetchClosureById,
  fetchClosureEvidenceBlob,
  fetchPendingApprovals,
  rejectClosureReport,
  saveClosureItem,
  submitClosureReport,
  uploadClosureEvidence,
} from "./closure.service.js";

import {
  fetchObservationItemPhotograph,
  fetchObservationPhotograph,
} from "../observations/observation.service.js";

import {
  getErrorMessage,
} from "../../lib/errorMessage.js";

export const MAX_ACTION_PLAN_WORDS = 255;

export const MAX_EVIDENCE_FILES = 3;

const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

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
 * One observation's action plan. Each observation is an independent
 * unit with its own plan and its own evidence, so the form state is per
 * item and keyed to it, and saving one does not touch the others.
 */
export function useClosureItemForm({
  closureId,
  item,
  onSaved,
}) {
  const [values, setValues] = useState({
    actionPlan: "",
    targetDate: "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setValues({
      actionPlan: item?.actionPlan ?? "",
      targetDate: toDateInputValue(
        item?.targetDate,
      ),
    });

    setError("");
  }, [
    item?.id,
    item?.actionPlan,
    item?.targetDate,
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
      !values.targetDate
    ) {
      setError(
        "Complete the action plan and target date for this observation.",
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
 * The evidence photographs on one observation: attaching, removing,
 * and getting a viewable URL for each.
 *
 * The photographs come from an authenticated route, so they cannot be
 * used directly as an <img src>. Each is fetched as a blob once and
 * held as an object URL, which is revoked when the component goes away
 * so the browser can release the memory.
 */
export function useClosureEvidence({
  closureId,
  item,
  onChanged,
}) {
  const [previews, setPreviews] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const evidence = item?.evidence ?? [];

  /*
   * Compared as a string so the effect re-runs when a photograph is
   * added or removed, but not on every re-render that rebuilds an
   * equivalent array.
   */
  const evidenceKey = evidence
    .map((entry) => entry.id)
    .join(",");

  useEffect(() => {
    if (!closureId || !item?.id) {
      return undefined;
    }

    let cancelled = false;
    const objectUrls = [];

    Promise.all(
      evidence.map(async (entry) => {
        try {
          const blob =
            await fetchClosureEvidenceBlob({
              closureId,
              closureItemId: item.id,
              evidenceId: entry.id,
            });

          const url =
            URL.createObjectURL(blob);

          objectUrls.push(url);

          return [entry.id, url];
        } catch {
          /*
           * One photograph failing to load must not blank the others,
           * so it is simply left without a preview.
           */
          return null;
        }
      }),
    ).then((entries) => {
      if (cancelled) {
        objectUrls.forEach((url) =>
          URL.revokeObjectURL(url),
        );

        return;
      }

      setPreviews(
        Object.fromEntries(
          entries.filter(Boolean),
        ),
      );
    });

    return () => {
      cancelled = true;

      objectUrls.forEach((url) =>
        URL.revokeObjectURL(url),
      );
    };
  }, [closureId, item?.id, evidenceKey]);

  const upload = useCallback(
    async (fileList) => {
      const files = Array.from(
        fileList ?? [],
      );

      if (files.length === 0 || busy) {
        return;
      }

      /*
       * Checked here as well as on the server so somebody who picks
       * ten photographs is told immediately, rather than after
       * uploading them all.
       */
      const room =
        MAX_EVIDENCE_FILES - evidence.length;

      if (files.length > room) {
        setError(
          room === 0
            ? `This observation already has ${MAX_EVIDENCE_FILES} photographs.`
            : `Only ${room} more photograph${
                room === 1 ? "" : "s"
              } can be attached to this observation.`,
        );

        return;
      }

      const tooLarge = files.find(
        (file) =>
          file.size > MAX_EVIDENCE_BYTES,
      );

      if (tooLarge) {
        setError(
          `${tooLarge.name} is larger than 10 MB.`,
        );

        return;
      }

      setBusy(true);
      setError("");

      try {
        await uploadClosureEvidence({
          closureId,
          closureItemId: item.id,
          files,
        });

        await onChanged?.();
      } catch (requestError) {
        setError(
          getErrorMessage(requestError),
        );
      } finally {
        setBusy(false);
      }
    },
    [
      closureId,
      item?.id,
      evidence.length,
      busy,
      onChanged,
    ],
  );

  const remove = useCallback(
    async (evidenceId) => {
      if (busy) {
        return;
      }

      setBusy(true);
      setError("");

      try {
        await deleteClosureEvidence({
          closureId,
          closureItemId: item.id,
          evidenceId,
        });

        await onChanged?.();
      } catch (requestError) {
        setError(
          getErrorMessage(requestError),
        );
      } finally {
        setBusy(false);
      }
    },
    [closureId, item?.id, busy, onChanged],
  );

  return {
    evidence,
    previews,
    busy,
    error,
    maxFiles: MAX_EVIDENCE_FILES,
    remainingSlots:
      MAX_EVIDENCE_FILES - evidence.length,
    upload,
    remove,
  };
}

/**
 * Sending the whole closure to the EHS Officer, once every observation
 * has an action plan.
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
