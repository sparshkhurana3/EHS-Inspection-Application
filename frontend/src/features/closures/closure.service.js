import {
  apiRequest,
} from "../../services/apiClient.js";

export function fetchCurrentClosure() {
  return apiRequest(
    "/closures/current",
    {
      method: "GET",
    },
  );
}

export function fetchPendingApprovals() {
  return apiRequest(
    "/closures/pending-approvals",
    {
      method: "GET",
    },
  );
}

export function fetchClosureForApproval(
  closureId,
) {
  return apiRequest(
    `/closures/${encodeURIComponent(
      closureId,
    )}/approval`,
    {
      method: "GET",
    },
  );
}

export function saveClosureActionPlan({
  closureId,
  actionPlan,
  targetDate,
  responsibleHodName,
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
        responsibleHodName,
      }),
    },
  );
}

export function submitClosureReport({
  closureId,
}) {
  return apiRequest(
    `/closures/${encodeURIComponent(
      closureId,
    )}/submit`,
    {
      method: "POST",
    },
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

      body: JSON.stringify({
        reviewComments,
      }),
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

      body: JSON.stringify({
        reviewComments,
      }),
    },
  );
}

export function fetchObservationPhotograph(
  reportId,
) {
  return apiBlobRequest(
    `/observations/${encodeURIComponent(
      reportId,
    )}/photograph`,
    {
      method: "GET",
    },
  );
}