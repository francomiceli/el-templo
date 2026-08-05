---
phase: 169-capa-de-escritura-helpers-tenantwhere-tenantvalues-y-tenantc
verified: 2026-07-28T16:58:28Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 169: Capa de escritura — helpers `tenantWhere`/`tenantValues` y `TenantContext` Verification Report

**Phase Goal:** Existe **una sola forma** de leer y escribir con tenant, y funciona igual con o
sin request. `shared/tenant.ts` expone los helpers que toman el tenant del scope, y los caminos
que nacen fuera de un request (crons, webhook de Wellhub, scripts CLI) construyen un
`TenantContext` explícito estructuralmente compatible con el scope. End state: no queda ningún
camino de escritura sobre tabla gym-owned que dependa de que alguien "se acuerde" del tenant, ni
ninguno que lo pueda tomar de un payload.

**Verified:** 2026-07-28T16:58:28Z
**Status:** passed
**Re-verification:** No — initial verification

## Nota metodológica

Verificación hecha contra el worktree de código real `/home/franco/projects/et-169-tenant-layer`
(rama `feat/169-capa-escritura`, HEAD `a70ee297`), no contra el checkout principal (que está 244
commits atrás en otra rama). Se confirmó independientemente, sin confiar en la narrativa de los
SUMMARY, que:

- `origin/master` en el remoto ya apunta a `a70ee297` (el rollout llegó a producción de verdad,
  no es una afirmación sin corroborar).
- Los 4 runs de CI/CD citados en el 169-09-SUMMARY (`30376973958`, `30376974103`, `30378346752`,
  `30378346443`) se re-consultaron por la API pública de GitHub Actions (sin `gh`, sin
  credenciales) y los cuatro devuelven `conclusion: success` con el `head_sha` exacto que el
  summary declara (`7c15f428` en staging, `a70ee297` en master).
- `https://api.eltemplo.org/health` responde `{"status":"ok"}` en vivo.

No se corrió la suite de tests (instrucción explícita) ni se modificó ningún archivo de código.
Toda verificación de artefactos fue por lectura de código y grep contra el worktree.

## Goal Achievement

### Observable Truths (5 criterios de éxito del ROADMAP)

