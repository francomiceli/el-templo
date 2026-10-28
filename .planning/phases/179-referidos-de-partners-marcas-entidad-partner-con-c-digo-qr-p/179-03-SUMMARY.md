---
phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p
plan: 03
subsystem: api
tags: [fastify, rbac, tenancy, referrals, partners, admin-routes]

# Dependency graph
requires:
  - phase: 179-02
    provides: "PartnerReferralService (CRUD tenancy-native) + resolveSignupCode + fixtures del módulo"
provides:
  - "4 rutas admin CRUD de referral_partners bajo /api/admin/referral-partners, gateadas por MEMBER_LIFECYCLE_ROLES (owner/admin/gestion), con el tenant siempre resuelto desde assertTenant(request.scope)"
  - "Gate ISO-01 (manifiesto de tenancy) verde con las 4 rutas nuevas clasificadas tenant-scoped sin comodines, ENTRADAS_BASELINE en 374"
  - "Fix de robustez en PartnerReferralService.updatePartner: un PATCH sin campos editables ahora es 400 explícito en vez de un error de sintaxis SQL (500)"
affects: [179-04, 179-05, 179-06, 179-07, 179-08, 179-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Guard de plugin calcado de improvement-proposals/routes.ts: onRequest hace authenticate + chequeo de MEMBER_LIFECYCLE_ROLES + attachCountryScope, en ese orden"
    - 'Cada handler arma su propio ctx con assertTenant(request.scope, "referralPartners.<acción>") — el tenant nunca sale del body (T-179-11)'
    - "additionalProperties: false en los 4 schemas NO produce un 400 en este codebase: Fastify compila ajv con removeAdditional: true por default (documentado ya en members/schemas.ts) y strippea la propiedad desconocida en silencio. El test de mass-assignment verifica el efecto real (tenantId spoofeado sin efecto), no un statusCode inexistente"
    - "El schema de PATCH no lista code/currency en absoluto (en vez de listarlos y rechazarlos): la ausencia + el strip silencioso es la forma de hacerlos no-editables sin una rama de validación aparte"

key-files:
  created:
    - el-templo-api/src/modules/referral-partners/schemas.ts
    - el-templo-api/src/modules/referral-partners/admin-routes.ts
    - el-templo-api/test/referral-partners/partner-crud.test.ts
  modified:
    - el-templo-api/src/modules/referral-partners/index.ts
    - el-templo-api/src/app.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/src/modules/referral-partners/service.ts

key-decisions:
  - "PATCH /:id no lista `code` ni `currency` en su schema (en vez de listarlos con additionalProperties:false esperando un 400): como Fastify strippea en silencio (removeAdditional default), un PATCH con SOLO `code` termina sin campos editables — el service ahora rechaza ese caso con 400 explícito (ver Deviations, Rule 1)"
  - "El rol usado en los tests de RBAC 403 es 'coach' (valor real del enum roleEnum en users.ts), no 'profesor' como lo nombraba el plan coloquialmente — 'profesor' no es un valor válido del enum y hubiera fallado el fixture de creación de usuario"
  - "El caso de aislamiento cross-tenant (D-20, GET / no devuelve partners de otro gimnasio) usa el fixture canónico seedSecondTenant/limpiarSegundoGimnasio/TENANT_DOS de test/fixtures/second-tenant.ts en vez de un INSERT crudo con tenant_id=2 a mano — mismo criterio ya adoptado por 179-02, evita violar la FK a tenants"

requirements-completed: [D-03, D-13, D-20]

# Metrics
duration: ~50min
completed: 2026-08-23
---

# Phase 179 Plan 03: CRUD admin de partners (rutas, RBAC, tenancy) Summary

**4 rutas admin (GET /, GET /:id, POST /, PATCH /:id) bajo `/api/admin/referral-partners`, gateadas por `MEMBER_LIFECYCLE_ROLES` con tenant siempre resuelto server-side, manifiesto ISO-01 actualizado a 374 entradas, y un fix de robustez en el service (PATCH vacío ya no tira 500).**

## Performance

- **Duration:** ~50 min
- **Tasks:** 3/3
- **Files modified:** 8 (3 nuevos, 5 modificados)

## Accomplishments

- `schemas.ts` con los 4 JSON Schemas Fastify (create/update/get/list), todos con `additionalProperties: false`; `update` excluye `code`/`currency` del todo (no listados, no editables)
- `admin-routes.ts`: plugin admin con guard `authenticate` + `MEMBER_LIFECYCLE_ROLES` + `attachCountryScope`, las 4 rutas con `assertTenant(request.scope, "referralPartners.<acción>")` y `handleServiceError` en el catch, registrado en `app.ts` con prefix `/api/admin/referral-partners`
- Manifiesto de tenancy (`test/tenant-manifest.ts`) con las 4 entradas nuevas `tenant-scoped` sin comodines; `ENTRADAS_BASELINE` en `test/tenancy/iso-01-manifiesto.test.ts` movido de 370 a **374**, con la entrada de historial correspondiente (2026-08-23, fase 179 plan 03) y el título del `it` sincronizado
- `partner-crud.test.ts`: 15 tests de integración HTTP (`app.inject`) contra MySQL real — happy path AR/ES, los 3 conflictos 409 de D-03, `benefitValue` fuera de rango (400), mass-assignment de `tenantId` sin efecto, RBAC 403 (coach) / 401 (sin token) en las 4 rutas, código inmutable, aislamiento de tenant en `GET /`
- Fix de robustez (Rule 1) en `PartnerReferralService.updatePartner`: un PATCH con `{}` de campos editables (típicamente porque el único campo enviado fue `code`, strippeado en silencio por Fastify) ahora lanza `BadRequestError` (400) antes de tocar la DB, en vez de un `UPDATE ... SET WHERE ...` sin columnas que MySQL rechazaba con error de sintaxis (500)
- `tsc --noEmit` en 0, `pnpm lint:tenant` en 0 discrepancias sin ampliar el allowlist, 47/47 tests verdes (`test/referral-partners` completo + `iso-01-manifiesto.test.ts`)

## Task Commits

Cada task se commiteó atómicamente en el worktree `et-179` (rama `feat/179-referidos-partners`):

1. **Task 1: schemas.ts + admin-routes.ts con guard de roles, registro en app.ts** - `5f39266f` (feat)
2. **Task 2: 4 rutas en el manifiesto de tenancy + bump ENTRADAS_BASELINE 370→374** - `2a93380d` (test)
3. **Task 3: partner-crud.test.ts (15 tests) + fix de PATCH vacío en el service** - `c4ee29c0` (test)

_Nota: el commit de metadatos de docs (STATE/ROADMAP/SUMMARY) lo maneja el orquestador, no este ejecutor._

## Files Created/Modified

- `el-templo-api/src/modules/referral-partners/schemas.ts` - 4 JSON Schemas Fastify (`createPartnerBodySchema`, `updatePartnerBodySchema`, `getPartnerParamsSchema`, `listPartnersQuerySchema`)
- `el-templo-api/src/modules/referral-partners/admin-routes.ts` - `referralPartnersAdminRoutes` (FastifyPluginAsync), guard de rol + 4 rutas
- `el-templo-api/src/modules/referral-partners/index.ts` - agrega el export del plugin admin
- `el-templo-api/src/modules/referral-partners/service.ts` - fix: `updatePartner` rechaza con 400 un PATCH sin campos editables
- `el-templo-api/src/app.ts` - registra `referralPartnersAdminRoutes` con prefix `/api/admin/referral-partners`
- `el-templo-api/test/tenant-manifest.ts` - 4 entradas nuevas `tenant-scoped`
- `el-templo-api/test/tenancy/iso-01-manifiesto.test.ts` - `ENTRADAS_BASELINE` 370→374, título del `it`, entrada de historial
- `el-templo-api/test/referral-partners/partner-crud.test.ts` - 15 tests de integración HTTP

## Rutas expuestas (para el admin, D-20)

Todas bajo `/api/admin/referral-partners`, solo `MEMBER_LIFECYCLE_ROLES` (owner/admin/gestion):

```
GET   /api/admin/referral-partners            → listPartners (filtros: branchId?, isActive?)
GET   /api/admin/referral-partners/:id        → getPartner
POST  /api/admin/referral-partners            → createPartner, responde 201 { id }
PATCH /api/admin/referral-partners/:id        → updatePartner, responde 200 { ok: true }
```

`ENTRADAS_BASELINE` final: **374** (era 370 al 2026-08-22, confirmado vigente al momento de ejecutar este plan).

## Decisions Made

Ver `key-decisions` en el frontmatter. La más relevante para el consumidor del admin (179-04+ / frontend): **`code` y `currency` no aparecen en absoluto en el schema de PATCH** — un cliente que intente enviarlos junto con otros campos legítimos los pierde en silencio (comportamiento estándar de Fastify en este repo, no un bug), y un cliente que envíe SOLO `code` recibe 400 con mensaje explícito ("No hay campos editables...").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `updatePartner` con PATCH vacío tiraba 500 en vez de 400**

- **Found during:** Task 3, al escribir el test "cambiar `code` es rechazado por el schema"
- **Issue:** El schema de PATCH no lista `code` en `properties`, así que Fastify lo strippea en silencio (`removeAdditional: true` default — mismo comportamiento ya documentado en `members/schemas.ts` para `updateLeadSchema`/`createMemberSchema`). Un PATCH que solo trae `code` llega al service como `{}`. `updatePartner` (179-02) armaba el objeto de `.set()` inline dentro de la llamada a `.update()`, sin chequear si quedaba vacío — Drizzle genera `UPDATE referral_partners SET WHERE ...` sin columnas, que MySQL rechaza con error de sintaxis (500 sin manejar).
- **Fix:** Se extrajo el objeto `fields` a una variable antes del `.update()`, y se agregó un guard: si `Object.keys(fields).length === 0`, lanza `BadRequestError("No hay campos editables en la solicitud...")` — que `handleServiceError` traduce a 400.
- **Files modified:** `el-templo-api/src/modules/referral-partners/service.ts`
- **Commit:** `c4ee29c0`

**2. [Rule 1 - Bug menor de test] Rol "profesor" del plan no es un valor válido del enum**

- **Found during:** Task 3, al armar el fixture del test de RBAC
- **Issue:** El plan (y el CONTEXT) usan "profesor" coloquialmente para el rol excluido de `MEMBER_LIFECYCLE_ROLES`, pero `roleEnum` en `src/db/schema/users.ts` no tiene ese valor — el valor real es `"coach"`. Usar `"profesor"` hubiera fallado el `INSERT` del fixture (violación de enum) antes de llegar a probar nada de RBAC.
- **Fix:** Los tests de RBAC usan `role: "coach"` (mismo patrón que `test/finance/coach-load.test.ts` y una decena de archivos más del repo).
- **Files modified:** `el-templo-api/test/referral-partners/partner-crud.test.ts` (nunca llegó a existir con el valor incorrecto — se detectó al leer el enum antes de escribir el test)
- **Commit:** `c4ee29c0`

### Otras desviaciones documentadas (no bugs, ajustes de expectativa)

**3. El acceptance criterion "propiedad extra → 400" del plan no coincide con el comportamiento real de Fastify en este repo.** `additionalProperties: false` + el default `removeAdditional: true` de ajv strippea la propiedad en silencio, NO produce un 400 (comportamiento ya documentado explícitamente en `members/schemas.ts` para dos schemas existentes, así que no es un caso aislado del módulo de partners). El test se reescribió para verificar lo que realmente importa para T-179-11: un `tenantId` spoofeado en el body no tiene ningún efecto — el partner se crea con el tenant real del scope. Ver `key-decisions`.

## Issues Encountered

Ninguno más allá de lo documentado arriba en Deviations. `pnpm lint:tenant` y `tsc --noEmit` quedaron en verde en las 3 tasks sin necesitar iteración adicional.

## User Setup Required

None - no requiere configuración de servicios externos.

## Next Phase Readiness

- Las 4 rutas admin quedan listas para que el frontend (`el-templo-admin`, página `/partners` de D-20) haga el CRUD completo sin reimplementar validación ni tenancy.
- El fix de `updatePartner` (PATCH vacío → 400) es transparente para cualquier consumidor legítimo: un PATCH que edite al menos un campo real sigue funcionando exactamente igual que antes.
- Los planes 179-04 en adelante (atribución en registro, semana gratis, comisiones, liquidación) pueden asumir que el CRUD admin de partners está completo, testeado y con el gate ISO-01 en verde.
- Sin bloqueos.

---

_Phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p_
_Completed: 2026-08-23_

## Self-Check: PASSED

- FOUND: `el-templo-api/src/modules/referral-partners/schemas.ts`
- FOUND: `el-templo-api/src/modules/referral-partners/admin-routes.ts`
- FOUND: `el-templo-api/test/referral-partners/partner-crud.test.ts`
- FOUND: commit `5f39266f` (Task 1)
- FOUND: commit `2a93380d` (Task 2)
- FOUND: commit `c4ee29c0` (Task 3)
- `git -C /home/franco/projects/et-179 status --porcelain` limpio
- `.planning/STATE.md` y `.planning/ROADMAP.md` sin tocar
