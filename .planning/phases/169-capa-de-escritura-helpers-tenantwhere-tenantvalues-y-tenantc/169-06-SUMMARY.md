---
phase: 169-capa-de-escritura-helpers-tenantwhere-tenantvalues-y-tenantc
plan: 06
subsystem: backend
tags:
  [
    multi-tenancy,
    tv-pairing,
    exencion-anotada,
    mass-assignment,
    device-code,
    vitest,
    mysql,
  ]

# Dependency graph
requires:
  - plan: 169-01
    provides: "tenantValues, assertTenant y el tipo TenantContext en src/modules/shared/tenant.ts"
  - plan: 169-05
    provides: "dependencia OPERATIVA (worktree único + tests MySQL-backed serializados), no lógica"
provides:
  - "La única exención legítima del milestone materializada y grepeable: /* tenant-safe: pairing pre-claim */ con su motivo en el INSERT pre-claim de tv_pairings"
  - "TvPairingService.claim(ctx, …) estampando tv_pairings.tenant_id con el gimnasio del scope del staff vía tenantValues"
  - "consume() propagando ese mismo gimnasio a tv_devices (el TV pollea sin sesión: el tenant sale de la fila ya reclamada)"
  - "tvPairClaimSchema.body con additionalProperties: false (tenant jamás del borde)"
  - "test/tv/tv-pairing-tenant.test.ts: 6 tests verdes con un segundo gimnasio ad-hoc (id 90569) que hace fallar el DEFAULT 1"
affects:
  - "169-07..169-09 (para CON-04 sólo queda el helper CLI --tenant y su retrofit)"
  - "170 (el sentinel lee esta anotación: es la primera exención de la fase que NO es de un script)"
  - "173 (ADO-07: el invariante user.tenant_id === branch.tenant_id, que este claim todavía no enforcea)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El ctx va PRIMERO en la firma del service a propósito: agregarlo al final habría dejado que un call site viejo compilara con los argumentos corridos"
    - "Exención anotada en la MISMA línea del insert + docblock con el motivo, apuntando a tenant-tables.ts en vez de repetir los motivos M8"
    - "Comentario defensivo sobre el WHERE que NO lleva tenantWhere: el claim es la operación que DESCUBRE el tenant, filtrarlo lo rompería"
    - "El tenant de una escritura sin sesión sale de la fila padre ya reclamada (consume → tv_devices), nunca de un DEFAULT"
    - "Test de estampado con un actor de un gimnasio ≠ 1: sin eso la aserción es indistinguible del DEFAULT de la columna"

key-files:
  created:
    - el-templo-api/test/tv/tv-pairing-tenant.test.ts
  modified:
    - el-templo-api/src/modules/tv/pairing.ts
    - el-templo-api/src/modules/tv/control-routes.ts
    - el-templo-api/src/modules/tv/schemas.ts
    - el-templo-api/src/db/schema/tv.ts

key-decisions:
  - "El archivo de test SÍ siembra un segundo gimnasio (id 90569) pese a que el plan decía que no hacía falta: con sólo el tenant 1, las dos aserciones centrales pasarían en verde aunque el service no estampara nada (DEFAULT 1 desde la 167). Es la misma lección del test 5 del 169-05"
  - "El staff del segundo gimnasio se crea con createStaffUser y se le reasigna tenant_id por UPDATE: el helper no expone tenantId porque hoy todo el staff es del tenant 1, y agregarle un parámetro sería tocar test/helpers.ts (API de fixtures = fase 171)"
  - "El spoofeo de tenantId en el body se hace con el staff del gimnasio 90569 y el valor 424242: hacerlo con staff del tenant 1 sería indistinguible del DEFAULT de la columna"
  - "El test tolera los dos finales de Fastify ante una propiedad extra (strip → 200, o reject → 400) y afirma en ambos que el valor del body no llegó a la columna: la aserción es sobre la escritura, no sobre la política de ajv"
  - "El WHERE del UPDATE del claim queda sin filtro de tenant con un comentario que lo declara correcto, para que el sentinel de la 170 y cualquier revisor futuro no lo 'arreglen'"

metrics:
  duration: "~15min"
  completed: 2026-07-28
---

# Phase 169 Plan 06: `tv_pairings` — exención anotada y estampado del claim Summary

La mina M7 queda cerrada por los dos lados: el INSERT pre-claim del televisor es la única escritura del milestone que deliberadamente NO tiene dueño —y ahora lo dice con motivo, en su línea y en su docblock—, mientras que el claim del staff estampa el gimnasio de su scope y el poll del TV lo propaga a `tv_devices`.

## Performance

- **Duration:** ~15 min
- **Tasks:** 2
- **Files:** 1 creado, 4 modificados
- **Tests:** 6 verdes en el archivo nuevo (99,3 s) + 17 verdes en `tv-pairing.test.ts` (117,2 s, sin tocarlo)

