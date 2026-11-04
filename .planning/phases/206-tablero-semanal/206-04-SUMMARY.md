---
phase: 206-tablero-semanal
plan: 04
subsystem: api
tags: [weekly-board, caja, deudas, analytics, by-branch]
requires: [206-03]
provides:
  - "finance/transaction-service.ts: TransactionService.getIncomeByMemberBranch"
  - "reports/service.ts: ReportsService.getDebtTotalsByMemberBranch, effectiveDebtStatus (JS)"
  - "reports/types.ts: DebtTotalsByStatus"
  - "analytics/service.ts: AnalyticsService.countActivePayingMembersByBranch"
  - "test/fixtures/weekly-board.ts: seedBoardMember, seedIncome, seedDebt, seedActiveMember, clearDebtManagement"
affects: [206-05, 206-06, 206-07]
key-files:
  created:
    - el-templo-api/test/weekly-board/by-branch-caja-alumnos.test.ts
  modified:
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/reports/service.ts
    - el-templo-api/src/modules/reports/types.ts
    - el-templo-api/src/modules/analytics/service.ts
    - el-templo-api/test/fixtures/weekly-board.ts
key-decisions:
  - "Los tres mapas omiten las sedes sin datos (clave ausente = ceros), igual que en 206-03"
  - "Ingreso sin alumno cuenta en la sede del cobro (supuesto A1)"
  - "getDebtTotalsByMemberBranch omite los joins a subscriptions/branches/last_attendance, que con filtros vacios no se usan"
requirements-completed: [SC-4, SC-5, D-12, D-14, D-19, D-20, D-21, D-23]
completed: 2026-11-03
---

# Phase 206 Plan 04: Cobrado, Deuda y Alumnos activos por sede Summary

Tres metodos publicos "por sede del alumno" dentro de sus servicios de origen (Caja, Deudas, Analiticas), con el mismo universo que las pantallas de origen, mas una extraccion minima (`effectiveDebtStatus`) y fixtures/tests de coincidencia.

## Commits

| Commit | Subject |
| --- | --- |
| b5c55e3ce | feat(206-04): cobrado, deuda y activos por sede del alumno para el tablero |
| 205365add | test(206-04): coincidencia por sede de cobrado, deuda y activos |

## Que se hizo

- `TransactionService.getIncomeByMemberBranch(ctx, {dateFrom, dateTo}) -> Map<branchId, Map<moneda, monto>>`: mismas `buildRevenueConditions` y mismo INNER JOIN a `branches` (por la sede del cobro) que `getIncomeByBranch`, mas `LEFT JOIN users` con `tenantWhere` en el ON. SELECT plano (`users.branchId`, `financial_transactions.branchId`, moneda, `CAST(SUM(amount) AS SIGNED)`), `GROUP BY` de las tres columnas; en JS la clave es `memberBranchId ?? cobroBranchId`. Sin `transaction_links`. Sin COALESCE dentro del `.select()` (FA-01).
- `ReportsService.getDebtTotalsByMemberBranch(ctx) -> Map<branchId, Map<moneda, DebtTotalsByStatus>>` con `{cobrable, mas10, incobrable}`. Usa `buildOutstandingScope` + `buildOutstandingBaseConds(ctx, {}, ...)` + `amount > 0`, LEFT JOIN a `users` y a `debt_management` (ambos con `tenantWhere` en el ON). Por fila: estado efectivo con `effectiveDebtStatus`; `activa` suma a `cobrable` y, con `computeBucketOB(computeAgeInDaysOB(debtCreationDateOB(createdAt)))` en `11-15`/`15+`, tambien a `mas10`; `incobrable` a `incobrable`; `cobrada` se ignora. Fila sin sede de alumno (defensivo) se saltea con `log.warn({balanceId})`.
- `AnalyticsService.countActivePayingMembersByBranch(ctx) -> Map<branchId, number>`: la query de `paying` de `countActiveMembersBreakdown` (INNER JOIN branches, `role='member'`, `activePayingNonEspecialMemberExists(users.id, ctx)`) sin filtros y con `GROUP BY users.branch_id`.
- Fixtures: `seedBoardMember`, `seedIncome` (firme/anulado/pendiente, `cash_transfer`), `seedDebt` (`created_at` con `NOW() - INTERVAL n DAY`, estado de gestion), `seedActiveMember` (pago/especial/bonificada; vigente desde hace 60 dias sin fin), `clearDebtManagement`. `seedMembershipPlan` gano un parametro `category` (default `presencial`: comportamiento previo intacto).

## Argumento de equivalencia del refactor (comportamiento preservado)

La unica extraccion sobre codigo existente es `effectiveDebtStatus` en `reports/service.ts`. Linea eliminada: `status: r.dmStatus ?? "activa",` en el mapeo de `selectOutstandingRows`; linea nueva: `status: effectiveDebtStatus(r.dmStatus),` con `effectiveDebtStatus(x) = x ?? "activa"`. Misma expresion, mismo tipo (`DebtManagementStatus | null` -> `DebtManagementStatus`, el mismo que tenia la columna del enum), mismo punto de llamada. `grep -c 'dmStatus ?? "activa"'` = 1 (solo dentro del helper). `getOutstandingBalances`, `getIncomeByBranch` y los KPIs de Analiticas no se editaron. El diff de `reports/service.ts`, `transaction-service.ts` y `reports/types.ts` solo agrega lineas, salvo esa.

Nota de formato: `analytics/service.ts` no estaba formateado con Prettier; el hook de commit (lint-staged) lo reformateo entero (un import, cuatro firmas partidas). Son cambios de formato sin efecto; el codigo nuevo es un unico metodo agregado.

