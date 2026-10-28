---
phase: 193-comunicaciones
plan: 07
subsystem: api
tags:
  [
    communications,
    tv,
    avisos,
    fastify,
    drizzle,
    vitest,
    tenancy,
    rbac,
    module-gate,
  ]

# Dependency graph
requires:
  - phase: 193-02
    provides: "schema tv_avisos (gym-owned, mig 0216) + tv_class_state.tv_aviso_id"
  - phase: 193-04
    provides: "modulo communications, estilo de routes.ts/schemas.ts/service.ts hermano"
provides:
  - "TvAvisosService (el-templo-api/src/modules/communications/tv-avisos-service.ts): list/create/update/remove scopeados por tenant + getActiveForBranch (D-29)"
  - "tvAvisosRoutes: 5 rutas bajo /api/communications/tv — 4 admin (ADMIN_ROLES) + 1 control (TV_CONTROL_ROLES + requireBranchAccess)"
  - 'Unica superficie templo-module de la fase 193, gateada por moduleScope(app, "templo-training", tvAvisosRoutes) (D-23)'
  - "Manifiesto fail-closed actualizado (400 -> 405 entradas) con las 5 rutas templo-module/templo-training"
  - "Cobertura de integracion (8 casos, 7 bloques): CRUD, permisos D-29, sedes, alcance, borrado seguro (FK), modulo apagado, aislamiento cross-tenant"
affects: [193-10, 193-13, 193-16]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Plugin con onRequest de INSTANCIA compartido (authenticate + attachCountryScope) y chequeo de ROL por handler (isAdmin/isTvControl) — necesario porque las 5 rutas del plugin NO comparten un unico set de roles (a diferencia de tv/control-routes.ts, que si)"
    - "Ruta con roles mixtos + requireBranchAccess: el chequeo de rol va PRIMERO en el array de preHandler, requireBranchAccess SEGUNDO — evita gastar una consulta de sede en un actor que ya deberia haber sido rechazado por rol"
    - "Borrado seguro con referencia FK: update-then-delete en el mismo metodo del service (remove() limpia tv_class_state.tv_aviso_id ANTES del DELETE de tv_avisos), documentado como mitigacion de T-193-28"
    - "Filtro de alcance por sede (scope_branch_ids JSON) resuelto en memoria tras un SELECT scopeado por tenant, mismo criterio que avisos.scopeBranchIds en CommunicationsService — sin N+1, dataset chico por tenant"

key-files:
  created:
    - el-templo-api/src/modules/communications/tv-avisos-service.ts
    - el-templo-api/src/modules/communications/tv-avisos-routes.ts
    - el-templo-api/test/communications/tv-avisos.test.ts
  modified:
    - el-templo-api/src/modules/communications/schemas.ts
    - el-templo-api/src/modules/communications/index.ts
    - el-templo-api/src/app.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts

key-decisions:
  - "tvControlRoutes (el control existente del profe, /api/admin/tv/*) queda SIN moduleScope, exactamente como estaba antes de este plan — fuera de alcance explicito del CONTEXT.md del plan. Un tenant con templo-training OFF sigue viendo su control de clase en vivo; solo la pestaña NUEVA de Avisos en TV (las 5 rutas de este plan) se corta con 404 del guard."
  - "Chequeo de rol movido de un hook de instancia (como hace tv/control-routes.ts, que tiene un unico set de roles para las 3 rutas) a un chequeo por handler (mismo patron que communications/routes.ts, isAdmin) — necesario porque este plugin mezcla ADMIN_ROLES (4 rutas) y TV_CONTROL_ROLES (1 ruta). El unico hook de instancia compartido es authenticate + attachCountryScope."
  - "getActiveForBranch(ctx, branchId, mode?) devuelve el aviso MAS RECIENTE (id desc) que aplique a la sede quedando en modo generico (no hardcodeado a 'manual' en el service) — la ruta de control pasa mode:'manual' explicitamente. Deja el service listo para que los planes 10/13 (modo flex_inicio/flex_final) lo reusen sin tocar el service."
  - "El JSON Schema valida title<=120/body<=400 (limite fisico de columna) pero el service TAMBIEN valida (defense in depth, mismo patron doble-capa que validateDestination en CommunicationsService) — protege cualquier caller futuro que invoque el service fuera de HTTP."

