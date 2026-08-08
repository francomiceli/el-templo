---
phase: 166-fundaci-n-tenants-anclas-y-scope-server-side
verified: 2026-07-27T02:00:00Z
status: human_needed
score: 8/8 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Smoke funcional por UI en el admin de staging (eltemplo_staging): listado de socios, carga de un cobro, pantalla de reservas"
    expected: "Las tres pantallas funcionan exactamente igual que antes de la fase 166 — ninguna debe mostrar un 403 nuevo"
    why_human: "Requiere navegación visual real en el admin desplegado; no verificable por grep/tsc. El pipeline de deploy ya corrió su propio smoke automatizado (step 19, success) pero eso no cubre la UX real que un 403 nuevo podría romper de forma sutil"
  - test: "Smoke funcional por UI en la member app de staging: que un socio vea sus planes y turnos"
    expected: "La pantalla de planes/turnos responde igual que antes, sin 403 nuevo"
    why_human: "Mismo motivo — superficie de socio, requiere UAT visual"
  - test: "Repetir ambos smokes anteriores contra producción (eltemplo, admin.eltemplo.org / app member prod)"
    expected: "Mismo resultado que en staging: sin 403 nuevos, comportamiento idéntico al pre-fase"
    why_human: "El SUMMARY 166-06 declara explícitamente este smoke como PENDIENTE de UAT de Franco en las dos bases — no se puede dar por hecho ni inferir del smoke automatizado del pipeline"
---

# Phase 166: Fundación — tenants, anclas y scope server-side — Verification Report

**Phase Goal:** El sistema conoce el concepto de tenant y lo resuelve solo. Existen `tenants` y `tenant_settings` con El Templo sembrado como tenant 1, las dos anclas del modelo (`users`, `branches`) llevan `tenant_id NOT NULL` con FK e índice, y todo request autenticado tiene `scope.tenantId` resuelto server-side en la misma query que hoy resuelve el scope de país, con enforcement del estado del tenant. End state: el scope queda disponible para todo lo que sigue y el staff del Templo no percibe ningún cambio.

**Verified:** 2026-07-27T02:00:00Z
**Status:** human_needed
**Re-verification:** No — verificación inicial

**Nota sobre dónde vive el código:** todo el código de la fase se verificó en el worktree `/home/franco/projects/et-166-tenancy` (rama `feat/166-tenancy-fundacion`), que a la fecha de esta verificación es idéntica a `origin/master` (`e6cab5f6`) — el rollout a producción ya ocurrió. El checkout principal `/home/franco/projects/el-templo` no participa del código de esta fase.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria + PLAN must_haves fusionados)

