---
phase: 169-capa-de-escritura-helpers-tenantwhere-tenantvalues-y-tenantc
plan: 01
subsystem: backend
tags:
  [
    multi-tenancy,
    drizzle,
    fail-closed,
    mass-assignment,
    cron-sweep,
    vitest,
    mysql,
  ]

# Dependency graph
requires:
  - plan: 166-*
    provides: "attachScope con scope.tenantId resuelto server-side y el criterio explícito de que null = deny"
  - plan: 167-*
    provides: "tenantIdColumn() en las 87 tablas gym-owned (DEFAULT 1) y el hueco documentado del nombre TenantContext"
  - plan: 168-*
    provides: "src/db/tenant-tables.ts, los contratos compuestos de la 0196 y el patrón de segundo tenant ad-hoc en tests"
provides:
  - "el-templo-api/src/modules/shared/tenant.ts: tenantWhere, tenantValues, assertTenant, listActiveTenants, forEachActiveTenant + los tipos TenantId, TenantContext, TenantLogger, TenantSweepResult y la constante TENANT_UNRESOLVED"
  - "Narrowing fail-closed del scope de request (number | null) al contrato lockeado (number): assertTenant lanza AppError 403 TENANT_UNRESOLVED"
  - "Iterador de gimnasios activos con aislamiento de errores por iteración, listo para los 7 crons (D-01/D-03)"
  - "test/tenancy/tenant-helpers.test.ts: 13 tests verdes contra MySQL real con un segundo tenant ad-hoc (id 90169)"
  - "Worktree /home/franco/projects/et-169-tenant-layer, rama feat/169-capa-escritura sobre origin/master (1200b8af)"
affects:
  - "169-02..169-09 (los 8 planes siguientes importan de src/modules/shared/tenant.ts; la firma y el fail-closed quedan fijados acá)"
  - "172-175 (adopción módulo a módulo: los services migran a estos mismos helpers)"
  - "170 (el sentinel de pool y el lint de CI se apoyan en que exista una única API de tenancy)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Contrato { tenantId } plano como puente estructural: CountryScope y TenantContext son el mismo tipo para los helpers, así que no hay una API paralela para los caminos sin request"
    - "Narrowing explícito en el CALL SITE (assertTenant) en vez de un helper que acepte null: la fricción de tipos es la mitigación, y queda visible en el diff que la introduce"
    - "El tenantId del scope va DESPUÉS del spread en tenantValues: mitigación de mass-assignment simultáneamente a nivel de tipo y de runtime"
    - "Comparación positiva contra 'active' (nunca exclusión de la lista de estados malos) para que un estado futuro del enum deniegue por default"
    - "TenantLogger como interfaz estructural mínima: la satisfacen pino() y FastifyBaseLogger sin que el módulo importe ninguno de los dos (verificado por typecheck)"

key-files:
  created:
    - el-templo-api/src/modules/shared/tenant.ts
    - el-templo-api/test/tenancy/tenant-helpers.test.ts
  modified: []

key-decisions:
  - "assertTenant lanza AppError 403 TENANT_UNRESOLVED (no 500): tenantId null es corrupción de datos y el criterio heredado de la 166 es denegar aguas abajo, no convertir una inconsistencia en una caída del servicio"
  - "tenant.ts NO se agrega al barrel src/modules/shared/index.ts, por consistencia con country-scope.ts (que se importa por path directo desde sus 22 call sites)"
  - "Las filas de prueba de aura_config usan un source_type DISTINTO por gimnasio: aura_config.source_type sigue siendo unique GLOBAL (deuda consciente registrada en TENANT_UNIQUE_ALLOWLIST), así que los dos tenants no pueden compartir el valor"
  - "Se eligieron program_completion y program_week_completion como source_type de prueba porque ningún otro archivo de test los usa (aura_config no está en TABLES_TO_CLEAN y las filas sobreviven entre archivos del mismo worker)"
  - "node_modules se resolvió por symlink al worktree et-167-columnas y no al et-168-contratos: el lockfile de los tres es byte-idéntico, pero el node_modules del 168 no existe hoy (lo borran alrededor de cada typecheck). Cero installs"

