---
phase: 171-backstop-manifiesto-de-rutas-fail-closed-y-fixtures-2-tenant
plan: 05
subsystem: testing
tags:
  [multi-tenancy, fixtures, ISO-02, verificacion-por-comportamiento, regresion]

# Dependency graph
requires:
  - phase: 171-04
    provides: "`test/fixtures/second-tenant.ts` (`seedSecondTenant` / `limpiarSegundoGimnasio` / `TENANT_DOS` = 90671) y los helpers `createStaffUser` / `createTestMember` con `tenantId` opcional"
  - phase: 169-capa-de-escritura-helpers-tenantwhere-tenantvalues-y-tenantc
    provides: "El idioma de las aserciones contra la BASE (`test/tenancy/tenant-helpers.test.ts`, `test/tv/tv-pairing-tenant.test.ts`)"
provides:
  - "`test/tenancy/iso-02-fixtures.test.ts` — 13 tests que prueban por comportamiento que el espejo del gimnasio 2 nace con su `tenant_id`, que los helpers sin `tenantId` siguen escribiendo en El Templo y que la limpieza no deja rastro"
  - "Evidencia registrada del criterio 4 del ROADMAP: 3 archivos existentes expuestos, corridos en verde SIN tocar una línea"
affects:
  [
    172-175 (toda batería de aislamiento se siembra con un fixture ya verificado),
    171-06 (último plan de la fase — checkpoint humano de ISO-01),
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Aserción de doble lado por gimnasio: la fila aparece filtrando por SU tenant y NO aparece filtrando por el otro (media aserción pasaría en verde con el fixture sembrando en el tenant 1)"
    - "Discriminador de camino por columna colateral: `gender` distingue el camino `/auth/register` del INSERT directo sin acoplarse a los ids"
    - "Gate de opt-in por `fs` sobre el setup global, con guard de que se leyó el archivo correcto"

key-files:
  created:
    - el-templo-api/test/tenancy/iso-02-fixtures.test.ts
  modified: []

key-decisions:
  - "El tercero de la regresión salió del grep que pide el plan (`createStaffUser` por archivo): `test/reports-trial-sessions.test.ts` con 6 usos, el máximo del repo"
  - "`gender` como prueba de que `createTestMember` sin `tenantId` sigue yendo por `POST /api/auth/register`: la ruta persiste la columna y el INSERT directo del camino del gimnasio 2 no la toca"
  - "Las tablas del espejo se interpolan con `sql.raw` sobre una UNION CERRADA de literales, nunca sobre un `string` libre"
  - "13 tests en vez de los 8 mínimos: una familia de entidad por test, para que el rojo diga qué pieza del espejo se rompió"

patterns-established:
  - "Batería de verificación de fixture: `beforeEach` = `cleanAllTestData` → `seed*`, `afterAll` = `cleanAllTestData` → `limpiar*` → `close`, y un `describe` de higiene que afirma la limpieza con conteos en 0"

requirements-completed: [ISO-02]

# Metrics
duration: ~45min
completed: 2026-07-29
---

# Phase 171 Plan 05: Verificación del fixture del gimnasio 2 (ISO-02) Summary

**Las 7 piezas del espejo de D-06 nacen con `tenant_id = 90671` afirmado por `SELECT tenant_id` sobre la fila real y con exclusión explícita del tenant 1, los helpers sin `tenantId` siguen escribiendo en El Templo, la limpieza no deja rastro, y los 3 archivos existentes más expuestos siguen verdes sin que se les tocara una línea.**

## Performance

- **Duration:** ~45 min (4 corridas MySQL-backed: 1 de la batería nueva + 3 de regresión, ~100 s cada una)
- **Completed:** 2026-07-29
- **Tasks:** 2/2
- **Files modified:** 1 creado, 0 modificados

## Accomplishments

- **`test/tenancy/iso-02-fixtures.test.ts`: 13/13 verde en 102,8 s** contra el MySQL de test por worker. Ninguna aserción mira un body HTTP ni el handle que devuelve el fixture — la evidencia es siempre `SELECT tenant_id` sobre la fila realmente creada (T-171-16).
- **Cada una de las 7 piezas del espejo se afirma por separado** (sede, actividad, plan, horario, admin, coach y los 2 socios), más el `user_branches` del coach — el segundo INSERT de `createStaffUser`, que es el que se olvida siempre.
- **Doble lado de verdad, no de nombre.** El test 8 crea un socio del tenant 1 EN EL MOMENTO y cruza las dos listas en las dos direcciones: los 4 usuarios del gimnasio 2 aparecen filtrando por 90671 y no por 1; el socio de El Templo y el `admin@test.com` semilla, al revés. Lo mismo con las sedes. Una aserción de sola inclusión pasaría en verde con el fixture sembrando todo en el tenant 1, que es exactamente el fallo que este archivo vino a atrapar.
- **La cardinalidad del espejo es exacta** (1 sede, 1 actividad, 1 plan, 1 horario, 4 usuarios, 1 `user_branches`): de más significa que `seedSecondTenant` dejó de ser idempotente; de menos, que una pieza cayó en otro gimnasio.
- **Retrocompatibilidad probada, no asumida (criterio 3 del ROADMAP).** `createStaffUser` sin `tenantId` deja la fila —y su `user_branches`— en el tenant 1; `createTestMember` sin `tenantId` también, y **sigue pasando por `POST /api/auth/register`**, afirmado por una columna que sólo escribe la ruta.
- **Higiene con guard: `limpiarSegundoGimnasio` deja las 6 tablas del espejo en 0 filas para el gimnasio 2 y la fila de `tenants` borrada, con El Templo intacto** (su fila, su sede semilla y su admin, los tres verificados).
- **El gate de opt-in (D-05) es fail-closed en los dos sentidos:** además de exigir 0 menciones del fixture en `test/setup.ts`, exige que el archivo leído contenga `provisionWorkerDB` — un gate que lee el archivo equivocado no es un gate.
- **Regresión dirigida del criterio 4: 3 archivos, 62 tests, exit 0, y `git status --porcelain el-templo-api/test/` vacío.** Cero ajustes de expectativas.

## Task Commits

1. **Task 1: `test/tenancy/iso-02-fixtures.test.ts` — el espejo es real y la limpieza no deja rastro** — `f661cd9a` (test)
2. **Task 2: Regresión dirigida del criterio 4** — sin commit: el plan declara `<files>(ninguno — corridas de verificacion, sin edits)</files>` y la evidencia es esta sección del SUMMARY. Que **no** haya diff es literalmente el criterio de aceptación.

## Files Created/Modified

- `el-templo-api/test/tenancy/iso-02-fixtures.test.ts` **(nuevo, 585 líneas)** — docblock de cabecera con `POR QUÉ EXISTE ESTE ARCHIVO`, `LO QUE SE AFIRMA`, `QUÉ NO ES ESTE ARCHIVO` (no es la batería de aislamiento: eso es ISO-03, fase 172) y `CÓMO CORRERLO`. Helpers locales `consultar` / `contarTenant` / `tenantDeLaFila` / `idsDelGimnasio` / `emailsDelGimnasio` / `pareceJwt`, y tres `describe`: **A** el espejo (tests 1-9), **B** retrocompatibilidad (10-11), **C** higiene (12-13).

## Decisions Made

- **El tercero de la regresión se eligió ANTES de correr, con el grep que pide el plan.** `grep -c "createStaffUser" test/*.test.ts | sort -t: -k2 -rn | head -1` → **`test/reports-trial-sessions.test.ts` con 6 usos** (segundo: `programs.test.ts` con 4). Es el archivo del repo que más veces ejercita el helper que la fase 171 modificó, así que es el que más chances tenía de romperse si el `tenantId ?? 1` estuviera mal.
- **`gender` como discriminador del camino de `createTestMember`.** Las columnas que el 171-04 espejó a propósito (`role`, `level`, `status`, `branch_source`) son idénticas en los dos caminos, así que no sirven para distinguirlos — ése era justamente el objetivo del diseño. `gender` sí: `registerUser` lo manda en el payload y la ruta lo persiste, mientras que el INSERT directo del camino del gimnasio 2 no toca la columna. Un `NULL` ahí significa que el helper se fue por la bifurcación equivocada, que es el fallo que rompería a los ~215 call sites (se saltearían los efectos colaterales de register: código de referido, `member_profiles`, promo code).
- **`sql.raw` sobre una union cerrada de 6 literales** (`TablaDelEspejo`), no sobre un `string`. El nombre de tabla no puede venir de datos, y el tipo lo garantiza en compilación.
- **13 tests en vez de los 8 mínimos que pide el plan.** Una familia de entidad por test hace que el rojo nombre la pieza rota en vez de dejar un `expect` gigante donde el primer fallo tapa a los siguientes (CLAUDE.md: "err on the side of too many tests"). El costo es de ~1 s por test —el `beforeEach` completo corre 13 veces— sobre un archivo que ya paga ~90 s de provisioning.
- **La fila conocida de El Templo para las exclusiones es `admin@test.com`, resuelta por email en el momento**, no un id hardcodeado: es el único usuario que sobrevive a `cleanAllTestData`, así que está garantizado que existe y que es del tenant 1.

## Deviations from Plan

Ninguna deviation de las reglas 1-4. Dos precisiones sobre la letra del plan, ambas por el lado de afirmar **más**, no menos:

- El plan pedía como aserción de doble lado que "todas las devueltas tengan `tenantId === TENANT_DOS`". Con una consulta que ya filtra por `WHERE tenant_id = 90671`, ese `every` es una tautología y no puede fallar nunca. Se reemplazó por la forma que sí atrapa el fallo real: la fila sembrada tiene que aparecer en la lista del gimnasio 2 **y estar ausente** de la lista de El Templo — si el fixture hubiera sembrado en el tenant 1, esa segunda mitad se cae. Se sumaron además contrapartes vivas de El Templo (un socio recién creado y el admin semilla) para que el cruce sea en las dos direcciones y no sólo en una.
- El plan menciona "1 sede, 1 plan, 1 schedule, 1 actividad y 4 usuarios" para la cardinalidad; se agregó el `user_branches` del coach (1) porque es la sexta tabla gym-owned que el fixture escribe y quedaría sin cubrir.

**Total deviations:** 0 auto-fixes. **Impacto:** ninguno sobre otros archivos.

## Regresión dirigida del criterio 4 (Task 2)

Los tres archivos se corrieron **encadenados con `&&` en una sola invocación**, uno por vez (nunca dos vitest en paralelo: el provisioning de la DB por worker se pisa), con `--hookTimeout=250000`. Salida: **exit 0**.

| Orden | Archivo                              | Por qué es el expuesto                                                                                  | Resultado                     |
| ----- | ------------------------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 1     | `test/branch-access.test.ts`         | El más expuesto a una sede extra en la base del worker (el RESEARCH verificó que usa `toContain` / `not.toContain` y no conteos exactos de sedes) | **33 passed, 2 todo** (100,4 s) |
| 2     | `test/tv/tv-pairing-tenant.test.ts`  | El precedente 169-06: siembra su propio segundo gimnasio (90569) y es el que se rompería si el fixture nuevo pisara ids o dejara residuo             | **6 passed** (101,2 s)          |
| 3     | `test/reports-trial-sessions.test.ts` | El tercero elegido por el grep: 6 usos de `createStaffUser`, el máximo del repo                          | **23 passed** (115,3 s)         |

`git status --porcelain el-templo-api/test/` después de las tres corridas: **vacío**. Ningún test existente cambió de expectativa; el único archivo nuevo bajo `test/` es el de este plan, ya commiteado.

**El criterio 4 completo lo cierra CI, no esta máquina.** La suite entera (~232 archivos) corre en el job `api-test` del workflow de CI contra MySQL 8.0, y ésa es la corrida que vale como cierre formal de "la suite completa sigue verde". Local sólo se corren los archivos que el plan nombra: es la regla del skill `el-templo-change-control` y de la memoria del proyecto, y con ~100 s por archivo la suite local no es una opción realista. Lo que esta regresión aporta es evidencia **dirigida** sobre los tres archivos con mayor probabilidad a priori de romperse; el resto lo confirma CI.

## Issues Encountered

- **`el-templo-api` no tiene configuración de ESLint propia** (`eslint.config.*` ausente en el paquete y en la raíz del worktree), así que `pnpm exec eslint` falla con "couldn't find a config file". No es una regresión de este plan ni algo que este plan deba arreglar: el archivo pasó Prettier (`--write`, sin cambios de contenido más allá del formato) y CI corre su propio lint. Anotado para que no se lea como un paso salteado.
- **Aviso de vitest 4:** `test.poolOptions was removed in Vitest 4`. Preexistente en `vitest.config.ts`, aparece en toda corrida del repo y no afecta el resultado. Fuera de alcance (regla de scope).

## Verification

| Criterio del plan                                                                          | Resultado                                                              |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `pnpm exec vitest run test/tenancy/iso-02-fixtures.test.ts --hookTimeout=250000`, ≥ 8 tests | **13/13 verde**, exit 0 (102,8 s)                                       |
| `grep -c "tenantId: schema\|tenant_id"` ≥ 6                                                 | **18**                                                                  |
| `grep -c "not.toContain\|not.toBe(1)\|!=="` ≥ 1                                             | **8**                                                                   |
| `grep -c ": any\|console\."` = 0                                                            | **0**                                                                   |
| Líneas del archivo (mínimo 200)                                                             | **585**                                                                 |
| El test 13 se cae si alguien enchufa `seedSecondTenant` a `test/setup.ts`                    | Hoy da 0 menciones; el `expect` compara la lista de marcas contra `[]` y el guard exige `provisionWorkerDB` en el contenido leído |
| Los 3 archivos de regresión encadenados con `&&`                                            | **exit 0** — 33+2 todo, 6 y 23 tests                                    |
| `git status --porcelain el-templo-api/test/` (sin los 3 archivos de regresión)              | **vacío**                                                               |
| Archivos nuevos bajo `src/db/migrations/`                                                   | ninguno                                                                 |
| `git status --porcelain el-templo-api/pnpm-lock.yaml`                                       | vacío — cero deps nuevas (T-171-SC)                                     |
| Prettier                                                                                    | aplicado, archivo conforme                                              |

## Known Stubs

Ninguno.

## User Setup Required

None — no se requiere configuración externa.

## Next Phase Readiness

- **ISO-02 queda marcado completo.** Su enunciado —"fixtures de test siembran 2 tenants; helpers (`createStaffUser` y afines) soportan crear staff/socios por tenant"— está entregado por el 171-04 y **probado por comportamiento** por este plan, y ningún plan posterior de la fase lo reclama (`171-06` declara `requirements: [ISO-01]`). El matiz honesto: el **criterio 4 del ROADMAP** (la suite COMPLETA verde) queda respaldado por la regresión dirigida de arriba y cerrado formalmente por CI, no por esta máquina.
- Las fases **172-175** pueden sembrar el gimnasio 2 sabiendo que el fixture escribe donde dice: la trampa del `DEFAULT 1` (T-168-15), que mordió dos veces en la fase 169, ya no puede pasar en silencio para estas 6 tablas.
- **Recordatorio para quien agregue una pieza al fixture:** hay que tocar tres lugares a la vez, y los tres tienen su test acá — el `seed*` (o el test de cardinalidad se cae), el `limpiar*` con su DELETE en la posición correcta de FK (o el test 12 se cae) y `TABLAS_DEL_ESPEJO` en este archivo.
- Queda **`171-06`**, el checkpoint bloqueante: Franco revisa las listas `global` y `templo-module` y las dudosas del manifiesto (D-03/D-04). Es `autonomous: false`.

## Self-Check: PASSED

- `el-templo-api/test/tenancy/iso-02-fixtures.test.ts` existe en disco.
- Este SUMMARY existe en disco.
- El commit de tarea `f661cd9a` existe en `git log`.

---

_Phase: 171-backstop-manifiesto-de-rutas-fail-closed-y-fixtures-2-tenant_
_Completed: 2026-07-29_
