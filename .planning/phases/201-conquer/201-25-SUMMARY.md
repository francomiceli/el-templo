---
phase: 201-conquer
plan: 25
subsystem: api, db, api-tests
tags: [conquer, catalogo, anexo, migracion-0293, escalera-de-hold, uat-h3]
requires: ["201-24"]
provides:
  - "0293_conquer_catalogo_anexo.sql: catálogo del anexo de Nacho (12 escaleras, 61 peldaños, 12 ejercicios, 9 finishers, remapeo de datos existentes)"
  - "conquer_exercises.hold_ladder_id / brazos_rectos / start_steps_novillo / start_steps_ternero"
  - "catalog-service: stepLadderId(exercise, step) y startStepsFor(exercise, level)"
  - "GET /today: TodayExercise.holdRungs (aparte de rungs); TodayStep.brazosRectos sale del ejercicio"
  - "test/conquer/annex.ts + sección ANEXO de oracle-check.mjs + 0293-conquer-anexo.test.ts (paridad catálogo = anexo)"
affects: ["201-26"]
tech-stack:
  added: []
  patterns:
    - "una sola comparación catálogo-vs-anexo (annexDiffs) usada por el chequeo local (sobre el SQL) y por CI (sobre la base)"
    - "escalera por escalón: stepLadderId en vez de exercise.ladderId"
key-files:
  created:
    - el-templo-api/src/db/migrations/0293_conquer_catalogo_anexo.sql
    - el-templo-api/test/conquer/annex.ts
    - el-templo-api/test/conquer/fixtures/conquer-catalogo.md
    - el-templo-api/test/migrations/0293-conquer-anexo.test.ts
    - el-templo-api/test/unit/conquer-catalog-helpers.test.ts
  modified:
    - el-templo-api/src/db/schema/conquer.ts
    - el-templo-api/src/modules/conquer/{catalog-service,rules,settings,schemas,activation-service,level-service,history-loader,today-service,step-service,calibration-service,cuts-service,session-service,catalog-admin-service}.ts
    - el-templo-api/test/conquer/{oracle-check.mjs,_helpers.ts,members-admin,settings,today-session,steps-change,subir,calibration,recortes,ficha,progress,level-up}.test.ts
    - el-templo-api/test/migrations/0290-0292-conquer.test.ts
    - el-templo-api/test/unit/{conquer-rules,conquer-permissions}.test.ts
decisions:
  - "DA-1..DA-9 del plan adoptadas tal cual (0293 nueva, la 0292 intacta)."
  - "catalog-admin-service: RungView pierde brazosRectos pero RungAdminView lo conserva leyéndolo de la columna con una query extra (loadRungArms). Es provisorio: el contrato JSON del editor no cambia hasta que 201-26 lo rehaga."
  - "Se actualizó test/unit/conquer-permissions.test.ts (no estaba en files_modified): probaba los offsets que se borraron."
metrics:
  tasks: 4 de 4
  commits: 6 (+ este docs)
---

# Phase 201 Plan 25: Catálogo del anexo de Nacho (API de datos) Summary

La base y el API de catálogo quedan iguales al anexo `.docs/conquer-catalogo.md`: una escalera por ejercicio, escalera de hold aparte, L-sit a plancha de 7 peldaños, front lever sin `lean`, marca de brazos rectos por ejercicio, tablas explícitas de arranque por nivel (sin offsets), finishers y músculos del anexo. Hoy manda `holdRungs` aparte de `rungs`.

## Commits

- `a5f40f257` feat(201-25): catálogo del anexo de Nacho en la 0293 (escaleras por ejercicio, hold aparte, arranque por nivel)
- `d7724d2fe` test(201-25): 0293 = anexo de Nacho, idempotente y con remapeo de datos existentes
- `2bb8ed908` feat(201-25): arranque por nivel con las tablas del anexo y escalera de hold (sin offsets)
- `a2b6af347` test(201-25): tablas de arranque del anexo, helpers del catálogo y /settings solo con comboWeeksN
- `f1076629b` feat(201-25): el hold final usa su propia escalera y brazos rectos por ejercicio
- `936a50bcc` test(201-25): barrido de escaleras por ejercicio y escalera de hold

## Chequeo de numeración

