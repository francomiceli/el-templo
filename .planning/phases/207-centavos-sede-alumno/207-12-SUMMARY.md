---
phase: 207-centavos-sede-alumno
plan: 12
subsystem: api-tests
tags: [money, guard, no-regresion, analytics, e2e]
requires: ["207-11"]
provides:
  - "Auditoria de Analiticas de ingresos: sin cambios de codigo (ninguna acumulacion de importes ni CAST)"
  - "test/unit/money-contract.test.ts: guard estatico de 5 reglas del contrato de plata (T-207-32)"
  - "test/finance/no-regresion-enteros.test.ts: totales enteros identicos + recorrido PoS -> caja -> Reportes -> Tablero con centavos (T-207-33, DI-09, SC-5)"
affects: [208, 209, 211]
key-files:
  created:
    - el-templo-api/test/unit/money-contract.test.ts
    - el-templo-api/test/finance/no-regresion-enteros.test.ts
  modified: []
decisions:
  - "Analiticas no se toca: todo importe sumado sale de SUM() de MySQL y se asigna con Number() por moneda, sin acumular en JS"
  - "R3 del guard vigila todo src/modules (no solo schemas.ts): hoy hay cero campos de importe con type integer en todo src"
  - "R1 cubre AS SIGNED y AS UNSIGNED: la unica excepcion real es la hora de un horario en frequency-service"
metrics:
  tasks: 3
  completed: 2026-11-10
---

# Phase 207 Plan 12: cierre de la fase (guard, no-regresion y punta a punta)

Cierre de la fase 207: Analiticas auditada sin necesidad de cambios, un test estatico que congela el contrato de plata (5 reglas, cada una probada con fixture y con mutacion sobre el codigo real) y un test de integracion con totales enteros literales y un recorrido de punta a punta con centavos y sede del alumno.

## Commits

- `f5190bc88` test(207-12): guard estatico del contrato de plata
- `d9d097835` test(207-12): no-regresion con enteros y recorrido de punta a punta con centavos

Task 1 (auditoria de Analiticas) no genero commit: no habia nada que cambiar.

## Task 1: auditoria de Analiticas

Criterio: solo se migran ACUMULACIONES de importes (`+=`, `reduce` sumando). `Number(r.total)` asignado por moneda, divisiones y promedios quedan.

| Sitio | Resultado | Motivo |
|-------|-----------|--------|
| `service.ts` `getRevenueTrend` (~1416) | sin cambio | `SUM(amount)` en MySQL (DECIMAL exacto), `Number(r.revenue)` asignado por (mes, moneda); no suma en JS |
| `service.ts` `getRevenueByMethod` (~1493) | sin cambio | `Number(row.total)` asignado por (metodo, moneda), sin acumular |
| `service.ts` `getRevenueByBranch` (~1581) | sin cambio | `Number(r.total)` asignado por (sede, moneda); sigue con `financial_transactions.branch_id` (sede del cobro) |
| `service.ts` `getOutstandingByCurrency` (~1678) | sin cambio | `COALESCE(SUM(balances.amount), 0)` con `Number()`, sin CAST; `gt(balances.amount, 0)` es exacto sobre DECIMAL |
| `service.ts` `sumRevenue` (~1732) | sin cambio | idem; la tendencia (`computeTrend`) es un porcentaje, indicador en float |
| `advanced-finance-service.ts` `getAdvancedFinance` / `cashTrend` (~226) | sin cambio | `Number(r.revenue)` asignado por (mes, moneda) |
| `advanced-finance-service.ts` `accruedTrend` (~361) | sin cambio | `entry[currency] += aporte` prorratea `subscriptions.price_paid` (catalogo entero, DI-03 fuera de alcance) y ya redondea a unidad entera al final: es un devengado, no plata del ledger |
| `ltv-service.ts` `paymentsByMember` (~334-360) | sin cambio | `Number(r.total)` por socio y moneda; el "maximo si hay dos monedas" compara, no suma |
| `ltv-service.ts` `buildMonetary` / `meanOrNull` (~130, ~380) | sin cambio | promedios y `total / durationMonths` son indicadores (float) y salen con `Math.round`; redondearlos a centavos cambiaria numeros con enteros (DI-09) |

Verificacion del plan: sin `AS SIGNED` en los tres archivos; `tsc` = 0 y `lint:tenant` = 0.

Quedan para la fase 211 (decidido en el plan): los ingresos por sede de Analiticas siguen con `users.branch_id` actual (no usan el snapshot `member_branch_id`).

