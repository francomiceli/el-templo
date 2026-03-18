# Phase 68: Personalizadas Frontend Rename - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning
**Source:** PRD Express Path (.docs/journey-wrap-up.md)

<domain>
## Phase Boundary

Rename all frontend references from "journey/journeys" to "personalizada/personalizadas" across both the admin app (el-templo-admin) and member app (el-templo-app). This covers: type files, composables, stores, pages, components, route paths, and UI-visible text.

This is Step 2 of 5 in the Clases Personalizadas launch. Depends on Phase 67 (backend rename) being complete — frontend now calls `/personalizadas/*` endpoints. The member app module stays commented out in `boot/modules.ts` until Phase 69.

</domain>

<decisions>
## Implementation Decisions

### Admin App Rename

- Rename `src/types/journey.ts` → `src/types/personalizada.ts`
- Rename `src/composables/useJourneyAdminApi.ts` → `src/composables/usePersonalizadasAdminApi.ts`
- Update all type names: `JourneyType` → `PersonalizadaType`, `JourneyMetadata` → `PersonalizadaMetadata`, etc.
- Update all API endpoint paths from `/admin/journeys/*` to `/admin/personalizadas/*`
- Update `GeneratePage.vue` — tab labels, function names, variable names referencing journey
- Update `SessionsPage.vue` — journey type filter references
- Update `AlumnoDetailPage.vue` — journey references in member detail

### Member App Rename

- Rename folder `src/modules/journey/` → `src/modules/personalizada/`
- Rename all files inside: stores, composables, pages, components
- `journeyStore` → `personalizadaStore`, `useJourneyApi` → `usePersonalizadaApi`, etc.
- Update all page text: "Elige tu Journey" → "Elige tu Clase Personalizada", etc.
- Update route paths: `/journey/*` → `/personalizada/*`
- Rename progression components: `JourneySection.vue` → `PersonalizadaSection.vue`
- Update `useJourneyProgress.ts` → `usePersonalizadaProgress.ts`
- Keep `boot/modules.ts` import paths commented out (updated to reference personalizada, but stay commented until Phase 69)

### UI Text (Spanish)

- All user-facing text changes from English "Journey" labels to Spanish "Clase Personalizada" / "Personalizadas"
- Internal code identifiers use "personalizada/personalizadas" (no spaces)

### Claude's Discretion

- Order of admin vs member app rename (can be parallel since independent apps)
- Internal variable naming conventions within Vue components
- Whether to split admin and member app into separate plans or combine

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Admin App

- `el-templo-admin/src/types/journey.ts` — Type file to rename
- `el-templo-admin/src/composables/useJourneyAdminApi.ts` — Composable to rename
- `el-templo-admin/src/pages/GeneratePage.vue` — Journey references in generate page
- `el-templo-admin/src/pages/SessionsPage.vue` — Journey type filter references
- `el-templo-admin/src/pages/AlumnoDetailPage.vue` — Journey references in member detail

### Member App

- `el-templo-app/src/modules/journey/` — Entire folder to rename
- `el-templo-app/src/modules/progression/components/JourneySection.vue` — Component to rename
- `el-templo-app/src/modules/progression/composables/useJourneyProgress.ts` — Composable to rename
- `el-templo-app/src/boot/modules.ts` — Import paths to update (keep commented)

### Spec

- `.docs/journey-wrap-up.md` — Full wrap-up spec (Step 2 applies to this phase)

### Backend Reference (completed Phase 67)

- `el-templo-api/src/modules/personalizadas/` — Renamed API module (endpoints are now `/personalizadas/*`)

</canonical_refs>

<specifics>
## Specific Ideas

- The 6 type codes (`tren_superior`, `empuje`, etc.) stay as-is in frontend too — only the wrapping type name changes
- API endpoints are already renamed in Phase 67 — frontend just needs to match
- `boot/modules.ts` lines should be updated to reference personalizada paths but remain commented out

</specifics>

<deferred>
## Deferred Ideas

- Enabling member app module — Phase 69
- Subscription gating — Phase 69
- AURA rewards — Phase 69

</deferred>

---

_Phase: 68-personalizadas-frontend-rename_
_Context gathered: 2026-03-18 via PRD Express Path_
