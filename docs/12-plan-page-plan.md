# 12. Plan page: scoped audit scheduling for the EHS Officer

Implementation plan for the EHS Officer's Plan page.

**Goal**

1. Only users with the `EHS_OFFICER` role see the Plan button and can reach the page.
2. The page offers a **Schedule an audit** button opening a form with: audit date, zone, auditor, auditee.
3. The officer sees **only the zones in their own location**. Each location has its own officer, covering all units at that location.
4. Auditor and auditee are chosen from **registered users at that location**.
5. **Area details fill in automatically from the selected zone.**
6. On submit the audit is scheduled and appears in the **dashboard weekly card**.
7. The audit appears on the selected **auditor's Observations page**, open for a report.

Prerequisite: item 0.2 in [09](09-feature-refinement-backlog.md). `POST /api/patrols` calls four repository functions that do not exist, so scheduling returns a 500 today.

## Two concepts the schema does not have

Requirements 3 and 4 both depend on **users belonging to a location**, which nothing models. The `users` table has twelve columns and none of them is a location. Today the officer sees every zone in the company, and the auditor and auditee dropdowns are filled by role code across all locations.

This is now in `backend/database/migrations/008_add_user_location.sql`:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS plant_id BIGINT REFERENCES plants(id);
CREATE INDEX IF NOT EXISTS users_plant_index ON users (plant_id) WHERE is_active;
```

One column answers both. For an officer it defines the domain they can plan in; for everyone else it defines which dropdowns they appear in.

**This retires the `AUDITOR` and `AUDITEE` role codes.** Requirement 4 says *all registered users for that location*, not users holding a particular role. The candidate query becomes location plus active, with no role join. Those two codes exist only in the seed scripts and nothing in `src/` defines them, so scheduling currently fails on a freshly loaded database. Removing the dependency closes backlog item 1.8.

**Backfill is mandatory.** Every existing user has a null `plant_id`, so on the day this ships every dropdown is empty and no officer can plan anything. Assign existing users to a location in the same migration, and have the page state plainly that the officer's location is not set rather than rendering an empty form.

**Not supported by one column:** an officer covering two locations, or a user who audits outside their own site. Both need a `user_plants` join table instead. Say so if either is real; the rest of this plan is unchanged.

## How areas work (confirmed)

[R11](01-overview.md#location-hierarchy) established that each zone owns a fixed list of areas, and my earlier plan had the officer pick one of them per patrol. Requirement 5 says the area details fill in automatically from the zone, which is a different model: the officer does not choose an area at all.

**Confirmed model.** A patrol covers the **whole zone**. The zone's fixed areas are displayed read-only on the form as confirmation of what the auditor will walk. The area is then chosen later, by the **auditor**, when filing the observation, because a finding happens in one specific area.

This is coherent with both requirements, and the schema now reflects it:

- `zone_areas` holds the per-zone fixed list, as R11 designed.
- `patrols` carries **no** area column. A patrol is identified by its zone, and the areas follow from it.
- `observation_reports.zone_area_id` records the one area a finding occurred in.
- The Observations form's read-only "location of observation" field becomes a dropdown of the zone's areas. See [10](10-observations-page-plan.md#recording-the-area).

Both changes are in `backend/database/migrations/007_add_zone_areas.sql`, applied and verified against a copy of the production dump.

## Access control

The backend is already gated: both patrol routes carry `authorize("EHS_OFFICER")`. The frontend has no gating at all.

| Layer | Now | Change |
|---|---|---|
| Sidebar link | `const canPlanAudits = true` | Derive from the signed-in user's roles |
| Route `/plan` | No guard, reachable by URL | Wrap in a role guard that redirects to `/dashboard` |
| `GET /patrols/planning-lookups` | `authorize("EHS_OFFICER")` | Keep, add location scoping |
| `POST /patrols` | `authorize("EHS_OFFICER")` | Keep, add location enforcement |

Sidebar and route guard are convenience, not security. The API is the boundary and already holds it.

Two existing defects block the gate from working: the sidebar reads `user` from the login form hook, which never returns it, and seventy lines of role helpers in that file are dead code. Fix per backlog item 1.2, then:

```jsx
const { user } = useAuthenticatedUser();
const canPlanAudits = hasRole(user, APP_ROLES.EHS_OFFICER);
```

Use the shared helpers in `constants/roles.js` rather than the local copies. Add a small `RequireRole` wrapper in `routes.jsx`; it will be reused for the closure approval screens.

**Decide whether `ADMIN` counts.** Login already redirects admins to the officer landing page and the dashboard treats them as management, but `authorize("EHS_OFFICER")` excludes them, so an admin is bounced from the page their own login sends them toward. This is backlog item 3.2. Recommendation: accept both codes here and settle the definition of management in one shared constant.

## Backend

### 1. Scope the lookups to the officer's location

`getPlanningLookups()` takes no arguments and returns every location, unit and zone in the company. Change it to `getPlanningLookups(userId)`:

1. Resolve the caller's `plant_id`. Null → `400 EHS_OFFICER_LOCATION_NOT_SET` with a message naming the fix.
2. Return only that plant's units and zones, each zone carrying its `areas[]`.
3. Return candidate users as active users with the same `plant_id`, excluding the officer themselves.

```json
{
  "location": { "id": 1, "name": "Gurugram" },
  "units": [ { "id": 1, "name": "Unit I", "unitNumber": "1" } ],
  "zones": [ { "id": 4, "unitId": 1, "name": "Zone 1", "zoneNumber": "1",
               "areas": [ { "id": 9, "name": "Tool shop" },
                          { "id": 10, "name": "Machine shop" } ] } ],
  "users": [ { "id": 7, "fullName": "…", "username": "…" } ]
}
```

One `users` array replaces the separate `auditors` and `auditees` lists, since both draw from the same pool. The location is a single object, not a list: the officer does not choose it.

Delete the `canonical_plants` CTE from all three queries once R11 makes plant names unique. Scoping to one plant makes the de-duplication pointless anyway.

### 2. Enforce the scope on write

Dropdown scoping is presentation. `POST /api/patrols` must re-verify everything, because the request is user-controlled:

- The caller holds `EHS_OFFICER` and has a `plant_id`.
- The zone resolves through `zones → units → plants` to **that same plant**. Otherwise `403 ZONE_OUTSIDE_OFFICER_DOMAIN`.
- Auditor and auditee are active users with that `plant_id`. Otherwise `400 INVALID_AUDITOR` / `INVALID_AUDITEE`.
- Auditor differs from auditee. Already enforced by a validator and a database constraint.
- No scheduling conflict for either person on that date. Already implemented.
- The date is today or later. Already implemented, though by lexical string comparison against server-local today.

The service already has the right four-step shape and error codes. It needs repository functions that exist, and the officer's plant threaded through.

**Simplify the request body.** It currently takes `location`, `unit`, `zone` and `areaDetail` as free strings that are resolved by name, which is why four lookup functions were needed. Take `zoneId`, `scheduledDate`, `auditorId`, `auditeeId` instead. The unit and location are implied by the zone, and the areas follow from it. One lookup replaces four, and a whole class of name-matching failure disappears.

Set `ehs_officer_id` to the caller and `created_by` to the caller. Note they are currently passed the same parameter, which is correct only while officers are the sole schedulers.

### 3. Downstream, already handled

Requirements 6 and 7 need no new code if the patrol row is written correctly.

- **Dashboard weekly card** queries patrols by date range and by the user's `auditor_id` or `auditee_id`. A new `SCHEDULED` row appears for both people automatically.
- **Auditor's Observations page** queries the current week where the user is auditor, the patrol is not cancelled, and no report exists. A new row qualifies immediately.

One caveat worth stating in the UI: an audit scheduled for a **future** week correctly does not appear on the Observations page until that week arrives. Officers will otherwise report it as a bug.

## Frontend

### Form

```
Schedule an audit                                  Location: Gurugram
──────────────────────────────────────────────────────────────────────
Audit date      [ 2026-09-22        ]   (min = today)
Unit            [ Unit I         ▾ ]
Zone            [ Zone 1         ▾ ]   (only Unit I's zones)
Area details      Tool shop · Machine shop · Assembly area · Utility area
                  ^ read-only, from the selected zone
Auditor         [ A. Sharma      ▾ ]   (users at Gurugram)
Auditee         [ R. Nair        ▾ ]   (same list, minus the auditor)

                              [ Cancel ]  [ Schedule audit ]
```

- Location renders as a label, not a select.
- Unit and zone cascade; changing the unit resets the zone and the areas.
- Area details is a read-only chip list populated from `selectedZone.areas`. Empty zone → "No areas configured for this zone", and block submission, since the auditor would have nothing to inspect.
- Auditee excludes whoever is selected as auditor, so the two can never match in the UI. The server still checks.
- Submit stays disabled until every field is set.

### Deleting the hardcoded lists

`PatrolForm.jsx` hardcodes five cities, Unit I to V, Zone 1 to 9, and nine area names; `usePatrols.js` discards the lookup payload and keeps only the user lists. All of it goes, per [R12](01-overview.md#location-hierarchy). Labels render from the data: if the table says `Unit I`, show `Unit I`, never rebuild it from a number.

Every select needs an empty state, because master data is loaded at production cutover and may be missing: "No units are configured for this location." A blank dropdown with no explanation is the failure to avoid.

### After scheduling

Keep the existing confirmation strip but fill it from the response rather than the hardcoded "Scheduled" label. Offer two next steps: schedule another, or open the dashboard to see the new audit on the weekly card.

## Open questions

1. **Can one location have several EHS Officers?** The single column allows it and that seems operationally sensible for cover and handover. Say if it must be exactly one.
3. **Should the officer see audits they have already scheduled?** The page currently shows only a confirmation for the last one. A list of upcoming audits for their location is the obvious companion, and is the natural home for editing and cancelling an audit, which is requirement R9 and still unbuilt.

## Acceptance checks

| # | Setup | Expected |
|---|---|---|
| 1 | Sign in as a user without `EHS_OFFICER` | No Plan link in the sidebar |
| 2 | That user types `/plan` directly | Redirected to `/dashboard` |
| 3 | That user calls `POST /api/patrols` directly | `403 INSUFFICIENT_PERMISSIONS`, nothing written |
| 4 | Sign in as the Gurugram officer | Plan link visible, page shows Gurugram as the location |
| 5 | Open the unit dropdown | Only Gurugram's units, named as the table names them |
| 6 | Pick a unit | Only that unit's zones |
| 7 | Pick a zone | Area details fill in read-only with that zone's fixed areas |
| 8 | Change the unit | Zone and area details reset |
| 9 | Open the auditor dropdown | Only active users whose location is Gurugram |
| 10 | Select an auditor | They disappear from the auditee dropdown |
| 11 | `POST` a `zoneId` belonging to Pune | `403 ZONE_OUTSIDE_OFFICER_DOMAIN`, nothing written |
| 12 | `POST` an `auditorId` from another location | `400 INVALID_AUDITOR`, nothing written |
| 13 | Schedule a valid audit this week | 201; row has `ehs_officer_id` = caller, status `SCHEDULED` |
| 14 | Sign in as that auditor | Audit on the dashboard weekly card, and on Observations open for a report |
| 15 | Sign in as that auditee | Audit on their dashboard weekly card |
| 16 | File the observation as the auditor | Succeeds; patrol moves to `PENDING_AUDITEE_ACTION`; closure opens for the auditee |
| 17 | Schedule the same auditor twice on one date | `409 AUDITOR_SCHEDULING_CONFLICT` |
| 18 | Schedule for a **future** week | Accepted; not on Observations until that week begins |
| 19 | Officer with a null `plant_id` opens the page | Clear message that their location is not set, no empty form |
| 20 | Zone with no areas configured | Area details says so and submission is blocked |
