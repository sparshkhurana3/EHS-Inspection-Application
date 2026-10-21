# 21. Weekly inspection report (PDF)

Implementation plan. It follows the layering in [02-architecture.md](02-architecture.md) and the conventions in `CLAUDE.md`, sits next to the existing year-to-date `.xlsx` report (`GET /api/patrols/inspection-report`, `patrols/inspectionReport.js`), and uses the Sona Comstar branding added under `frontend/src/brand/` and `backend/src/assets/`.

**Goal**

An EHS Officer picks one inspection week (for example week 40) and downloads a branded PDF for **every zone at their location that had an inspection scheduled that week**, grouped by unit. Each zone shows:

- **Not done** (red) when no observation report was filed;
- **Inspected, no observation to record** (green) when the auditor closed the audit with nothing to report;
- **Inspected, N observations** (green), followed by every observation and its closure data (action plan, target date, evidence count, closure status).

The report ends with a summary: zones to be inspected, zones inspected, and how many of the inspected zones had observations.

## Before you start

- **The working tree holds uncommitted Sona Comstar branding work** (`frontend/src/brand/`, `frontend/public/brand/`, `backend/src/assets/sona-comstar-report-header.png`, edits to `inspectionReport.js` and several layouts). Build on it, and do not revert or reformat it.
- Host Node is v12 and cannot run this code. Verify inside Docker (see [Acceptance checks](#acceptance-checks)).
- There are no tests and no linter. Match the surrounding heavily line-broken style and comment density.

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Library: `pdfkit`** (pure JS, uses `fontkit`, no native dependencies), added to `backend/package.json`. Do not use Puppeteer or any headless Chromium. | It runs unchanged on `node:22-alpine`. Chromium would add about 300 MB to the image and a sandbox to manage. |
| D2 | **Scope and access.** `PLANNING_ROLES` only (`EHS_OFFICER`, `ADMIN`). The location is the caller's own plant from `patrolRepository.findUserLocation(userId)`. With no plant set, return `403 OFFICER_LOCATION_NOT_SET`, using the message the `.xlsx` report uses. | This matches the existing report. "GGN officer sees GGN" is the plant scope. |
| D3 | **A week** is Monday to Sunday (UTC), identified by its Monday `weekStart` (`YYYY-MM-DD`). Any date passed in is normalised to its Monday, as `GET /api/dashboard/officer-week` does. The ISO week number comes from the existing `getIsoWeekNumber` in `patrol.service.js`. The ISO **year** is the UTC year of `weekStart + 3 days` (the week's Thursday), so the week of 29 Dec 2025 is reported as W1 2026. | It stays consistent with the dashboard and the `.xlsx` report. |
| D4 | **Which inspections are listed:** every patrol at the plant with `scheduled_date` in `[weekStart, weekStart + 6]` and `status <> 'CANCELLED'`, hand-planned and roster-generated alike. Zones with nothing scheduled that week are not listed. | A cancelled audit was never owed, which is the same rule `findZoneWeekInspectionStatus` uses. "Zones to be inspected" means zones that were scheduled. |
| D5 | **Done means an `observation_reports` row exists** for the patrol, which is the test the dashboard metrics and the `.xlsx` report use. `no_observations = true` gives "Inspected, no observation to record". Otherwise the report is "Inspected" with its `observation_items`. | It is one definition across every report. |
| D6 | **Colour plus text.** The status cell is filled green (`#D1FADF` fill, `#05603A` bold text) or red (`#FEE4E2` fill, `#912018` bold text), the same values as `FILLS`/`FONT_COLOURS` in `inspectionReport.js`. The status is always written out in words, so the report still reads when printed in black and white. | This is the existing report's rule, and the PDF will be printed. |
| D7 | **The current week is allowed.** A not-done audit in a week whose Thursday (`weekStart + 3`) has not yet passed is still red "Not done", with a second line "Due by Thu 1 Oct". Weeks after the current week are rejected with `400 WEEK_NOT_STARTED`. | It keeps the requirement's two colours while not presenting an audit as missed before its deadline. See open question Q2. |
| D8 | **More than one patrol for a zone in the week** (a hand-planned extra) gives one group per patrol, each with its own date. In the summary a zone counts as **inspected** only when **every** non-cancelled patrol it had that week has a report, which matches the `.xlsx` report's `conductedCount >= scheduledCount`. It counts as **with observations** when any of its reports has `no_observations = false`. | The summary counts zones, as the requirement asks, without double-counting. |
| D9 | **Photographs are not embedded in v1.** Each observation row states its evidence count ("2 evidence photos"). | Up to 10 observation photos and 30 evidence photos per zone, multiplied by every zone, would make a multi-MB file. With `PHOTO_STORAGE=sharepoint`, every image would also be a Graph download during the request. See open question Q1. |
| D10 | **Fonts: pdfkit's built-in Helvetica and Helvetica-Bold.** Pass all user-entered text through a `toPdfText()` helper. It replaces characters outside Windows-1252 with `?` and collapses runs of whitespace other than newlines. | No font files to ship. Standard fonts only encode WinAnsi, and anything else prints as wrong glyphs rather than failing. See open question Q3. |
| D11 | **Branding.** Every page carries the black-on-white `sona-comstar-report-header.png` logo in its header, and the footer reads "© {year} Sona Comstar · EHS Inspection · Weekly inspection report" with "Page x of y". Header and table-header bands use ink `#101828` with white text, the app's only accent colour. Company strings come from a new `backend/src/shared/brand.js`, and the `.xlsx` report is switched to it too. | One place for the company name on the server, mirroring `frontend/src/brand/brand.js`. |
| D12 | **Week picker data comes from the server.** `GET /api/patrols/weekly-report/weeks` lists the weeks that have at least one non-cancelled patrol at the plant, from 52 weeks before the current week up to and including the current week, newest first. The client does no date arithmetic (as in docs/20 D6) and never offers an empty week. | The officer picks "W40 · 28 Sep – 4 Oct 2026" instead of typing a date, and the window crosses the year boundary cleanly. |
| D13 | **A week with no inspections** returns `404 NO_INSPECTIONS_IN_WEEK` ("No inspections were scheduled at your location in that week."), not an empty PDF. | The picker never offers such a week, so this only happens with a hand-built URL. |
| D14 | **The PDF builder is a pure function** (`buildWeeklyInspectionPdf(data) → Promise<Buffer>`) in its own file with no database access. | It can be checked with fixture data inside a container, the only way to verify anything in a repository with no test suite. |

Out of scope (add to [09-feature-refinement-backlog.md](09-feature-refinement-backlog.md)): embedded photographs (Q1); a Devanagari-capable font (Q3); emailing or scheduling the report; a report for HOD/Plant Head; choosing a location other than one's own.

## Backend

### Dependency

`cd backend && npm install pdfkit` (run inside a `node:22-alpine` container, see the acceptance checks), which updates `package.json` and `package-lock.json`. The backend `Dockerfile` needs no change: `npm ci --omit=dev` picks it up and pdfkit has no native build step. ESM import: `import PDFDocument from "pdfkit";`.

### `backend/src/shared/brand.js` (new)

```js
/*
 * Every Sona Comstar name and asset the server prints, in one place.
 * Mirrors frontend/src/brand/brand.js; change both together.
 */
export const BRAND = Object.freeze({
  companyName: "Sona Comstar",
  productName: "EHS Inspection",
  reportLogoPath: new URL("../assets/sona-comstar-report-header.png", import.meta.url),
});

export function footerLegal(date = new Date()) {
  return `© ${date.getUTCFullYear()} ${BRAND.companyName}`;
}
```

In `patrols/inspectionReport.js`, replace the local `LOGO_PATH` with `BRAND.reportLogoPath`, and set `workbook.creator` to `` `${BRAND.productName} · ${BRAND.companyName}` ``. Make no other change to that file.

### `patrols/patrol.repository.js`: three new functions

All new SQL returns dates as `TO_CHAR(x, 'YYYY-MM-DD')` strings and timestamps as `TO_CHAR(x AT TIME ZONE 'UTC', 'YYYY-MM-DD')`, so nothing downstream receives a JS `Date` (see `toDateOnlyString` for why). Map `snake_case` to `camelCase`, as the other functions do. Every function takes `client = databasePool` last.

1. **`findInspectionWeeks({ plantId, fromDate, toDate })`** feeds D12. It groups non-cancelled patrols at the plant (`JOIN units ON units.id = patrol.unit_id WHERE units.plant_id = $1`) by `DATE_TRUNC('week', scheduled_date)::DATE` within `[fromDate, toDate]` and returns, per week, `weekStart`, `zoneCount` (`COUNT(DISTINCT patrol.zone_id)`) and `reportCount` (`COUNT(report.id)` from a `LEFT JOIN observation_reports`), ordered by `week_start DESC`.

2. **`findWeekPatrolsForReport({ plantId, weekStart, weekEnd })`** returns one row per non-cancelled patrol in the week:
   - `patrol.id`, `scheduled_date`, `status`;
   - unit `id`, `unit_number`, `name`, and zone `id`, `zone_number`, `name`;
   - `auditor.full_name`, `auditee.full_name`;
   - report: `id`, `report_number`, `submitted_at`, `no_observations` (all null when there is none, via `LEFT JOIN observation_reports AS report ON report.patrol_id = patrol.id`);
   - closure: `id`, `status`, `submitted_for_closure_at`, `approved_at`, `reviewed_at`, `review_comments`, `approval_iteration`, and the reviewer's `full_name` (`LEFT JOIN closure_requests AS closure ON closure.observation_report_id = report.id`, then `LEFT JOIN users AS reviewer ON reviewer.id = closure.reviewed_by`).

   Order by `unit_number NULLS LAST, unit.name, zone_number NULLS LAST, zone.name, scheduled_date, patrol.id`, which is the `.xlsx` report's ordering. Filter on `unit.is_active` and `zone.is_active` exactly as `findZonesWithCurrentAssignment` does.

3. **`findReportItemsForReport({ reportIds })`** returns every observation with its closure item for the given reports (`WHERE item.observation_report_id = ANY($1::BIGINT[])`):
   - from `observation_items`: `observation_report_id`, `sequence_number`, `category`, `risk_category`, `description`, and the area name (`LEFT JOIN zone_areas ON zone_areas.id = item.zone_area_id`, falling back to `item.observation_location`);
   - from `closure_items` (`LEFT JOIN closure_items AS closure_item ON closure_item.observation_item_id = item.id`): `action_plan`, `target_date`;
   - `evidence_count`: a correlated `(SELECT COUNT(*)::INTEGER FROM closure_item_evidence WHERE closure_item_id = closure_item.id)`.

   Order by `observation_report_id, sequence_number`. Return `[]` straight away when `reportIds` is empty, without a query.

### `patrols/patrol.service.js`

**`getWeeklyReportWeeks({ userId, referenceDate = new Date() })`**

1. Get the location as `getInspectionReport` does (403 on none).
2. Set `currentWeekStart` to the Monday of `referenceDate`, and `fromDate` to `currentWeekStart - 52 * 7` days. `toDate` is `currentWeekStart + 6`.
3. Return `{ location: { name, code }, currentWeekStart, weeks }`, where each week is `{ weekStart, weekEnd, isoWeek, isoYear, zoneCount, reportCount }` (D3).

Write a small local `getMondayOf(dateOnly)` and `addDays(dateOnly, n)` in UTC string arithmetic next to `getIsoWeekNumber`. Do not import them from the dashboard module; the module comment explains why the two are self-contained.

**`getWeeklyInspectionReport({ userId, weekStart, referenceDate = new Date() })`**

1. Parse `weekStart`. It must be a real calendar date; reject `2026-02-30` as `400 INVALID_WEEK_START` ("Select a valid week."). Normalise it to its Monday.
2. If it is after the current week's Monday, throw `400 WEEK_NOT_STARTED` ("Choose a week that has already started.").
3. Get the location (403 on none) and the caller's `full_name` for the "Generated by" line. `req.user` already carries it: pass `generatedBy` in from the controller instead of querying again.
4. Run `findWeekPatrolsForReport`. If it returns no rows, throw `404 NO_INSPECTIONS_IN_WEEK` (D13).
5. Run `findReportItemsForReport` for the report ids, and group the items by `observationReportId`.
6. Build the **view model** that the builder consumes. All counting and labelling happens here, so the builder only draws:

```js
{
  plantName, plantCode,
  weekStart, weekEnd, isoWeek, isoYear,
  dueDate,            // weekStart + 3
  generatedAt,        // "20 Oct 2026"
  generatedBy,        // officer's full name
  units: [{
    unitName,         // "Unit 1 · Machining" when unit_number is set, else name
    inspections: [{
      zoneName, scheduledDate,
      auditorName, auditeeName,
      outcome,        // "NOT_DONE" | "NO_OBSERVATIONS" | "OBSERVATIONS"
      notYetDue,      // outcome NOT_DONE and today <= dueDate (D7)
      reportNumber,   // null when NOT_DONE
      closureLabel,   // see table below; null unless OBSERVATIONS
      reviewComments, // only when status is REEXAMINATION_REQUIRED
      observations: [{
        sequenceNumber, areaName, category, riskLabel,
        description, actionPlan, targetDate, evidenceCount,
      }],
    }],
  }],
  summary: {
    zonesToInspect, zonesInspected, zonesNotInspected,
    inspectedWithObservations, inspectedWithoutObservations,
    totalObservations,
    risk: { high, medium, low },
    closures: { approved, awaitingApproval, inProgress, returned },
    byUnit: [{ unitName, zonesToInspect, zonesInspected, inspectedWithObservations }],
  },
}
```

Closure labels (from `closure_requests.status`; the set comes from migration 004's `closure_request_status_check`):

| Status | Label |
|---|---|
| `OPEN` | Action plans pending |
| `IN_PROGRESS` | Action plans saved, not submitted |
| `SUBMITTED_FOR_CLOSURE` | Awaiting EHS approval |
| `APPROVED` | Approved {approved_at as d Mon} by {reviewer} |
| `REEXAMINATION_REQUIRED`, `REJECTED` | Returned for rework (round {approval_iteration}) |

`riskLabel` is `High`/`Medium`/`Low`. An empty `actionPlan` prints as "Not yet provided" and an empty `targetDate` as "–". Zone-level summary counting follows D8: group the inspections by zone id before counting. `closures.*` counts closures, one per report with observations.

7. Call `buildWeeklyInspectionPdf(viewModel)` and return:

```js
{
  buffer,
  fileName: `weekly-inspection-report-${plantCode ?? plantName}-${isoYear}-w${String(isoWeek).padStart(2, "0")}.pdf`
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-"),
}
```

### `patrols/weeklyInspectionPdf.js` (new): the builder

`export async function buildWeeklyInspectionPdf(model)` creates `new PDFDocument({ size: "A4", layout: "landscape", margins: { top: 36, bottom: 40, left: 36, right: 36 }, bufferPages: true, info: { Title, Author: BRAND.companyName, Creator: BRAND.productName } })`, collects `data` chunks into a `Buffer`, and resolves on `end`. A4 landscape is 842 × 595 pt, so the usable width is **770 pt**.

**Page header**, drawn on every page by a `drawPageHeader(doc)` helper, called once at the start and from a `doc.on("pageAdded", …)` handler:

- The logo at `(36, 30)`, `fit: [150, 45]` (the PNG is 600 × 179). Read the file once with `fs.readFile(BRAND.reportLogoPath)` before building and pass the buffer to `doc.image`.
- Right-aligned in the remaining width:
  - "Weekly inspection report" in Helvetica-Bold 15 pt, colour `#101828`;
  - "{plantName} · Week {isoWeek}, {isoYear} · {d Mon} – {d Mon yyyy}" in 9.5 pt, `#475467`;
  - "Generated {generatedAt} by {generatedBy}" in 8 pt, `#667085`.
- A 0.75 pt hairline in `#E4E7EC` across the full width at y ≈ 84. The body starts at y = 94.

**First page only**, under the header: a legend line in 8 pt italic `#667085`: "Green = inspection carried out · Red = not carried out. Each status is written out, so this report reads in black and white."

**Body: one table per unit.**

- **Unit band:** full width, 18 pt tall, fill `#101828`, the unit name in Helvetica-Bold 9.5 pt white, 6 pt left padding.
- **Column header row** (repeated after every page break): fill `#F2F4F7`, Helvetica-Bold 7.5 pt, `#344054`, uppercase. The column widths add up to 770:

| Column | Width | Content |
|---|---|---|
| Zone | 76 | zone name; second line: scheduled date (7 pt grey) |
| Auditor / Auditee | 95 | "Auditor: X" newline "Auditee: Y" |
| Inspection | 85 | **status cell** (D6): "Not done" (+ "Due by Thu 1 Oct" when `notYetDue`), "Inspected" + "No observation to record", or "Inspected" + "3 observations"; report number below when present |
| # | 18 | observation sequence number |
| Area | 60 | area name |
| Cat. | 28 | UA / UC |
| Risk | 40 | High / Medium / Low (High in bold) |
| Observation | 128 | description |
| Action plan | 128 | action plan; then "(n evidence photos)" in 7 pt grey when n > 0 |
| Target | 52 | target date, d Mon yyyy |
| Closure | 60 | `closureLabel`; then the review comments in 7 pt when returned |

- **Rows.** An inspection with observations takes one row per observation. The first three columns and Closure are drawn **only on its first row**, and later rows leave them blank. Draw a 0.5 pt `#EAECF0` line under every row, and a 1 pt `#D0D5DD` line under the last row of each inspection so groups read as blocks. A not-done or no-observation inspection is one row with the observation columns blank. Fill the **Inspection cell of every row of the group** with the status colour, so the green or red runs the height of the group.
- **Text.** Helvetica 7.5 pt, `#101828`, 4 pt cell padding, `lineGap: 1`. Every user string goes through `toPdfText()` (D10).
- **Row height** is the tallest cell, measured with `doc.heightOfString(text, { width: colWidth - 8 })`, plus padding.
- **Page breaks:** before drawing a row, if `y + rowHeight > pageHeight - margins.bottom - 24` (24 pt reserved for the footer), call `doc.addPage()` (the header is drawn by the handler), redraw the unit band with " (continued)", redraw the column header, and, if the row is not the first of its inspection, draw the first three columns again with the zone name followed by " (cont.)". Draw cells with explicit `x`/`y` and `doc.text(…, x, y, { width, height, ellipsis: false })`; never rely on the text cursor. Draw fills (`doc.rect().fill()`) **before** the text of the row.
- Leave a 12 pt gap between units.

**Summary**, at the end on a new page or after the last unit when at least 230 pt remain:

- Heading "Summary · Week {isoWeek}, {isoYear}" in Helvetica-Bold 12 pt.
- A two-column key/value table, 360 pt wide, 8.5 pt, label `#475467`, value Helvetica-Bold `#101828`:
  - Zones to be inspected: N
  - Zones inspected: M (P %)
  - Zones not inspected: N − M (this value cell gets the red fill when > 0)
  - Inspected zones with observations: K
  - Inspected zones with no observation to record: M − K
  - Observations recorded: T (High h · Medium m · Low l)
  - Closures: approved a · awaiting approval b · in progress c · returned r
- Below it, a by-unit table with columns Unit | To inspect | Inspected | With observations, in the same header style as the body.

The first three key/value rows and the by-unit table are the requirement. The rest are cheap additions; keep them unless the user objects.

**Footer.** After everything is drawn, use `const range = doc.bufferedPageRange()` and, for each page, `doc.switchToPage(i)`. Set `doc.page.margins.bottom = 0` **before** writing, otherwise pdfkit adds a blank page when text lands below the bottom margin. Draw a hairline at y = 595 − 30. Write `${footerLegal()} · ${BRAND.productName} · Weekly inspection report` left-aligned in 7.5 pt `#667085`, and "Page {i+1} of {range.count}" right-aligned. Then `doc.end()`.

`toPdfText(value)`: return `""` for null. Otherwise collapse `\r\n` to `\n` and `[ \t]+` to a single space, trim, and replace every character outside Windows-1252 with `?`. Test for it with a regex built from the CP1252 printable set (U+0020–U+007E, U+00A0–U+00FF, and the CP1252 extras `€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ`).

### Controller, validator and routes

`patrol.validator.js`:

```js
export const weeklyReportValidationRules = [
  query("weekStart")
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("Week start must be a date in YYYY-MM-DD format."),
];
```

The service does the real date check, because Express 5's `req.query` does not keep sanitised values (see `dashboard.validator.js`).

`patrol.controller.js`:

- `getWeeklyReportWeeks` returns `res.status(200).json({ message: "Inspection weeks loaded.", ...result })`.
- `getWeeklyInspectionReport` passes `{ userId: req.user.id, generatedBy: req.user.fullName ?? req.user.username, weekStart: req.query.weekStart }`. `authenticate` sets `req.user` to `{ id, fullName, username, email, roles }`. It sets `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="…"`, `Access-Control-Expose-Headers: Content-Disposition` and `Cache-Control: no-store`, then `res.status(200).send(buffer)`. These are the same four headers as `getInspectionReport`.

`patrol.routes.js`: declare both routes next to `/inspection-report`, as `authenticate → authorize(...PLANNING_ROLES) → [rules → validate] → controller`:

```js
router.get("/weekly-report/weeks", authenticate, authorize(...PLANNING_ROLES), getWeeklyReportWeeks);
router.get("/weekly-report", authenticate, authorize(...PLANNING_ROLES), weeklyReportValidationRules, validate, getWeeklyInspectionReport);
```

Write them in the file's line-broken style, with a comment block each, as the neighbouring routes have.

nginx needs no change: the PDF is a normal `/api/` response and is a few hundred KB at most.

## Frontend

No new CSS. Reuse existing classes only (see `docs/20-ui-design-reference.md`).

`features/patrols/patrol.service.js`:

- `fetchWeeklyReportWeeks()` is `apiRequest("/patrols/weekly-report/weeks")`.
- `fetchWeeklyInspectionReport(weekStart)` is `apiBlobRequest(`/patrols/weekly-report?weekStart=${encodeURIComponent(weekStart)}`, { method: "GET" })`, with a comment as on `fetchInspectionReport`.

`features/patrols/useWeeklyReport.js` (new) follows the `useInspectionReport.js` pattern:

- State: `weeks`, `selectedWeekStart` (defaults to `weeks[0]?.weekStart`), `loading`, `downloading`, `error`.
- Load the weeks on mount with the `cancelled` flag pattern used in `OfficerWeekCard.jsx`.
- `download()` fetches the blob and saves it through a temporary object URL as `weekly-inspection-report-${isoYear}-w${pad(isoWeek)}.pdf`, revoking the URL in `finally`.
- Errors go through `getErrorMessage`.

`features/patrols/WeeklyReportPanel.jsx` (new) is a presentational component:

```jsx
<section className="roster-panel">
  <header className="observation-section-header">
    <div>
      <span className="dashboard-eyebrow">Weekly report</span>
      <h2>Download a week's inspection report</h2>
      <p>Every zone scheduled at {locationName} that week, with its observations and closures, as a PDF.</p>
    </div>
  </header>
  <div className="roster-controls">
    <label className="observation-history-filter">
      Week
      <select value={selectedWeekStart} onChange={…} disabled={loading || downloading || weeks.length === 0}>
        {weeks.map((week) => (
          <option key={week.weekStart} value={week.weekStart}>
            {`W${week.isoWeek} ${week.isoYear} · ${formatDate(week.weekStart)} to ${formatDate(week.weekEnd)} · ${week.reportCount} of ${week.zoneCount} inspected`}
          </option>
        ))}
      </select>
    </label>
    <button type="button" className="button button-primary" onClick={download} disabled={!selectedWeekStart || downloading}>
      {downloading ? "Preparing..." : "Download PDF"}
    </button>
  </div>
  {error ? <Alert type="error" title="Unable to download the weekly report">{error}</Alert> : null}
  {!loading && weeks.length === 0 ? <p className="closure-empty-note">No inspections have been scheduled at your location in the last year.</p> : null}
</section>
```

`reportCount of zoneCount` is a convenient hint, not the exact zone-level figure from D8, so word it as above ("inspected") and do not call it a summary. If that wording seems misleading once it is on screen, drop the count. Every child of `.roster-panel` gets `margin: 0 22px 22px` from the existing rule, except `<label>` inside `.roster-controls`; check it visually.

`PlanningPage.jsx`: call `useWeeklyReport()` and render `<WeeklyReportPanel … locationName={planning.location.name} />` immediately **after** the `planning-report-note` paragraph and **before** `RosterUploadPanel`. Do not change the existing `.xlsx` button.

## Documentation to update in the same change

- `docs/04-api-reference.md`: both endpoints, their query parameters, the errors (`OFFICER_LOCATION_NOT_SET` 403, `INVALID_WEEK_START` 400, `WEEK_NOT_STARTED` 400, `NO_INSPECTIONS_IN_WEEK` 404, `VALIDATION_ERROR` 400) and the response headers.
- `docs/06-frontend.md`: the Plan page's new panel and hook.
- `docs/05-workflows.md`: one paragraph on what "inspected", "not done" and "with observations" mean in the report (D5, D7, D8).
- `docs/09-feature-refinement-backlog.md`: the out-of-scope items above.
- `docs/README.md`: link this plan.
- `CLAUDE.md`: one sentence after the `.xlsx` report paragraph pointing to `GET /api/patrols/weekly-report` and `patrols/weeklyInspectionPdf.js`, and update "the feature plans are `docs/10` to `20`" to `21`.

## Acceptance checks

Run everything in containers; host Node 12 cannot. To build without touching the host `node_modules`:

```bash
docker run --rm -v "$PWD/backend":/src:ro node:22-alpine sh -c \
  'mkdir /w && cd /w && cp -r /src/. . && rm -rf node_modules && npm ci --omit=dev >/dev/null && node scripts/…'
```

1. **Builder with fixture data (D14).** Write a throwaway script in the session scratchpad, not the repository. It imports `buildWeeklyInspectionPdf` with a hand-made model:
   - two units;
   - one zone not done (with `notYetDue` true and false);
   - one zone with no observations;
   - one zone with 10 observations whose descriptions are long enough to force a page break inside the group;
   - one closure in each status;
   - a description containing `₹`, `—` and a Hindi word.

   Write the PDF to the scratchpad and confirm:
   - it opens;
   - the logo and header are on every page, and the footer reads "Page x of y" with the right total;
   - there is no blank trailing page;
   - the column header and "(cont.)" repeat after a break;
   - green and red cells are correct;
   - `₹` and the Hindi word print as `?` while `—` prints correctly;
   - the summary figures match the fixture.

   If `pdftotext` is available (`apk add poppler-utils`), use it to assert the text.
2. **End to end** with `docker compose up -d --build` and an EHS Officer account:
   - the Plan page shows the panel;
   - the picker lists weeks newest first;
   - downloading the current week and a past week gives PDFs whose rows match the Observations and Closure pages for those audits.
3. **Access and errors** (curl against `127.0.0.1:3000` with a Bearer token):
   - a `USER` gets 403;
   - an officer with no plant gets 403 `OFFICER_LOCATION_NOT_SET`;
   - `weekStart=2026-13-01` gets 400;
   - `weekStart=abc` gets 400 `VALIDATION_ERROR`;
   - a future week gets 400 `WEEK_NOT_STARTED`;
   - a week with nothing scheduled gets 404;
   - a Wednesday date returns the report for that week's Monday.
4. **Year boundary:** the week starting 29 Dec 2025 is labelled W1 2026 in the picker, the file name and the PDF header.
5. **Cancelled audits** do not appear and are not counted.
6. **A zone with two audits in one week**, one filed and one not, shows two groups and is counted as *not* inspected.
7. **The existing `.xlsx` report** still downloads, with the logo in row 1 (regression check for the `brand.js` switch).
8. `docker compose exec backend node -e "import('pdfkit')"` succeeds in the built image.

## Open questions for the user

The defaults above stand unless the user says otherwise.

- **Q1 Photographs.** Should the PDF include observation photographs and closure evidence, as thumbnails in an appendix per zone? Default: no (D9). Adding them means fetching each file through `shared/storage/storedFiles.js`, which today has no read-to-buffer helper, one Graph download per photo with SharePoint storage, rendering SVG uploads separately (pdfkit embeds only JPEG/PNG), and files of several MB.
- **Q2 Current week.** For an audit whose Thursday deadline has not passed, keep red "Not done (due by Thu)" (default), or show a grey "Pending" instead?
- **Q3 Non-Latin text.** Do auditors write observations or action plans in Hindi or another non-Latin script? If so, the built-in fonts print `?`. The fix is to bundle Noto Sans and Noto Sans Devanagari TTFs (SIL OFL) under `backend/src/assets/fonts/` and register them with `doc.registerFont`.
- **Q4 Summary placement.** The summary is at the end, as asked. Should a copy of the three headline figures also go on page 1?