`ls migrations | tail`: tope local 0292. `git fetch origin`: `origin/master` y `origin/staging` topan en 0288. `ls /home/franco/projects/et-*/el-templo-api/src/db/migrations/0293*.sql`: vacío. 0293 libre. La 0292 no cambió (`git diff d4e9870d4 -- 0292…` vacío).

## Qué hace la 0293 (111 statements, 110 breakpoints, solo `tenant_id = 1`)

A) 5 DDL (4 columnas nuevas + FK de `hold_ladder_id`). B) 12 escaleras nuevas + 8 `UPDATE` de nombre/orden/estado (`palanca` pasa a "Palanca (combos)", `lsit` queda inactiva). C) 61 peldaños `INSERT IGNORE`. D) 12 `UPDATE` de ejercicios (escalera, hold, brazos rectos, músculos y las tablas de Novillo y Ternero). E) 9 finishers del anexo §4. F) 4 remapeos (R1/R2 sobre `conquer_steps`, R3/R4 sobre `conquer_session_steps`): mismo `code` en la escalera nueva, o el peldaño activo más fácil si no existe. Se generó con un script descartable (scratchpad, no commiteado) que garantiza los templates exactos; el `.sql` es lo único que queda.

## Contratos nuevos

- `GET /api/members/conquer/today` → cada `exercises[]` trae `holdRungs` (siempre presente, `required`): las opciones de peldaño del hold final (su escalera, o la de E1-E3 si el ejercicio no tiene escalera de hold, en cuyo caso es igual a `rungs`). `rungs[]` y `holdRungs[]` ya NO traen `brazosRectos`; `steps[].brazosRectos` sale de `conquer_exercises.brazos_rectos`.
- `GET/PUT /api/admin/conquer/settings` → `{ settings: { comboWeeksN }, ranges: { comboWeeksN } }`; el body del PUT es `{ comboWeeksN }` (`minProperties: 1`). Fastify descarta `startOffsetTernero|Novillo` (un PUT que traiga solo eso responde 400).
- `ExerciseView` (catalog-service): `+ holdLadderId: number | null`, `+ brazosRectos`, `+ startStepsNovillo`, `+ startStepsTernero` (`[]` si la columna es NULL). `RungView` pierde `brazosRectos`.
- `stepLadderId(exercise, step)`: `step === "hold" ? holdLadderId ?? ladderId : ladderId`. `startStepsFor(exercise, level)` → `{ steps, fallback }`; `fallback: true` si Novillo/Ternero no tiene tabla y usa la de Toro (la activación loguea `warn`).
- `ensureStepsForPlan(tx, ctx, catalog, member, log?)` ya no recibe `settings`. `rules.ts` sin `DEFAULT_START_OFFSET` ni `shiftStartPosition`; `settings.ts` sin las claves `start_offset.*` (las filas viejas de `tenant_settings` se ignoran).
- Helper de test `readConquerSteps` suma `ladderCode`; `insertConquerSession` y `patchConquerStep` resuelven el peldaño en la escalera del escalón (hold en la de hold).

## Gates corridos

- `node --no-warnings test/conquer/oracle-check.mjs`: ORACULO OK / SEMILLA OK / MOTOR OK (14785 casos) / REGLAS OK / ANEXO OK.
- `npx tsc --noEmit`: limpio. `pnpm lint:tenant`: DISCREPANCIAS 0.
- `pnpm typecheck:tests | grep -E "test/(conquer|unit/conquer|migrations/029)"`: vacío.
- Verify de las 4 tareas (greps de forma de la 0293, de `exercise.ladderId` residual, de `any`/`console`): OK.
- Tests de vitest: NO corridos (regla del proyecto). Escritos: `0293-conquer-anexo.test.ts` (estructura, paridad, conteos 20/19/106/12/9, 10 casos del anexo, idempotencia, remapeo, solo tenant 1), `conquer-catalog-helpers.test.ts`, y ajustes/casos nuevos en los tests de Conquer.

## Mutation testing razonado

Los de la 0293 se ejecutaron de verdad contra `oracle-check.mjs` (el archivo es untracked: se revirtió regenerándolo y comparando). Los demás son razonados leyendo el test.

