---
phase: 208-cuentas-tesoro-retiros
plan: 11
subsystem: api-tests
tags: [no-regresion, inventario, uat, retiros, tesoro, usd]
requires: ["208-10"]
provides:
  - "test/finance/no-regresion-208.test.ts: totales literales con datos como prod hoy + convivencia de retiros viejos y nuevos, Tesoro y cuenta USD (T-208-31, DI-09)"
  - "Inventario final con greps reproducibles (T-208-32)"
  - "Checklist de UAT consolidado de la fase 208 y pendientes para fases siguientes"
affects: [209, 211]
key-files:
  created:
    - el-templo-api/test/finance/no-regresion-208.test.ts
  modified:
    - el-templo-admin/src/components/caja/CerrarCajaDialog.vue
decisions:
  - "El historial de retiros sigue listando los anulados con su marca (voidedAt): la no-regresion lo afirma asi, no como 'desaparece'"
  - "Fechas del escenario: el lunes de la semana en curso (boardWeeks().current), como 207-12. El egreso y el traslado por API quedan fechados hoy por el service y ningun total por fecha depende de ellos"
metrics:
  tasks: 3
  completed: 2026-11-11
---

# Phase 208 Plan 11: cierre de la fase (no-regresion, inventario y UAT)

Cierre de la fase 208: un test de no-regresion con totales literales sobre un escenario "como prod hoy" (retiro viejo, egreso, traslado, cobros en efectivo y por transferencia) y su convivencia con lo nuevo (Tesoro, cuenta USD, retiro con destino, arqueo de apertura y anulaciones de los dos formatos), inventario final con greps y el checklist de UAT consolidado de las 10 fases de trabajo.

## Commits de este plan

- `484146528` test(208-11): no-regresion de saldos y lectores con retiros viejos y nuevos
- `8bfbc57e7` fix(208-11): cierre de caja usa la lista unica de simbolos de moneda (con USD)

La Task 1 (inventario) no generó cambios de código: todo lo que encontró es correcto o queda como pendiente documentado abajo.

## Commits de la fase 208

| Plan | Commits |
|------|---------|
| 208-01 | `6af315b8f` migración 0329 y schemas · `76bee3a7d` monedas y regla medio-cuenta · `5835612d7` cheque en tipos · `cfde33f46` test cheque en Resumen |
| 208-02 | `306cc7bd3` USD y resolver por moneda · `fdbcbb823` Tesoro owner-only y Excel · `f73d302a6` tests |
| 208-03 | `f71629857` regla medio-cuenta aplicada · `f0696d1c0` tests |
| 208-04 | `e092e37e3` arqueo de apertura · `d1e01317c` tests |
| 208-05 | `27d952dd0` marcador único · `6b902c073` lectores · `9f0b7aabe` anulación por grupo · `13164020d` tests |
| 208-06 | `af7e08d76` `createTransferPair` · `55ea9766c` retiro como traslado con destino · `4d24e58ec` tests |
| 208-07 | `844fc4637` suite de retiros con destino · `a49874fbd` arqueos y centavos |
| 208-08 | `5f57ac423` monedas USD y espejo de la regla · `163bba4f9` tipos y composable · `124836555` Bandeja con la regla |
| 208-09 | `bb3188e45` USD en altas · `f6c497366` Tesoro y arqueo de apertura · `6740138e9` grupo Tesoro en Saldos |
| 208-10 | `7017ac0e6` retiro con destino · `83b290fd3` destino en historial y retiros en Mov./Egresos |
| 208-11 | `484146528` no-regresión · `8bfbc57e7` símbolo de moneda en el cierre de caja |

## Task 1: inventario final (greps reproducibles, corridos 2026-11-11 sobre HEAD)

### (a) Detección de retiros

`grep -rnE "responsible_name IS NOT NULL|responsibleName\} IS NOT NULL|isNotNull\(schema\.financialTransactions\.responsibleName\)|RETIROS_COST_CENTER_NAME|'Retiros'|\"Retiros\"" el-templo-api/src/modules`

