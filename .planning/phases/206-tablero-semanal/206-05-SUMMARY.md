---
phase: 206-tablero-semanal
plan: 05
subsystem: api
tags: [weekly-board, matrix, calculator, service, contract]
requires: [206-04]
provides:
  - "weekly-board/types.ts: WeeklyBoardResponse y contrato completo, BOARD_METRICS (21 filas)"
  - "weekly-board/matrix.ts: deriveMetricValues, sumBranchValues, buildBoardMetrics (puro)"
  - "weekly-board/calculator.ts: BoardCalculator (computeWeekFlows, computePointInTime, computeLate, composeMain)"
  - "weekly-board/service.ts: WeeklyBoardService.getBoard, upsertLeads"
affects: [206-06, 206-07, 206-08, 206-09]
key-files:
  created:
    - el-templo-api/src/modules/weekly-board/types.ts
    - el-templo-api/src/modules/weekly-board/matrix.ts
    - el-templo-api/src/modules/weekly-board/calculator.ts
    - el-templo-api/src/modules/weekly-board/service.ts
    - el-templo-api/test/weekly-board/matrix.test.ts
key-decisions:
  - "Un bloque null en BranchWeekValues significa 'sin dato de esa sede': en un bloque congelado no aporta ni anula el Total, en uno en vivo anula (fix del revisor)"
  - "El estado congelado se decide por la presencia de la foto (resolveBlockState), nunca por la fecha"
requirements-completed: [SC-3, SC-4, SC-5, SC-6, SC-7, D-02, D-05, D-11, D-12, D-15, D-16, D-20, D-21, D-22, D-24, D-25, D-26, D-27]
completed: 2026-11-03
---

# Phase 206 Plan 05: Corazon del Tablero en el API Summary

Contrato de respuesta, armado puro de la matriz (por sede, Total por pais, Online informativo, porcentajes desde conteos, semana anterior), calculadora de una pasada por fuente y servicio que decide foto vs vivo por bloque y guarda leads.

## Commits

| Commit | Subject |
| --- | --- |
| 9f7a48de2 | test(206-05): armado de la matriz del tablero (RED) |
| d9f11e65a | feat(206-05): contrato y armado de la matriz del tablero |
| 59e7cdae7 | feat(206-05): calculadora del tablero sobre las fuentes por sede |
| b804e94ae | feat(206-05): servicio del tablero (foto vs vivo) y carga de leads |

## Que se hizo

- `types.ts`: el `<contract>` del plan tal cual (`BoardMetricKey`, `BOARD_METRICS` con 21 entradas y `freeze`, `BoardCell`, `BoardMetric`, `BoardGroup`, `BoardBlockInfo`, `BoardWarning`, `WeeklyBoardResponse`, `LeadsUpsertInput/Result`, `BoardBranch`, `MainBlockValues`, `LateBlockValues`, `BranchWeekValues`). Extra exportados: `BoardBlockName`, `BoardUnit`, `BoardMetricFreeze`, `BoardMetricDef`.
- `matrix.ts` (puro): `deriveMetricValues` usa `kpisFromTally` para los 3 % del embudo y `renewalRateFrom` para renovacion (cero formulas a mano; `pctReserva` = reservas / leads solo con leads > 0). `sumBranchValues(list, { leads, frozenBlocks })` suma bloque a bloque. `buildBoardMetrics` deriva una vez por columna y semana y arma las 21 filas.
- `calculator.ts`: una llamada por fuente y semana (5 metodos por sede), ceros explicitos para cada sede, cobrado/deuda en la moneda de la sede, otras monedas como `BoardWarning` + `log.warn`.
- `service.ts`: `getBoard(ctx, scope, { weekStart? }, now)` y `upsertLeads(ctx, input, userId, now)`.

## Fix del revisor (sede nueva en bloque congelado)

`sumBranchValues` recibe `frozenBlocks: { main, late }`. Un bloque `null` de una sede significa "sin dato": si el bloque esta congelado (leido de foto) la sede cuenta como "sin aporte" y no anula el Total; si esta en vivo, anula el total del bloque; si ninguna sede tiene foto, el total es null. El plan hablaba de "ausente del mapa" vs "null explicito": las dos formas son equivalentes aca (el servicio ya deja `main: null`/`late: null` para la sede sin fila y `buildBoardMetrics` trata la clave ausente igual), por eso no hace falta distinguirlas. Tests: "bloque congelado: una sede sin fila no aporta ni anula (sede nueva)" (unit de `sumBranchValues`) y "semana congelada: una sede nueva sin fila en la foto no anula el Total" + su contraparte "semana en vivo: la misma sede sin datos si anula el Total" (a nivel `buildBoardMetrics`). Extension coherente: para la variacion de activos del Total, una sede ausente de una foto que existe no aporta a la suma de la foto (su variacion propia es "—" pero entra al Total como alta nueva).

## Tests

Todos "pendiente de CI" (regla del repo: no se corre vitest local):

- `el-templo-api/test/weekly-board/matrix.test.ts` (unit, sin DB, 41 `it(`): orden y congelamiento de las 21 filas, formulas de embudo (40 / 75 / 33,33 / 50), pctReserva null sin leads y con leads 0, pctRenovacion, variacion de activos, bloques null, suma con leads `require-all`/`none`, Total "25 y no 50", Total solo de sedes fisicas (ES y Online afuera), Online sin leads, sede nueva sin fila en bloque congelado vs en vivo, `previous` por celda, variacion con fotos W-1 y W-2, `hasTotal false` y `online null`.
- Sanidad local fuera del repo: la misma suite corrio con un shim minimo de `describe/it/expect` via `tsx` desde el scratchpad (no se commitea): 41 pass, 0 fail.
- `WeeklyBoardService` y `BoardCalculator` no tienen tests propios aca: las pruebas de integracion llegan en 206-06 via HTTP (rutas), como pedia el plan.