requirements-completed: [COM-04]

# Metrics
duration: ~70min
completed: 2026-09-02
---

# Phase 193 Plan 07: API de avisos en TV (CRUD admin + lectura del activo por sede) Summary

**`TvAvisosService` + `tvAvisosRoutes`: 5 rutas nuevas bajo `/api/communications/tv`, unica superficie de la fase 193 gateada por `moduleScope(app, "templo-training", ...)` (D-23), con borrado seguro de la referencia FK en `tv_class_state` y 8 tests de integracion cubriendo permisos, sedes, alcance, modulo apagado y aislamiento cross-tenant.**

## Performance

- **Duration:** ~70 min
- **Tasks:** 3/3
- **Files modified:** 8 (3 nuevos + 5 modificados)

## Accomplishments

- `tv-avisos-service.ts`: `TvAvisosService` con `list`/`create`/`update`/`remove` scopeados por tenant (15 `tenantWhere`) + `getActiveForBranch` (D-29). `create`/`update` validan sedes contra `branches` del propio tenant (T-193-27, 400 si hay una ajena). `remove` limpia `tv_class_state.tv_aviso_id` ANTES del DELETE (T-193-28, mitiga el bloqueo de FK).
- `tv-avisos-routes.ts`: plugin con `onRequest` compartido (authenticate + attachCountryScope) y chequeo de rol por handler — 4 rutas `/admin/tv-avisos*` con `ADMIN_ROLES` (D-29: el coach NO crea/edita/borra) y `GET /control/tv-aviso-activo` con `TV_CONTROL_ROLES` + `requireBranchAccess({from: "query.branchId"})`.
- `app.ts`: `moduleScope(app, "templo-training", tvAvisosRoutes, {prefix: "/api/communications/tv"})` registrado justo despues de `communicationsRoutes` (core). Comentario explicito dejando constancia de que `tvControlRoutes` sigue SIN `moduleScope` a proposito.
- `tenant-manifest.ts`: 5 entradas nuevas `templo-module`/`templo-training` + contabilidad del header (`templo-module` 142→147, TOTAL 400→405). `ENTRADAS_BASELINE` actualizado a 405 en `iso-01-manifiesto.test.ts`.
- `tv-avisos.test.ts`: 8 tests (7 bloques del plan) — CRUD feliz; D-29 (coach 403 admin / 200 control); sedes (403 `BRANCH_OUT_OF_SCOPE` fuera de la sede operativa + 400 con sede de otro tenant en `scopeBranchIds`); alcance por sede (`scope:[A]` vs `null`); borrado seguro (estado de `tv_class_state` leido de la base tras el DELETE); modulo apagado (404 en las 5 rutas, D-23); aislamiento (PUT/DELETE cross-tenant → 404, nunca 403).
- Verificacion: `tsc --noEmit` 0, `lint:tenant` DISCREPANCIAS: 0, `iso-01-manifiesto.test.ts` 13/13, `mod-01-guard.test.ts` 11/11, `mod-02-hooks.test.ts` 6/6, `tv-avisos.test.ts` 8/8 (32/32 en la corrida combinada del `<verification>` del plan). `git diff --name-only` NO incluye `src/modules/tv/control-routes.ts`.

## Task Commits

Cada task se commiteo atomicamente en `feat/193-comunicaciones` en el worktree `~/projects/et-193`:

1. **Task 1: Service + rutas de avisos de TV** - `427a199f` (feat)
2. **Task 2: Registro con moduleScope + manifiesto** - `70250b82` (feat)
3. **Task 3: Tests de permisos, sedes y aislamiento** - `7b6d34cb` (test)

**Plan metadata:** Este SUMMARY se escribe en el checkout principal sin commitear (lo commitea el orquestador). Worktree `et-193` limpio (`git status --short` vacio) al terminar.

## Files Created/Modified