## Task 2: guard estatico (`money-contract.test.ts`, 15 tests)

Lee el codigo con `fs.readFileSync`; cada regla es una funcion pura `(ruta, contenido) => violaciones` que ignora comentarios sin mover lineas. El mensaje de falla dice la regla, el motivo, archivo:linea y por que existe.

| Regla | Que prohibe | Alcance |
|-------|-------------|---------|
| R1 | `AS SIGNED` / `AS UNSIGNED` | `src/modules/**` (allowlist: `analytics/frequency-service.ts`, hora de un horario) |
| R2 | `multipleOf` | todo `src` fuera de comentarios |
| R3 | importe del ledger (19 nombres) declarado `type: "integer"` (en una o varias lineas, o `["integer","null"]`) | `src/modules/**` (allowlist `R3_ALLOWLIST`, hoy vacia) |
| R4 | las 15 columnas del inventario deben ser `decimal("<col>", { precision: 14, scale: 2, mode: "number" })`; ademas ninguna columna `int` con nombre de importe en esos archivos | `src/db/schema/` |
| R5 | `Number.isInteger` / `Number.isSafeInteger` | `src/modules/finance/*.ts` (allowlist `R5_ALLOWLIST` por linea, hoy vacia) |

Tests: 1 de sanidad (ve los archivos y el inventario de 15 columnas), 6 sobre el codigo real (R1, R1 allowlist viva, R2..R5), 8 sobre fixtures que rompen cada regla (y casos limpios, comentarios y allowlist). Corre sin DB con `vitest.config.unit.ts` (y tambien con la config completa).

### Mutaciones del guard (aplicadas al codigo real, falla confirmada, revertidas con `git checkout`)

| Mutacion | Archivo | Resultado |
|----------|---------|-----------|
| `COALESCE(SUM(balances.amount), 0)` -> `CAST(SUM(...) AS SIGNED)` | `analytics/service.ts:1695` | falla R1 con archivo:linea |
| `type: "number"` -> `type: "number", multipleOf: 0.01` | `analytics/schemas.ts:36` | falla R2 |
| `amount: MONEY_RESPONSE_SCHEMA` -> `amount: { type: "integer" }` | `finance/schemas.ts:278` | falla R3 |
| `mode: "number"` -> `mode: "string"` | `db/schema/cash-counts.ts` (`change_fund`) | falla R4 |
| `amount: decimal(...)` -> `amount: int("amount")` | `db/schema/balances.ts` | falla R4 (2 violaciones) |
| `Number.isInteger(1)` agregado | `finance/efectivo-guard.ts:7` | falla R5 |

`git status` limpio despues de revertir.

## Task 3: no-regresion y punta a punta (`no-regresion-enteros.test.ts`, 7 tests)

Parte 1, escenario ENTERO (sedes A y B; cobros 1500 + 2500 en efectivo en A, 3000 por transferencia de un socio de A cobrado en B, egreso de 700 de la caja de A, deudas 300 y 400 de A). Cada total esperado lleva su cuenta como comentario y se asevera con `toBe` + `Number.isInteger`:

| Lector | Total |
|--------|-------|
| Caja `/cash-registers/balances`, saldo firme caja efectivo A | 3300 (1500 + 2500 - 700) |
| Resumen `/transactions/summary` | monthlyRevenue 7000, cash 4000, transfer 3000, por sede del cobro A 4000 y B 3000 |
| `getIncomeByBranch` (sede del cobro) | A 4000, B 3000 |
| `getIncomeByMemberBranch` (sede del alumno) | A 7000, B ausente |
| Deudas `statusTotals.cobrable.ARS` | 700 |
| Alumnos `totalDebtByCurrency` ARS | 700 |
| Tablero `GET /weekly-board` (semana en curso) | cobrado A 7000, cobrado B 0, deudaCobrable A 700 |

(14 aserciones de total con `Number.isInteger`.)

Parte 2, centavos: un alumno de A (sub vigente con deuda 100) paga por `POST /coach-load/pay-plan` 33,33 x3 + 0,01. Se verifica: deuda = 0 exacta; caja efectivo de A = 100 y Resumen = 100; Reportes -> Cobros trae los 4 cobros (0,01 / 33,33 x3, suman 100 con `sumMoney`) con `memberBranchName` y `chargeBranchName` = sede A; se muda al alumno a B y Reportes sigue mostrando A, `getIncomeByMemberBranch` y el Tablero ponen los 100 en A y 0 en B.

