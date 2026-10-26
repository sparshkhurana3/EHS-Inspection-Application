import {
  BRAND,
  footerLegal,
} from "../../shared/brand.js";

import {
  formatReportDate,
} from "../reports/reportDates.js";

import { environment } from "../../config/environment.js";

/*
 * The text and HTML of the alert emails (docs/24 D14). Pure functions of
 * the rows they are given. Every value that reaches the HTML goes
 * through escapeHtml.
 */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const CLOSURE_STATUS_WORDS = {
  OPEN: "Action plans not yet written",
  IN_PROGRESS: "Action plans saved, not yet sent for approval",
  REEXAMINATION_REQUIRED:
    "Sent back by the EHS Officer for rework",
  REJECTED: "Sent back by the EHS Officer for rework",
  SUBMITTED_FOR_CLOSURE: "Sent for approval",
  APPROVED: "Approved",
};

export function describeClosureStatus(status) {
  return (
    CLOSURE_STATUS_WORDS[status] ??
    CLOSURE_STATUS_WORDS.OPEN
  );
}

function reportLink(reportId) {
  return `${environment.frontendOrigin}/observations?reportId=${reportId}`;
}

function wrapHtml(title, bodyHtml) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #dfe4e9;border-radius:12px;padding:24px;">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#667085;">${escapeHtml(BRAND.productName)}</p>
      <h1 style="margin:0 0 16px;font-size:20px;color:#101828;">${escapeHtml(title)}</h1>
      ${bodyHtml}
      <p style="margin:24px 0 0;font-size:12px;color:#667085;">${escapeHtml(footerLegal())} · ${escapeHtml(BRAND.productName)}. This is an automatic message; please do not reply.</p>
    </div>
  </body>
</html>`;
}

function htmlTable(headers, rows) {
  const head = headers
    .map(
      (header) =>
        `<th style="text-align:left;padding:8px;border-bottom:2px solid #101828;font-size:12px;">${escapeHtml(header)}</th>`,
    )
    .join("");

  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (cell) =>
              `<td style="padding:8px;border-bottom:1px solid #eaecf0;font-size:13px;vertical-align:top;">${cell}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");

  return `<table style="border-collapse:collapse;width:100%;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function link(reportId, label) {
  return `<a href="${escapeHtml(reportLink(reportId))}" style="color:#101828;">${escapeHtml(label)}</a>`;
}

/**
 * The escalation email: reports not closed by the auditee within `days`
 * days. `level` is HOD or PLANT_HEAD; the Plant Head's table also names
 * the HOD.
 */
export function buildEscalationEmail({
  level,
  days,
  recipientName,
  rows,
}) {
  const plantNames = [
    ...new Set(rows.map((row) => row.plantName)),
  ];

  const where =
    plantNames.length === 1
      ? plantNames[0]
      : "your location";

  const subject = `EHS: ${
    rows.length === 1
      ? "1 observation report"
      : `${rows.length} observation reports`
  } not closed after ${days} days`;

  const intro = `These observation reports at ${where} have not been closed by the auditee within ${days} days of being generated.`;

  const withHod = level === "PLANT_HEAD";

  const textLines = rows.map(
    (row) =>
      `- ${row.reportNumber} · auditee ${row.auditeeName} · generated ${formatReportDate(row.generatedDate)} (${row.daysOpen} days ago) · ${row.unitName}, ${row.zoneName} · ${row.observationCount} observation${row.observationCount === 1 ? "" : "s"} · ${describeClosureStatus(row.closureStatus)}${withHod ? ` · HOD ${row.hodName}` : ""}\n  ${reportLink(row.reportId)}`,
  );

  const text = `Hello ${recipientName},

${intro}

${textLines.join("\n")}