| #   | Truth                                                                                                                                                                                                     | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `tenantWhere`/`tenantValues` viven en `shared/tenant.ts` y aceptan indistintamente scope de request y `TenantContext`, cubiertos por tests unitarios (CON-03)                                             | ✓ VERIFIED | `el-templo-api/src/modules/shared/tenant.ts` (277 líneas): exporta `tenantWhere` (L149), `tenantValues` (L170), `assertTenant` (L192), `listActiveTenants` (L220), `forEachActiveTenant` (L248), `TenantId`, `TenantContext`, `TenantLogger`, `TenantSweepResult`, `TENANT_UNRESOLVED`. Firma de `tenantWhere`/`tenantValues` toma `scope: { tenantId: TenantId }`, estructuralmente compatible con `CountryScope` (narrowed por `assertTenant`) y con un `TenantContext` plano — es la misma API para los dos casos. `test/tenancy/tenant-helpers.test.ts` (442 líneas) cubre los 5 exports contra MySQL real con un segundo tenant ad-hoc (90169)                                                                                                                                                                                                                                                                                                         |
| 2   | Un test manda `tenantId: 2` en el body de rutas de escritura y la fila nace igual con `tenant_id = 1` (CON-03)                                                                                            | ✓ VERIFIED | `test/tenancy/con-03-write-paths-tenant-id.test.ts` (712 líneas): batería D-09, 5 rutas × 2 casos (spoofeado + control) contra `POST /api/admin/members`, `.../members/trial`, `.../finance/transactions`, `.../subscriptions/.../assign`, `POST /api/members/scheduling/reserve`, con SELECT directo por `tenant_id` sobre la fila creada y un gimnasio spoofeado que existe de verdad (90369, FK real). Guard separado por `import` de los 6 body-schemas de D-08 con `additionalProperties: false` — verificado en código: `createMemberSchema.body.additionalProperties: false` (`members/schemas.ts:497`), `createProductSchema` exportado (`gladius/routes.ts:66`), `finance/schemas.ts` y `campaigns/schemas.ts` con `additionalProperties: false` en la raíz del body                                                                                                                                                                               |
| 3   | Los crons iteran tenants **activos** y corren el job con un `TenantContext` por tenant; un tenant suspendido no se procesa (CON-04)                                                                       | ✓ VERIFIED | Los 7 jobs de `src/jobs/` (`auto-approve.ts`, `auto-resume-pauses.ts`, `expire-lost-leads.ts`, `mark-no-shows.ts`, `notification-cron.ts`, `reassign-multibranch.ts`, `wellhub-sync.ts`) contienen `forEachActiveTenant` fuera de comentarios (verificado con grep, conteos 3/4/3/3/9/3/4). `listActiveTenants` filtra por `WHERE status = 'active'` contra MySQL real, no data hardcodeada. `test/tenancy/con-04-crons-per-tenant.test.ts` (374 líneas) prueba el criterio 3 sobre `auto-approve` real: 2 tenants activos = 2 vueltas, `suspended`/`archived` = 1 vuelta, aislamiento de error por tenant. Incluye gate fail-closed: inventario exacto de `src/jobs/` + assert de que todo archivo con `cron.schedule` llama a `forEachActiveTenant` salvo exención declarada con motivo                                                                                                                                                                   |
| 4   | El webhook de Wellhub deriva el tenant vía `payload.gym.id` → `branches.wellhub_gym_id` → `branches.tenant_id` y falla cerrado; los scripts CLI exigen el tenant como argumento y abortan sin él (CON-04) | ✓ VERIFIED | `src/modules/wellhub/service.ts`: `resolverTenant` privado con unión discriminada, corte `tenant_no_resoluble` (200 skipped, log.error) y `tenant_no_activo` (200 skipped, log.warn) antes de `findOrCreateVisitor` en los dos caminos que crean datos; `gym_sin_sede` (D-04) intacto. `test/wellhub/webhook-tenant-derivation.test.ts` (525 líneas, 7 tests) contra MySQL real con tenant ad-hoc 90469. CLI: `src/db/scripts/require-tenant.ts` (226 líneas) exporta `TenantArgError` con `exitCode = 2`, `parseTenantArg`, `requireTenant` (valida existencia contra `tenants` antes de escribir), `failTenantArg`. `test/unit/require-tenant.test.ts` (236 líneas, 16 tests, sin DB). `scripts/seed-onboarding-aura.ts` retrofitteado como ejemplar (`requireTenant` antes de la primera query, `tenantWhere`+`tenantValues`). 3 corridas manuales documentadas en el SUMMARY (exit 2 sin flag, exit 2 con tenant inexistente, exit 0 con tenant válido) |
| 5   | La excepción de `tv_pairings` pre-claim queda anotada `/* tenant-safe: pairing pre-claim */` y el claim con scope de staff estampa el `tenant_id` (test del ciclo completo) (CON-04)                      | ✓ VERIFIED | `src/modules/tv/pairing.ts:145`: `.insert(schema.tvPairings) /* tenant-safe: pairing pre-claim */` con docblock de motivo (L118-134). `claim(ctx, ...)` usa `tenantValues(ctx, {...})` (L194); `consume()` propaga el tenant de la fila de pairing ya reclamada a `tv_devices` vía `tenantValues` (L298). `control-routes.ts` pasa `assertTenant(request.scope, ...)` al claim. `tvPairClaimSchema.body` con `additionalProperties: false`. `test/tv/tv-pairing-tenant.test.ts` (437 líneas, 6 tests) prueba el ciclo start→claim→consume con un gimnasio ad-hoc (90569, distinto de 1 para no confundirse con el DEFAULT) y un spoof de `tenantId` en el body del claim que no cambia la columna                                                                                                                                                                                                                                                           |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact                                                          | Expected                                                                                       | Status     | Details                                                                               |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| `el-templo-api/src/modules/shared/tenant.ts`                      | tenantWhere, tenantValues, assertTenant, TenantContext, listActiveTenants, forEachActiveTenant | ✓ VERIFIED | 277 líneas, todos los exports presentes y con las firmas declaradas                   |
| `el-templo-api/test/tenancy/tenant-helpers.test.ts`               | Cobertura unitaria de los 5 exports                                                            | ✓ VERIFIED | 442 líneas                                                                            |
| `el-templo-api/src/jobs/*.ts` (7 archivos)                        | Sweep por tenant activo en los 7 crons                                                         | ✓ VERIFIED | `forEachActiveTenant` presente en los 7, fuera de comentarios                         |
| `el-templo-api/test/tenancy/con-04-crons-per-tenant.test.ts`      | Criterio 3 sobre crons reales + gate fail-closed de cobertura                                  | ✓ VERIFIED | 374 líneas                                                                            |
| `el-templo-api/src/modules/wellhub/service.ts`                    | Derivación del tenant + corte + estampado de wellhub_events                                    | ✓ VERIFIED | `resolverTenant`, `tenant_no_activo`, `tenant_no_resoluble`, `gym_sin_sede` presentes |
| `el-templo-api/test/wellhub/webhook-tenant-derivation.test.ts`    | Cobertura D-04/D-05/estampado                                                                  | ✓ VERIFIED | 525 líneas                                                                            |
| `el-templo-api/src/modules/tv/pairing.ts`                         | Exención anotada + estampado en claim/consume                                                  | ✓ VERIFIED | Anotación L145, `tenantValues` en claim y consume                                     |
| `el-templo-api/test/tv/tv-pairing-tenant.test.ts`                 | Ciclo start→claim→consume                                                                      | ✓ VERIFIED | 437 líneas                                                                            |
| `el-templo-api/src/db/scripts/require-tenant.ts`                  | Helper `--tenant` obligatorio                                                                  | ✓ VERIFIED | 226 líneas, exports exactos                                                           |
| `el-templo-api/test/unit/require-tenant.test.ts`                  | Cobertura del parser sin DB                                                                    | ✓ VERIFIED | 236 líneas                                                                            |
| `el-templo-api/test/tenancy/con-03-write-paths-tenant-id.test.ts` | Batería D-09 + guard de 6 body-schemas                                                         | ✓ VERIFIED | 712 líneas                                                                            |