### Tests

| Archivo | Resultado |
|---------|-----------|
| `test/unit/money-contract.test.ts` | 15/15 (config unit, 0,3 s) |
| `test/finance/no-regresion-enteros.test.ts` | 7/7 (foreground, ~140 s; la primera corrida fallo solo el punta a punta porque `cleanAllTestData` borra los planes: el plan se crea ahora dentro del test) |

### Gates

- `npx tsc --noEmit` = 0
- `pnpm lint:tenant` = DISCREPANCIAS 0
- `pnpm typecheck:tests` = 18 (las preexistentes; ninguna en los dos archivos nuevos)

## Inventario final de la fase (greps)

(a) `grep -rn "AS SIGNED" el-templo-api/src/modules` -> vacio. `grep -rn "AS UNSIGNED" el-templo-api/src/modules` -> solo `analytics/frequency-service.ts:186` (`CAST(LEFT(schedules.start_time, 2) AS UNSIGNED)`, hora de un horario; allowlist de R1). `progression/routes.ts` usa `CAST(AVG(rpe) AS DECIMAL(3,1))` (no es un CAST a entero).

(b) `grep -rn "multipleOf" el-templo-api/src` -> solo el comentario de `shared/money.ts:8` que explica por que NO se usa.

(c) Commits de la rama sobre `origin/master` (`git log --oneline feat/egresos-rendiciones ^origin/master -- el-templo-api el-templo-admin el-templo-app`):

```
d9d097835 test(207-12): no-regresion con enteros y recorrido de punta a punta con centavos
f5190bc88 test(207-12): guard estatico del contrato de plata
d6254eafb feat(207-11): traslado, egreso, correccion, saldo inicial y fondo de cambio con centavos
b4e80f8a9 feat(207-11): arqueo y retiro con MoneyInput y aritmetica en centavos
e61745091 feat(207-10): monto recibido con centavos en la PoS, Asignar plan y Renovar
24582e125 feat(207-10): Registrar pago con MoneyInput y reparto FIFO en centavos
5411b0ab3 style(207-09): prettier en money.test.ts
fc48b2b30 feat(207-09): componente MoneyInput para importes es-AR con centavos
ae39082df test(207-09): formatPrice de la app y total de cobros activos con centavos
798119aa3 feat(207-09): formatPrice de la app sincronizado con el del admin
b23d6a244 feat(207-09): formatPrice y formateos sueltos del admin con centavos
e0511fc83 feat(207-09): utils/money.ts del admin (centavos, parser y formato es-AR)
0e2cb1f91 test(207-09): parser, formato y aritmetica de importes del admin
5c9fda9d4 test(207-08): importes con centavos y formato en las 7 exportaciones Excel
4bb6c890a feat(207-08): formato de importe con 2 decimales en las 7 exportaciones Excel de caja
21017a5eb test(207-07): centavos en Deudas, Alumnos y Tablero (y enteros sin cambios)
343b28cda test(207-07): Total del Tablero con centavos y con enteros
75374df71 feat(207-07): Tablero y Oficina con centavos exactos
7eb18d00e feat(207-07): deudas, listado de alumnos y panel del profe en centavos exactos, sin CAST ni integer
2e13781b7 test(207-06): snapshot de sede del alumno por camino de alta y en los lectores
adcc31324 test(207-06): seedIncome guarda el snapshot de sede del alumno
d5f968e8d feat(207-06): snapshot de la sede del alumno en create()/correct() y lectores del Tablero y Reportes
81e00ce36 test(207-05): centavos en la PoS del profe y la ficha del admin
068d131be feat(207-05): ficha del admin con monto recibido en centavos
6d9e43b36 feat(207-05): PoS del profe con monto recibido en centavos
213f862c1 test(207-04): centavos en traslados, egresos y retiros
e063f6051 feat(207-04): retiros con centavos y schemas de movimiento/egreso/retiro
749abc8f3 feat(207-04): traslados y egresos con importes en centavos
40cc33d10 test(207-03): centavos en cajas y arqueos
bde396439 feat(207-03): arqueos con centavos y schemas de efectivo/arqueo/fondo
4db74eb8d feat(207-03): saldos de caja, fondo de cambio y guard de efectivo en centavos
6c21c0209 test(207-02): centavos en el ledger (deuda exacta, validacion, suma de links, respuestas)
c84f62bbf feat(207-02): schemas de transacciones con importes de 2 decimales
a03bfa295 feat(207-02): TransactionService y BalanceService en centavos
e74807c49 test(207-01): test de migracion 0327/0328 y lectura cruda de importes normalizada
85745c53e feat(207-01): helper unico de plata shared/money.ts y keyword Ajv moneyTwoDecimals
90f49cd5a test(207-01): tests unit del helper de plata y la keyword Ajv de 2 decimales
536379bbc feat(207-01): migraciones 0327/0328 y schemas DECIMAL(14,2) + member_branch_id
```

