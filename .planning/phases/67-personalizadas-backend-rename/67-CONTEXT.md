# Phase 67: Personalizadas Backend Rename - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning
**Source:** PRD Express Path (.docs/journey-wrap-up.md)

<domain>
## Phase Boundary

Rename all backend references from "journey/journeys" to "personalizada/personalizadas". This covers: database tables and columns (via migration), API module folder and all internal files, types, constants, service names, route paths, pipeline file, cross-references from other modules, and integration tests.

This is Step 1 of 5 in the Clases Personalizadas launch. Frontend rename (Phase 68) depends on this phase completing first.

</domain>

<decisions>
## Implementation Decisions

### Database Migration

- Rename table `member_journeys` → `member_personalizadas`
- Rename column `journey_type` → `personalizada_type` in tables: `member_personalizadas`, `sessions`, `completed_sessions`
- Update dayId prefix from `J-` to `P-` in existing session records (if any exist in staging/prod)
- The 6 type codes (`tren_superior`, `empuje`, etc.) stay as-is — no changes to type enum values

### API Module Rename

- Rename folder `src/modules/journeys/` → `src/modules/personalizadas/`
- Rename all types: `JourneyType` → `PersonalizadaType`, `JourneyService` → `PersonalizadasService`, `JourneyProgress` → `PersonalizadaProgress`, etc.
- Rename constants: `JOURNEY_ROUTE_MAP` → `PERSONALIZADA_ROUTE_MAP`, `JOURNEY_METADATA` → `PERSONALIZADA_METADATA`, etc.
- Update metadata display names from "Journey" labels to Spanish "Clase Personalizada" labels

### Route Paths

- Rename route paths: `/journeys/*` → `/personalizadas/*`
- Rename admin route paths: `/admin/journeys/*` → `/admin/personalizadas/*`

### Pipeline

- Rename pipeline file: `journey-pipeline.ts` → `personalizada-pipeline.ts`
- Update `app.ts` registration: `journeyRoutes` → `personalizadasRoutes`

### Cross-References

- Update `admin/service.ts`: `SessionFilter.journeyType` → `SessionFilter.personalizadaType`
- Update `admin/routes.ts`: `journeyType` query param → `personalizadaType`
- Update `sessions/types.ts`: `journeyType` field → `personalizadaType`

### Tests

- Rename test folder `test/journeys/` → `test/personalizadas/`
- Update all endpoint paths and type references in tests

### Claude's Discretion

- Migration file naming convention and numbering
- Whether to do the rename in a single migration or split table rename from column renames
- Internal variable naming within migration file
- Order of operations within the migration

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema

- `el-templo-api/src/db/schema/member-journeys.ts` — Current table definition to rename

### Module

- `el-templo-api/src/modules/journeys/` — Entire folder to rename (service, routes, types, constants)
- `el-templo-api/src/modules/sessions/pipeline/journey-pipeline.ts` — Pipeline file to rename
- `el-templo-api/src/modules/sessions/types.ts` — Contains `journeyType` field reference

### Cross-Module References

- `el-templo-api/src/modules/admin/service.ts` — `SessionFilter.journeyType` reference
- `el-templo-api/src/modules/admin/routes.ts` — `journeyType` query param reference
- `el-templo-api/src/app.ts` — Route registration entry point

### Tests

- `el-templo-api/test/journeys/` — Test folder to rename

### Spec

- `.docs/journey-wrap-up.md` — Full wrap-up spec (Steps 1-5, only Step 1 applies to this phase)

</canonical_refs>

<specifics>
## Specific Ideas

- The 6 journey type codes are: `tren_superior`, `empuje`, `jalón`, `core`, `piernas`, `cuerpo_completo` — these stay unchanged
- Metadata display names should change from English "Journey" labels to Spanish "Clase Personalizada" labels
- The `dayId` prefix change (`J-` → `P-`) only needs to update existing records; new records will naturally use the new prefix from the renamed code

</specifics>

<deferred>
## Deferred Ideas

- Frontend rename — Phase 68
- Subscription gating — Phase 69
- AURA rewards on completion — Phase 69
- Member app module enable — Phase 69
- Attendance integration for personalizadas — post-v4.2
- Coach-editable metadata — post-v4.2
- Branch-scoped member list — post-v4.2
- Per-type AURA amounts — post-v4.2

</deferred>

---

_Phase: 67-personalizadas-backend-rename_
_Context gathered: 2026-03-18 via PRD Express Path_