metrics:
  duration: "~9min"
  completed: 2026-07-28
---

# Phase 169 Plan 01: Base de la capa de escritura — `tenant.ts` Summary

`src/modules/shared/tenant.ts` queda escrito con la firma lockeada del doc 03 §3, el narrowing fail-closed `assertTenant` que resuelve la fricción `number | null` vs `number`, y el iterador de gimnasios activos con aislamiento de errores que van a consumir los 7 crons — probado por comportamiento contra MySQL real con dos tenants.

## Performance

- **Duration:** ~9 min
- **Tasks:** 3
- **Files:** 2 creados
- **Tests:** 13 verdes (`test/tenancy/tenant-helpers.test.ts`, 95,7 s)

## Tasks Completed

| Task | Nombre                                    | Commit                                      | Archivos                                            |
| ---- | ----------------------------------------- | ------------------------------------------- | --------------------------------------------------- |
| 1    | Worktree de la fase desde `origin/master` | (sin commit — no toca archivos versionados) | `/home/franco/projects/et-169-tenant-layer`         |
| 2    | `src/modules/shared/tenant.ts`            | `c21baefd`                                  | `el-templo-api/src/modules/shared/tenant.ts`        |
| 3    | Tests de los 5 exports                    | `f6bc7ecc`                                  | `el-templo-api/test/tenancy/tenant-helpers.test.ts` |

## Task 1 — Worktree, sin instalar nada

- `git fetch origin` → `origin/master` = **`1200b8af`**, exactamente la base de lectura que declara el PATTERNS.
- Worktree `/home/franco/projects/et-169-tenant-layer`, rama nueva `feat/169-capa-escritura`.
- Las cuatro verificaciones previas pasaron: `country-scope.ts` exporta `attachScope` y tiene `tenantId: number | null` (:39); `src/db/tenant-tables.ts` existe; `src/modules/shared/tenant.ts` NO existía; el `.sql` más alto es `0196_tenant_unique_contracts.sql` (esta fase no agrega migraciones — si hiciera falta una, se reserva desde 0197).
- `.env` y `.env.development` copiados desde `/home/franco/projects/et-168-contratos/el-templo-api/`.
- **`node_modules` resuelto por symlink, cero installs.** El `cmp` del `pnpm-lock.yaml` dio **byte-idéntico contra los tres** worktrees candidatos (168, 167, 166), pero el `node_modules` del 168 **no existe hoy** (la 168 lo crea y lo borra alrededor de cada typecheck, según su propio SUMMARY), así que el symlink apunta al primero con `node_modules` real: `/home/franco/projects/et-167-columnas/el-templo-api/node_modules`. No se corrió `pnpm install`, `npm install`, `pnpm add` ni nada equivalente.
- El symlink se borró antes de cada verificación de árbol limpio y antes de cada commit (la regla `node_modules/` del `.gitignore` no matchea un symlink).
- El checkout principal quedó intacto: sigue en `fix/referral-preview-y-refresh-ficha` y no se corrió ni un `git checkout`, `git stash` o `git reset` ahí.

## Task 2 — `src/modules/shared/tenant.ts` (277 líneas, 10 exports)

Superficie pública exacta de `<interfaces>`, sin variaciones:

| Export                | Forma                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `TenantId`            | `type TenantId = number`                                                                 |
| `TenantContext`       | `{ tenantId: TenantId }`                                                                 |
| `TenantLogger`        | `{ info(obj, msg); warn(obj, msg); error(obj, msg) }`                                    |
| `TenantSweepResult`   | `{ tenants: number; ok: number; failed: number }`                                        |
| `TENANT_UNRESOLVED`   | `"TENANT_UNRESOLVED"`                                                                    |
| `tenantWhere`         | cuerpo literal `eq(table.tenantId, scope.tenantId)`, `scope: { tenantId: TenantId }`     |
| `tenantValues`        | `{ ...values, tenantId: scope.tenantId }` tipado `V & { tenantId: TenantId }`            |
| `assertTenant`        | `(scope: { tenantId: number \| null }, where: string) => TenantContext`, 403 fail-closed |
| `listActiveTenants`   | `SELECT id FROM tenants WHERE status='active' ORDER BY id`                               |
| `forEachActiveTenant` | loop secuencial con `try/catch` DENTRO del loop                                          |

