---
phase: 207-centavos-sede-alumno
plan: 08
subsystem: api/excel
tags: [excel, exceljs, centavos, money, export]
requires: ["207-07"]
provides:
  - "MONEY_NUM_FMT y setMoneyColumnFormat en shared/excel.ts"
  - "7 exportaciones Excel del circuito de caja con importes numéricos y formato #,##0.00"
affects: [finance, reports, members]
key-files:
  created:
    - el-templo-api/test/finance/centavos-excel.test.ts
  modified:
    - el-templo-api/src/modules/shared/excel.ts
    - el-templo-api/src/modules/finance/routes.ts
    - el-templo-api/src/modules/reports/routes.ts
    - el-templo-api/src/modules/members/routes.ts
decisions:
  - "Formato '#,##0.00' (independiente del idioma de Excel) aplicado por columna con setMoneyColumnFormat tras asignar sheet.columns"
metrics:
  tasks: 2
  completed: 2026-11-10
---

# Phase 207 Plan 08: formato de importe con 2 decimales en los Excel de caja

Un helper único (`setMoneyColumnFormat`) deja las columnas de importe de las 7 exportaciones del circuito de caja como celdas numéricas con formato `#,##0.00` (Excel las muestra con los separadores del idioma del usuario, es-AR: 77.570,82).

## Commits

- `4bb6c890a` feat(207-08): formato de importe con 2 decimales en las 7 exportaciones Excel de caja
- `5c9fda9d4` test(207-08): importes con centavos y formato en las 7 exportaciones Excel

## Qué se hizo

- `shared/excel.ts`: `MONEY_NUM_FMT = "#,##0.00"` y `setMoneyColumnFormat(sheet, keys)`.
- Aplicado justo después de `sheet.columns = [...]` en: Caja (`monto`), Bandeja (`monto`), Saldos (`firme`, `pendiente`), Mov-Egresos (`monto`) en `finance/routes.ts`; Cobros (`amount`) y Deudas (`monto`) en `reports/routes.ts`; Domiciliación (`importe`) en `members/routes.ts`.
- Encabezados, anchos y orden de columnas intactos. Los valores ya eran `number` (servicios de 207-02/07): no hubo que tocar ningún `addRow`.
- Test `test/finance/centavos-excel.test.ts` (8 `it`): siembra un cobro validado de 77570,82 (con link a suscripción), uno pendiente de 100,10, un egreso real de 0,30 por la API, una deuda de 1000,50 y un socio ES con membresía de 45 EUR. Cada hoja se pide, se carga con exceljs y se verifica celda `number` exacta + `numFmt === "#,##0.00"`; Saldos verifica firme 78570,62 y pendiente 100,1; una columna no-importe (Fecha/Moneda/Tipo/Plan) no lleva el formato.

## Verificación

- `npx tsc --noEmit`: 0 errores.
- `pnpm lint:tenant`: DISCREPANCIAS 0.
- `pnpm typecheck:tests`: 18 discrepancias (las preexistentes), ninguna en el archivo nuevo.
- `test/finance/centavos-excel.test.ts`: 8/8 pasan.
- `test/finance/export-transactions.test.ts`: 5/5 pasan.
- Mutation check: quitando la llamada de Deudas el test "Reportes → Deudas" falla (el resto pasa), o sea que el assert de `numFmt` detecta la regresión.
- Regresión adicional: `test/members/sepa-domiciliacion.test.ts` + `test/reports/outstanding-balances.test.ts`: 42/42 pasan.

## Deviations from Plan

**1. [Escenario de test] SEPA con 45 EUR entero en vez de 45,50.** `subscriptions.price_paid` es `int` (precio de catálogo, fuera de alcance de DI-03), así que un último cobro con centavos no existe en esa hoja. El test usa 45 EUR y verifica que la celda es número con formato. El formato queda aplicado igual por si en el futuro la columna pasa a decimal.

**2. [Formato] Prettier reformateó código ajeno en `finance/routes.ts` y `members/routes.ts`.** Esos dos archivos no estaban formateados en la rama; el hook de lint-staged los normaliza en cada commit, así que el commit de feat incluye algunos reflows de líneas no relacionadas (sin cambio de comportamiento).

Bugs encontrados: ninguno.

## Known Stubs

Ninguno.

## Self-Check: PASSED
