---
phase: 149-nav-por-categor-as-rbac
verified: 2026-07-02T21:53:13Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/6
  gaps_closed:
    - "NAV-03: El profe/administrativo ve Planes en modo lectura (qué incluye + precios, sin editar) — GET /admin/programs reabierto a staff administrativo vía PROGRAMAS_LIST_ROLES, PlanesPage.loadPrograms() gateado por rol"
    - "D-14: Landing por rol funcional end-to-end desde el flujo real de entrada (login) — LoginPage navega a '/', landingForRole() se evalúa en beforeEach post-checkAuth, WR-01 (carga fría) también corregido"
  gaps_remaining: []
  regressions: []
deferred: []
human_verification:
  - test: "Loguearse con owner/admin/gestion/coach/recepcion y confirmar las 6 categorías del drawer, visibilidad de Caja/Analíticas/Programas oculta para empleado, sección Templo al final"
    expected: "Dueño ve las 6 categorías completas; empleado ve Finanzas con Pagos (+Deudas si coach/gestion, +Reportes si gestion), Alumnos, Horarios, Planes; Caja/Analíticas/Programas ocultas"
    why_human: "Visual, requiere sesión real por rol; no verificable sólo con grep/tsc"
  - test: "Como gestion/recepcion, abrir /planes y confirmar que la columna 'Programa' muestra el programa vinculado real (no '—' en todos los planes); como coach, confirmar que la columna muestra '—' sin request de red a /admin/programs y sin evento nuevo en Sentry"
    expected: "gestion/recepcion ven el programa real; coach ve '—' sin 403 ni ruido en Sentry"
    why_human: "Requiere sesión real por rol + inspección de Network/Sentry; tests de integración ya confirman el contrato 200/403 del backend pero no el render final"
  - test: "Como gestion, abrir la tab Programas de un alumno → 'Asignar programa adicional' y confirmar que el select de programas carga opciones (no error)"
    expected: "El select se puebla con los programas activos"
    why_human: "Requiere sesión real de gestion y flujo de UI completo"
  - test: "Login con owner/admin → aterriza en /alumnos; login con gestion/recepcion/coach genérico → /pagos; login con Fran Scaine → /sessions; refrescar (F5) sobre '/' logueado como owner → cae en /alumnos (no /pagos)"
    expected: "Cada rol aterriza en su destino D-14 tanto en login real como en carga fría de '/'"
    why_human: "Requiere sesión real por rol y navegación de browser; la lógica de guard fue verificada por lectura de código pero el comportamiento de vue-router en runtime (orden real de redirect vs beforeEach, ausencia de loops visibles) no es 100% mecanizable por grep"
---

# Phase 149: Nav por categorías + RBAC Verification Report

