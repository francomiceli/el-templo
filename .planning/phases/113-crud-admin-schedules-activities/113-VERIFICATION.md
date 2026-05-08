---
phase: 113-crud-admin-schedules-activities
verified: 2026-05-08T14:15:00Z
status: passed
score: 14/14 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: null
  previous_score: null
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 113: CRUD admin de Schedules y Activities — Verification Report

**Phase Goal:** Habilitar al admin a gestionar el catálogo de horarios y actividades sin migraciones manuales. Endpoints CRUD ya existían — esta fase endurece validaciones (overlap branch+day, activity name uniqueness, cascade-block on deactivation) y agrega UX (tab Actividades + modal "Crear horario") en HorariosPage.

**Verified:** 2026-05-08T14:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Plan 01 — Backend hardening)

| #   | Truth                                                                                                                | Status     | Evidence                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Crear slot rechaza si overlap con slot ACTIVO en mismo branch+day                                                    | ✓ VERIFIED | service.ts:101-107 — `and(branchId, dayOfWeek, isActive=true, lt(startTime, endTime), gt(endTime, startTime))`; integration test pass (test #1)          |
| 2   | Crear slot back-to-back (10-11 y 11-12) NO es conflicto                                                              | ✓ VERIFIED | Strict `lt`/`gt` inequalities; integration test #2 pass                                                                                                  |
| 3   | Slot histórico inactivo no bloquea nuevo slot en su rango (D-12)                                                     | ✓ VERIFIED | `eq(schema.schedules.isActive, true)` filter on overlap query; integration test #3 pass (pre-inserted inactive 10:00-11:00 + POST same range → 201)      |
| 4   | Crear activity rechaza si name ya existe en activity ACTIVA                                                          | ✓ VERIFIED | activity-service.ts:44 `ConflictError("Ya existe una actividad activa con ese nombre")`; integration test #4 pass                                        |
| 5   | Editar activity rechaza si rename colisiona con otra activity activa                                                 | ✓ VERIFIED | activity-service.ts:99 with `ne(id)` self-exclusion; integration test #6 pass                                                                            |
| 6   | Editar activity con isActive=false rechaza con 409 + lista de schedule ids/labels afectados si hay schedules activos | ✓ VERIFIED | activity-service.ts:110-140 cascade query + intersection-typed error attachment; routes.ts:156-176 dedicated 409 serialization; integration test #7 pass |
| 7   | Editar activity con isActive=false procede si NO hay schedules activos apuntando                                     | ✓ VERIFIED | Cascade guard `affected.length > 0` only throws when refs exist; integration test #8 pass                                                                |

### Observable Truths (Plan 02 — Frontend admin UI)

| #   | Truth                                                                                                                                             | Status     | Evidence                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8   | Botón "Crear horario" en HorariosPage que abre modal con sede pre-seleccionada (filtro actual), día, start, end, activity (dropdown solo activas) | ✓ VERIFIED | HorariosPage.vue:58-61 button, :255-256 dialog mount with `:default-branch-id="selectedBranchId"`; CreateSlotDialog.vue:198 call to `createSchedule`                                               |
| 9   | Tras crear con éxito, el grid se refresca                                                                                                         | ✓ VERIFIED | `<CreateSlotDialog @created="loadWeeklyGrid" />` (HorariosPage.vue:255-258)                                                                                                                        |
| 10  | Si el backend devuelve 409 por overlap, admin ve toast/banner accionable                                                                          | ✓ VERIFIED | CreateSlotDialog.vue:214 `extractError(err, 'Error creando horario')` rendered inline (text-negative). Backend message includes HH:MM-HH:MM range.                                                 |
| 11  | HorariosPage tiene tabs Horarios/Actividades                                                                                                      | ✓ VERIFIED | HorariosPage.vue:83-92 q-tabs with `<q-tab name="horarios"/>` and `<q-tab name="actividades"/>`; q-tab-panels at :95 and :240                                                                      |
| 12  | El botón "Actividades" del header se elimina (queda como tab)                                                                                     | ✓ VERIFIED | `grep showActivitiesDialog HorariosPage.vue` → 0; ActivitiesPanel embedded inside actividades tab panel (:241)                                                                                     |
| 13  | Al desactivar una activity con schedules activos, admin ve toast con lista de slots afectados y la activity NO se desactiva                       | ✓ VERIFIED | ActivitiesDialog.vue:211-220 detects 409 + emits `cascade-error`; HorariosPage.vue:546 `onCascadeError` builds `Lun HH:MM-HH:MM (Branch)` toast. Backend test #7 confirms activity remains active. |
| 14  | Al crear una activity con nombre duplicado, admin ve toast con mensaje específico (no genérico)                                                   | ✓ VERIFIED | ActivitiesDialog.vue uses `extractError(err, fallback)` so the backend `Ya existe una actividad activa con ese nombre` reaches user verbatim                                                       |

