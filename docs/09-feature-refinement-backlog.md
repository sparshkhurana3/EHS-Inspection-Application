# 9. Feature refinement backlog

Everything here was found by reading the code at commit `24bb98a` (see [04](04-api-reference.md) and [06](06-frontend.md) for line references). The P0 boot failure was confirmed by importing `app.js` in a Node 22 container. Priorities:

- **P0** — the app cannot run or a core screen crashes.
- **P1** — a core flow is wired wrong between frontend and backend.
- **P2** — a required feature is missing (R6 approval, R7 alerts, R9 edit).
- **P3** — correctness/consistency issues that do not block the happy path.
- **P4** — code health and UX polish.

Suggested order: P0 → P1 → containerize (so there is a stable runtime to test against) → P2 → P3/P4.

## P0 — make it run — **DONE**

All seven fixed and verified against the running stack: the backend boots, migrations self-apply, and the plan, observe, close and approve flows work end to end.

<details><summary>Original P0 list</summary>


| # | Item | Where | Fix |
|---|---|---|---|
| 0.1 | Backend fails at import: `getCurrentAssignments is not defined` | `observation.routes.js:19,39`, `observation.controller.js:6,14`, `observation.service.js:208-241` | Pick one name. Recommended: keep `getCurrentAssignments` in the service (return `{ assignments: [], assignment, report }`), rename the controller export to match, import it in the route, and fix the `assignments`/`assignment` variable mix-up in the service (it should take `assignments[0]` or return the list). |
| 0.2 | `POST /api/patrols` calls four non-existent repository functions | `patrol.service.js` (`findActivePlanningPlant`, `findActiveUnitForPlant`, `findActiveZoneForUnit`, `findActiveAreaDetail`) vs `patrol.repository.js` (`findUnitForPlant`, `findZoneForUnit`) | Implement the four in the repository with the argument shapes the service already passes (`{ plantLocation }`, `{ plantId, unitNumber }`, `{ unitId, zoneNumber }`, `{ zoneId, areaDetail }`) and delete the two unused ones. **`findActiveAreaDetail` has nothing valid to query** — see 2.0; writing it against `zones.area_detail` makes the insert fail the `patrols_area_detail_check` constraint. Do 2.0 first, or stub level 4 against the global list until 2.0 lands. |
| 0.3 | Closure page crashes for auditees: `editable is not defined` | `ActionPlanForm.jsx:104,191,235,271,280` | Derive `const editable = closure?.canEditActionPlan ?? true;` (the backend already sends `canEditActionPlan`). |
| 0.4 | Action-plan inputs cannot be typed into | `useClosures.js:494-499` | `{ ...currentValues, [fieldName]: fieldValue }`. |
| 0.5 | Photo never loads on the closure page: `apiBlobRequest` undefined | `closure.service.js:110` | Add `apiBlobRequest` to `services/apiClient.js` (same headers, returns `response.blob()`), import it. |
| 0.6 | `backend/package.json` lacks `"type": "module"` | Node prints `MODULE_TYPELESS_PACKAGE_JSON` and re-parses | Add `"type": "module"`. |
| 0.7 | Dead code masking 0.1: a second, unreachable copy of the observation-submit transaction | `observation.service.js:465-471, 498-629` | Delete. Before deleting, port its two extra guards (`PATROL_AUDITEE_NOT_ASSIGNED`, `CLOSURE_ASSIGNMENT_CREATION_FAILED`) into the live path. |

</details>

## P1 — wire frontend and backend together — **DONE**

All eight fixed. Paths aligned, the auth hook corrected, the env variable renamed, React declared, the photo preview rendered as an image, submit validation added, deep links honoured via query strings, and staffing switched from the seed-only role codes to location membership.

<details><summary>Original P1 list</summary>


