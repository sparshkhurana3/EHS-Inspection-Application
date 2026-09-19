# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Environmental Health & Safety (EHS) inspection tool for a manufacturing company. An EHS Officer schedules weekly **patrols** (auditor + auditee + zone), the auditor submits an **observation report** with a photograph, the auditee works a **closure** (action plan, assigned to an **Action Team HOD** → submit for closure), the Action Team HOD works a **ticket** (accept/reject the plan, attach evidence, close), and the EHS Officer approves the closure. Two independent packages, no monorepo tooling:

- `backend/` — Express 5 + `pg` REST API (ES modules, no TypeScript, no test suite, no linter).
- `frontend/` — React 19 + Vite + react-router-dom v7 SPA. Plain CSS in `src/styles/global.css`. No state library.

`folder_structure.txt` at the root is stale (missing the `patrols` module, migrations 005/006, and lists an `init.sql` that doesn't exist). Don't trust it; use `find`.

**Knowledge base**: `docs/` holds the detailed reference (overview, architecture, data model, API, workflows, frontend, environment, containerization plan, refinement backlog). Start at [docs/README.md](docs/README.md). Keep this file short and link there.

**Current state**: the stack runs in Docker and the five workflows (plan, observe, close, ticket, approve) work end to end. Migrations apply automatically on backend start. Remaining work is in `docs/09-feature-refinement-backlog.md`; the feature plans are `docs/10`, `11`, `12` and `13`.

## Commands

Install deps separately in each package (`npm install` in `backend/` and `frontend/`). There are no lockfile-level workspaces. **Host Node is v12**, which cannot run Express 5 or Vite 8; use Node ≥ 22 (nvm) or run in Docker (`docs/08-containerization-plan.md`). `backend/package.json` lacks `"type": "module"`; Node re-parses as ESM with a warning.

```bash
cp .env.example .env            # first run: set POSTGRES_PASSWORD and JWT_SECRET
docker compose up -d --build    # db + backend + frontend
docker compose logs -f backend
docker compose down             # add -v to also drop the data volume
```

App on http://localhost:8090 (nginx serves the SPA and proxies `/api` to the backend, so the browser is same-origin). Backend also published on 127.0.0.1:3000 for curl. Health check: `GET http://localhost:8090/api/health`.

Migrations run automatically on backend start via `backend/scripts/migrate.js`, which records applied files in `schema_migrations`. Run them by hand with `npm run migrate` from `backend/`.

Host Node is v12 and cannot run this app; use the containers, or Node >= 22 via nvm. There are no tests and no linter.

### Database setup caveats

- `compose.yaml` mounts `backend/database/init.sql`, which **does not exist**, and mounts `migrations/` as a *subdirectory* of `docker-entrypoint-initdb.d`, which Postgres ignores. So nothing is auto-applied on first boot.
- **Migrations 001-010 build the full schema from empty and are idempotent** (verified 2026-09-19). `migrations/001` used to declare `users` with `first_name`/`last_name` while indexing `username`, which broke the chain at the first file; it now matches the deployed schema. Apply in order:
  ```bash
  for f in backend/database/migrations/0*.sql; do
    docker exec -i ehs_postgres psql -v ON_ERROR_STOP=1 -U ehs_app -d ehs_inspection < "$f"; done
  ```
  To get the existing data instead, restore `database-backups/ehs_full_dump.sql` and then apply 007 onward.
- Seeds in `backend/database/seeds/` create five test users (`test.auditor`, `test.auditee`, `test.ehs.officer`, `test.hod`, `test.plant.head`, password `ChangeMe123!`) plus sample patrols. They do **not** yet create an `ACTION_HOD` account or backfill `action_hod_id`; add one by hand (`docs/13-action-ticket-plan.md#seeds-and-test-data`) until seeds are regenerated. Apply with `psql` the same way. Migrations 007-010 are the ones to run on top of the dump. All migrations are idempotent.
- When changing schema, add a new numbered migration in `backend/database/migrations/`; keep it idempotent like the existing ones.

## Backend architecture

`src/app.js` wires middleware and mounts each module at `/api/<module>`. `src/server.js` verifies the DB connection then listens; startup fails fast if any required env var is missing (`config/environment.js` throws).

Every module in `src/modules/<name>/` follows the same five-file layering, and new endpoints should too:

| File | Role |
|---|---|
| `*.routes.js` | Express router: `authenticate` → `authorize(...roles)` → validation rules → `validate` → controller |
| `*.validator.js` | `express-validator` rule arrays (`body()`, `param()`, `query()`) |
| `*.controller.js` | Thin: pulls from `req`, calls service, `res.status().json()`, `next(error)` |
| `*.service.js` | All business rules; throws `AppError(message, status, CODE)`; uses `withTransaction` for multi-table writes |
| `*.repository.js` | Raw parameterised SQL via `databasePool` or a passed-in transaction `client`; maps `snake_case` rows → `camelCase` objects |

Cross-cutting pieces:

- **Errors**: always throw `shared/errors/AppError.js`. `middleware/errorHandler.js` serialises `{ message, code, details }`; 5xx messages are masked and stacks only appear outside production. Validation failures become `VALIDATION_ERROR` with a `details: [{field, message}]` array that the frontend joins into one string.
- **Auth**: `middleware/authenticate.js` verifies a JWT (issuer `ehs-inspection-api`, audience `ehs-inspection-frontend`, `tokenType: "access"`) and re-loads the user from the DB on every request, so deactivated users are cut off immediately. `req.user.roles` is an array of role codes. `middleware/authorize.js` passes if *any* user role is in the allowed list.
- **Roles** (`shared/constants/roles.js`): `USER`, `EHS_OFFICER`, `HOD`, `PLANT_HEAD`, `ADMIN`, `ACTION_HOD`. Every signup gets `USER`. Seeds additionally insert `AUDITOR`/`AUDITEE` role rows but nothing in code checks them; auditor/auditee is a per-patrol relationship (`patrols.auditor_id` / `auditee_id`), not a role. Patrol planning endpoints require `EHS_OFFICER`; ticket endpoints require `ACTION_HOD`; everything else requires `USER`. **`ACTION_HOD` is not `HOD`**: `HOD` is a management role with a plant-wide dashboard, `ACTION_HOD` works ticket decisions only and holds no other role, which is what keeps them off every other page (`docs/13-action-ticket-plan.md`).
- **Transactions**: `config/database.js` exports `withTransaction(async (client) => ...)`. Repository functions take an optional `client` as their last argument so they can run inside or outside a transaction.
- **File uploads**: `modules/observations/observationUpload.js` writes to `backend/uploads/observations/` (JPEG/PNG/SVG, 10 MB, one file, field `photograph`); `modules/tickets/ticketUpload.js` writes to `backend/uploads/tickets/` (same types/size, up to 3 files, field `evidence`). Both relative to `process.cwd()`, so start the server from `backend/`. Files are served back through authenticated routes (`GET /api/observations/:reportId/photograph`, `GET /api/tickets/:ticketId/evidence/:evidenceId`), never as static files. The service deletes the file(s) if the DB transaction fails. nginx's `client_max_body_size` is 32m to fit 3 evidence files at 10 MB plus multipart overhead.
- **Logging**: `config/logger.js` prints one JSON object per line; morgan `combined` is added except in `NODE_ENV=test`.

### Domain workflow and status machines

The core lifecycle spans four tables and is driven by the observations, closures and tickets modules:

1. **Patrol** (`patrols.status`): `SCHEDULED` → `IN_PROGRESS` → `PENDING_AUDITEE_ACTION` → `PENDING_EHS_APPROVAL` → `REEXAMINATION_REQUIRED` / `COMPLETED`, or `CANCELLED`. Created by `POST /api/patrols` (EHS Officer). One auditor cannot be the auditee. A patrol is located by a four-level cascade, Location → Unit → Zone → Area, where each zone has its own fixed area list (`docs/01-overview.md#location-hierarchy`). Level 4 is not modelled yet and the planning form cascades at no level.
2. **Observation report** (`observation_reports`, one per patrol, enforced by a unique index): `POST /api/observations` runs a single transaction that checks the patrol is assigned to the caller and is `SCHEDULED`/`IN_PROGRESS`, inserts the report, **creates the `closure_requests` row** for the auditee, and moves the patrol to `PENDING_AUDITEE_ACTION`. Categories are `UA`/`UC`; risk is `HIGH`/`MEDIUM`/`LOW`. Plant locations are currently a hardcoded list duplicated in the validator and a DB CHECK constraint, which violates R12 and is scheduled for removal.
3. **Closure** (`closure_requests.status`, see migration 004): `OPEN` → `IN_PROGRESS` (action plan saved via `PATCH /:closureId/action-plan`, which now also requires `actionHodId` and **opens the ticket** for that round) → `SUBMITTED_FOR_CLOSURE` (`POST /:closureId/submit`, requires `IN_PROGRESS`) → `APPROVED` / `REJECTED` / `REEXAMINATION_REQUIRED`. Submission also updates the patrol and observation report in the same transaction. The closure's approval loop and the ticket's decision loop are independent: submitting or approving a closure never waits on its ticket.
4. **Action ticket** (`action_tickets.status`, migration 010): one per closure per approval round (`closure_round` = the closure's `approval_iteration` at assignment). `OPEN` → `IN_PROGRESS` (`POST /:ticketId/accept`, requires comments + a corrective-action type) or `CLOSED` directly (`POST /:ticketId/reject`, requires comments — no work is done on a rejected plan) → `CLOSED` (`POST /:ticketId/close`, requires ≥ 1 evidence photograph). While a ticket is `OPEN`, re-saving the closure's action plan refreshes its snapshot rather than opening a duplicate (`upsertTicketForClosureRound`'s `WHERE status = 'OPEN'`); once decided, the snapshot is frozen and a rejected-and-resubmitted closure opens a new ticket instead. Full plan: `docs/13-action-ticket-plan.md`.

"Current" assignment lookups (dashboard, observations, closures) are week-based: the observations repository computes ISO week numbers in SQL and the dashboard service computes week/month ranges in JS (`getCurrentWeekRange`, `getIsoWeekNumber`). Keep the two consistent if you change week semantics. The dashboard picks a *primary* role (management roles `EHS_OFFICER`/`HOD`/`PLANT_HEAD` get a plant-wide view, otherwise the user's own patrols) and accepts `?year=&month=`.

## Frontend architecture

- `src/app/App.jsx` → `BrowserRouter` → `AuthProvider` → `routes.jsx`. Public routes: `/`, `/sign-in`, `/sign-up`. Everything under `AppLayout` (`/dashboard`, `/observations`, `/closures`, `/plan`, `/tickets`) redirects to `/sign-in` when unauthenticated. `/ehs-officer` (the backend's login redirect for EHS Officers) just forwards to `/dashboard`. `RequireRole` also takes a `deny` prop: an `ACTION_HOD` is denied `/dashboard`, `/observations` and `/closures` (redirected to `/tickets`), the mirror image of `/plan`'s `roles={PLANNING_ROLES}` gate.
- **Auth state** lives in `localStorage` (`ehs_access_token`, `ehs_user`) and is mirrored into React context by `src/app/authProvider.jsx`. Use `useAuthenticatedUser()` to read `user`/`isAuthenticated`/`logout`. (`features/auth/useAuth.js` is the login/signup *form* hook and does not expose `user`, even though `Sidebar.jsx` currently destructures it from there.)
- **API calls** all go through `src/services/apiClient.js` (`apiRequest(endpoint, options)`), which attaches the Bearer token, sets JSON headers unless the body is `FormData`, and throws an `Error` carrying `status`/`code`/`details` from the backend envelope. The base URL is `import.meta.env.VITE_API_BASE_URL` with a `http://localhost:3000/api` fallback. Note `frontend/.env` sets `VITE_API_URL` (wrong name), so the fallback is what's actually used.
- Each feature folder under `src/features/<name>/` mirrors a backend module: `<name>.service.js` (thin `apiRequest` wrappers), `use<Name>.js` (a hook owning loading/error/success state, form state, and client-side validation that duplicates the backend rules), and page/components. Follow this split when adding a feature.
- Role helpers for the UI are in `src/constants/roles.js` (`hasManagementRole`, `normalizeRole`, `canPlanAudits`, `isActionHod`). `src/features/tickets/` is the Action Team HOD's feature folder, following the same `<name>.service.js` / `use<Name>.js` split as the others.

### Known frontend/backend drift

Real mismatches in the current code; do not "fix" them silently inside an unrelated change. Full list in `docs/09-feature-refinement-backlog.md`.

- Frontend calls `GET /observations/current-assignment`; backend route is `/current-assignments` (plural).
- Frontend `closure.service.js` calls `pending-approvals`, `:id/approval`, `:id/approve`, `:id/reject`; the backend only has `/current`, `/:id/action-plan`, `/:id/submit`. The EHS approval half of the workflow is unimplemented server-side.
- `useClosures.js` and `Sidebar.jsx` import the login-form hook `useAuth` for `user`, which it does not return; use `useAuthenticatedUser()` from `app/authProvider.jsx`.
- `frontend/.env` sets `VITE_API_URL`; the code reads `VITE_API_BASE_URL`.

## Conventions worth keeping

- Backend and frontend both use a heavily line-broken formatting style (one argument per line, short lines). Match the surrounding file rather than reformatting.
- Response shapes are `{ message, ...data }` on success and `{ message, code, details }` on error. User-facing `message` strings are full sentences ending in a period; the frontend displays them verbatim.
- Repositories return `null` (not throw) when a row is missing; services turn that into a 404 `AppError`.
- **Location, unit, zone and area values must come from the database, never from code.** They are loaded into Postgres at production cutover, so a hardcoded list or a CHECK constraint would need a redeploy to accept a new site. Today they are hardcoded in ten places including three CHECK constraints; that is a known defect (R11/R12), not a pattern to copy. Read them through the planning lookups. See `docs/09-feature-refinement-backlog.md` item 2.0.
- Other allowed-value lists (`UA`/`UC`, `HIGH`/`MEDIUM`/`LOW`, the status enums) are fixed business vocabulary and do exist in validator, service, and a DB CHECK constraint. Change all three together with a migration.