**Phase Goal:** El admin se navega por categorías Finanzas / Alumnos / Horarios / Planes con visibilidad por rol (dueño del gimnasio vs empleado/profe), dejando las features Templo/marketing fuera del nav MVP sin borrarlas. End state: la nav plana actual (router/routes.ts + AdminLayout.vue) queda agrupada en categorías; el dueño ve todo, el profe/administrativo ve solo "Pagos" dentro de Finanzas y Planes en modo lectura; Alumnos y Horarios quedan libres; Campañas/Profes/Puntuaciones/landing quedan gateadas.
**Verified:** 2026-07-02T21:53:13Z
**Status:** human_needed
**Re-verification:** Sí — después de cierre de gaps (planes 149-05 y 149-06, gap_closure: true)

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                                                | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | NAV-01: el nav se agrupa en Finanzas/Alumnos/Horarios/Planes (+Configuración+Templo); Pagos/Caja/Analíticas/Reportes/Deudas dentro de Finanzas                                       | ✓ VERIFIED | Regresión: `templo-config.ts` sigue declarando las 6 categorías (`grep "header: '"` → Finanzas/Alumnos/Horarios/Planes/Configuración/Templo). Sin cambios desde la verificación previa.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2   | NAV-02: Finanzas (completa) y edición de Planes visibles sólo para admin/owner (con excepción Templo documentada D-02/D-03)                                                          | ✓ VERIFIED | Regresión: `PLANES_WRITE_ROLES` sigue en los 7 handlers de `subscriptions/routes.ts` (grep confirmado); `canEditPlans` en `PlanesPage.vue:415` sin cambios.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 3   | NAV-03: el empleado ve sólo Pagos dentro de Finanzas y Planes en modo lectura (qué incluye + precios, sin editar)                                                                    | ✓ VERIFIED | **Gap cerrado (Plan 05).** `PROGRAMAS_LIST_ROLES = ["owner","admin","gestion","recepcion"]` (permissions.ts:214-219) gatea únicamente el GET de listado (`programs/routes.ts:224`); los 6 handlers restantes siguen en `PROGRAMAS_ROLES` (confirmado por lectura línea a línea). `PlanesPage.vue` tiene `canViewPrograms` (L426-428) y `loadPrograms()` hace early-return si `!canViewPrograms.value` (L655-657); catch usa `log.warn` (L664), no `log.error`. `pnpm test test/programs.test.ts` → 19/19 verde, incluidos "gestion puede LISTAR programas → 200" y "coach NO puede listar programas → 403". `pnpm test rbac-sets` → 7/7 verde. `tsc --noEmit` verde. `AssignProgramAddonDialog.vue` reusa el mismo GET vía `listActivePrograms()` sin cambios propios — ahora responde 200 para gestion/recepcion. |
| 4   | NAV-04: Campañas/Profes/Puntuaciones/landing quedan fuera del nav MVP, gateadas, no borradas                                                                                         | ✓ VERIFIED | Regresión: rutas `campanias`, `puntuaciones`, `blog`, `gladius`, `academy`, `app-waitlist`, `labs-inquiries`, `franquicias` presentes en `routes.ts`, gateadas por rol; categoría `Templo` en `templo-config.ts` sin cambios.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 5   | D-11/D-15: la API bloquea a coach en los 7 writes de plans/promo-plans y a gestion en el CRUD admin de programs (salvo el GET de listado, ahora abierto por diseño per D-10/Plan 05) | ✓ VERIFIED | Regresión + extensión: `PLANES_WRITE_ROLES` intacto en subscriptions; en `programs/routes.ts` los 6 handlers admin (create/analytics/detail/put/content/deactivate) siguen `PROGRAMAS_ROLES`; el test D-15 (`programs.test.ts`) confirma gestion→403 en esos 6 y ahora explícitamente gestion→200/coach→403 en el GET list (cambio intencional documentado, no regresión).                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 6   | D-14: landing por rol funcional end-to-end (empleado→/pagos, dueño→/alumnos, Fran→/sessions) desde el flujo real de entrada (login)                                                  | ✓ VERIFIED | **Gap cerrado (Plan 06).** `LoginPage.vue:71` navega a `router.push('/')` (ya no `/sessions` hardcodeado). `routes.ts` exporta `landingForRole()` (L16) y el índice usa fallback estático `redirect: '/pagos'` (L43) en vez de evaluar el landing en el redirect de route-record. `index.ts` (L45-50) evalúa `landingForRole()` en `beforeEach` DESPUÉS de `checkAuth()` (L34), cuando `to.path === '/' \|\| to.redirectedFrom?.path === '/'`, protegido por `dest !== to.path` (anti-loop). Trazado manual del flujo: login→push('/')→redirect estático a '/pagos'→beforeEach ve `to.redirectedFrom.path==='/'`→recalcula `dest` con el user ya cargado→redirige si difiere. Cubre tanto login (antes roto, CR-02) como carga fría de '/' (antes roto, WR-01). `vue-tsc`/`eslint` de los 3 archivos → 0 errores.  |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact                                          | Expected                                                                               | Status     | Details                                                                                                                                                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/modules/shared/permissions.ts` | `PROGRAMAS_LIST_ROLES` + sets existentes                                               | ✓ VERIFIED | Export nuevo presente (L214-219) con JSDoc explicando la separación lectura/escritura; sets previos (`PLANES_WRITE_ROLES`, `PLANES_READ_ROLES`, `PROGRAMAS_ROLES`, `FINANCE_WRITE_ROLES`) intactos |
| `el-templo-api/src/modules/programs/routes.ts`    | GET list gateado por `PROGRAMAS_LIST_ROLES`; 6 handlers restantes en `PROGRAMAS_ROLES` | ✓ VERIFIED | Confirmado por lectura completa del archivo (L195-382): 1 guard `PROGRAMAS_LIST_ROLES` (GET list, L224), 6 guards `PROGRAMAS_ROLES` (create/analytics/detail/put/content/deactivate)               |
| `el-templo-api/test/programs.test.ts`             | Contrato fijado: gestion→200/coach→403 en GET list; gestion→403 en los 6 restantes     | ✓ VERIFIED | 19/19 tests verdes, incluidos los 2 casos nuevos                                                                                                                                                   |
| `el-templo-api/test/rbac-sets.test.ts`            | `PROGRAMAS_LIST_ROLES` deep-equal sin coach                                            | ✓ VERIFIED | 7/7 tests verdes                                                                                                                                                                                   |
| `el-templo-admin/src/pages/PlanesPage.vue`        | `canViewPrograms` + `loadPrograms` gateado + `log.warn` en catch                       | ✓ VERIFIED | Computed en L426-428, early-return en L655-657, `log.warn` en L664; `loadPlans`/`loadPromos` sin tocar                                                                                             |
| `el-templo-admin/src/pages/LoginPage.vue`         | `router.push('/')` tras login                                                          | ✓ VERIFIED | L71; `router.push('/sessions')` == 0 ocurrencias                                                                                                                                                   |
| `el-templo-admin/src/router/routes.ts`            | `landingForRole` exportado + índice con fallback estático                              | ✓ VERIFIED | `export function landingForRole` (L16); índice `redirect: '/pagos'` (L43, string estático)                                                                                                         |
| `el-templo-admin/src/router/index.ts`             | Landing evaluado en `beforeEach` post-`checkAuth`, anti-loop                           | ✓ VERIFIED | Import L3; uso en L45-50, después de `checkAuth` (L34), guardado por `dest !== to.path`                                                                                                            |

### Key Link Verification

| From                                                  | To                           | Via                                                                                                 | Status  | Details                                                                                                      |
| ----------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| `PlanesPage.vue` (`loadPrograms`)                     | `GET /admin/programs`        | `programsApi.getPrograms()`, condicional a `canViewPrograms`                                        | ✓ WIRED | Coach: no fetchea (early-return); gestion/recepcion/dueño: fetch 200 confirmado por test                     |
| `AssignProgramAddonDialog.vue` (`listActivePrograms`) | `GET /admin/programs`        | `useProgramsApi().listActivePrograms()`                                                             | ✓ WIRED | Mismo GET, ahora 200 para gestion/recepcion (test de integración lo confirma indirectamente)                 |
| `LoginPage.vue`                                       | `landingForRole` (router)    | login → `router.push('/')` → redirect estático → `beforeEach` (post-checkAuth) → `landingForRole()` | ✓ WIRED | Trazado línea a línea: L71 (login) → routes.ts L43 (redirect estático) → index.ts L45-50 (recalcula por rol) |
| `router/index.ts` (`beforeEach`)                      | `landingForRole` (routes.ts) | import + invocación condicional a `to.path==='/' \|\| to.redirectedFrom?.path==='/'`                | ✓ WIRED | Import L3; uso L46; anti-loop `dest !== to.path` evita bucle cuando el destino ya coincide                   |

### Data-Flow Trace (Level 4)

| Artifact                                           | Data Variable       | Source                                         | Produces Real Data                                                                 | Status                                                                                                 |
| -------------------------------------------------- | ------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `PlanesPage.vue` columna "Programa"                | `programs` (ref)    | `loadPrograms()` → `GET /admin/programs`       | Sí, para owner/admin/gestion/recepcion (200 confirmado por test); coach no fetchea | ✓ FLOWING — la columna se puebla con datos reales para todo staff con necesidad funcional del catálogo |
| `AssignProgramAddonDialog.vue` select de programas | `allPrograms` (ref) | `listActivePrograms()` → `GET /admin/programs` | Sí, para gestion/recepcion (mismo GET, ahora 200)                                  | ✓ FLOWING                                                                                              |
| `router/index.ts` landing por rol                  | `dest` (const)      | `landingForRole()` evaluado post-`checkAuth`   | Sí — usa `authStore.user` ya cargado, no un valor pre-auth/estático                | ✓ FLOWING — confirmado por orden de código (checkAuth L34 antes del bloque landing L45-50)             |

### Requirements Coverage

| Requirement | Source Plan                        | Description                                         | Status      | Evidence                                                                           |
| ----------- | ---------------------------------- | --------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| NAV-01      | 149-02, 149-03, 149-04             | Nav agrupado en Finanzas/Alumnos/Horarios/Planes    | ✓ SATISFIED | NAV_MODEL + AdminLayout.vue verificados sin regresión                              |
| NAV-02      | 149-01, 149-03, 149-04             | Finanzas completa + edición Planes admin/owner-only | ✓ SATISFIED | Guards API + `canEditPlans` verificados sin regresión                              |
| NAV-03      | 149-01, 149-03, 149-04, **149-05** | Empleado ve sólo Pagos + Planes en modo lectura     | ✓ SATISFIED | Gap cerrado: `PROGRAMAS_LIST_ROLES` + `canViewPrograms` + tests de contrato verdes |
| NAV-04      | 149-03, 149-04                     | Campañas/Profes/landing gateadas, no borradas       | ✓ SATISFIED | Rutas y NAV_MODEL confirmados intactos y gateados                                  |

Sin requirements huérfanos: REQUIREMENTS.md sólo mapea NAV-01..04 a la fase 149 y las 4 aparecen declaradas en al menos un plan (149-05 declara `requirements: [NAV-03]`; 149-06 declara `requirements: []` porque cierra D-14, una decisión locked de contexto, no un REQ-ID nuevo — documentado explícitamente en su frontmatter).

### Anti-Patterns Found

| File                                                                                                                           | Line | Pattern                                                                                                  | Severity   | Impact                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------ | ---- | -------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-admin/src/router/routes.ts` (rutas `/caja`,`/deudas`,`/reportes`,`/analiticas`,`/alumnos`,`/horarios`,`/campanias`) | var  | Arrays de roles inline duplicados en vez de reusar los sets de `templo-config.ts` (WR-03, pre-existente) | ⚠️ Warning | Deuda DRY pre-existente, ya señalada en la verificación previa; no bloquea el goal de esta fase, no forma parte de los 2 gaps cerrados |
| `el-templo-api/src/db/migrations/`                                                                                             | —    | Fila `system_settings.finance.pending_overdue_days` huérfana (WR-02, pre-existente)                      | ℹ️ Info    | Dato muerto, no afecta comportamiento; sin cambios desde la verificación previa                                                        |