- `el-templo-api/src/modules/communications/tv-avisos-service.ts` - `TvAvisosService`: CRUD + `getActiveForBranch`
- `el-templo-api/src/modules/communications/tv-avisos-routes.ts` - `tvAvisosRoutes`: 5 handlers, roles mixtos
- `el-templo-api/src/modules/communications/schemas.ts` - JSON Schemas de avisos de TV (bodies + responses)
- `el-templo-api/src/modules/communications/index.ts` - re-exporta `TvAvisosService`/`tvAvisosRoutes`
- `el-templo-api/src/app.ts` - `moduleScope(app, "templo-training", tvAvisosRoutes, ...)`
- `el-templo-api/test/tenant-manifest.ts` - 5 entradas nuevas `templo-module` + contabilidad 400→405
- `el-templo-api/test/tenancy/iso-01-manifiesto.test.ts` - `ENTRADAS_BASELINE` 400→405
- `el-templo-api/test/communications/tv-avisos.test.ts` - 8 tests de integracion HTTP

## Decisions Made

Ver `key-decisions` en el frontmatter (rol de `tvControlRoutes` intacto, chequeo de rol por handler en vez de hook de instancia, `mode` generico en `getActiveForBranch`, doble validacion title/body).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug de tipado] `reply.code(403)` no tipaba en `GET /admin/tv-avisos` sin `RouteGenericInterface`**

- **Found during:** Task 1, primera corrida de `tsc --noEmit`
- **Issue:** Mismo hallazgo que 193-04 (L4 de las lecciones acumuladas): un handler `fastify.get(...)` SIN generic pero CON `schema.response` que solo declara `200`, hace que TypeScript infiera el `Reply` estrictamente contra esas claves — `reply.code(403).send(...)` no compila.
- **Fix:** `fastify.get<{ Querystring: Record<string, never> }>(...)` en `GET /admin/tv-avisos`, mismo patron que los otros 6 handlers de `communications/routes.ts`.
- **Files modified:** `el-templo-api/src/modules/communications/tv-avisos-routes.ts`
- **Verification:** `tsc --noEmit` 0.
- **Committed in:** `427a199f` (Task 1 commit — corregido antes de commitear, no genero un commit extra)

**2. [Rule 1 - Bug propio] `getActiveForBranch` no era detectada por `lint:tenant` (CON-06) al armar el WHERE con un array de condiciones**

- **Found during:** Task 1, primera corrida de `pnpm lint:tenant`
- **Issue:** La primera version construia `conditions = [tenantWhere(...), ...]` como variable y pasaba `and(...conditions)` al `.where()`. El lint de tenancy analiza el texto del `.where()` por AST y no ve el `tenantWhere` cuando esta detras de una variable intermedia — reporto 1 violacion no listada (`tv_avisos`).
- **Fix:** Reescrito para que `tenantWhere(tvAvisos, ctx)` quede LITERAL dentro del `.where(...)`, con una rama ternaria por `mode` (mismo patron que `listAvisos` en `CommunicationsService`).
- **Files modified:** `el-templo-api/src/modules/communications/tv-avisos-service.ts`
- **Verification:** `pnpm lint:tenant` DISCREPANCIAS: 0.
- **Committed in:** `427a199f` (Task 1 commit — corregido antes de commitear, no genero un commit extra)

---

**Total deviations:** 2, ambas auto-fijadas antes de commitear (no generaron commits extra). Ninguna toco archivos fuera de `files_modified` del plan.
**Impact on plan:** Sin impacto en el objetivo. Las dos son detalles de tipado/lint del framework y del gate de tenancy, no bugs de negocio.

## Issues Encountered

Ninguno bloqueante. Los 3 archivos de test corridos en foreground con `timeout: 600000` en la herramienta Bash y `--hookTimeout=300000` en vitest — cada corrida individual tardo entre 110s y 135s (provision del DB de test); la corrida combinada de verificacion (`tv-avisos.test.ts` + `iso-01-manifiesto.test.ts` + `mod-01-guard.test.ts`, 32 tests) tardo ~148s, dentro de lo esperado.

Nota tecnica (no bug): confirmado empiricamente que el guard de `moduleScope` (hook de INSTANCIA `authenticate`+`attachCountryScope` propio del plugin, corre ANTES; guard de modulo apendeado a `route.onRequest` por-ruta, corre DESPUES; chequeo de rol en el handler o en `preHandler`, corre AL FINAL) produce el orden correcto sin necesidad de tocar el mecanismo — el caso (6) del test (modulo apagado) devuelve 404 para admin Y coach por igual, antes de que el rol se evalue.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Superficie lista para los planes 10/13/16, con esta forma exacta:**

