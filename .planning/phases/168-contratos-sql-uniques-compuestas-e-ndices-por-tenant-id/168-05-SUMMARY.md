---
phase: 168-contratos-sql-uniques-compuestas-e-ndices-por-tenant-id
plan: 05
subsystem: testing
tags:
  [
    vitest,
    mysql,
    information-schema,
    multi-tenancy,
    unique-constraints,
    fail-closed,
    ci-gate,
  ]

# Dependency graph
requires:
  - plan: 168-01
    provides: "migración 0196 aplicada (y replicada por el provisioning de la base de test) con los contratos compuestos y los 4 índices secundarios"
  - plan: 168-03
    provides: "verify-tenant-uniques.ts con verifyTenantUniques/formatReport, los registros TENANT_GLOBAL_UNIQUES + TENANT_UNIQUE_ALLOWLIST y el 12º contrato"
provides:
  - "test/migrations/0196-tenant-unique-contracts.test.ts: 12 tests — introspección de INFORMATION_SCHEMA de los 12 contratos + los 4 índices secundarios + los 12 nombres viejos ausentes, y el verificador corrido como gate de CI con un test por categoría"
  - "test/db/tenant-tables.test.ts ampliado: 7 gates nuevos sobre los registros de uniques (formato de clave, tabla gym-owned, sin duplicados entre registros, motivos con contenido, M8 cerrada en 11, helpers, PLATFORM_PHYSICAL_TABLES sin solape)"
  - "Prueba en vivo del fail-closed: una unique global de prueba sobre una tabla gym-owned deja la suite en ROJO con el reporte completo en el log"
affects:
  - "168-06 (el rollout a staging y prod ya tiene su red de CI puesta; la evidencia contra las bases reales sigue siendo pnpm db:verify-uniques)"
  - "169 / 170 / 171 (el gate uniquesMissingTenantPrefix bloquea toda unique global nueva que esas fases quisieran agregar sin clasificar)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Assert de cobertura junto a los asserts fail-closed: un reporte que no miró nada devuelve todos los arrays vacíos y pasaría los cinco tests de categoría"
    - "Redundancia deliberada entre dos caminos de verificación (asserts a mano vs CONVERTED_CONTRACTS del verificador) para detectar divergencia del verificador, no de la base"
    - "Prueba manual del fail-closed inyectando el DDL de la probe DENTRO del beforeAll del test, porque el globalSetup de vitest dropea las bases per-worker al arrancar cada corrida"

key-files:
  created:
    - el-templo-api/test/migrations/0196-tenant-unique-contracts.test.ts
  modified:
    - el-templo-api/test/db/tenant-tables.test.ts

key-decisions:
  - "El archivo no llama a cleanAllTestData: el plan pedía copiar el ciclo de vida del analog 0190-0191, pero su criterio de aceptación exige que el archivo no escriba en tablas de datos y cleanAllTestData es un DELETE. Se siguió el ciclo del analog 0192-0195, que es de solo lectura"
  - "12 contratos y 12 nombres viejos, no 11 y 11: manda el handoff de 168-03 y el .sql, como ya hizo el plan 168-04"
  - "TENANT_GLOBAL_UNIQUES sigue cerrada en 11 y el test lo afirma: el 12º contrato se CONVIRTIÓ (dejó de ser global) y financial_transactions entró en la allowlist, así que M8 no cambió"
  - "El marcador de trabajo pendiente se busca en MAYÚSCULAS (TODO/FIXME/TBD/XXX) porque los motivos están en castellano y 'todo' es palabra común; 'pendiente' sí se busca sin distinguir mayúsculas"
  - "CON-01 y CON-02 siguen en Pending en REQUIREMENTS.md, igual que en 168-01/02/03/04: el contrato está probado contra la base de test, no contra eltemplo_staging ni eltemplo"

patterns-established:
  - "Un test de migración afirma DOS cosas distintas: que lo nuevo está y que lo viejo NO está. Una migración a medias cumple la primera"
  - "El test que consume un verificador agrega asserts de cobertura del propio reporte (cuántas tablas miró, cuántos índices evaluó): sin ellos el gate puede pasar sin haber verificado nada"

requirements-completed: []

# Metrics
duration: 40min
completed: 2026-07-27
---

# Phase 168 Plan 05: la 0196 y el verificador convertidos en gate de CI Summary

