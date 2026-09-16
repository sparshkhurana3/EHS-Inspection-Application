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

- **Page**: spinner → header with Refresh → alerts → one of: "No current auditor assignment", `ExistingReportCard` (status mapped to "Closed" for `CLOSED|COMPLETED|APPROVED`, else "In Progress"), or `ObservationCard` form.
- `ObservationCard`: read-only assignment panel (status chip hard-coded "Scheduled") + form: `findingDate` (date), `location` (select over a hard-coded five-plant list), read-only observation location, `category` (UC/UA), `PhotographInput`, `description` textarea with live word count, `RiskSelector` (HIGH/MEDIUM/LOW as `role="radio"` buttons), submit "Send Observation for Closure".
- `PhotographInput`: hidden file input, accept `.jpg,.jpeg,.png,.svg` + MIME types, Replace/Remove buttons. **Renders the preview URL as text instead of an `<img>`** (`PhotographInput.jsx:76-78`).
- **Hook** `useObservations`: form state seeded with today's local date; limits `MAX_IMAGE_SIZE` 10 MB, `MAX_DESCRIPTION_WORDS` 500 (keystrokes beyond the limit are discarded), MIME whitelist `image/jpeg|png|svg+xml`. `validateForm` order: assignment id → no existing report → findingDate → location → category → photo present/type/size → description non-empty/≤500 words → risk. On success seeds `existingReport` optimistically with `status: "PENDING_AUDITEE_ACTION"`.
- **Service**: `GET /observations/current-assignment` (**backend path is `/current-assignments`**), `POST /observations` multipart with `patrolId, findingDate, location, category, description, riskCategory, photograph`.
- **Fields read**: `assignment` (`id`, `plantLocation`, `weekNumber`, `unitNumber|unitName`, `zoneNumber|zoneName`, `observationLocation|areaDetail`, `auditeeName`, `ehsOfficerName`, `auditorName`), `report` (`id`, `status`, `reportNumber`, `submittedAt`), and on POST `message`, `reportId`, `report`.

### closures

- **Page**: role-switched copy (`isEhsOfficer`). EHS Officer branch renders `PendingApprovalList` (queue of closures) and the selected closure; auditee branch renders the current closure with `ActionPlanForm` (hidden when awaiting approval or approved) and `ApprovalPanel` (always). Observation details shown in 12 static fields plus description and `ObservationPhotograph` (blob preview).
- `ActionPlanForm`: `actionPlan` textarea (255-word counter), `targetDate`, `responsibleHodName` (maxLength 255). "Save Action Plan" and "Send report for closure"; the latter enabled only when status is `IN_PROGRESS` and all three fields are filled. References an undeclared `editable` variable (crash, see gaps).
- `ApprovalPanel({ closure, canReview, approving, rejecting, onApprove, onReject })`: when pending (`SUBMITTED_FOR_CLOSURE|PENDING_EHS_APPROVAL`) and `canReview`, shows a comments textarea (1000 chars) with "Send for Re-examination" (comments required) and "Approve and Close".
- **Hook** `useClosures`: state for closure, pending approvals, selected approval, form values, five busy flags, error/success, photograph preview/loading/error. `isEhsOfficer` derived from a `useAuth()` call that never returns `user`, so it is always `false`. Limits: `MAX_ACTION_PLAN_WORDS` 255; save requires all three fields; reject requires comments.
- **Service** (`closure.service.js`): `GET /closures/current`, `GET /closures/pending-approvals`, `GET /closures/:id/approval` (unused), `PATCH /closures/:id/action-plan` `{ actionPlan, targetDate, responsibleHodName }`, `POST /closures/:id/submit` (no body), `POST /closures/:id/approve` `{ reviewComments }`, `POST /closures/:id/reject` `{ reviewComments }`, `GET /observations/:reportId/photograph` via an undefined `apiBlobRequest`. **Only `current`, `action-plan`, and `submit` exist on the backend.**
- **Fields read**: `closure`/`closures[]`/`message`; on the closure: `id`, `observationReportId`, `status`, `displayStatus`, `actionPlan`, `targetDate`, `responsibleHodName`, `completionDate`, `submittedForClosureAt`, `reviewComments`, `rejectionComments`, `reportNumber`, `weekNumber`, `unitNumber|unitName`, `zoneNumber|zoneName`, `scheduledDate`, `findingDate`, `plantLocation`, `observationLocation|areaDetail`, `category`, `riskCategory`, `auditorName`, `auditeeName`, `ehsOfficerName`, `observationDescription|description`, `photographPath`, `photographOriginalName`. Status labels: `APPROVED|CLOSED` → Closed, `SUBMITTED_FOR_CLOSURE|PENDING_EHS_APPROVAL` → Pending EHS Approval, `REEXAMINATION_REQUIRED`, `IN_PROGRESS`, default Open (`REJECTED` handled only in `ActionPlanForm`).

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
