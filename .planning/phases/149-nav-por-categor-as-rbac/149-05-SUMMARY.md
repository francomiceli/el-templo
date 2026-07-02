---
phase: 149-nav-por-categor-as-rbac
plan: 05
subsystem: rbac-programs
tags: [rbac, programs, planes, permissions, gap-closure]
requires:
  - "Plan 01 (PROGRAMAS_ROLES dueño-only + PLANES read/write split)"
provides:
  - "PROGRAMAS_LIST_ROLES — catálogo de programas legible por staff administrativo (sin coach, D-10)"
  - "GET /admin/programs (list) reabierto a owner/admin/gestion/recepcion"
  - "PlanesPage loadPrograms gateado por rol (coach no fetchea, sin spam a Sentry)"
affects:
  - "el-templo-admin PlanesPage columna Programa"
  - "AssignProgramAddonDialog (consumidor del mismo GET, ya consistente vía FINANCE_WRITE_ROLES)"
tech-stack:
  added: []
  patterns:
    - "Separación lectura/escritura por-set espejando PLANES_WRITE_ROLES/PLANES_READ_ROLES"
    - "Gate de fetch frontend por rol para evitar 403 + evento de Sentry"
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/shared/permissions.ts
    - el-templo-api/src/modules/programs/routes.ts
    - el-templo-api/test/programs.test.ts
    - el-templo-api/test/rbac-sets.test.ts
    - el-templo-admin/src/pages/PlanesPage.vue
decisions:
  - "PROGRAMAS_LIST_ROLES declarado como literal (no referencia a FINANCE_WRITE_ROLES) por temporal dead zone: FINANCE_WRITE_ROLES se declara más abajo en el archivo; equivalencia de valor fijada en rbac-sets.test.ts"
  - "Coach EXCLUIDO del catálogo de programas (D-10): Programas no es superficie del profe y coach tampoco asigna add-ons"
  - "Columna Programa degrada a '—' para coach sin ocultar la columna (no se toca el layout de la tabla por un solo rol)"
  - "catch de loadPrograms usa log.warn (no reporta a Sentry) — la columna es decoración no crítica"
metrics:
  duration: ~7min
  completed: 2026-07-02
requirements: [NAV-03]
---

# Phase 149 Plan 05: Cierre de brecha NAV-03 — GET /admin/programs legible por staff administrativo Summary

Reabre `GET /admin/programs` (list) al staff administrativo vía el nuevo `PROGRAMAS_LIST_ROLES` (owner/admin/gestion/recepcion, sin coach — D-10), cerrando la brecha que dejó el angostamiento dueño-only del Plan 01: la columna "Programa" de `/planes` y el diálogo "Asignar programa adicional" volvían a funcionar para gestion/recepcion, y `PlanesPage.loadPrograms()` queda gateado por rol para que coach no dispare el 403 ni el evento de Sentry.

## What Was Built

### Task 1 — Separación lectura/escritura en programs (PROGRAMAS_LIST_ROLES sin coach)

- **`permissions.ts`:** nuevo export `PROGRAMAS_LIST_ROLES = ["owner","admin","gestion","recepcion"] as const` inmediatamente después de `PROGRAMAS_ROLES`, con JSDoc que documenta: espeja en forma el par `PLANES_WRITE_ROLES`/`PLANES_READ_ROLES` y en valor a `FINANCE_WRITE_ROLES`; coach excluido per D-10; la escritura/detalle/analytics sigue dueño-only vía `PROGRAMAS_ROLES` (D-15).
- **`programs/routes.ts`:** `PROGRAMAS_LIST_ROLES` agregado al import; el guard del handler `GET /admin/programs` (list) pasa de `PROGRAMAS_ROLES` a `PROGRAMAS_LIST_ROLES`. Los otros 6 guards (`create`, `analytics`, `detail`, `put`, `content`, `deactivate`) intactos en `PROGRAMAS_ROLES`. Comentarios de cabecera (L7 y bloque admin) actualizados para reflejar list = staff administrativo / resto dueño-only.
- **`programs.test.ts`:** el GET `/api/admin/programs` sale del loop de 403 de gestion; se agregan dos casos: gestion → 200 (con body `programs` array) y coach → 403 (D-10, creando un usuario coach con `createStaffUser`/`getAuthToken`).
- **`rbac-sets.test.ts`:** caso nuevo que afirma `PROGRAMAS_LIST_ROLES` deep-equal a `["owner","admin","gestion","recepcion"]` y que NO contiene `coach`.

### Task 2 — loadPrograms() gateado por rol en PlanesPage

- **`PlanesPage.vue`:** nuevo computed `canViewPrograms` (owner/admin/gestion/recepcion, sin coach — espeja `PROGRAMAS_LIST_ROLES`). `loadPrograms()` hace early-return si `!canViewPrograms.value` (coach no fetchea → columna degrada a "—" sin request/403/Sentry). El `catch` pasa de `log.error` a `log.warn` (no reporta a Sentry; la columna es decoración no crítica). `loadPlans`/`loadPromos` sin cambios.

## Deviations from Plan

None — el plan se ejecutó exactamente como fue escrito. El uso del literal en vez de la referencia `FINANCE_WRITE_ROLES` estaba explícitamente sancionado por el plan para el caso de orden de declaración (temporal dead zone), que efectivamente aplica acá (FINANCE_WRITE_ROLES se declara en L192, después de PROGRAMAS_ROLES en L186).

## Verification

- **API tsc:** `pnpm exec tsc --noEmit` → verde.
- **`programs.test.ts`:** 19/19 verde, incluidos los dos casos nuevos (gestion 200 en list, coach 403 en list) y el loop de 403 de gestion sobre los 6 handlers restantes.
- **`rbac-sets.test.ts`:** 7/7 verde (deep-equal de PROGRAMAS_LIST_ROLES + no-contiene coach).
- **Admin vue-tsc:** 0 errores de PlanesPage.
- **Admin eslint:** `src/pages/PlanesPage.vue` → 0 errores.
- **Grep:** `PROGRAMAS_LIST_ROLES as readonly` == 1 en routes.ts; `PROGRAMAS_ROLES as readonly` == 6; `canViewPrograms` count == 2 sin 'coach'; `log.warn` presente en loadPrograms; `loadPlans` sigue con `log.error`.

## UAT Visual Pendiente (no bloquea el plan)

1. Como gestion/recepcion, `/planes`: columna "Programa" muestra el programa vinculado real.
2. Como coach, `/planes`: columna "—" y sin request a /admin/programs (Network) ni evento en Sentry.
3. Como gestion, tab Programas de un alumno → "Asignar programa adicional": el select carga opciones.
4. Confirmar en Sentry que dejó de llegar "Error loading programs" en visitas de empleado.

## Commits

- `2df2b46a` — feat(149-05): separar lectura/escritura en programs — PROGRAMAS_LIST_ROLES sin coach (D-10)
- `bc31a8d4` — feat(149-05): PlanesPage loadPrograms gateado por rol (coach no fetchea) + warn en vez de error

## Self-Check: PASSED

Todos los archivos creados/modificados existen; ambos commits (2df2b46a, bc31a8d4) presentes en el historial.