No se encontraron marcadores de deuda (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) en ninguno de los 8 archivos modificados por los planes de cierre (149-05, 149-06). Los dos hallazgos "Blocker" de la verificación previa (`programs/routes.ts:217` GET sin separar, `LoginPage.vue:68` hardcodeado) ya no existen en el código actual.

### Human Verification Required

### 1. Drawer por rol (visual)

**Test:** Loguearse con owner/admin/gestion/coach/recepcion y observar el drawer.
**Expected:** Dueño ve las 6 categorías completas; empleado ve Finanzas con Pagos (+Deudas si coach/gestion, +Reportes si gestion), Alumnos, Horarios, Planes; Caja/Analíticas/Programas ocultas.
**Why human:** Visual, requiere sesión real por rol.

### 2. Columna Programa en /planes tras el fix de NAV-03

**Test:** Como gestion/recepcion, abrir /planes y observar la columna "Programa"; como coach, confirmar que la columna muestra "—" sin request a /admin/programs (Network) ni evento nuevo en Sentry.
**Expected:** gestion/recepcion ven el programa vinculado real; coach ve "—" limpio, sin 403 ni ruido.
**Why human:** Requiere sesión real por rol + inspección de Network/Sentry; el contrato de backend (200/403) ya está confirmado por test de integración, pero el render final y la ausencia de eventos en Sentry no son mecanizables.