**La fase 168 dejó de depender de que alguien corra el verificador a mano: los 12 contratos compuestos, los 4 índices secundarios y los 12 nombres viejos ausentes se verifican por introspección de `INFORMATION_SCHEMA` en cada corrida de CI, y el mismo `verifyTenantUniques` que el CLI apunta a staging y prod corre dentro de la suite con un test por categoría de hallazgo — probado en vivo: una unique global de prueba sobre una tabla gym-owned deja la suite en ROJO con el reporte completo en el log.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-07-27T17:15Z (hora local del worktree)
- **Completed:** 2026-07-27
- **Tasks:** 3/3
- **Files modified:** 1 creado (638 líneas) + 1 modificado (+205)

## Accomplishments

### Task 1 — Introspección de la 0196 (`55c4059f`)

`test/migrations/0196-tenant-unique-contracts.test.ts`, 474 líneas iniciales, con el bloque "POR QUÉ EXISTE ESTE ARCHIVO" adaptado a esta migración en particular: `test/setup.ts:207` tolera **literalmente `"Can't DROP"`**, así que un `DROP INDEX` con el nombre equivocado no rompe el provisioning, la fila entra igual en `_migrations` y la suite entera queda en verde con la base **sin convertir**. Para una migración que son doce `DROP INDEX` + doce `ADD UNIQUE INDEX`, ese es el peor modo de falla posible. Por eso la verificación va contra `INFORMATION_SCHEMA` y **nunca** contra `_migrations`.

Los helpers de introspección (`IndexRow`, `queryRows`, `getIndexRows`) se copiaron del analog `0190-0191-tenants.test.ts` en vez de inventar otros.

Seis tests:

| Test | Qué afirma                                                                                                      |
| ---- | --------------------------------------------------------------------------------------------------------------- |
| 1    | Los 12 contratos existen, son `NON_UNIQUE = 0` y sus columnas están en el orden exacto                          |
| 1b   | Los 12 tienen `tenant_id` en `SEQ_IN_INDEX = 1` (el corazón de CON-01)                                          |
| 1c   | Los 3 contratos de tres columnas, columna por columna con su `SEQ_IN_INDEX` explícito                           |
| 2    | Los 4 índices secundarios de D-05 existen con `NON_UNIQUE = 1` sobre su columna                                 |
| 3    | Ninguno de los 12 nombres viejos sobrevive en NINGUNA tabla de la base                                          |
| 4    | `_migrations` tiene exactamente una fila de la 0196, consultada con `IN` de nombres explícitos y **sin `LIKE`** |

**"Presente lo nuevo" y "ausente lo viejo" son dos afirmaciones distintas** y el archivo hace las dos: si el `ADD` funcionó y el `DROP` falló con el error tolerado, la tabla queda con las DOS uniques y la vieja —global— sigue rechazando el alta del segundo gimnasio. Un test que solo mirara los nombres nuevos pasaría en verde en ese escenario.

**El Test 1c existe para que una unique degradada no pase.** `cost_centers`, `holidays` y `subscription_plans` son de tres columnas: verificar solo la primera dejaría pasar un `(tenant_id, name)` —más restrictivo que el contrato— que rompería altas hoy legales. Los tres se verifican completos y el test además afirma que son **3**, para que un filtro mal escrito no lo deje verificando el conjunto vacío. Los Tests 3 y 1c llevan ese mismo assert anti-vacío.

Todos los `expect` en el estilo fail-closed del repo: arrays de hallazgos contra `[]`, con mensaje que dice **qué índice falla, qué se esperaba y qué hacer**. Ningún `toBe(0)` pelado; los tres `toBe` del archivo son conteos de cobertura y llevan su mensaje.

El archivo es de **solo lectura**: no ejecuta DDL, no inserta, no borra y no llama a `cleanAllTestData` (ver Desviaciones). Las únicas apariciones de `ALTER TABLE` / `DROP INDEX` están dentro de comentarios y de mensajes de error.

### Task 2 — El verificador como gate de CI (`dbff616f`)

Segundo `describe` en el mismo archivo, con `makeQueryFn(app)` —el mismo adaptador que usa `0192-0195-tenant-columns.test.ts` con el verificador hermano de la 167— para que **el CLI que corre contra staging y prod y la suite de CI ejecuten literalmente el mismo código**. `verifyTenantUniques` se corre **una sola vez** en el `beforeAll` (recorre `INFORMATION_SCHEMA` entero) y los seis tests miran el mismo reporte.

