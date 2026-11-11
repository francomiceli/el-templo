---
phase: 208-cuentas-tesoro-retiros
plan: 04
subsystem: api-finance
tags: [arqueo-apertura, tesoro, caja-central, ajuste-por-conteo]
requires: ["208-03"]
provides:
  - "createCountAdjustment: helper unico de ajuste por conteo (apertura hoy, retiro en 208-06)"
  - "MovementService.registerOpeningCount"
  - "POST /api/admin/finance/cash-registers/:id/opening-count (owner-only)"
affects: [208-06, 208-07]
key-files:
  created:
    - el-templo-api/src/modules/finance/count-adjustment.ts
    - el-templo-api/test/finance/arqueo-apertura.test.ts
  modified:
    - el-templo-api/src/modules/finance/movement-service.ts
    - el-templo-api/src/modules/finance/schemas.ts
    - el-templo-api/src/modules/finance/routes.ts
    - el-templo-api/src/modules/finance/types.ts
    - el-templo-api/src/modules/shared/audit-log.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/tenancy/iso-03-cobertura.test.ts
    - el-templo-api/test/tenancy/iso-03-finance-cajas.test.ts
decisions:
  - "El arqueo de apertura NO usa cash_counts: asienta un adjustment interno + audit reconciliation (target_kind cash_register, sin migracion)"
  - "registerMovement queda sin tocar (la T0 lo reescribe); el helper se adopta al integrarla"
metrics:
  tasks: 2
  completed: 2026-11-11
---

# Phase 208 Plan 04: arqueo de apertura de Central y Tesoro

El owner informa el efectivo contado de la Caja central o de un Tesoro y el saldo firme queda exacto en lo contado, con un ajuste interno trazable y un audit `reconciliation`. El helper `createCountAdjustment` queda listo para el retiro (208-06).

## Commits

- `e092e37e3` feat(208-04): arqueo de apertura de Central y Tesoro con ajuste trazable
- `d1e01317c` test(208-04): arqueo de apertura (saldo exacto, trazabilidad, permisos, aislamiento)

## Que se hizo

- `count-adjustment.ts`: `createCountAdjustment(ctx, tx, txnService, { caja, expected, counted, transactionDate, notes }, adminId)` -> `{ difference, adjustmentTxId }`. Diferencia en centavos (`roundMoney`/`moneyEquals`); sin diferencia no escribe; las `notes` las arma el caller y se guardan tal cual. No importa nada de `cash_counts`.
- `MovementService.registerOpeningCount`: valida el importe (`allowZero`), la caja (existe en el tenant, `efectivo` sin sede, activa, hoy >= corte), toma candado `FOR UPDATE` sobre la caja dentro de la tx, `expected = fondo de cambio + firme + pendiente`, notas "Arqueo de apertura: esperado X, contado Y[. notas]", ajuste via el helper y audit `reconciliation` SIEMPRE (payload `source: opening_count, cashRegisterId, expected, counted, difference, adjustmentId`). Devuelve `OpeningCountResult` con el firme leido despues del commit.
- `loadCaja`/`CajaRef` suman `isActive`, `isTreasury`, `changeFund`, `cutoffDate` (aditivo, sin cambio de comportamiento para los otros callers).
- `AuditTargetKind` suma `"cash_register"` (columna varchar(30), sin migracion).
- Ruta `POST /cash-registers/:id/opening-count`: `OWNER_ROLES` (403), `assertTenant`, `enforceCajaScope`, 201 `{ openingCount }`; el response schema 201 declara todos los campos (Ajv recorta lo no declarado).
- Gates de tenancy: manifiesto +1 (555 -> 556), `CASOS_BASELINE` 51 -> 52, `describe` con la clave literal en `iso-03-finance-cajas`.

## Verificacion

- `npx tsc --noEmit` (api): 0. `pnpm lint:tenant`: DISCREPANCIAS 0. `pnpm typecheck:tests`: 18 (preexistentes), ninguna en archivos del plan.
- Tests, foreground y de a UN archivo: `arqueo-apertura` 17/17, `iso-01-manifiesto` 13/13, `iso-03-cobertura` 8/8, `iso-03-finance-cajas` 57/57.
- No se corrio `movement-service.test.ts` (el cambio en `loadCaja` es solo agregar columnas al SELECT; tsc en 0).

## Decisiones del ejecutor / desviaciones

1. **Dos archivos juntos no entran:** el plan pedia `iso-01-manifiesto` + `iso-03-cobertura` en una sola invocacion; con dos workers el provisioning de la DB paso el `hookTimeout` de 540 s y ambos fallaron por timeout de hook (sin tests ejecutados). Se corrieron por separado y pasaron. Para los planes siguientes: SIEMPRE un archivo por vitest.
2. **Tests por encima del minimo:** 17 `it` (plan >= 9). Se sumaron: fondo de cambio incluido en el esperado, arqueo repetido (el segundo parte del saldo ajustado), contado 0, corte futuro, caja inexistente.
3. **Un caso del plan no aplica:** "campo no declarado -> 400" no existe (Ajv recorta, como avisaban las lecciones); se saco del test.
4. **Aislamiento ISO-03:** se usa un owner del gimnasio 2 (`createStaffUser` role owner, mismo patron que el alta de Tesoro) porque el actor `admin` de la bateria recibiria el 403 del gate de rol antes de mirar la caja. El caso afirma que apuntar a la Central de El Templo da el MISMO status (400, `No existe la caja`) que una caja inexistente, que no se escribe ninguna transaccion ni audit en ningun gimnasio, y el control positivo arquea la Central propia (201, ajuste con `tenant_id` del gimnasio 2).
5. **Status de caja ajena/inexistente es 400, no 404:** `loadCaja` ya lanzaba `BadRequestError` para cajas inexistentes o de otro tenant (comportamiento previo, igual que traslados/egresos). Solo un no-owner veria 404 (por `enforceCajaScope`), pero la ruta es owner-only.

## Para los planes siguientes

- 208-06: usar `createCountAdjustment` con las notas del retiro tal cual (`Sobrante|Faltante al retirar: esperado X, contado Y. <notas>`) para conservar el texto byte-for-byte. El helper recibe `transactionDate` aparte (el retiro lo valida como hoy cuando hay conteo).
- `registerMovement` sigue con su ajuste inline; unificar con el helper al mergear la T0.
- Un arqueo en una caja con pendientes: `expected` los suma al esperado (como todo arqueo), asi que el firme queda en `contado - fondo - pendiente`. No se cubre con test porque no hay forma barata de sembrar un pendiente en una caja sin sede; la formula es la misma que la del retiro.
- La UI (208-07/08) debe ofrecer el arqueo solo para Central/Tesoro y pedir el contado total del cajon (incluye el fondo de cambio si la caja lo tiene).

## Known Stubs

Ninguno.

## Self-Check: PASSED

Commits e092e37e3 y d1e01317c existen; `count-adjustment.ts` y `arqueo-apertura.test.ts` presentes; tsc 0, lint:tenant 0, 4 archivos de test en verde.
