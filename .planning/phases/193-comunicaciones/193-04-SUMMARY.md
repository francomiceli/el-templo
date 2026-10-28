---
phase: 193-comunicaciones
plan: 04
subsystem: api
tags: [communications, avisos, fastify, drizzle, vitest, tenancy, rbac]

# Dependency graph
requires:
  - phase: 193-01
    provides: "APP_SECTIONS/validateDestination/validateWhatsAppText (destinations.ts), sales-number.ts (getSalesNumber/setSalesNumber/resolveSalesNumberForUser)"
  - phase: 193-02
    provides: "schema avisos/aviso_events/tv_avisos (gym-owned, mig 0216)"
  - phase: 193-03
    provides: "SYSTEM_AVISOS/seedSystemAvisos, migración 0217 (7 avisos de sistema por tenant)"
provides:
  - "CommunicationsService (el-templo-api/src/modules/communications/service.ts): listAvisos con métricas de socios únicos (D-17, un solo group by), createAviso/updateAviso/deleteAviso (D-08..D-15), listAvisoClickers (D-18), getSalesNumbers/setSalesNumbers (D-20)"
  - "communicationsRoutes: 7 rutas admin bajo /api/communications/admin/*, gateadas por ADMIN_ROLES (D-30), destino validado contra la lista curada (D-05)"
  - "Manifiesto fail-closed actualizado (389 -> 396 entradas) y app.ts registra communicationsRoutes como core (D-23, sin moduleScope)"
  - "Cobertura de integración (8 casos) + batería de aislamiento ISO-03 (12 casos, 404 nunca 403)"