Tarea 1 (ejecutados, salida de `oracle-check.mjs`):
1. `brazos_rectos = 1` en `front_pullups` → `ANEXO FALLA: brazos rectos Pull-ups en front lever: anexo [false] vs base [true]`.
2. Quitar el peldaño `a_half_lay` → falla (b) en las dos escaleras de L-sit (E1-E3 y hold, 6 vs 7 peldaños).
3. Ternero `front_pullups` e3 = `lean` → `arranque ternero Pull-ups en front lever e3: anexo [tuck completa] vs base [null completa]` (`lean` no existe en esa escalera).
4. Finisher de 2 días tracción = retracciones → `finisher 2 dias Tracción: anexo [Curl…] vs base [Retracciones…]`.

Tarea 2 (razonados, `test/migrations/0293-conquer-anexo.test.ts`):
1. Sin `hold_ladder_id` en el `UPDATE` de `hspu` → falla (2) PARIDAD (línea 437, hold de HSPU = 7 peldaños vs 3 del anexo) y el caso §2 de la línea 274 (`hold_ladder_id` de los 6 ejercicios).
2. `INSERT` sin `IGNORE` en un peldaño → (5) línea 452: la re-ejecución tira Duplicate entry en `dbPool.execute` antes de llegar al `expect(after).toEqual(before)` de la línea 458.
3. R2 sin `o.ladder_id <> m.ladder_id` → en (6) `lsit_plancha:e1` (que estaba bien, `a_tuck`) pasa al más fácil (`a_lean`) y falla `expect(after.get("lsit_plancha:e1")).toEqual(control)` (línea 584).
4. Un peldaño con `tenant_id = 2` → (7) `it.each(CATALOG_TABLES)` línea 462/468 `toBe(0)` falla en `conquer_rungs`.

Tarea 3 (razonados):
1. `stepLadderId` ignora `holdLadderId` → `conquer-catalog-helpers.test.ts:57` y los `it.each` de hold de `members-admin.test.ts:215` (Novillo `planche_pushup:hold` espera `ladderCode: planche_pushup_hold`).
2. `startStepsFor` devuelve siempre Toro → `members-admin.test.ts:253` (Ternero `front_hold:e3` = `tuck`, `one_arm_archer:e2` = `archer`) y `conquer-catalog-helpers.test.ts:78`.
3. `ensureStepsForPlan` pisa filas existentes → `members-admin.test.ts:686` (`toEqual(step)` del caso "Novillo 3 a 4 días… no toca los compartidos").
4. `startStepsFor` sin `fallback` con tabla vacía → `conquer-catalog-helpers.test.ts:88` y `members-admin.test.ts:358` (tabla NULL arranca con la de Toro).

Tarea 4 (razonados):
1. `holdRungs` armado con la escalera de E → `today-session.test.ts:311` (`hspu.holdRungs` = los 3 de `hspu_hold`).
2. `TodayStep.brazosRectos` fijo en `true` → `today-session.test.ts:264` (`front_pullups` false en sus 4 escalones).
3. `changeStep` validando contra `exercise.ladderId` → `steps-change.test.ts:361` (el hold de HSPU a `vertical_en_pared` espera 200) y, al revés, la validación de T-201-93 (`pike_elevado` en el hold → 400).
4. `planMoves` con `exercise.ladderId` → `calibration.test.ts:254` (HSPU hold `pike` → `vertical_en_pared`); lo mismo para el recorte en `recortes.test.ts:335` (hold de Fondo anillas → paralelas).

## `"palanca"` que quedaron en tests

Solo los de combos (todos en `_helpers.ts`): `insertConquerSession` (columnas `combo_*`/`push_*`/`pull_*`, línea ~332) y `setComboState` (línea ~976), más `journey.test.ts:232`, `levels.test.ts:77,112,279` (peldaño de apertura/sábado del combo) y todo `combos.test.ts` (no se tocó). Los `"palanca"` de `catalog-admin.test.ts` NO se tocaron (ver trampas). Los usados para un escalón de ejercicio pasaron a la escalera del ejercicio (`steps-change`, `progress`, `recortes`, `ficha` → `planche_press`; `subir` → `planche_press` y `front_hold`; `ficha` 334 → `front_hold`). `lsit`: ningún test la usa.

## Nota para Franco (DA-8)