${footerLegal()} · ${BRAND.productName}. This is an automatic message; please do not reply.`;

  const headers = [
    "Report",
    "Auditee",
    "Generated",
    "Days open",
    "Unit / zone",
    "Observations",
    "Closure",
    ...(withHod ? ["HOD"] : []),
  ];

  const table = htmlTable(
    headers,
    rows.map((row) => [
      link(row.reportId, row.reportNumber),
      escapeHtml(row.auditeeName),
      escapeHtml(formatReportDate(row.generatedDate)),
      escapeHtml(row.daysOpen),
      escapeHtml(`${row.unitName}, ${row.zoneName}`),
      escapeHtml(row.observationCount),
      escapeHtml(describeClosureStatus(row.closureStatus)),
      ...(withHod ? [escapeHtml(row.hodName)] : []),
    ]),
  );

  const html = wrapHtml(
    subject.replace(/^EHS: /, ""),
    `<p style="margin:0 0 12px;">Hello ${escapeHtml(recipientName)},</p><p style="margin:0 0 16px;">${escapeHtml(intro)}</p>${table}`,
  );

  return { subject, text, html };
}

/**
 * The Monday reminder to an auditor or auditee about work still open
 * from earlier weeks. `reports` are audits the person owes an
 * observation report for; `closures` are closures they owe an action on.
 */
export function buildWeeklyDigestEmail({
  recipientName,
  reports,
  closures,
}) {
  const total = reports.length + closures.length;

  const subject = `EHS: ${total} item${
    total === 1 ? "" : "s"
  } still open from earlier weeks`;

  const intro =
    "These items from earlier weeks are still waiting for you in the EHS Inspection app.";

  const reportLines = reports.map(
    (row) =>
      `- Observation report not filed: ${row.unitName}, ${row.zoneName} · audit date ${formatReportDate(row.scheduledDate)} · ${row.daysOverdue} days overdue`,
  );

  const closureLines = closures.map(
    (row) =>
      `- Closure not sent for approval: ${row.reportNumber} · ${row.unitName}, ${row.zoneName} · generated ${formatReportDate(row.generatedDate)} (${row.daysOpen} days ago) · ${describeClosureStatus(row.closureStatus)}\n  ${reportLink(row.reportId)}`,
  );

  const text = `Hello ${recipientName},

${intro}

${reports.length > 0 ? `Observation reports to file (${reports.length}):\n${reportLines.join("\n")}\n\n` : ""}${closures.length > 0 ? `Closures to complete (${closures.length}):\n${closureLines.join("\n")}\n\n` : ""}${footerLegal()} · ${BRAND.productName}. This is an automatic message; please do not reply.`;

  const sections = [];

  if (reports.length > 0) {
    sections.push(
      `<h2 style="margin:16px 0 8px;font-size:15px;">Observation reports to file (${reports.length})</h2>${htmlTable(
        ["Unit / zone", "Audit date", "Days overdue"],
        reports.map((row) => [
          escapeHtml(`${row.unitName}, ${row.zoneName}`),
          escapeHtml(formatReportDate(row.scheduledDate)),
          escapeHtml(row.daysOverdue),
        ]),
      )}`,
    );
  }

  if (closures.length > 0) {
    sections.push(
      `<h2 style="margin:16px 0 8px;font-size:15px;">Closures to complete (${closures.length})</h2>${htmlTable(
        [
          "Report",
          "Unit / zone",
          "Generated",
          "Days open",
          "Status",
        ],
        closures.map((row) => [
          link(row.reportId, row.reportNumber),
          escapeHtml(`${row.unitName}, ${row.zoneName}`),
          escapeHtml(formatReportDate(row.generatedDate)),
          escapeHtml(row.daysOpen),
          escapeHtml(describeClosureStatus(row.closureStatus)),
        ]),
      )}`,
    );
  }

  const html = wrapHtml(
    `${total} item${total === 1 ? "" : "s"} still open from earlier weeks`,
    `<p style="margin:0 0 12px;">Hello ${escapeHtml(recipientName)},</p><p style="margin:0 0 8px;">${escapeHtml(intro)}</p>${sections.join("")}`,
  );

  return { subject, text, html };
}