| Sitio | Qué es | Conclusión |
|-------|--------|------------|
| `finance/withdrawal-marker.ts:6/11/29` | comentarios del contrato | solo docs |
| `finance/withdrawal-marker.ts:77` | `isNotNull(responsibleName)` en `withdrawalRowConditions()` | el ÚNICO detector (Drizzle) |
| `finance/withdrawal-marker.ts:94` | `responsible_name IS NOT NULL` en `withdrawalRowSql()` | el ÚNICO detector (SQL crudo) |
| `finance/movement-service.ts:45,472` | `RETIROS_COST_CENTER_NAME` | solo el bloqueo de egresos manuales con centro "Retiros" |
| `finance/withdrawal-service.ts:117` | definición de la constante | se conserva exportada (la usan el bloqueo y el fixture) |
| `finance/routes.ts:144,791`, `types.ts:283,746`, `withdrawal-service.ts:8,13,42` | comentarios | solo docs |

Conclusión: la detección de retiros pasa SOLO por `withdrawal-marker.ts`; ningún lector detecta por centro de costo ni por `responsible_name` suelto.

### (b) Creación de `expense`

`grep -rn 'kind: "expense"' el-templo-api/src/modules` → único sitio: `finance/movement-service.ts:494` (`registerExpense`, egresos comunes). El retiro nuevo ya no crea `expense` (208-06); el viejo solo existe como dato sembrado (48 en prod).

### (c) Lectores del ledger fuera de `finance/`

`grep -rln "financialTransactions\|financial_transactions" el-templo-api/src/modules | grep -v finance/` → 15 archivos:

| Archivo | Filtro sobre el ledger | Conclusión |
|---------|------------------------|------------|
| `analytics/ticket-service.ts` | `kind='plan_charge'`, inflow, no anulado | pata de entrada de un retiro (`cash_transfer`) no entra |
| `analytics/ltv-service.ts:311` | `kind IN (plan_charge, debt_settlement)`, inflow | idem |
| `analytics/advanced-finance-service.ts:206` | `kind IN (plan_charge, debt_settlement)`, inflow | idem |
| `analytics/service.ts:812,1433` | `kind='plan_charge'` (yaPago) y `IN (plan_charge, debt_settlement)` (tendencias, por medio, por sede) | idem |
| `analytics/cohorts.ts`, `analytics/scope.ts`, `analytics/routes.ts`, `analytics/types.ts`, `analytics/especial-report-service.ts` | solo comentarios o ningún acceso directo | sin riesgo |
| `reports/service.ts:755,1078` | `kind IN (plan_charge, debt_settlement)` inflow y `advance_payment` linkeado a deuda | idem |
| `reports/types.ts` | solo tipos | sin riesgo |
| `subscriptions/service.ts` | escribe `plan_charge`; lee por `kind` explícito | no toca traslados |
| `members/service.ts`, `members/routes.ts`, `wellhub/member-wellhub-service.ts` | comentarios o joins de membresía | sin riesgo |
| `weekly-board/calculator.ts:83` | llama `getIncomeByMemberBranch` (finance), que usa `buildRevenueConditions`, la MISMA condición que el Resumen | la no-regresión prueba que el Resumen y los ingresos por sede no se mueven con retiros nuevos |

Conclusión: ningún lector fuera de finance suma `cash_transfer` ni `expense`. La pata de entrada de un retiro en Central/Tesoro nunca cuenta como ingreso. Lo que NO se auditó: lectores que sumen `kind='expense'` en general (ver pendientes).

### (d) Monedas

`grep -rnE "\"ARS\", \"EUR\"|'ARS', 'EUR'|'ARS' \| 'EUR'|\"ARS\" \| \"EUR\"" el-templo-api/src el-templo-admin/src` → clasificados:

