---
phase: 149-nav-por-categor-as-rbac
plan: 06
subsystem: admin-router
tags: [rbac, routing, landing-por-rol, gap-closure]
requires:
  - "landingForRole() + DUENO_ROLES/PAGOS_ROLES (planes 149-01..05)"
provides:
  - "Landing por rol ejecutándose en el flujo real de login y en carga fría de '/'"
  - "landingForRole exportado desde routes.ts"
affects:
  - "el-templo-admin/src/pages/LoginPage.vue"
  - "el-templo-admin/src/router/routes.ts"
  - "el-templo-admin/src/router/index.ts"
tech-stack:
  added: []
  patterns:
    - "Redirect estático de route-record como fallback pre-auth; landing por rol resuelto en beforeEach post-checkAuth"
key-files:
  created: []
  modified:
    - el-templo-admin/src/pages/LoginPage.vue
    - el-templo-admin/src/router/routes.ts
    - el-templo-admin/src/router/index.ts
decisions:
  - "El landing por rol NO se resuelve en el redirect del índice (route-record) porque se evalúa durante el matching, antes de checkAuth (user null → destino incorrecto, WR-01). Se mueve al beforeEach, después de checkAuth, protegido por dest!==to.path para evitar loops."
metrics:
  duration: ~6min
  completed: 2026-07-02
---

# Phase 149 Plan 06: Cierre D-14 — landing por rol en el flujo real Summary

Corrige que el landing por rol nunca corría en el camino principal: el login navega a `/` (ya no `/sessions` hardcodeado) y el destino se resuelve por rol en `beforeEach` después de `checkAuth`, también en carga fría/refresh de `/`.

## What Was Built

**Task 1 — Login navega a '/' + landingForRole evaluado en el guard post-checkAuth** (commit `2d7edcf8`)

- **`LoginPage.vue`**: `handleLogin()` ahora hace `router.push('/')` en vez de `router.push('/sessions')`. El destino post-login lo decide el landing por rol, eliminando el bug de que el owner caía siempre en `/sessions` y el coach no-Fran rebotaba a `/alumnos` en vez de `/pagos` (CR-02).
- **`routes.ts`**: `landingForRole` pasa a `export function` (para consumirla el guard). El índice `/` cambia de `redirect: () => landingForRole()` a un fallback estático `redirect: '/pagos'` — accesible a todo el staff — eliminando la evaluación pre-auth donde `user` es aún `null` (WR-01). Su orden crítico (coach+Fran→/sessions ANTES del bloque dueño) queda intacto.
- **`index.ts`**: importa `landingForRole` desde `./routes` y, dentro de `beforeEach` DESPUÉS de `await authStore.checkAuth()` (user ya cargado) y ANTES del chequeo de `allowedRoles`, cuando la navegación nace en la raíz (`to.path === '/' || to.redirectedFrom?.path === '/'`) calcula `const dest = landingForRole()` y devuelve `dest` sólo si `dest !== to.path` (guard anti-loop). Los bloques `trainingOnly` y `defaultPages` quedan sin tocar.

## Verification

- `vue-tsc --noEmit`: 0 errores nuevos en LoginPage/router/index/routes.
- `eslint` de los 3 archivos: limpio (0 errores).
- Grep de criterios de aceptación (todos ✓):
  - `router.push('/')` presente; `router.push('/sessions')` == 0
  - `export function landingForRole` presente
  - índice usa `redirect: '/pagos'` (string estático)
  - `landingForRole` en index.ts == 2 (import + uso), después de `checkAuth`, protegido por `dest !== to.path`

**UAT visual pendiente** (no bloquea el plan — requiere sesión real por rol): owner→/alumnos, admin→/alumnos, gestion/recepcion→/pagos, coach genérico→/pagos, Fran Scaine→/sessions, y refresh (F5) sobre `/` como owner → /alumnos (confirma fix WR-01).

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- FOUND: el-templo-admin/src/pages/LoginPage.vue (modificado)
- FOUND: el-templo-admin/src/router/routes.ts (modificado)
- FOUND: el-templo-admin/src/router/index.ts (modificado)
- FOUND commit: 2d7edcf8
