---
phase: 149-nav-por-categor-as-rbac
plan: 03
subsystem: admin-nav
tags: [admin, rbac, nav, drawer, white-label, dry]
requires:
  - "el-templo-admin/src/types/admin.ts (AdminRole, AdminUser)"
  - "el-templo-admin/src/utils/trainingAccess.ts (canAccessTraining)"
provides:
  - "el-templo-admin/src/config/templo-config.ts (NAV_MODEL + role sets + visibility helpers + TEMPLO_ENABLED flag)"
  - "Drawer del admin agrupado en 6 categorías, derivado de una única fuente de verdad"
affects:
  - "el-templo-admin/src/layouts/AdminLayout.vue"
tech-stack:
  added: []
  patterns:
    - "Nav declarativo (categorías→items→roles) con helpers puros de visibilidad"
    - "Regla de dirección de imports: config (plantilla) importa del core, nunca al revés (D-06)"
    - "Flag central TEMPLO_ENABLED como semilla de la config por-tenant futura"
key-files:
  created:
    - "el-templo-admin/src/config/templo-config.ts"
  modified:
    - "el-templo-admin/src/layouts/AdminLayout.vue"
decisions:
  - "Nav-model declarativo único; el drawer se deriva de él (elimina los 7 computed ad-hoc que duplicaban allowedRoles)"
  - "Programas dueño-only en el nav (roles: DUENO_ROLES, D-15), consistente con router (Plan 04) y API (Plan 01)"
  - "Header de categoría visible sólo si ≥1 item visible para el rol (Pitfall 4 / T-149-07)"
  - "Item de Configuración de Caja eliminado del drawer (D-13)"
metrics:
  duration: ~4min
  completed: 2026-07-02
---

# Phase 149 Plan 03: Nav-model declarativo + drawer por categorías Summary

Modelo de navegación declarativo único (`templo-config.ts`) como fuente de verdad de la visibilidad del drawer del admin, con el `AdminLayout.vue` refactorizado para derivarse de él — agrupado en Finanzas / Alumnos / Horarios / Planes + Configuración + Templo, eliminando los 7 computed ad-hoc que duplicaban los `allowedRoles`.

## Qué se construyó

**Task 1 — `el-templo-admin/src/config/templo-config.ts` (nuevo):**

- `TEMPLO_ENABLED = true`: gate central de las features Templo (Entrenamiento, Campañas, Profes, landing). Semilla de la config por-tenant futura (D-06).
- Sets de rol `AdminRole[]` que espejan `el-templo-api/src/modules/shared/permissions.ts` con JSDoc que cita cada set del backend: `DUENO_ROLES` (admin+owner, espeja ADMIN_ROLES/PROGRAMAS_ROLES), `ALL_STAFF_ROLES`, `PAGOS_ROLES` (todo staff incl. recepcion, espeja FINANCE_LOAD_ROLES), `DEUDAS_ROLES` (espeja COACH_DEBTS_ROLES), `REPORTES_ROLES` (espeja CAJA_ROLES), `PLANES_READ_ROLES` (todo staff), `CAJA_SALDOS_ROLES` (dueño-only), `ANALITICAS_ROLES` (dueño-only).
- Interfaces `NavItem` (path/label/icon/roles?/trainingOnly?/templo?/badge?) y `NavCategory` (header/items/templo?).
- `NAV_MODEL: NavCategory[]` con las 6 categorías. Programas lleva `roles: DUENO_ROLES` (dueño-only, D-15); la categoría Templo lleva `templo: true` y sus 4 items de Entrenamiento `trainingOnly: true` (Sesiones con `badge: 'pending'`). Sin `/configuracion-caja` (D-13).
- Helpers puros `isNavItemVisible` (trainingOnly→canAccessTraining; resto→roles.includes; templo→requiere TEMPLO_ENABLED) e `isNavCategoryVisible` (templo requiere TEMPLO_ENABLED; header visible sólo si ≥1 item visible — Pitfall 4 / T-149-07).

**Task 2 — `el-templo-admin/src/layouts/AdminLayout.vue` (refactor):**

- El `<q-list>` del drawer itera `visibleCategories` (NAV_MODEL filtrado por `isNavCategoryVisible`) renderizando un `q-item-label header` por categoría (con `q-separator` salvo la primera) y sus items filtrados por `isNavItemVisible`.
- Patrón visual D-12 preservado (headers + items planos, sin expansión). Badge de Sesiones (`adminStore.pendingCount`) y banner de sesiones bajas intactos; `canSeeTraining` conservado sólo para los fetch/banner de training.
- Eliminados los 7 computed ad-hoc (`isAdminRole`, `isCajaRole`, `isCoachDebtsRole`, `isOwnerRole`, `isPagosVisible`, `isCajaSaldosRole`) y el item `/configuracion-caja`. Neto: −283 / +125 líneas (rewrite 72%).

## Verificación

- `pnpm run build` (admin) compila sin errores de tipos en ambas tareas.
- `pnpm run lint` sin errores nuevos en los archivos tocados (los warnings restantes son pre-existentes en `BandejaPendientesTab.vue`, `session-pdf-builder.ts`, `env.d.ts` — fuera de scope).
- Greps de aceptación: en `templo-config.ts` `configuracion-caja`==0, 6 categorías, 4 items `trainingOnly`, todos los exports requeridos; en `AdminLayout.vue` los 7 computed==0, `configuracion-caja`==0, referencias a NAV_MODEL/helpers==8, `adminStore.pendingCount`==2.
- **UAT visual pendiente (frontend sin test runner):** loguearse con owner/admin/gestion/coach/recepcion y confirmar las 6 categorías para dueño, empleado ve Finanzas→Pagos + Alumnos/Horarios/Planes, Caja/Analíticas/Programas ocultas para empleado, sección Templo al final con Entrenamiento sólo para owner/Fran, y ningún item de Configuración de Caja. Ver `<verification>` del plan.

## Nota sobre el grep `header:`

El criterio de aceptación `grep -c "header:" == 6` da 7 en el archivo real: las 6 categorías de `NAV_MODEL` (`header: '...'`) más la línea de la propiedad `header: string;` en la interfaz `NavCategory`. Las 6 categorías son las correctas (`grep -cE "header: '"` == 6); el 7º match es la declaración de tipo, esperado e inofensivo.

## Deviations from Plan

None - plan executed exactly as written. (Prettier del pre-commit hook reformateó los archivos, sin cambios de comportamiento.)

## Self-Check: PASSED

- FOUND: el-templo-admin/src/config/templo-config.ts
- FOUND: el-templo-admin/src/layouts/AdminLayout.vue (modificado)
- FOUND commit 871f324b (Task 1)
- FOUND commit 9427ab9f (Task 2)
