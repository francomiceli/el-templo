---
phase: 208-cuentas-tesoro-retiros
plan: 06
subsystem: api-finance
tags: [retiros, traslado, destino, tesoro, caja-central, create-transfer-pair]
requires: ["208-05"]
provides:
  - "createTransferPair: armado unico del par de traslado (traslado comun y retiro)"
  - "registerWithdrawal como traslado con destino obligatorio (Caja central o Tesoro)"
  - "GET /api/admin/finance/withdrawals/destinations"
affects: [208-07, 208-08]
key-files:
  created:
    - el-templo-api/test/finance/withdrawals-destino.test.ts
  modified:
    - el-templo-api/src/modules/finance/transfer-pair.ts
    - el-templo-api/src/modules/finance/movement-service.ts
    - el-templo-api/src/modules/finance/withdrawal-service.ts
    - el-templo-api/src/modules/finance/schemas.ts
    - el-templo-api/src/modules/finance/routes.ts
    - el-templo-api/src/modules/finance/types.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/tenancy/iso-03-finance-cajas.test.ts
    - el-templo-api/test/tenancy/iso-03-cobertura.test.ts
    - el-templo-api/test/fixtures/finance-gimnasio-dos.ts
decisions:
  - "Origen: cualquier caja que hoy admite retiro (efectivo de sede, banco, caja sin sede para el owner). Destino SIEMPRE efectivo sin sede (Central o Tesoro), activo, misma moneda, distinto del origen"
  - "El destino se valida en el service (no con enforceCajaScope): gestion/admin/admin_sede pueden elegir Central/Tesoro aunque sean owner-only en Saldos"
  - "registerWithdrawal ya no crea expense ni resuelve el centro Retiros (resolveRetirosCostCenter eliminado, RETIROS_COST_CENTER_NAME se conserva exportado)"
metrics:
  tasks: 3
  completed: 2026-11-11
---

# Phase 208 Plan 06: el alta de retiro es un traslado con destino

Todo retiro nuevo exige `destinationCashRegisterId` (Caja central o Tesoro) y se guarda como par `cash_transfer` en UNA transaccion: la caja de origen baja y el destino sube exacto (con centavos), con responsable, conteo (ajuste + arqueo), vinculo a los cobros retirados y sin costo.

## Commits

- `af7e08d76` refactor(208-06): armado unico del par de traslado
- `55ea9766c` feat(208-06): retiro como traslado a Caja central o Tesoro, con destinos por caja
- `4d24e58ec` test(208-06): retiro con destino (validaciones, saldos exactos, contrato, permisos)

## Que se hizo

- **`createTransferPair`** (`transfer-pair.ts`): inserta salida, entrada y los dos links ida y vuelta (`allocated_amount` 0). `responsibleName` opcional en LAS DOS patas, `idempotencyKey` opcional solo en la salida (sin uso todavia: deja trivial el merge de la T0). Guards de programacion (misma moneda, origen != destino). `registerMovement` solo reemplazo el bloque "pata A + pata B + links" por la llamada (mismo orden de inserts, mismos campos); el resto del metodo intacto salvo `outflow.id`/`inflow.id` -> `outflowId`/`inflowId`.
- **`registerWithdrawal`**: valida responsable/monto/fecha/caja/conteo como siempre; `loadDestination` (efectivo, sin sede, activo, distinto del origen: un solo mensaje "El destino del retiro tiene que ser la Caja central o un Tesoro activo" para no-existe/ajeno/banco/sede/baja/origen; moneda distinta: "El destino tiene que estar en ARS: la caja X es en ARS"); fecha >= corte del destino; `assertMethodAllowedForAccount("internal", ...)` en origen y destino (DI-04). Dentro de la tx: candado `FOR UPDATE` de origen y destino en UNA sentencia ordenada por id; ajuste por conteo via `createCountAdjustment` con el texto de siempre (byte-for-byte) ANTES de las patas; tope de efectivo como hoy; cobros a vincular como hoy; `createTransferPair`; links salida->cobros (monto del cobro) y ajuste->salida (0); `cash_counts` con `Conteo al retirar (retiro #<salida>)`. Devuelve `{ withdrawalTxId (= salida), inflowTxId, amount }`. Log Pino con `destinationCashRegisterId` e `inflowTxId`.
- **`listDestinations`** + ruta **`GET /withdrawals/destinations?cashRegisterId=`** (registrada antes de `/withdrawals/:id`): `enforceCajaScope` sobre el ORIGEN + `assertBranchInEnforcedScope`; devuelve solo `{ id, name, isTreasury, currency }` (sin saldos), Centrales primero y despues Tesoros, por nombre.
- **Tenancy**: manifiesto +1 (556 -> 557), `CASOS_BASELINE` 52 -> 53, `describe` con la clave literal en `iso-03-finance-cajas` (aislamiento + control) y un `it` nuevo en el alta (destino = Central de El Templo desde el gimnasio 2 -> 400, ninguna fila nueva). `finance-gimnasio-dos.ts` siembra una Central por gimnasio (`centralId`, nombre con la marca ISO03).

