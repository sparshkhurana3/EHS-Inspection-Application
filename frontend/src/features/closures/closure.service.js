import {
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

export function fetchActionHodOptions(closureId) {
  return apiRequest(
    `/closures/${encodeURIComponent(
      closureId,
    )}/action-hods`,
    { method: "GET" },
  );
}

export function saveClosureActionPlan({
  closureId,
  actionPlan,
  targetDate,
  actionHodId,
}) {
  return apiRequest(
    `/closures/${encodeURIComponent(
      closureId,
    )}/action-plan`,
    {
      method: "PATCH",
      body: JSON.stringify({
        actionPlan,
        targetDate,
        actionHodId,
      }),
    },
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