Equivalencia de universo:
- Cobrado: mismas conds + mismo JOIN -> mismo conjunto de filas que Caja; el JOIN a `users` es por PK y LEFT, no cambia la cantidad de filas ni los montos. La suma por moneda de todas las sedes coincide con Caja (assert explicito en el test).
- Deuda: el universo es el de `statusTotalsRows` sin filtros (`amount > 0` + baseConds). Los joins omitidos (`subscriptions`, `branches`, `last_attendance`) son LEFT por clave primaria o solo los referencian filtros que no se pasan, asi que no cambian cuantas filas hay. `debt_management` tiene unico por `balance_id`.
- Activos: copia literal del predicado de `paying`.

## Tests

Todos "pendiente de CI" (regla del repo: no se corre vitest local; no se corrio nada local):

- `el-templo-api/test/weekly-board/by-branch-caja-alumnos.test.ts` (12 `it(`): cobrado por sede del alumno (arA 1000, arB 700, es 80 EUR; excluye anulado, pendiente, `cash_transfer`, fuera de rango); D-14 (Caja arA 0 / arB 1700, suma ARS igual y suma global igual por moneda); sedes sin cobros ausentes; FA-01 (corre con y sin datos); deuda `{cobrable:700, mas10:400, incobrable:500}` contra `getOutstandingBalances` (statusTotals y tramos 11-15 + 15+); cobrada con saldo no cuenta; `debt_balance` en la sede del alumno y ausente de Deudas filtrada por esa sede; D-12 (alumno arA, membresia arB); D-23 suma de sedes == Deudas sin filtros por moneda y sin mezclar monedas; activos (1 de 3 en arA, 2 en arB, igual al KPI de `getKpis` por sede); sede sin activos ausente; aislamiento con el gimnasio 2 en ambos sentidos con control positivo.
- Regresion de origen sin editar: `test/finance/income-by-branch.test.ts`, `test/reports/debt-management.test.ts`, `test/analytics/analytics.test.ts`, `test/analytics/internal-exclusion.test.ts`: pendiente de CI.

## Gates

| Gate | Resultado |
| --- | --- |
| `pnpm exec tsc --noEmit` | exit 0 (tras cada tarea) |
| `pnpm lint:tenant` | exit 0 (0 discrepancias) |
| `pnpm typecheck:tests` | exit 1 (preexistente, 17 discrepancias, mismo conteo que antes); ninguna linea menciona archivos de esta fase |
| Prettier sobre archivos tocados | OK |

## Decisiones del ejecutor

- `getDebtTotalsByMemberBranch` no arma los LEFT JOIN a `subscriptions`/`branches`/`last_attendance` (el plan decia "los mismos"): con `baseConds` de filtros vacios nada los referencia y no alteran el conteo de filas. Agregarlos seria un join sin uso. `buildLastAttendanceSubquery()` se construye igual solo porque `buildOutstandingBaseConds` lo recibe por parametro (no ejecuta nada).
- `effectiveDebtStatus` esta tipado con `DebtManagementStatus` (no `string`) para no romper el tipo de `OutstandingBalanceRow.status`.
- `seedDebt(kind: "subscription")` crea una suscripcion vencida y un plan por llamada (evita el unico `(member, target_kind, target_id, currency)` y el unico de planes); el alumno de la deuda no queda "activo" por accidente.
- `cleanAllTestData` no incluye `debt_management`: el test la limpia con `clearDebtManagement` antes de cada caso (ambos gimnasios).
- La vigencia de los activos del fixture usa `end_date NULL` y `start_date = lunes - 60 dias` para no depender de `CURDATE()` ni de la hora.
- Deuda "de hace 12 dias" deja 1 dia de margen contra el limite 10/11 ante diferencias de zona entre MySQL y Node.

## Deviations from Plan

None - plan ejecutado tal como estaba escrito (las decisiones de arriba son elecciones dentro de lo que el plan dejaba abierto).

## Notas para los planes siguientes

- Los tres metodos devuelven mapas SIN las sedes sin datos: 206-05 debe tratar la clave ausente como 0 (cobrado, activos) o `{0,0,0}` (deuda), y filtrar por sedes activas/no virtuales/de alcance del rol. Las sedes virtuales aparecen en los mapas si tienen datos (columna informativa "Online", D-25).
- Cobrado y Deuda vienen por moneda: el Total AR suma solo `ARS` de sedes fisicas AR; Barcelona va aparte en `EUR` (D-16). No sumar monedas.
- `mas10` es un subconjunto de `cobrable` (no se suma aparte).
- Deuda y Activos son foto del momento (hora del servidor MySQL): para la semana en curso se leen en vivo, para las cerradas de la foto (D-20/D-21).
- `getIncomeByMemberBranch` acepta cualquier rango; el cierre y la semana en vivo pueden usar `weekRange(...)`.
- Fixtures nuevos reutilizables en 206-05+: `seedBoardMember`, `seedIncome`, `seedDebt`, `seedActiveMember`, `clearDebtManagement`.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-206-09: `tenantWhere` primero en el WHERE y en el ON de cada LEFT JOIN nuevo, con test de aislamiento. T-206-10: mismas `buildRevenueConditions`, sin `transaction_links`, test de suma igual a Caja. T-206-11: solo columnas de schema y parametros, sin `sql.raw`.

## Self-Check: PASSED

Archivos verificados en disco; commits b5c55e3ce y 205365add presentes en `git log`.
