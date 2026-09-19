# 10. Schema migration plan: `users` / `zone_audits` / `observations`

Implementation plan for replacing the current database (`users`+`roles`+`user_roles`, `plants`/`units`/`zones`, `patrols`, `observation_reports`, `closure_requests`) with the three-table schema in the design `ehs_schema.sql` (source: user upload, reproduced in Phase 1 below), and reworking the backend and frontend to match. Written for an implementing agent. Read `CLAUDE.md`, [03-data-model](03-data-model.md), [04-api-reference](04-api-reference.md) and [09-backlog](09-feature-refinement-backlog.md) first.

## 0. Decisions already made (do not re-open)

| # | Decision |
|---|---|
| D1 | **Keep EHS approval.** Add `Pending_Approval` to `observation_status`. Flow: `Open` → `In_Progress` (action plan saved) → `Pending_Approval` (auditee submits) → `Closed` (EHS Officer approves; `closed_by_id` = officer) or back to `In_Progress` (EHS Officer rejects with comments). |
| D2 | **Schema as core, add back essentials** in a follow-up migration: login lockout columns, `authentication_events`, photo MIME/original name/size, review columns, `zone_audits.area_detail`. **Login is by email only.** `username` and `report_number` are gone from the DB. |
| D3 | **Fresh start.** New baseline + new seeds. No data migration from `database-backups/ehs_full_dump.sql` (keep that file as the backup). |
| D4 | **Frontend: no layout, style or design changes.** Change only services, hooks and the data wiring in pages so they work against the new backend. No new CSS, no new sections or buttons, no restructured markup. Allowed: swapping which field an existing input binds to, changing placeholder/label text, `readOnly` on an existing input. |

Consequences of D4 that shape the API: **keep the existing URL paths (`/api/patrols`, `/api/observations`, `/api/closures`, `/api/dashboard`) and the existing response field names** wherever possible. Rename things inside the backend, not on the wire.

## 1. Key mapping from old to new

| Old concept | New home | Notes |
|---|---|---|
| `users.full_name` / `username` / `email` | `users.user_name` / — / `user_email` | API keeps `fullName`, `email`. |
| `roles` + `user_roles` (many) | `users.role` enum (one) | API keeps `roles: [code]` array so `authorize()` and the frontend keep working. |
| `plants`/`units`/`zones` tables | `zone_audits.location`, `unit_number`, `zone_number` + constants module | Units 1–5, zones 1–9, areas list: same values `PatrolForm.jsx` already hard-codes. |
| `patrols` | `zone_audits` | API still calls it a patrol; `patrolId` = `audit_id`. |
| `observation_reports` (1 per patrol) | `observations` (N per audit) | `reportId` = `observation_id`. |
| `closure_requests` | columns on `observations` | `closureId` = `observation_id`. |
| `report_number` | derived in the mapper, not stored | `reportNumber: "OBS-" + String(id).padStart(6, "0")` so the UI keeps showing one. |
| `responsible_hod_name` (free text) | auditee's `users.hod_id` → `user_name` | Derived; no longer an input. |
| `patrols.status` workflow values | `zone_audits.status` (`Planned`/`Completed`/`Missed`) + derived workflow status | See §1.2. |

### 1.1 Enum boundary rule

The DB uses the enum labels (`EHS_Officer`, `High`, `In_Progress`). **The API keeps the existing uppercase codes** (`EHS_OFFICER`, `HIGH`, `IN_PROGRESS`). Convert only in repositories, via one module `backend/src/shared/constants/enums.js`:

```js
// each map: API code -> DB label, plus a generated reverse map
ROLE:               USER→User, EHS_OFFICER→EHS_Officer, PLANT_HEAD→Plant_Head, HOD→HOD, ADMIN→Admin
AUDIT_STATUS:       PLANNED→Planned, COMPLETED→Completed, MISSED→Missed
VIOLATION_TYPE:     UA→UA, UC→UC
RISK_CATEGORY:      HIGH→High, MEDIUM→Medium, LOW→Low
OBSERVATION_STATUS: OPEN→Open, IN_PROGRESS→In_Progress, PENDING_APPROVAL→Pending_Approval, CLOSED→Closed
export function toDbValue(map, code) / toApiValue(map, label)
```

Services only ever see API codes. Never write a DB label outside a repository.