| #   | Truth                                                                                                                                                                               | Status                              | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `tenants` tiene exactamente 1 fila (`id=1, el-templo, active`) y `tenant_settings` existe, con `users`/`branches` al 100% en `tenant_id=1`, `NOT NULL`+FK+índice (FUND-01, FUND-02) | ✓ VERIFIED                          | Verificado en DB local (`eltemplo`): `tenants` → `1  el-templo  active`, `COUNT(*)=1`; `users`/`branches` con 0 filas fuera de `tenant_id=1`; `_migrations` con `0190_tenants_core.sql` y `0191_tenant_anchors.sql`. `0190_tenants_core.sql` y `0191_tenant_anchors.sql` existen byte a byte en `origin/master` Y en `origin/staging` (`git ls-tree` verificado). CI runs 30224509617 (staging) y 30227344068/30227344065 (prod) confirmados `success` por consulta directa a la API pública de GitHub (no solo lectura del SUMMARY) |
| 2   | Todo request autenticado expone `scope.tenantId` resuelto server-side; mandar `tenant_id` por query/body/header/JWT no cambia el scope (FUND-03)                                    | ✓ VERIFIED                          | `country-scope.ts:150-161` — único SELECT con `leftJoin(schema.tenants, eq(schema.users.tenantId, schema.tenants.id))`, sin lectura de `request.query`/`body`/`headers` para tenant (grep confirmado: 0 hits). `test/shared/tenant-scope.test.ts` (8 `it()`) ejercita 4 vectores hostiles (query/body/header/claim en `request.user`) y assert de que el JWT decodificado no tiene ninguna clave `/tenant/i`                                                                                                                         |
| 3   | Un tenant `suspended`/`archived` corta con 403 antes de tocar datos; `active` responde normal; enforced en la misma query (FUND-04)                                                 | ✓ VERIFIED                          | `country-scope.ts:169-194` — el bloque de enforcement corre PRIMERO dentro de `if (row)`, antes de resolver `country`/`branchIds`; comparación contra `!== "active"` (deny-by-default). `test/shared/tenant-suspension-routes.test.ts` (11 `it()`) prueba 3 rutas reales de 2 módulos + member app, con `toBe(403)` estricto (8 ocurrencias)                                                                                                                                                                                         |
| 4   | El 403 lleva el código estable `TENANT_SUSPENDED` en el body                                                                                                                        | ✓ VERIFIED                          | `country-scope.ts:20` exporta la constante; `throw new AppError(..., 403, TENANT_SUSPENDED)` en el hook. Test de integración importa la constante (no hardcodea el string, 1 hit del import) y asserta `body.code === TENANT_SUSPENDED` sobre HTTP real                                                                                                                                                                                                                                                                              |
| 5   | Si el tenant no se puede resolver, el hook falla cerrado (`tenantId=null` + `log.error`), nunca abierto                                                                             | ✓ VERIFIED                          | `country-scope.ts:169-179` — rama `row.tenantStatus == null` (join sin match) escala `request.log.error` y deja `tenantId=null`, sin lanzar 403 (no convierte corrupción de datos en outage). Documentado como contrato "todo helper de tenancy DEBE tratar `null` como deny" en el docblock del campo                                                                                                                                                                                                                               |
| 6   | Las migraciones corren verdes en staging y luego en prod, sin downtime (Success Criteria 1)                                                                                         | ✓ VERIFIED                          | Migraciones presentes en `origin/master` y `origin/staging`; `/health` responde 200 en ambos hosts (según SUMMARY, no re-verificado por SSH en esta pasada); pm2 online con 0 unstable restarts (según SUMMARY); CI runs verificados independientemente en verde                                                                                                                                                                                                                                                                     |
| 7   | La suite de integración existente pasa sin ajustar expectativas (Success Criteria 4, parte automatizada)                                                                            | ✓ VERIFIED                          | `git diff --stat 8ac9ba9f..e6cab5f6` (verificado independientemente contra el merge-base real) = exactamente 10 archivos: 2 migraciones, 4 schemas, `country-scope.ts` y 3 tests **nuevos** (`A`, no `M`). Ningún archivo preexistente de `test/` fue tocado                                                                                                                                                                                                                                                                         |
| 8   | El smoke post-deploy queda verde en staging y prod (Success Criteria 4, parte de despliegue)                                                                                        | ⚠️ PARCIAL — ver Human Verification | El smoke AUTOMATIZADO del pipeline (step 19) pasó `success` en los dos entornos (confirmado por el propio SUMMARY, con runs de CI verificados independientemente). El smoke FUNCIONAL por UI (que un humano navegue el admin/member app y confirme cero 403 nuevos) está explícitamente declarado como **pendiente de UAT de Franco** en 166-06-SUMMARY — no se puede marcar VERIFIED por evidencia de código                                                                                                                        |

**Score:** 8/8 truths con evidencia de código/CI verificada de forma independiente (no solo por lectura del SUMMARY). La truth 8 tiene su mitad automatizada verificada y su mitad humana pendiente — no cuenta como fallo, cuenta como ítem de verificación humana pendiente (ver sección dedicada).

### Required Artifacts