## Contrato del formato (coincide con `seedTransferWithdrawal`)

Salida: `cash_transfer`/`outflow`/`internal`, `branch_id` de la caja origen, `cost_center_id` NULL, `responsible_name`. Entrada: igual con la caja destino, `branch_id` del destino (NULL en Central/Tesoro) y el MISMO `responsible_name`. Links: salida<->entrada 0, salida->cobros (monto del cobro), ajuste->salida 0 (ajuste con id menor que la salida). El test del contrato siembra el mismo retiro con el fixture y compara el shape fila por fila contra el del alta real.

## Verificacion

- `npx tsc --noEmit` (api): 0. `pnpm lint:tenant`: DISCREPANCIAS 0. `pnpm typecheck:tests`: 18 (preexistentes), ninguna en archivos del plan. El api no tiene config de ESLint (no aplica).
- Tests, uno por corrida y en foreground: `movement-service` 14/14 y `centavos-traslados-retiros` 14/14 (Task 1, con el alta vieja todavia); `iso-01-manifiesto` 13/13; `iso-03-cobertura` 8/8; `iso-03-finance-cajas` 60/60; `withdrawals-destino` 20/20; `withdrawal-formats` 21/21; y por usar el fixture tocado: `ancla-branch-consistency` 10/10, `iso-03-finance-transacciones` 35/35 y `iso-03-finance-coach-load` 35/35.
- Mutacion: poner `responsibleName: null` en la pata de entrada de `createTransferPair` hace fallar el test del contrato (corrido con `-t contrato`); revertida.
- No se corrio `withdrawals.test.ts`, `cash-counts.test.ts` ni `centavos-traslados-retiros` despues de la Task 2 (rotos a proposito, los adapta 208-07).

## Casos rotos a proposito para 208-07 (crean retiros SIN destino -> 400 de schema)

`test/finance/withdrawals.test.ts` (helper `postWithdrawal`, 18 `it`):
- GET /withdrawals/pending summary: "despues de un retiro: 'quedo' = lo que no se llevo; ..."
- "caso Martin: un gasto pagado desde la caja baja el tope del retiro"
- "registra por monto: centro Retiros, responsable, notas; auto-vincula ...; el saldo baja por el monto" (ademas asserta centro "Retiros": ya no aplica)
- "retiro parcial: el remanente queda en la caja y un cobro nunca se vincula dos veces"
- "fecha pasada vincula solo lo cobrado hasta esa fecha; rechaza fecha futura y anterior al corte"
- "conteo igual al esperado ...", "faltante: sin nota -> 400; con nota -> ajuste ... linkeado al retiro ...", "sobrante ...", "el conteo solo va en un retiro de hoy"
- "validaciones de forma: sin monto, monto 0, responsable vacio o ausente" (siguen en 400 pero hay que ver si el mensaje asertado cambia)
- "coach -> 403" (ahora el schema da 400 antes del chequeo de rol si falta el destino)
- "anular un cobro retirado -> 409; anular el retiro libera el cobro ...", "anular un retiro con faltante anula tambien su ajuste", "los cobros de un retiro anulado se vuelven a vincular en el siguiente" (el retiro nuevo se anula igual por `POST /expenses/:id/void`)
- cuenta banco: "monto explicito, sin cobros; paymentCount 0; resta del saldo de la cuenta" (ahora el destino es una Central y el origen baja pero no queda en el centro Retiros), "sin amount -> 400; con conteo -> 400"
- "un egreso con otro centro sigue funcionando y NO aparece como retiro" (usa un retiro para el contraste)
- "lista filtrada por caja, detalle con cobros, y responsables sugeridos"
- Solo estos 18 `it` llaman a `postWithdrawal`/`POST /withdrawals`; el resto del archivo (pending, bloqueo de egresos con centro Retiros) no cambia.

