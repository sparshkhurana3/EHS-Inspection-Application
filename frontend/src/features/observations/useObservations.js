import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  createObservationReport,
  fetchCurrentObservationAssignment,
} from "./observation.service.js";

const MAX_IMAGE_SIZE =
  10 * 1024 * 1024;

const MAX_DESCRIPTION_WORDS = 500;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/svg+xml",
]);

const PERMITTED_FORM_FIELDS = new Set([
  "findingDate",
  "location",
  "category",
  "description",
  "riskCategory",
]);

const INITIAL_FORM_VALUES = {
  findingDate: "",
  location: "",
  category: "",
  photograph: null,
  photographPreview: "",
  description: "",
  riskCategory: "",
};

function getLocalDateValue() {
  const date = new Date();

  const year =
    date.getFullYear();

  const month =
    String(date.getMonth() + 1)
      .padStart(2, "0");

  const day =
    String(date.getDate())
      .padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function countWords(value) {
  const trimmedValue =
    String(value ?? "").trim();

  if (!trimmedValue) {
    return 0;
  }

  return trimmedValue
    .split(/\s+/)
    .filter(Boolean)
    .length;
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
      .map((detail) => detail.message)
      .filter(Boolean)
      .join(" ");
  }

  return (
    error?.message ??
    "An unexpected observation error occurred."
  );
}

function revokePreview(previewUrl) {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
  }
}