## Gates

| Gate | Resultado |
| --- | --- |
| `pnpm exec tsc --noEmit` | exit 0 (tras cada tarea) |
| `pnpm lint:tenant` | exit 0 (DISCREPANCIAS: 0) |
| `pnpm typecheck:tests` | exit 1 (preexistente, 17 discrepancias); ninguna linea menciona archivos de esta fase |
| Prettier sobre archivos tocados | OK |

## Decisiones del ejecutor

- La validacion `Number.isInteger(leads) && leads >= 0` de `upsertLeads` va ANTES de buscar la sede (falla rapido, mismo mensaje 400); el plan la ubicaba dentro de la rama del INSERT. Mismo resultado observable salvo el orden entre 400 de leads y 404 de sede.
- El estado `congelado` del servicio sale de `resolveBlockState` (que da `en_curso` a la semana en curso aunque hubiera foto), y los flags `frozen` que recibe la matriz son `state === "congelado"`.
- `freezesOn` se completa para `en_curso` y `provisorio` (main: W+7; late: `lateFreezeDate(W)`). En un `provisorio` viejo (tardio de W-2) la fecha puede estar en el pasado: significa "el job ya deberia haberlo cerrado".
- `activosFoto` de la matriz se arma con todas las filas del tenant de esa semana con `main_closed_at` no null (mapa vacio = sin foto = variacion null). Para el Total, una sede sin fila en una foto existente no aporta; con alguna fila de activos null, el total de la foto es null.
- Las sedes virtuales solo entran a `boardBranches` si su pais tiene un grupo (es decir, si hay al menos una sede fisica visible de ese pais); una sede virtual de un pais sin sedes fisicas visibles no se muestra.
- Warning de moneda de deuda: `amount` = cobrable + incobrable de la moneda ajena (campo unico del contrato).

## Deviations from Plan

None - plan ejecutado tal como estaba escrito (las decisiones de arriba son elecciones dentro de lo que el plan dejaba abierto).

## Notas para los planes siguientes

- 206-06 (rutas): `new WeeklyBoardService(fastify.db, fastify.log)`; `getBoard(ctx, request.scope, { weekStart }, now?)` y `upsertLeads(ctx, { branchId, weekStart, leads }, userId, now?)`. Errores: `BadRequestError` (semana no lunes / futura / ventana de leads / leads invalidos / sede virtual o inactiva) y `NotFoundError` (sede inexistente en el tenant). La ruta debe imponer `requireBranchAccess` sobre `branchId` del PUT (admin_sede solo su sede) y validar `leads` como entero >= 0 o null en el schema. Integracion pendiente a cargo de 206-06: aislamiento por rol (T-206-12/13), admin_sede sin Total ni Online, owner ve ES, admin AR no.
- 206-07 (job): reutiliza `BoardCalculator` (`computeWeekFlows`, `computePointInTime`, `computeLate`) para sacar la foto: guardar conteos crudos (`reservasOcurridas`, `compraronOcurridas`, `compraronAsistieron` incluidos), fila por sede activa fisica Y virtual, ceros explicitos, `mainClosedAt`/`lateClosedAt` como sellos independientes. El read path interpreta la foto por presencia de esos sellos; una fila con `mainClosedAt` null no cuenta como foto del bloque principal (y viceversa para `late`).
- 206-08 (admin): copiar `types.ts` (nombres exactos). Claves de `byBranch` = id de sede como string, `totalByCountry`/`onlineByCountry` = codigo de pais. `value`/`previous` null se pintan "—". `unit: "pct"` va en 0-100 y el delta es en puntos porcentuales; `unit: "money"` usa la `currency` del grupo. `variacionActivos` ya viene calculada. `sinContactar` en rojo si > 0 es presentacion. `leadsEditable` habilita la celda de Leads solo para sedes fisicas (el PUT rechaza virtuales); Online y Total de leads nunca son editables. `blocks.main/late.current|previous` traen la etiqueta (`en_curso`, `provisorio`, `congelado`, `sin_foto`); `capturedLate` y `freezesOn` alimentan el aviso.
- `groups` solo incluye paises con al menos una sede fisica visible; AR primero. Para admin_sede `hasTotal` es false y `online` es null.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-206-12/13 (columnas por rol con `listBranchesForScope` + `enforcedBranchIds`, sin pasar `scope.country` a los calculos) y T-206-14 (lunes, ventana, sede fisica activa del tenant, entero >= 0, `tenantValues`) mitigados en codigo; sus tests HTTP llegan en 206-06. T-206-15: `tenantWhere` en cada query de fotos, leads y sedes. T-206-16: cantidad constante de queries por request (<= 2 semanas x fuentes + 1 foto del momento + 2 de fotos/leads + 1 de sedes).

## Self-Check: PASSED

Archivos verificados en disco (types, matrix, calculator, service, matrix.test) y commits 9f7a48de2, d9f11e65a, 59e7cdae7, b804e94ae presentes en `git log`.
