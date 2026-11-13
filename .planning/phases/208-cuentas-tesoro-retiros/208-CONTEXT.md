# Phase 208 — Cuentas: USD, Tesoro, cheque, retiro con destino, arqueo de apertura

Milestone: `.planning/egresos-rendiciones/MILESTONE.md`. Decisiones de producto: `.planning/egresos-rendiciones/DECISIONES.md` (D-09, D-19; contexto en §6, §7, §10, §15, §16). Este archivo fija las decisiones de implementación (orquestador, autonomía delegada por Franco 2026-11-10). Depende de la 207 (centavos: DECIMAL(14,2), `shared/money.ts`, `moneyTwoDecimals`, `MoneyInput` en el admin) — leer `207-*-SUMMARY.md`, sobre todo 207-12 (inventario final y guard `test/unit/money-contract.test.ts`).

## Objetivo (ROADMAP §Phase 208)

1. Cajas/cuentas en **USD** (además de ARS/EUR); saldos y reportes por moneda incluyen USD.
2. **Tesoro** = cuenta de EFECTIVO sin sede, aparte de Caja central (reserva/caja fuerte), una por moneda (Tesoro ARS, Tesoro USD…), con saldo de apertura.
3. **Cheque** como medio; regla ÚNICA de coherencia medio↔cuenta.
4. **Retiro con destino obligatorio** (Caja central o Tesoro), guardado como **traslado** (la sede baja, el destino sube); se conservan responsable, conteo y resumen "quedó + ingresó − salió". Los retiros viejos NO cambian.
5. Central y Tesoro pueden arrancar con un **arqueo de apertura** del efectivo real.

## Estado actual (relevado 2026-11-10)

- `cash_registers` (`src/db/schema/cash-registers.ts`): `type` enum `efectivo|banco`, `branch_id` nullable, `currency` varchar(3) (hoy la validación/UI solo ofrece ARS/EUR: `CajaEfectivoFormDialog`/`CuentaBancariaFormDialog`), `opening_balance`/`change_fund` DECIMAL(14,2), `cutoff_date`.
- Caja central = `efectivo` con `branch_id` NULL (owner-only en los listados: `cash-register-service.ts` ~432-500, `routes.ts` ~156/1691/2159). La UI no permite crear una caja efectivo sin sede.
- `financial_transactions.payment_method` enum: `cash|transfer|card|aura_credit|internal|direct_debit` — sin cheque.
- Retiro (`src/modules/finance/withdrawal-service.ts`): un `expense` con centro de costo "Retiros" que SALE de la caja de sede y NO entra a ninguna cuenta; guarda responsable, conteo, links a los cobros (withdrawalId) y resumen. Prod 11-10: 48 retiros activos ($82,5M) así.
- Traslado (`movement-service.ts` `registerMovement`/`voidPair`): dos filas `cash_transfer` vinculadas por `transaction_links`, alta y anulación atómicas.
- La rama `fix/traslados-idempotencia` (T0, sin mergear) agrega `idempotencyKey` a traslados y toca `movement-service.ts`, `finance/schemas.ts`, `finance/routes.ts`, `RegistrarMovEgresoDialog.vue`. NO depender de ella; tocar esos archivos solo donde haga falta.

## Decisiones de implementación

