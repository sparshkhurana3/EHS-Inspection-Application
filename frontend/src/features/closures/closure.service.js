import {
  apiBlobRequest,
  apiRequest,
} from "../../services/apiClient.js";

export function fetchAuditeeClosures() {
  return apiRequest("/closures", {
    method: "GET",
  });
}

export function fetchClosureById(closureId) {
  return apiRequest(
    `/closures/${encodeURIComponent(closureId)}`,
    { method: "GET" },
  );
}

export function fetchPendingApprovals() {
  return apiRequest(
    "/closures/pending-approvals",
    { method: "GET" },
  );
}

export function saveClosureItem({
  closureId,
  closureItemId,
  actionPlan,
  targetDate,
}) {
  return apiRequest(
    `/closures/${encodeURIComponent(
      closureId,
    )}/items/${encodeURIComponent(
      closureItemId,
    )}/action-plan`,
    {
      method: "PATCH",
      body: JSON.stringify({
        actionPlan,
        targetDate,
      }),
    },
  );
}

function evidencePath({
  closureId,
  closureItemId,
}) {
  return `/closures/${encodeURIComponent(
    closureId,
  )}/items/${encodeURIComponent(
    closureItemId,
  )}/evidence`;
}

/**
 * Attaches evidence photographs to one observation's action plan.
 *
 * Sent as FormData, which apiClient leaves alone: the browser has to
 * set the multipart boundary itself.
 */
export function uploadClosureEvidence({
  closureId,
  closureItemId,
  files,
}) {
  const formData = new FormData();

  Array.from(files).forEach((file) => {
    formData.append("evidence", file);
  });

  return apiRequest(
    evidencePath({
      closureId,
      closureItemId,
    }),
    {
      method: "POST",
      body: formData,
    },
  );
}

export function deleteClosureEvidence({
  closureId,
  closureItemId,
  evidenceId,
}) {
  return apiRequest(
    `${evidencePath({
      closureId,
      closureItemId,
    })}/${encodeURIComponent(evidenceId)}`,
    { method: "DELETE" },
  );
}

/**
 * Evidence is served from an authenticated route, so it cannot be used
 * as a plain image src: it is fetched as a blob and shown from an
 * object URL instead.
 */
export function fetchClosureEvidenceBlob({
  closureId,
  closureItemId,
  evidenceId,
}) {
  return apiBlobRequest(
    `${evidencePath({
      closureId,
      closureItemId,
    })}/${encodeURIComponent(evidenceId)}`,
    { method: "GET" },
  );
}

export function submitClosureReport(closureId) {
  return apiRequest(
    `/closures/${encodeURIComponent(
      closureId,
    )}/submit`,
    { method: "POST" },
  );
}

export function approveClosureReport({
  closureId,
  reviewComments,
}) {
  return apiRequest(
    `/closures/${encodeURIComponent(
      closureId,
    )}/approve`,
    {
      method: "POST",
      body: JSON.stringify({ reviewComments }),
    },
  );
}

export function rejectClosureReport({
  closureId,
  reviewComments,
}) {
  return apiRequest(
    `/closures/${encodeURIComponent(
      closureId,
    )}/reject`,
    {
      method: "POST",
      body: JSON.stringify({ reviewComments }),
    },
  );
}