## Tasks Completed

| Task | Nombre                                             | Commit     | Archivos                                                                                                            |
| ---- | -------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| 1    | Exención anotada + estampado en claim y consume    | `64629f56` | `src/modules/tv/pairing.ts`, `src/modules/tv/control-routes.ts`, `src/modules/tv/schemas.ts`, `src/db/schema/tv.ts` |
| 2    | Ciclo start→claim→consume con aserciones de tenant | `0847c8da` | `test/tv/tv-pairing-tenant.test.ts` (nuevo, 437 líneas)                                                             |

## Task 1 — los tres puntos de escritura, tres tratamientos distintos

**`start()` — exento, y escrito por qué.** El `.insert(schema.tvPairings)` lleva `/* tenant-safe: pairing pre-claim */` en su propia línea, y arriba del método hay una sección de docblock que dice lo que la anotación sola no puede: la fila nace **antes** de que se sepa de quién es el televisor (`branch_id` nulo hasta el claim, D-01), así que no hay ningún scope del cual sacar el dueño y **estampar acá sería inventarlo**. Un dueño inventado es peor que la columna en su DEFAULT, porque el claim lo pisa con el real un instante después. La consecuencia permanente —los dos códigos quedan UNIQUE globales para siempre— **apunta a `src/db/tenant-tables.ts:249-252` en vez de repetir los motivos M8**, para que exista una sola fuente.

**`claim(ctx, …)` — estampa, con el ctx PRIMERO.** La firma pasó a `claim(ctx: TenantContext, userCode, branchId, claimedBy, name?)` y el `.set()` es ahora `tenantValues(ctx, { claimedAt, claimedBy, branchId, deviceName })`. El orden del parámetro es la decisión, no un detalle: con el `ctx` al final, un call site viejo habría compilado con los argumentos corridos; con el `ctx` primero, `tsc` obliga a mirar cada uno. Es la **única firma de service que toca la fase 169**, habilitada por CON-04 (no es adopción de módulo).

**El `WHERE` que NO debe llevar `tenantWhere`, con el motivo adentro del código.** El UPDATE atómico sigue siendo `user_code = ? AND claimed_at IS NULL`. Quedó escrito en el propio `.where()` que el `user_code` es global por diseño (mina M7) y que el claim es justamente la operación que **descubre** el tenant: filtrar por un gimnasio que la fila todavía no declara dejaría el pairing imposible de reclamar. En este único WHERE, "falta el filtro de tenant" es la respuesta correcta (T-169-30).

**`consume()` — propaga.** El `select` del pairing trae ahora `tenantId: schema.tvPairings.tenantId` y el INSERT de `tv_devices` pasa por `tenantValues({ tenantId: pairing.tenantId }, {...})`, con el comentario que explica el punto entero: **el televisor pollea sin sesión**, así que el gimnasio no puede salir de un scope de request — sale de la fila de pairing ya reclamada. `tenant_id` es NOT NULL desde la 167, así que llega tipado `number` y no necesita narrowing.

**El borde.** `control-routes.ts:73` pasa `assertTenant(request.scope, "tv pair claim")` como primer argumento. El `attachCountryScope` del hook `onRequest` del plugin ya resolvió `request.scope.tenantId` server-side leyendo `users.tenant_id`, y `requireBranchAccess({ from: "body.branchId" })` ya validó la sede contra el scope del actor. Ni un `!` ni un `?? 1`: `assertTenant` es fail-closed (403 `TENANT_UNRESOLVED`).

**`tvPairClaimSchema.body` sumó `additionalProperties: false`**, con un comentario que cita la regla dura del milestone (`tenant_id` jamás del payload) y el precedente T-164-43 de `tvControlStateSchema`.

**`src/db/schema/tv.ts` dejó de prometer trabajo futuro.** El comentario de la 168 decía que la anotación y el estampado "los agregan las fases 169/170". Ahora enumera qué quedó **hecho** en la 169 (los tres tratamientos) y qué **sigue** esperando a la 170: el sentinel que lee estas anotaciones y el lint de CI.

## Task 2 — 6 tests contra MySQL real, con un gimnasio 90569 que rompe el DEFAULT

| Test | Qué afirma                                                                  | Aserción                                                            |
| ---- | --------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1    | pre-claim: la fila existe sin reclamar y sin sede                           | `claimed_at` null, `branch_id` null, `tenant_id` en el DEFAULT      |
| 2    | el claim deja la fila con el gimnasio del scope y la sede elegida           | `SELECT tenant_id, branch_id FROM tv_pairings`                      |
| 3    | el consume crea el dispositivo con el gimnasio de la fila reclamada         | `tv_devices.tenant_id === tv_pairings.tenant_id`                    |
| 4    | **un dueño del gimnasio 90569 deja el pairing y el device con SU gimnasio** | `tenant_id = 90569` en las DOS tablas, partiendo de un DEFAULT de 1 |
| 5    | mandar `tenantId` en el body del claim no cambia nada                       | el valor spoofeado (424242) no llega a la columna                   |
| 6    | higiene                                                                     | el gimnasio de prueba fue una fila real y El Templo sigue `active`  |