- **DI-01 Tesoro:** columna nueva `cash_registers.is_treasury BOOLEAN NOT NULL DEFAULT FALSE`. Tesoro = `type='efectivo' AND branch_id IS NULL AND is_treasury`. Central = `type='efectivo' AND branch_id IS NULL AND NOT is_treasury`. Invariante validado en el service (no en CHECK): `is_treasury` solo con efectivo y sin sede. Owner-only como Central (mismos scopes de listado). Se crea desde el admin (owner) con nombre, moneda y saldo de apertura; una por moneda (validar unicidad tenant+moneda entre tesoros activos en el service).
- **DI-02 USD:** helper único de monedas soportadas (`ARS|EUR|USD`) en la API (schema Ajv enum) y en el admin (selects). Revisar todo lugar que liste/agrupe por moneda (saldos, Excel de Saldos, Reportes, Tablero, Analíticas) para que USD no se pierda ni se sume a ARS. NO hay tipo de cambio en esta fase (va en 209): los totales siguen por moneda, nunca mezclados.
- **DI-03 Cheque:** agregar `cheque` al enum `payment_method` (migración ALTER que conserve el orden actual y agregue al final). Etiqueta "Cheque" en el admin. Donde el admin ofrezca medios para egresos/traslados/cobros, sumar cheque solo donde la regla DI-04 lo admite.
- **DI-04 Regla medio↔cuenta:** una sola función pura en la API (p. ej. `src/modules/finance/payment-method-rules.ts`: `isMethodAllowedForAccount(method, accountType)` + `assertMethodAllowedForAccount`) y su espejo en el admin (para filtrar opciones). Regla: `cash` solo con cuenta `efectivo` (sede, Central o Tesoro); `transfer|card|cheque|direct_debit` solo con `banco`; `internal` y `aura_credit` EXENTOS (no mueven plata real de una cuenta, o ya tienen su circuito). Aplicarla en las ALTAS nuevas de egresos, traslados y retiros. En cobros, verificar primero que los caminos actuales ya cumplen (cobro en efectivo → caja de sede; transferencia → banco) con tests; si algún camino de cobro hoy viola la regla con datos legítimos, NO romperlo: documentarlo en el SUMMARY y dejarlo fuera de la regla. Nada de validación retroactiva sobre filas existentes.
- **DI-05 Retiro como traslado:** el alta de retiro nueva exige `destinationCashRegisterId` (Central o Tesoro, MISMA moneda que la caja de sede, activa, del mismo tenant). Se graba como par `cash_transfer` (salida en la sede, entrada en el destino) reutilizando la lógica de `movement-service.ts` (no duplicar el armado del par), dentro de UNA transacción que además guarda lo propio del retiro (responsable, conteo, links a cobros, resumen). Marcar el retiro de forma que los lectores lo distingan de un traslado común (p. ej. el mismo vínculo/registro de retiro que hoy apunta al expense pasa a apuntar a la pata de salida, o un `kind`/marca en `transaction_links`; decidir tras leer el código y documentar). Anular un retiro nuevo anula el par completo (`voidPair`). Los retiros viejos (expense + centro "Retiros") siguen visibles y anulables como hoy: los lectores (historial de retiros, resumen de jornada, Tablero, Reportes, export de movimientos) deben mostrar AMBOS formatos sin duplicar ni perder ninguno. El retiro nuevo NO es costo: no usa el centro "Retiros" ni suma como egreso en reportes.
- **DI-06 Arqueo de apertura:** para Central y Tesoro (y cualquier caja efectivo sin sede), permitir registrar un arqueo de apertura: el owner informa el efectivo real contado y el sistema deja la cuenta en ese saldo con un movimiento de ajuste trazable (motivo "Arqueo de apertura", quién, cuándo). Reutilizar el mecanismo de ajuste por conteo existente (207-04 lo menciona) si encaja; si no, un `adjustment` con link al conteo. Para una cuenta NUEVA alcanza con `opening_balance` + `cutoff_date` en el alta (no duplicar).
- **DI-07 Admin:** Caja → alta de Tesoro (owner), selects de moneda con USD, medio "Cheque" donde corresponda, diálogo de Retiro con selector de destino obligatorio (Central/Tesoro de la misma moneda; si no existe ninguno, mensaje claro de que hay que crear uno), arqueo de apertura en Central/Tesoro. Importes con `MoneyInput` (207-09). Textos en español rioplatense; sedes por calle.
- **DI-08 Migraciones:** numerar a continuación de la última en la rama (207 dejó 0327/0328). Sin `;` en comentarios SQL. Sin tabla gym-owned nueva salvo necesidad real (si se crea, cumplir los 5 conteos de tenancy). Columnas nuevas en tablas existentes con `tenant_id`: revisar si algún contrato/gate de tenancy enumera columnas.
- **DI-09 Sin cambio de comportamiento para lo existente:** saldos, Bandeja, Saldos por caja, Reportes y Tablero dan IGUAL con los datos actuales (retiros viejos incluidos). Test de no-regresión.

## Tests requeridos

- Alta de cuenta USD (efectivo y banco) y Saldos por moneda con USD separado.
- Tesoro: alta (owner), invariantes (no con sede, no banco, uno por moneda), scope owner-only en listados.
- Regla medio↔cuenta: matriz completa de la función pura + rechazo en alta de egreso/traslado/retiro; cobros actuales siguen pasando.
- Retiro nuevo: exige destino; misma moneda; sede baja y destino sube exacto (con centavos); responsable/conteo/resumen conservados; anulación revierte ambas patas; no suma como egreso.
- Retiros viejos: siguen listándose y anulándose igual; lectores muestran viejos + nuevos sin duplicar.
- Arqueo de apertura: deja el saldo exacto y es trazable.
- Gates de tenancy y guard de plata de la 207 (`money-contract.test.ts`) siguen verdes.

## Fuera de alcance

Egresos (gasto/reparto/pagos), tipo de cambio y cambio de moneda, extracto por cuenta, Resultado, Rendiciones (209-212). No migrar retiros viejos.
