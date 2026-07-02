---
phase: 149-nav-por-categor-as-rbac
verified: 2026-07-02T20:25:22Z
status: gaps_found
score: 4/6 must-haves verified
overrides_applied: 0
gaps:
  - truth: "NAV-03: El profe/administrativo ve Planes en modo lectura (qué incluye + precios, sin editar)"
    status: failed
    reason: "Angostar GET /admin/programs a PROGRAMAS_ROLES (dueño-only, Plan 01) rompe dos consumidores frontend vivos que corren para roles no-dueño desde esta misma fase: PlanesPage.vue llama loadPrograms() sin gating de rol en onMounted, por lo que coach/gestion/recepcion reciben 403 en cada visita a /planes — la columna 'Programa' (parte de 'qué incluye', D-10) siempre muestra '—' y el catch dispara log.error, que reporta a Sentry en cada visita de cada empleado. AssignProgramAddonDialog.vue (tab Programas de AlumnoDetailPage, ruta all-staff) también depende de GET /admin/programs vía listActivePrograms() — gestion ya no puede listar programas para asignar un add-on, aunque el endpoint de asignación (FINANCE_WRITE_ROLES) lo sigue permitiendo. Confirmado en código (no solo en REVIEW.md): programs/routes.ts:196-366 usa PROGRAMAS_ROLES en los 7 handlers incluido el GET de listado; PlanesPage.vue:641/775 llama loadPrograms() incondicional; AssignProgramAddonDialog.vue:112 llama listActivePrograms()."
    artifacts:
      - path: "el-templo-api/src/modules/programs/routes.ts"
        issue: "El GET de listado (línea 217) quedó dentro del bloque angostado a PROGRAMAS_ROLES junto con los 6 writes/detalle — debía separarse lectura de escritura como se hizo con Planes (PLANES_WRITE_ROLES vs PLANES_READ_ROLES)"
      - path: "el-templo-admin/src/pages/PlanesPage.vue"
        issue: "loadPrograms() (línea 639-646, invocada en onMounted línea 775) no está gateada por rol; para staff no-dueño siempre falla con 403 y reporta a Sentry en cada visita"
      - path: "el-templo-admin/src/components/AssignProgramAddonDialog.vue"
        issue: "listActivePrograms() (línea 112) depende del mismo GET angostado; gestion ve 'No se pudieron cargar los programas' y un select vacío pese a que el endpoint de asignación sigue permitiéndole ese flujo"
    missing:
      - "Separar lectura de escritura en programs/routes.ts (p.ej. PROGRAMAS_LIST_ROLES = ALL_STAFF_ROLES sólo en el GET de listado, o un endpoint de catálogo liviano para staff) y aplicarlo al GET línea 217"
      - "Hacer el fetch de loadPrograms() en PlanesPage.vue condicional al rol (o tolerar el 403 sin log.error) para no ruidear Sentry en cada visita de empleado"
      - "Decidir consistentemente el flujo de AssignProgramAddonDialog para gestion: si se cierra, cerrar también el endpoint de assign y ocultar el botón en MemberProgramsTab; si se mantiene, reabrir el GET de listado a staff"
      - "Agregar test de integración que fije el contrato elegido (GET /admin/programs para el rol que corresponda)"
  - truth: "D-14: Landing por rol funcional end-to-end (empleado -> /pagos, dueño -> /alumnos, Fran Scaine -> /sessions)"
    status: failed
    reason: 'landingForRole() (routes.ts) sólo se ejecuta cuando el router resuelve la ruta ''/''. El flujo real de entrada es el login, y LoginPage.vue conserva ''router.push("/sessions")'' hardcodeado, sin pasar por ''/''. Resultado confirmado en código: el owner cae en /sessions post-login porque allowedRoles de /sessions incluye owner y canAccessTraining(owner) es true (D-08, cualquier owner) — exactamente el comportamiento que D-14 y el propio comentario de routes.ts:10-11 declaran eliminado. El coach no-Fran cae en /sessions y rebota a /alumnos (no a /pagos, que D-14 define para el empleado). Sólo quien navega a la URL raíz a mano activa landingForRole(). Se agrava por WR-01 (no bloqueante en sí): el redirect de ''/'' se resuelve durante el matching, ANTES del beforeEach que corre checkAuth(), por lo que en carga fría de ''/'' todos los roles pueden caer en /pagos antes de que el guard rebote correctamente.'
    artifacts:
      - path: "el-templo-admin/src/pages/LoginPage.vue"
        issue: "Línea 68: router.push('/sessions') hardcodeado tras login exitoso; nunca deja que landingForRole() (routes.ts) resuelva el destino por rol"
    missing:
      - "Cambiar LoginPage.vue:68 a router.push('/') para que landingForRole() resuelva el destino"
      - "Mover la evaluación de landingForRole() al guard beforeEach (después de checkAuth), no al redirect de route-record, para que funcione también en carga fría de '/' (WR-01)"