**El test 4 es el que prueba de verdad el estampado**, y así está declarado en un comentario del archivo: los tres primeros pasarían en verde aunque `claim()` no estampara nada y `consume()` insertara sin tenant, porque la columna tiene `DEFAULT 1` desde la 167 y el staff de El Templo también es 1 — el valor correcto y el accidental son indistinguibles. El test 4 arranca afirmando que **antes** del claim la fila está en 1, así que el 90569 posterior sólo puede haberlo escrito el claim.

**Las aserciones son contra la base**, nunca contra el body de la respuesta: el claim devuelve `{ ok: true }` y no expone el tenant (ni debe — la columna no sale por ningún schema).

**Higiene del worker.** `cleanAllTestData` **no limpia `branches`** (no está en `TABLES_TO_CLEAN`), así que las sedes sobreviven entre tests del mismo worker y la fila de `tenants` no podía irse mientras una sede la referenciara (`fk_branches_tenant`). El archivo tiene un `limpiarRastro()` incondicional que borra primero las sedes (por `tenant_id` y por nombre) y recién después el gimnasio, y corre en el `beforeEach` **y** en el `afterAll`. Las dos sedes se siembran con `tenantId` **explícito**, incluida la del tenant 1 (trampa T-168-15).

**Residuo verificado por SQL después de la corrida**, en la base del worker (`eltemplo_test_1`): `tenant_90569 = 0`, `branches_segundo = 0`, `templo_status = active`.

`test/tv/tv-pairing.test.ts` **no se modificó** (`git diff --numstat` no lo lista) y sus 17 tests siguen verdes con la firma nueva.

## Deviations from Plan

**1. [Rule 2 — Funcionalidad crítica ausente] El test sí siembra un segundo gimnasio**

- **Encontrado en:** Task 2.
- **Problema:** el plan dice que este archivo "NO necesita un segundo tenant" porque hoy todo el staff es del tenant 1. Pero con un solo gimnasio, dos de los `must_haves` del propio plan son **inverificables**: "el claim estampa el tenant del scope del staff" y "`consume()` estampa `tv_devices` con el tenant de la fila reclamada, **no con el DEFAULT**". `tenant_id` tiene `DEFAULT 1` desde la 167 y el staff es tenant 1, así que un service que no estampara nada produciría exactamente las mismas filas y el archivo entero pasaría en verde probando nada. Es literalmente la trampa T-168-15 que todos los archivos de esta fase declaran en su cabecera, y la lección que el 169-05 dejó escrita ("el test que prueba de verdad el estampado es el del gimnasio activo distinto de 1").
- **Fix:** el archivo siembra el gimnasio **90569** (id propio, sin colisión con 90168/90169/90269/90369/90469) y un dueño asignado a él, y agrega el test 4. Se respetó lo que el plan protegía con esa instrucción: la cabecera declara explícitamente que **NO es un test de aislamiento** (eso es ISO-03, fase 172) y que el segundo gimnasio existe sólo para derrotar al DEFAULT, no para probar que un gimnasio no ve al otro. La limpieza es local y explícita, sin tocar `test/helpers.ts`.
- **Commit:** `0847c8da`.

**2. [Rule 3 — Blocking] El grep de `tenantValues` del `<verify>` cuenta la línea del import**

- **Encontrado en:** Task 1.
- **Problema:** el plan verifica `grep -v '^\s*[/*]' src/modules/tv/pairing.ts | grep -c 'tenantValues'` **-eq 2** (los dos call sites). Pero `grep -c` cuenta **líneas**, y la línea del `import { tenantValues, type TenantContext }` no es un comentario: el conteo real es **3**, así que el comando fallaba con la implementación correcta.
- **Fix:** se verificó con `grep -c 'tenantValues('` sobre las mismas líneas no-comentario, que excluye el import (ahí el nombre aparece sin paréntesis) y da exactamente **2** — el número que el plan quería afirmar. El resto de la cadena del `<verify>` corrió sin cambios. Cero efecto sobre el código.
- **Commit:** `64629f56`.

**Nota sobre el orden TDD:** los dos tasks están marcados `tdd="true"` y el plan ordena implementación (Task 1) antes de tests (Task 2); así se ejecutó, sin gate RED previo. Mismo registro que dejaron los planes 169-01, 169-04 y 169-05.

**Sin desviaciones de alcance:** ninguna otra firma de service cambió (D-02), cero dependencias nuevas, cero migraciones, `test/tv/tv-pairing.test.ts` intacto.

