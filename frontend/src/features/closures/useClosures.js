import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import useAuth
  from "../auth/useAuth.js";

import {
  approveClosureReport,
  fetchCurrentClosure,
  fetchObservationPhotograph,
  fetchPendingApprovals,
  rejectClosureReport,
  saveClosureActionPlan,
  submitClosureReport,
} from "./closure.service.js";

const MAX_ACTION_PLAN_WORDS = 255;

const INITIAL_FORM_VALUES = {
  actionPlan: "",
  targetDate: "",
  responsibleHodName: "",
};

function normalizeRole(role) {
  if (typeof role === "string") {
    return role
      .trim()
      .toUpperCase();
  }

  return String(
    role?.code ??
    role?.roleCode ??
    role?.role_code ??
    role?.name ??
    "",
  )
    .trim()
    .toUpperCase();
}

function getUserRoles(user) {
  const roleValue =
    user?.roles ??
    user?.roleCodes ??
    user?.role_codes ??
    user?.appRoles ??
    user?.app_roles ??
    [];

  if (Array.isArray(roleValue)) {
    return roleValue
      .map(normalizeRole)
      .filter(Boolean);
  }

  if (typeof roleValue === "string") {
    return roleValue
      .split(",")
      .map((role) => {
        return role
          .trim()
          .toUpperCase();
      })
      .filter(Boolean);
  }

  return [];
}

function hasRole(user, roleCode) {
  return getUserRoles(user).includes(
    String(roleCode ?? "")
      .trim()
      .toUpperCase(),
  );
}

