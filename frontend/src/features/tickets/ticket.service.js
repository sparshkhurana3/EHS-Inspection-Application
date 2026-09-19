import {
  apiBlobRequest,
  apiRequest,
} from "../../services/apiClient.js";

export function fetchHodTickets() {
  return apiRequest("/tickets", {
    method: "GET",
  });
}

export function fetchTicketLookups() {
  return apiRequest("/tickets/lookups", {
    method: "GET",
  });
}

export function fetchTicketById(ticketId) {
  return apiRequest(
    `/tickets/${encodeURIComponent(ticketId)}`,
    { method: "GET" },
  );
}

export function acceptTicket({
  ticketId,
  comments,
  correctiveActionTypeId,
}) {
  return apiRequest(
    `/tickets/${encodeURIComponent(
      ticketId,
    )}/accept`,
    {
      method: "POST",
      body: JSON.stringify({
        comments,
        correctiveActionTypeId,
      }),
    },
  );
}

export function rejectTicket({
  ticketId,
  comments,
  correctiveActionTypeId,
}) {
  return apiRequest(
    `/tickets/${encodeURIComponent(
      ticketId,
    )}/reject`,
    {
      method: "POST",
      body: JSON.stringify({
        comments,
        correctiveActionTypeId,
      }),
    },
  );
}

export function uploadTicketEvidence({
  ticketId,
  files,
}) {
  const formData = new FormData();

  files.forEach((file) =>
    formData.append("evidence", file),
  );

  return apiRequest(
    `/tickets/${encodeURIComponent(
      ticketId,
    )}/evidence`,
    {
      method: "POST",
      body: formData,
    },
  );
}

export function deleteTicketEvidence({
  ticketId,
  evidenceId,
}) {
  return apiRequest(
    `/tickets/${encodeURIComponent(
      ticketId,
    )}/evidence/${encodeURIComponent(
      evidenceId,
    )}`,
    { method: "DELETE" },
  );
}

export function closeTicket({
  ticketId,
  completionNotes,
}) {
  return apiRequest(
    `/tickets/${encodeURIComponent(
      ticketId,
    )}/close`,
    {
      method: "POST",
      body: JSON.stringify({
        completionNotes,
      }),
    },
  );
}

export function fetchTicketEvidenceBlob({
  ticketId,
  evidenceId,
}) {
  return apiBlobRequest(
    `/tickets/${encodeURIComponent(
      ticketId,
    )}/evidence/${encodeURIComponent(
      evidenceId,
    )}`,
    { method: "GET" },
  );
}
