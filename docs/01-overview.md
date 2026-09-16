# 1. Overview

## What the product is

An internal Environmental, Health & Safety (EHS) inspection tool for a multi-plant manufacturing company (plants: Gurugram, Manesar, Pune, Chennai, China). It replaces a paper/Excel "patrol" process:

1. An **EHS Officer** plans weekly safety **patrols**: for a given plant → unit → zone → area, on a date, with an **auditor** (the person who walks the floor) and an **auditee** (the person responsible for the area).
2. The auditor performs the patrol and files one **observation report** per patrol: a photograph, a description, a category (Unsafe Act `UA` / Unsafe Condition `UC`), and a risk level (`HIGH`/`MEDIUM`/`LOW`).
3. Filing the report automatically opens a **closure request** for the auditee, who records an action plan (responsible HOD, target date) and later submits it for closure with a completion date.
4. The EHS Officer reviews the submitted closure and approves it, rejects it, or asks for re-examination. *(Backend for this step is not implemented yet; see [09-feature-refinement-backlog.md](09-feature-refinement-backlog.md).)*
5. Everyone sees a **dashboard**: their own current-week task (auditor or auditee), the month's patrols on a calendar, and annual metrics. Management roles see the plant-wide view.

## Actors and roles

Role codes live in `backend/src/shared/constants/roles.js` and the `roles` table.

| Role code | Who | What they can do today |
|---|---|---|
| `USER` | Every signed-up account | Dashboard, file observation reports for patrols where they are the auditor, work closures where they are the auditee |
| `EHS_OFFICER` | Safety officer | Everything `USER` can, plus `/plan` (schedule patrols). Login redirects to `/ehs-officer` → `/dashboard`. Intended approver of closures |
| `HOD` | Head of Department | `USER` plus management dashboard view |
| `PLANT_HEAD` | Plant head | `USER` plus management dashboard view |
| `ADMIN` | Reserved | Treated like `EHS_OFFICER` for login redirect only; no admin screens exist |

"Auditor" and "auditee" are **not roles**. They are per-patrol assignments (`patrols.auditor_id`, `patrols.auditee_id`). The seed scripts insert `AUDITOR`/`AUDITEE` rows into `roles` for test convenience, but no code checks them.

## Location hierarchy

The division has four levels. Every patrol is planned against one path through it.

```
Location (city)        Gurugram
└── Unit (factory)     Unit I, Unit II, Unit III
    └── Zone (area inside the plant)   Zone 1, Zone 2, Zone 3
        └── Areas (fixed per zone)     Tool shop, Machine shop, Assembly area, Utility area
```

Each zone owns a **fixed, static list of areas**. The list differs from zone to zone: Unit I Zone 1's areas are not Unit I Zone 2's areas. Selecting the four levels must cascade, each choice narrowing the next.

