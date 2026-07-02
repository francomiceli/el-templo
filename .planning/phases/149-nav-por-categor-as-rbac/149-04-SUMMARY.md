---
phase: 149-nav-por-categor-as-rbac
plan: 04
subsystem: admin-nav
tags: [admin, rbac, nav, router, planes, white-label, dry]
requires:
  - "el-templo-admin/src/config/templo-config.ts (PLANES_READ_ROLES, PAGOS_ROLES, DUENO_ROLES — Plan 03)"
  - "el-templo-admin/src/utils/trainingAccess.ts (canAccessTraining)"
  - "el-templo-admin/src/stores/useAuthStore.ts (user.role/email)"
provides:
  - "Landing por rol en '/' (D-14): empleado→/pagos, dueño→/alumnos, Fran→/sessions"
  - "/planes y /pagos abiertos al empleado (lectura); /programas dueño-only en el router guard (D-15)"
  - "PlanesPage.vue en modo lectura para el empleado (canEditPlans)"
  - "Ruta/página/composable de Configuración de Caja eliminados (D-13)"
affects:
  - "el-templo-admin/src/router/routes.ts"
  - "el-templo-admin/src/router/index.ts"
  - "el-templo-admin/src/pages/PlanesPage.vue"
tech-stack:
  added: []
  patterns:
    - "Landing por rol como función redirect que lee useAuthStore (orden crítico: Fran antes que dueño — Pitfall 2)"
    - "meta.allowedRoles derivado de los role sets de templo-config (una sola fuente de verdad, espeja la API)"
    - "Gating de UI (canEditPlans) separado de isOwner: dueño = admin + owner (D-01)"
key-files:
  created: []
  modified:
    - "el-templo-admin/src/router/routes.ts"
    - "el-templo-admin/src/router/index.ts"
    - "el-templo-admin/src/pages/PlanesPage.vue"
  deleted:
    - "el-templo-admin/src/pages/ConfiguracionCajaPage.vue"
    - "el-templo-admin/src/composables/useFinanceConfigApi.ts"
decisions:
  - "Landing por rol vía función redirect en '/' que resuelve Fran (coach+canAccessTraining) ANTES del bloque dueño para no mandar al owner a /sessions (D-14, Pitfall 2)"
  - "/planes y /pagos usan PLANES_READ_ROLES / PAGOS_ROLES de templo-config; /programas usa DUENO_ROLES (dueño-only, D-15) — sin roles hardcodeados inline"
  - "canEditPlans (owner+admin) NUEVO, no reusa isOwner (que excluiría a admin) — isOwner queda sólo para el selector de país (D-01/D-09/D-10)"
  - "Configuración de Caja borrada del frontend (ruta+página+composable) — el API ya no expone los endpoints (Plan 02, D-13)"
requirements: [NAV-01, NAV-02, NAV-03, NAV-04]
metrics:
  duration: ~8min
  completed: 2026-07-02
---

# Phase 149 Plan 04: Landing por rol + RBAC de ruteo + Planes en lectura Summary

Cierra la reforma de nav del lado del ruteo y de la lectura de Planes: landing por rol en `/` (D-14), ampliación de `/planes` y `/pagos` al empleado, `/programas` angostado a dueño-only en el router guard (D-15), controles de escritura de Planes ocultos para el empleado (D-09/D-10), y borrado de la ruta/página/composable de Configuración de Caja (D-13) — cerrando la consistencia frontend↔API que arrancó en los Planes 01-03.

## Qué se construyó

**Task 1 — `routes.ts` + `index.ts` + borrado de config-caja (commit `f6128b98`):**