## Verificación

| Verificación                                                             | Resultado                                  |
| ------------------------------------------------------------------------ | ------------------------------------------ |
| `npx tsc --noEmit`                                                       | **exit 0** (después de cada task)          |
| `npx vitest run test/tv/tv-pairing-tenant.test.ts --no-file-parallelism` | **6 passed** (99,3 s)                      |
| `npx vitest run test/tv/tv-pairing.test.ts --no-file-parallelism`        | **17 passed** (117,2 s), archivo sin tocar |
| `tenant-safe: pairing pre-claim` en `pairing.ts`                         | 2 (anotación + docblock)                   |
| `tenantValues(` fuera de comentarios en `pairing.ts`                     | **2** (claim + consume)                    |
| `assertTenant` fuera de comentarios en `control-routes.ts`               | 2 (import + call site)                     |
| `additionalProperties: false` en `tvPairClaimSchema.body`                | presente                                   |
| Cero `any` explícito / cero `console.*` en los archivos tocados          | OK                                         |
| Residuo en `eltemplo_test_1` (tenant 90569 / sus sedes)                  | **0 / 0**, tenant 1 en `active`            |
| `git diff --diff-filter=D` post-commit                                   | sin borrados en ninguno de los dos         |
| `git status` del worktree tras cada commit                               | limpio (symlink de `node_modules` borrado) |

## Threat Model — dispositions cubiertas

| Threat   | Cómo quedó cubierto                                                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-169-27 | El ctx sale de `assertTenant(request.scope, …)`, el body declara `additionalProperties: false` y el test 5 manda `tenantId: 424242` con un staff del gimnasio 90569 y afirma que no manda |
| T-169-28 | `requireBranchAccess({ from: "body.branchId" })` sigue corriendo como preHandler antes del handler — comportamiento existente, no se tocó                                                 |
| T-169-29 | `consume()` toma el tenant de la fila reclamada y lo estampa vía `tenantValues`; el test 4 lo verifica por SELECT con un gimnasio ≠ 1                                                     |
| T-169-30 | Comentario explícito dentro del `.where()` del claim: el `user_code` es global por diseño porque el claim DESCUBRE el tenant. La exención queda grepeable para el sentinel de la 170      |
| T-169-31 | Formato `/* tenant-safe: pairing pre-claim */` con motivo + docblock que apunta a los motivos M8 de `tenant-tables.ts:249-252` en vez de repetirlos                                       |
| T-169-SC | Cero dependencias nuevas, cero installs. `node_modules` por symlink al worktree 167, creado para typechequear/testear y borrado antes de cada commit                                      |

## Estado del worktree

`/home/franco/projects/et-169-tenant-layer`, rama `feat/169-capa-escritura`, 12 commits sobre `1200b8af`:

- `c21baefd`, `f6bc7ecc` — plan 169-01
- `0426d4de`, `bb85aa64` — plan 169-02
- `dbb89644`, `f3036876` — plan 169-03
- `3f69a1fe`, `d79d5569` — plan 169-04
- `58b4ea84`, `e2d7793f` — plan 169-05
- `64629f56` — `feat(169-06): exencion anotada del pre-claim y estampado del tenant en el pairing del TV`
- `0847c8da` — `test(169-06): ciclo start->claim->consume del TV con el tenant estampado`

Nada pusheado (staging-first: el rollout es del plan 169-09). El symlink de `node_modules` está **borrado**; recrearlo apuntando a `/home/franco/projects/et-167-columnas/el-templo-api/node_modules` antes de cualquier typecheck o corrida de tests, y volver a borrarlo antes de commitear. El checkout principal `/home/franco/projects/el-templo` no se tocó: sigue en `fix/referral-preview-y-refresh-ficha` con su working tree de código intacto.

## Requirements: CON-04 sigue **Pending** a propósito

El frontmatter declara `requirements: [CON-04]` y **no se marcó completo**. Con este plan quedan cubiertos los 7 crons, el webhook y `tv_pairings`; falta el último camino sin request: los **scripts CLI** con `--tenant` obligatorio (D-06/D-07) y su retrofit. Marcarlo ahora sería un falso positivo que el verificador de fase tendría que revertir. Lo cierra el último plan de la fase, igual que decidieron los planes 01 a 05.

## Known Stubs

Ninguno.

## Self-Check: PASSED

- `el-templo-api/src/modules/tv/pairing.ts`, `control-routes.ts`, `schemas.ts` y `src/db/schema/tv.ts` presentes y modificados en el worktree.
- `el-templo-api/test/tv/tv-pairing-tenant.test.ts` presente (437 líneas).
- Commits presentes en `git log --all`: `64629f56`, `0847c8da`.
- `git status` del worktree: limpio.
