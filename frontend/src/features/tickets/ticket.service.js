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

export function submitTicketResolution({
  ticketId,
  resolutionComments,
  correctiveActionTypeId,
}) {
  return apiRequest(
    `/tickets/${encodeURIComponent(
      ticketId,
    )}/submit-resolution`,
    {
      method: "POST",
      body: JSON.stringify({
        resolutionComments,
        correctiveActionTypeId:
          correctiveActionTypeId
            ? Number(correctiveActionTypeId)
            : undefined,
      }),
    },
  );
}

export function fetchTicketHistory(
  filter = "all",
) {
  const query = new URLSearchParams({
    filter,
  });

  return apiRequest(
    `/tickets/history?${query.toString()}`,
    { method: "GET" },
  );
}

export function fetchPendingTicketApprovals() {
  return apiRequest(
    "/tickets/pending-approvals",
    { method: "GET" },
  );
}

export function approveTicket({
  ticketId,
  comments,
}) {
  return apiRequest(
    `/tickets/${encodeURIComponent(
      ticketId,
    )}/approve`,
    {
      method: "POST",
      body: JSON.stringify({ comments }),
    },
  );
}

export function reopenTicket({
  ticketId,
  comments,
}) {
  return apiRequest(
    `/tickets/${encodeURIComponent(
      ticketId,
    )}/reopen`,
    {
      method: "POST",
      body: JSON.stringify({ comments }),
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
