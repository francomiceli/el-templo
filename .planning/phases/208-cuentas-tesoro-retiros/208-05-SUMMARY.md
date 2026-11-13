---
phase: 208-cuentas-tesoro-retiros
plan: 05
subsystem: api-finance
tags: [retiros, traslado, marcador, anulacion, no-regresion]
requires: ["208-04"]
provides:
  - "withdrawal-marker.ts: withdrawalFormatOf, withdrawalRowConditions, withdrawalRowSql, MEMBER_INFLOW_KINDS (marcador unico de retiro)"
  - "transfer-pair.ts: collectTransferGroupIds (patas + ajustes filtrados por kind, nunca cobros)"
  - "Lectores de retiros sobre los dos formatos (viejo expense, nuevo traslado) sin duplicar ni perder"
  - "Anulacion de retiro nuevo por POST /expenses/:id/void y POST /movements/:id/void sin anular cobros"
  - "Fixtures seedLegacyWithdrawal / seedTransferWithdrawal (contrato del formato nuevo)"
affects: [208-06, 208-07, 208-08]
key-files:
  created:
    - el-templo-api/src/modules/finance/withdrawal-marker.ts
    - el-templo-api/src/modules/finance/transfer-pair.ts
    - el-templo-api/test/unit/withdrawal-marker.test.ts
    - el-templo-api/test/fixtures/withdrawal-fixtures.ts
    - el-templo-api/test/finance/withdrawal-formats.test.ts
  modified:
    - el-templo-api/src/modules/finance/withdrawal-service.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/finance/movement-service.ts
    - el-templo-api/src/modules/finance/cash-count-service.ts
    - el-templo-api/src/modules/finance/routes.ts
    - el-templo-api/src/modules/finance/types.ts
decisions:
  - "Marcador de retiro: direction=outflow AND kind IN (expense, cash_transfer) AND responsible_name IS NOT NULL. La fila canonica del retiro nuevo es la pata de SALIDA (su id es el id del retiro). Sin columna ni migracion"
  - "voidExpense despacha por formato, asi RetirosTab (POST /expenses/:id/void) sirve para los dos formatos sin cambiar el admin"
metrics:
  tasks: 4
  completed: 2026-11-11
---

# Phase 208 Plan 05: lectores y anulaciones listos para dos formatos de retiro

Todos los lectores de retiros y las anulaciones reconocen el retiro viejo (`expense` con responsable, los 48 de prod, no se migran) y el nuevo (traslado `cash_transfer` con responsable) ANTES de que 208-06 cambie el alta. Con solo datos viejos nada cambia.

## Commits

- `27d952dd0` feat(208-05): marcador unico de retiro (viejo y traslado)
- `6b902c073` feat(208-05): lectores de retiros sobre formato viejo y traslado
- `9f0b7aabe` fix(208-05): anulacion de traslados y retiros por grupo, sin arrastrar cobros
- `13164020d` test(208-05): lectores y anulaciones con retiros viejos y nuevos mezclados

## Que se hizo

- **Marcador unico** (`withdrawal-marker.ts`, no importa services): el docblock fija el contrato de los dos formatos. `MEMBER_INFLOW_KINDS` se movio ahi (la copia de `cash-count-service.ts` ahora lo importa: DRY).
- **Lectores** (`withdrawal-service.ts`): `activeWithdrawalIdSql`/`activeWithdrawalDateSql` (`withdrawalRowSql("w")`), `lastActiveWithdrawal`, `list`, `getById`, `listResponsibles` y `findActiveWithdrawalForPayment` usan el marcador. El grep de detecciones por `responsible_name IS NOT NULL` fuera del marcador da vacio.
- `paymentCount` (lista y detalle) cuenta solo cobros (JOIN a los 3 kinds de cobro de socio). `WithdrawalListItem` suma `format`, `destinationCashRegisterId`, `destinationName` (null en los viejos; subquery correlacionado literal con `tenant_id` en cada tabla strict). `MovEgresoItem` suma `responsibleName`.
- `describeFlow`: un `cash_transfer` con responsable se describe "Retiro a/desde {caja}".
- `TransactionService._void`: el guard de "cobro incluido en un retiro" corre solo para cobros de socio.
- Excel `/movements-history/export`: `tipo` = "Retiro" para `cash_transfer` con responsable; los retiros viejos siguen "Egreso" (DI-09).
- **Anulacion** (`transfer-pair.ts` + `movement-service.ts`): `collectTransferGroupIds` devuelve `{ outflowId, inflowId, adjustmentIds, isWithdrawal }` filtrando por kind (hermana = solo `cash_transfer`; ajustes = solo `adjustment` vivos linkeados a CUALQUIERA de las dos patas; nunca cobros). `voidMovement` anula `[salida, entrada, ...ajustes]`. `voidExpense` despacha: `expense` como siempre; `cash_transfer` de retiro = el grupo; `cash_transfer` sin responsable = 400 "Es un traslado entre cajas: anulalo como traslado"; otro kind = 400 "No es un egreso ni un retiro".

## Verificacion