- El docblock de cabecera sigue el idioma del milestone (secciones en MAYÚSCULA citando fase y decisión) y cubre CON-03, D-02, D-03, las cuatro fuentes legítimas de un `TenantContext`, las convenciones de WHERE/INSERT y el texto canónico de `tenant-column.ts:10-13` ("el tenant JAMÁS viene del payload, de una query string ni del JWT").
- `assertTenant` es el único puente permitido entre `CountryScope.tenantId` y la firma lockeada. **No hay ni un `?? 1` ni un non-null assertion sobre `tenantId` en todo el archivo** (verificado por grep en el `<verify>`).
- `forEachActiveTenant` no re-lanza: absorbe con `log.error({ err, tenantId, job })` y sigue; el resultado devuelto es la forma de enterarse. Lista vacía → `log.warn` + `{ tenants: 0, ok: 0, failed: 0 }`.
- Sin `any`. `npx tsc --noEmit` sale 0.

## Task 3 — `test/tenancy/tenant-helpers.test.ts` (442 líneas, 13 tests)

- Segundo tenant ad-hoc **90169** (id propio: el 90168 es del `con-01` y dos archivos con el mismo id se pisan con `isolate: false`), sembrado en el `beforeAll` de forma defensiva y borrado en el `afterAll`.
- **Trampa del DEFAULT 1 (T-168-15):** los dos inserts de `aura_config` pasan por `tenantValues`, o sea que estampan `tenantId` explícito — incluido el del tenant 1.
- `afterEach` **incondicional** devuelve los dos gimnasios a `status='active'`: sin eso, el test 12 (que suspende los dos para probar el sweep vacío) rompería todos los archivos siguientes del worker.
- El archivo **no llama a `cleanAllTestData`** (admin-global, sin scope de tenant — warning heredado del 168-REVIEW): la limpieza es local y explícita, en orden seguro de FKs.
- Aserciones de **exclusión** además de las de inclusión: el filtro se prueba afirmando que la fila del otro gimnasio NO aparece (una aserción de sola inclusión pasaría en verde con un WHERE sin filtro), y `listActiveTenants` se recorre sobre los **tres** valores del enum.
- El test del sweep roto afirma `{ tenants: 2, ok: 1, failed: 1 }`, que el tenant 1 igual fue procesado, y que el `log.error` capturado trae `tenantId: 90169` y `job` como campos estructurados — más que el mensaje NO interpola el id.
- Test 13 cierra afirmando que después de la limpieza `SELECT COUNT(*) FROM tenants WHERE id = 90169` da 0 y que el tenant 1 sigue en pie.

Resultado: `npx vitest run test/tenancy/tenant-helpers.test.ts --no-file-parallelism` → **13 passed**, 95,7 s.

## Deviations from Plan

Ninguna que cambie el alcance. Dos ajustes de ejecución, los dos dentro de lo que el plan dejaba a criterio:

**1. [Rule 3 — Blocking] `node_modules` del worktree fuente**

- **Encontrado en:** Task 1.
- **Problema:** el plan ordena buscar el primer worktree con `pnpm-lock.yaml` byte-idéntico y symlinkear a su `node_modules`. El primero de la lista (`et-168-contratos`) matchea el lockfile pero **no tiene `node_modules`** (la 168 lo borra alrededor de cada typecheck, como documenta su propio SUMMARY).
- **Fix:** se siguió con el siguiente candidato de la lista, `et-167-columnas`, cuyo lockfile también es byte-idéntico y cuyo `node_modules` es un directorio real. Cero installs, que es la regla dura que el paso protege.
- **Commit:** ninguno (Task 1 no toca archivos versionados).