| Artifact                                                     | Expected                                                                  | Status     | Details                                                                                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/db/schema/tenants.ts`                     | `tenantStatusEnum`, `tenants`, `tenantSettings`, `RESERVED_TENANT_SLUGS`  | ✓ VERIFIED | Los 4 exports presentes, 106 líneas, `mysqlEnum("status", ...)` (no `"tenant_status"`), sin `any`, sin import de `users`/`branches`                                       |
| `el-templo-api/src/db/migrations/0190_tenants_core.sql`      | `CREATE TABLE tenants` + `tenant_settings` + seed idempotente             | ✓ VERIFIED | 3 statements, cero `;` en comentarios, DDL espeja el schema Drizzle byte a byte                                                                                           |
| `el-templo-api/src/db/schema/index.ts`                       | `export * from "./tenants"` primera línea                                 | ✓ VERIFIED | Confirmado en el diff commiteado                                                                                                                                          |
| `el-templo-api/src/db/migrations/0191_tenant_anchors.sql`    | `tenant_id` en anclas, ciclo ADD→backfill→MODIFY→índice→FK                | ✓ VERIFIED | 10 statements (5 por tabla), `MODIFY ... DEFAULT 1` presente 2 veces, cero `AFTER`                                                                                        |
| `el-templo-api/src/db/schema/users.ts`                       | `tenantId` con FK, default 1, `idx_users_tenant_id`                       | ✓ VERIFIED | `int("tenant_id").notNull().default(1).references(() => tenants.id)` + índice en el 3er argumento de `mysqlTable`                                                         |
| `el-templo-api/src/db/schema/branches.ts`                    | ídem + estreno del 3er argumento de `mysqlTable`                          | ✓ VERIFIED | Confirmado por grep e inspección directa                                                                                                                                  |
| `el-templo-api/src/modules/shared/country-scope.ts`          | `attachScope` + `attachCountryScope` alias + `Scope` + `TENANT_SUSPENDED` | ✓ VERIFIED | Los 4 exports presentes; `leftJoin` (no `innerJoin`); enforcement antes de resolver el resto del scope; 22 call sites de `attachCountryScope(` intactos (grep confirmado) |
| `el-templo-api/test/migrations/0190-0191-tenants.test.ts`    | Introspección DDL, min 120 líneas                                         | ✓ VERIFIED | 435 líneas, 12 `it()`, sin `any`, sin `UPDATE tenants`                                                                                                                    |
| `el-templo-api/test/shared/tenant-scope.test.ts`             | Tests directos del hook, min 100 líneas                                   | ✓ VERIFIED | 263 líneas, 8 `it()`                                                                                                                                                      |
| `el-templo-api/test/shared/tenant-suspension-routes.test.ts` | Integración HTTP, min 120 líneas                                          | ✓ VERIFIED | 438 líneas, 11 `it()`, 8 `toBe(403)`, importa `TENANT_SUSPENDED` (no hardcodea)                                                                                           |

### Key Link Verification

| From                                           | To                  | Via                                                            | Status  | Details                                                                                                                           |
| ---------------------------------------------- | ------------------- | -------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `schema/index.ts`                              | `schema/tenants.ts` | barrel export, primera línea                                   | ✓ WIRED | `export * from "./tenants";` es la línea 1                                                                                        |
| `0190_tenants_core.sql`                        | `schema/tenants.ts` | DDL espejo byte a byte                                         | ✓ WIRED | `ENUM('active','suspended','archived')` idéntico en ambos                                                                         |
| `schema/users.ts` / `branches.ts`              | `schema/tenants.ts` | `references(() => tenants.id)`                                 | ✓ WIRED | Confirmado en ambos archivos                                                                                                      |
| `country-scope.ts`                             | `schema/tenants.ts` | `leftJoin(schema.tenants, ...)`                                | ✓ WIRED | 1 hit de `leftJoin(schema.tenants`, 0 de `innerJoin(schema.tenants`                                                               |
| `country-scope.ts`                             | `errors.ts`         | `AppError(..., 403, TENANT_SUSPENDED)`                         | ✓ WIRED | Confirmado el throw + import                                                                                                      |
| `test/shared/tenant-suspension-routes.test.ts` | `country-scope.ts`  | import de `TENANT_SUSPENDED` + `app.inject` sobre rutas reales | ✓ WIRED | Import confirmado; rutas admin/members, admin/subscriptions y member/subscriptions ejercitadas                                    |
| Rama `feat/166-tenancy-fundacion`              | `origin/master`     | fast-forward push                                              | ✓ WIRED | `origin/master` HEAD = `e6cab5f6` = HEAD de la rama de fase (verificado con `git ls-remote` en vivo, no solo lectura del SUMMARY) |
| Rama de fase                                   | `origin/staging`    | merge `--no-ff` vía rama descartable                           | ✓ WIRED | Migraciones 0190/0191 presentes en el árbol de `origin/staging` (verificado con `git ls-tree`)                                    |

### Data-Flow Trace (Level 4)

No aplica en el sentido estricto de UI — esta fase es 100% backend/DB. El "flujo de datos" relevante es: `users.tenant_id` (poblado al 100% por la migración 0191, verificado en DB local: 0 filas fuera de `tenant_id=1`) → leído por el único `SELECT` de `attachScope` → escrito en `request.scope.tenantId` → consumido (a partir de la fase 169) por los helpers de escritura. Para esta fase el dato SÍ fluye de punta a punta (DB real → hook → scope), verificado con datos reales (no mocks) en los tests de integración HTTP.

### Behavioral Spot-Checks

| Behavior                                                                                   | Command                                                                                          | Result                                                                              | Status |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------ |
| `tsc --noEmit` limpio en el worktree con el código commiteado                              | `cd et-166-tenancy/el-templo-api && npx tsc --noEmit`                                            | exit 0, sin salida                                                                  | ✓ PASS |
| DB local refleja el estado post-migración (mismo patrón que staging/prod)                  | Query directa a `eltemplo` local: `tenants`, `users`/`branches` fuera de tenant 1, `_migrations` | `1 el-templo active` / `1` / `0` / `0` / las 2 migraciones                          | ✓ PASS |
| CI de staging realmente corrió y terminó verde (no solo el badge)                          | `curl api.github.com/.../runs/30224509617` (consulta independiente, no leída del SUMMARY)        | `CI completed success staging 928b8c54...`                                          | ✓ PASS |
| CI/Deploy de prod realmente corrió y terminó verde                                         | `curl api.github.com/.../runs/30227344068`                                                       | `Deploy completed success master e6cab5f6...`                                       | ✓ PASS |
| `origin/master` realmente contiene los 5 commits de la fase (no solo el SUMMARY lo afirma) | `git ls-remote` + `git log --oneline origin/master -6`                                           | Los 5 commits de la fase presentes, HEAD = `e6cab5f6`                               | ✓ PASS |
| Diff de la fase es exactamente 10 archivos, todos altas puras                              | `git diff --stat 8ac9ba9f e6cab5f6`                                                              | 10 archivos, 1551(+)/32(-), coincide con el inventario del SUMMARY                  | ✓ PASS |
| Debt markers (`TBD`/`FIXME`/`XXX`) en los 9 archivos tocados                               | grep dirigido                                                                                    | 0 hits reales (2 falsos positivos por substring `TODO` dentro de `TODOS`/`TODO lo`) | ✓ PASS |

### Probe Execution

No aplica — la fase no declara probes formales (`scripts/*/tests/probe-*.sh`). La verificación "runnable" equivalente para una fase de migraciones/DB es la re-ejecución de las 4 consultas de verificación contra la DB local (hecha arriba) y la confirmación independiente de los runs de CI (hecha arriba), en vez de depender de la narración del SUMMARY.

### Requirements Coverage

| Requirement | Source Plan            | Description                                                           | Status      | Evidence                                                                                                     |
| ----------- | ---------------------- | --------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| FUND-01     | 166-01, 166-03, 166-06 | Existen `tenants`+`tenant_settings` con El Templo id=1                | ✓ SATISFIED | Schema + migración + seed verificados en código y en DB local; presentes en `origin/master`/`origin/staging` |
| FUND-02     | 166-02, 166-03, 166-06 | `users`/`branches` con `tenant_id NOT NULL` + FK + índice, backfill=1 | ✓ SATISFIED | Schema + migración verificados; 0 filas fuera de tenant 1 en DB local                                        |
| FUND-03     | 166-04, 166-05, 166-06 | `scope.tenantId` resuelto server-side, inmune a query/body/header/JWT | ✓ SATISFIED | Código + 2 archivos de test (hook directo + rutas HTTP) verificados                                          |
| FUND-04     | 166-04, 166-05, 166-06 | `suspended`/`archived` → 403 `TENANT_SUSPENDED` sin tocar datos       | ✓ SATISFIED | Código + 2 archivos de test verificados; contrato del body confirmado por HTTP real                          |

Sin requisitos huérfanos: los 4 IDs de `REQUIREMENTS.md` (líneas 33-36, 99-102) están declarados en al menos un plan de la fase, y los 4 están marcados `Complete` en la tabla de trazabilidad — consistente con la evidencia de código encontrada.

### Anti-Patterns Found

| File | Line | Pattern                                                         | Severity | Impact                                                                             |
| ---- | ---- | --------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------- |
| —    | —    | Ninguno (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER/`any`/`console.*`) | —        | Escaneo dirigido sobre los 9 archivos de producción+test de la fase: 0 hits reales |

**Hallazgos advisory de 166-REVIEW.md** (no bloqueantes, no re-litigados acá porque son de diseño/riesgo futuro, no de goal-achievement de esta fase):

- WR-01 (ventana de carrera ADD→backfill→MODIFY sin DEFAULT en el ADD): riesgo real para inserts concurrentes durante el rolling deploy de ESTA migración, pero el propio review lo clasifica como daño acotado (deploy fallido con auto-rollback, no corrupción) y ya aplicada — no reabre el goal de la fase. Recomendado adoptarlo como regla dura en la fase 167, que si repite el patrón sobre ~85 tablas con más tráfico de escritura.
- WR-02 (posible leak de `FOREIGN_KEY_CHECKS=0` en el pool si el Test 8 de `tenant-scope.test.ts` falla a mitad de camino): riesgo de test, no de producción.
- WR-03 (el enforcement de suspensión depende de que cada módulo registre el hook; no hay todavía un test de inventario que lo garantice para el 100% de las rutas autenticadas): **deferred** — ver sección siguiente, cubierto explícitamente por la fase 171 del roadmap (`test/tenant-manifest.ts` + hook `onRoute`).

### Deferred Items

| #   | Item                                                                                                 | Addressed In | Evidence                                                                                                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Garantía de que el 100% de las rutas autenticadas registra `attachScope` (WR-03 del REVIEW)          | Phase 171    | ROADMAP línea 4377: "Phase 171: Backstop — manifiesto de rutas fail-closed y fixtures 2-tenant — `test/tenant-manifest.ts` clasificando el 100% de las rutas + hook `onRoute` que deja en rojo cualquier ruta nueva sin clasificar"                               |
| 2   | `null` = deny efectivo en la práctica (hoy sólo documentado, sin consumidor real) (IN-05 del REVIEW) | Phase 169    | ROADMAP línea 4375: "Phase 169: Capa de escritura — helpers `tenantWhere`/`tenantValues` y `TenantContext`" — el propio 166-04-SUMMARY registra "Listo para 169: el docblock de `scope.tenantId` deja escrito el contrato que los helpers... tienen que respetar" |

## Human Verification Required

### 1. Smoke funcional por UI — Admin de staging

**Test:** Entrar al admin de `eltemplo_staging` y confirmar: listado de socios carga, se puede cargar un cobro, la pantalla de reservas funciona.
**Expected:** Comportamiento idéntico al de antes de la fase 166 — cero pantallas con un 403 nuevo.
**Why human:** Es UX real sobre un deploy vivo; no verificable por grep/tsc/tests. El smoke automatizado del pipeline (step 19, `success`) ya confirmó que el proceso levantó y respondió, pero no ejercita los flujos de negocio uno por uno como lo haría un humano.

### 2. Smoke funcional por UI — Member app de staging

**Test:** Con un socio de staging, confirmar que ve sus planes y turnos.
**Expected:** Sin cambios respecto de antes de la fase.
**Why human:** Misma razón — superficie de socio, UX real.

### 3. Repetir los dos smokes anteriores en producción

**Test:** Mismos pasos que 1 y 2 pero contra `eltemplo` (prod).
**Expected:** Mismo resultado.
**Why human:** El propio 166-06-SUMMARY declara este smoke como **PENDIENTE de UAT de Franco** en ambas bases, de forma explícita y no ambigua ("No está confirmado y no debe darse por hecho"). No corresponde inferirlo de la evidencia automatizada disponible.

## Gaps Summary

No hay gaps de código. Los 4 requisitos (FUND-01..04) están implementados, testeados (a nivel de hook y a nivel de integración HTTP con rutas reales), y desplegados: se verificó de forma independiente (no solo leyendo el SUMMARY) que `origin/master` y `origin/staging` contienen los 5 commits de la fase con los 10 archivos exactos, que los 4 runs de CI/deploy citados terminaron en `success`, y que la DB local (representativa del mismo patrón de migración aplicado en staging/prod) tiene el estado exacto esperado.

Lo único que separa esta fase de un `passed` limpio es el smoke funcional por UI, que la propia fase declara pendiente y que por naturaleza no es verificable desde el código — motivo por el que el status es `human_needed` y no `gaps_found`. No es un hallazgo nuevo del verificador: es la misma pendiente que 166-06-SUMMARY ya documentaba con honestidad.

---

_Verified: 2026-07-27T02:00:00Z_
_Verifier: Claude (gsd-verifier)_