| Test | Categoría                    | Qué bloquea                                                                              |
| ---- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| 5    | `uniquesMissingTenantPrefix` | D-14: una unique global nueva sobre tabla gym-owned sin clasificar                       |
| 6    | `tablesWithoutTenantIndex`   | CON-02 / D-11a: una gym-owned sin índice de prefijo `tenant_id`                          |
| 7    | `unclassifiedTables`         | D-11b: una tabla física fuera de las tres listas                                         |
| 8    | `staleClassifications`       | anti-podredumbre: una entrada de registro que apunta a un índice inexistente             |
| 9    | `missingConvertedContracts`  | CON-01 estructural desde el verificador, **redundante a propósito** con los Tests 1 a 1c |
| 10   | `discrepancies` + cobertura  | 0 discrepancias, con `formatReport(report)` DENTRO del mensaje del `expect`              |

El mensaje del Test 5 nombra tabla, índice, la columna que quedó primera y **las dos salidas posibles** (componer el índice con `tenant_id` en una migración, o clasificarlo en `tenant-tables.ts` con el motivo escrito, que tiene que nombrar la FK padre concreta o el módulo Templo concreto). El Test 9 dice explícitamente que, si él está rojo y los Tests 1-1c verdes, el desacuerdo está en `CONVERTED_CONTRACTS` del verificador y **no en la base** — que es justo lo que no queremos descubrir el día del rollout.

El archivo **consume** el verificador: importa `verifyTenantUniques` y `formatReport` y no reimplementa ni una query de clasificación.

**Prueba en vivo del fail-closed (T-168-20).** Se creó una unique global de prueba sobre una tabla gym-owned (`activities`, índice `uq_probe_fail_closed_168` sobre `id`) y la suite quedó en ROJO en los dos lugares esperados:

```
× Test 5: toda unique de tabla gym-owned arranca con tenant_id o está clasificada (D-14)
  - activities.uq_probe_fail_closed_168 (id): la primera columna es `id`, no `tenant_id`.
× Test 10: el reporte cierra en 0 discrepancias y cubre las 87 tablas gym-owned
  - activities.uq_probe_fail_closed_168 (id) — la primera columna es `id`.
  DISCREPANCIAS: 1
```

El log de CI trae el reporte completo (T-168-21 verificada en vivo, no por inspección). La probe fue **revertida** antes de cerrar el task: `SELECT COUNT(*) FROM information_schema.STATISTICS WHERE INDEX_NAME='uq_probe_fail_closed_168'` sobre TODAS las bases del server devuelve **0**, y el archivo no contiene ninguna referencia a ella.

### Task 3 — Gate anti-podredumbre de los registros (`1200b8af`)

`test/db/tenant-tables.test.ts` sumó un `describe` de 7 tests **sin tocar los 5 de la fase 167 ni sus conteos duros**: 87 gym-owned, 4 exentas y 91 tablas del schema siguen intactos y en verde, como corresponde a una fase que no agrega tablas.

- **Formato de clave** — `tabla.indice` con exactamente un punto y las dos mitades no vacías. El mensaje recuerda que son los nombres **físicos** de `INFORMATION_SCHEMA`, no los de las constantes TypeScript ni los de las columnas.
- **Tabla gym-owned** — la parte de tabla de toda clave existe en `GYM_OWNED_TABLES`. Una clave sobre una tabla exenta o inexistente es una clasificación muerta: el verificador nunca va a preguntar por ella.
- **Sin duplicados entre registros** — ninguna clave está en M8 y en la allowlist a la vez. Son dos afirmaciones excluyentes y duplicarlas deja dos motivos que divergen.
- **Motivos con contenido real** — se rechazan las cadenas vacías, las de solo espacios y los marcadores de trabajo pendiente.
- **M8 cerrada en 11** — con el mensaje que explica por qué es una **decisión de diseño** y no de implementación, y que apunta a la allowlist como el lugar correcto para una unique nueva que sea segura por transitividad o deuda de módulo (precedente: `financial_transactions`, plan 168-03).
- **Los tres helpers** — `isTenantGlobalUnique` distingue M8 de allowlist (una entrada de allowlist devuelve `false`), `isAllowedGlobalUnique` acepta las dos y rechaza lo no clasificado (fail-closed), y `tenantUniqueMotive` devuelve el motivo escrito para las dos y `undefined` para un par inexistente. Se prueban contra **entradas reales y vivas** de cada registro, no contra un fixture inventado: si alguna se renombrara, el test cae.
- **`PLATFORM_PHYSICAL_TABLES`** sin solape con gym-owned ni con exentas.

