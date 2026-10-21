# 6. Frontend reference

React 19 + Vite 8 + react-router-dom 7, plain CSS. Entry `main.jsx` → `app/App.jsx` → `BrowserRouter` > `AuthProvider` > `AppRoutes`. No state or data-fetching library: each feature owns a `use*.js` hook that calls a `*.service.js` module, which calls the single `apiRequest` helper.

Line references are as of commit `24bb98a`.

## Routing and layouts

| Path | Element | Wrapped by | Notes |
|---|---|---|---|
| `/` | `HomePage` | none | Public landing page. No redirect for signed-in users |
| `/sign-in` | `LoginPage` | `AuthLayout` (used inside the page, not as a route) | |
| `/sign-up` | `SignupPage` | `AuthLayout` | |
| `/dashboard` | `DashboardPage` | `AppLayout` | |
| `/ehs-officer` | `Navigate → /dashboard` | `AppLayout` | Alias for the backend's EHS Officer `redirectTo` |
| `/observations` | `ObservationPage` | `AppLayout` | Ignores query params (see gaps) |
| `/closures` | `ClosurePage` | `AppLayout` | Ignores query params |
| `/plan` | `PlanningPage` | `AppLayout` | **No role gate** |
| `*` | `Navigate → /` | none | |

- The only auth guard is in `layouts/AppLayout.jsx:30-37`: no token → `<Navigate to="/sign-in" replace />`. There is no role-based route guarding anywhere.
- `AppLayout` renders `Sidebar` + top bar (name from `user.fullName ?? name ?? username`, roles joined with commas) + `<Outlet/>`. Sign-out clears storage and navigates to `/sign-in`.
- `AuthLayout` is a presentational two-column wrapper with props `{ title, description, children }`, imported directly by the two auth pages.
- `Sidebar` shows Dashboard / Observation / Closure, plus "Plan" gated on `const canPlanAudits = true` (`Sidebar.jsx:130`), i.e. always. It contains ~70 lines of unused role helpers and imports the wrong auth hook (see gaps).

## Auth and session

- localStorage keys `ehs_access_token` (JWT) and `ehs_user` (JSON). The literals are duplicated in `app/authProvider.jsx`, `features/auth/useAuth.js`, and `services/apiClient.js`.
- `app/authProvider.jsx` exposes `useAuthenticatedUser()` → `{ user, isAuthenticated, setAuthenticatedUser, logout }`. `isAuthenticated` is `Boolean(user && localStorage token)` memoised on `user`, so it is not reactive to storage changes from other tabs.
- `features/auth/useAuth.js` is the **form** hook: `{ loading, error, successMessage, login, signup, clearMessages }`. It does not return `user`. `login`/`signup` write the token/user to storage themselves *and* call `setAuthenticatedUser`, so both keys are written twice.
- Pages: `LoginPage` (identifier + password) and `SignupPage` (fullName, username ≥3, email, password ≥8 with help text, confirmPassword). Both navigate to `result.redirectTo ?? "/dashboard"` after success. The backend field is also `redirectTo`, so they agree.
- `auth.service.js`: `POST /auth/login` `{ identifier (trimmed, lowercased), password }`, `POST /auth/signup` `{ fullName, username, email, password, confirmPassword }`, `GET /auth/me` (`fetchCurrentUser`, never called).
- `services/apiClient.js`: base URL `VITE_API_BASE_URL ?? http://localhost:3000/api`; adds Bearer header; sets JSON content type unless body is `FormData`; parses JSON or wraps text as `{ message }`; throws `Error` with `.status/.code/.details` on non-2xx. **No 401 handling**: an expired token leaves the user inside the shell seeing per-page error alerts.

## Shared components

| Component | Props | Notes |
|---|---|---|
| `Alert` | `type="error"`, `title`, `children` | `role="alert"` only for errors, else `role="status"`. CSS variants: error, warning, success |
| `Button` | `children, to, variant="primary", type, disabled, className, onClick` | With `to` renders a router `Link` and silently drops `disabled`/`onClick`/`type` |
| `LoadingSpinner` | `message="Loading..."` | `role="status" aria-live="polite"` |