function countWords(value) {
  const normalizedValue =
    String(value ?? "").trim();

  if (!normalizedValue) {
    return 0;
  }

  return normalizedValue
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function getDateInputValue(dateValue) {
  if (!dateValue) {
    return "";
  }

  return String(dateValue).slice(0, 10);
}

function getErrorMessage(error) {
  if (
    error instanceof TypeError &&
    error.message === "Failed to fetch"
  ) {
    return (
      "Unable to connect to the EHS API. " +
      "Check that the backend is running."
    );
  }

  if (
    Array.isArray(error?.details) &&
    error.details.length > 0
  ) {
    return error.details
      .map((detail) => {
        return (
          detail?.message ??
          detail?.msg
        );
      })
      .filter(Boolean)
      .join(" ");
  }

  return (
    error?.message ??
    "An unexpected closure error occurred."
  );
}

function getClosureId(closure) {
  return (
    closure?.id ??
    closure?.closureId ??
    closure?.closure_id ??
    null
  );
}

function getReportId(closure) {
  return (
    closure?.observationReportId ??
    closure?.observation_report_id ??
    null
  );
}

function createFormValues(closure) {
  return {
    actionPlan:
      closure?.actionPlan ??
      closure?.action_plan ??
      "",

    targetDate:
      getDateInputValue(
        closure?.targetDate ??
        closure?.target_date,
      ),

    responsibleHodName:
      closure?.responsibleHodName ??
      closure?.responsible_hod_name ??
      "",
  };
}

export default function useClosures() {
  const {
    user,
  } = useAuth();

  const isEhsOfficer =
    hasRole(
      user,
      "EHS_OFFICER",
    );

  const [closure, setClosure] =
    useState(null);

  const [
    pendingApprovals,
    setPendingApprovals,
  ] = useState([]);

  const [
    selectedApprovalId,
    setSelectedApprovalId,
  ] = useState(null);

  const [formValues, setFormValues] =
    useState(INITIAL_FORM_VALUES);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  const [approving, setApproving] =
    useState(false);

  const [rejecting, setRejecting] =
    useState(false);

  const [error, setError] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const [
    photographPreview,
    setPhotographPreview,
  ] = useState("");

  const [
    photographLoading,
    setPhotographLoading,
  ] = useState(false);

  const [
    photographError,
    setPhotographError,
  ] = useState("");

  const photographPreviewRef =
    useRef("");

  const clearPhotographPreview =
    useCallback(() => {
      if (
        photographPreviewRef.current
      ) {
        URL.revokeObjectURL(
          photographPreviewRef.current,
        );

        photographPreviewRef.current = "";
      }

      setPhotographPreview("");
      setPhotographError("");
    }, []);

  const loadPhotograph =
    useCallback(
      async (currentClosure) => {
        clearPhotographPreview();

        const reportId =
          getReportId(
            currentClosure,
          );

        const hasPhotograph =
          Boolean(
            currentClosure
              ?.photographPath ??
            currentClosure
              ?.photograph_path ??
            currentClosure
              ?.photographOriginalName ??
            currentClosure
              ?.photograph_original_name,
          );

        if (
          !reportId ||
          !hasPhotograph
        ) {
          return;
        }

        setPhotographLoading(true);

        try {
          const photographBlob =
            await fetchObservationPhotograph(
              reportId,
            );

          const previewUrl =
            URL.createObjectURL(
              photographBlob,
            );

          photographPreviewRef.current =
            previewUrl;

          setPhotographPreview(
            previewUrl,
          );
        } catch (requestError) {
          setPhotographError(
            getErrorMessage(
              requestError,
            ),
          );
        } finally {
          setPhotographLoading(false);
        }
      },
      [clearPhotographPreview],
    );

  const loadClosures =
    useCallback(async () => {
      setLoading(true);
      setError("");
      setSuccessMessage("");

      try {
        if (isEhsOfficer) {
          const result =
            await fetchPendingApprovals();

          const approvals =
            Array.isArray(
              result?.closures,
            )
              ? result.closures
              : [];

          setPendingApprovals(
            approvals,
          );

          const selectedClosure =
            approvals.find(
              (item) => {
                return (
                  String(
                    getClosureId(item),
                  ) ===
                  String(
                    selectedApprovalId,
                  )
                );
              },
            ) ??
            approvals[0] ??
            null;

          setClosure(
            selectedClosure,
          );

          setSelectedApprovalId(
            getClosureId(
              selectedClosure,
            ),
          );

          setFormValues(
            createFormValues(
              selectedClosure,
            ),
          );

          await loadPhotograph(
            selectedClosure,
          );

          return;
        }

        const result =
          await fetchCurrentClosure();

        const currentClosure =
          result?.closure ?? null;

        setClosure(currentClosure);
        setPendingApprovals([]);
        setFormValues(
          createFormValues(
            currentClosure,
          ),
        );

        await loadPhotograph(
          currentClosure,
        );
      } catch (requestError) {
        setClosure(null);
        setPendingApprovals([]);

        setError(
          getErrorMessage(requestError),
        );
      } finally {
        setLoading(false);
      }
    }, [
      isEhsOfficer,
      loadPhotograph,
      selectedApprovalId,
    ]);

  useEffect(() => {
    loadClosures();
  }, [loadClosures]);

  useEffect(() => {
    return () => {
      if (
        photographPreviewRef.current
      ) {
        URL.revokeObjectURL(
          photographPreviewRef.current,
        );
      }
    };
  }, []);

  const selectApproval =
    useCallback(
      async (closureId) => {
        const selectedClosure =
          pendingApprovals.find(
            (item) => {
              return (
                String(
                  getClosureId(item),
                ) ===
                String(closureId)
              );
            },
          );

        if (!selectedClosure) {
          return;
        }

        setSelectedApprovalId(
          closureId,
        );

        setClosure(
          selectedClosure,
        );

        setFormValues(
          createFormValues(
            selectedClosure,
          ),
        );

        setError("");
        setSuccessMessage("");

        await loadPhotograph(
          selectedClosure,
        );
      },
      [
        loadPhotograph,
        pendingApprovals,
      ],
    );

  const updateField = useCallback(
    (fieldName, fieldValue) => {
      setError("");
      setSuccessMessage("");

      if (
        fieldName ===
          "actionPlan" &&
        countWords(fieldValue) >
          MAX_ACTION_PLAN_WORDS
      ) {
        setError(
          "Action plan cannot exceed 255 words.",
        );

        return;
      }

      setFormValues(
        (currentValues) => ({
          ...currentValues,
          fieldValue,
        }),
      );
    },
    [],
  );

  const saveActionPlan =
    useCallback(async () => {
      if (
        saving ||
        submitting
      ) {
        return null;
      }

      const closureId =
        getClosureId(closure);

      if (!closureId) {
        setError(
          "No closure assignment is available.",
        );

        return null;
      }

      if (
        !formValues.actionPlan.trim() ||
        !formValues.targetDate ||
        !formValues
          .responsibleHodName
          .trim()
      ) {
        setError(
          "Complete the action plan, target date, and responsible HOD name.",
        );

        return null;
      }

      setSaving(true);
      setError("");
      setSuccessMessage("");

      try {
        const result =
          await saveClosureActionPlan({
            closureId,

            actionPlan:
              formValues
                .actionPlan
                .trim(),

            targetDate:
              formValues.targetDate,

            responsibleHodName:
              formValues
                .responsibleHodName
                .trim(),
          });

        const updatedClosure =
          result?.closure ?? closure;

        setClosure(
          updatedClosure,
        );

        setFormValues(
          createFormValues(
            updatedClosure,
          ),
        );

        setSuccessMessage(
          result?.message ??
            "Action plan saved successfully.",
        );

        return result;
      } catch (requestError) {
        setError(
          getErrorMessage(requestError),
        );

        return null;
      } finally {
        setSaving(false);
      }
    }, [
      closure,
      formValues,
      saving,
      submitting,
    ]);

  const sendForClosure =
    useCallback(async () => {
      if (
        saving ||
        submitting
      ) {
        return null;
      }

      const closureId =
        getClosureId(closure);

      if (!closureId) {
        setError(
          "No closure assignment is available.",
        );

        return null;
      }

      setSubmitting(true);
      setError("");
      setSuccessMessage("");

      try {
        const result =
          await submitClosureReport({
            closureId,
          });

        setClosure(
          result?.closure ??
          closure,
        );

        setSuccessMessage(
          result?.message ??
            "Report sent for closure successfully.",
        );

        return result;
      } catch (requestError) {
        setError(
          getErrorMessage(requestError),
        );

        return null;
      } finally {
        setSubmitting(false);
      }
    }, [
      closure,
      saving,
      submitting,
    ]);

  const approveClosure =
    useCallback(
      async ({
        reviewComments,
      } = {}) => {
        if (
          approving ||
          rejecting
        ) {
          return null;
        }

        const closureId =
          getClosureId(closure);

        if (!closureId) {
          setError(
            "No closure report is selected.",
          );

          return null;
        }

        setApproving(true);
        setError("");
        setSuccessMessage("");

        try {
          const result =
            await approveClosureReport({
              closureId,

              reviewComments:
                String(
                  reviewComments ?? "",
                ).trim(),
            });

          setPendingApprovals(
            (currentApprovals) => {
              return currentApprovals.filter(
                (item) => {
                  return (
                    String(
                      getClosureId(item),
                    ) !==
                    String(closureId)
                  );
                },
              );
            },
          );

          setClosure(null);
          setSelectedApprovalId(null);

          setSuccessMessage(
            result?.message ??
              "Closure approved successfully.",
          );

          await loadClosures();

          return result;
        } catch (requestError) {
          setError(
            getErrorMessage(
              requestError,
            ),
          );

          return null;
        } finally {
          setApproving(false);
        }
      },
      [
        approving,
        closure,
        loadClosures,
        rejecting,
      ],
    );

  const rejectClosure =
    useCallback(
      async ({
        reviewComments,
      } = {}) => {
        if (
          approving ||
          rejecting
        ) {
          return null;
        }

        const normalizedComments =
          String(
            reviewComments ?? "",
          ).trim();

        if (!normalizedComments) {
          setError(
            "Review comments are required when sending the report back.",
          );

          return null;
        }

        const closureId =
          getClosureId(closure);

        if (!closureId) {
          setError(
            "No closure report is selected.",
          );

          return null;
        }

        setRejecting(true);
        setError("");
        setSuccessMessage("");

        try {
          const result =
            await rejectClosureReport({
              closureId,

              reviewComments:
                normalizedComments,
            });

          setPendingApprovals(
            (currentApprovals) => {
              return currentApprovals.filter(
                (item) => {
                  return (
                    String(
                      getClosureId(item),
                    ) !==
                    String(closureId)
                  );
                },
              );
            },
          );

          setClosure(null);
          setSelectedApprovalId(null);

          setSuccessMessage(
            result?.message ??
              "Closure report sent back for re-examination.",
          );

          await loadClosures();

          return result;
        } catch (requestError) {
          setError(
            getErrorMessage(
              requestError,
            ),
          );

          return null;
        } finally {
          setRejecting(false);
        }
      },
      [
        approving,
        closure,
        loadClosures,
        rejecting,
      ],
    );

  return {
    isEhsOfficer,

    closure,
    pendingApprovals,
    selectedApprovalId,
    formValues,

    photographPreview,
    photographLoading,
    photographError,

    actionPlanWordCount:
      countWords(
        formValues.actionPlan,
      ),

    maxActionPlanWords:
      MAX_ACTION_PLAN_WORDS,

    loading,
    saving,
    submitting,
    approving,
    rejecting,
    error,
    successMessage,

    selectApproval,
    updateField,
    saveActionPlan,
    sendForClosure,
    approveClosure,
    rejectClosure,
    reload: loadClosures,
  };
}