- Correr `pnpm db:migrate` en la base local: la 0293 se aplica sobre la base con 0290-0292 y remapea los escalones y marcas del alumno Toro de prueba (user 28) sin perder progreso.
- A los alumnos de prueba ya activados NO se les re-aplica la tabla nueva (conservan sus escalones, remapeados). Para ver las tablas del anexo de Novillo/Ternero hay que **activar un alumno nuevo**.
- Si algún escalón remapeado cae en el "más fácil" por no tener equivalente (p. ej. `lean` de un front lever), es lo esperado (DA-8).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Bloqueo] `test/unit/conquer-permissions.test.ts` probaba los offsets borrados**
- **Found during:** Tarea 3.
- **Issue:** `parseConquerSettings`, `CONQUER_SETTING_DEFAULTS` y `CONQUER_SETTING_KEYS` ya no tienen `startOffset`; el archivo no estaba en `files_modified` y habría roto `typecheck:tests` y CI.
- **Fix:** reescribí el bloque de settings para `comboWeeksN` solo, con `it.each` de las filas viejas `start_offset.*` ignoradas.
- **Commit:** a2b6af347.

**2. [Rule 3 - Bloqueo] `RungAdminView` dependía de `RungView.brazosRectos`**
- **Found during:** Tarea 4.
- **Issue:** el schema de respuesta del editor del admin exige `brazosRectos` por peldaño; sacarlo de `RungView` lo habría roto (500 por `required`).
- **Fix:** `RungAdminView` lo declara aparte y `getCatalogForAdmin` lo lee de la columna con una query más (`loadRungArms`, con `tenantWhere`). Provisorio hasta 201-26.
- **Commit:** f1076629b.

### Otros

- Las ambigüedades del plan (DA-1..DA-9) no necesitaron ninguna decisión nueva. `resolveStartRung` conserva el fallback de antes (code desconocido → activo más fácil; inactivo → más cercano hacia lo fácil).

## Trampas para 201-26

1. **`catalog-admin.test.ts` queda ROJO hasta 201-26** (el plan 26 ya lo prevé): espera 8 escaleras, `planche_press` en `palanca`, `inUse` en `tuck` de `palanca` y el 409 de arranque con `straddle` de `palanca`. Hoy `palanca` solo la usan los combos y hay 20 escaleras. No se tocó acá.
2. **`catalog-admin-service`**: `assertNotInStartSteps` y `updateExercise`/`validateStartSteps`/`activeRungCodes` siguen mirando solo `exercise.ladderId` y `start_steps` de Toro: no cubren las escaleras de hold ni las tablas de Novillo/Ternero. `ExerciseAdminView` extiende `ExerciseView` pero su schema de respuesta (`additionalProperties:false`) descarta en silencio `holdLadderId`, `brazosRectos`, `startStepsNovillo|Ternero`: sumarlos al schema o el editor no los ve.
3. **Admin**: `ConquerSettings.vue` lee `data.ranges.startOffsetNovillo.min` y `startOffsetTernero`: con el API nuevo explota (`ranges` solo trae `comboWeeksN`). Hay que sacar esos dos campos del form y de los tipos. `ConquerLadderEditor.vue` sigue mostrando `rung.brazosRectos` (viene de la columna, sin uso real).
4. **App**: `types.ts` (líneas ~110/124) todavía declara `brazosRectos` en el peldaño y no conoce `holdRungs`; el selector de peldaño del hold debe usar `exercise.holdRungs`.
5. El UAT (`201-UAT.md`) y la sección "Probar en local" deben decir que las tablas de Novillo/Ternero del anexo se ven activando un alumno NUEVO.
6. `oracle-check.mjs` REGLAS: sin `shiftStartPosition`; el caso `cutProposal toro 5` sigue esperando `bajar_escalon` (lo cambia 201-26).
7. `annex.ts` ya parsea `texts` (§9), `alerts` (§8) y `cutOrder` para que 201-26 compare textos y alertas contra el anexo.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno: no hay rutas ni superficies nuevas (el manifiesto de rutas sigue en 515). T-201-90..93 mitigados como pide el plan (remapeo solo tenant 1 con test de idempotencia, paridad local + CI, `changeStep` valida contra `stepLadderId`).

## Self-Check: PASSED