`constants/roles.js` (`APP_ROLES`, `MANAGEMENT_ROLES`, `normalizeRole`, `hasManagementRole`) is used only by `DashboardPage`; `useClosures.js` and `Sidebar.jsx` carry their own diverging copies.

## Features

### dashboard

- **Metrics** (`DashboardMetrics`, above `PatrolCalendar`): year-to-date tiles from `metrics`/`metricsPeriod`. Three for management, two for a user; `scope` (`PLANT` | `SELF`) picks which. A tile with an `of` prop draws a progress bar, one without is a plain total. Returns `null` when `metrics` is absent, so an older API response degrades to the previous layout.
- **`useDashboard` copies the response field by field**, so anything a page needs must be listed in *both* the initial state and the success mapping. `metrics` was returned by the API for months and silently dropped here because it was in neither.
- **Page**: header copy varies by role; "Refresh dashboard" button (never disabled); error alert; a "navigation unavailable" warning; `DashboardMetrics`; `PatrolCalendar`; then, for a management user (`hasManagementRole({ roles })`), their own `AuditStatusCards` **only when `nextAudit` is non-null** (a rostered officer's task, or "task completed") followed by `OfficerWeekCard` (role `EHS_OFFICER`) or `WeeklySummary` (HOD, Plant Head, Admin); for everyone else `AuditStatusCards` alone, empty state included. Whole page is a spinner while loading. Until [20](20-dashboard-assignment-editing-plan.md) D1 the page called `hasManagementRole(userRoles)` with an array, which always returned `false`, so every user got the ordinary card and the week card never rendered.
- **Deep links**: clicking an audit card builds `/observations?auditId=…` (auditor) or `/closures?auditId=…&reportId=…` (auditee with an open report). **Still broken**: `ObservationPage` reads `patrolId`/`reportId` and `ClosurePage` reads `closureId`, so the click lands on the page's default list. See the backlog.
- `AuditStatusCards({ audit, onOpen })`: empty card, "task completed" card (checks `taskCompleted` / `taskState === "TASK_COMPLETED"` in both cases), or a clickable upcoming-audit card with an action caption.
- **`useOfficerWeek(initialWeek)`** (the officer's week and its navigation): `{ week, selectedWeekStart, loading, error, successMessage, setSuccessMessage, goToWeek, goToPreviousWeek, goToNextWeek, goToCurrentWeek, reload }`. **Called by `DashboardPage`, not by the card**, because the page's spinner unmounts the card on every dashboard reload and the week chosen, and a save's confirmation, must outlive that. `selectedWeekStart` is `null` for the default week and is set only once a request for a chosen week succeeds, so a failed navigation leaves the week on screen and shows the error on the card. While it is `null` the hook re-seeds from the dashboard's `officerWeek` on every dashboard reload (during render, so the old week never paints); once the officer has navigated, dashboard reloads leave the week alone and "Refresh dashboard" calls `reload()` as well. Every date comes from the server (`previousWeekStart`, `nextWeekStart`, `currentWeekStart`); only the newest request may change the week, so a slow response cannot overwrite a later click. `loading` is its own flag, never the page spinner.
- **`OfficerWeekCard`** props: `week, loading, error, successMessage, onSuccessMessageChange, onPreviousWeek, onNextWeek, onCurrentWeek, onReload`. Heading "This week" / "Upcoming week" / "Past week", then "Week N · date to date" and the audit count. **Previous / This week / Next** sit in a row outside the expand button (buttons cannot nest), each disabled while loading or when there is no such week; "This week" also when already on it. The expanded state lives in the card and survives navigation. Empty states: "No inspections are scheduled. Upload the weekly roster on the Plan page." only when no other week has inspections either, else "No inspections are scheduled this week."; an empty week has no expand button. Planning-lookups users load once per mount. `saveAssignment` sends a `ZONE` save to `updateZoneAssignment` with `fromDate: week.zoneEditFromDate`, and an `AUDIT` save to `updatePatrolAssignment` with `applyToUpcoming: false` (it never sends `true`), then shows the response `message` as a card-level success `Alert` and calls `onReload()`.
- **`ZoneAssignmentRow`**: **Edit** shows when `canEditAssignment || canEditZone`, so never in a past week. In edit mode a two-option radio group chooses the scope: "Every audit of this zone from {zoneEditFromDate} to {zoneEditToDate} ({n} audits)", enabled by `canEditZone` and the default when available, or "Only this audit on {date}", enabled by `canEditAssignment`. When this audit is under way a note says it keeps its auditor and auditee. Both selects mark the signed-in user "(you)" and add a fallback option for a current auditor or auditee no longer in `users` (deactivated or moved), so the select never silently shows somebody else; with `users` empty, Save is disabled and the row says "Assignments cannot be changed until the user list loads." Saving the same person on both sides is stopped on the client. The row passes `{ scope, patrolId, zoneId, auditorId, auditeeId }` up and expects `{}` or `{ error }`. A zone closed with no observations has no closure, so its detail shows a note instead of mounting `ZoneProgressDetail`. `UnitZoneSection` passes `zoneEditFromDate`/`zoneEditToDate` down. Every id comparison is `String(a) === String(b)`.
- `WeeklySummary({ week, expanded, onToggle })`: collapsible week card with a six-column audit list.
- `PatrolCalendar({ year, month, audits, onPreviousMonth, onNextMonth })` lives in `features/patrols/` but is used here. Monday-first grid, max two chips per day plus "+n more".
- **Hook** `useDashboard`: `selectedPeriod {year, month}`, `dashboardData { role, audits, nextAudit, nextWeek, officerWeek, metrics, metricsPeriod }`, refetches on period change. No client validation.
- **Service**: `GET /dashboard?year=&month=`; `fetchOfficerWeek({ weekStart })` → `GET /dashboard/officer-week`, with no query string when `weekStart` is empty (the API rejects an empty value).
- **Fields read**: `role`, `audits[]`, `nextAudit`, `nextWeek`, `officerWeek` (shape in [04](04-api-reference.md#get-apidashboardofficer-weekweekstart--planning_roles)). Audit: `id`, `scheduledDate`, `assignmentRole` (`AUDITOR`|`AUDITEE`), `hasOpenObservationReport`, `observationReportId`, `weekLabel`, `zoneName`, `areaDetail`, `unitName`, `auditorName`, `auditeeName`, `status`, `taskCompleted`, `taskState`, `message`. Week: `weekLabel`, `weekNumber`, `startDate`, `endDate`, `totalAudits`, `audits[]`. Every field is also accepted in `snake_case`.

### observations

- **Page** (`ObservationPage`): two tabs kept in the query string — **This week** (`?` empty) and **Past 6 months** (`?view=history&filter=`). `?patrolId=` opens the form, `?reportId=` opens the detail, so dashboard deep links and the back button both work.
- **This week**: `PendingObservationList` (each row shows `Due Thu …` or an `Overdue` chip, and two buttons: *Fill report* and *No observation to record*, the latter behind a `window.confirm`) and `SubmittedObservationList` (status chip = `displayStatus`, meta line = "N observations · highest risk HIGH", plus `lifecycleLabel` once a closure exists).
- **Form** (`ObservationCard`): the header fields appear **once** (week number, audit date, location, unit, zone, auditor, auditee, EHS Officer, finding date); then one `ObservationItemFields` per observation — area, category, `PhotographInput`, description with word count, `RiskSelector` — with **Add another observation** up to 10 and a Remove button when more than one. Field ids are suffixed with the index so labels stay unique.
- **Detail** (`ObservationDetail`): header once, then one block per observation with its own photograph, then a "Closure and corrective action" block when a closure exists.
- **History** (`ObservationHistory`): filter select (All / Closed / No observations / In progress) over a six-column row grid; clicking a row opens the detail with the filter preserved.
- **Hooks** (`useObservations.js`): `useWeeklyObservations`, `useObservationForm` (array of items, each with its own photograph and preview URL; every URL revoked on reset/unmount), `useNoObservation`, `useObservationHistory(filter)`, `useObservationDetail` (fetches each item's photograph into `photographs` keyed by item id).
- **Service**: `GET /observations/current-assignments`, `GET /observations/history?filter=`, `GET /observations/:id`, `POST /observations` (multipart: `patrolId`, `findingDate`, `observations` JSON, `photographs` files in matching order), `POST /observations/no-observation`, and the two photograph blob routes.

### closures

- **Page** (`ClosurePage`): the auditee's pending/lapsed/completed lists, or one closure's detail (`?closureId=`), or the EHS Officer's approval queue (`?view=approvals`).
- **Detail**: `ObservationSummary` (every observation with its own photograph) then `ActionPlanForm`, which renders the closure header once — observation count, `n/m planned`, evidence count, status chip — and one **`ActionPlanItemForm`** per observation: that observation's description and photograph, its own action plan and target date, and a **`ClosureEvidencePanel`** holding up to three photographs. Each item saves independently. One page-level **Send closure for approval** button, enabled by `closure.canSubmitForClosure` (every observation planned; evidence optional).
- **`ClosureEvidencePanel`**: the evidence route is authenticated, so each photograph is fetched as a blob by `useClosureEvidence` and shown from an object URL, revoked on unmount. Read-only (`editable={false}`) in the officer's `ClosureItemSummary`, where Attach and Remove disappear.
- **`ClosureItemSummary`**: the read-only version of the same block, used by the approval queue and the officer's dashboard zone view.
- **Approval** (`ApprovalQueuePage`, `ApprovalPanel`): the queue marks the auditee "(you)" on any closure where the signed-in user is the auditee, and the panel then shows a warning above the buttons: "You are the auditee of this audit, so approving it signs off your own action plans." It warns rather than blocks, because the officer approving their own closure is allowed ([20](20-dashboard-assignment-editing-plan.md) D9). Both compare `closure.auditeeId` with `useAuthenticatedUser().user.id` as strings and show nothing when the id is absent. The panel gets its closure from the queue row, not a detail fetch.
- **Hooks** (`useClosures.js`): `useAuditeeClosures`, `useClosureDetail` (closure + every observation's photograph keyed by observation id), `useClosureItemForm({ closureId, item, onSaved })` — one per observation — and `useClosureSubmission`.
- **Service**: `GET /closures`, `GET /closures/pending-approvals`, `GET /closures/:id`, `PATCH /closures/:id/items/:itemId/action-plan`, `POST /closures/:id/submit|approve|reject`, and the evidence routes.

### patrols

- **Inspection report**: a "Download inspection report" button in the Plan page header, backed by `useInspectionReport`. The route is authenticated, so the file is fetched with `apiBlobRequest` and handed to the browser through a temporary object URL — a plain `<a href>` could not carry the Bearer token.
- **Page** `PlanningPage`: spinner → header with the report download → a note describing the report → `WeeklyReportPanel` (week picker and "Download PDF", fed by `useWeeklyReport`, which loads `GET /patrols/weekly-report/weeks` and downloads `GET /patrols/weekly-report?weekStart=` as a blob) → `RosterUploadPanel` (upload, template download, current roster) → the single-audit exception form. Gated to `PLANNING_ROLES` by `RequireRole`, and the API enforces it too.
- `PatrolForm`: `scheduledDate` (`min` = today), `unit` and `zone` selects cascading from the lookups, the zone's areas shown read-only, then `auditorId` and `auditeeId` from the one `users` list, the auditee list leaving out whoever is the auditor. The signed-in officer is in both lists, marked "(you)" ([20](20-dashboard-assignment-editing-plan.md) D8); with nobody at the location the form says "No users are registered at this location." Every level has its own empty-state note.
- `RosterUploadPanel`: the re-upload confirmation says it "replaces the current roster and every upcoming Monday audit generated from it, including any auditor or auditee changes made from the dashboard". `RosterTable`'s "Effective A to B" caption is the upload's range and does not reflect later dashboard edits.
- **Hook** `usePatrols`: validation order unit → zone → scheduledDate → auditorId → auditeeId → auditor ≠ auditee → the zone has areas.
- **Service**: `GET /patrols/planning-lookups`, `POST /patrols` `{ zoneId, scheduledDate, auditorId, auditeeId }`, `GET`/`POST /patrols/roster`, `GET /patrols/inspection-report`, `updatePatrolAssignment({ patrolId, auditorId, auditeeId, applyToUpcoming })` → `PATCH /patrols/:id/assignment`, and `updateZoneAssignment({ zoneId, auditorId, auditeeId, fromDate })` → `PATCH /patrols/zones/:zoneId/assignment`. Ids are sent as `Number()`.
- **Fields read**: `location`, `units[]`, `zones[]` (with `areas[]`), `users[]` (`id`, `fullName`, `username`), `message`.

## Styling

`styles/global.css` (~1400 lines), one flat file with banner comments per area (buttons, homepage, planning, auth, shell/sidebar, dashboard, closure approval, responsive, observation, closure). Flat hyphenated class names prefixed by area (`home-*`, `auth-*`, `app-*`, `sidebar-*`, `dashboard-*`, `calendar-*`, `observation-*`, `closure-*`, `approval-*`, `patrol-*`), modifiers as second full classes. **No CSS custom properties**; the green palette (`#12b76a`, `#087f5b`, `#067647`, …) and neutrals are literal throughout. Grid for the shell (250px sidebar), auth split, calendar; flex for toolbars. Eight uncoordinated `max-width` breakpoints (1050, 960, 900, 760, 650, 640, 540). One spinner keyframe and a `prefers-reduced-motion` reset.

## Observed bugs and gaps

Grouped; the prioritised version is in [09-feature-refinement-backlog.md](09-feature-refinement-backlog.md).

**Crashes**
1. `ActionPlanForm.jsx:104,191,235,271,280` reference an undeclared `editable` → `ReferenceError` on first render of the auditee action-plan card. The closure page crashes for any auditee with an open closure.
2. `closure.service.js:110` calls `apiBlobRequest`, which does not exist anywhere. Photograph fetch always fails (caught, shown as photo error).
3. `useClosures.js:494-499` `updateField` spreads `{ ...currentValues, fieldValue }`, creating a key literally named `fieldValue`. Action-plan inputs are controlled and can never change.

**Wrong hook / missing gating**
4. `useClosures.js:8,176` and `Sidebar.jsx:5,126` import `features/auth/useAuth.js` and destructure `user`, which it does not return. `isEhsOfficer` is always false; the approval UI never shows.
5. `Sidebar.jsx:130` `canPlanAudits = true`; `/plan` has no route or nav gating.

**Backend mismatches**
6. `GET /observations/current-assignment` vs backend `/current-assignments`. Observation page 404s on every load.
7. `/closures/pending-approvals`, `/closures/:id/approval`, `/closures/:id/approve`, `/closures/:id/reject` have no server implementation.

**Session**
8. No 401 interception; no re-validation against `/auth/me`; storage keys duplicated in three files; double write on login.

**Dead / duplicated code**
9. Unused: `fetchCurrentUser`, `fetchClosureForApproval`, `PERMITTED_FORM_FIELDS`, four Sidebar role helpers.
10. Five copies of `getErrorMessage`, six copies of `formatDate` (`Intl.DateTimeFormat("en-IN")`), three role-normalisation implementations, two inconsistent status-label maps.

**Hard-coded values**
11. Plant lists in two orders; units/zones/areas hard-coded in `PatrolForm` despite fetching lookups; three "Scheduled" status chips that ignore data.

**Data-flow gaps**
12. Dashboard deep-link query params ignored by target pages.
13. Photo preview rendered as a URL string, not an image.
14. Closure page double-fetches on first load (`selectedApprovalId` is both a dependency and set inside `loadClosures`).
15. Refresh / month-navigation buttons never disabled during fetches; responses can arrive out of order.
16. Word-limit overflow discards keystrokes (breaks paste).

**Accessibility**
17. Headings inside buttons (`AuditStatusCards`, `WeeklySummary`); `role="radiogroup"` without keyboard handling (`RiskSelector`); `role="grid"` without `role="row"` (`PatrolCalendar`); required markers are `aria-hidden` with no `aria-required`; form errors not linked via `aria-describedby`/`aria-invalid`; disabled submit buttons give no reason.