**2. [Rule 3 — Blocking] `source_type` distinto por gimnasio en las filas de prueba**

- **Encontrado en:** Task 3.
- **Problema:** el plan pide "dos filas de `aura_config` para el tenant 1 y para el 90169". `aura_config.source_type` sigue siendo una unique **GLOBAL** (deuda consciente del módulo Aura, registrada con motivo en `TENANT_UNIQUE_ALLOWLIST` — la 0196 no la convirtió a propósito), así que los dos gimnasios no pueden compartir el valor: el segundo insert explotaría con `ER_DUP_ENTRY`.
- **Fix:** cada gimnasio usa su propio `source_type` (`program_completion` y `program_week_completion`, dos valores del enum que ningún otro archivo de test usa — relevante porque `aura_config` no está en `TABLES_TO_CLEAN` y las filas sobreviven entre archivos del mismo worker). El comportamiento probado no se debilita: la aserción es que el SELECT con `tenantWhere` devuelve la fila del gimnasio pedido y **no** la del otro.
- **Commit:** `f6bc7ecc`.

**Nota sobre el orden TDD:** el plan ordena Task 2 (implementación) antes de Task 3 (tests), y así se ejecutó. No hubo gate RED previo: el archivo de tests se escribió contra la superficie ya existente. Queda registrado porque los dos tasks están marcados `tdd="true"`.

## Verificación adicional no pedida por el plan

`TenantLogger` se declaró como interfaz estructural mínima con la intención de que la satisfagan tanto `pino()` (los jobs) como `FastifyBaseLogger` (los services). Eso no se prueba typechequeando `tenant.ts` solo, así que se compiló un archivo temporal con `const a: TenantLogger = pino({...})` y `const b: TenantLogger = fl` (`FastifyBaseLogger`): `tsc` sale 0 con los dos. El archivo temporal se borró y no se commiteó. El plan 169-04 puede pasar el `pino()` de cada job directo, sin adaptador.

## Threat Model — dispositions cubiertas

| Threat   | Cómo quedó mitigado                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-169-01 | La firma pide `{ tenantId: number }`: un `CountryScope` no compila sin pasar por `assertTenant` (403). Grep de `?? 1` / non-null assertion en 0. |
| T-169-02 | `tenantId` del scope DESPUÉS del spread; test 2 afirma que pisa un `tenantId: 99` que venga en `values`.                                         |
| T-169-03 | Comparación positiva contra `'active'`; tests 7/8/9 recorren los tres valores del enum.                                                          |
| T-169-04 | `try/catch` dentro del loop, probado con un callback que lanza sólo para el 90169 (test 11).                                                     |
| T-169-05 | Worktree creado con `git worktree add` desde `origin/master` tras `git fetch`; cero operaciones de git en el checkout principal, verificado.     |
| T-169-06 | Todo insert estampa `tenantId` explícito vía `tenantValues`; hay aserciones de **ausencia**, no sólo de presencia.                               |
| T-169-SC | Cero dependencias nuevas, cero installs. `node_modules` por symlink tras verificar el lockfile con `cmp`.                                        |

## Estado del worktree

`/home/franco/projects/et-169-tenant-layer`, rama `feat/169-capa-escritura`, 2 commits sobre `1200b8af`:

- `c21baefd` — `feat(169-01): tenant.ts, la unica API de tenancy con tenantWhere/tenantValues`
- `f6bc7ecc` — `test(169-01): comportamiento de los 5 helpers de tenant.ts contra MySQL real`

Nada pusheado (staging-first: el rollout es de un plan posterior). El `node_modules` está **borrado** en este momento — recrearlo con el symlink a `et-167-columnas` antes de cualquier typecheck o corrida de tests, y volver a borrarlo antes de commitear.

## Self-Check: PASSED