### 1.2 Derived audit workflow status

The frontend shows patrol workflow statuses (`SCHEDULED`, `PENDING_AUDITEE_ACTION`, ...). Keep emitting them as `status`, and add the raw value as `auditStatus`. Implement once in `backend/src/shared/audits/deriveAuditWorkflowStatus.js`, fed by per-audit observation counts from SQL:

| Condition (first match wins) | `status` |
|---|---|
| audit `Missed` | `MISSED` |
| audit `Planned` | `SCHEDULED` |
| `Completed`, 0 observations | `COMPLETED` |
| `Completed`, any observation `Open`/`In_Progress` | `PENDING_AUDITEE_ACTION` |
| `Completed`, any `Pending_Approval` | `PENDING_EHS_APPROVAL` |
| `Completed`, all `Closed` | `COMPLETED` |

A SQL fragment that returns `observation_count`, `open_count` (Open+In_Progress), `pending_approval_count`, `closed_count` per audit (a `LEFT JOIN LATERAL` or grouped subquery) belongs in a shared repository helper so dashboard/patrol/observation repositories do not each re-invent it.

### 1.3 "Missed" audits

Nothing sets `Missed` on its own. Add `markOverdueAuditsMissed(client)` in `patrol.repository.js`:

```sql
UPDATE zone_audits SET status = 'Missed'
WHERE status = 'Planned' AND planned_date < DATE_TRUNC('week', CURRENT_DATE)::date
```

Call it at the start of `getDashboardData`, `getCurrentAssignments` and `getPlanningLookups`. (Audits stay `Planned` through the end of their ISO week.)

## 2. Phases

Work on a branch (e.g. `feature/zone-audit-schema`). Each phase should leave the backend importable (`node -e "import('./src/app.js')"` in Node 22). Commit per phase only if the user asks for commits.

---

### Phase 1: Database baseline, extensions, seeds

**1a. Retire old migrations.** `git mv backend/database/migrations backend/database/legacy-migrations` (reference only, never applied). Create a fresh `backend/database/migrations/`.

**1b. `001_ehs_schema.sql`.** The uploaded schema, content unchanged, but made idempotent to match repo convention:
- `CREATE TYPE` → `DO $$ BEGIN CREATE TYPE ... ; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
- `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE VIEW`.

Reference copy of the schema being implemented:

```sql
CREATE TYPE user_role          AS ENUM ('User', 'EHS_Officer', 'Plant_Head', 'HOD', 'Admin');
CREATE TYPE audit_status       AS ENUM ('Planned', 'Completed', 'Missed');
CREATE TYPE violation_type     AS ENUM ('UA', 'UC');
CREATE TYPE risk_category      AS ENUM ('High', 'Medium', 'Low');
CREATE TYPE observation_status AS ENUM ('Open', 'In_Progress', 'Closed');

CREATE TABLE users (
    user_id SERIAL PRIMARY KEY, user_name VARCHAR(120) NOT NULL,
    user_email VARCHAR(255) NOT NULL UNIQUE, role user_role NOT NULL DEFAULT 'User',
    hod_id INT REFERENCES users(user_id), location VARCHAR(100) NOT NULL,
    password_hash TEXT NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());

CREATE TABLE zone_audits (
    audit_id SERIAL PRIMARY KEY, location VARCHAR(100) NOT NULL,
    unit_number INT NOT NULL, zone_number INT NOT NULL,
    week_number INT NOT NULL CHECK (week_number BETWEEN 1 AND 53),
    planned_date DATE NOT NULL, actual_date DATE,
    auditor_id INT NOT NULL REFERENCES users(user_id),
    auditee_id INT NOT NULL REFERENCES users(user_id),
    ehs_officer_id INT NOT NULL REFERENCES users(user_id),
    status audit_status NOT NULL DEFAULT 'Planned',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (location, unit_number, zone_number, week_number));

CREATE TABLE observations (
    observation_id SERIAL PRIMARY KEY,
    audit_id INT NOT NULL REFERENCES zone_audits(audit_id) ON DELETE CASCADE,
    finding_date DATE NOT NULL, image_url TEXT,
    violation_type violation_type NOT NULL, risk_category risk_category NOT NULL,
    description TEXT NOT NULL, observation_location VARCHAR(150) NOT NULL,
    action_plan TEXT, target_date DATE, completion_date DATE,
    status observation_status NOT NULL DEFAULT 'Open',
    closed_by_id INT REFERENCES users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (target_date IS NULL OR target_date >= finding_date),
    CHECK (status <> 'Closed' OR completion_date IS NOT NULL));

