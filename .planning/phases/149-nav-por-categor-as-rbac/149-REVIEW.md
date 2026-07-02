---
phase: 149-nav-por-categor-as-rbac
reviewed: 2026-07-02T21:05:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - el-templo-admin/src/config/templo-config.ts
  - el-templo-admin/src/layouts/AdminLayout.vue
  - el-templo-admin/src/pages/LoginPage.vue
  - el-templo-admin/src/pages/PlanesPage.vue
  - el-templo-admin/src/router/index.ts
  - el-templo-admin/src/router/routes.ts
  - el-templo-api/src/modules/finance/index.ts
  - el-templo-api/src/modules/finance/routes.ts
  - el-templo-api/src/modules/finance/schemas.ts
  - el-templo-api/src/modules/finance/transaction-service.ts
  - el-templo-api/src/modules/finance/types.ts
  - el-templo-api/src/modules/programs/routes.ts
  - el-templo-api/src/modules/shared/permissions.ts
  - el-templo-api/src/modules/subscriptions/routes.ts
  - el-templo-api/test/programs.test.ts
  - el-templo-api/test/rbac-sets.test.ts
  - el-templo-api/test/subscriptions/plans-crud.test.ts
findings:
  critical: 0
  warning: 2
  info: 7
  total: 9
status: issues_found
---

# Phase 149: Code Review Report (RE-REVIEW post gap-closure)

**Reviewed:** 2026-07-02T21:05:00Z
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found (no blockers — the 2 prior BLOCKERs are fixed)

## Summary

Re-revisión adversarial tras el cierre de brechas (planes 149-05/149-06, commits `2df2b46a`, `bc31a8d4`, `2d7edcf8`). Los **dos BLOCKERs de la revisión anterior están corregidos y el fix es sólido** — trazado cross-módulo confirmado, `tsc --noEmit` verde en API y `vue-tsc --noEmit` limpio en los archivos de la fase.

**CR-01 (GET /admin/programs angostado rompía consumidores no-dueño) — RESUELTO.** Se separó lectura de escritura en el módulo programs con `PROGRAMAS_LIST_ROLES` (owner/admin/gestion/recepcion, sin coach) aplicado sólo al `GET /admin/programs`; los demás 6 handlers quedan dueño-only (`PROGRAMAS_ROLES`). El valor espeja a `FINANCE_WRITE_ROLES`, que es exactamente el set que ya permite el `POST` de add-ons — el diálogo `AssignProgramAddonDialog` vuelve a funcionar end-to-end para gestion/recepcion. En `PlanesPage.vue`, `loadPrograms()` ahora se gatea por `canViewPrograms` (mismo set) y no dispara el fetch para coach (evita el 403 + Sentry), y el catch degradó de `log.error` → `log.warn` (no reporta a Sentry). Cobertura nueva: `rbac-sets.test.ts` fija el valor y el `not.toContain('coach')`; `programs.test.ts` fija gestion→200 y coach→403 en el list. Consistente.

**CR-02 (LoginPage hardcodeaba `/sessions`, bypass del landing por rol) — RESUELTO.** `LoginPage.vue` ahora hace `router.push('/')` y delega el destino en `landingForRole()`. El índice `/` usa un fallback estático `redirect: '/pagos'` (accesible a todo el staff) y el landing por rol se re-resuelve en `beforeEach` DESPUÉS de `checkAuth` (con `user` ya cargado) — lo que además cierra el WR-01 previo (carga fría de `'/'`). Tracé el grafo de navegación completo (owner→/alumnos, Fran→/sessions, coach/gestion/recepcion→/pagos, admin→/alumnos) incluyendo hard-refresh y el guard anti-loop `dest !== to.path`: no hay redirect loop y el orden crítico de `landingForRole` (coach+Fran ANTES del bloque dueño) queda intacto.

Lo que queda son ítems no bloqueantes ya señalados en la revisión previa y aún abiertos (limpieza de dato huérfano, deriva DRY nav↔router, comentarios obsoletos, huecos de test), más un dead-end de UI menor. Ninguno impide shippear.

Nota: `vue-tsc` reporta errores pre-existentes en `src/utils/pdf/*` fuera del alcance de esta fase (ningún archivo revisado los toca).

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Fila seed de `system_settings` huérfana — sin migración de limpieza para `finance.pending_overdue_days`

