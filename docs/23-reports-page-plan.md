# 23. Reports page: interactive weekly and yearly inspection reports

Implementation plan. It builds on [21-weekly-inspection-pdf-plan.md](21-weekly-inspection-pdf-plan.md), whose weekly PDF it moves onto a new page. It follows the layering in [02-architecture.md](02-architecture.md), the conventions in `CLAUDE.md`, and the visual rules in [20-ui-design-reference.md](20-ui-design-reference.md).

**Goal**

A new page, **Report** (`/reports`), visible only to EHS Officers. The officer picks a report type and a period, clicks **Generate report**, and the report is drawn **in the page** as interactive, Sona Comstar-branded HTML. **Download PDF** saves the same report as a PDF. There are two reports, both scoped to the officer's own location:

1. **Weekly inspection report**, for one inspection week (for example Week 14, 2024). It shows every unit and zone scheduled that week, with the recorded metadata (date, auditor, auditee, report number), the outcome (not done, inspected with no observation to record, inspected with observations), every observation, and its closure (action plan, target date, evidence count, closure status). This is the PDF from docs/21 made viewable in the app.
2. **Yearly inspection report**, for one calendar year. Per zone, and rolled up per unit and for the location, it shows:
   - inspections scheduled;
   - inspections conducted, with the **completion percentage** (conducted ÷ scheduled);
   - observation reports with findings;
   - observations recorded;
   - closures approved.

   For example: "Unit 1 · Zone 5: 42 scheduled, 38 conducted (90%), 29 observation reports, 27 closures".

## Before you start