CREATE INDEX idx_audits_zone_week ON zone_audits (location, unit_number, zone_number, week_number);
CREATE INDEX idx_audits_planned   ON zone_audits (planned_date);
CREATE INDEX idx_audits_officer   ON zone_audits (ehs_officer_id);
CREATE INDEX idx_obs_audit        ON observations (audit_id);
CREATE INDEX idx_obs_status       ON observations (status);
CREATE INDEX idx_obs_target       ON observations (target_date) WHERE status <> 'Closed';

CREATE VIEW v_observation_report AS
SELECT o.observation_id, a.audit_id, a.location, a.unit_number, a.zone_number, a.week_number,
       a.planned_date, au.user_name AS auditor_name, ae.user_name AS auditee_name,
       eo.user_name AS ehs_officer_name, o.finding_date, o.image_url, o.violation_type,
       o.risk_category, o.description, o.observation_location, o.action_plan, o.target_date,
       o.completion_date, o.status, cb.user_name AS closed_by
FROM observations o
JOIN zone_audits a ON a.audit_id = o.audit_id
JOIN users au ON au.user_id = a.auditor_id
JOIN users ae ON ae.user_id = a.auditee_id
JOIN users eo ON eo.user_id = a.ehs_officer_id
LEFT JOIN users cb ON cb.user_id = o.closed_by_id;
```

**1c. `002_add_pending_approval_status.sql`**, on its own because a new enum value cannot be used in the same transaction that adds it:

```sql
ALTER TYPE observation_status ADD VALUE IF NOT EXISTS 'Pending_Approval' AFTER 'In_Progress';
```

**1d. `003_add_application_columns.sql`** (all `IF NOT EXISTS` / guarded `DO` blocks):

- `users`: `failed_login_attempts INT NOT NULL DEFAULT 0`, `locked_until TIMESTAMPTZ`, `last_login_at TIMESTAMPTZ`; unique index `users_email_lower_unique` on `LOWER(user_email)`.
- `authentication_events`: `event_id BIGSERIAL PK`, `user_id INT REFERENCES users(user_id) ON DELETE SET NULL`, `identifier_attempted VARCHAR(255)`, `event_type VARCHAR(30) CHECK IN ('SIGNUP','LOGIN','LOGOUT','LOGIN_FAILURE')`, `success BOOLEAN NOT NULL`, `ip_address INET`, `user_agent TEXT`, `event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
- `zone_audits`:
  - `area_detail VARCHAR(100)` with CHECK in the nine areas (ETP area, Maintenance Store, Utility, Forge Shop, Machine shop, Heat Treatment, Die Shop, Tool Shop, OSP Store).
  - CHECK `location IN ('Gurugram','Manesar','Chennai','Pune','China')`.
  - CHECK `auditor_id <> auditee_id`.
  - CHECK `unit_number > 0 AND zone_number > 0`.
  - **Fix the uniqueness bug**: `UNIQUE (location, unit_number, zone_number, week_number)` has no year, so week 5 of 2027 collides with week 5 of 2026. Drop that constraint (look up its name from `pg_constraint`; the default is `zone_audits_location_unit_number_zone_number_week_number_key`) and create `zone_audits_zone_week_unique` as a unique index on `(location, unit_number, zone_number, (EXTRACT(ISOYEAR FROM planned_date)), week_number)`. If Postgres rejects the expression as not immutable, add `audit_year INT NOT NULL` instead (the service sets it to the ISO year) and use it in the index.
  - Index `(auditor_id, planned_date)` and `(auditee_id, planned_date)`.
- `observations`:
  - Photo metadata: `image_original_name VARCHAR(255)`, `image_mime_type VARCHAR(100)`, `image_size INT`.
  - Workflow timestamps: `action_plan_saved_at TIMESTAMPTZ`, `submitted_for_closure_at TIMESTAMPTZ`.
  - Review: `reviewed_by_id INT REFERENCES users(user_id)`, `reviewed_at TIMESTAMPTZ`, `review_comments TEXT`, `approval_iteration INT NOT NULL DEFAULT 0`.
  - CHECK `status NOT IN ('Pending_Approval','Closed') OR (action_plan IS NOT NULL AND target_date IS NOT NULL)`.
  - Index `(status, submitted_for_closure_at)` for the approval queue.