**File:** `el-templo-api/src/db/migrations/0157_seed_finance_overdue_threshold.sql` (seed aplicado); `el-templo-api/src/modules/finance/transaction-service.ts:1369`
**Issue:** La 142 seedeó `system_settings.finance.pending_overdue_days = '3'` (migración 0157, aplicada en staging). La 149 borró el único lector/escritor (`FinanceConfigService` + endpoints GET/PUT `/config/overdue-threshold`) y hardcodeó `const threshold = OVERDUE_DAYS`, pero **no agregó migración que borre la fila**. Queda un dato muerto que aparenta ser autoritativo: si en staging alguien ya seteó un valor ≠ 3 vía el PUT de la 142, ese valor ahora se ignora silenciosamente y el umbral vuelve a 3 sin aviso. Convención del proyecto (MEMORY): los cambios de datos van por migración, no por re-seed. Sin impacto de comportamiento (Opción A ignora la fila), pero deja deuda de datos.
**Fix:** Agregar migración con el siguiente número libre (0163). Recordar la regla del runner: **nunca `;` dentro de comentarios SQL**.

```sql
-- 0163_drop_finance_overdue_threshold_setting.sql
-- Phase 149 D-13 -- la perilla de umbral de pendientes se elimino, limpia el seed de 0157
DELETE FROM `system_settings` WHERE `setting_key` = 'finance.pending_overdue_days';
```

### WR-02: Deriva nav↔router — `routes.ts` sigue hardcodeando role-sets que `templo-config` ya exporta

**File:** `el-templo-admin/src/router/routes.ts:109,124,131,137,142,147` vs `el-templo-admin/src/config/templo-config.ts:39,51,56,68,71`
**Issue:** La fase creó `DEUDAS_ROLES`, `REPORTES_ROLES`, `CAJA_SALDOS_ROLES`, `ANALITICAS_ROLES`, `ALL_STAFF_ROLES` como fuente única para el drawer, y el plan 04 los reutilizó en `meta.allowedRoles`… pero sólo para 3 rutas (`/planes`, `/pagos`, `/programas`). Las rutas `/caja`, `/deudas`, `/reportes`, `/analiticas`, `/alumnos`, `/horarios`, `/campanias` conservan arrays inline duplicados de esos mismos sets. Dos fuentes de verdad para la misma decisión de acceso: una edición futura de un lado desincroniza silenciosamente visibilidad del drawer y acceso de ruta (ítem visible pero ruta rebota, o al revés) — exactamente la clase de bug que la fase se propuso eliminar al borrar los 7 computed ad-hoc de `AdminLayout`. Concretamente hoy ya hay una discrepancia latente: `/deudas` en routes.ts usa el literal `['coach','gestion','admin','owner']` mientras el nav usa `DEUDAS_ROLES` — coinciden por ahora, pero nada lo garantiza.
**Fix:** Reemplazar los arrays inline por los sets exportados (`meta: { allowedRoles: DEUDAS_ROLES }`, etc.). Si preocupa profundizar la dependencia core→config (ver IN-02), mover los role-sets a un módulo core (`src/config/rbac.ts`) del que importen tanto `templo-config.ts` como `routes.ts`.

## Info

### IN-01: Comentario obsoleto en `listPendingTray` — describe el diseño de la 142 que la 149 revirtió

**File:** `el-templo-api/src/modules/finance/transaction-service.ts:1223-1224`
**Issue:** El docblock dice "thresholdDays is echoed back so 142 can swap OVERDUE_DAYS for a finance_settings read without touching the UI". La 142 hizo ese swap y la 149 lo deshizo; el comentario describe una arquitectura que ya no existe y contradice el comentario nuevo de las líneas 1366-1369.
**Fix:** Actualizar a: "thresholdDays se devuelve para que la UI no hardcodee el umbral (hoy la constante OVERDUE_DAYS, D-13)".

### IN-02: El header de `templo-config` afirma "NOTHING in the core imports this config", pero `routes.ts` lo importa

**File:** `el-templo-admin/src/config/templo-config.ts:7-10`; `el-templo-admin/src/router/routes.ts:5`
**Issue:** La regla de dirección de imports documentada (capa tenant; el core no la importa) queda contradicha por el propio código: `router/routes.ts` (core de ruteo) importa `PLANES_READ_ROLES`/`PAGOS_ROLES`/`DUENO_ROLES` desde el config. La contradicción doc-vs-código va a confundir la extracción multi-tenant (fase 156).
**Fix:** Corregir el comentario (aclarar que los role-sets son core reexportado y sólo `NAV_MODEL`/`TEMPLO_ENABLED` son capa Templo), o separar los sets a un módulo core (misma solución que WR-02).

### IN-03: Guards D-11 corren después de la validación de schema — un rol no autorizado con payload inválido recibe 400, no 403