| Sitio | Clase | Conclusión |
|-------|-------|------------|
| `api shared/currency.ts:13` `CountryCurrency`, `:25` `SUPPORTED_ACCOUNT_CURRENCIES` | cuentas incluye USD (`:25`); `CountryCurrency` es del país | correcto |
| `api subscriptions/types.ts:238,385`, `subscriptions/service.ts:814,7397,7686`, `reports/types.ts:91,110,534,569`, `analytics/ticket-service.ts:82-83`, `ltv-service.ts:81`, `referral-partners/types.ts:12`, `db/schema/referral-partners.ts:43`, `scripts/backfill-historical-payments.ts:59` | cobros/planes/deudas/partners | ARS/EUR por diseño (la moneda de un cobro la define el plan; los cobros no pueden ser USD) |
| `admin utils/currencies.ts:9` | cuentas (`ACCOUNT_CURRENCIES` con USD) | correcto |
| `admin types/subscription.ts`, `useMembersApi.ts:580`, `ReportesPage`, `DeudasPage`, `AnaliticasPage`, `CobrosPage`, `IngresosTab`, `FinanzasTab`, `FinanzasAvanzadasTab`, `PorDeudaTab`, `types/transaction.ts:442`, `types/report.ts:283`, `types/weekly-board.ts:13`, `usePartnersApi.ts:23` | cobros/deudas/reportes por país | ARS/EUR por diseño |
| `admin utils/format-price.ts:3` (`Currency`) | formato de precios de cobros; `formatPrice` igual muestra USD (`US$`) por el fallback de 208-08 | correcto, no se ensancha a propósito |
| `admin components/caja/MovimientosTab.vue:511` | `displayCurrency` de los totales de cobros del país (`selectedCountry === 'ES' ? 'EUR' : 'ARS'`) | cobros: ARS/EUR por diseño |

Sitios de CUENTAS sin USD: ninguno quedó. El único que quedaba (`CerrarCajaDialog.vue:315`, `currencySymbol` local sin USD) se arregló en este plan (ver Desviaciones).

### (e) Medios de pago

`grep -rn "Record<PaymentMethod" el-templo-api/src el-templo-admin/src` → 9 sitios, todos con clave `cheque` (verificado con grep de cada bloque):

`api finance/payment-method-rules.ts:36`, `finance/routes.ts:2484`, `finance/transaction-service.ts:2764`, `finance/types.ts:934` (tipo derivado de `PaymentMethod`), `admin FinancialHistoryTab.vue:204`, `types/transaction.ts:57,67,999`, `utils/payment-method-rules.ts:20`.

Enums de body de cobros (`coach-load-routes.ts:155`, `subscriptions/schemas.ts`, `programs/routes.ts`, `reports/schemas.ts`) siguen SIN `cheque` (decisión 208-01/08, congelada por `payment-method-rules.test.ts`).

### (f) Migraciones (refs locales, sin `git fetch`)

| Ref | Últimas |
|-----|---------|
| `origin/master` | 0326 y **0330** (`0330_wellhub_visitas_sin_horario_alberti.sql`) |
| `origin/staging` | 0326 y **0330** |
| `feat/egresos-rendiciones` | 0327, 0328 (207), **0329** (208) |

La 208 usa 0329: no hay colisión de número (0329 está libre en master/staging), pero master y staging ya tienen la **0330**, así que al mergear quedan 0327-0329 por debajo de una 0330 ya aplicada en prod. El runner custom trackea por nombre en `_migrations`, así que el orden numérico no debería importar; confirmar antes del push (ver pendientes). Re-verificar con `git fetch` antes de pushear: este inventario usa refs locales.

## Task 2: no-regresión DI-09 (`no-regresion-208.test.ts`, 14 tests)

Escenario "como prod hoy": sede A (caja de efectivo propia), Central ARS propia y banco ARS propio; cobros firmes 1500 y 2500 en efectivo en A y 3000 por transferencia al banco; retiro VIEJO de 3000 desde A (sembrado con `seedLegacyWithdrawal`, se lleva los dos cobros en efectivo); egreso común de 700 (`POST /expenses`, centro "Varios"); traslado de 200 de A a la Central (`POST /movements`).

### Parte 1: nada cambia (6 tests)

