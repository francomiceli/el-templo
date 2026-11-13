---
phase: 211-resultado-por-sede
plan: 03
subsystem: finance
tags: [egresos, resultado, tests, tenancy, iso-03]
requires: [211-01, 211-02]
provides: [expense-result-rutas.test, ISO-03 del Resultado]
affects: [211-04, 211-05, 211-06]
key-files:
  created:
    - el-templo-api/test/finance/expense-result-rutas.test.ts
  modified:
    - el-templo-api/test/tenancy/iso-03-finance-egresos.test.ts
    - el-templo-api/test/tenancy/iso-03-cobertura.test.ts
metrics:
  tasks: 2
  completed: 2026-11-13
---

# Phase 211 Plan 03: Tests de la API del Resultado por sede Summary

Aislamiento entre gimnasios (2 casos ISO-03, `CASOS_BASELINE` 64 -> 66) y un escenario HTTP con 21 casos y literales comentados que fija qué cuenta como cobro a alumno, de qué sede y en qué moneda, que las identidades cierran contra el Resumen de Egresos y contra la suma directa de la DB, el Excel contra el JSON, los roles y el ruteo. No hizo falta tocar código de producción.

## Qué se hizo

- **Task 1** (`ac89e20aa`): 2 describes en `iso-03-finance-egresos.test.ts` (`GET .../expense-records/result` y `GET .../result/export`), cada uno con aislamiento y control positivo; docblock al día; `CASOS_BASELINE` 64 -> 66 con su comentario fechado y comentario de `ARCHIVOS_BATERIA`.
  - Result: el gimnasio 2 no ve columnas de sedes de El Templo; su Consolidado trae cobros 12345 (con el ajeno daría 24690) y costo 5000 (con el ajeno 12000); control: su columna trae 12345 y 5000.
  - Export: el encabezado no nombra sedes de El Templo y el Consolidado de "Cobros a alumnos" es 12345; control: su sede aparece y su celda es 12345.
  - Ningún `403` escrito en ese archivo (`grep -c 403` = 0).
- **Task 2** (`8f29785b0`): `test/finance/expense-result-rutas.test.ts`, 21 `it`, escenario `MES = "2023-05"` con cobros c1..c14 y gastos G1..G7 descritos en el encabezado del archivo. Cubre arA (75000 / 44500 / 30500 / 40,7), arB (30000 / 14500 / 15500 / 51,7), sede C (margen null), columnas extra virtual e inactiva (margen 100, orden antes de Casa Matriz), Casa Matriz (25000 estimado), Consolidado por diferencia (+109000 cobros, +90000 costos, +25000 estimado, +19000 resultado), rubros (Alquiler 46000, Software 9000, Sueldos 35000; Viejo solo en 2023-04 con 8000), exclusiones (junio 11111 y abril 22222 en arA), aviso de otra moneda, España (EUR, sin Casa Matriz, 400/300/100/25), identidades, Excel, roles, validación y ruteo.
  - **Agregado del orquestador (de la 209.1)**: `it` "un ajuste de saldo de apertura de banco no cambia el Resultado". Crea un banco propio (sin sede), inserta con `tenantValues` un `adjustment` inflow de 80000, firme, sin alumno ni sede, con `cash_register_id` del banco y fecha 2023-05-15, y afirma que el JSON completo del Resultado es idéntico al de antes (cobros de todas las columnas y del Consolidado). Banco y fila se borran en `afterAll`.

## Resultados

Corridas (foreground, `--hookTimeout=540000`):
- `iso-03-cobertura` + `iso-03-finance-egresos`: 8 + 29 = 37 pasados / 0 fallados (246 s). El harness mandó la corrida a segundo plano a los 180 s; se esperó con un único `tail --pid`.
- `expense-result-rutas`: 21 pasados / 0 fallados (151 s).
- `expense-summary-rutas` (sin tocar): 18 pasados / 0 fallados.

Mutación honesta (revertida, `git checkout` de `transaction-service.ts`, diff de `src` vacío): se quitó temporalmente `isNotNull(memberId)` de `getMemberIncomeByBranch` y la corrida dio 6 fallados de 21 (arA, Consolidado, "no entran...", aviso de otra moneda, identidad de cobros, Excel), o sea los tests muerden contra el criterio "con alumno" (DI-02). Los 15 restantes pasaron, como corresponde.

Gates (tras el último commit):
- `npx tsc --noEmit` = 0
- `npm run -s typecheck:tests` = `DISCREPANCIAS: 18`
- `npm run -s lint:tenant` = `DISCREPANCIAS: 0`
- `CASOS_BASELINE` = **66** (64 encontrado, sin que nadie lo moviera, +2).
- `grep -c "expense-records/result" iso-03-finance-egresos.test.ts` = 6 (>= 2).

Preexistentes ajenos (`coach-load-alta`, `office-routes`): no se corrieron, no se tocó nada de ahí.

## Desviaciones del plan

Ninguna, salvo el agregado pedido por el orquestador (arriba).

## Decisiones del ejecutor

1. El `it` del ajuste de apertura toma la foto "antes" dentro del propio `it` (no en `beforeAll`), para que compare el mismo escenario con y sin el ajuste, y compara el JSON completo (`toEqual`) además de los cobros por columna.
2. Ese `it` pasa también con el `isNotNull(memberId)` quitado, porque `getMemberIncomeByBranch` hace INNER JOIN con `branches` por la sede del cobro y el ajuste tiene sede NULL: dos barreras independientes lo dejan afuera. El `it` de c7 (ajuste de arqueo CON sede en arA, sin alumno) es el que muerde contra la barrera "con alumno" (lo confirmó la mutación).
3. El oráculo de cobros del Consolidado (suma directa de la DB) se escribió con `drizzle` y `tenantWhere`, replicando el criterio en el test (resolución snapshot -> sede actual -> sede del cobro en JS, solo sedes de Argentina) sin llamar al código de la fase; además afirma `>= 109000` para que no pase vacío.
4. Los `costCenters` del escenario se comparan filtrando por el prefijo propio `ZZZ-RES-{suf} ` (por si otro dato del tenant tuviera costo en el mes); las cifras de rubro se afirman por id propio, no con `toEqual` del mapa completo.
5. La etiqueta de fila del Excel se busca por texto en la columna A (no por posición) para que el test no dependa del orden de los rubros ajenos.
6. En el test de ruteo, `/result` y `/result/export` se piden sin `?country=` (owner, país por defecto) como pedía el plan; funcionó en AR.

## Bugs encontrados

Ninguno: los 21 casos y los 2 de ISO-03 pasaron a la primera contra el código de 211-01/02. Sin cambios en `src/`.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno.

## Self-Check: PASSED

Archivo creado presente; commits `ac89e20aa` y `8f29785b0` existen; árbol limpio antes de este SUMMARY.