### Key Link Verification

| From                              | To                                                         | Via                                                                                    | Status  | Details                                                           |
| --------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------- |
| `tenant.ts` (`assertTenant`)      | `country-scope.ts` (`CountryScope.tenantId: number\|null`) | narrowing fail-closed a 403 `TENANT_UNRESOLVED`                                        | ✓ WIRED | Verificado en el archivo (L192+)                                  |
| `tenant.ts` (`listActiveTenants`) | tabla `tenants`                                            | `SELECT id FROM tenants WHERE status='active'`                                         | ✓ WIRED | Query real contra Drizzle, no lista hardcodeada                   |
| `src/jobs/*.ts`                   | `tenant.ts`                                                | `import { forEachActiveTenant, ... } from "../modules/shared/tenant"`                  | ✓ WIRED | Presente en los 7 jobs                                            |
| `wellhub/service.ts`              | `branches`/`tenants`                                       | `leftJoin` en `findBranchByGymId`/`findPublishedSlot` sobre `schema.branches.tenantId` | ✓ WIRED | 2 ocurrencias fuera de comentarios                                |
| `tv/control-routes.ts`            | `tv/pairing.ts` (`claim`)                                  | `assertTenant(request.scope, ...)` como primer argumento                               | ✓ WIRED | Verificado en el código                                           |
| `scripts/seed-onboarding-aura.ts` | `require-tenant.ts`                                        | `requireTenant(queryFnFromConnection(connection))` antes de la primera query           | ✓ WIRED | Verificado en el código y en las 3 corridas manuales documentadas |

### Data-Flow Trace (Level 4)

| Artifact                     | Data Variable                        | Source                                                                                 | Produces Real Data | Status    |
| ---------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------- | ------------------ | --------- |
| `forEachActiveTenant`        | `tenants` (lista de `TenantContext`) | `listActiveTenants` → `db.select(...).from(schema.tenants).where(eq(status,'active'))` | Sí                 | ✓ FLOWING |
| `resolverTenant` (wellhub)   | `tenantStatus`                       | `leftJoin(tenants)` sobre `branches.tenantId` real                                     | Sí                 | ✓ FLOWING |
| `requireTenant` (CLI)        | `tenantId`                           | `SELECT id, status FROM tenants WHERE id = ?` vía `TenantQueryFn` inyectada            | Sí                 | ✓ FLOWING |
| `TvPairingService.consume()` | `pairing.tenantId`                   | `SELECT tenantId FROM tv_pairings WHERE ...` (fila ya reclamada)                       | Sí                 | ✓ FLOWING |

### Probe Execution / Behavioral Spot-Checks

No hay probes formales (`scripts/*/tests/probe-*.sh`) declarados por esta fase. En su lugar se
verificó, de forma independiente y sin confiar en la narrativa del summary, el rollout real:

| Check                                    | Command                                | Result                                         | Status |
| ---------------------------------------- | -------------------------------------- | ---------------------------------------------- | ------ |
| `origin/master` apunta al SHA de la fase | `git log origin/master -1` (worktree)  | `a70ee297`                                     | ✓ PASS |
| Health check de producción               | `curl https://api.eltemplo.org/health` | `{"status":"ok",...}`                          | ✓ PASS |
| CI run A (staging)                       | GitHub Actions API `run/30376973958`   | `conclusion: success`, `head_sha: 7c15f428...` | ✓ PASS |
| Deploy Staging                           | GitHub Actions API `run/30376974103`   | `conclusion: success`, mismo SHA               | ✓ PASS |
| CI run B (master)                        | GitHub Actions API `run/30378346752`   | `conclusion: success`, `head_sha: a70ee297...` | ✓ PASS |
| Deploy master (prod)                     | GitHub Actions API `run/30378346443`   | `conclusion: success`, mismo SHA               | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan             | Description                                                                                                                                           | Status      | Evidence                                                                                                                                                                                                                                                                                                                                             |
| ----------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CON-03      | 169-01, 169-08, 169-09  | Helpers `tenantWhere`/`tenantValues` en `shared/tenant.ts`; todo INSERT sobre gym-owned toma `tenant_id` exclusivamente de scope/contexto server-side | ✓ SATISFIED | Truths 1 y 2 verificados. La auditoría D-08 encontró y cerró el único agujero real (`createMemberSchema` sin `additionalProperties: false`) y lo probó con guard fail-closed + batería de 5 rutas × 2. `REQUIREMENTS.md` todavía lo lista como `Pending` — el rollout ya cerró (prod verde, CI verde por API), corresponde actualizarlo a `Complete` |
| CON-04      | 169-01 a 169-07, 169-09 | `TenantContext` explícito para caminos sin request: crons, webhook Wellhub, CLI, `tv_pairings` con exención anotada                                   | ✓ SATISFIED | Truths 3, 4 y 5 verificados: los 7 crons, el webhook, el CLI y `tv_pairings` cubren las 4 superficies sin request declaradas en el criterio. `REQUIREMENTS.md` todavía lo lista como `Pending` — corresponde actualizarlo a `Complete`                                                                                                               |