| Lector | Total literal (con su cuenta) |
|--------|-------------------------------|
| Saldos, caja A | 100 (1500 + 2500 − 3000 − 700 − 200) |
| Saldos, Central | 200 (0 + 200 de la entrada del traslado) |
| Saldos, banco | 3000 |
| Resumen del cajón de A | último retiro = el viejo (3000), `outflowTotal` 900 (700 + 200), `inflowTotal` 0, `previousBalance` 1000 (100 − 0 + 900), `firmeBalance` 100; cobros pendientes de retiro 0 |
| `GET /withdrawals?cashRegisterId=A` | total 1, `legacy_expense`, `paymentCount` 2, `destinationName` null |
| `GET /movements-history?cashRegisterId=A` | 5 filas: 2 cobros (1500, 2500), retiro viejo con `costCenterName` "Retiros" (3000), egreso con "Varios" (700), salida del traslado (200, sin responsable) |
| Resumen del mes | `monthlyRevenue` 7000 (1500 + 2500 + 3000), cash 4000, transfer 3000, cheque 0 |
| Ingresos por sede, A | 7000 |
| Excel de Saldos | Central "Efectivo", caja A "Efectivo", banco "Banco"; ninguna fila de este test "Tesoro" |

### Parte 2: convivencia (8 tests)

| Paso | Resultado literal |
|------|-------------------|
| Alta de Tesoro ARS (apertura 0) y cuenta banco USD por API | ARS idénticos (A 100, Central 200, banco 3000), Tesoro 0 con `isTreasury`, USD aparece con `currency` USD y saldo 0, ingresos 7000/4000/3000/0 intactos |
| Retiro NUEVO de 100 de A a la Central | A 0 (100 − 100), Central 300 (200 + 100), Tesoro 0, banco 3000, ingresos intactos |
| Historial de retiros de A | total 2, nuevo primero (`transfer`, 100, destino = Central, 0 cobros) y viejo (`legacy_expense`, 2 cobros); la Central lista 0 retiros propios; último retiro del cajón de A = el nuevo |
| Mov./Egresos de A | 6 filas; el retiro nuevo es `cash_transfer` saliente con responsable "Martín", `costCenterName` null; siguen siendo 2 `expense` (el nuevo no suma como egreso) |
| Arqueo de apertura de la Central | con 300: diferencia 0, sin ajuste, saldo 300; con 350: diferencia +50, ajuste creado, saldo 350; ingresos intactos |
| Anular el retiro VIEJO (`POST /expenses/:id/void`) | A 3000 (0 + 3000), Central sin cambio (350); los dos cobros (1500 y 2500) quedan pendientes de retiro; el historial sigue listando los 2 retiros con el viejo marcado anulado |
| Anular el retiro NUEVO | A 3100 (3000 + 100), Central 250 (350 − 100), Tesoro 0, banco 3000, ingresos 7000 |
| Excel de Saldos con Tesoro | el Tesoro dice "Tesoro", la Central sigue "Efectivo" |

Detalles del armado: cajas propias por corrida (nombre con sufijo), Tesoros activos del gimnasio desactivados en `beforeAll` y cajas propias borradas en `afterAll` (después de `cleanAllTestData`).

Resultado: **14/14 verde**, en foreground (~172 s). La primera corrida falló 1 test por una aserción mal planteada del propio test (esperaba que el historial de retiros ocultara el retiro anulado; el historial siempre listó los anulados con su `voidedAt`), se corrigió la aserción y quedó 14/14.

## Task 3: gates finales

| Gate | Resultado |
|------|-----------|
| `npx tsc --noEmit` (api) | 0 errores |
| `pnpm lint:tenant` | DISCREPANCIAS 0 |
| `pnpm typecheck:tests` | 18 (las preexistentes), ninguna en archivos de la fase |
| `vue-tsc` admin | 27 (base 27) |
| `vue-tsc` app | 21 (base 21) |
| `pnpm lint` admin | 0 errores, 8 warnings preexistentes |
| `test/unit/money-contract.test.ts` + `payment-method-rules.test.ts` + `withdrawal-marker.test.ts` (config unit) | 15 + 24 + 14 = 53/53 |
| `test/tenancy/iso-01-manifiesto.test.ts` | 13/13 |
| `test/tenancy/iso-03-cobertura.test.ts` | 8/8 |
| `test/tenancy/con-06-lint.test.ts` | 36/36 |
| `test/finance/no-regresion-208.test.ts` | 14/14 |

## Desviaciones del plan

