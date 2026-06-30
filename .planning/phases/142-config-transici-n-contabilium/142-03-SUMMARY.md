---
phase: 142
plan: 03
subsystem: finance
tags: [config, ui, admin, rbac, finance, quasar]
requires:
  - "GET/PUT /api/admin/finance/config/overdue-threshold (plan 142-01, owner/admin)"
  - "useFinanceLoadApi composable pattern (cleanup(), no onUnmounted)"
  - "isAdminRole gate + meta.allowedRoles route guard (AdminLayout/routes.ts)"
provides:
  - "useFinanceConfigApi: getThreshold/setThreshold + loading/saving/error + cleanup()"
  - "ConfiguracionCajaPage.vue: single-field 'umbral de pendientes' config form (142-UI-SPEC)"
  - "/configuracion-caja route (owner/admin) + Administracion nav item"
affects:
  - "el-templo-admin/src/router/routes.ts (new route)"
  - "el-templo-admin/src/layouts/AdminLayout.vue (new nav item)"
tech-stack:
  added: []
  patterns:
    - "use*Api composable: loading/saving/error refs, full /admin/finance path, cleanup() not onUnmounted"
    - "single-field Quasar config form (q-card flat bordered + q-form @submit.prevent + :rules)"
    - "owner/admin route+nav gating (meta.allowedRoles + isAdminRole) as defense-in-depth over backend ADMIN_ROLES"
key-files:
  created:
    - "el-templo-admin/src/composables/useFinanceConfigApi.ts"
    - "el-templo-admin/src/pages/ConfiguracionCajaPage.vue"
  modified:
    - "el-templo-admin/src/router/routes.ts"
    - "el-templo-admin/src/layouts/AdminLayout.vue"
decisions:
  - "Logger error payload wrapped as { error: message } — createLogger's error() takes LogData (a record), not a raw unknown; passing the bare caught error fails tsc."
  - "Nav placed under the existing Administracion section header (142-UI-SPEC A1) rather than next to Caja — that section already groups owner/admin-only screens and matches the isAdminRole gate."
  - "Full path /admin/finance/config/overdue-threshold for GET and PUT (admin axios baseURL includes /api; finance plugin prefix /admin/finance) — a bare /finance/... would 404."
metrics:
  duration: ~12min
  completed: "2026-06-25"
  tasks: 2
  files: 4
---

# Phase 142 Plan 03: Configuración de Caja UI (MIG-01 frontend) Summary

Owner/admin "Configuración de Caja" admin page: a single numeric field (umbral de pendientes, días, min 1) that loads the current threshold via GET on mount and persists it via PUT on save, wired to the plan-01 backend through a `cleanup()`-based composable — honoring 142-UI-SPEC (single field, warm palette, no blue) and CLAUDE.md frontend conventions.

## What Was Built

- **`useFinanceConfigApi`** (`useFinanceConfigApi.ts`): mirrors `useFinanceLoadApi`/`useTransactionsApi` — `loading` + `saving` + `error` refs, `api` from `boot/axios`, `extractError` for messages, `createLogger('useFinanceConfigApi')` for error logging (never `console.*`), a typed `OverdueThresholdConfig` interface (NO `any`), and a `cleanup()` that resets state. `getThreshold(): Promise<number>` (GET) and `setThreshold(days): Promise<void>` (PUT `{ thresholdDays }`) both hit the FULL path `/admin/finance/config/overdue-threshold`. NO `onUnmounted` inside the composable — the page owns the lifecycle.
- **`ConfiguracionCajaPage.vue`** (142-UI-SPEC): `q-page q-pa-md` (cream bg) + `text-h5` "Configuración de Caja" header, then a width-capped (`max-width: 480px`) `q-card flat bordered` holding a `q-form @submit.prevent`. One control: `q-input v-model.number type="number" min="1"` labelled "Umbral de pendientes (días)", outlined dense, `:loading` while reading, persistent hint, `:rules` for required (`Ingresá un valor.`) + integer-min-1 (`Debe ser un número entero mayor o igual a 1.`). `Guardar` `q-btn type="submit" color="primary" :loading="saving" :disable="loading"`. On mount `getThreshold()` populates the field; on submit `setThreshold()` then `$q.notify` positive `Configuración guardada` / negative `No se pudo guardar. Reintentá.`. Page calls `cleanup()` from its own `onUnmounted`. Warm palette only (terracotta primary, $positive/$negative) — no blue. No invented fields/sections/reset/upper-bound.
- **Route** (`routes.ts`): `path: 'configuracion-caja'`, lazy `ConfiguracionCajaPage.vue`, `meta.allowedRoles: ['admin','owner']` — D-06; excludes gestion/recepcion/coach.
- **Nav** (`AdminLayout.vue`): `q-item` "Configuración de Caja" (icon `settings`, `to="/configuracion-caja"`) under the `isAdminRole`-gated **Administracion** section.

