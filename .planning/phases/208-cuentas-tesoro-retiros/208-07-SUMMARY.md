---
phase: 208-cuentas-tesoro-retiros
plan: 07
subsystem: api-finance-tests
tags: [retiros, tests, traslado, formato-viejo, no-regresion]
requires: ["208-06"]
provides:
  - "withdrawals.test.ts, cash-counts.test.ts y centavos-traslados-retiros.test.ts vuelven a verde con el alta nueva (destino obligatorio)"
  - "Cobertura del formato viejo (retiro expense con centro Retiros) sobre seedLegacyWithdrawal dentro de la suite historica de retiros"
affects: [208-08]
key-files:
  modified:
    - el-templo-api/test/finance/withdrawals.test.ts
    - el-templo-api/test/finance/cash-counts.test.ts
    - el-templo-api/test/finance/centavos-traslados-retiros.test.ts
decisions:
  - "Destino por defecto de los helpers: una Central propia por archivo (efectivo, sin sede, isTreasury false, ARS, corte 2020-01-01), creada en beforeAll y borrada en afterAll"
  - "No se toca src/: ningun test revelo un bug del alta nueva"
metrics:
  tasks: 2
  completed: 2026-11-11
---

# Phase 208 Plan 07: la suite historica de retiros sobre el alta nueva

Los tres archivos rotos a proposito por 208-06 vuelven a verde sin borrar ningun caso: cada `it` se mantiene sobre el alta con `destinationCashRegisterId`, y lo que era del formato viejo queda probado sobre retiros viejos sembrados con `seedLegacyWithdrawal`.

## Commits

- `844fc4637` test(208-07): suite de retiros con destino y formato viejo sembrado
- `a49874fbd` test(208-07): arqueos y centavos con retiro a Caja central

## Resultados (un archivo por corrida, foreground)

| Archivo | Antes | Despues |
| --- | --- | --- |
| `withdrawals.test.ts` | 26 `it` | 28 `it`, 28/28 verde |
| `cash-counts.test.ts` | 15 `it` | 15 `it`, 15/15 verde |
| `centavos-traslados-retiros.test.ts` | 14 `it` | 14 `it`, 14/14 verde |

Gates: `tsc --noEmit` = 0; `pnpm lint:tenant` DISCREPANCIAS = 0; `pnpm typecheck:tests` = 18 (los preexistentes, ninguno en estos tres archivos).
Conteo de `it` (T-208-24): ningun caso borrado; `withdrawals` suma 2 (26 -> 28).

## Clasificacion caso por caso

Los 23 `it` que creaban retiros por la API (18 + 1 + 4):

**(a) comportamiento sobre el alta nueva: 22 puros**

`withdrawals.test.ts` (17, ademas de los casos de abajo):
- pending/summary "despues de un retiro: quedo..." (sin cambios de aserciones; `lastWithdrawal` y `previousBalance` salen igual del traslado)
- "caso Martin" (tope), "retiro parcial", "fecha pasada...", "conteo igual al esperado", "faltante...", "sobrante...", "el conteo solo va en un retiro de hoy": solo reciben el destino por el helper
- "validaciones de forma": mantiene los 5 casos y suma 2 (destino ausente, destino 0). Siguen siendo 400 de schema; no se asertan mensajes
- "coach -> 403": ahora manda el body completo con destino y vuelve a probar el 403 de rol (se agrego que la Central no se mueve)
- "anular un cobro retirado -> 409; anular el retiro libera el cobro": se agrego que la Central sube a 300 y vuelve a 0 al anular (el retiro nuevo se anula por `/expenses/:id/void`)
- "anular un retiro con faltante anula tambien su ajuste", "los cobros de un retiro anulado se vuelven a vincular"
- banco "monto explicito...": ahora con destino Central; la cuenta baja 500 -> 200 y la Central sube a 300, `format: "transfer"`, sin `expense` en la cuenta
- banco "sin amount -> 400; con conteo -> 400"
- "lista filtrada por caja, detalle con cobros, y responsables sugeridos" (total 2 sigue valiendo: la pata de entrada en la Central no cuenta como retiro)
- "un egreso con otro centro..." no usa el alta (sin cambios)

`cash-counts.test.ts` (1): "un retiro baja el esperado" con Central propia.
`centavos-traslados-retiros.test.ts` (4): 300.30 con conteo +0.20, faltante 0.10, conteo igual con centavos y "1.005/0/0.5". Se mantienen todas las aserciones; se suma el saldo EXACTO del destino (300.3, 100, 100.05, 0.5) y que el intento rechazado por tope no mueve el destino.