- `set_updated_at()` trigger function plus `BEFORE UPDATE` triggers on all three tables (`DROP TRIGGER IF EXISTS` first).
- `CREATE OR REPLACE VIEW v_observation_report`: same columns, **new columns appended at the end only** (`area_detail`, `review_comments`, `submitted_for_closure_at`). Postgres rejects reordering.

Do not wrap 002/003 in `BEGIN/COMMIT` and do not run them with `psql -1`.

**1e. Seeds** (`backend/database/seeds/`, rewrite both, idempotent):
- `000_create_required_test_users.sql`: `CREATE EXTENSION IF NOT EXISTS pgcrypto`. Users with password `ChangeMe123!` (`crypt(..., gen_salt('bf', 12))`), all `location = 'Gurugram'`, upsert on `user_email`:
  - `test.hod@example.com` (HOD)
  - `test.plant.head@example.com` (Plant_Head)
  - `test.ehs.officer@example.com` (EHS_Officer)
  - `test.admin@example.com` (Admin)
  - `test.auditor@example.com` and `test.auditee@example.com` (User, `hod_id` = test.hod)
- `001_dashboard_observation_test_data.sql`: delete audits where auditor or auditee is a test user, then insert, relative to `CURRENT_DATE`, Gurugram Unit 1:
  - Zone 1: four past-week audits, `Completed`, with one `Closed` observation each.
  - Zone 2: current-week `Planned` audit for test.auditor.
  - Zone 3: current-week `Completed` audit with one `Open` and one `In_Progress` observation.
  - Zone 4: last-week `Completed` audit with one `Pending_Approval` observation (fills the approval queue).
  - Zone 5: two-weeks-ago `Planned` audit (becomes `Missed` on first dashboard load).
  - Zone 6: `Planned` audit at +21 days.

  `week_number` = `EXTRACT(WEEK FROM planned_date)`. Observation `image_url` may be NULL in seeds.

**1f. `compose.yaml`.** Replace the two broken mounts with `./backend/database/migrations:/docker-entrypoint-initdb.d:ro` (files run in name order on an empty volume). Keep the change minimal; [08-containerization-plan](08-containerization-plan.md) owns the full compose design.

**1g. Verify.** First confirm with the user before `docker compose down -v`, which destroys the current DB volume (the dump in `database-backups/` is the backup). Then:
1. `docker compose up -d postgres`.
2. Check `\dT+`, `\d zone_audits`, `\d observations`.
3. Apply the seeds with `psql`, twice, to prove idempotency.
4. Try a duplicate zone/week insert (must fail) and the same zone/week in the next ISO year (must succeed).
5. Set `status='Closed'` without `completion_date` (must fail).

---

### Phase 2: Shared backend pieces

- `backend/package.json`: add `"type": "module"` (backlog 0.6).
- `shared/constants/enums.js`: see §1.1.
- `shared/constants/roles.js`: keep `USER_ROLES` codes. Add:
  - `MANAGEMENT_ROLES = [EHS_OFFICER, HOD, PLANT_HEAD, ADMIN]`
  - `PLANNING_ROLES = [EHS_OFFICER, ADMIN]`
  - `APPROVAL_ROLES = [EHS_OFFICER, ADMIN]`
  - `DEFAULT_SIGNUP_ROLE = USER`
- `shared/constants/planning.js`, the single backend source for:
  - `PLANT_LOCATIONS`
  - `UNIT_OPTIONS` (`[{ value: "1", label: "Unit I" }, ... "5"]`)
  - `ZONE_NUMBERS` (1–9)
  - `AREA_DETAILS`

  Import these in validators and services instead of literal arrays.
- `shared/dates/isoWeek.js`: `getIsoWeek(dateString) → { isoYear, weekNumber }`, `getCurrentWeekRange()`. Move `getIsoWeekNumber`/`getCurrentWeekRange` out of `dashboard.service.js` into this module and use it everywhere. Standardise on UTC (backlog 3.3).
- `shared/audits/deriveAuditWorkflowStatus.js`: see §1.2.
- `errorHandler.js`: strip `details` on 5xx (backlog 3.7). Remove the duplicate error-handler registration in `app.js`.

