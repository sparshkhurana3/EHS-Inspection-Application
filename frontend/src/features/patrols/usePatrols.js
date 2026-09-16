import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  fetchPlanningLookups,
  schedulePatrol,
} from "./patrol.service.js";

import {
  getErrorMessage,
} from "../../lib/errorMessage.js";

const EMPTY_FORM = {
  unitId: "",
  zoneId: "",
  scheduledDate: "",
  auditorId: "",
  auditeeId: "",
};

/**
 * Planning state for the signed-in EHS Officer.
 *
 * Everything selectable comes from the API, which scopes it to the
 * officer's own location. Nothing about which cities, units, zones or
 * areas exist is held in the frontend.
 */
export default function usePatrols() {
  const [lookups, setLookups] = useState({
    location: null,
    units: [],
    zones: [],
    users: [],
  });

  const [formOpen, setFormOpen] =
    useState(false);
  const [values, setValues] =
    useState(EMPTY_FORM);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] =
    useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] =
    useState("");
  const [scheduledPatrol, setScheduledPatrol] =
    useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result =
        await fetchPlanningLookups();

      setLookups({
        location: result?.location ?? null,
        units: result?.units ?? [],
        zones: result?.zones ?? [],
        users: result?.users ?? [],
      });
    } catch (requestError) {
      setError(getErrorMessage(requestError));

      setLookups({
        location: null,
        units: [],
        zones: [],
        users: [],
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /*
   * Each level narrows the next, so changing one resets everything
   * below it. Without this a stale zone from a different unit could be
   * submitted.
   */
  const updateField = useCallback(
    (name, value) => {
      setError("");
      setSuccessMessage("");

      setValues((current) => {
        if (name === "unitId") {
          return {
            ...current,
            unitId: value,
            zoneId: "",
          };
        }

        if (name === "auditorId") {
          return {
            ...current,
            auditorId: value,
            auditeeId:
              current.auditeeId === value
                ? ""
                : current.auditeeId,
          };
        }

        return { ...current, [name]: value };
      });
    },
    [],
  );

  const zonesForUnit = lookups.zones.filter(
    (zone) =>
      String(zone.unitId) ===
      String(values.unitId),
  );

  const selectedZone =
    zonesForUnit.find(
      (zone) =>
        String(zone.id) ===
        String(values.zoneId),
    ) ?? null;

  function validate() {
    if (!values.unitId) {
      return "Select the unit.";
    }

    if (!values.zoneId) {
      return "Select the zone.";
    }

    if (!values.scheduledDate) {
      return "Select the audit date.";
    }

    if (!values.auditorId) {
      return "Select the auditor.";
    }

    if (!values.auditeeId) {
      return "Select the auditee.";
    }

    if (
      String(values.auditorId) ===
      String(values.auditeeId)
    ) {
      return "The auditor and auditee must be different users.";
    }

    if (
      (selectedZone?.areas ?? []).length === 0
    ) {
      return "The selected zone has no areas configured, so an audit cannot be scheduled for it.";
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
    setSuccessMessage("");

    try {
      const result = await schedulePatrol(values);

      setScheduledPatrol(
        result?.patrol ?? null,
      );

      setSuccessMessage(
        result?.message ??
          "Audit scheduled successfully.",
      );

      setValues(EMPTY_FORM);
      setFormOpen(false);

      return result;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      return null;
    } finally {
      setSubmitting(false);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [values, submitting, selectedZone]);

  return {
    ...lookups,
    zonesForUnit,
    selectedZone,
    values,
    formOpen,
    loading,
    submitting,
    error,
    successMessage,
    scheduledPatrol,
    openForm: () => setFormOpen(true),
    closeForm: () => {
      setFormOpen(false);
      setValues(EMPTY_FORM);
      setError("");
    },
    updateField,
    submit,
    reload: load,
  };
}