| # | Item | Fix |
|---|---|---|
| 1.1 | `GET /observations/current-assignment` (FE) vs `/current-assignments` (BE) | Pick plural on both sides. |
| 1.2 | `useClosures.js` and `Sidebar.jsx` import `features/auth/useAuth.js` for `user`, which it never returns; `isEhsOfficer` is always false | Use `useAuthenticatedUser()` from `app/authProvider.jsx`. Delete the local role helpers and use `constants/roles.js`. |
| 1.3 | `frontend/.env` sets `VITE_API_URL`; code reads `VITE_API_BASE_URL` | Rename. In containers set it to `/api` at build time. |
| 1.4 | `react`/`react-dom` not declared in `frontend/package.json` | Add `^19.3.0` to `dependencies`. |
| 1.5 | Observation photo preview renders the blob URL as text | `PhotographInput.jsx:76-78` → `<img src={photographPreview} alt="" />`. |
| 1.6 | `POST /closures/:id/submit` has no param validation | Add `closureIdValidationRules` to the route. |
| 1.7 | Dashboard deep links (`?auditId=`, `?reportId=`) are ignored by the observation and closure pages | Either read `useSearchParams` and add `GET /observations/assignments/:patrolId` / `GET /closures/:id`, or stop generating the params. Recommended: add the two GET-by-id endpoints; both repositories already have ownership-scoped finders. |
| 1.8 | Roles `AUDITOR`/`AUDITEE` exist only in seeds, so planning lookups are empty on a fresh DB | Add them to `USER_ROLES` and to the baseline `schema.sql` role inserts; or drop the role requirement and let any active user be chosen. Decide and document in [01-overview](01-overview.md#actors-and-roles). |

</details>

## P2 — missing features

### R11: location hierarchy, read from the database

**Item 2.0.** The requirement is Location → Unit → Zone → **fixed areas per zone**, and **the values are loaded into Postgres at production time. The application must read them from the tables.** Nothing about which cities, units, zones, or areas exist may be compiled into the frontend, the validators, or a CHECK constraint.

Levels 1 to 3 are modelled as tables; level 4 is not modelled at all. Separately, the value lists are hardcoded in ten places. Evidence and live data in [03-data-model](03-data-model.md#location-hierarchy-gap-r11).

**Scope of the rule.** It covers the four master-data levels only. `UA`/`UC` and `HIGH`/`MEDIUM`/`LOW` are fixed business vocabulary, not site configuration, so they stay as enums. If those should also be configurable, say so and they get the same treatment.

#### Every place a value is currently hardcoded

| # | Where | What | Action |
|---|---|---|---|
| 1 | `PatrolForm.jsx:1-7` | 5 city names | delete, render from `locations[]` |
| 2 | `PatrolForm.jsx:9-30` | Unit I–V, Roman labels built from a number | delete, render `units[].label` from `units.name` |
| 3 | `PatrolForm.jsx:32-42` | Zone 1–9 | delete, render from `zones[]` |
| 4 | `PatrolForm.jsx:44-54` | 9 area names | delete, render from the selected zone's `areas[]` |
| 5 | `ObservationCard.jsx:7-13` | 5 city names | delete; the location is already fixed by the patrol, so show it read-only |
| 6 | `observation.validator.js:6-13` | `ALLOWED_PLANT_LOCATIONS` | delete; validate against the patrol's own zone instead |
| 7 | `observation.validator.js:88` | error text naming the five cities | replace with a generic message |
| 8 | `observation.service.js:21-41` | duplicate city list | delete |
| 9 | DB `patrols_plant_location_check` | 5 cities | **drop** |
| 10 | DB `patrols_area_detail_check` | 9 areas | **drop** |
| 11 | DB `observation_report_plant_location_check` | 5 cities | **drop** |

Items 9 to 11 matter most. A CHECK constraint is a hardcoded list that lives in the database: the day operations adds a sixth city or a tenth area, every insert referencing it fails with a `23514` violation until someone ships a migration. Referential integrity should come from foreign keys to the master tables, which accept whatever rows exist.

#### Schema

**Written and verified**: `backend/database/migrations/007_add_zone_areas.sql` and `008_add_user_location.sql`. Both applied cleanly to a restore of the production dump and are idempotent. The rename, the column drops and the plant de-duplication are deliberately deferred, because each needs application code to change in the same release. Outline:

```sql
BEGIN;

-- Level 4: the fixed areas belonging to one zone.
CREATE TABLE IF NOT EXISTS zone_areas (
    id            BIGSERIAL PRIMARY KEY,
    zone_id       BIGINT NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    name          VARCHAR(100) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT zone_areas_zone_name_unique UNIQUE (zone_id, name)
);

CREATE INDEX IF NOT EXISTS zone_areas_zone_index
    ON zone_areas (zone_id, display_order);

-- A patrol covers the whole zone, so it carries no area. The observation
-- records which area the finding was in.
ALTER TABLE observation_reports
    ADD COLUMN IF NOT EXISTS zone_area_id BIGINT REFERENCES zone_areas(id);

-- zones.area_detail holds a description, not a list. Stop overloading the name.
ALTER TABLE zones RENAME COLUMN area_detail TO description;

-- One plant per city name, so the canonical_plants de-duplication CTE can be deleted.
CREATE UNIQUE INDEX IF NOT EXISTS plants_name_lower_unique
    ON plants (LOWER(BTRIM(name)));

-- Master data is validated by foreign keys from here on.
ALTER TABLE patrols              DROP CONSTRAINT IF EXISTS patrols_plant_location_check;
ALTER TABLE patrols              DROP CONSTRAINT IF EXISTS patrols_area_detail_check;
ALTER TABLE observation_reports  DROP CONSTRAINT IF EXISTS observation_report_plant_location_check;

COMMIT;
```

The unique index on plant name will fail until the duplicate Gurugram rows (`GGM` id 1 and `TEST-GGM` id 2) are merged. Do that in the same migration once you know which id to keep, or split it into its own step.

After `patrols.zone_area_id` is backfilled and verified, a follow-up migration drops `patrols.area_detail` and `patrols.plant_location`. Both are redundant: the location is reachable as `patrols.unit_id → units.plant_id → plants.name`, and the area is `zone_area_id`. Keep them until the backfill is checked.

#### Master data loading

The schema baseline creates the **tables**, never the rows. Only the five application role codes are seeded, because the app cannot function without them.

Operations loads locations, units, zones, and areas at production cutover, by SQL script or a small import. Provide `backend/database/seeds/example_master_data.sql` as a **shape reference** clearly marked as an example, so the import format is unambiguous:

```sql
-- Example only. Real values are supplied by the EHS team at cutover.
INSERT INTO plants (name, code) VALUES ('Gurugram', 'GGM');
INSERT INTO units  (plant_id, name, code, unit_number)
    SELECT id, 'Unit I', 'GGM-U1', '1' FROM plants WHERE code = 'GGM';
INSERT INTO zones  (unit_id, name, code, zone_number, description)
    SELECT id, 'Zone 1', 'GGM-U1-Z1', '1', 'Assembly and material movement'
    FROM units WHERE code = 'GGM-U1';
INSERT INTO zone_areas (zone_id, name, display_order)
    SELECT z.id, a.name, a.display_order
    FROM zones z
    CROSS JOIN (VALUES ('Tool shop',1),('Machine shop',2),
                       ('Assembly area',3),('Utility area',4)) AS a(name, display_order)
    WHERE z.code = 'GGM-U1-Z1';
```

The existing `TEST-*` seeds stay test fixtures and must not run in production.

A later admin UI for maintaining this master data is worth considering, since the `ADMIN` role exists with no screens. Not required for R11.

#### API

| Change | Detail |
|---|---|
| `GET /api/patrols/planning-lookups` | Return `areas` nested under each zone (`zones[].areas[]`) instead of the flat global `areaDetails[]`, and return each unit's and zone's own display name. Delete the `canonical_plants` CTE from all three queries once plant names are unique. |
| `POST /api/patrols` | Accept `zoneAreaId` instead of the `areaDetail` string. Keep the four-step validation and its existing error codes — the service already reads correctly, it needs repository functions that exist (0.2). Resolve the location from the unit rather than trusting a submitted string. |
| `POST /api/observations` | Stop validating `location` against a compiled list. The patrol already fixes the location, so derive it server-side and ignore or drop the field. |
| `observation_reports.observation_location` | Currently copied from the zone description. Point it at the chosen area so a report records which area was inspected. |

#### Frontend

`usePatrols.js` discards `locations`, `units`, `zones`, and `areaDetails` from the lookup response today, keeping only `auditors` and `auditees`. Keep the whole payload and drive a cascade:

1. Location select from `locations[]`.
2. Unit select filtered to `units.filter(u => u.plantId === selectedPlantId)`.
3. Zone select filtered to `zones.filter(z => z.unitId === selectedUnitId)`.
4. Area select from `selectedZone.areas`.

Each choice resets the levels below it, and each select stays disabled until its parent is chosen. Labels render straight from the data: if the table says `Unit I`, show `Unit I`. Do not rebuild it from `unit_number`, or a site that names units differently will display the wrong thing.

Because the tables may be empty before cutover, every level needs the empty state the form already uses for auditors: "No units are configured for this location." A blank select with no explanation is the failure mode to avoid.

#### Acceptance

| # | Check | Expected |
|---|---|---|
| 1 | Load master data for two cities with different unit counts | `/plan` offers exactly the configured cities |
| 2 | Choose a city | Unit list shows only that city's units, with names from the table |
| 3 | Choose a unit | Zone list shows only that unit's zones |
| 4 | Choose a zone | Area list shows exactly that zone's areas, in `display_order` |
| 5 | Change the unit after picking a zone | Zone and area reset |
| 6 | `POST /api/patrols` with a `zoneAreaId` from another zone | `400 AREA_DETAIL_NOT_FOUND_FOR_ZONE` |
| 7 | `POST /api/patrols` with a unit from another location | `400 UNIT_NOT_FOUND_FOR_LOCATION` |
| 8 | **Insert a brand-new city, unit, zone and areas with plain SQL, no redeploy** | They appear in `/plan` on next load and a patrol can be scheduled against them |
| 9 | Run with the master tables empty | Each select shows a "not configured" message, no crash |
| 10 | Schedule a valid patrol | 201; row carries `zone_area_id`; dashboard and observation form show the area |

Check 8 is the one that proves the requirement. If it needs a code change, the values are still hardcoded somewhere.

### Observations page: weekly list and report detail

**Item 2.1.** The page shows one assignment per week, but a person can audit several zones. It also cannot show a filled observation at all, because the weekly query excludes reports twice over, and no endpoint returns a report's contents. Full plan with schema-free backend changes, component split and acceptance checks: [10-observations-page-plan.md](10-observations-page-plan.md). Includes item 0.1, so do them together.

**Item 2.2.** Closures have the same defect and additionally have no approval loop, so nothing can ever reach a completed state. Full plan, including the approve and reject endpoints that supersede the design sketched below: [11-closure-page-plan.md](11-closure-page-plan.md).

### Plan page: role gating and location-scoped scheduling

**Item 2.3.** The Plan page is visible to every signed-in user, shows every zone in the company, and picks auditors by a role code that exists only in seed data. It also needs two schema concepts that do not exist: an officer's location domain and users belonging to a location. Full plan: [12-plan-page-plan.md](12-plan-page-plan.md). Supersedes items 1.8 and 2.4, and revisits the area column placement agreed in R11.

### Approval workflow design (R6, second half)

Backend (`closures` module). Validators already exist in `closure.validator.js`.

| Endpoint | Auth | Behaviour |
|---|---|---|
| `GET /api/closures/pending-approvals` | `EHS_OFFICER` (and `ADMIN`) | Closures with status `SUBMITTED_FOR_CLOSURE`, optionally filtered to patrols where `ehs_officer_id = me`, ordered by `submitted_for_closure_at` (index `closure_requests_approval_queue_index` exists). Returns `{ closures: [<closure>] }`. |
| `GET /api/closures/:closureId` | auditee, auditor, or EHS officer of the patrol | `{ closure }`. Replaces the frontend's `/approval` path. |
| `POST /api/closures/:closureId/approve` | `EHS_OFFICER`/`ADMIN` | Precondition `SUBMITTED_FOR_CLOSURE`. Transaction: closure → `APPROVED` (`reviewed_by`, `reviewed_at`, `review_comments` optional, `approved_at`, `closed_at`, `approval_iteration + 1`); report → `CLOSED` with `closed_at`; patrol → `COMPLETED`. |
| `POST /api/closures/:closureId/reject` | `EHS_OFFICER`/`ADMIN` | Precondition `SUBMITTED_FOR_CLOSURE`; `reviewComments` required (≤1000). Transaction: closure → `REEXAMINATION_REQUIRED` (review columns, iteration +1); report → `REEXAMINATION_REQUIRED`; patrol → `REEXAMINATION_REQUIRED`. The existing `PATCH action-plan` already accepts `REEXAMINATION_REQUIRED` → `IN_PROGRESS`, and `submit` moves it back to `SUBMITTED_FOR_CLOSURE`, closing the loop. |

Decide whether `REJECTED` (terminal) is needed at all; if not, drop it from the CHECK constraint in a migration. `metrics.closures.actual` on the dashboard starts working once `APPROVED` + `closed_at` are written.

Frontend: `useClosures.js` and `ApprovalPanel.jsx` already implement the queue and the approve/reject calls; after P0/P1 they only need the endpoint paths aligned (`/approval` → `/:id`).

### Other missing features

| # | Item | Notes |
|---|---|---|
| 2.1 | R9 edit/cancel a patrol | `PATCH /api/patrols/:id` (date, auditor, auditee, area; reuse the conflict check) and `POST /api/patrols/:id/cancel` → `CANCELLED`. Only while `SCHEDULED`. Frontend: edit affordance on the calendar/planning page. |
| 2.2 | R7 overdue alerts | Needs a scheduled job (in-process `setInterval`/`node-cron` in the backend container is enough for one instance) that finds closures past `target_date` still not `APPROVED`, and a notification channel: in-app table + optional SMTP. Design after containerization; the sibling project has a working reference (`ALERT_CRON`, SMTP env). |
| 2.3 | Logout endpoint | Optional. Would let `authentication_events(LOGOUT)` be written. Token is stateless, so real revocation needs a denylist or short expiry. |
| 2.4 | Role-based routing on the frontend | Gate `/plan` (and the sidebar link) on `EHS_OFFICER`/`ADMIN`; gate the approval UI likewise. Replace `canPlanAudits = true`. |
| 2.5 | Admin user management | `ADMIN` role exists but has no screens or endpoints (role assignment, deactivate). |

## P3 — correctness and consistency

| # | Item |
|---|---|
| 3.1 | `authorize("USER")` on observation/closure routes blocks any account without `USER` (management accounts created outside signup). Use `authenticate` only where ownership is checked in SQL, or ensure every account has `USER`. |
| 3.2 | `authorize("EHS_OFFICER")` on patrols excludes `ADMIN`, while login redirect and dashboard treat `ADMIN` as management. Pick one definition of "management" and put it in `shared/constants/roles.js`. |
| 3.3 | Server-local vs UTC "today" (`patrol.service`, `closure.service` vs `dashboard.service`). Standardise on one (UTC, with `TZ` set in the container) or on an explicit plant timezone. |
| 3.4 | Dashboard week/metrics ignore the requested `year`/`month`; `metricsPeriod` is always the current year. Either document as intended or honour the period. |
| 3.5 | Closure submit updates patrol/report status unconditionally by id; add status preconditions to the `WHERE` clauses. |
| 3.6 | `findPatrolById` inner-joins the EHS officer; use LEFT JOIN like every other query or scheduling a patrol with a null officer 500s. |
| 3.7 | `errorHandler` passes `details` through on 5xx; strip it. |
| 3.8 | `location` is compared case-sensitively while `category`/`riskCategory` are uppercased; normalise consistently. |
| 3.9 | No global 401 handling in the frontend; add an interceptor in `apiClient.js` that clears storage and redirects to `/sign-in`, and call `/auth/me` on app load to validate the cached user. |
| 3.10 | ~~`closure_requests.status` default `'REQUESTED'` violates its own CHECK.~~ **Fixed** in migration 009. |
| 3.11 | *(promoted to 2.0)* Plant location and area detail are CHECK-constrained free text while `plants`/`zones` tables exist. |
| 3.12 | Refresh and month-navigation buttons are not disabled during fetches; responses can race. Track an in-flight flag or abort with `AbortController`. |

## P4 — code health and UX

- Consolidate five `getErrorMessage`, six `formatDate`, three role-normalisation helpers, and the three copies of `countWords` (backend) into shared modules.
- Move storage-key literals to `constants/`.
- Extract duplicated dashboard SQL (`findAssignedMonthlyPatrols` = `findUserCurrentWeekPatrols`, same for management) into one query with a date-range parameter.
- Remove unused exports (`fetchCurrentUser`, `fetchClosureForApproval`, `findCalendarPatrols`, `PERMITTED_FORM_FIELDS`, Sidebar helpers) and the duplicate error-handler registration in `app.js`.
- Word-limit overflow should truncate or warn, not drop keystrokes (breaks paste).
- Introduce CSS custom properties for the palette; consolidate breakpoints.
- Accessibility: headings inside buttons, `RiskSelector` keyboard handling, `PatrolCalendar` grid rows, `aria-required`/`aria-describedby` on form errors.
- Add a test harness (backend: `node --test` + a throwaway Postgres via compose; frontend: Vitest) so the P0 class of bug is caught by `npm test`. Even a single "app imports and `/api/health` answers" test would have caught 0.1.
- Delete or regenerate `folder_structure.txt`.