export default function useObservations() {
  const [
    assignment,
    setAssignment,
  ] = useState(null);

  const [
    existingReport,
    setExistingReport,
  ] = useState(null);

  const [
    formValues,
    setFormValues,
  ] = useState({
    ...INITIAL_FORM_VALUES,
    findingDate: getLocalDateValue(),
  });

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

  const photographPreviewRef =
    useRef("");

  const loadCurrentAssignment =
    useCallback(async () => {
      setLoading(true);
      setError("");
      setSuccessMessage("");

      try {
        const result =
          await fetchCurrentObservationAssignment();

        const currentAssignment =
          result?.assignment ?? null;

        const currentReport =
          result?.report ?? null;

        setAssignment(currentAssignment);
        setExistingReport(currentReport);

        setFormValues((currentValues) => ({
          ...currentValues,

          findingDate:
            currentValues.findingDate ||
            getLocalDateValue(),

          location:
            currentAssignment?.plantLocation ??
            currentAssignment?.plant_location ??
            currentValues.location,
        }));
      } catch (requestError) {
        setAssignment(null);
        setExistingReport(null);

        setError(
          getErrorMessage(requestError),
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    loadCurrentAssignment();
  }, [loadCurrentAssignment]);

  useEffect(() => {
    photographPreviewRef.current =
      formValues.photographPreview;
  }, [formValues.photographPreview]);

  useEffect(() => {
    return () => {
      revokePreview(
        photographPreviewRef.current,
      );
    };
  }, []);

  /**
   * Updates a text, date, or dropdown field.
   */
  const updateField = useCallback(
  (fieldName, fieldValue) => {
    setError("");
    setSuccessMessage("");

    if (fieldName === "description") {
      const wordCount =
        countWords(fieldValue);

      if (
        wordCount >
        MAX_DESCRIPTION_WORDS
      ) {
        setError(
          `Observation description cannot exceed ${MAX_DESCRIPTION_WORDS} words.`,
        );

        return;
      }
    }

    setFormValues((currentValues) => {
      switch (fieldName) {
        case "findingDate":
          return {
            ...currentValues,
            findingDate: fieldValue,
          };

        case "location":
          return {
            ...currentValues,
            location: fieldValue,
          };

        case "category":
          return {
            ...currentValues,
            category: fieldValue,
          };

        case "description":
          return {
            ...currentValues,
            description: fieldValue,
          };

        case "riskCategory":
          return {
            ...currentValues,
            riskCategory: fieldValue,
          };

        default:
          setError(
            `The field "${fieldName}" cannot be updated.`,
          );

          return currentValues;
      }
    });
  },
  [],
  );

  /**
   * Validates and stores the selected photograph.
   */
  const updatePhotograph = useCallback(
    (file) => {
      setError("");
      setSuccessMessage("");

      if (!file) {
        return;
      }

      if (
        !ALLOWED_IMAGE_TYPES.has(
          file.type,
        )
      ) {
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

      setFormValues(
        (currentValues) => {
          revokePreview(
            currentValues
              .photographPreview,
          );

          const photographPreview =
            URL.createObjectURL(file);

          return {
            ...currentValues,
            photograph: file,
            photographPreview,
          };
        },
      );
    },
    [],
  );

  /**
   * Removes the selected photograph and its preview.
   */
  const removePhotograph =
    useCallback(() => {
      setFormValues(
        (currentValues) => {
          revokePreview(
            currentValues
              .photographPreview,
          );

          return {
            ...currentValues,
            photograph: null,
            photographPreview: "",
          };
        }
      );

      setError("");
      setSuccessMessage("");
    }, []);

  /**
   * Validates the observation form before submission.
   */
  const validateForm =
    useCallback(() => {
      if (!assignment?.id) {
        return (
          "There is no current weekly " +
          "patrol assignment available."
        );
      }

      if (existingReport) {
        return (
          "An observation report has already " +
          "been created for this patrol."
        );
      }

      if (!formValues.findingDate) {
        return "Finding date is required.";
      }

      if (!formValues.location) {
        return "Select the plant location.";
      }

      if (
        !["UA", "UC"].includes(
          formValues.category,
        )
      ) {
        return (
          "Select UA or UC as the " +
          "observation category."
        );
      }

      if (!formValues.photograph) {
        return (
          "Add a photograph of the " +
          "observation."
        );
      }

      if (
        !ALLOWED_IMAGE_TYPES.has(
          formValues.photograph.type,
        )
      ) {
        return (
          "The selected photograph format " +
          "is not supported."
        );
      }

      if (
        formValues.photograph.size >
        MAX_IMAGE_SIZE
      ) {
        return (
          "The observation photograph " +
          "must be 10 MB or smaller."
        );
      }

      if (
        !formValues.description.trim()
      ) {
        return (
          "Enter the observation " +
          "description."
        );
      }

      if (
        countWords(
          formValues.description,
        ) > MAX_DESCRIPTION_WORDS
      ) {
        return (
          "Observation description cannot " +
          `exceed ${MAX_DESCRIPTION_WORDS} words.`
        );
      }

      if (
        ![
          "HIGH",
          "MEDIUM",
          "LOW",
        ].includes(
          formValues.riskCategory,
        )
      ) {
        return "Select a risk category.";
      }

      return "";
    }, [
      assignment,
      existingReport,
      formValues,
    ]);

  /**
   * Sends the observation report to the backend.
   */
  const submitObservation =
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
          await createObservationReport({
            patrolId: assignment.id,

            findingDate:
              formValues.findingDate,

            location:
              formValues.location,

            category:
              formValues.category,

            photograph:
              formValues.photograph,

            description:
              formValues.description,

            riskCategory:
              formValues.riskCategory,
          });

        setSuccessMessage(
          result?.message ??
            "Observation Sent Successfully!",
        );

        setExistingReport(
          result?.report ?? {
            id: result?.reportId ?? null,

            status:
              "PENDING_AUDITEE_ACTION",

            displayStatus:
              "In Progress",

            submittedAt:
              new Date().toISOString(),
          },
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
      assignment,
      formValues,
      submitting,
      validateForm,
    ]);

  return {
    assignment,
    existingReport,
    formValues,

    descriptionWordCount:
      countWords(
        formValues.description,
      ),

    maxDescriptionWords:
      MAX_DESCRIPTION_WORDS,

    loading,
    submitting,
    error,
    successMessage,

    updateField,
    updatePhotograph,
    removePhotograph,
    submitObservation,

    reload:
      loadCurrentAssignment,
  };
}