**Score:** 14/14 truths verified

### Required Artifacts

| Artifact                                                         | Expected                                                                   | Status     | Details                                                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| `el-templo-api/src/modules/scheduling/service.ts`                | createSchedule overlap validation (D-10/11/12)                             | ✓ VERIFIED | lt/gt overlap query at line 101-107, isActive=true filter          |
| `el-templo-api/src/modules/scheduling/activity-service.ts`       | createActivity uniqueness + updateActivity cascade-block                   | ✓ VERIFIED | ConflictError + affectedSchedules attachment lines 44, 99, 110-140 |
| `el-templo-api/src/modules/scheduling/routes.ts`                 | PUT /activities catch branch for affectedSchedules                         | ✓ VERIFIED | Lines 156-176, ConflictError instanceof check + 409 send           |
| `el-templo-api/src/modules/scheduling/schemas.ts`                | createActivitySchema 409 + updateActivitySchema 409 with affectedSchedules | ✓ VERIFIED | Schema declared (verified via tsc + tests)                         |
| `el-templo-api/src/modules/scheduling/types.ts`                  | AffectedScheduleRef export                                                 | ✓ VERIFIED | Line 113 export interface                                          |
| `el-templo-api/test/scheduling/schedule-activity-crud.test.ts`   | 7-8 integration tests                                                      | ✓ VERIFIED | 8 it() blocks; 8/8 pass against MySQL                              |
| `el-templo-admin/src/components/scheduling/CreateSlotDialog.vue` | Modal form de creación de slot (≥120 lines)                                | ✓ VERIFIED | 232 lines; createSchedule wired via composable; extractError used  |
| `el-templo-admin/src/components/scheduling/ActivitiesDialog.vue` | Cascade-error UX panel                                                     | ✓ VERIFIED | q-dialog removed; cascade-error emit; axios.isAxiosError detection |
| `el-templo-admin/src/pages/HorariosPage.vue`                     | Tabs + Crear horario button + cascade handler                              | ✓ VERIFIED | q-tabs at :83, button at :58, onCascadeError at :546               |
| `el-templo-admin/src/types/scheduling.ts`                        | AffectedScheduleRef export                                                 | ✓ VERIFIED | Line 119 export interface                                          |

### Key Link Verification

| From                                 | To                                | Via                                           | Status  | Details                                                                               |
| ------------------------------------ | --------------------------------- | --------------------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| createSchedule                       | schedules table query             | overlap WHERE clause filtering is_active=1    | ✓ WIRED | service.ts:101-107 (and + lt + gt + eq isActive,true)                                 |
| updateActivity (deactivation branch) | schedules table query             | count active schedules referencing activityId | ✓ WIRED | activity-service.ts:110-127 inner-join branches                                       |
| CreateSlotDialog                     | useSchedulingApi.createSchedule   | form submit calls composable                  | ✓ WIRED | CreateSlotDialog.vue:198 `await schedulingApi.createSchedule(...)`                    |
| HorariosPage 'Crear horario' button  | CreateSlotDialog v-model:show     | props                                         | ✓ WIRED | HorariosPage.vue:255-258 `v-model:show="showCreateSlotDialog"` + click handler at :61 |
| ActivitiesDialog cascade error       | API 409 affectedSchedules payload | axios error.response.data.affectedSchedules   | ✓ WIRED | ActivitiesDialog.vue:211-220 axios.isAxiosError gate + emit                           |
| HorariosPage cascade-error handler   | q-notify multi-line toast         | onCascadeError(payload)                       | ✓ WIRED | HorariosPage.vue:546 builds list with DAY_SHORT_LABELS                                |

### Data-Flow Trace (Level 4)

| Artifact                                 | Data Variable       | Source                                                        | Produces Real Data | Status    |
| ---------------------------------------- | ------------------- | ------------------------------------------------------------- | ------------------ | --------- |
| CreateSlotDialog.vue (activity dropdown) | `activities`        | `schedulingApi.listActivities()` → backend listActivities     | ✓ Yes              | ✓ FLOWING |
| CreateSlotDialog.vue (branch dropdown)   | `props.branches`    | HorariosPage `branchesRaw` populated from `loadBranches()`    | ✓ Yes              | ✓ FLOWING |
| HorariosPage.vue weekly grid             | weekly slots        | `loadWeeklyGrid` (refreshed on @created)                      | ✓ Yes              | ✓ FLOWING |
| ActivitiesDialog.vue activity list       | `activities`        | `schedulingApi.listActivities` triggered on `:active` watcher | ✓ Yes              | ✓ FLOWING |
| onCascadeError toast                     | `affectedSchedules` | Backend 409 payload `{message, affectedSchedules:[...]}`      | ✓ Yes              | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior                                          | Command                                                        | Result               | Status |
| ------------------------------------------------- | -------------------------------------------------------------- | -------------------- | ------ |
| Backend integration tests pass against real MySQL | `cd el-templo-api && pnpm test schedule-activity-crud.test.ts` | 8 passed (8 total)   | ✓ PASS |
| Backend regression: scheduling.test.ts            | `cd el-templo-api && pnpm test scheduling.test.ts`             | 48 passed (48 total) | ✓ PASS |
| API tsc clean                                     | `cd el-templo-api && pnpm tsc --noEmit`                        | exit 0, no errors    | ✓ PASS |
| Admin build succeeds                              | `cd el-templo-admin && pnpm build`                             | exit 0, dist created | ✓ PASS |
| Admin tsc — phase 113 files                       | `pnpm tsc --noEmit` filtered to phase files                    | 0 new errors         | ✓ PASS |