- `routes.ts`: nueva función `landingForRole()` que lee `useAuthStore` y resuelve el destino en el orden crítico de <landing_order> (coach+`canAccessTraining`→/sessions para Fran; owner/admin→/alumnos; resto→/pagos). Reemplaza el `redirect: '/sessions'` estático de la ruta raíz por `redirect: () => landingForRole()`.
- `/planes` ampliado a `PLANES_READ_ROLES` (todo el staff, lectura) y `/pagos` a `PAGOS_ROLES` (incluye recepcion) — importados de `templo-config` (DRY, espeja la API).
- `/programas` angostado de `['gestion','admin','owner']` a `DUENO_ROLES` (`['admin','owner']`, D-15): cierra el lado router de la puerta trasera de Programas (nav ya cubierto en Plan 03, API en Plan 01).
- `index.ts`: `defaultPages` alineado a D-14 (owner/admin→/alumnos, coach/gestion/recepcion→/pagos, fallback `/pagos`). El bloque `trainingOnly` (bounce a /alumnos) se conservó intacto.
- Borrados `ConfiguracionCajaPage.vue` y `useFinanceConfigApi.ts` (único consumidor era esa página) + la ruta `configuracion-caja`. Grep final: cero referencias a `configuracion-caja` / `ConfiguracionCajaPage` / `useFinanceConfigApi` en `src/`.

**Task 2 — `PlanesPage.vue` en modo lectura (commit `7a2de0a5`):**

- Computed NUEVO `canEditPlans = computed(() => ['owner','admin'].includes(authStore.user?.role ?? ''))`. NO reusa `isOwner` (que excluiría a admin, dueño — D-01); `isOwner` se conserva sólo para el selector de país.
- `v-if="canEditPlans"` en: botón "Nuevo Plan", editar/desactivar de ambas tablas (Presenciales + Online), botón "Nueva Promo" y desactivar promo. El listado de planes y el tab de Promos quedan VISIBLES en lectura (precios + inclusiones). En la columna Acciones, el empleado ve `—` en lugar de botones.

## Verificación

- `pnpm run build` (admin) compila sin errores en ambas tareas (el único warning del build es pre-existente, fuera de scope; `eslint src/pages/PlanesPage.vue` → 0 problemas).
- Greps de aceptación: `routes.ts` importa `PLANES_READ_ROLES`/`PAGOS_ROLES`/`DUENO_ROLES`; `/pagos` incluye recepcion vía `PAGOS_ROLES`; `/programas` ya no incluye `gestion`; la ruta raíz usa `redirect:` función; cero referencias a config-caja en `src/`; `defaultPages` → coach/gestion/recepcion `/pagos`, owner/admin `/alumnos`; `ConfiguracionCajaPage.vue` y `useFinanceConfigApi.ts` borrados. En `PlanesPage.vue`: `canEditPlans` == 10 (≥6), `isOwner` conservado (país).
- **UAT visual pendiente (frontend sin test runner):** (1) login owner→/alumnos, admin→/alumnos, gestion/recepcion→/pagos, coach genérico→/pagos, Fran Scaine→/sessions. (2) Empleado en /planes: planes+promos con precios/inclusiones, SIN botones de crear/editar/archivar. (3) Admin en /planes: todos los controles. (4) gestion navega a mano a /programas → rebote. (5) /configuracion-caja ya no existe. Ver `<verification>` del plan.
- **UAT / paso manual D-05:** antes de shippear, verificar (pedir OK; nunca SSH autónomo) los usuarios reales con rol gestion/recepcion en prod. Impacto esperado nulo para El Templo.

## Deviations from Plan

None - plan executed exactly as written. (El plan sugería `DUENO_ROLES` si estaba exportado en `templo-config`; lo estaba —Plan 03—, así que se usó sin necesidad del literal fallback ni el TODO D-06.) Prettier del pre-commit hook reformateó archivos sin cambios de comportamiento.

## Self-Check: PASSED

- FOUND: el-templo-admin/src/router/routes.ts (modificado)
- FOUND: el-templo-admin/src/router/index.ts (modificado)
- FOUND: el-templo-admin/src/pages/PlanesPage.vue (modificado)
- DELETED (confirmado): el-templo-admin/src/pages/ConfiguracionCajaPage.vue, el-templo-admin/src/composables/useFinanceConfigApi.ts
- FOUND commit f6128b98 (Task 1)
- FOUND commit 7a2de0a5 (Task 2)