**1. [Rule 1 - Bug menor, pedido por el orquestador] `CerrarCajaDialog.vue` con símbolo de moneda local sin USD**
- **Encontrado en:** inventario (d), hallazgo de 208-10.
- **Problema:** `currencySymbol` local (solo EUR y ARS, USD caía al código "USD"). Con cajas en USD el cierre de caja mostraba `USD` en lugar de `US$`.
- **Arreglo:** se borró la función local y se importa `currencySymbol` de `src/utils/currencies.ts`, igual que `RegistrarRetiroDialog.vue` y `RegistrarMovEgresoDialog.vue`. Sin cambio para ARS/EUR (`$`/`€`).
- **Archivo:** `el-templo-admin/src/components/caja/CerrarCajaDialog.vue`. vue-tsc admin 27 (sin cambios), eslint limpio.
- **Commit:** `8bfbc57e7`

**2. Aserción corregida en el test propio (no es un bug de producto):** el historial de retiros lista los anulados con `voidedAt`; el test lo afirma así.

Sin otras desviaciones. Sin cambios de `src/` de la API en este plan.

## Decisiones de la fase 208 (consolidadas de los 10 SUMMARY)

1. **Tesoro** = `cash_registers.is_treasury` (mig 0329) sobre una caja efectivo sin sede; invariante validada en el service (`assertTreasuryShape`), un Tesoro ACTIVO por gimnasio y moneda (validado en el service con `tenantWhere`, sin UNIQUE). Owner-only como la Central. Central vs Tesoro se distingue solo por `is_treasury`; el Excel de Saldos dice "Tesoro" y la Central sigue "Efectivo".
2. **USD**: lista única `SUPPORTED_ACCOUNT_CURRENCIES` (api) / `ACCOUNT_CURRENCIES` (admin). Una sede puede tener caja ARS y USD (`resolveCashRegister` filtra por moneda). Los cobros siguen en ARS/EUR (los cobros no pueden ser USD); `formatPrice` muestra `US$` en admin y app (en sync).
3. **Cheque**: valor agregado al final del enum `payment_method` (mig 0329). Es medio de EGRESOS: los enums de body de cobros no cambian (congelado por test unit); `cheque` es 0 en Resumen e ingresos por sede.
4. **Regla medio↔cuenta** única (`payment-method-rules.ts` + espejo en el admin): `cash` solo en efectivo (sede, Central o Tesoro); `transfer|card|cheque|direct_debit` solo en banco; `internal` y `aura_credit` exentos. Aplicada en altas de egreso, traslado, retiro y en la validación de cobros con caja elegida (sin validación retroactiva); `resolveCashRegister` resuelve cheque a la cuenta banco de la moneda. Ningún camino de cobro actual la violaba.
5. **Arqueo de apertura** (Central/Tesoro, owner): NO usa `cash_counts`; asienta un `adjustment` interno + audit `reconciliation` (`target_kind cash_register`, sin migración), con candado `FOR UPDATE`. `expected` = fondo de cambio + firme + pendiente. Sin diferencia no escribe ajuste. `createCountAdjustment` es el helper único del ajuste por conteo.
6. **Retiro como traslado** (DI-05): marcador único (`withdrawal-marker.ts`): `direction='outflow' AND kind IN ('expense','cash_transfer') AND responsible_name IS NOT NULL`. La fila canónica del retiro nuevo es la pata de SALIDA (su id es el id del retiro); la de entrada lleva el mismo responsable; el ajuste por conteo nace ANTES de las patas; los links a cobros salen de la salida. Sin columna ni migración. Los 48 retiros viejos NO se migran: los lectores muestran los dos formatos sin duplicar. Orden de anulación del grupo `[salida, entrada, ajustes]` es parte del contrato (no reordenar).
7. **Anulación**: `voidExpense` despacha por formato, así `POST /expenses/:id/void` (RetirosTab) sirve para ambos; ya no anula cualquier fila (400 si no es egreso ni retiro; traslado común → "anulalo como traslado"). `collectTransferGroupIds` filtra por kind (nunca arrastra cobros).
8. **Destino del retiro**: obligatorio; Central o Tesoro activo, misma moneda, distinto del origen; se valida en el service (gestión/admin/admin_sede pueden elegir Central/Tesoro aunque sean owner-only en Saldos); `GET /withdrawals/destinations` devuelve solo `{ id, name, isTreasury, currency }` (sin saldos). Origen puede ser caja de sede, banco o caja sin sede (owner).
9. **Admin**: sección "Caja central y Tesoro" en Cuentas (owner), `TesoroFormDialog`, `ArqueoAperturaDialog`, grupo "Tesoro" en Saldos (solo si hay), diálogo de retiro con destino (preselección: único destino o la Central; nunca el Tesoro automático), historial con columna Destino ("Sin destino (anterior)" en los viejos), Mov./Egresos con "Retiro · {responsable}".
10. **Tests**: Fastify/Ajv recorta campos extra (no 400); los tests afirman que no se persisten. Los Tesoros/Centrales de test sobreviven entre archivos: se desactivan/borran.