Lo que este bloque protege y el verificador de base **no puede** proteger: `verify-tenant-uniques.ts` atrapa las entradas que apuntan a un índice inexistente, pero no puede opinar sobre la **forma** de una entrada. Una clave con dos puntos, una clave sobre una tabla exenta o un motivo `"TODO: ver después"` pasarían su gate en verde y dejarían el registro inauditable.

## Task Commits

| Task | Nombre                                     | Commit     | Archivos                                                           |
| ---- | ------------------------------------------ | ---------- | ------------------------------------------------------------------ |
| 1    | Introspección de la 0196 (12 contratos)    | `55c4059f` | `test/migrations/0196-tenant-unique-contracts.test.ts` (+474 / −0) |
| 2    | El verificador como gate fail-closed de CI | `dbff616f` | mismo archivo (+164 / −0)                                          |
| 3    | Gate anti-podredumbre de los registros     | `1200b8af` | `test/db/tenant-tables.test.ts` (+205 / −0)                        |

Los tres commits viven en el worktree `/home/franco/projects/et-168-contratos`, rama `feat/168-contratos-sql`, sobre `a0216641`. **Nada fue pusheado.**

## Verification

- `npx tsc --noEmit` en `el-templo-api`: **exit 0** después de cada task. Cero `any` en los dos archivos.
- `npx vitest run test/migrations/0196-tenant-unique-contracts.test.ts`: **12 tests, 12 passed**.
- `npx vitest run test/db/tenant-tables.test.ts`: **12 tests, 12 passed** (los 5 originales de la 167 + los 7 nuevos), con 87 / 4 / 91 sin modificar.
- Los dos archivos juntos en un solo worker (`--no-file-parallelism`): **24 tests, 24 passed**. Con paralelismo de archivos el `beforeAll` del provisioning excede su timeout de 120 s en esta máquina — **condición preexistente**, reproducida con dos archivos que la 168 no tocó (ver Desviaciones).
- Prettier `--check` con el binario local del proyecto: limpio en los dos archivos. **Nunca `npx prettier`** (intenta descargar el paquete).
- Grep de escritura sobre el test nuevo: las únicas apariciones de `ALTER TABLE` / `DROP INDEX` / `INSERT` están en comentarios y mensajes de error. Cero DDL ejecutado, cero filas escritas.
- Fail-closed probado en vivo y revertido: 0 índices `uq_probe_fail_closed_168` sobrevivientes en ninguna base del server.
- Credenciales de MySQL siempre por `MYSQL_PWD`, nunca en la línea de comandos.
- Cero `pnpm install` / `npm install`.

## Deviations from Plan

### Derivadas del handoff de 168-03

**1. Son 12 contratos y 12 nombres viejos, no 11 y 11**

- **Found during:** lectura del handoff, antes del Task 1
- **Issue:** el `<interfaces>` del plan lista 11 contratos compuestos y 11 índices viejos, y el objetivo dice "las 11 uniques compuestas". El plan se escribió antes de que el gate del 168-03 encontrara `subscription_plans.ux_subscription_plans_name_country`. El handoff es explícito: _"todo test o assert que cuente contratos convertidos tiene que decir 12"_, y el `.sql` manda.
- **Fix:** `CONTRATOS_COMPUESTOS` tiene 12 entradas (la doceava con la procedencia del hallazgo escrita en un comentario) e `INDICES_VIEJOS` tiene 12 nombres, con un assert explícito de `length === 12` para que la lista no se pueda vaciar por un refactor. Los tres contratos de tres columnas son `cost_centers`, `holidays` y `subscription_plans`.
- **Files modified:** `test/migrations/0196-tenant-unique-contracts.test.ts`
- **Commit:** `55c4059f`

**2. `TENANT_GLOBAL_UNIQUES` sigue en 11 y el test lo afirma tal como pedía el plan**

No es una desviación, pero conviene dejarlo escrito porque el "12" de arriba invita a confundirlo: el doceavo contrato se **convirtió** (dejó de ser global) y `financial_transactions.uq_financial_tx_idempotency_key` entró en la **allowlist**, no en M8. La lista M8 no cambió desde su aprobación del 2026-07-26, así que el conteo duro de 11 del Task 3 quedó tal cual.

### Auto-fixed / decisiones de implementación

**3. [Rule 2 - Correctness] El archivo NO llama a `cleanAllTestData`**