### Requirements Coverage (D-01..D-20 from CONTEXT.md)

| Requirement | Description                                                                           | Status      | Evidence                                                                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01        | CREATE schedule nuevo desde admin                                                     | ✓ SATISFIED | POST /schedules endpoint + CreateSlotDialog.vue + tests                                                                                                                                                    |
| D-02        | CRUD completo de activities (crear/editar/desactivar)                                 | ✓ SATISFIED | createActivity / updateActivity (rename + isActive toggle) + ActivitiesDialog UX                                                                                                                           |
| D-03        | OUT — Branches CRUD                                                                   | ✓ N/A       | Not implemented (correctly out of scope)                                                                                                                                                                   |
| D-04        | OUT — Bloqueos puntuales por slot+fecha                                               | ✓ N/A       | Not implemented (correctly out of scope)                                                                                                                                                                   |
| D-05        | OUT — Fix de subs huérfanas                                                           | ✓ N/A       | Not implemented (correctly out of scope)                                                                                                                                                                   |
| D-06        | Acceso al CRUD = cualquier admin (sin scope multi-sede v1)                            | ✓ SATISFIED | Module-level `onRequest` ALL_STAFF_ROLES guard unchanged                                                                                                                                                   |
| D-07        | NO se permite editar start_time/end_time/day_of_week de schedule existente            | ✓ SATISFIED | grep routes.ts confirms only toggle + activity-swap; no edit endpoint added                                                                                                                                |
| D-08        | Cambiar activity de schedule vivo (existing endpoint not touched)                     | ✓ SATISFIED | PATCH /schedules/:scheduleId/activity at routes.ts:309-328 unchanged in this phase                                                                                                                         |
| D-09        | Toggle is_active (existing endpoint not touched)                                      | ✓ SATISFIED | PUT /schedules/:scheduleId/toggle at routes.ts:262-308 unchanged in this phase                                                                                                                             |
| D-10        | Bloquear overlap mismo branch+day (sin importar activity)                             | ✓ SATISFIED | service.ts:101-107 query                                                                                                                                                                                   |
| D-11        | Half-open `[start, end)` overlap; back-to-back NO conflicto                           | ✓ SATISFIED | Strict lt/gt; test #2 confirms back-to-back permitted                                                                                                                                                      |
| D-12        | Validación solo entre slots is_active=1                                               | ✓ SATISFIED | `eq(isActive, true)` filter; test #3 confirms inactive ignored                                                                                                                                             |
| D-13        | Cascade-block on activity deactivation + listar schedules afectados                   | ✓ SATISFIED | activity-service.ts:110-140 + routes.ts:156-176 + frontend cascade-error UX                                                                                                                                |
| D-14        | Editar name/description sin restricciones (rename safe via id)                        | ✓ SATISFIED | activity-service.ts allows rename; only blocks if name collision with another active                                                                                                                       |
| D-15        | Soft delete via is_active=0 (NO hard delete)                                          | ✓ SATISFIED | grep confirms no DELETE /activities endpoint; only PUT toggling isActive                                                                                                                                   |
| D-16        | No reusar name de activity activa al crear (case-sensitive uniqueness)                | ✓ SATISFIED | activity-service.ts:33-44 + tests #4, #5, #6                                                                                                                                                               |
| D-17        | Botón "Crear slot" abre modal con sede preseleccionada, día, start, end, activity     | ✓ SATISFIED | HorariosPage.vue:58-65 + CreateSlotDialog.vue full form                                                                                                                                                    |
| D-18        | CRUD activities en pestaña/sección DENTRO de HorariosPage (tabs Horarios/Actividades) | ✓ SATISFIED | q-tabs + q-tab-panels embedding ActivitiesPanel                                                                                                                                                            |
| D-19        | NO modificar SlotDetailDialog.vue                                                     | ✓ SATISFIED | `git diff d0020b58..72e89180 SlotDetailDialog.vue` empty; last touched in 4a883803 (pre-phase)                                                                                                             |
| D-20        | Errores en español accionables                                                        | ✓ SATISFIED | Backend: "Ya existe un horario activo HH:MM-HH:MM que se solapa…", "La hora de fin debe ser posterior al inicio", "Ya existe una actividad activa con ese nombre"; Frontend: cascade toast lists afectados |