---

### Phase 3: Auth module + middleware

**Repository** (`auth.repository.js`), rewritten against `users`:
- `findUserByEmail(email, client)`: `WHERE LOWER(user_email) = LOWER($1)`.
- `findUserById(id, client)`: `LEFT JOIN users h ON h.user_id = u.hod_id` for `hodName`.
- `createUser({ fullName, email, location, passwordHash }, client)`: role defaults to `'User'`.
- `recordSuccessfulLogin`, `recordFailedLogin` (same 5-attempt / 15-min lockout logic), `createAuthenticationEvent`.
- Delete `assignRoleToUser` and `findUserByUsernameOrEmail`.
- `mapUser` returns `{ id, fullName, email, role, roles: [role], location, hodId, hodName, isActive, lastLoginAt }` with `role` as an API code.

**Validator:**
- signup: `fullName`, `email`, `location` (in `PLANT_LOCATIONS`), `password`, `confirmPassword`. Remove `username`.
- login: keep the field name `identifier` (the frontend sends it) but validate it with `isEmail()`. Message: "Enter the email address you signed up with."

**Service:**
- Remove username uniqueness checks and the `ENTRA` branch.
- Email conflict → `EMAIL_ALREADY_EXISTS` 409.
- JWT claims: `sub`, `email`, `roles`, `tokenType`; issuer/audience unchanged.
- `redirectTo` uses `PLANNING_ROLES`.

**`middleware/authenticate.js`:** `req.user = { id, fullName, email, role, roles: [role], location, hodId }`. `authorize()` needs no change.

---

### Phase 4: Patrols module → `zone_audits`

Paths unchanged. Routes use `authorize(...PLANNING_ROLES)` (adds ADMIN, backlog 3.2).

**`GET /api/patrols/planning-lookups`**
- Call `markOverdueAuditsMissed` first.
- Return the same shape the frontend reads:
  - `locations`: from `PLANT_LOCATIONS`, `{ id: value, value, label, code: value }`.
  - `units`: `UNIT_OPTIONS`.
  - `zones`: `ZONE_NUMBERS`.
  - `areaDetails`: `AREA_DETAILS`.
  - `auditors` and `auditees`: active users with `role = 'User'`, `{ id, fullName, email, location }`. This replaces the AUDITOR/AUDITEE role lookup (backlog 1.8).
- Before changing the shape, check exactly which keys `PatrolForm.jsx`/`usePatrols.js` read and keep those.

**`POST /api/patrols`** (body unchanged: `location, unit, zone, areaDetail, scheduledDate, auditorId, auditeeId`)

Transaction:
1. Caller still holds a planning role.
2. Auditor and auditee are active `User`s and differ.
3. Location, unit, zone and area are in the constants.
4. `scheduledDate` ≥ today (UTC).
5. `{ isoYear, weekNumber } = getIsoWeek(scheduledDate)`.
6. Conflict check: another audit with the same auditor or auditee on the same `planned_date` → existing 409 codes.
7. Insert with `ehs_officer_id` = caller, `status 'Planned'`.
8. Catch `23505` on `zone_audits_zone_week_unique` → 409 `ZONE_WEEK_ALREADY_SCHEDULED`, message "An audit is already scheduled for this zone in that week."

This replaces the four missing repository functions (backlog 0.2): delete `findActivePlanning*`, `findUnitForPlant` and `findZoneForUnit`.

**Repository `mapAudit`** returns the existing patrol keys:
- `id`, `location`, `unit` (string number), `unitNumber`, `unitName` (`"Unit " + n`), `zone`, `zoneNumber`, `zoneName` (`"Zone " + n`), `areaDetail`
- `weekNumber`, `scheduledDate` (= `planned_date` as `YYYY-MM-DD`), `actualDate`
- `auditorId`/`auditorName`, `auditeeId`/`auditeeName`, `ehsOfficerId`/`ehsOfficerName`
- `auditStatus`, `status` (derived), `createdAt`, `updatedAt`

Use `LEFT JOIN` for users (backlog 3.6). Keep `unitId`/`zoneId` as `null` only if a frontend file reads them; otherwise drop.