affects: [193-07, 193-08, 193-09, 193-11, 193-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Agregado de métricas de socios únicos con UN group by (aviso_events agrupado por avisoId+eventType) mergeado en memoria — evita N+1 con N=cantidad de avisos (T-193-15)"
    - "Permisos de edición por kind/code en el service (no en el schema): allowedFieldsForSystemAviso(code) devuelve el subset editable según D-08/D-09/D-10, con BadRequestError nombrando el campo rechazado (nunca ignora en silencio)"
    - "Doble validación de destino: JSON Schema (forma) + validateDestination en el handler (T-193-11) + re-validación en el service (defense in depth, útil si el service se llama fuera de HTTP)"
    - "Lookup por PK siempre con tenantWhere antes de mutar/leer: id ajeno -> 404 NotFoundError, nunca 403 (T-175-03)"

key-files:
  created:
    - el-templo-api/src/modules/communications/service.ts
    - el-templo-api/src/modules/communications/routes.ts
    - el-templo-api/src/modules/communications/schemas.ts
    - el-templo-api/test/communications/avisos-admin.test.ts
    - el-templo-api/test/tenancy/iso-03-communications.test.ts
  modified:
    - el-templo-api/src/modules/communications/index.ts
    - el-templo-api/src/app.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts

key-decisions:
  - "Task 2 pide explícitamente que routes.ts importe y llame validateDestination (T-193-11) — se implementó en el handler de POST /admin/avisos (early-return 400 con el motivo) y el service también valida (Task 1), quedando doble capa: la ruta corta rápido con el mensaje textual, el service protege cualquier otro call site futuro."
  - "Para PUT (update), la validación de destino/frecuencia se hace en el service mergeando el input parcial con la fila existente — el route no puede pre-validar sin leer la fila primero, así que ese trabajo vive en updateAviso (no duplicado en la ruta)."
  - "D-15b (tarjeta fuerza every_open/frequencyDays:null) se aplicó también en updateAviso, no solo en createAviso como pedía literalmente el plan — evita que un PUT deje una tarjeta con frecuencia inválida (invariante de createAviso que un update podría romper)."
  - "Los avisos card_* (kind=system, sin code en la lista restringida de plan_expiry/rating_prompt/improvement_prompt) heredan el set BASE de 10 campos editables (incluye status/frequencyType/frequencyDays/sortOrder) — literal del plan, aunque D-15b diga 'tarjetas sin frecuencia'; el force de every_open solo se aplica en create/update cuando el placement resultante es 'tarjeta', así que un card_* del catálogo (que YA nace tarjeta) queda protegido por esa misma rama."

patterns-established:
  - "allowedFieldsForSystemAviso(code): tabla de permisos por code, reusable si un plan futuro agrega más avisos de sistema con reglas propias."

requirements-completed: [COM-01, COM-02]

# Metrics
duration: ~90min
completed: 2026-09-02
---

# Phase 193 Plan 04: API de avisos (CRUD + métricas + ver socios + número de ventas) Summary

**Módulo `communications` completo del lado API: `CommunicationsService` con las 7 operaciones de negocio scopeadas por tenant, 7 rutas admin gateadas por rol, manifiesto fail-closed actualizado (389→396) y 20 tests de integración/aislamiento, todos verdes.**

## Performance

- **Duration:** ~90 min
- **Tasks:** 4/4
- **Files modified:** 9 (5 nuevos + 4 modificados)

## Accomplishments

- `service.ts`: `CommunicationsService` con `listAvisos` (métricas de socios únicos D-17 sin N+1), `createAviso`/`updateAviso`/`deleteAviso` (D-08..D-15, permisos por `kind`/`code`), `listAvisoClickers` (D-18), `getSalesNumbers`/`setSalesNumbers` (D-20) — 18 `tenantWhere` en el archivo
- `routes.ts` + `schemas.ts`: 7 rutas admin bajo `/api/communications/admin/*`, gateadas por `ADMIN_ROLES`, `validateDestination` en el handler de create (T-193-11), JSON Schemas con `additionalProperties: false`
- `app.ts`: `communicationsRoutes` registrado como core (D-23, sin `moduleScope`); `tenant-manifest.ts` con las 7 entradas nuevas y la contabilidad del +7 en el header; `ENTRADAS_BASELINE` 389→396
- `avisos-admin.test.ts` (8 casos) + `iso-03-communications.test.ts` (12 casos): 20/20 verdes — destino inválido→400, avisos de sistema con reglas de edición restringidas, métricas de socios ÚNICOS, "ver socios", coach→403 en las 7 rutas, colisión de `code` de sistema entre tenants, PUT/DELETE/clickers con id ajeno→404 nunca 403, número de ventas aislado por tenant
- Verificación: `tsc --noEmit` 0, `lint:tenant` DISCREPANCIAS: 0, `iso-01-manifiesto.test.ts` 13/13, `avisos-admin.test.ts` 8/8, `iso-03-communications.test.ts` 12/12

## Task Commits

Each task was committed atomically on `feat/193-comunicaciones` en el worktree `~/projects/et-193`:

1. **Task 1: Service de avisos (CRUD + métricas + ver socios + número de ventas)** - `a13a785b` (feat)
2. **Task 2: Rutas admin + JSON schemas + validación del destino** - `ae6d1118` (feat)
3. **Task 3: Registro en app.ts + manifiesto fail-closed** - `04df302c` (feat)
4. **Task 4: Tests de integración + batería ISO de aislamiento** - `a6144cb6` (test, incluye el fix de Rule 1 descrito abajo)

**Plan metadata:** Este SUMMARY se escribe en el checkout principal sin commitear (lo commitea el orquestador). Worktree `et-193` limpio (`git status --short` vacío) al terminar.

## Files Created/Modified

- `el-templo-api/src/modules/communications/service.ts` - `CommunicationsService`: 7 métodos de negocio scopeados por tenant
- `el-templo-api/src/modules/communications/routes.ts` - `communicationsRoutes`: 7 handlers admin
- `el-templo-api/src/modules/communications/schemas.ts` - JSON Schemas de body/params/querystring/response
- `el-templo-api/src/modules/communications/index.ts` - re-exporta `CommunicationsService`/`communicationsRoutes`
- `el-templo-api/src/app.ts` - registra `communicationsRoutes` en `/api/communications` (core, D-23)
- `el-templo-api/test/tenant-manifest.ts` - 7 entradas nuevas `tenant-scoped`, contabilidad 389→396
- `el-templo-api/test/tenancy/iso-01-manifiesto.test.ts` - `ENTRADAS_BASELINE` 389→396
- `el-templo-api/test/communications/avisos-admin.test.ts` - 8 tests de integración HTTP
- `el-templo-api/test/tenancy/iso-03-communications.test.ts` - 12 tests de aislamiento por tenant

## Decisions Made

Ver `key-decisions` en el frontmatter (doble validación de destino ruta+service, forzado de `every_open` en update además de create, herencia del set BASE de permisos para `card_*`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug real] `updateAviso` calculaba `providedFields` con `Object.keys(input)` crudo, contando campos `undefined` como "provistos"**

- **Found during:** Task 4, primera corrida de `avisos-admin.test.ts`, caso (4) — un PUT que solo mandaba `title` sobre `plan_expiry` rechazaba con "El campo 'placement' no es editable para el aviso de sistema 'plan_expiry'".
- **Issue:** `routes.ts` arma el objeto que pasa a `service.updateAviso` con las 16 keys de `UpdateAvisoInput` SIEMPRE presentes (`placement: request.body.placement`, etc.) — un campo que el body HTTP no mandó llega como `input.placement === undefined`, pero la KEY `'placement'` sigue estando en el objeto. `Object.keys(input)` la devolvía igual, así que el chequeo de permisos por `kind: 'system'` rechazaba cualquier PUT que tocara SOLO un subconjunto de campos, con un mensaje sobre un campo que el caller nunca mandó.
- **Fix:** `providedFields` ahora filtra `.filter((field) => input[field] !== undefined)` antes de aplicar el chequeo de permisos — solo los campos que el HTTP body realmente mandó cuentan como "provistos".
- **Files modified:** `el-templo-api/src/modules/communications/service.ts`
- **Verification:** el caso (4) de `avisos-admin.test.ts` (PUT de solo `title` sobre `plan_expiry` → 200) pasa en verde; los 8 casos del archivo y los 12 de `iso-03-communications.test.ts` (que también hacen PUT parciales) siguen verdes.
- **Committed in:** `a6144cb6` (Task 4 commit — el fix se hizo antes de commitear, no generó un commit extra)

---

**Total deviations:** 1 auto-fijada (Rule 1, bug real encontrado por el propio test que el plan pedía escribir)
**Impact on plan:** Sin impacto en el objetivo del plan. El bug afectaba a CUALQUIER PUT parcial sobre un aviso de sistema (no solo el caso de test) — de no arreglarse, la pestaña "Avisos en la app" del admin (planes 08/09/11) hubiera fallado en el flujo más común de edición (cambiar un solo campo).

## Issues Encountered

Ninguno bloqueante. Los 4 archivos de test corridos en foreground con `timeout: 580000` en la herramienta Bash y `--hookTimeout=300000` en vitest — cada corrida tardó entre 60s y 100s (provisión del DB de test), dentro de lo esperado según las reglas duras del prompt.

Un detalle de tipos de Fastify v5 (no bug de negocio): el handler `GET /admin/sales-number`, al declararse `fastify.get(...)` SIN generic de `RouteGenericInterface` pero CON `schema.response` explícito, hacía que TypeScript infiriera el `Reply` estrictamente contra las claves de `response` (solo `200`), rompiendo el `reply.code(403).send({error})` del gate de rol. Se resolvió pasando un generic mínimo (`fastify.get<{ Querystring: Record<string, never> }>`) — mismo patrón que ya usan los otros 6 handlers del archivo, que sí declaran su `RouteGenericInterface`. No es una desviación de alcance, solo un detalle de tipado del framework.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `CommunicationsService`, `communicationsRoutes` y las 7 rutas admin quedan listas como la superficie que consume la pestaña "Avisos en la app" del admin (planes 08/09/11, según `193-PATTERNS.md`) y cualquier plan que necesite editar el número de ventas por país.
- Nada bloquea el plan 05: worktree limpio, `feat/193-comunicaciones` con 13 commits nuevos sobre `origin/master` `7c273a15` (3 de la 01 + 3 de la 02 + 3 de la 03 + 4 de esta).
- Deuda anotada (no bloqueante): el endpoint "qué pop-up toca hoy" (D-06/D-07, orquesta prioridad vencimiento>aviso>calificación>mejora) NO está en este plan — es responsabilidad de un plan posterior según el mapa de patrones (`getPendingRating`/`getPromptStatus` son los precedentes de forma). `listAvisos`/`createAviso`/`updateAviso` no filtran por alcance (sede/país/segmento, D-13) todavía en el service — el schema de `avisos` ya tiene las columnas (`scopeBranchIds`/`scopeCountries`/`scopeSegments`) y el CRUD las persiste, pero ningún endpoint de MIEMBRO las resuelve aún (correcto: ese filtrado es del endpoint D-07, fuera de este plan).
- Nota para el plan que construya el editor admin: `allowedFieldsForSystemAviso` en `service.ts` es la fuente de verdad de qué campos son editables por `code` — el frontend debería reflejar el mismo subset (deshabilitar los campos no editables) para no depender solo del 400 del backend.

---

## Self-Check: PASSED

- `el-templo-api/src/modules/communications/service.ts` — FOUND
- `el-templo-api/src/modules/communications/routes.ts` — FOUND
- `el-templo-api/src/modules/communications/schemas.ts` — FOUND
- `el-templo-api/test/communications/avisos-admin.test.ts` — FOUND
- `el-templo-api/test/tenancy/iso-03-communications.test.ts` — FOUND
- Commit `a13a785b` — FOUND
- Commit `ae6d1118` — FOUND
- Commit `04df302c` — FOUND
- Commit `a6144cb6` — FOUND
- `.planning/phases/193-comunicaciones/193-04-SUMMARY.md` — FOUND

_Phase: 193-comunicaciones_
_Completed: 2026-09-02_