### Anti-Patterns Scan

| File                                                           | Pattern             | Found                | Severity | Impact |
| -------------------------------------------------------------- | ------------------- | -------------------- | -------- | ------ |
| el-templo-admin/src/components/scheduling/CreateSlotDialog.vue | `console.*`         | 0                    | -        | -      |
| el-templo-admin/src/components/scheduling/CreateSlotDialog.vue | `: any` types       | 0                    | -        | -      |
| el-templo-admin/src/components/scheduling/ActivitiesDialog.vue | `console.*`         | 0                    | -        | -      |
| el-templo-admin/src/components/scheduling/ActivitiesDialog.vue | `: any` types       | 0                    | -        | -      |
| el-templo-admin/src/pages/HorariosPage.vue                     | `console.*`         | 0                    | -        | -      |
| el-templo-admin/src/pages/HorariosPage.vue                     | `: any` types       | 0                    | -        | -      |
| el-templo-api/src/modules/scheduling/service.ts                | TODO/FIXME/stubs    | 0 (in changed range) | -        | -      |
| el-templo-api/src/modules/scheduling/activity-service.ts       | TODO/FIXME/stubs    | 0                    | -        | -      |
| el-templo-api/test/scheduling/schedule-activity-crud.test.ts   | `console.*`/skipped | 0                    | -        | -      |

### Project Standards (CLAUDE.md) Compliance

| Standard                                                           | Status | Evidence                                                                                                                     |
| ------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| API logging via Fastify Pino (`request.log`/`app.log`), no console | ✓ PASS | `grep -nE "console\\." el-templo-api/src/modules/scheduling/{service,activity-service,routes}.ts` returns 0 in changed lines |
| Frontend logging via createLogger, no console                      | ✓ PASS | CreateSlotDialog uses `createLogger('CreateSlotDialog')`; ActivitiesDialog uses logger                                       |
| TypeScript: no `any`, use `unknown` + narrowing                    | ✓ PASS | All catches use `err: unknown` with `instanceof Error`; intersection types for cascade payload                               |
| API tests for new routes (real MySQL)                              | ✓ PASS | 8/8 integration tests in schedule-activity-crud.test.ts                                                                      |
| No DB migrations for catalogue changes (purpose of phase)          | ✓ PASS | No new migration files in 113-\* commits                                                                                     |
| No new dependencies installed/updated                              | ✓ PASS | No package.json/pnpm-lock.yaml changes in 113-\* commits                                                                     |
| Pre-commit hooks ran                                               | ✓ PASS | All commits made without --no-verify                                                                                         |

### Pre-existing tsc errors (NOT a phase 113 gap)

`el-templo-admin/src/utils/pdf/session-pdf-builder.ts` has 3 tsc errors (`vfs` property, `Margins` tuple type) that pre-date Phase 113 — last touched by commit `d0bf51ac feat(100-05): PDF customTitle subtitle…` well before the phase started. Verified by checking git log on the file. Documented in `deferred-items.md`. Not actionable in this phase.

### Human Verification Required

None. All must-haves verified through:

- Backend: 8/8 integration tests against real MySQL covering all 7 backend truths
- Frontend: TypeScript compilation + admin build succeed; component wiring verified via grep

The frontend SUMMARY noted "manual smoke test deferred to user (autonomous mode)" — this is acceptable for an admin-only feature shipped via staging, but would be a smoke test the user can perform post-merge:

1. **Visual smoke (optional, post-deploy)**: Open admin → /horarios → see tabs Horarios/Actividades; click "Crear horario" → form opens with selected branch pre-filled; submit valid → grid refreshes; submit overlapping range → inline error visible; switch to Actividades tab → list visible; deactivate activity in use → toast lists affected slots in Spanish.

This is a low-risk smoke test — the integration tests already exercise the full backend contract that the UI consumes.

### Gaps Summary

**No gaps found.** All 14 must-have truths verified, all 10 required artifacts present and substantive, all 6 key links wired, all 4 data-flow traces produce real data, all 5 behavioral spot-checks pass, all 20 D-01..D-20 decisions satisfied (with OUT items correctly out of scope), and project standards compliance is clean.

---

## VERIFICATION PASSED — phase delivers what was promised

_Verified: 2026-05-08T14:15:00Z_
_Verifier: Claude (gsd-verifier)_