**New: `POST /api/patrols/:patrolId/complete`** (authenticate; caller must be the auditor)
- The audit must be `Planned` and in the current or a past week, but not `Missed`.
- Sets `Completed`, `actual_date = today`.
- Backend-only for "audit done, nothing found". **No frontend button** (D4); list it as a follow-up in the backlog.

Delete `findCalendarPatrols` if still unused.

---

### Phase 5: Observations module → `observations`

Routes: `authenticate` only; ownership is checked in SQL (backlog 3.1; an `EHS_Officer` has no `USER` role now and must still be able to fetch photographs). This also fixes backlog 0.1 and 0.7: one `getCurrentAssignments` name across route/controller/service, and the dead duplicate transaction deleted.

**`GET /api/observations/current-assignments`**
- Call `markOverdueAuditsMissed` first.
- Select the caller's audits as auditor where `planned_date` is in the current ISO week and status is `Planned` or `Completed` (completed audits stay open for more findings during their week).
- Response `{ assignments, assignment: assignments[0] ?? null, report, observations }`:
  - `assignment` keys as today (`weekNumber` = `week_number`, `plantLocation` = `location`, `observationLocation` = `area_detail ?? "Zone N"`).
  - `observations` = this audit's findings, newest first.
  - `report` = `observations[0] ?? null`.

**`POST /api/observations`** (multipart, fields unchanged: `patrolId, findingDate, location, category, description, riskCategory, photograph`; add optional `observationLocation`)

Transaction:
1. Load the audit `FOR UPDATE`; it must have `auditor_id = caller` (404 `ASSIGNED_PATROL_NOT_FOUND`).
2. Status must be `Planned` or `Completed` (409 `PATROL_STATUS_NOT_ELIGIBLE` for `Missed`).
3. `location` must equal `audit.location` (400 `PLANT_LOCATION_MISMATCH`).
4. Insert the observation:
   - `status 'Open'`
   - `violation_type` = category, risk via enum map
   - `observation_location` = body value, else `area_detail`, else `"Zone N"` (max 150)
   - `image_url` = relative stored path (`uploads/observations/<uuid>.<ext>`), plus MIME/original name/size
5. If the audit is `Planned`, set it to `Completed` with `actual_date = CURRENT_DATE`.

There is no closure-row creation any more and no "report already exists" 409.

Keep the file-cleanup-on-failure behaviour and the 500-word description limit.

`201 { message, report }`. `mapObservation` keys:
- `id`, `reportNumber` (derived), `patrolId`, `status`, `displayStatus`
- `findingDate`, `plantLocation`, `observationLocation`, `category`, `description`, `riskCategory`
- `photographPath`, `photographOriginalName`, `submittedAt` (= `created_at`), `closedAt` (= `completion_date`)

**`GET /api/observations/:reportId/photograph`**
- `reportId` = `observation_id`.
- The caller must be the audit's auditor, auditee or EHS officer, or hold `ADMIN`.
- Serve MIME from `image_mime_type`; if that is null, infer it from the extension.
- Keep the path-traversal guard.

---

### Phase 6: Closures module → `observations` columns

`closureId` = `observation_id` throughout. Delete `closure_requests` SQL entirely.