Mas los commits `docs(207-NN)` de los SUMMARY y marcas del orquestador (no tocan codigo).

(d) `git ls-tree --name-only origin/master el-templo-api/src/db/migrations/ | tail -3`:

```
el-templo-api/src/db/migrations/0325_corregir_coordenadas_alberti.sql
el-templo-api/src/db/migrations/0326_activity_booking_cutoffs.sql
el-templo-api/src/db/migrations/meta
```

Recordatorio: `origin/master` termina en 0326 (verificado tras `git fetch` el 2026-11-10). Las migraciones de la fase son 0327 y 0328: re-verificar la numeracion contra `origin/master` y `origin/staging` justo antes del push (otras ramas del milestone y hotfixes pueden tomar el 0327).

## CHECKLIST DE UAT DE LA FASE 207 (consolidado)

Datos de prueba sugeridos: un alumno con deuda de 100 y otro con plan de 30.000. Todos los casos con centavos deben verse con 2 decimales y los enteros SIN decimales (`$ 1.500`, no `$ 1.500,00`).

1. **PoS con centavos (Cobros):** renovar con Monto "15.000,50" sobre un plan de 30.000: el resumen muestra $ 15.000,50 y la deuda queda en $ 14.999,50. Con "15.000,505" el campo marca "Maximo 2 decimales" y no deja confirmar. Los precios (precio acordado, prorrateado) siguen rechazando decimales.
2. **Ficha del alumno:** Asignar plan y Renovar con monto recibido "10000,25": saldo pendiente exacto; con un monto mayor al precio aparece "No puede superar" y no deja confirmar.
3. **Registrar pago (deuda de 100 con tres conceptos):** asignar 33,33 / 33,33 / 33,34 cuadra (check verde, sin "Faltan/Sobran"); 0,1 + 0,2 contra 0,3 tambien cuadra; "Pagar todo" asigna cada saldo exacto.
4. **Cerrar caja con +$ 0,50:** contar "1.234,50" con esperado 1.234: banner "Sobra $ 0,50" y pide motivo; contando "1.234" coincide.
5. **Traslado de $ 0,50** entre dos cajas: se registra por $ 0,50; "0,505" muestra "Maximo 2 decimales".
6. **Retiro con centavos:** contar "10.000,25" con esperado 10.000: sobrante $ 0,25 y "te llevas" sugerido exacto; "Despues del retiro quedan" exacto; cambiar de caja limpia los campos aunque haya texto invalido.
7. **Fondo de cambio** (Cuentas): abrir el prompt (muestra el valor actual), escribir "500,50" y guardar; vacio o "500,555" deja Aceptar deshabilitado.
8. **Caja efectivo nueva** con saldo inicial "1.500,75": queda abierta con ese saldo; sin saldo no deja abrir.
9. **Bandeja, correccion de un cobro** de $ 100 a "100,50": manda el monto; dejar "100" sin tocar da "No hay cambios".
10. **Excel de Caja y de Reportes -> Cobros** (y Saldos, Bandeja, Movimientos/Egresos, Deudas, Domiciliacion): las columnas de importe son numeros con formato `#,##0.00` (2 decimales), encabezados y orden intactos.
11. **Tablero con un alumno mudado de sede:** cobrar a un alumno en la sede A, mudarlo a B desde la ficha, abrir el Tablero de esa semana: el cobrado sigue en A (sede guardada en el cobro). Un cobro nuevo del mismo alumno cuenta en B. Reportes -> Cobros, columna "Sede del alumno" y filtro por sede, igual criterio.
12. **Pantallas con enteros sin cambios:** Caja, Resumen, Deudas, Alumnos (deuda total), Tablero, Oficina (tema de arqueo con diferencia) y Analiticas (Ingresos, Finanzas Avanzadas, LTV) muestran los mismos numeros y formato que antes en un mes con solo importes enteros.
13. **App del socio:** historial/deuda con importes enteros sin decimales y, si hay un cobro con centavos, con 2 decimales.