- **Found during:** Task 1
- **Issue:** el `<action>` del plan pide copiar el ciclo de vida del analog `0190-0191-tenants.test.ts` (`cleanAllTestData` en `beforeEach` y `afterAll`), pero el criterio de aceptación del mismo task exige que el archivo **no escriba en tablas de datos**. `cleanAllTestData` es un `DELETE` sobre 40+ tablas: cumplir el ciclo de vida al pie de la letra habría violado el criterio.
- **Fix:** se usó el ciclo de vida del OTRO analog que el plan cita, `0192-0195-tenant-columns.test.ts` (`createTestApp` en `beforeAll`, `app.close()` en `afterAll`, sin limpieza), que es exactamente el patrón de un archivo de solo lectura. Un archivo que no escribe no tiene nada que limpiar, y no borrando nada tampoco puede molestar a las suites vecinas del mismo worker.
- **Files modified:** `test/migrations/0196-tenant-unique-contracts.test.ts`
- **Commit:** `55c4059f`

**4. [Rule 2 - Correctness] Asserts de cobertura del reporte, que el plan no pedía**

- **Found during:** Task 2
- **Issue:** los cinco tests de categoría comparan arrays del reporte contra `[]`. Un reporte que **no miró nada** —lista de tablas vacía, base equivocada, query rota— devuelve los cinco arrays vacíos y pasa los cinco tests. El gate quedaría verde sin haber verificado nada, que es el modo de falla clásico de este tipo de test.
- **Fix:** el Test 10 afirma además `gymOwnedChecked === 87` (las tablas de la fase 167) y `uniquesChecked >= 48` (las 48 uniques clasificadas en `tenant-tables.ts`), cada uno con su mensaje. Los Tests 1c y 3 llevan el mismo tipo de assert anti-vacío sobre sus listas.
- **Files modified:** `test/migrations/0196-tenant-unique-contracts.test.ts`
- **Commit:** `dbff616f`

**5. [Rule 3 - Blocking] La probe del fail-closed hubo que inyectarla DENTRO del test**

- **Found during:** Task 2, prueba manual del criterio de aceptación
- **Issue:** el primer intento creó `uq_probe_fail_closed_168` directamente en `eltemplo_test_1` por SQL y corrió la suite: **12 tests en verde**. La probe no había fallado en probar nada — `vitest.config.ts` declara un `globalSetup` (`test/setup-global.ts`) que **dropea las bases per-worker al arrancar cada corrida**, así que el índice se borraba junto con la base antes de que el test lo viera. Sin entender eso, la conclusión habría sido "el gate no es fail-closed", que es falsa.
- **Fix:** se inyectó el `ALTER TABLE ... ADD UNIQUE INDEX` en el `beforeAll` del `describe`, antes de la llamada a `verifyTenantUniques` — es decir, **después** del provisioning. La suite quedó en rojo en los Tests 5 y 10, con el reporte completo. La inyección se revirtió del archivo y se verificó por SQL que no queda ningún índice con ese nombre en ninguna base del server.
- **Files modified:** ninguno (la edición fue temporal y está revertida)
- **Commit:** —

**6. Dos archivos de test en paralelo revientan el timeout del provisioning en esta máquina (preexistente)**

- **Found during:** verificación final
- **Issue:** correr los dos archivos de este plan en una sola invocación de vitest falla con `Hook timed out in 120000ms` en `test/setup.ts:244` y **24 tests skipped**. Con paralelismo de archivos, dos workers provisionan dos bases (`eltemplo_test_1` y `eltemplo_test_2`) contra el mismo MySQL a la vez y el `beforeAll` pasa de los 120 s.
- **Fix:** se reprodujo con dos archivos que este plan **no tocó** (`0190-0191-tenants.test.ts` + `0192-0195-tenant-columns.test.ts`): **el mismo fallo**. Es una condición preexistente de la máquina local, no del código de esta fase. Con `--no-file-parallelism` los dos archivos de la 168 dan 24/24 en verde. La regla del repo es que la suite completa corre en CI; las corridas angostas son sanity-check.
- **Files modified:** ninguno
- **Commit:** —

**7. CON-01 y CON-02 no se marcaron completos en REQUIREMENTS.md**

Mismo criterio que 168-01, 168-02, 168-03 y 168-04: el frontmatter del plan declara `requirements: [CON-01, CON-02]`, pero lo que este plan prueba está en la base de test, no en `eltemplo_staging` ni en `eltemplo`. Los cierra el 168-06 (rollout) o el verificador de fase.

**8. El plan decía "Sin commit: el commit único de la fase lo arma el plan 168-06"**