## Limitaciones conocidas

- Tipo de cambio y cambio de moneda: fuera de alcance (209). Los totales van por moneda, nunca mezclados.
- No hay botón para crear la Caja central (solo Tesoro).
- El filtro "Movimientos" de Mov./Egresos incluye las patas de los retiros nuevos (son `cash_transfer`); queda anotado en el código.
- La anulación de la pata de entrada de un retiro resta saldo en Central/Tesoro sin guard de saldo negativo.
- Los retiros viejos siguen mostrando "Egreso · Retiros" en Mov./Egresos (decisión DI-09).

## Pendientes / para fases siguientes

1. **`_void` de la pata de entrada sin guard de saldo negativo**: Central/Tesoro pueden quedar negativos al anular un retiro cuya plata ya se gastó. Preexistente en traslados. Candidato a guard (`withdrawal-service`/`movement-service` `_void`).
2. **Origen banco con saldo negativo**: el tope de saldo solo corre en efectivo (como antes); un retiro desde una cuenta banco puede dejarla en negativo (el test de 208-06 lo afirma, -700,7).
3. **`registerMovement` mantiene su ajuste por conteo inline**: unificar con `createCountAdjustment` al mergear la T0 (`fix/traslados-idempotencia`). `createTransferPair` ya acepta `idempotencyKey` en la salida; el merge de `registerMovement` es trivial (solo el bloque del par cambió).
4. **209 debe abrir `paymentMethod` en el schema de `POST /expenses`** (el service ya valida la regla medio↔cuenta); la respuesta de `POST /expenses` no tiene response schema 201 (`{ expense: { expenseTxId } }`).
5. **No se auditaron Reportes/Tablero/Analíticas que sumen `kind='expense'` en general** (DI-02 dejó las agrupaciones por moneda fuera). Los retiros viejos siguen contando ahí como siempre; los nuevos no (no son `expense`). Revisar al agregar egresos con moneda en 209/211.
6. **No hay botón para crear la Caja central** (solo Tesoro).
7. **Selectores de caja de RetirosTab y Mov./Egresos sin sufijo Tesoro** (solo `RegistrarMovEgresoDialog` lo tiene); en Mov./Egresos el signo "−" del monto es solo para `expense/refund` (la salida del retiro nuevo se distingue por badge rojo y concepto).
8. **`Unknown database 'eltemplo_test_N'`** cuando otra sesión corre vitest contra el mismo MySQL: esperar y re-correr (ocurrió en 208-07).
9. **Migraciones**: master/staging ya tienen la 0330 (Wellhub). La 208 usa 0329 (sin colisión), pero 0327-0329 quedarán numéricamente por debajo de una 0330 ya aplicada en prod. Re-verificar con `git fetch` antes del push y confirmar que el runner (por nombre en `_migrations`) no se queja del orden ni los gates de numeración.
10. Hallazgo preexistente fuera de fase: `BandejaPendientesTab.vue(38)` `onExportBandeja` TS2339 (parte de los 27 de vue-tsc).
11. Fallos de tests preexistentes fuera de fase (no tocados): 2 en `coach-load-alta.test.ts` y 1 en `office-routes.test.ts`.