## Limitaciones conocidas (para la UAT y la integracion)

- **Campos de plata OPCIONALES con texto invalido (207-11):** en el admin, el conteo de un traslado, el conteo de un retiro y el monto de una correccion mandan vacio (sin bloquear el submit) si el usuario tipea texto invalido; el input muestra el error rojo igual. Se resuelve al integrar la rama de idempotencia de traslados (`fix/traslados-idempotencia`), que toca el submit de `RegistrarMovEgresoDialog.vue`; mejora recomendada de `MoneyInput` (evento `invalid` o `validate()` antes del submit).
- **Analiticas por sede** sigue con `users.branch_id` actual (no el snapshot): fase 211.
- **Precios de catalogo** (planes, `subscriptions.price_paid`, promos, comisiones, `priceOverrideAmount`) siguen enteros (DI-03); el devengado de Finanzas Avanzadas y el SEPA salen de ahi.
- **Fecha del PoS en UTC:** `POST /coach-load/pay-plan` fecha el cobro con el dia UTC de hoy (preexistente, `coach-load-routes.ts:639`). Un cobro cargado entre las 21:00 y las 24:00 de Argentina cae con la fecha de manana: puede caer en la semana siguiente del Tablero el domingo a la noche. No se toco; el test de punta a punta fija la fecha al lunes de la semana en curso por eso.

## Fallos preexistentes fuera de fase (no se tocaron)

- `test/finance/coach-load-alta.test.ts`: 2 fallos (el alumno nuevo queda `prueba`/`freemium` en vez de `activo` tras el alta).
- `test/office/office-routes.test.ts`: 1 fallo (badge de asignados: tras comentar el propio asignado, `topic.unseen` sigue `true`).
- `pnpm typecheck:tests`: 18 discrepancias preexistentes (analytics, members, attendance, lifecycle, `coach-load-alta`).
- `vue-tsc` admin: 27 errores de base (`onExportBandeja` en `BandejaPendientesTab.vue:38`, `vitest` sin declarar en el admin, etc.); no se corrio en este plan (solo se tocaron tests del API).

## Deviations from Plan

1. **[Rule 1 - plan impreciso] R1 y la allowlist.** El plan decia que `AS SIGNED` aparecia en `frequency-service.ts` (hora) y `progression/routes.ts` (RPE). En el codigo real `frequency-service.ts` usa `AS UNSIGNED` y `progression/routes.ts` usa `AS DECIMAL(3,1)` (no es un CAST a entero). R1 prohibe `AS SIGNED` y `AS UNSIGNED` (un `UNSIGNED` sobre un importe trunca igual) con una unica excepcion (`frequency-service.ts`), y un test comprueba que la excepcion sigue siendo necesaria.
2. **[Alcance] R3 sobre todo `src/modules`.** El plan acotaba a `schemas.ts` y `coach-load-routes.ts`. Se verifico con un grep multilinea que no hay ningun campo de la lista con `type: "integer"` en todo `src`, asi que el guard cubre tambien rutas con schema inline (mas conservador, cero falsos positivos).
3. **[Config de test] El guard corre con `vitest.config.unit.ts`** (sin DB, 0,3 s) en vez de la config por defecto del verify del plan; con la config completa tambien corre (la suite de CI lo incluye por `test/**`).
4. **[Armado] PoS con el token del owner** en el punta a punta (rol no-coach nace `validado`): con coach el cobro queda `pendiente` y no cuenta como plata firme en caja ni Tablero. Las fechas de los 4 cobros del PoS se llevan al lunes de la semana en curso (ver limitacion de la fecha UTC).
5. **[Atribucion de commit]** Los commits terminan con `Co-Authored-By: Claude Sonnet 5.5` (el modelo real que ejecuto), no con el `Opus 5.5` que mencionan las reglas del ejecutor.

## Bugs encontrados

Ninguno nuevo. Las observaciones de arriba (fecha UTC del PoS, fallos preexistentes) ya existian.

## Known Stubs

Ninguno.

## Self-Check: PASSED

- `el-templo-api/test/unit/money-contract.test.ts` existe; `el-templo-api/test/finance/no-regresion-enteros.test.ts` existe.
- Commits `f5190bc88` y `d9d097835` presentes en la rama `feat/egresos-rendiciones`.