**Mapper:** keep the full `<closure>` shape from [04](04-api-reference.md#closures--all-routes-authenticate--authorizeuser), sourced from `observations` ⋈ `zone_audits` ⋈ users:
- `observationReportId` = `id`
- `responsibleHodName` = auditee's HOD name (`LEFT JOIN users h ON h.user_id = ae.hod_id`)
- `submittedForClosureAt`
- `reviewComments`, `rejectionComments` (same value)
- `reviewedAt`, `closedAt` (= `completion_date` when Closed), `closedByName`

Service helpers:
- `displayStatus`: `OPEN`→Open, `IN_PROGRESS`→In Progress, `PENDING_APPROVAL`→Sent for Closure, `CLOSED`→Closed.
- `canEditActionPlan` = `OPEN|IN_PROGRESS`.
- `canSubmitForClosure` = `IN_PROGRESS` and action plan and target date present. The HOD is no longer required.

Routes: `authenticate` on all, plus `authorize(...APPROVAL_ROLES)` on the approval routes. Add `closureIdValidationRules` to every `:closureId` route (backlog 1.6).

| Endpoint | Rules |
|---|---|
| `GET /closures/current` | Auditee's highest-priority observation: `auditee_id = caller`, status in Open/In_Progress/Pending_Approval. Order Open → In_Progress → Pending_Approval, then `target_date NULLS FIRST`, then `finding_date`. `{ closure }` |
| `PATCH /closures/:closureId/action-plan` | Body `actionPlan` (≤255 words), `targetDate`. `responsibleHodName` is accepted and ignored if sent. Ownership via audit `auditee_id`; status `Open`/`In_Progress`. `target_date >= finding_date` → 400 `INVALID_TARGET_DATE` before the DB CHECK fires. Sets status `In_Progress`, `action_plan_saved_at`. |
| `POST /closures/:closureId/submit` | Status must be `In_Progress` with plan and target. Single conditional `UPDATE ... WHERE observation_id=$1 AND status='In_Progress'` → `Pending_Approval`, `completion_date = CURRENT_DATE`, `submitted_for_closure_at = NOW()`; 0 rows → 409 `CLOSURE_STATUS_CHANGED` (backlog 3.5). |
| `GET /closures/pending-approvals` | `Pending_Approval` observations where `ehs_officer_id = caller` (ADMIN: all), ordered by `submitted_for_closure_at`. `{ closures }` |
| `GET /closures/:closureId` | Caller is the auditee, auditor or EHS officer of the audit, or ADMIN. `{ closure }`. Replaces the frontend's `/approval` path. |
| `POST /closures/:closureId/approve` | APPROVAL_ROLES; precondition `Pending_Approval`; `reviewComments` optional (≤1000). Conditional update → `Closed`, `closed_by_id = caller`, `reviewed_by_id`, `reviewed_at`, `review_comments`, `approval_iteration + 1`. |
| `POST /closures/:closureId/reject` | APPROVAL_ROLES; precondition `Pending_Approval`; `reviewComments` required (≤1000). Conditional update → `In_Progress`, `completion_date = NULL`, `submitted_for_closure_at = NULL`, review columns, `approval_iteration + 1`. |

`closure.validator.js` already has review rule arrays; reuse them. No patrol/report status updates are needed any more, because audit workflow status is derived (§1.2).

---

### Phase 7: Dashboard module

Keep the response contract in [04](04-api-reference.md#dashboard). Rewrite SQL against `zone_audits` + the observation-counts helper, and remove the duplicated queries (P4 item) with one query that takes a date range.

- Call `markOverdueAuditsMissed` first.
- `<audit>` = patrol mapper keys plus:
  - `assignmentRole`
  - `observationReportId` (latest observation id or null)
  - `observationCount`
  - `hasOpenObservationReport` (open_count > 0)
  - `auditorActionCompleted` (audit Completed)
  - `auditeeActionCompleted` (count > 0 and open_count = 0)
- USER `nextAudit` pending rule:
  - as auditor: audit `Planned` in the current week;
  - as auditee: the audit has any `Open`/`In_Progress` observation.
- USER `metrics`:
  - `audits: { conducted: Completed count, total: non-future audits }`
  - `closures: { requested: observation count, actual: Closed count }`

  Both are for the current year and cover audits where the user is auditor or auditee.
- Management branch: unchanged semantics (plant-wide). Do not add location/HOD scoping in this change.

---

### Phase 8: Frontend integration (no layout/style changes, D4)

Before editing, `grep -rn` each changed response key and status literal across `frontend/src` so nothing is missed.

1. `services/apiClient.js`: add `apiBlobRequest` (same headers and error handling, returns `response.blob()`), and import it in `closure.service.js` (backlog 0.5).
2. **Auth**:
   - `auth.service.js`/`useAuth.js`: signup sends `fullName, email, location, password, confirmPassword`.
   - `SignupPage.jsx`: rebind the existing username input slot to `location`. If a `<select>` is used, give it the same classes and wrapper as the other fields and use the plant list. Change label/placeholder text only.
   - `LoginPage.jsx`: placeholder "Enter your email". Client-side validation becomes an email check.
3. `Sidebar.jsx` and `useClosures.js`: use `useAuthenticatedUser()` (backlog 1.2).
4. `observation.service.js`: path `/observations/current-assignments` (backlog 1.1). `useObservations.js`: read `assignment`/`report`. If the page can reset the form after success without markup changes, allow submitting another finding. Otherwise keep the current post-submit view and note multi-finding entry as a follow-up. `PhotographInput.jsx`: `<img>` preview (backlog 1.5; it already has a slot for it).
5. **Closures**:
   - `closure.service.js`: `fetchClosureForApproval` → `/closures/:id`.
   - `ActionPlanForm.jsx`:
     - derive `editable` from `closure?.canEditActionPlan` (backlog 0.3)
     - fix the input state spread (backlog 0.4)
     - make the HOD input `readOnly` showing `closure.responsibleHodName`
   - `useClosures.js`: stop requiring and sending the HOD name. Map statuses `PENDING_APPROVAL` (replacing `SUBMITTED_FOR_CLOSURE`) and drop `APPROVED`/`REJECTED`/`REEXAMINATION_REQUIRED` checks.
6. Dashboard/patrols: add a label for status `MISSED` wherever status labels are mapped. PatrolForm option labels use `email` where `username` was used. Keep the hard-coded option arrays but prefer lookup data when present (backlog P4 item; only if it needs no markup change).
7. `frontend/.env`: `VITE_API_URL` → `VITE_API_BASE_URL` (backlog 1.3). Declare `react`/`react-dom` in `package.json` (backlog 1.4).

---

### Phase 9: Verification (no test suite exists)

Host Node is v12; run everything in `node:22` containers. Avoid host ports 8080 and 4000 (sibling project).

1. **Boot:** `docker run --rm -v "$PWD/backend":/app -w /app node:22 node -e "import('./src/app.js').then(()=>console.log('ok'))"`, then start the server against the compose Postgres and `curl /api/health`.
2. **API walk-through** with `curl` and seeded users. Record status codes and bodies:
   1. Log in as ehs.officer and call `planning-lookups`.
   2. `POST /patrols` for the current week (201).
   3. Repeat it for the same zone and week (409 `ZONE_WEEK_ALREADY_SCHEDULED`).
   4. As auditor, call `current-assignments` and then `POST /observations` twice with a small PNG. Expect 201, and the audit becomes Completed with `actual_date` set.
   5. As auditee, call `closures/current`, then `PATCH action-plan`, then `submit`.
   6. As officer, call `pending-approvals`, then `reject` (the observation returns to `In_Progress`).
   7. As auditee, `resubmit`.
   8. As officer, `approve` (Closed, `closed_by_id` = officer).
   9. Fetch the photograph as auditor, auditee and officer (200) and as an unrelated user (404).
   10. Call the dashboard as auditor, auditee and officer; check the `MISSED` seed and the derived statuses.
   11. Log in with a wrong password 5 times (423 lockout).
   12. `SELECT * FROM v_observation_report` matches.
3. **Frontend:** `npm run build` in `node:22`. Run the dev server and click through sign-up, sign-in, dashboard, plan, observations and closures (auditee + officer), comparing screenshots before and after to confirm no visual change.
4. `git diff --stat frontend/src/styles` must be empty.

### Phase 10: Docs

Update in the same change:
- [03-data-model](03-data-model.md): rewrite for the new tables and enums.
- [04-api-reference](04-api-reference.md): new and changed endpoints, email login, error codes.
- [05-workflows](05-workflows.md): the new state machine.
- [09-backlog](09-feature-refinement-backlog.md): strike the items fixed above, and add follow-ups for the "complete audit with no findings" UI, multi-finding entry UI, and HOD/location-scoped management dashboards.
- `CLAUDE.md`: "Current state", "Database setup caveats", "Domain workflow" and "Known drift" sections.
- `folder_structure.txt`: delete.

## 3. Risks / watch-outs

- **Enum additions are one-way**: `ALTER TYPE ... ADD VALUE` cannot be rolled back inside a transaction, and values cannot be dropped easily. Test 002 on a scratch DB first.
- **ISO week vs `EXTRACT(WEEK)`**: both are ISO in Postgres; around New Year a date can belong to week 1 of the next ISO year or week 52/53 of the previous one. Always pair `week_number` with `ISOYEAR`, never calendar year.
- **Single role per user**: an `EHS_Officer` can no longer also be an auditor. Lookups offer `User` accounts only; confirm this is acceptable before shipping.
- **Signup requires `location`**: existing frontend state or localStorage users from the old DB are invalid after the fresh start; users must sign in again (tokens reference old ids).