**The values live in Postgres and are loaded at production cutover.** The application reads all four levels from the tables at runtime. No city, unit, zone, or area name may be compiled into the frontend, a validator, or a CHECK constraint, because adding one later would then require a code change and a deploy. Today the values are hardcoded in ten places, listed in [the backlog](09-feature-refinement-backlog.md#every-place-a-value-is-currently-hardcoded).

This applies to the four master-data levels. `UA`/`UC` and `HIGH`/`MEDIUM`/`LOW` are fixed business vocabulary and stay as enums.

**Conformance as of commit `24bb98a`:**

| Level | Requirement | Schema | Planning API | Planning UI |
|---|---|---|---|---|
| 1 Location | City list | `plants` table, but duplicated rows (Gurugram twice) force a "canonical plant" de-duplication in three queries; `patrols.plant_location` is text, not a FK | returns `locations[]` | hard-coded 5-item list |
| 2 Unit | Belongs to a location | `units.plant_id` FK — correct | returns `units[]` with `plantId` | hard-coded Unit I–V, **not filtered by location** |
| 3 Zone | Belongs to a unit | `zones.unit_id` FK — correct | returns `zones[]` with `unitId` | hard-coded Zone 1–9, **not filtered by unit** |
| 4 Area | **Fixed set per zone** | **No such table.** `patrols.area_detail` is a CHECK list of nine values shared by every zone; `zones.area_detail` is one free-text description | returns `areaDetails[]` as a flat global array | hard-coded 9-item list, **not filtered by zone** |

The backend *intends* to enforce the cascade: `patrol.service.js` validates plant → unit-in-plant → zone-in-unit → area-configured-for-zone and has dedicated error codes (`UNIT_NOT_FOUND_FOR_LOCATION`, `ZONE_NOT_FOUND_FOR_UNIT`, `AREA_DETAIL_NOT_FOUND_FOR_ZONE`). All four repository functions it calls are missing, so the endpoint fails before any of it runs.

The work to close this is [P2 in the backlog](09-feature-refinement-backlog.md#r11-location-hierarchy-read-from-the-database).

## Requirements map

Mirrors the numbering used in the sibling project's architecture doc so the two can be compared.

| ID | Requirement | Status in this repo | Where |
|---|---|---|---|
| R1 | Sign up | Done | `POST /api/auth/signup`, `SignupPage` |
| R2 | Log in | Done (rate-limited, lockout) | `POST /api/auth/login`, `LoginPage` |
| R3 | Log out | Client-side only (token dropped from localStorage) | `AppLayout` sign-out button |
| R4 | Plan a weekly audit | Done, location-scoped, EHS Officer only | `POST /api/patrols`, `PlanningPage` |
| R5 | Create an observation report | Done, with photo upload | `POST /api/observations`, `ObservationPage` |
| R6 | Close an observation report | Done, including the EHS approval and re-examination loop | `closures` module, `ClosurePage` |
| R7 | Alerts for overdue open observations | Not started | — |
| R8 | Monthly calendar of planned audits | Done (read-only) | `GET /api/dashboard?year&month`, `PatrolCalendar` |
| R9 | Edit an assigned audit | Not started (no `PATCH /api/patrols/:id`) | — |
| R10 | Containerised frontend + backend + DB via compose | Done | [08-containerization-plan.md](08-containerization-plan.md) |
| R11 | Location → Unit → Zone → Area division, areas fixed per zone | Done | [Location hierarchy](#location-hierarchy) |
| R12 | All four levels read from the database, values loaded at production | Done, no hardcoded master data remains | [Location hierarchy](#location-hierarchy) |
| R13 | EHS Officer scoped to a location; staff chosen from that location | Done | [12-plan-page-plan.md](12-plan-page-plan.md) |

## Glossary

- **Patrol / audit** — used interchangeably in code and UI. DB table is `patrols`; dashboard code calls them "audits".
- **Observation report** — the auditor's findings for one patrol. Exactly one per patrol.
- **Closure / closure request** — the auditee's remediation record for one observation report. Exactly one per report.
- **Current week** — ISO week (Monday–Sunday). The "current task" on the dashboard and the "current assignment" on the observation page both mean *the patrol scheduled in the current ISO week where the user is auditor (observations) or auditee (closures)*.
- **Week number** — sequential count of patrols for the same zone, computed in SQL (`observation.repository.js`), shown on the observation form. Not the ISO week.
- **Location** — the city a plant is in. Level 1 of the division. The five names in the code today (Gurugram, Manesar, Pune, Chennai, China) are placeholders; production values come from the `plants` table. Modelled by the `plants` table, but `patrols.plant_location` stores the **name as CHECK-constrained text**, not a FK to `plants.id`.
- **Unit** — a factory/plant at a location, numbered with Roman numerals in the UI (Unit I, Unit II…). Level 2. Modelled correctly by `units.plant_id`.
- **Zone** — an area inside a unit (Zone 1, Zone 2…). Level 3. Modelled correctly by `zones.unit_id`.
- **Area / area detail** — per R11 these are the **fixed areas belonging to one zone** (e.g. Gurugram Unit I Zone 1 → Tool shop, Machine shop, Assembly area, Utility area). **The code does not model this.** `patrols.area_detail` is CHECK-constrained to nine values that are identical for every zone, and `zones.area_detail` is a single free-text *description* of the zone, not a list. See [Location hierarchy](#location-hierarchy).
