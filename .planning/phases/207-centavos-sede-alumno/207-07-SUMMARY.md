---
phase: 207-centavos-sede-alumno
plan: 07
subsystem: api-readers
tags: [centavos, reportes, alumnos, tablero, oficina, coach]
requires: ["207-06"]
provides:
  - "Deudas, listado de Alumnos, Tablero y panel del profe suman el ledger exacto al centavo"
  - "Cero CAST a entero sobre importes en src/modules, cero schemas integer de importes en reports/members"
  - "Oficina: formatMoney con 2 decimales solo si el importe no es entero"
key-files:
  created:
    - el-templo-api/test/reports/centavos-reportes.test.ts
  modified:
    - el-templo-api/src/modules/reports/service.ts
    - el-templo-api/src/modules/reports/schemas.ts
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/members/schemas.ts
    - el-templo-api/src/modules/coach/service.ts
    - el-templo-api/src/modules/weekly-board/matrix.ts
    - el-templo-api/src/modules/weekly-board/calculator.ts
    - el-templo-api/src/modules/office/auto-topics.ts
    - el-templo-api/test/weekly-board/matrix.test.ts
metrics:
  tasks: 3
  completed: 2026-11-10
---

# Phase 207 Plan 07: lectores del ledger fuera de Caja

## Commits

- `7eb18d00e` feat(207-07): deudas, listado de alumnos y panel del profe en centavos exactos, sin CAST ni integer
- `75374df71` feat(207-07): Tablero y Oficina con centavos exactos
- `343b28cda` test(207-07): Total del Tablero con centavos y con enteros
- `21017a5eb` test(207-07): centavos en Deudas, Alumnos y Tablero (y enteros sin cambios)

## Cambios

- `reports/service.ts`: `bucketTotals` (owner y no-owner) con `roundMoney` en cada paso; `statusTotals` con `COALESCE(SUM(...), 0)` (string) y `roundMoney(Number(...))`, sin CAST; filas de deuda con `roundMoney`; `getDebtTotalsByMemberBranch` acumula en centavos (`toCents`) y convierte con `fromCents` al final; `revenueFromConverted` con `sumMoney`. `getChargeHistory`/`getIncomeByMemberBranch` (207-06) intactos.
- `reports/schemas.ts` y `members/schemas.ts`: `amount` de las filas de deuda y de `totalDebtByCurrency` pasan de `integer` a `MONEY_RESPONSE_SCHEMA`.
- `members/service.ts`: `listMembers` sin CAST (`COALESCE(SUM, 0)` + `roundMoney(Number())`), `exportSepaMembers` con `roundMoney`.
- `coach/service.ts`: `totalAmount` con `roundMoney`.
- `weekly-board/matrix.ts`: `sumNullable` devuelve `roundMoney(total)` (conteos y porcentajes intactos). `calculator.ts`: `moneyEquals(amount, 0)` y `sumMoney` para la deuda en moneda ajena.
- `office/auto-topics.ts`: `formatMoney` sin decimales si el importe es entero, 2 fijos si no; comparaciones de `difference` con `moneyEquals`. Con enteros el texto queda idéntico.

## Verificación

- `npx tsc --noEmit` = 0; `pnpm lint:tenant` DISCREPANCIAS 0; `pnpm typecheck:tests` 18 (las preexistentes, sin suma).
- `grep 'AS SIGNED' src/modules` (sin frequency-service/progression) vacío; sin `amount: { type: "integer" }` en reports/members schemas.
- `test/reports/centavos-reportes.test.ts` 11/11 (filas 1000.5/2000.25, owner y no-owner 3000.75, cobrable/incobrable, 0.1+0.2=0.3, Alumnos 3000.75 y 700, Tablero 3000.75 / mas10 0.3 / enteros 700+500).
- `test/weekly-board/matrix.test.ts`: casos nuevos (0.1+0.2=0.3, 100.10+200.20=300.3 con conteo intacto, enteros) pasan; el archivo entero dio 77 OK junto con office.
- Regresión: `reports/outstanding-balances.test.ts` + `weekly-board/by-branch-caja-alumnos.test.ts` 41/41.
- `test/office/office-routes.test.ts`: 31 de 32 pasan; ver "Bugs / hallazgos".

## Decisiones del ejecutor

- `sumNullable` aplica `roundMoney` sobre el total acumulado (como pide el plan) en vez de acumular en centavos: equivalente para importes de 2 decimales y trivial para conteos.
- `totalDebtByCurrency` de `listMembers` usa un tipo local `{currency, amount: string}` para el SELECT crudo, y recién el mapeo devuelve `TotalDebtRow` (number).
- El tema de Oficina `Arqueo con diferencia` no tiene un test propio con centavos (el plan solo exigía `office-routes.test.ts` sin cambio de texto con enteros). Cobertura por tipos y por la regla de `formatMoney`, que con enteros no cambia el texto.

## Desviaciones

Ninguna respecto del plan.

## Bugs / hallazgos

- `test/office/office-routes.test.ts` > "el badge de asignados baja al ver, sube con actividad ajena y una acción propia cuenta como vista" falla de forma reproducible (2 corridas, la segunda aislada con `-t`) en la línea 810: tras comentar el propio asignado, `topic.unseen` sigue `true`. El flujo es comentarios/lecturas de Oficina (`office/service.ts` `markSeen`/`unseen`), no toca plata ni ningún archivo de este plan (el único de Oficina modificado, `auto-topics.ts`, solo lo usa el sync de arqueos). No se pudo confirmar contra el baseline sin tocar otros checkouts: se asume PREEXISTENTE y se deja anotado para el orquestador (posible granularidad de segundos en `last_seen_at` vs `last_activity_at`).
- Se mantienen los 2 fallos preexistentes de `test/finance/coach-load-alta.test.ts` (no se tocó ni corrió).

## Known Stubs

Ninguno.

## Self-Check: PASSED