Se commiteó igual, por task, como mandan el orquestador y el patrón ya establecido por los planes 168-02, 168-03 y 168-04 de esta misma fase.

## Threat Model — resultado

| Threat ID | Resultado                                                                                                                                                                                                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-168-19  | **Mitigada.** Todo se verifica contra `INFORMATION_SCHEMA`; `_migrations` solo se consulta para la idempotencia y con lista explícita de nombres. Los 12 nombres viejos se exigen **ausentes** además de exigir presentes los 12 nuevos — una migración a medias cumple una sola. |
| T-168-20  | **Mitigada y probada en vivo.** Una unique global de prueba sobre `activities` dejó los Tests 5 y 10 en rojo. Probe revertida y verificada ausente en todas las bases del server.                                                                                                 |
| T-168-21  | **Mitigada y verificada en vivo.** El fallo del Test 10 imprimió `formatReport(report)` completo, con `DISCREPANCIAS: 1` y el detalle del hallazgo, en el log de la corrida.                                                                                                      |
| T-168-22  | Mitigada. El test importa `verifyTenantUniques` y `formatReport` y no duplica ninguna query de clasificación. El Test 9 es redundante a propósito con los Tests 1 a 1c y su mensaje explica cómo leer un desacuerdo entre los dos caminos.                                        |
| T-168-23  | Mitigada por dos vías: `staleClassifications` (Test 8) para las entradas que apuntan a un índice inexistente, y los gates de forma del Task 3 (clave, tabla gym-owned, motivo con contenido) para lo que el verificador de base no puede ver.                                     |
| T-168-SC  | Mitigada. Solo `vitest` y `drizzle-orm`, ya presentes. Cero `pnpm install` / `npm install`, cero cambios en `package.json` y `pnpm-lock.yaml`. Prettier siempre por el binario local del proyecto.                                                                                |

## Known Stubs

Ninguno. Los dos archivos verifican el contrato completo de la fase. Lo que falta es alcance explícito del plan 168-06: aplicar la 0196 a `eltemplo_staging` y `eltemplo` y correr `pnpm db:verify-uniques` contra las dos bases.

## Threat Flags

Ninguna superficie nueva de red, auth o acceso a archivos: el plan agrega tests.

## Notas para el plan siguiente (168-06)

- **Los tests de este plan NO ven staging ni prod.** Corren contra `eltemplo_test_<POOL_ID>`, que el provisioning arma aplicando los `.sql` desde cero. La evidencia contra las bases reales sigue siendo `pnpm db:verify-uniques` (D-12) — y es el MISMO código, así que el criterio de "correcto" no puede divergir entre CI y el rollout.
- **Qué esperar en staging y prod:** `discrepancies` 0, el warning de M8 en 11/11, y `gymOwnedChecked` en 87. El warning de tablas de backup va a diferir por base (prod tiene al menos `users_lead_backup_0183`) y **no** es un problema.
- Si en alguna base `tablesWithoutTenantIndex` diera distinto de 0, mirar primero `subscription_plans`: InnoDB dropeó solo su índice `fk_subscription_plans_tenant` al crear la unique compuesta (la FK sigue viva y la propia unique compuesta cubre el prefijo). Es esperable que pase lo mismo en staging y prod.
- **En esta máquina, correr más de un archivo de test a la vez revienta el timeout del provisioning.** Usar `--no-file-parallelism` para los sanity-checks locales. En CI corre la suite completa con su propia configuración.
- El gate queda vivo después de la fase: cualquier fase futura (169, 170, 171, módulos) que agregue una unique global sobre una tabla gym-owned sin clasificarla deja CI en rojo, con el mensaje que explica las dos salidas.

## Self-Check

- `el-templo-api/test/migrations/0196-tenant-unique-contracts.test.ts` — FOUND (worktree `et-168-contratos`, 638 líneas)
- `el-templo-api/test/db/tenant-tables.test.ts` con `TENANT_GLOBAL_UNIQUES` — FOUND
- Commit `55c4059f` — FOUND
- Commit `dbff616f` — FOUND
- Commit `1200b8af` — FOUND
- `npx tsc --noEmit` — PASSED (exit 0)
- `npx vitest run` de los dos archivos (`--no-file-parallelism`) — PASSED (24/24)
- Fail-closed probado en rojo y revertido, 0 probes sobrevivientes — PASSED
- Checkout principal en `fix/referral-preview-y-refresh-ficha` con su working tree ajeno intacto — VERIFICADO

## Self-Check: PASSED