## Task Commits

| Task | Name                                        | Commit   | Key files                                         |
| ---- | ------------------------------------------- | -------- | ------------------------------------------------- |
| 1    | useFinanceConfigApi + ConfiguracionCajaPage | 14b4dedc | useFinanceConfigApi.ts, ConfiguracionCajaPage.vue |
| 2    | Route + nav entry (owner/admin gated)       | 0543d44e | routes.ts, AdminLayout.vue                        |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Logger error payload shape**

- **Found during:** Task 1
- **Issue:** The plan/template implied `log.error('msg', err)`, but `createLogger`'s `error(msg, data?: LogData)` takes a `Record<string, unknown>`, not a raw `unknown`. Passing the bare caught error fails `tsc` (TS2345).
- **Fix:** Wrapped the payload — `{ error: error.value }` in the composable and `{ error: err instanceof Error ? err.message : String(err) }` in the page.
- **Files modified:** `useFinanceConfigApi.ts`, `ConfiguracionCajaPage.vue`
- **Commit:** 14b4dedc

### Scope notes (not deviations)

- Pre-existing `tsc` errors in unmodified files (`src/boot/__tests__/axios-refresh-lock.test.ts` — missing `vitest` types; `src/utils/pdf/session-pdf-builder.ts` — `@types/pdfmake` mismatch) are out of scope (not caused by this plan's changes) and were left untouched. My four files produce zero `tsc` errors.

## Verification

- `npx tsc --noEmit` in `el-templo-admin`: zero errors in the four files of this plan (`useFinanceConfigApi.ts`, `ConfiguracionCajaPage.vue`, `routes.ts`, `AdminLayout.vue`). Pre-existing unrelated errors documented above as out of scope.
- Composable uses the FULL path `/admin/finance/config/overdue-threshold` for GET and PUT; exposes `cleanup()`; no `onUnmounted` inside; no `any`; `createLogger` not `console.*`.
- Single-field page per 142-UI-SPEC; loads on mount, saves via PUT with positive/negative notify; integer-min-1 validation blocks submit; warm palette (no blue); page calls `cleanup()` on unmount.
- Route + nav gated owner/admin (`meta.allowedRoles ['admin','owner']` + `isAdminRole`); gestion/recepcion/coach excluded (defense-in-depth over the backend ADMIN_ROLES gate, plan 01).
- Manual UAT by Franco (no admin unit-test harness in scope).

## Known Stubs

None.

## Threat Flags

None — all new surface (the config route + nav, the threshold input) is in the plan's `<threat_model>` (T-142-07 elevation, T-142-08 tampering), mitigated as specified: client route/nav gating as convenience, the backend per-handler ADMIN_ROLES check + server-side 1..365 re-validation are the authoritative gates.

## Self-Check: PASSED

- Created files exist: `useFinanceConfigApi.ts`, `ConfiguracionCajaPage.vue`.
- Commits exist: 14b4dedc (Task 1), 0543d44e (Task 2).