`test/finance/cash-counts.test.ts` (1): "un retiro baja el esperado (la plata salio del cajon)" (POST /withdrawals sin destino, linea ~262).

`test/finance/centavos-traslados-retiros.test.ts` (4, helper `postWithdrawal`): "retiro de 300.30 con conteo = esperado + 0.20 ...", "faltante de 0.10 ...", "conteo igual al esperado con centavos ...", "monto de 1.005 -> 400 y 0 -> 400; 0.5 -> 201" (el 201 final).

Los demas archivos que leen retiros (`admin-sede-scope`, `mov-egresos-history`, `withdrawal-formats`) los siembran por insert/fixture y no dependen del alta.

## Decisiones del ejecutor / desviaciones

1. **Candado del destino**: un solo `SELECT ... WHERE id IN (origen, destino) ORDER BY id FOR UPDATE` (en vez de dos). Mismo efecto de orden ascendente, menos viajes.
2. **Corte del destino**: el plan pedia solo `transactionDate >= destino.cutoffDate`; se valida siempre (el destino es siempre efectivo), tambien con origen banco.
3. **Retorno ampliado**: `registerWithdrawal` devuelve ademas `inflowTxId`. La ruta sigue respondiendo `{ withdrawal }` (`getById` de la salida); el `201` no declara response schema, asi que no hay recorte de Ajv.
4. **`GET /withdrawals/destinations` con origen ajeno**: 404 por `enforceCajaScope` en la ruta (como `/withdrawals/pending`); un origen inexistente para un owner cae en `loadCaja` (404 "Caja no encontrada"). El test acepta 400/404 para "inexistente".
5. **Banco como origen queda con saldo negativo** en Saldos si no tenia fondos que el ledger conozca (el tope solo corre en efectivo, como ya era). El test lo afirma (-700.7).
6. **Task 1 verificacion**: corrio `movement-service.test.ts` y `centavos-traslados-retiros.test.ts` completos antes del cambio del alta (14/14 cada uno), antes de commitear el refactor.
7. **Dos corridas de vitest** fueron pasadas a segundo plano por el arnes al superar 180 s; se espero siempre su fin antes de lanzar otra.
8. Sin migracion nueva, sin cambios de admin/app.

## Para los planes siguientes (208-07/08, admin)

- **Destinos**: `GET /api/admin/finance/withdrawals/destinations?cashRegisterId=<origen>` -> `200 { destinations: [{ id, name, isTreasury, currency }] }`. Roles: los que pueden cargar retiros (owner/admin/gestion/admin_sede). Centrales primero, Tesoros despues, por nombre. Excluye el origen, otras monedas, cajas de sede, bancos e inactivas. Si `destinations` viene vacio, el admin debe mostrar "no hay Caja central ni Tesoro en {moneda}: crealo primero".
- **Alta**: `POST /api/admin/finance/withdrawals` body `{ cajaId, destinationCashRegisterId (requerido), responsibleName, transactionDate?, notes?, amount, countedAmount? }` -> `201 { withdrawal }` con `WithdrawalDetail` (`format: "transfer"`, `destinationCashRegisterId`, `destinationName`, `paymentCount`, ...). Errores 400 con mensajes de usuario: destino invalido, moneda distinta, fecha anterior al corte de la caja o del destino, saldo insuficiente, diferencia de conteo sin nota.
- El origen puede ser banco (sin conteo, sin cobros): el selector de destino aplica igual (efectivo sin sede de la misma moneda).
- Anular un retiro nuevo: `POST /expenses/:id/void` con el id de la salida (RetirosTab ya lo usa); anula salida + entrada + ajuste y libera los cobros.
- `WithdrawalListItem.format/destinationName` (de 208-05) ya permiten mostrar el destino y un chip por formato en RetirosTab.
- El `inflowTxId` esta en el log, no en la respuesta HTTP.
- Merge con la T0 (`fix/traslados-idempotencia`): en `registerMovement` el unico cambio es el bloque del par; la T0 puede pasar `idempotencyKey` a `createTransferPair` (ya soportado solo en la salida).

## Known Stubs

Ninguno.

## Self-Check: PASSED

Commits af7e08d76, 55ea9766c y 4d24e58ec existen; `withdrawals-destino.test.ts` presente; tsc 0, lint:tenant 0, typecheck:tests 18.