- `npx tsc --noEmit` (api): 0. `lint:tenant`: DISCREPANCIAS 0. `pnpm typecheck:tests`: 18 (preexistentes), ninguna en archivos del plan. Admin sin cambios (vue-tsc no corrido: no se toco el admin).
- Tests, uno por corrida y en foreground: `withdrawal-marker` (unit) 14/14; `withdrawals` 26/26 y `mov-egresos-history` 8/8 SIN tocar aserciones (tras el Task 2); `movement-service` 14/14 y `withdrawals` 26/26 de nuevo (tras el Task 3); `iso-03-finance-coach-load` 35/35 (el egreso ajeno sigue dando 404); `withdrawal-formats` 21/21 (20 en la corrida completa + el caso agregado despues, corrido con `-t`).
- Numeros literales de la no-regresion: sede con 4 cobros (1000/2000/3000/4000), retiro viejo 3000 con faltante 10 y retiro nuevo 6000 con sobrante 5 => sede 995, Central 6000; tras anular el nuevo sede 6990 y Central 0; tras anular el viejo sede 4005 y Central 6000. Mundo solo-viejos: lista 1 retiro (3000, 2 cobros, destino null), pendiente = solo el cobro 3 (3000), `previousBalance` 0, `firmeBalance` 3000.
- Mutacion: sacar el filtro `MEMBER_INFLOW_KINDS` del guard de `_void` NO hizo fallar los tests de anulacion por `/expenses` ni `/movements` (ver desviacion 2), asi que se agrego el caso `POST /transactions/<pata de entrada>/void`, que si depende del filtro.

## Decisiones del ejecutor / desviaciones

1. **Fix chico en el camino (Rule 1):** anular un traslado comun por su PATA DE ENTRADA dejaba vivo el ajuste de conciliacion (el ajuste esta linkeado a la salida). Ahora cae con el par. Test: "anular por la PATA DE ENTRADA tambien anula el ajuste".
2. **El guard de `_void` es defensivo, no se activa por el orden de `voidPair`:** como el grupo se anula `[salida, entrada, ajustes]` en una sola transaccion, cuando le toca a la entrada la salida ya esta anulada y el guard no encontraba retiro activo. El filtro por kind solo importa si alguien anula la pata de entrada sola por `POST /transactions/:id/void` (caso cubierto con un test propio, que afirma 200 igual que una pata de un traslado comun). El orden salida-primero del grupo es entonces parte del contrato: no reordenar.
3. **`POST /expenses/:id/void` ya no anula cualquier fila:** antes anulaba cualquier id; ahora 400 para todo lo que no sea egreso o retiro (Task 3 del plan, T-208-16). El admin solo lo llama desde RetirosTab.
4. `POST /movements/:id/void` sobre una fila que no es `cash_transfer` ahora da 400 "No es un traslado" (antes caminaba los links de cualquier fila). El admin no usa esa ruta.
5. `CajaRef` de `withdrawal-service.ts` quedo como estaba (no se toco `loadCaja` de `movement-service`).
6. `test/finance/withdrawal-formats.test.ts` crea cajas propias (sede y Central) por mundo y limpia todo lo del gimnasio en `afterAll`, como `withdrawals.test.ts`.
7. Una corrida de vitest que supero 180 s fue pasada a segundo plano por el arnes (no por mi); siempre se espero a su fin antes de lanzar otra.

## Para los planes siguientes

- **208-06 (cambia el alta):** el contrato del formato nuevo esta en el docblock de `withdrawal-marker.ts` y lo siembra `test/fixtures/withdrawal-fixtures.ts`; el test de 208-06 que compara el alta real con el fixture y este fixture deben cambiar juntos. Puntos finos: (a) la pata de entrada lleva el MISMO `responsible_name` (necesario para el Excel "Retiro" y la descripcion "Retiro desde"); (b) la salida lleva el `branch_id` de la caja de origen y `cost_center_id` NULL; (c) el ajuste por conteo se inserta ANTES que las patas (`createCountAdjustment` de 208-04) y se linkea ajuste -> salida con `allocated_amount` 0; (d) los links a cobros salen desde la SALIDA con `allocated_amount` = monto del cobro; (e) `transfer-pair.ts` es el lugar para `createTransferPair`.
- `registerWithdrawal` actual todavia graba el formato viejo; los lectores ya soportan ambos, asi que el cambio del alta no necesita tocar lectores.
- `WithdrawalListItem` tiene `format`, `destinationCashRegisterId`, `destinationName`: 208-07/08 (admin) puede mostrar el destino en el historial de RetirosTab y un chip por formato. Los tipos del admin no se tocaron (campos aditivos).
- `GET /withdrawals` para una caja Central/Tesoro nunca muestra la pata de entrada (no es retiro); el ingreso se ve en su resumen del cajon como "Retiro desde {sede}".
- Reportes/Tablero por centro de costo "Retiros": ningun lector lo usaba (DI-05), asi que el retiro nuevo (sin centro) no suma como egreso. No se auditaron Reportes/Tablero que sumen `kind='expense'` en general (los retiros viejos siguen contando ahi como hoy).
- La anulacion de la pata de entrada resta saldo en la Central/Tesoro: si el destino ya gasto esa plata, `_void` no tiene guard de saldo negativo (comportamiento preexistente de los traslados). Candidato a revisar si se quiere impedir.

## Known Stubs

Ninguno.

## Self-Check: PASSED

Commits 27d952dd0, 6b902c073, 9f0b7aabe y 13164020d existen; archivos creados presentes; tsc 0, lint:tenant 0, typecheck:tests 18.
