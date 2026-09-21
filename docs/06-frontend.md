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

- **Page**: header copy varies by role; "Refresh dashboard" button (never disabled); error alert; a "navigation unavailable" warning; `PatrolCalendar`; then `WeeklySummary` for management roles or `AuditStatusCards` for everyone else. Whole page is a spinner while loading.
- **Deep links**: clicking an audit card builds `/observations?auditId=…` (auditor) or `/closures?auditId=…&reportId=…` (auditee with an open report). Neither target page reads those params.
- `AuditStatusCards({ audit, onOpen })`: empty card, "task completed" card (checks `taskCompleted` / `taskState === "TASK_COMPLETED"` in both cases), or a clickable upcoming-audit card with an action caption.
- `WeeklySummary({ week, expanded, onToggle })`: collapsible week card with a six-column audit list.
- `PatrolCalendar({ year, month, audits, onPreviousMonth, onNextMonth })` lives in `features/patrols/` but is used here. Monday-first grid, max two chips per day plus "+n more".
- **Hook** `useDashboard`: `selectedPeriod {year, month}`, `dashboardData { role, audits, nextAudit, nextWeek }`, refetches on period change. No client validation.
- **Service**: `GET /dashboard?year=&month=`.
- **Fields read**: `role`, `audits[]`, `nextAudit`, `nextWeek`. Audit: `id`, `scheduledDate`, `assignmentRole` (`AUDITOR`|`AUDITEE`), `hasOpenObservationReport`, `observationReportId`, `weekLabel`, `zoneName`, `areaDetail`, `unitName`, `auditorName`, `auditeeName`, `status`, `taskCompleted`, `taskState`, `message`. Week: `weekLabel`, `weekNumber`, `startDate`, `endDate`, `totalAudits`, `audits[]`. Every field is also accepted in `snake_case`.

### observations

- **Page** (`ObservationPage`): two tabs kept in the query string — **This week** (`?` empty) and **Past 6 months** (`?view=history&filter=`). `?patrolId=` opens the form, `?reportId=` opens the detail, so dashboard deep links and the back button both work.
- **This week**: `PendingObservationList` (each row shows `Due Thu …` or an `Overdue` chip, and two buttons: *Fill report* and *No observation to record*, the latter behind a `window.confirm`) and `SubmittedObservationList` (status chip = `displayStatus`, meta line = "N observations · highest risk HIGH", plus `lifecycleLabel` once a closure or ticket exists).
- **Form** (`ObservationCard`): the header fields appear **once** (week number, audit date, location, unit, zone, auditor, auditee, EHS Officer, finding date); then one `ObservationItemFields` per observation — area, category, `PhotographInput`, description with word count, `RiskSelector` — with **Add another observation** up to 10 and a Remove button when more than one. Field ids are suffixed with the index so labels stay unique.
- **Detail** (`ObservationDetail`): header once, then one block per observation with its own photograph, then a "Closure and corrective action" block when a closure or ticket exists.
- **History** (`ObservationHistory`): filter select (All / Closed via ticket / No observations / In progress) over a six-column row grid; clicking a row opens the detail with the filter preserved.
- **Hooks** (`useObservations.js`): `useWeeklyObservations`, `useObservationForm` (array of items, each with its own photograph and preview URL; every URL revoked on reset/unmount), `useNoObservation`, `useObservationHistory(filter)`, `useObservationDetail` (fetches each item's photograph into `photographs` keyed by item id).
- **Service**: `GET /observations/current-assignments`, `GET /observations/history?filter=`, `GET /observations/:id`, `POST /observations` (multipart: `patrolId`, `findingDate`, `observations` JSON, `photographs` files in matching order), `POST /observations/no-observation`, and the two photograph blob routes.

### tickets

- **Page** (`TicketPage`, `ACTION_HOD` only): tabs **Tickets** / **History** in the query string (`?view=history&filter=`). Tickets tab lists Open, In progress, **Pending approval**, and Closed in the last 30 days; History (`TicketHistory`) is six months of the HOD's own tickets with a status filter.
- **`TicketActionPanel`**: OPEN → accept or "Reject and send for approval"; IN_PROGRESS → evidence input plus a **Resolution** block (required "what was done", editable type of work) and **Submit resolution for approval**; PENDING_APPROVAL → read-only "Awaiting EHS Officer approval"; CLOSED → the outcome and who approved it. A reopened ticket shows a warning banner with the officer's reason.
- **Officer side**: `features/closures/TicketApprovalQueuePage.jsx` (reached from the Closures page's **Ticket approvals** button, `?view=ticket-approvals`) lists what HODs have sent and offers **Approve and close** or **Reopen and send back** (required reason, confirmed because it deletes their photographs).
- **Hooks** (`useTickets.js`): `useHodTickets` (four buckets), `useTicketDetail`, `useTicketDecision`, `useTicketEvidence`, `useSubmitResolution`, `useTicketHistory(filter)`, `useTicketApprovals`.

### closures

- **Page** (`ClosurePage`): the auditee's pending/lapsed/completed lists, or one closure's detail (`?closureId=`), or the EHS Officer's approval queue (`?view=approvals`).
- **Detail**: `ObservationSummary` (every observation with its own photograph) then `ActionPlanForm`, which renders the closure header once — observation count, `n/m tickets resolved`, status chip — and one **`ActionPlanItemForm`** per observation: that observation's description and photograph, its own action plan, target date and "Assign to department" select, and its own `TicketStatusCard`. Each item saves independently; fields disable once that department has decided, with a note saying why. One page-level **Send closure for approval** button, enabled by `closure.canSubmitForClosure`.
- **`ClosureItemSummary`**: the read-only version of the same block, used by the approval queue and the officer's dashboard zone view.
- **Hooks** (`useClosures.js`): `useAuditeeClosures`, `useClosureDetail` (closure + every observation's photograph keyed by observation id), `useActionHodOptions` (plant-scoped, shared by every item), `useClosureItemForm({ closureId, item, onSaved })` — one per observation — and `useClosureSubmission`.
- **Service**: `GET /closures`, `GET /closures/pending-approvals`, `GET /closures/:id`, `GET /closures/:id/action-hods`, `PATCH /closures/:id/items/:itemId/action-plan`, `POST /closures/:id/submit|approve|reject`.

### patrols

- **Page** `PlanningPage`: spinner → header with "Refresh Users" and "Schedule an Audit" → alerts → last scheduled patrol summary (status hard-coded "Scheduled") → `PatrolForm` or empty state. Labels itself "EHS Officer workflow" but is reachable by any user.
- `PatrolForm`: selects for `location` (five plants, different order from the observation list), `unit` (`"1"`–`"5"`, hard-coded), `zone` (`"1"`–`"9"`, hard-coded), `areaDetail` (nine hard-coded areas), `scheduledDate` (`min` = today), `auditorId`, `auditeeId` (from lookups). Submit disabled when either user list is empty.
- **Hook** `usePatrols`: validation order location → unit → zone → areaDetail → scheduledDate (required + parseable, no JS future check) → auditorId → auditeeId → auditor ≠ auditee. Coerces ids with `Number()`.
- **Service**: `GET /patrols/planning-lookups`, `POST /patrols` `{ location, unit, zone, areaDetail, scheduledDate, auditorId, auditeeId }`.
- **Fields read**: `auditors[]`, `auditees[]` (`id`, `fullName|name`, `username`), `patrol` (`location`, `scheduledDate`, `unit`, `zone`), `message`.

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
