# EHS Inspection App — Knowledge base

Reference documentation for humans and for Claude Code sessions. `CLAUDE.md` at the repo root is the short operational summary; these files hold the detail.

| # | Document | Read it when |
|---|---|---|
| 1 | [Overview](01-overview.md) | You need the domain, the actors, the requirement list and its status |
| 2 | [Architecture](02-architecture.md) | You are adding an endpoint or a feature folder and need the layering rules |
| 3 | [Data model](03-data-model.md) | You are touching SQL, statuses, allowed-value lists, or migrations |
| 4 | [API reference](04-api-reference.md) | You need the exact request/response/error contract of an endpoint |
| 5 | [Workflows](05-workflows.md) | You need to know which endpoint moves which status, end to end |
| 6 | [Frontend](06-frontend.md) | You are changing pages, hooks, routing, or auth handling |
| 7 | [Environment and config](07-environment-and-config.md) | Env vars, ports, toolchain constraints, what is (wrongly) committed |
| 8 | [Containerization plan](08-containerization-plan.md) | **Initiative 1** — three-container compose design, files, bootstrap, acceptance checks |
| 9 | [Feature refinement backlog](09-feature-refinement-backlog.md) | **Initiative 2** — known bugs, drift, incomplete features, prioritised work |
| 10 | [Observations page plan](10-observations-page-plan.md) | Implementing the weekly pending list and the submitted-report detail view |
| 11 | [Closure page plan](11-closure-page-plan.md) | Implementing the pending list, the EHS approval loop, and the completed detail view |
| 12 | [Plan page plan](12-plan-page-plan.md) | Implementing role-gated, location-scoped audit scheduling for the EHS Officer |
| 13 | [Action ticket plan](13-action-ticket-plan.md) | Implementing the `ACTION_HOD` role, the auditee → Action HOD assignment, and the ticket page with evidence uploads |
| 14 | [Weekly roster plan](14-weekly-roster-plan.md) | Implementing the roster file upload, automatic Monday scheduling to 31 December, the officer's week card, and propagated auditor/auditee edits |
| 15 | [Observations refinement plan](15-observations-refinement-plan.md) | Implementing up to 10 observations per report, "No observation to record", the Thursday deadline, and the six-month history with the closed-via-ticket filter |
| 16 | [Closure refinement plan](16-closure-refinement-plan.md) | One action plan and ticket per observation, and the Open / In Progress / Closed closure status derived from ticket outcomes |
| 17 | [Ticket refinement plan](17-ticket-refinement-plan.md) | Departments mapped to Action Team HODs, EHS Officer approval or reopen of every ticket outcome, and the HOD's six-month history tab |
| 10 | [Schema migration plan](10-schema-migration-plan.md) | Implementing the `users` / `zone_audits` / `observations` schema and reworking backend + frontend wiring to match |

## Maintaining these docs

- Update the doc in the same change that alters the behaviour it describes; the API reference and workflow doc go stale fastest.
- `folder_structure.txt` at the root is a stale snapshot and is not part of this knowledge base. Delete it or regenerate it with `tree -I node_modules`.
- Keep `CLAUDE.md` short; link here instead of duplicating.