- **The working tree may hold uncommitted Entra application proxy work** (docs/22: `config/environment.js`, the auth module, migration 019, `ENTRA-APP-PROXY.md` and others). Build on it, and do not revert or reformat it. Run `git status` first.
- Host Node is v12 and cannot run this code. Build and verify in Docker (see [Acceptance checks](#acceptance-checks)).
- There are no tests and no linter. Match the surrounding heavily line-broken style and comment density.
- The weekly PDF, its view model and its queries already exist (docs/21):
  - `patrols/weeklyInspectionPdf.js`;
  - `getWeeklyReportWeeks` and `getWeeklyInspectionReport` in `patrol.service.js`;
  - `findInspectionWeeks`, `findWeekPatrolsForReport` and `findReportItemsForReport` in `patrol.repository.js`;
  - `WeeklyReportPanel.jsx` and `useWeeklyReport.js` on the Plan page.

  This plan **moves** them; it does not rewrite them.

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **A new backend module `reports`** (`backend/src/modules/reports/`, the standard five files), mounted at `/api/reports`. The weekly report's service code, its three queries and its PDF builder move there from `patrols`. | Reports are now a feature of their own, with two report types and a page. Leaving half of it in `patrols` would split one feature across two modules. |
| D2 | **Access: `EHS_OFFICER` only**, through a new `REPORT_ROLES = [EHS_OFFICER]` in both `shared/constants/roles.js` (backend) and `constants/roles.js` (frontend). Every report is scoped to the caller's own plant (`users.plant_id`). No plant gives `403 OFFICER_LOCATION_NOT_SET`, the same as the existing reports. | The requirement names the EHS Officer only. `ADMIN`, which `PLANNING_ROLES` also admits, is deliberately left out (open question Q1). |
| D3 | **The old `/api/patrols/weekly-report` and `/api/patrols/weekly-report/weeks` routes and the Plan page's `WeeklyReportPanel` are removed** in the same change. The Plan page keeps its year-to-date `.xlsx` download, and a short line under it links to the new page. | The frontend was their only consumer, and both ship together. One place to get the weekly report. |
| D4 | **HTML is drawn by React from JSON.** Each report has a JSON endpoint returning a **raw view model** (ISO dates, codes and ready-made labels) and a PDF endpoint that builds the PDF from the **same** model. The client never builds HTML from strings and never computes a figure the PDF would compute differently. | The on-screen report and the PDF can never disagree, and interactivity (filters, sorting, expanding) is ordinary React state. No `dangerouslySetInnerHTML`. |
| D5 | **The PDF is always the whole report.** On-screen filters, sorting and expanded rows do not change it. The download button says "Download PDF (full report)". | A filtered PDF would be a different document from the one an officer files or prints, with no visible sign that rows are missing. |
| D6 | **PDFs are built on the server with `pdfkit`**, as in docs/21. The yearly report gets its own builder. The shared pieces of the weekly builder (fonts, colours, `toPdfText`, page header, footer with "Page x of y", table header band) move to `reports/pdfLayout.js`, and both builders use them. | One house style. Browser print-to-PDF would vary by browser and phone and could not guarantee the header and footer. |
| D7 | **Generate, then view.** Choosing a week or year changes nothing on screen until **Generate report** is pressed; the result then replaces the previous one. **Download PDF** is enabled as soon as a period is chosen and does not need a generated view. The chosen type and period live in the query string (`?type=weekly&week=2026-09-28`, `?type=yearly&year=2026`). Opening such a link generates the report straight away. After a "Go to week" jump, the page writes the returned `report.weekStart` into `week`, so the URL always names a Monday. | This is what the requirement asks. The query string makes reports linkable and lets the back button return to the previous report. |
| D8 | **Yearly counting rules:** <ul><li>The period is 1 January to the **cutoff**: today for the current year, 31 December for a past year. A future year is `400 YEAR_NOT_STARTED`.</li><li>**Scheduled:** non-cancelled patrols with `scheduled_date` in the period. Audits later in the current year are not counted, because they are not due yet.</li><li>**Conducted:** those with an `observation_reports` row, as in every other report.</li><li>**Completion %:** `round(conducted ÷ scheduled × 100)`, shown as "–" when nothing was scheduled.</li><li>**Observation reports:** reports with `no_observations = false`.</li><li>**Observations:** `observation_items` on those reports.</li><li>**Closures approved:** closures with `status = 'APPROVED'`.</li><li>**Closures open:** every other closure.</li></ul>A patrol is counted in the calendar year of its `scheduled_date`, not its ISO week year. | "38 conducted, 29 observation reports, 27 closures" only works if "closures" means *completed*: a closure row is created with every report that has findings, so "closures generated" would always equal the observation report count. Counting scheduled audits to today keeps the percentage honest during the year. See Q2 and Q3. |
| D9 | **Every active zone at the location is listed in the yearly report**, including zones with nothing scheduled. Those show "Not scheduled" and are left out of every percentage. | A zone that was never put on the roster is exactly the gap a yearly review should reveal. |
| D10 | **Completion colours:** 100% green (`#05603A` on `#D1FADF`), 75–99% neutral, below 75% red (`#912018` on `#FEE4E2`), each with the percentage written out. The weekly report keeps docs/21's green for inspected and red for not done. | Colour stays reserved for status (design reference §3), and the text survives black-and-white printing. See Q4 for the thresholds. |
| D11 | **No photographs in either report**, on screen or in the PDF. Counts only ("2 evidence photos"), as in docs/21 D9. | The officer cannot reliably read every closure's evidence today (backlog 3.17), and SharePoint storage would mean one Graph call per photo. |
| D12 | **Year picker:** `GET /api/reports/yearly/years` returns the calendar years with at least one non-cancelled patrol at the plant, newest first, always including the current year. The **week picker** is the existing `findInspectionWeeks` (52 weeks back, newest first). Beside it, a **"Go to week" jump** takes a week number and year (for example 14 and 2024) for any older week. The weekly endpoints accept `isoYear` + `isoWeek` as an alternative to `weekStart`, and the **server** converts it to the Monday (Q5). | The client does no date arithmetic, and the picker never offers an empty period. The jump covers "Week 14, 2024", which is outside the 52-week list. |
| D13 | **No new libraries on the frontend.** Bars and percentages use the existing `.metric-tile-bar` pattern, and tables use plain CSS grid. New CSS goes into one `/* Reports */` section at the end of `global.css`, using the existing colours, radii and type sizes (design reference §2). | This is the house style: plain CSS, no chart or table libraries. |

Out of scope (add to [09-feature-refinement-backlog.md](09-feature-refinement-backlog.md)):
- photographs (D11);
- a report for HOD, Plant Head or Admin, or across locations;
- emailing or scheduling reports;
- downloading the interactive HTML as a standalone file (Q6);
- monthly or custom-range reports.

## Backend

### `shared/constants/roles.js`

```js
/*
 * Roles allowed to open the Report page (docs/23). The EHS Officer
 * only: the requirement names them, and ADMIN usually has no plant.
 */
export const REPORT_ROLES = Object.freeze([
  USER_ROLES.EHS_OFFICER,
]);
```

### Module layout: `backend/src/modules/reports/`

| File | Contents |
|---|---|
| `reports.routes.js` | The six routes below, each `authenticate → authorize(...REPORT_ROLES) → [rules → validate] → controller` |
| `reports.validator.js` | `weeklyReportValidationRules`: `weekStart` optional and shaped `YYYY-MM-DD`; `isoYear` optional and shaped `^\d{4}$`; `isoWeek` optional and shaped `^\d{1,2}$`. The service decides which form was given. `yearlyReportValidationRules`: `query("year").matches(/^\d{4}$/)` |
| `reports.controller.js` | Thin: JSON with `res.status(200).json(…)`; PDFs with the four headers of `getInspectionReport` (`Content-Type`, `Content-Disposition`, `Access-Control-Expose-Headers`, `Cache-Control: no-store`) |
| `reports.service.js` | `getWeeklyReportWeeks`, `getWeeklyReport`, `getWeeklyReportPdf`, `getYearlyReportYears`, `getYearlyReport`, `getYearlyReportPdf` |
| `reports.repository.js` | `findUserLocation` (a copy of the patrols one, three columns), `findInspectionWeeks`, `findWeekPatrolsForReport` and `findReportItemsForReport` (moved), and the new `findInspectionYears`, `findYearlyZoneTotals` and `findYearlyZoneWeeks` |
| `reportDates.js` | Pure helpers moved out of `patrol.service.js`: `addDays`, `getMondayOnOrBefore`, `toValidDateOnly`, `getIsoWeekNumber`, `getIsoYear`, `formatReportDate`, `toDateOnlyString`. Add `getIsoWeekMonday(isoYear, isoWeek)`: the Monday of the week holding 4 January, plus `(isoWeek − 1) × 7` days; return null when the result's ISO week number is not `isoWeek`, which rejects week 53 of a 52-week year. `patrol.service.js` keeps its own copies; it still uses them for the roster and the `.xlsx`. |
| `pdfLayout.js` | Shared pdfkit pieces (D6), see below |
| `weeklyInspectionPdf.js` | Moved from `patrols/`, and changed to use `pdfLayout.js` and to accept the raw model (see below) |
| `yearlyInspectionPdf.js` | New |

In `app.js`, add `import reportRoutes from "./modules/reports/reports.routes.js";` and `app.use("/api/reports", reportRoutes);` next to the others.

From `patrols`, remove:
- the two `/weekly-report` routes and their controllers;
- `weeklyReportValidationRules`;
- `getWeeklyReportWeeks`, `getWeeklyInspectionReport` and the weekly helpers in `patrol.service.js` that nothing else uses (`describeUnit`, `RISK_LABELS`, `describeClosure`, `toClosureBucket`, `getIsoYear`, `formatReportDate`, the weekly `MONTH_NAMES`). Keep `addDays` and anything the roster or `.xlsx` code still calls: grep before deleting;
- the three weekly queries in `patrol.repository.js`;
- `weeklyInspectionPdf.js`.

`shared/brand.js` stays where it is.

### Routes

| Method and path | Query | Returns |
|---|---|---|
| `GET /api/reports/weekly/weeks` | – | `{ message, location, currentWeekStart, weeks: [{ weekStart, weekEnd, isoWeek, isoYear, zoneCount, reportCount }] }`, as today |
| `GET /api/reports/weekly` | `weekStart=YYYY-MM-DD`, **or** `isoYear=YYYY&isoWeek=N` | `{ message, report }`, the weekly raw model |
| `GET /api/reports/weekly/pdf` | the same | PDF, `weekly-inspection-report-<plant>-<isoYear>-w<NN>.pdf` |
| `GET /api/reports/yearly/years` | – | `{ message, location, currentYear, years: [{ year, scheduledCount, conductedCount }] }` |
| `GET /api/reports/yearly` | `year=YYYY` | `{ message, report }`, the yearly raw model |
| `GET /api/reports/yearly/pdf` | `year` | PDF, `yearly-inspection-report-<plant>-<year>.pdf` |

Declare the literal paths (`/weekly/weeks`, `/weekly/pdf`, `/yearly/years`, `/yearly/pdf`) before any parameterised path. Today there are none, so this is for the future.

Errors:

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `weekStart` or `year` is missing or the wrong shape |
| 400 | `INVALID_WEEK_START` | not a real date, or neither `weekStart` nor `isoYear` + `isoWeek` given |
| 400 | `INVALID_ISO_WEEK` | `isoWeek` outside 1–53, or week 53 in a year that has only 52 |
| 400 | `WEEK_NOT_STARTED` | the week begins after the current week |
| 400 | `YEAR_NOT_STARTED` | `year` is after the current year |
| 400 | `INVALID_YEAR` | `year` is before 2000 |
| 403 | `INSUFFICIENT_PERMISSIONS` | the caller does not hold `EHS_OFFICER` |
| 403 | `OFFICER_LOCATION_NOT_SET` | the caller has no plant |
| 404 | `NO_INSPECTIONS_IN_WEEK` | nothing was scheduled at the plant that week |

A year with no inspections is **not** a 404. It returns every zone as "Not scheduled" (D9).

### Weekly report: the raw model

Refactor today's `getWeeklyInspectionReport` into `buildWeeklyReportModel({ userId, weekStart, referenceDate })`, which returns the model below. It is the docs/21 view model with **ISO dates instead of formatted strings, and IDs added**. All counting, labelling, D7/D8 (docs/21) and the summary logic stay exactly as they are. `getWeeklyReport` returns it as JSON. `getWeeklyReportPdf` passes it to `buildWeeklyInspectionPdf` together with the officer's name.

```js
{
  type: "WEEKLY",
  plant: { name, code },
  weekStart: "2026-09-28", weekEnd: "2026-10-04",
  isoWeek: 40, isoYear: 2026,
  dueDate: "2026-10-01",
  generatedAt: "2026-10-21",          // today, UTC
  units: [{
    unitId, unitName,                  // "Unit 1 · Machining"
    inspections: [{
      patrolId, zoneId, zoneName,
      scheduledDate: "2026-09-28",
      auditorName, auditeeName,
      outcome: "NOT_DONE" | "NO_OBSERVATIONS" | "OBSERVATIONS",
      notYetDue: false,
      reportNumber: "POR-2026-000004" | null,
      closureStatus: "APPROVED" | … | null,   // the raw code, for filtering
      closureLabel: "Approved 12 Oct 2026 by …" | null,
      reviewComments: string | null,
      observations: [{
        sequenceNumber, areaName, category,     // "UA" | "UC"
        riskCategory, riskLabel,                // "HIGH", "High"
        description, actionPlan,
        targetDate: "2026-10-15" | null,
        evidenceCount,
      }],
    }],
  }],
  summary: { /* unchanged from docs/21 */ },
}
```

`weeklyInspectionPdf.js` formats the ISO dates itself, with `formatReportDate` imported from `reportDates.js`, at the point it builds each cell. Keep its drawing output identical; the docs/21 fixture comparison below checks that. Its due-day label ("Thu 1 Oct") is built from `dueDate` inside the builder. `generatedBy` stays a builder argument, not part of the JSON. The page shows who is signed in already.

### Yearly report

**Repository**

`findInspectionYears({ plantId })` returns one row per year with non-cancelled patrols at the plant:
- `EXTRACT(YEAR FROM scheduled_date)::INT AS year`;
- `COUNT(*)` scheduled up to today;
- `COUNT(report.id)` conducted;
- ordered newest first.

The service adds the current year when it is missing.

`findYearlyZoneTotals({ plantId, fromDate, cutoffDate })` returns **every active zone of every active unit at the plant** (D9) with its totals for the period. Build it from `zones JOIN units`, then `LEFT JOIN LATERAL` (or a grouped subquery) over the zone's non-cancelled patrols in `[fromDate, cutoffDate]`:

```sql
COUNT(patrol.id)::INT                                                 AS scheduled_count,
COUNT(report.id)::INT                                                 AS conducted_count,
COUNT(report.id) FILTER (WHERE report.no_observations = FALSE)::INT  AS observation_report_count,
COUNT(report.id) FILTER (WHERE report.no_observations = TRUE)::INT   AS no_observation_count,
COALESCE(SUM(item_counts.item_count), 0)::INT                         AS observation_count,
COUNT(closure.id) FILTER (WHERE closure.status = 'APPROVED')::INT     AS closures_approved,
COUNT(closure.id) FILTER (WHERE closure.status <> 'APPROVED')::INT    AS closures_open
```

`item_counts` is a per-report `COUNT(*)` from `observation_items`, joined on `report.id`. Do **not** join `observation_items` directly, or every count multiplies. Also return `unit_id`, `unit_number`, `unit_name`, `zone_id`, `zone_number` and `zone_name`. Order as `findWeekPatrolsForReport` does (unit number, unit name, zone number, zone name).

`findYearlyZoneWeeks({ plantId, fromDate, cutoffDate })` returns one row per zone per inspection week: `zone_id`, `TO_CHAR(DATE_TRUNC('week', scheduled_date), 'YYYY-MM-DD') AS week_start`, `scheduled_count` and `conducted_count`. It is the same shape as `patrols.findZoneWeekInspectionStatus`, but owned by this module. It feeds the expandable week strip on screen. The PDF does not use it.

**Service**: `buildYearlyReportModel({ userId, year, referenceDate })`

1. Validate `year` (D8 and the error table). `fromDate = ${year}-01-01`. `cutoffDate` is today when `year` is the current year, else `${year}-12-31`.
2. Location as for the weekly report.
3. Run both zone queries in `Promise.all`.
4. Build the model:

```js
{
  type: "YEARLY",
  plant: { name, code },
  year: 2026, fromDate: "2026-01-01", cutoffDate: "2026-10-21",
  isPartialYear: true,                 // the current year
  generatedAt: "2026-10-21",
  totals: Totals,                      // whole location
  units: [{
    unitId, unitName,
    totals: Totals,
    zones: [{
      zoneId, zoneName,
      totals: Totals,
      weeks: [{ weekStart, isoWeek, scheduledCount, conductedCount }],  // oldest first
    }],
  }],
}

// Totals
{
  scheduled, conducted, notConducted,
  completionPercent,                   // integer, or null when scheduled is 0
  completionBand: "COMPLETE" | "ON_TRACK" | "BEHIND" | null,   // D10: 100 / 75–99 / <75
  observationReports, noObservationReports,
  observations,
  closuresApproved, closuresOpen,
  zonesScheduled,                      // unit and location totals only: zones with scheduled > 0
  zonesNotScheduled,
}
```

Unit and location totals are **sums of their zones**, never averages of percentages: the percentage is recomputed from the summed counts. Put `completionBand` here so the screen and the PDF can never disagree on a colour.

### `pdfLayout.js` (shared, D6)

Move these out of `weeklyInspectionPdf.js` and export them:

- `INK`, `COLOURS`, `MARGIN`, `CONTENT_WIDTH`, `PAGE_HEIGHT`, `BODY_TOP`, `BODY_LIMIT`, `CELL_PADDING`;
- `toPdfText` and the `line`, `measureLines` and `drawLines` helpers;
- `createReportDocument({ title, subtitle, generatedLine, info })`. It reads the logo once, creates the `PDFDocument` (A4 landscape, `bufferPages`), wires the `pageAdded` header, draws the first header, and returns `{ doc, finished }`;
- `drawTableHeader(doc, y, columns)` (the `#F2F4F7` band) and `drawBand(doc, y, text)` (the ink unit band);
- `finishWithFooter(doc, label)`: footer on every page, "Page x of y", `doc.end()`, and the `bottom = 0` margin trick.

`weeklyInspectionPdf.js` keeps only its own table and summary logic. **Check that its output is unchanged** (acceptance check 2).

### `yearlyInspectionPdf.js` (new)

`buildYearlyInspectionPdf(model, { generatedBy })` returns `Promise<Buffer>`, A4 landscape, through `createReportDocument`:

- **Header:** "Yearly inspection report", then "{plant} · {year}" plus " · 1 Jan – 21 Oct 2026 (year to date)" when `isPartialYear`, then the "Generated …" line.
- **Location summary**, four tiles drawn as boxes across the width:
  - Inspections conducted "N of M (P%)", in the completion band colour;
  - Observation reports "K" with "of N conducted";
  - Observations recorded "T";
  - Closures approved "A" with "B open".

  Then one line: "Zones scheduled X · not scheduled Y".
- **One table per unit:** the ink band with the unit name, then this column header:

| Column | Width | Content |
|---|---|---|
| Zone | 190 | zone name |
| Scheduled | 80 | count, or "Not scheduled" in grey when 0 |
| Conducted | 80 | count |
| Completion | 110 | "90%" with a horizontal bar 60 × 6 pt drawn under the text (track `#EAECF0`, fill `INK`); the whole cell takes the band fill from D10 |
| Observation reports | 100 | count |
| Observations | 80 | count |
| Closures approved | 70 | count |
| Closures open | 60 | count |

  Widths total 770. Each table ends with a **unit total row** in Helvetica-Bold above a 1 pt `#D0D5DD` rule. Page breaks follow the weekly builder: redraw the band "(continued)" and the column header.
- **Last block:** "All units" as a single table, one row per unit with the same columns plus a location total row.
- **Footer:** "© {year} Sona Comstar · EHS Inspection · Yearly inspection report", "Page x of y".

## Frontend

### Roles, route and navigation

- In `constants/roles.js`, add `REPORT_ROLES = Object.freeze([APP_ROLES.EHS_OFFICER])` and `export function canViewReports(user) { return hasAnyRole(user, REPORT_ROLES); }`.
- In `app/routes.jsx`, under `AppLayout`, add `<Route path="/reports" element={<RequireRole roles={REPORT_ROLES}><ReportsPage /></RequireRole>} />`.
- In `layouts/Sidebar.jsx`, add `{canViewReports(user) && <SidebarLink label="Report" path="/reports" icon="R" />}` after the Plan link. The mobile sidebar grid (`.sidebar-navigation`, 3 columns under 760 px) then wraps the fifth link onto a second row. That is acceptable, and the change needs no CSS.

### Feature folder: `frontend/src/features/reports/`

| File | Role |
|---|---|
| `reports.service.js` | `fetchWeeklyReportWeeks()`, `fetchWeeklyReport(weekStart)`, `fetchWeeklyReportPdf(weekStart)` (blob), `fetchYearlyReportYears()`, `fetchYearlyReport(year)`, `fetchYearlyReportPdf(year)` (blob). Thin `apiRequest` / `apiBlobRequest` wrappers; encode query values with `URLSearchParams`. |
| `useReportOptions.js` | Loads the weeks and years lists once, on mount, with the `cancelled` flag pattern. Returns `{ weeks, years, location, loading, error }`. |
| `useReport.js` | `generate({ type, period })` loads the JSON, `download({ type, period, fileLabel })` fetches the PDF blob and saves it through an object URL (the `useInspectionReport` pattern), plus `report`, `generating`, `downloading`, `error` and `clear`. Ignores a response that arrives after a newer `generate` (keep a request counter). |
| `ReportsPage.jsx` | The page (layout below). It reads and writes `type`, `week` and `year` with `useSearchParams`. |
| `ReportToolbar.jsx` | Type tabs, period picker, **Generate report**, **Download PDF (full report)**. |
| `ReportHeader.jsx` | The in-page document header: `CompanyLogo` (`surface="light"`, about 150 px wide), the title, "{plant} · Week 40, 2026 · 28 Sep – 4 Oct 2026" or "{plant} · 2026 (1 Jan – 21 Oct, year to date)", and "Generated {date}". |
| `WeeklyReportView.jsx`, `WeeklyFilters.jsx`, `WeeklyInspectionRow.jsx` | The weekly report |
| `YearlyReportView.jsx`, `YearlyUnitTable.jsx`, `ZoneWeekStrip.jsx` | The yearly report |
| `reportFormat.js` | `formatPercent`, `completionBandClass(band)` and status-to-class maps, shared by both views |

Remove `features/patrols/WeeklyReportPanel.jsx` and `features/patrols/useWeeklyReport.js`, and their imports, use and service functions (`fetchWeeklyReportWeeks` and `fetchWeeklyInspectionReport` in `patrol.service.js`). Under the Plan page's `planning-report-note`, add one sentence: "Weekly and yearly reports with observations and closures are on the [Report](/reports) page." Use a `Link`.

### Page layout

```
EYEBROW "EHS Officer"                                  (page header pattern, design reference §4)
Reports
"Inspection reports for {location}, viewable here and downloadable as PDF."

┌ card ─────────────────────────────────────────────────────────────┐
│ [ Weekly ] [ Yearly ]                 ← .observation-tabs           │
│ Week [ W40 2026 · 28 Sep to 4 Oct · 3 of 5 inspected  ▾ ]           │
│      or Go to week [ 14 ] of [ 2024 ]                               │
│      or  Year [ 2026 (year to date) ▾ ]                             │
│ [Generate report]  [Download PDF (full report)]                     │
└───────────────────────────────────────────────────────────────────┘

(empty note until a report is generated: "Choose a week and select Generate report.")

┌ report sheet (white card, 15 px radius) ───────────────────────────┐
│ ReportHeader                                                        │
│ summary tiles (.dashboard-metrics-grid / .metric-tile)              │
│ filters / table / sections                                          │
└───────────────────────────────────────────────────────────────────┘
```

- Use the existing classes: `observation-section-header`, `observation-tabs` and `observation-tab(-active)`, `roster-panel`, `roster-controls`, `observation-history-filter` (for the selects), `button button-primary` / `button-secondary`, `metric-tile*`, `closure-empty-note`, `Alert` and `LoadingSpinner`. Add new classes only for what has no equivalent (D13).
- While generating, show `LoadingSpinner` inside the report area only, never over the whole page. On error, show an `Alert type="error"` with the server's message, and keep the previous report hidden.
- If `useReportOptions` returns no weeks, the Weekly tab shows `closure-empty-note` "No inspections have been scheduled at your location in the last year." and disables both buttons.

### Weekly report: interactions

- **Summary tiles** (the `metric-tile` pattern), one each for:
  - Zones to be inspected;
  - Zones inspected, with a bar and "P%";
  - Zones not inspected;
  - Inspected with observations;
  - Inspected, no observation to record;
  - Observations, with "High h · Medium m · Low l";
  - Closures, with "approved a · awaiting b · in progress c · returned r".

  The four outcome tiles are **buttons**: clicking one sets the outcome filter. `aria-pressed` reflects the active filter.
- **Filters bar** (`WeeklyFilters`):
  - outcome chips: All, Not done, No observation, With observations;
  - a Unit select (All units, or one);
  - a Risk select (Any, High, Medium, Low), which keeps inspections with at least one observation of that risk;
  - a search box that matches zone, auditor or auditee, case-insensitive;
  - "Expand all" / "Collapse all";
  - a live count, "Showing 7 of 12 inspections".

  Filters are plain component state, not in the URL.
- **Units** are collapsible sections: a band in the ink style with the unit name, counts and a chevron button with `aria-expanded`. All start open. A unit with nothing left after filtering is hidden.
- **Each inspection** is one summary row (CSS grid; under 1050 px use the existing `data-label` stacking technique from `.weekly-list-row`). It shows zone and date, auditor and auditee, a status chip (red "Not done" with "Due by Thu 1 Oct" when `notYetDue`; green "Inspected · No observation to record"; green "Inspected · 3 observations"), the report number and the closure label.
  - Rows with observations have a **Show observations** toggle (`aria-expanded`, `aria-controls`). It reveals an inner table: # · Area · Cat. · Risk · Observation · Action plan (+ "2 evidence photos") · Target date.
  - Risk shows as text in a chip, with **High** in bold. No new colours.
  - A returned closure shows its review comments under the closure label.
- **Empty filter result:** `closure-empty-note` "No inspections match these filters." with a **Clear filters** button.

### Yearly report: interactions

- **Summary tiles:**
  - Inspections conducted "38 of 42" with a bar and "90%";
  - Observation reports "29";
  - Observations "41";
  - Closures approved "27" with "2 open";
  - Zones "12 scheduled · 1 not scheduled".
- **Controls:** a Unit select, "Show only zones below 100%", and a sort select (Unit and zone · Completion, lowest first · Scheduled · Observation reports · Closures open).
- **Table:** one block per unit.
  - A unit header row shows the unit's totals and a completion bar, with an expand/collapse chevron. Units start **collapsed** when there are more than 4, else open.
  - Under it are its zone rows, with columns: Zone · Scheduled · Conducted · Completion (bar + % + band chip) · Observation reports · Observations · Closures approved · Closures open.
  - "Not scheduled" zones show grey text and "–" for completion.
- **Column headers are sort buttons** with `aria-sort`, synchronised with the sort select. Sorting applies to zones within each unit; units keep their order unless the sort is by completion, in which case units also sort by their own percentage.
- **Zone row → week strip.** Clicking a zone row (a button, `aria-expanded`) reveals `ZoneWeekStrip`: one small square per inspection week in the period (`weeks`), green when `conducted ≥ scheduled`, red otherwise, labelled "W14" underneath and with a `title` such as "Week 14: 1 of 1 conducted". This is the year at a glance for that zone. Weeks with nothing scheduled are not in `weeks` and are not drawn.
- **Location total row** at the bottom, in bold.

### CSS (`/* Reports */` section in `global.css`)

Only what is missing:

- `.report-sheet`: the card recipe (white, `#dfe4e9` border, 15 px radius, `--shadow-card`, padding `22px`). At 760 px and below the padding is 14 px.
- `.report-header`: flex, space-between, bottom hairline. The logo is about 150 px wide on desktop and 120 px under 650 px.
- `.report-filters`: flex-wrap row, gap 10 px.
- `.report-chip-button`: the pill recipe as a button, with `[aria-pressed="true"]` as the ink fill and white text.
- `.report-unit-band`: ink band with white text, as in the PDF, radius 10 px, with a chevron button.
- `.report-row`, `.report-row-header`: grid templates for the weekly summary rows and the yearly table. Reuse the `data-label` stacking idea under 1050 px.
- `.report-status-done`, `.report-status-missed`: the docs/21 greens and reds.
- `.report-band-complete`, `.report-band-behind`: D10. `ON_TRACK` gets no class.
- `.report-bar`: reuse `.metric-tile-bar` markup where possible; otherwise the same recipe at 6 px.
- `.report-week-strip`, `.report-week-cell`: 14 px squares with a 3 px radius and a 4 px gap, wrapping.
- `@media print`: hide the sidebar, the topbar and `.report-toolbar`, and let the report sheet take the full width. This is a convenience; the PDF download remains the supported way to print.

Every colour is one already in the stylesheet or in docs/21's PDF palette.

## Documentation to update in the same change

- `docs/04-api-reference.md`: a new **Reports** section with the six routes, their parameters, both raw model shapes and the error table. Remove the two `/api/patrols/weekly-report` sections and point them to the new one.
- `docs/06-frontend.md`:
  - the `/reports` route, its role gate, the `reports` feature folder and its interactions;
  - the Plan page losing `WeeklyReportPanel`;
  - the sidebar's new link.
- `docs/05-workflows.md`: extend the weekly report paragraph from docs/21, and add the yearly counting rules (D8, D9, D10).
- `docs/09-feature-refinement-backlog.md`: the out-of-scope items. Mark backlog 3.20 (from docs/21) as covering both reports.
- `docs/README.md`: link this plan.
- `CLAUDE.md`:
  - replace the weekly PDF paragraph with one on the `reports` module: `/api/reports/*`, `REPORT_ROLES`, raw model → JSON and PDF, and `pdfLayout.js`;
  - add `/reports` to the frontend route list ("Only `/plan` and `/reports` are role-gated");
  - bump "`docs/10` to `22`" to `23`.

## Acceptance checks

Run in the containers. To build or run scripts without touching the host `node_modules`, use the `docker run … node:22-alpine` pattern from docs/21 and a scratch directory outside the repository.

1. **Build:** `docker compose up -d --build backend frontend` succeeds, and the backend log shows the API started.
2. **Weekly PDF unchanged:** render the docs/21 fixture through the moved builder (adapted to ISO dates) and through the version at `HEAD~` with `pdftotext -layout`. The text output must be identical apart from the footer year.
3. **Access:**
   - `test.ehs.officer` gets 200 on all six routes;
   - `test.hod`, `test.plant.head` and `test.auditor` get `403 INSUFFICIENT_PERMISSIONS`;
   - `noplant.officer` gets `403 OFFICER_LOCATION_NOT_SET`;
   - the old `/api/patrols/weekly-report` returns 404.
4. **Weekly JSON against the database:** for week 39 of 2026 in the development data (`weekStart=2026-09-21`), the JSON lists six inspections in two units. Zone 1 of Unit I has three audits, two filed and one not, and counts as **not inspected**. Zone 3 shows "No observation to record". The summary is 4 to inspect, 1 inspected, 3 not inspected. The PDF from `/weekly/pdf` shows the same figures.
5. **Yearly JSON:**
   - pick a zone and check `scheduled`, `conducted`, `observationReports`, `observations` and `closuresApproved` against direct SQL over `patrols`, `observation_reports`, `observation_items` and `closure_requests` for the same zone and period;
   - the unit and location totals equal the sum of their zones, and each percentage is recomputed from the sums;
   - an active zone with no patrols appears as "Not scheduled" and is not in any percentage.
6. **Year edge cases:**
   - `year=2027` (future) gives 400 `YEAR_NOT_STARTED`;
   - `year=1999` gives 400 `INVALID_YEAR`;
   - `year=abc` gives 400 `VALIDATION_ERROR`;
   - a past year with no data gives 200 with every zone "Not scheduled".
7. **Yearly PDF:** it opens, has the header and footer on every page, the unit tables and a location total, and green or red completion cells that also carry the percentage. A unit long enough to break across pages repeats its band "(continued)" and the column header.
8. **Page:**
   - the Report link shows only for `test.ehs.officer`;
   - `/reports` redirects anyone else to `/dashboard`;
   - Generate shows the report in the page;
   - weekly filters and tiles narrow the rows and update the "Showing x of y" count;
   - observation rows expand and collapse;
   - yearly sort, filter, unit collapse and the zone week strip all work;
   - Download PDF saves the full report while filters are active;
   - `?type=yearly&year=2026` opened directly generates that report;
   - check at 1280, 760 and 375 px wide;
   - keyboard only: every toggle, chip and sort header is reachable and announces its state.
9. **Plan page:** the weekly panel is gone, the `.xlsx` download still works, and the link to Report is there.

## Open questions for the user

The defaults above stand unless the user says otherwise.

- **Q1** Should `ADMIN` see the Report page too? Default: no, EHS Officer only. Admin also gets the Plan page today.
- **Q2** In the yearly report, does "closures" mean closures **approved** (default, matching the example's 27 < 29) or closures **raised**, which always equals the observation report count?
- **Q3** For the current year, count only inspections scheduled **up to today** (default) or every inspection scheduled to 31 December? The second makes the percentage look low for most of the year.
- **Q4** Are the completion bands right: 100% green, 75–99% neutral, below 75% red? Or should there be a different target, such as 90%?
- **Q5** Is the 52-week week picker plus the "Go to week" jump enough for older weeks (for example Week 14, 2024)? Or should the picker list every week since inspections began? Default: picker plus jump. The jump's two inputs sit beside the picker and use the same Generate and Download buttons.
- **Q6** Should the interactive report also be downloadable as a standalone `.html` file that works offline? Default: no, PDF only, as asked.