**Nota:** los SUMMARYs 01-08 dejaron CON-03/CON-04 deliberadamente en `Pending` hasta que el gate
consolidado del plan 09 pudiera afirmar los 5 criterios juntos — decisión correcta para evitar
falsos positivos intermedios. El 169-09-SUMMARY documenta ese gate (mapa criterio→evidencia,
inventario de exenciones, 120/120 tests verdes, 4 runs de CI/CD verdes) y el rollout llegó a
producción. Esta verificación confirmó independientemente esa evidencia contra el código y
contra la API pública de GitHub Actions, no solo contra la narrativa del summary. **Con la fase
ya en producción y verificada, no hay razón para seguir dejando CON-03/CON-04 en Pending** — se
recomienda que el orquestador actualice `REQUIREMENTS.md` a `Complete` para las dos filas.

No hay requisitos huérfanos: el ROADMAP asigna únicamente CON-03 y CON-04 a la fase 169, y los 9
planes cubren exactamente esos dos IDs entre `requirements:` de su frontmatter.

### Anti-Patterns Found

Ninguno bloqueante. Se escaneall los 30 archivos del diff de la fase (`git diff 1200b8af...a70ee297`):

- `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`: 0 marcadores de deuda reales. Todas las
  coincidencias de la palabra "TODO" son la palabra española "todos/todo" (p.ej. "para TODOS
  los gimnasios activos"), no el marcador en inglés.
- `any` explícito: 0 ocurrencias en los 30 archivos (grep dedicado).
- `console.log/warn/error`: presentes solo en scripts CLI standalone pre-existentes
  (`seed.ts`, `seed-spom.ts`, `run-migrations.ts`, `verify-tenant-*.ts`) y en el nuevo
  `require-tenant.ts` — consistente con el patrón ya establecido en esos mismos archivos antes
  de la fase (verificado que ninguna línea de `console.*` es nueva en el diff de esos archivos
  pre-existentes). La regla de CLAUDE.md sobre logging estructurado aplica a rutas/servicios
  del API corriendo con Fastify (`request.log`/`app.log`); estos son scripts CLI de
  provisioning/verificación fuera del server, no violan el patrón — informativo, no bloqueante.
- Cero migraciones nuevas: confirmado, el `.sql` de mayor número en el worktree sigue siendo
  `0196_tenant_unique_contracts.sql` y el diff de la fase no toca `src/db/migrations/`.

### Human Verification Required

Ninguno. La fase es 100% backend/plumbing sin superficie visual nueva, y el rollout
staging→prod ya pasó por dos checkpoints humanos explícitos de Franco (`aprobado staging`,
`aprobado prod`) más un smoke E2E adicional por navegador pedido por él mismo (login admin →
alta de socio asistida → verificación en DB + spoof de `tenantId: 999` por HTTP real ignorado).
No queda ningún ítem de comportamiento visual, real-time o de integración externa pendiente de
verificación humana para esta fase.

### Gaps Summary

Sin gaps. Los 5 criterios de éxito del ROADMAP están verificados contra el código real del
worktree (no solo contra la narrativa de los SUMMARYs), los 9 planes están completos y
commiteados, el gate consolidado del plan 09 corrió y sus resultados (SHAs, runs de CI, inventario
de exenciones) se corroboraron de forma independiente contra la API pública de GitHub y contra
`origin/master`. El único hallazgo es administrativo, no de código: `REQUIREMENTS.md` sigue
marcando CON-03/CON-04 como `Pending` pese a que la fase ya cerró en producción — se recomienda
que el orquestador lo actualice a `Complete`.

---

_Verified: 2026-07-28T16:58:28Z_
_Verifier: Claude (gsd-verifier)_