deferred: []
human_verification:
  - test: "Loguearse con owner/admin/gestion/coach/recepcion y confirmar las 6 categorías del drawer, visibilidad de Caja/Analíticas/Programas oculta para empleado, sección Templo al final"
    expected: "Dueño ve las 6 categorías completas; empleado ve Finanzas con Pagos (+Deudas si coach/gestion, +Reportes si gestion), Alumnos, Horarios, Planes; Caja/Analíticas/Programas ocultas"
    why_human: "Visual, requiere sesión real por rol; no verificable sólo con grep/tsc"
  - test: "Confirmar visualmente el estado roto de la columna 'Programa' en /planes para un usuario coach/gestion/recepcion tras el fix de CR-01"
    expected: "La columna Programa muestra el programa vinculado real, no '—' para todos los planes"
    why_human: "Requiere sesión real no-dueño y verificar la tabla renderizada"
---

# Phase 149: Nav por categorías + RBAC Verification Report

**Phase Goal:** El admin se navega por categorías Finanzas / Alumnos / Horarios / Planes con visibilidad por rol (dueño del gimnasio vs empleado/profe), dejando las features Templo/marketing fuera del nav MVP sin borrarlas. End state: la nav plana actual (router/routes.ts + AdminLayout.vue) queda agrupada en 4 categorías; el dueño ve todo, el profe/administrativo ve solo "Pagos" dentro de Finanzas y Planes en modo lectura; Alumnos y Horarios quedan libres; Campañas/Profes/Puntuaciones/landing quedan gateadas.
**Verified:** 2026-07-02T20:25:22Z
**Status:** gaps_found
**Re-verification:** No — initial verification (149-VALIDATION.md existe pero es de plan-checking pre-ejecución, no una verificación previa post-ejecución)

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                                                                                | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | NAV-01: el nav se agrupa en Finanzas/Alumnos/Horarios/Planes (+Configuración+Templo); Pagos/Caja/Analíticas/Reportes/Deudas dentro de Finanzas                                                                       | ✓ VERIFIED | `templo-config.ts` NAV_MODEL declara 6 categorías (`grep -n "header: '"` → Finanzas/Alumnos/Horarios/Planes/Configuración/Templo, líneas 105-145); AdminLayout.vue itera NAV_MODEL filtrado por `isNavCategoryVisible`                                                                                                                                                       |
| 2   | NAV-02: Finanzas (completa) y edición de Planes visibles sólo para admin/owner (con excepción Templo documentada D-02/D-03 para gestion en Reportes y coach+gestion en Deudas, decisión explícita en 149-CONTEXT.md) | ✓ VERIFIED | Caja→`CAJA_SALDOS_ROLES=['admin','owner']`, Analíticas→`ANALITICAS_ROLES=['admin','owner']`, Programas→`DUENO_ROLES`; edición de Planes gateada por `canEditPlans=['owner','admin']` en PlanesPage.vue:415. Deudas/Reportes incluyen gestion/coach por override Templo explícito (D-02/D-03), NO por omisión                                                                 |
| 3   | NAV-03: el empleado ve sólo Pagos dentro de Finanzas y Planes en modo lectura (qué incluye + precios, sin editar)                                                                                                    | ✗ FAILED   | Confirmado en código: `GET /admin/programs` angostado a `PROGRAMAS_ROLES` (programs/routes.ts:217) rompe `loadPrograms()` sin gating de rol en PlanesPage.vue (639-646, 775) — la columna "Programa" del empleado siempre muestra "—" y dispara `log.error` a Sentry en cada visita (CR-01 del REVIEW.md, confirmado por lectura directa del código, no sólo por el reporte) |
| 4   | NAV-04: Campañas/Profes/Puntuaciones/landing quedan fuera del nav MVP, gateadas, no borradas                                                                                                                         | ✓ VERIFIED | `routes.ts` conserva las rutas `campanias`, `puntuaciones`, `blog`, `gladius`, `academy`, `app-waitlist`, `labs-inquiries`, `franquicias`; `templo-config.ts` las agrupa bajo la categoría `Templo` (`templo:true`) gateada por `TEMPLO_ENABLED` + roles (`DUENO_ROLES`/`['owner']`)                                                                                         |
| 5   | D-11/D-15: la API bloquea a coach en los 7 writes de plans/promo-plans y a gestion en el CRUD admin de programs                                                                                                      | ✓ VERIFIED | `subscriptions/routes.ts` contiene `PLANES_WRITE_ROLES` en los 7 handlers de escritura; `programs/routes.ts` contiene `PROGRAMAS_ROLES` en los 7 handlers CRUD admin (líneas 196-366); `tsc --noEmit` verde en el paquete API (confirmado por esta verificación)                                                                                                             |
| 6   | D-14: landing por rol funcional end-to-end (empleado→/pagos, dueño→/alumnos, Fran→/sessions) desde el flujo real de entrada (login)                                                                                  | ✗ FAILED   | `LoginPage.vue:68` sigue con `router.push('/sessions')` hardcodeado — nunca navega a `'/'`, por lo que `landingForRole()` (routes.ts) nunca corre en el camino principal. El owner cae en /sessions (canAccessTraining(owner)===true, D-08); coach no-Fran rebota a /alumnos, no a /pagos (CR-02 del REVIEW.md, confirmado en código)                                        |

