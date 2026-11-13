---
phase: 207-centavos-sede-alumno
plan: 03
subsystem: api-finance
tags: [money, cajas, arqueos, json-schema]
requires: ["207-02"]
provides:
  - "saldo firme/pendiente y movimiento de periodo de cada caja exactos al centavo"
  - "saldo inicial de caja de efectivo y fondo de cambio con 2 decimales (assertMoneyAmount)"
  - "arqueo (gestion y cierre de jornada del profe) con centavos: esperado, diferencia y foto exactos"
  - "guard de efectivo con compareMoney"
affects: [207-04, 207-05]
key-files:
  created:
    - el-templo-api/test/finance/centavos-cajas.test.ts
  modified:
    - el-templo-api/src/modules/finance/cash-register-service.ts
    - el-templo-api/src/modules/finance/cash-count-service.ts
    - el-templo-api/src/modules/finance/efectivo-guard.ts
    - el-templo-api/src/modules/finance/schemas.ts
    - el-templo-api/src/modules/finance/coach-load-routes.ts
decisions:
  - "getBalance combina apertura + firme - salidas en centavos enteros (3 terminos)"
metrics:
  tasks: 3
  completed: 2026-11-10
---

# Phase 207 Plan 03: centavos en cajas y arqueos

Saldos, saldo inicial, fondo de cambio y arqueos con aritmetica de `shared/money.ts`; schemas de efectivo, arqueo (gestion y jornada del profe) y fondo con `MONEY_NON_NEGATIVE_SCHEMA`.

## Commits

- `4db74eb8d` feat(207-03): saldos de caja, fondo de cambio y guard de efectivo en centavos
- `bde396439` feat(207-03): arqueos con centavos y schemas de efectivo/arqueo/fondo
- `40cc33d10` test(207-03): centavos en cajas y arqueos

## Cambios por archivo

- `cash-register-service.ts`: `getBalance` (centavos enteros, `Number()` sobre los SUM string), `pendienteAmount`, `getPeriodMovement` (`sumFor` y `net` redondeados), `setChangeFund` y `createEfectivoCaja` con `assertMoneyAmount` (cero permitido). `listActiveCajasWithBalance` solo copia los valores ya exactos de `getBalance`: sin cambios.
- `cash-count-service.ts`: `getExpected` con `sumMoney` (esperado y los dos totales); `registerCount` con `assertMoneyAmount`, `difference = roundMoney(...)`, nota exigida con `!moneyEquals(difference, 0)`, INSERT con valores redondeados. `list`/`getById`/`lastCount` solo leen (Drizzle `mode: number`), sin sumas ni comparaciones.
- `efectivo-guard.ts`: `compareMoney(amount, available) > 0`, mensaje con importes redondeados.
- `schemas.ts`: `openingBalance`, `countedAmount` (arqueo de gestion) y `amount` del fondo de cambio.
- `coach-load-routes.ts`: `countedAmount` del arqueo de jornada.

## Verificacion

- `tsc --noEmit` = 0; `pnpm lint:tenant` = 0; `typecheck:tests` sin menciones de los archivos de este plan.
- `test/finance/centavos-cajas.test.ts`: 17/17 (foreground, 147 s).
- Regresion `cash-counts.test.ts` (15) + `cash-balances.test.ts` (8) = 23/23 (foreground, 291 s, una sola corrida de 2 archivos).

## Desviaciones

Ninguna respecto del plan.

## Bugs encontrados

Ninguno fuera del plan. Nota para 207-04: el comentario del JSDoc de `createEfectivoCajaSchema` decia "centavos/unidad minima" (impreciso: es pesos con 2 decimales).

## Known Stubs

Ninguno.

## Self-Check: PASSED