- **`POST /api/communications/tv/admin/tv-avisos`** (ADMIN_ROLES) — body `{ title: string(1-120), body: string(1-400), mode: "manual"|"flex_inicio"|"flex_final", isActive?: boolean, scopeBranchIds?: number[]|null }` → 201 con el aviso creado (`{ id, title, body, mode, isActive, scopeBranchIds }`).
- **`GET /api/communications/tv/admin/tv-avisos`** (ADMIN_ROLES) → `{ avisos: TvAvisoItem[] }`, activos primero, mas recientes primero.
- **`PUT /api/communications/tv/admin/tv-avisos/:id`** (ADMIN_ROLES) — mismos campos que create, todos opcionales → 200 con el aviso actualizado. Id ajeno → 404.
- **`DELETE /api/communications/tv/admin/tv-avisos/:id`** (ADMIN_ROLES) → `{ success: true }`. Limpia automaticamente cualquier `tv_class_state` que lo estuviera mostrando (`screen` vuelve a `'class'`, `tv_aviso_id` a `null`).
- **`GET /api/communications/tv/control/tv-aviso-activo?branchId=NN`** (TV_CONTROL_ROLES = dueño+coach, + `requireBranchAccess`) → `{ aviso: { id, title, body, mode } | null }` — SIEMPRE el aviso del **modo `manual`**, el que dispara el boton AVISO del plan 10. Base para el plan 10: si `aviso !== null`, mostrar el boton grande en la tira de bloques del control (`TvControlPage.vue`).
- **Escritura del estado del TV (plan 10):** este plan NO agrega una ruta para ESCRIBIR `tv_class_state.screen='aviso'`/`tv_aviso_id` — eso vive en `tv/control-routes.ts` (`POST /control/state`, ya existente, D-25 lo modela como una escritura absoluta mas del control ciego). El plan 10 debe extender el body de esa ruta (o el `TvStateWrite` de `tv/types.ts`) para aceptar `screen: 'aviso'` + `tvAvisoId`, resuelto del lado del profe con el id que devuelve `/control/tv-aviso-activo`.
- **Render de la placa (plan 13):** el poll existente de `tv/control-routes.ts` (`GET /control/screen`, no tocado por este plan) es quien tiene que empezar a devolver `title`/`body` cuando `screen==='aviso'` — resolviendolos con el mismo `getActiveForBranch` de este service (o embebiendo el texto directo si `TvService.buildPollPayload` prefiere desnormalizar). Estilo de la placa (D-27): cápsula/frase Cinzel/oro sobre velo, sin imagen, ES2015-safe — mismo criterio que `tv/render.ts` (`paintCapsula`/`paintQuote`).
- **Tab admin (plan 16):** el CRUD de arriba (4 rutas `/admin/tv-avisos`) es toda la superficie que necesita el tab "Avisos en TV" de Comunicaciones — mismo patron de listado+crear+editar+borrar que la pestaña "Avisos en la app" (plan 04), sin destino/vigencia/frecuencia/metricas (D-24 los excluye a proposito).
- Deuda anotada (no bloqueante, documentada en el `<execution_context>` del plan y respetada): `tvControlRoutes` (`/api/admin/tv/*`, el control existente) sigue SIN `moduleScope` — un tenant con `templo-training` OFF pierde la pestaña Avisos en TV (404) pero conserva el control de clase en vivo. Cambiar ese gate esta fuera de alcance de la fase 193.

---

## Self-Check: PASSED

- `el-templo-api/src/modules/communications/tv-avisos-service.ts` — FOUND
- `el-templo-api/src/modules/communications/tv-avisos-routes.ts` — FOUND
- `el-templo-api/test/communications/tv-avisos.test.ts` — FOUND
- Commit `427a199f` — FOUND
- Commit `70250b82` — FOUND
- Commit `7b6d34cb` — FOUND
- `.planning/phases/193-comunicaciones/193-07-SUMMARY.md` — FOUND

_Phase: 193-comunicaciones_
_Completed: 2026-09-02_