## CHECKLIST DE UAT de la fase 208 (para Franco)

Para cada punto, entrar como el rol indicado.

1. **USD en Cuentas** (owner): Caja → Cuentas → "Abrir caja" y "Nueva cuenta" ofrecen ARS, EUR y USD. Crear una cuenta banco USD y una caja de efectivo de sede USD (en una sede que ya tiene caja ARS: debe dejar). Saldos muestra `US$` y el subtotal USD queda separado del ARS. Repetir USD en la misma sede → error 409.
2. **Tesoro** (owner): "Nuevo Tesoro" ARS con saldo de apertura `1.500,75` → aparece en Cuentas (sección "Caja central y Tesoro", badge Tesoro) y en Saldos (grupo "Tesoro") con $ 1.500,75. Segundo Tesoro ARS → mensaje "Ya hay un Tesoro activo en ARS". Saldo de apertura vacío bloquea "Crear Tesoro"; 0 es válido. Cambiar la moneda a USD cambia el nombre sugerido a "Tesoro USD".
3. **Permisos** (gestión y admin): no ven la sección "Caja central y Tesoro" en Cuentas ni el grupo "Tesoro" en Saldos. Pueden elegir Central/Tesoro como destino al retirar (sin ver saldos).
4. **Arqueo de apertura** (owner): en la Central y en el Tesoro, "Arqueo de apertura": el banner anticipa la diferencia (sobrante / faltante / "Coincide: no se crea ajuste"); tras confirmar, el saldo queda en lo contado y en Mov./Egresos de esa caja aparece el ajuste "Arqueo de apertura…" con usuario y fecha.
5. **Retiro con destino**: Registrar retiro desde una sede obliga a elegir Caja central o Tesoro de la misma moneda; muestra "Sale de {sede} y entra a {destino}"; con un único destino viene preseleccionado, con varios la Central. Tras registrar, la sede baja y el destino sube por el mismo monto (Saldos), con el mensaje "Retiro registrado: … → {destino}".
6. **Retiro con conteo y faltante**: pide nota, asienta el ajuste y deja el arqueo; el resumen "quedó + ingresó − salió" da igual que antes.
7. **Sin destino**: una sede sin Central ni Tesoro en su moneda (p. ej. caja USD) → el diálogo avisa que hay que crear un Tesoro y no deja registrar (owner ve la salida a Caja → Cuentas; los demás, "Pedile al dueño").
8. **Retiro desde cuenta banco**: mismo selector de destino, sin conteo.
9. **Historial de retiros**: los retiros viejos muestran "Sin destino (anterior)", los nuevos su destino. Anular uno nuevo devuelve la plata a la sede y la saca del destino (el texto lo dice); anular uno viejo funciona como siempre y libera sus cobros. El anulado sigue listado con su marca.
10. **Mov./Egresos** de la sede y de la Central: las patas del retiro nuevo se leen "Retiro · {responsable}" (salida en rojo); los viejos siguen "Egreso · Retiros". Excel de movimientos con Tipo "Retiro" para los nuevos. "Registrar movimiento": las cajas Tesoro llevan el sufijo "· Tesoro" y los importes en USD muestran `US$`.
11. **Bandeja**: validar una transferencia solo ofrece cuentas banco; un cobro en efectivo solo cajas de efectivo (incluida Central/Tesoro).
12. **Resumen / Reportes / Tablero / Analíticas del mes**: mismos números que antes de registrar retiros nuevos (los retiros nuevos no suman como egreso ni como ingreso).
13. **Cheque**: aparece como etiqueta "Cheque" donde se listan medios; NO se ofrece al registrar cobros (va en Egresos, 209).
14. **Excel de Saldos**: el Tesoro dice "Tesoro", la Central sigue "Efectivo".
15. **Cierre de caja en USD** (desviación de este plan): con una caja de efectivo USD, el diálogo de cierre muestra `US$` en los importes.

## Self-Check

PASSED: commits `484146528` y `8bfbc57e7` existen; `no-regresion-208.test.ts` presente; gates verificados (tsc 0, lint:tenant 0, typecheck:tests 18, vue-tsc admin 27 y app 21, tenancy y guard verdes).
