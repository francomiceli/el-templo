# Requirements: El Templo v4.2 — Clases Personalizadas Launch

**Defined:** 2026-03-18
**Core Value:** The "Journeys" feature — architecturally complete but disabled — ships to production as "Clases Personalizadas" with full rename, subscription gating, AURA rewards, and member app activation.

## v4.2 Requirements

### Backend Rename

- [x] **PERS-01**: Database table `member_journeys` renamed to `member_personalizadas` via migration
- [x] **PERS-02**: Column `journey_type` renamed to `personalizada_type` in `member_personalizadas`, `sessions`, and `completed_sessions` tables
- [x] **PERS-03**: Existing `J-` dayId prefixes in session records updated to `P-` via migration
- [x] **PERS-04**: API module folder `src/modules/journeys/` renamed to `src/modules/personalizadas/` with all types, constants, and service names updated
- [x] **PERS-05**: Route paths changed from `/journeys/*` and `/admin/journeys/*` to `/personalizadas/*` and `/admin/personalizadas/*`
- [x] **PERS-06**: Pipeline file `journey-pipeline.ts` renamed to `personalizada-pipeline.ts` with all cross-references updated
- [x] **PERS-07**: All API tests renamed and updated (`test/journeys/` → `test/personalizadas/`)

### Frontend Rename

- [ ] **PERS-08**: Admin types, composables, and page references renamed from journey to personalizada
- [ ] **PERS-09**: Member app module folder `src/modules/journey/` renamed to `src/modules/personalizada/` with all stores, composables, pages, and components updated
- [ ] **PERS-10**: All UI text updated from "Journey" to "Clase Personalizada" / "Personalizadas" in Spanish
- [ ] **PERS-11**: Route paths updated from `/journey/*` to `/personalizada/*` in member app
- [ ] **PERS-12**: Zero remaining references to "journey" or "Journey" in any `src/` directory across all apps

### Subscription & Launch

- [ ] **PERS-13**: `subscription_plans` table has `isPersonalizada` boolean flag; plans with this flag gate access to personalizadas
- [ ] **PERS-14**: PersonalizadasService enforces active subscription check (plan.isPersonalizada = true) before getSession, select, and complete — returns 403 if missing
- [ ] **PERS-15**: Admin can toggle "Personalizada" flag on plan creation/edit (PlanesPage)
- [ ] **PERS-16**: Completing a personalizada session awards 10 AURA points via AuraService
- [ ] **PERS-17**: Member app personalizada module enabled in `boot/modules.ts` (uncommented imports and registration)
