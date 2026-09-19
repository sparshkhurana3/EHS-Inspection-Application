import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  acceptTicket,
  closeTicket,
  deleteTicketEvidence,
  fetchHodTickets,
  fetchTicketById,
  fetchTicketEvidenceBlob,
  fetchTicketLookups,
  rejectTicket,
  uploadTicketEvidence,
} from "./ticket.service.js";

import {
  fetchObservationPhotograph,
} from "../observations/observation.service.js";

import {
  getErrorMessage,
} from "../../lib/errorMessage.js";

const MAX_EVIDENCE_FILES = 3;
const MAX_EVIDENCE_FILE_SIZE =
  10 * 1024 * 1024;

const ALLOWED_EVIDENCE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/svg+xml",
]);

/**
 * The Action Team HOD's Ticket page: open, in progress, and closed in
 * the last 30 days.
 */
export function useHodTickets() {
  const [data, setData] = useState({
    open: [],
    inProgress: [],
    closed: [],
    openCount: 0,
    inProgressCount: 0,
    closedCount: 0,
    closedWindowDays: 30,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await fetchHodTickets();

      setData({
        open: result?.open ?? [],
        inProgress: result?.inProgress ?? [],
        closed: result?.closed ?? [],
        openCount: result?.openCount ?? 0,
        inProgressCount:
          result?.inProgressCount ?? 0,
        closedCount:
          result?.closedCount ?? 0,
        closedWindowDays:
          result?.closedWindowDays ?? 30,
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
 * The corrective-action type lookups for the accept form's dropdown.
 */
export function useTicketLookups() {
  const [correctiveActionTypes, setTypes] =
    useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchTicketLookups()
      .then((result) => {
        if (!cancelled) {
          setTypes(
            result?.correctiveActionTypes ?? [],
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTypes([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { correctiveActionTypes, loading };
}

/**
 * One ticket, its observation photograph, and its evidence
 * photographs, all as blob object URLs (each is served through an
 * authenticated route, so a plain <img src> cannot be used).
 */
export function useTicketDetail(ticketId) {
  const [ticket, setTicket] = useState(null);
  const [photograph, setPhotograph] =
    useState("");
  const [evidenceUrls, setEvidenceUrls] =
    useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const objectUrlsRef = useRef([]);

  const revokeAll = useCallback(() => {
    objectUrlsRef.current.forEach((url) =>
      URL.revokeObjectURL(url),
    );
    objectUrlsRef.current = [];
  }, []);

  const load = useCallback(async () => {
    if (!ticketId) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result =
        await fetchTicketById(ticketId);

      const loaded = result?.ticket ?? null;
      setTicket(loaded);

      revokeAll();
      setPhotograph("");
      setEvidenceUrls({});

      if (loaded?.observationReportId) {
        try {
          const blob =
            await fetchObservationPhotograph(
              loaded.observationReportId,
            );

          const url =
            URL.createObjectURL(blob);

          objectUrlsRef.current.push(url);
          setPhotograph(url);
        } catch {
          setPhotograph("");
        }
      }

      const evidence = loaded?.evidence ?? [];

      if (evidence.length > 0) {
        const entries = await Promise.all(
          evidence.map((item) =>
            fetchTicketEvidenceBlob({
              ticketId: loaded.id,
              evidenceId: item.id,
            })
              .then((blob) => {
                const url =
                  URL.createObjectURL(blob);

                objectUrlsRef.current.push(
                  url,
                );

                return [item.id, url];
              })
              .catch(() => [item.id, null]),
          ),
        );

        setEvidenceUrls(
          Object.fromEntries(entries),
        );
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setTicket(null);
    } finally {
      setLoading(false);
    }
  }, [ticketId, revokeAll]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => revokeAll, [revokeAll]);

  return {
    ticket,
    photograph,
    evidenceUrls,
    loading,
    error,
    reload: load,
  };
}

/**
 * Accept or reject state for one ticket's decision form.
 */
export function useTicketDecision(ticket, onChanged) {
  const [comments, setComments] = useState("");
  const [
    correctiveActionTypeId,
    setCorrectiveActionTypeId,
  ] = useState("");
  const [submitting, setSubmitting] =
    useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setComments("");
    setCorrectiveActionTypeId("");
    setError("");
  }, [ticket?.id]);

  const accept = useCallback(async () => {
    if (submitting) {
      return null;
    }

    if (!comments.trim()) {
      setError("Comments are required.");
      return null;
    }

    if (!correctiveActionTypeId) {
      setError(
        "Select the type of corrective action.",
      );
      return null;
    }

    setSubmitting(true);
    setError("");

    try {
      const result = await acceptTicket({
        ticketId: ticket.id,
        comments,
        correctiveActionTypeId,
      });

      onChanged?.();
      return result;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      return null;
    } finally {
      setSubmitting(false);
    }
  }, [
    ticket,
    comments,
    correctiveActionTypeId,
    submitting,
    onChanged,
  ]);

  const reject = useCallback(async () => {
    if (submitting) {
      return null;
    }

    if (!comments.trim()) {
      setError("Comments are required.");
      return null;
    }

    setSubmitting(true);
    setError("");

    try {
      const result = await rejectTicket({
        ticketId: ticket.id,
        comments,
        correctiveActionTypeId:
          correctiveActionTypeId || undefined,
      });

      onChanged?.();
      return result;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      return null;
    } finally {
      setSubmitting(false);
    }
  }, [
    ticket,
    comments,
    correctiveActionTypeId,
    submitting,
    onChanged,
  ]);

  return {
    comments,
    setComments,
    correctiveActionTypeId,
    setCorrectiveActionTypeId,
    submitting,
    error,
    accept,
    reject,
  };
}

/**
 * Selecting and uploading evidence photographs, mirroring the server's
 * own limits so a bad selection is caught before the request is made.
 */
export function useTicketEvidence(ticket, onChanged) {
  const [selectedFiles, setSelectedFiles] =
    useState([]);
  const [uploading, setUploading] =
    useState(false);
  const [removingId, setRemovingId] =
    useState(null);
  const [error, setError] = useState("");

  const existingCount =
    ticket?.evidenceCount ?? 0;

  const remainingSlots = Math.max(
    MAX_EVIDENCE_FILES -
      existingCount -
      selectedFiles.length,
    0,
  );

  const addFiles = useCallback(
    (files) => {
      setError("");

      const incoming = Array.from(files);

      const invalidType = incoming.find(
        (file) =>
          !ALLOWED_EVIDENCE_TYPES.has(
            file.type,
          ),
      );

      if (invalidType) {
        setError(
          "Only JPG, PNG, or SVG images are allowed.",
        );
        return;
      }

      const tooLarge = incoming.find(
        (file) =>
          file.size >
          MAX_EVIDENCE_FILE_SIZE,
      );

      if (tooLarge) {
        setError(
          "Each evidence photograph must be 10 MB or smaller.",
        );
        return;
      }

      if (incoming.length > remainingSlots) {
        setError(
          `This ticket can hold ${MAX_EVIDENCE_FILES} evidence photographs; ${remainingSlots} more can be added.`,
        );
        return;
      }

      setSelectedFiles((current) => [
        ...current,
        ...incoming,
      ]);
    },
    [remainingSlots],
  );

  const removeSelected = useCallback(
    (index) => {
      setSelectedFiles((current) =>
        current.filter(
          (_, itemIndex) =>
            itemIndex !== index,
        ),
      );
    },
    [],
  );

  const upload = useCallback(async () => {
    if (uploading || !selectedFiles.length) {
      return null;
    }

    setUploading(true);
    setError("");

    try {
      const result =
        await uploadTicketEvidence({
          ticketId: ticket.id,
          files: selectedFiles,
        });

      setSelectedFiles([]);
      onChanged?.();
      return result;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      return null;
    } finally {
      setUploading(false);
    }
  }, [ticket, selectedFiles, uploading, onChanged]);

  const remove = useCallback(
    async (evidenceId) => {
      if (removingId) {
        return null;
      }

      setRemovingId(evidenceId);
      setError("");

      try {
        const result =
          await deleteTicketEvidence({
            ticketId: ticket.id,
            evidenceId,
          });

        onChanged?.();
        return result;
      } catch (requestError) {
        setError(getErrorMessage(requestError));
        return null;
      } finally {
        setRemovingId(null);
      }
    },
    [ticket, removingId, onChanged],
  );

  return {
    selectedFiles,
    remainingSlots,
    uploading,
    removingId,
    error,
    addFiles,
    removeSelected,
    upload,
    remove,
  };
}

/**
 * Closing an in-progress ticket once the work is done on the ground.
 */
export function useCloseTicket(ticket, onChanged) {
  const [completionNotes, setCompletionNotes] =
    useState("");
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState("");

  const close = useCallback(async () => {
    if (closing) {
      return null;
    }

    setClosing(true);
    setError("");

    try {
      const result = await closeTicket({
        ticketId: ticket.id,
        completionNotes,
      });

      onChanged?.();
      return result;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      return null;
    } finally {
      setClosing(false);
    }
  }, [ticket, completionNotes, closing, onChanged]);

  return {
    completionNotes,
    setCompletionNotes,
    closing,
    error,
    close,
  };
}