**File:** `el-templo-api/src/modules/subscriptions/routes.ts:160-166` (y los otros 6 handlers)
**Issue:** El check de `PLANES_WRITE_ROLES` está dentro del handler, y Fastify valida body/params antes. Un rol no autorizado con payload inválido obtiene 400 (con detalle de validación) en vez de 403 — la autorización debería preceder a la validación. Menor (no filtra datos sensibles); los tests lo esquivan usando payloads válidos.
**Fix:** Mover el check a un `onRequest`/`preValidation` por handler, o a un helper `requireRoles(PLANES_WRITE_ROLES)` reutilizable — que además elimina las 7 copias idénticas del bloque (DRY: así nació el bug D-11, un endpoint nuevo que se olvide del guard inline repite la historia).

### IN-04: `loadPromos()` falla en silencio para el usuario (inconsistente con `loadPlans()`)

**File:** `el-templo-admin/src/pages/PlanesPage.vue:712-722`
**Issue:** El catch de `loadPromos` sólo loguea; `loadPlans` (línea 646) además notifica con `$q.notify`. Un empleado en el tab Promos con un error de red ve una tabla vacía sin feedback. Pre-existente, pero ahora hay más roles expuestos a la página (Planes read-only para todo el staff).
**Fix:** Agregar `$q.notify({ type: 'negative', message: 'Error cargando promos' })` en el catch.

### IN-05: Botón "Asignar programa adicional" visible para coach — dead-end de UI

**File:** `el-templo-admin/src/components/MemberProgramsTab.vue:6-11,61-66`
**Issue:** El tab "Programas" de `AlumnoDetailPage` (ruta all-staff) muestra el botón "Asignar programa adicional" sin gating de rol. Para coach: al abrir el diálogo, `listActivePrograms()` → `GET /admin/programs` devuelve 403 (coach excluido de `PROGRAMAS_LIST_ROLES` por D-10) → "No se pudieron cargar los programas" + select vacío; y aunque cargara, el `POST` de asignación exige `FINANCE_WRITE_ROLES` (excluye coach). Es un callejón sin salida. NO es regresión de la 149 (pre-149 coach ya quedaba 403 vía `CAJA_ROLES`, que tampoco lo incluía), pero la 149 formaliza que Programas no es superficie de coach, así que ocultar el botón para coach cerraría el flujo de forma coherente.
**Fix:** Gatear el botón (y/o el tab) por un `canAssignAddon = ['owner','admin','gestion','recepcion'].includes(role)` en `MemberProgramsTab`/`AlumnoDetailPage`.

### IN-06: Huecos de cobertura en los tests RBAC nuevos

**File:** `el-templo-api/test/subscriptions/plans-crud.test.ts:270-369`; `el-templo-api/test/programs.test.ts:442-547`
**Issue:** (a) Los tests D-11 sólo prueban coach → 403; gestion y recepcion también están en `SUBSCRIPTION_ROLES` y fuera de `PLANES_WRITE_ROLES`, pero nadie fija su 403. (b) Los tests D-15 prueban gestion → 403 en el CRUD y gestion → 200 en el list, pero no fijan que el flujo add-on (`POST /admin/users/:id/program-addons`, `FINANCE_WRITE_ROLES`) siga devolviendo 200 para gestion — justamente el flujo que CR-01 demostró load-bearing. (c) Los helpers puros `isNavItemVisible`/`isNavCategoryVisible` y `landingForRole` (recién reordenados y wireados) no tienen unit tests pese a ser funciones puras baratas de testear y de haber sido causa raíz de los 2 blockers.
**Fix:** Agregar gestion/recepcion → 403 en los writes de planes; gestion → 200 en el add-on assign; y un spec de vitest para los helpers de `templo-config` y `landingForRole` (owner→/alumnos, Fran→/sessions, coach→/pagos).

### IN-07: Condición muerta `to.path === '/'` en el guard de landing

**File:** `el-templo-admin/src/router/index.ts:45`
**Issue:** El índice `/` tiene un hijo `''` con `redirect: '/pagos'`, que vue-router resuelve durante el matching. Por eso dentro de `beforeEach` `to.path` nunca es `'/'` (siempre llega ya como `/pagos` con `redirectedFrom.path === '/'`). La primera mitad del OR (`to.path === '/'`) es defensiva pero inalcanzable. Inofensivo, pero puede confundir a un lector futuro sobre cómo se dispara el landing.
**Fix:** Documentar que el disparo real es la rama `redirectedFrom?.path === '/'`, o eliminar la condición muerta.

---

_Reviewed: 2026-07-02T21:05:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