**(a)+(b) 1 caso dividido, y 2 `it` nuevos del formato viejo**

- "registra por monto: centro Retiros, responsable, notas; auto-vincula...": se dividio.
  - (a) Alta nueva (mismo `it`, renombrado "registra por monto como traslado a la Central..."): mantiene responsable, notas, fecha, `paymentCount`, auto-vinculo solo de cobros firmes de la caja desde el corte, historial de cobros marcados, remanente 30000. Lo que asertaba del formato viejo cambia al nuevo: la fila del retiro es `cash_transfer`/`outflow` con `costCenterId` null; existe la pata de entrada en la Central (monto 100000, mismo responsable); NINGUN `expense` nuevo; la Central queda en 100000; `format`/`destinationCashRegisterId`/`destinationName` del detalle.
  - (b) Formato viejo, `it` nuevo "retiro viejo sembrado (expense con centro Retiros): se lista y se detalla con sus cobros, sin destino": `seedLegacyWithdrawal` con centro Retiros y 2 cobros; la fila es `expense` con centro Retiros; GET `/withdrawals/:id` da `format: "legacy_expense"`, `destinationName` null, `paymentCount` 2 y sus cobros; la lista y el pendiente (`lastWithdrawal`) lo reconocen; sede 30000 y Central 0.
- `it` nuevo "un retiro viejo sembrado se anula por POST /expenses/:id/void como siempre y libera sus cobros" (DI-09): el cobro retirado no se anula (409 con `retiro #id`), anular el retiro libera los cobros y la sede vuelve a 300.

Resumen de los 23: 22 son (a) puros y 1 es dividido (a + b: la parte nueva queda en el mismo `it`, la vieja pasa a un `it` nuevo sobre el fixture); ademas hay 1 `it` nuevo de anulacion del formato viejo. Ningun caso era EXCLUSIVAMENTE del formato viejo.

## Detalles tecnicos

- `postWithdrawal` (withdrawals) agrega `destinationCashRegisterId: centralId` por defecto (`{ destinationCashRegisterId: centralId, ...payload }`): un caso que prueba la ausencia lo pisa con `undefined` (JSON lo descarta). En centavos el default es una Central compartida y los casos de saldo exacto crean la propia.
- `linkedPaymentIds` ahora descarta los targets `cash_transfer`: la salida del retiro nuevo tiene un link a su pata de entrada (ademas de los cobros), que no es un cobro. Query con `tenantWhere` en las dos tablas. Sin esto, `linkedPaymentIds(w.id)` devolveria tambien el id de la pata de entrada.
- Helper nuevo `liveRowsInCaja(caja, kind)` para afirmar las filas vivas de la Central.
- Docblock de `withdrawals.test.ts` actualizado (formato nuevo/viejo y que casos usan el fixture).
- Las Centrales propias se borran en `afterAll` de cada archivo (no sobreviven entre archivos del worker).

## Decisiones del ejecutor / desviaciones

1. **Sin mutacion**: no se hizo prueba de mutacion (el plan no la pedia). Las aserciones nuevas sobre el destino (Central sube exacto, anular devuelve a 0, sin `expense`) cubren los puntos en los que el formato nuevo difiere del viejo.
2. **Corrida de `withdrawals` fallida dos veces por infraestructura, no por el codigo**: `Unknown database 'eltemplo_test_1'` en `provisionWorkerDB`. Otra sesion corria `test/sessions/stretch-selection.test.ts` contra la misma MySQL/worker. Se espero a que terminara y la tercera corrida paso 28/28. (Los fallos eran antes de ejecutar ningun test.)
3. Todas las corridas de vitest superaron 180 s y el arnes las paso a segundo plano; se espero cada una hasta su fin antes de lanzar otra (nunca dos a la vez). Duracion ~8-9 min por archivo (provisioning de la DB).
4. No se toco `src/`, admin ni app. Sin migracion.

## Hallazgos

- Ninguno nuevo sobre el alta. Se confirma de punta a punta: el retiro nuevo se anula por `/expenses/:id/void` (liberando cobros y devolviendo el saldo a la Central), el resumen del cajon (`lastWithdrawal`, `previousBalance`, `outflows`) y la lista no distinguen formato, y `paymentCount` sigue contando solo cobros (3, 2, 1... igual que antes, sin sumar la pata de entrada ni el ajuste).

## Known Stubs

Ninguno.

## Self-Check: PASSED

Commits 844fc4637 y a49874fbd existen; los tres archivos verdes (28/28, 15/15, 14/14); tsc 0, lint:tenant 0, typecheck:tests 18.