**Score:** 4/6 truths verified

### Required Artifacts

| Artifact                                            | Expected                                                                                        | Status                                            | Details                                                                                                                                                                                                                 |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/modules/shared/permissions.ts`   | `TEMPLO_RBAC_OVERRIDES` + `PLANES_WRITE_ROLES`/`PLANES_READ_ROLES`/`PROGRAMAS_ROLES`            | ✓ VERIFIED                                        | Sets presentes, consumidos por subscriptions/programs routes                                                                                                                                                            |
| `el-templo-api/src/modules/subscriptions/routes.ts` | Guards per-handler dueño-only en los 7 writes                                                   | ✓ VERIFIED                                        | `PLANES_WRITE_ROLES` presente en los 7 handlers; GET sin tocar                                                                                                                                                          |
| `el-templo-api/src/modules/programs/routes.ts`      | CRUD admin de programs dueño-only                                                               | ⚠️ HOLLOW (downstream)                            | Los 7 handlers usan `PROGRAMAS_ROLES` correctamente per D-15, pero el GET de listado quedó incluido sin separar lectura/escritura, rompiendo 2 consumidores frontend vivos (ver truth 3)                                |
| `el-templo-api/src/modules/finance/*` (config-caja) | Perilla eliminada, `OVERDUE_DAYS` hardcodeado                                                   | ✓ VERIFIED                                        | `config-service.ts` y `finance-config.test.ts` borrados; cero referencias residuales (grep); `tsc --noEmit` verde                                                                                                       |
| `el-templo-admin/src/config/templo-config.ts`       | Nav-model declarativo + helpers de visibilidad                                                  | ✓ VERIFIED                                        | `NAV_MODEL`, `isNavItemVisible`, `isNavCategoryVisible`, sets de rol, existe y se usa                                                                                                                                   |
| `el-templo-admin/src/layouts/AdminLayout.vue`       | Drawer derivado del nav-model, sin los 7 computed ad-hoc                                        | ✓ VERIFIED                                        | Grep confirma 0 ocurrencias de los computed viejos; `NAV_MODEL`/helpers importados y usados                                                                                                                             |
| `el-templo-admin/src/router/routes.ts`              | Landing por rol + `/planes`/`/pagos` ampliados + `/programas` dueño-only + sin ruta config-caja | ⚠️ ORPHANED (parcial)                             | `landingForRole()` existe y está bien ordenada (Pitfall 2 resuelto), pero no está wireada al flujo real de entrada (ver truth 6, CR-02); `/programas` correctamente angostado a `DUENO_ROLES`; ruta config-caja ausente |
| `el-templo-admin/src/pages/PlanesPage.vue`          | Controles de escritura gateados por `canEditPlans`                                              | ✓ VERIFIED (gating) / ✗ HOLLOW (columna Programa) | `canEditPlans` gatea correctamente 9 controles de escritura; pero la columna "Programa" queda rota para no-dueño por CR-01                                                                                              |
| `el-templo-admin/src/pages/LoginPage.vue`           | (no declarado como artefacto del plan, pero es el punto de wiring real de D-14)                 | ✗ NOT UPDATED                                     | Sigue con `router.push('/sessions')` hardcodeado — nunca delega en `landingForRole()`                                                                                                                                   |

### Key Link Verification

| From                                                  | To                                      | Via                                                       | Status                            | Details                                                                                               |
| ----------------------------------------------------- | --------------------------------------- | --------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `subscriptions/routes.ts`                             | `PLANES_WRITE_ROLES`                    | import desde `../shared/permissions`                      | ✓ WIRED                           | Presente en los 7 handlers                                                                            |
| `programs/routes.ts`                                  | `PROGRAMAS_ROLES`                       | import desde `../shared/permissions`                      | ✓ WIRED                           | Presente en los 7 handlers CRUD admin                                                                 |
| `AdminLayout.vue`                                     | `templo-config.ts`                      | import de `NAV_MODEL` + helpers                           | ✓ WIRED                           | Drawer deriva del modelo                                                                              |
| `router/routes.ts`                                    | `templo-config.ts`                      | import de `PLANES_READ_ROLES`/`PAGOS_ROLES`/`DUENO_ROLES` | ✓ WIRED                           | `meta.allowedRoles` usa los sets importados                                                           |
| `router/routes.ts` (`landingForRole`)                 | `LoginPage.vue` (flujo real de entrada) | login → `router.push('/')` → `landingForRole()`           | ✗ NOT_WIRED                       | `LoginPage.vue` navega directo a `/sessions`, saltea `'/'` por completo (CR-02)                       |
| `PlanesPage.vue` (`loadPrograms`)                     | `GET /admin/programs`                   | `programsApi.getPrograms()`                               | ✗ NOT_WIRED (para staff no-dueño) | 403 para coach/gestion/recepcion tras el angostamiento de Plan 01 (CR-01)                             |
| `AssignProgramAddonDialog.vue` (`listActivePrograms`) | `GET /admin/programs`                   | `useProgramsApi().listActivePrograms()`                   | ✗ NOT_WIRED (para gestion)        | Mismo 403; el endpoint de asignación (POST) sigue abierto a gestion, generando un flujo inconsistente |

### Data-Flow Trace (Level 4)

| Artifact                                           | Data Variable       | Source                                         | Produces Real Data                                           | Status                                                                                                                         |
| -------------------------------------------------- | ------------------- | ---------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `PlanesPage.vue` columna "Programa"                | `programs` (ref)    | `loadPrograms()` → `GET /admin/programs`       | No, para coach/gestion/recepcion (403 → catch, sin fallback) | ✗ HOLLOW — la tabla renderiza pero la columna Programa queda "—" para todo empleado, siempre, independientemente del plan real |
| `AssignProgramAddonDialog.vue` select de programas | `allPrograms` (ref) | `listActivePrograms()` → `GET /admin/programs` | No, para gestion (403)                                       | ✗ HOLLOW — select vacío, mensaje de error                                                                                      |

### Requirements Coverage

| Requirement | Source Plan            | Description                                         | Status      | Evidence                                                                                                  |
| ----------- | ---------------------- | --------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| NAV-01      | 149-03, 149-04         | Nav agrupado en Finanzas/Alumnos/Horarios/Planes    | ✓ SATISFIED | NAV_MODEL + AdminLayout.vue verificados                                                                   |
| NAV-02      | 149-01, 149-04         | Finanzas completa + edición Planes admin/owner-only | ✓ SATISFIED | Guards API + `canEditPlans` verificados                                                                   |
| NAV-03      | 149-01, 149-03, 149-04 | Empleado ve sólo Pagos + Planes en modo lectura     | ✗ BLOCKED   | CR-01: Planes en modo lectura queda funcionalmente roto para el empleado (columna Programa + Sentry spam) |
| NAV-04      | 149-03, 149-04         | Campañas/Profes/landing gateadas, no borradas       | ✓ SATISFIED | Rutas y NAV_MODEL confirmados intactos y gateados                                                         |

Sin requirements huérfanos: REQUIREMENTS.md sólo mapea NAV-01..04 a la fase 149 y las 4 aparecen declaradas en al menos un plan.

### Anti-Patterns Found

| File                                                                                                                           | Line   | Pattern                                                                                                           | Severity   | Impact                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/modules/programs/routes.ts:217`                                                                             | 217    | GET de listado angostado junto con los writes (falta de separación lectura/escritura)                             | 🛑 Blocker | Causa directa de CR-01                                                                                        |
| `el-templo-admin/src/pages/LoginPage.vue:68`                                                                                   | 68     | `router.push('/sessions')` hardcodeado, no delega en landing por rol                                              | 🛑 Blocker | Causa directa de CR-02; D-14 no funciona en el camino principal                                               |
| `el-templo-admin/src/pages/PlanesPage.vue:632,644,698`                                                                         | varias | `log.error` en catch de fetches — para `loadPrograms` esto ahora dispara en cada visita de empleado (Sentry spam) | ⚠️ Warning | Ruido en Sentry, no bloquea funcionalidad de por sí pero es síntoma de CR-01                                  |
| `el-templo-admin/src/router/routes.ts` (rutas `/caja`,`/deudas`,`/reportes`,`/analiticas`,`/alumnos`,`/horarios`,`/campanias`) | varias | Arrays de roles inline duplicados en vez de reusar los sets de `templo-config.ts` (WR-03 del REVIEW.md)           | ⚠️ Warning | Deriva nav↔router; no bloquea el goal de esta fase pero reintroduce la deuda DRY que la fase buscaba eliminar |
| `el-templo-api/src/db/migrations/`                                                                                             | —      | Fila `system_settings.finance.pending_overdue_days` (seed 0157) queda huérfana sin migración de limpieza (WR-02)  | ℹ️ Info    | Dato muerto, no afecta comportamiento (Opción A ignora la fila)                                               |

No se encontraron marcadores de deuda (`TBD`/`FIXME`/`XXX`) en los archivos modificados por esta fase.

### Human Verification Required

### 1. Drawer por rol (visual)

**Test:** Loguearse con owner/admin/gestion/coach/recepcion y observar el drawer.
**Expected:** Dueño ve las 6 categorías completas; empleado ve Finanzas con Pagos (+Deudas si coach/gestion, +Reportes si gestion), Alumnos, Horarios, Planes; Caja/Analíticas/Programas ocultas.
**Why human:** Visual, requiere sesión real por rol.

### 2. Columna Programa rota en /planes para empleado

**Test:** Como coach/gestion/recepcion, abrir /planes y observar la columna "Programa".
**Expected (post-fix):** Debe mostrar el programa real vinculado, no "—" para todos los planes.
**Why human:** Requiere sesión real no-dueño; confirma que el fix de CR-01 resuelve el síntoma visual.

## Gaps Summary

La fase 149 construyó correctamente la infraestructura declarativa de nav (NAV_MODEL, helpers de visibilidad, sets de rol espejo) y endureció el RBAC de la API en los puntos que planificó (D-11 escritura de planes, D-15 CRUD de programs). Sin embargo, dos truths centrales del goal de la fase fallan por trazado cross-módulo incompleto, ambos ya identificados en 149-REVIEW.md y confirmados de forma independiente en esta verificación leyendo el código directamente (no sólo el REVIEW.md):

1. **NAV-03 (Planes en modo lectura) está roto para todo empleado** porque el angostamiento de `GET /admin/programs` a dueño-only (Plan 01) no contempló que `PlanesPage.vue` (abierta a todo staff en esta misma fase) y `AssignProgramAddonDialog.vue` dependen de ese mismo GET. Efecto: columna "Programa" siempre vacía + spam a Sentry en cada visita de empleado + flujo de add-ons de gestion roto.
2. **D-14 (landing por rol) nunca se ejecuta en el flujo real de login** porque `LoginPage.vue` no fue tocado por el Plan 04 y sigue navegando directo a `/sessions`. El entregable central "el dueño aterriza en Alumnos, el empleado en Pagos" sólo funciona para quien tipea la URL raíz a mano.

Ambos son defectos funcionales concretos y verificables por código (no ambigüedad ni juicio de UX), consistentes con la clasificación CRITICAL del code-review. La fase no puede considerarse goal-achieved hasta que se cierren.

---

_Verified: 2026-07-02T20:25:22Z_
_Verifier: Claude (gsd-verifier)_
