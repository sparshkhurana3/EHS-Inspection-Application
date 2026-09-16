import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  fetchPlanningLookups,
  schedulePatrol,
} from "./patrol.service.js";

const INITIAL_FORM_VALUES = {
  location: "",
  unit: "",
  zone: "",
  areaDetail: "",
  scheduledDate: "",
  auditorId: "",
  auditeeId: "",
};

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
    "An unexpected audit planning error occurred."
  );
}

function getInitialFormValues() {
  return {
    ...INITIAL_FORM_VALUES,
  };
}

export default function usePatrols() {
  const [formOpen, setFormOpen] =
    useState(false);

  const [formValues, setFormValues] =
    useState(getInitialFormValues);

  const [auditors, setAuditors] =
    useState([]);

  const [auditees, setAuditees] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const [
    scheduledPatrol,
    setScheduledPatrol,
  ] = useState(null);

  const loadPlanningLookups =
    useCallback(async () => {
      setLoading(true);
      setError("");

      try {
        const result =
          await fetchPlanningLookups();

        setAuditors(
          Array.isArray(result?.auditors)
            ? result.auditors
            : [],
        );

        setAuditees(
          Array.isArray(result?.auditees)
            ? result.auditees
            : [],
        );
      } catch (requestError) {
        setAuditors([]);
        setAuditees([]);

        setError(
          getErrorMessage(requestError),
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    loadPlanningLookups();
  }, [loadPlanningLookups]);

  const openForm = useCallback(() => {
    setFormOpen(true);
    setError("");
    setSuccessMessage("");
  }, []);

  const closeForm = useCallback(() => {
    if (submitting) {
      return;
    }

    setFormOpen(false);
    setError("");
  }, [submitting]);

  const updateField = useCallback(
    (fieldName, fieldValue) => {
      setError("");
      setSuccessMessage("");

      setFormValues((currentValues) => {
        switch (fieldName) {
          case "location":
            return {
              ...currentValues,
              location: fieldValue,
            };

          case "unit":
            return {
              ...currentValues,
              unit: fieldValue,
            };

          case "zone":
            return {
              ...currentValues,
              zone: fieldValue,
            };

          case "areaDetail":
            return {
              ...currentValues,
              areaDetail: fieldValue,
            };

          case "scheduledDate":
            return {
              ...currentValues,
              scheduledDate: fieldValue,
            };

          case "auditorId":
            return {
              ...currentValues,
              auditorId: fieldValue,
            };

          case "auditeeId":
            return {
              ...currentValues,
              auditeeId: fieldValue,
            };

          default:
            return currentValues;
        }
      });
    },
    [],
  );

  const validateForm =
    useCallback(() => {
      if (!formValues.location) {
        return "Location is required.";
      }

      if (!formValues.unit) {
        return "Unit is required.";
      }

      if (!formValues.zone) {
        return "Zone is required.";
      }

      if (!formValues.areaDetail) {
        return "Area detail is required.";
      }

      if (!formValues.scheduledDate) {
        return "Scheduled date is required.";
      }

      const selectedDate =
        new Date(
          `${formValues.scheduledDate}T00:00:00`,
        );

      if (
        Number.isNaN(
          selectedDate.getTime(),
        )
      ) {
        return "Select a valid audit date.";
      }

      if (!formValues.auditorId) {
        return "Select an auditor.";
      }

      if (!formValues.auditeeId) {
        return "Select an auditee.";
      }

      if (
        String(formValues.auditorId) ===
        String(formValues.auditeeId)
      ) {
        return (
          "The auditor and auditee must " +
          "be different users."
        );
      }

      return "";
    }, [formValues]);

  const submitSchedule =
    useCallback(async () => {
      if (submitting) {
        return null;
      }

      setError("");
      setSuccessMessage("");

      const validationError =
        validateForm();

      if (validationError) {
        setError(validationError);
        return null;
      }

      setSubmitting(true);

      try {
        const result =
          await schedulePatrol({
            location:
              formValues.location,

            unit:
              formValues.unit,

            zone:
              formValues.zone,

            areaDetail:
              formValues.areaDetail,

            scheduledDate:
              formValues.scheduledDate,

            auditorId:
              Number(
                formValues.auditorId,
              ),

            auditeeId:
              Number(
                formValues.auditeeId,
              ),
          });

        const createdPatrol =
          result?.patrol ?? null;

        setScheduledPatrol(
          createdPatrol,
        );

        setSuccessMessage(
          result?.message ??
            "Audit scheduled successfully.",
        );

        setFormValues(
          getInitialFormValues(),
        );

        setFormOpen(false);

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
      formValues,
      submitting,
      validateForm,
    ]);

  return {
    formOpen,
    formValues,
    auditors,
    auditees,
    scheduledPatrol,
    loading,
    submitting,
    error,
    successMessage,

    openForm,
    closeForm,
    updateField,
    submitSchedule,
    reloadLookups:
      loadPlanningLookups,
  };
}