### 3. Diálogo "Asignar programa adicional" para gestion

**Test:** Como gestion, abrir la tab Programas de un alumno → "Asignar programa adicional".
**Expected:** El select de programas carga las opciones (no "No se pudieron cargar los programas").
**Why human:** Requiere sesión real de gestion y flujo de UI completo.

### 4. Landing por rol end-to-end (login + carga fría)

**Test:** Login con owner/admin → /alumnos; gestion/recepcion/coach genérico → /pagos; Fran Scaine → /sessions. Estando logueado como owner, refrescar (F5) sobre '/' → /alumnos (no /pagos).
**Expected:** Cada rol aterriza en su destino D-14 en ambos caminos (login real y carga fría).
**Why human:** La lógica de guard fue verificada exhaustivamente por lectura de código y trazado manual del flujo (login→redirect estático→beforeEach post-checkAuth→landingForRole), pero el comportamiento de vue-router en runtime (orden real de resolución de redirect vs guards, ausencia de parpadeos/loops visibles) requiere confirmación en navegador real.

## Gaps Summary

Ambos gaps de la verificación previa quedan cerrados con evidencia directa de código, no sólo de SUMMARY:

1. **NAV-03 (Planes en modo lectura)**: `PROGRAMAS_LIST_ROLES` separa lectura (GET list, staff administrativo sin coach — D-10) de escritura (`PROGRAMAS_ROLES`, dueño-only — D-15) en `programs/routes.ts`. `PlanesPage.vue` gatea el fetch por rol (`canViewPrograms`) y coach ya no dispara 403 ni evento de Sentry. Confirmado por 19/19 tests de `programs.test.ts` (incluidos los 2 casos nuevos gestion→200/coach→403) y 7/7 de `rbac-sets.test.ts`, más lectura línea a línea del código.
2. **D-14 (landing por rol)**: `LoginPage.vue` ya no hardcodea `/sessions`; navega a `/` y delega en `landingForRole()`, evaluado en `beforeEach` DESPUÉS de `checkAuth()` (no en el redirect de route-record, que corría antes de que el user estuviera cargado). Esto corrige tanto el flujo de login (CR-02) como la carga fría de '/' (WR-01), con guard anti-loop (`dest !== to.path`). Confirmado por lectura completa y trazado manual del flujo entre los 3 archivos modificados; `vue-tsc`/`eslint` limpios.

No se detectaron regresiones en las 4 truths que ya habían pasado (NAV-01, NAV-02, NAV-04, D-11/D-15) ni en los artefactos previamente verificados.

El estado pasa a `human_needed`: no quedan gaps de código, pero persisten 4 ítems de verificación visual/runtime que ya estaban señalados en la verificación previa (drawer por rol, columna Programa, diálogo de add-ons) más uno nuevo específico del cierre de D-14 (landing end-to-end en navegador real). Ninguno es un defecto de código conocido — son confirmaciones de UX/runtime que exceden lo verificable por grep/tsc/tests de integración.

---

_Verified: 2026-07-02T21:53:13Z_
_Verifier: Claude (gsd-verifier)_
