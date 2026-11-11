---
phase: 207-centavos-sede-alumno
plan: 06
subsystem: api-finance-reports
tags: [member-branch, snapshot, tablero, reportes]
requires: ["207-05"]
provides:
  - "create() guarda financial_transactions.member_branch_id (sede del socio al cobrar, misma tx)"
  - "correct() conserva el snapshot del mismo socio, toma la sede actual si cambia de socio"
  - "getIncomeByMemberBranch (Tablero) y Reportes -> Cobros (columna y filtro) leen el snapshot"
affects: [211]
key-files:
  created:
    - el-templo-api/test/finance/member-branch-snapshot.test.ts
  modified:
    - el-templo-api/src/modules/finance/types.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/reports/service.ts
    - el-templo-api/test/fixtures/weekly-board.ts
metrics:
  tasks: 3
  completed: 2026-11-10
---

# Phase 207 Plan 06: sede del alumno en cada cobro

## Commits

- `d5f968e8d` feat(207-06): snapshot de la sede del alumno en create()/correct() y lectores del Tablero y Reportes
- `adcc31324` test(207-06): seedIncome guarda el snapshot de sede del alumno
- `2e13781b7` test(207-06): snapshot de sede del alumno por camino de alta y en los lectores

## Cambios

- `types.ts`: `CreateTransactionInput.memberBranchId?: number | null` (override interno, nunca del body).
- `transaction-service.ts`: `create()` pide `branchId` en la query de existencia del socio del paso 1b (sin query extra, con `txHandle`) y lo escribe en el INSERT; `correct()` copia `original.memberBranchId` si el socio es el mismo (o no viene), si no deja `undefined` para que `create()` tome la sede actual del socio nuevo (documentado en el docblock). `getIncomeByMemberBranch`: SELECT plano con snapshot, sede actual y sede del cobro; cadena `snapshot ?? actual ?? cobro` en JS; `COALESCE(SUM(amount), 0)` sin `CAST AS SIGNED`; acumulacion en centavos (`toCents`/`fromCents`).
- `reports/service.ts`: `getChargeHistory` con `INNER JOIN branches b ON b.id = COALESCE(ft.member_branch_id, m.branch_id)` y filtro de sede con el mismo COALESCE (2 apariciones); `amount` con `roundMoney`.
- `test/fixtures/weekly-board.ts`: `seedIncome` acepta `memberBranchId` (default: sede actual del socio; `null` deja NULL).
- Nadie mas escribe la columna: `grep "\.set({[^}]*memberBranchId" src/` vacio; las otras apariciones de `memberBranchId` en `src/` son variables/DTOs no relacionadas.

## Verificacion

- `tsc --noEmit` = 0; `pnpm lint:tenant` DISCREPANCIAS 0.
- `typecheck:tests`: 18 discrepancias, las preexistentes; ninguna en archivos de este plan.
- `test/finance/member-branch-snapshot.test.ts` 14/14 (ficha, pay-plan renovacion y deuda, misc, assign, alta de alumno nuevo en B, expense+movement NULL, mudanza, Tablero con centavos 100.10+200.20=300.3, fallback a sede actual, Reportes columna+filtro, correct mismo socio / otro socio).
- Regresion: `weekly-board/by-branch-caja-alumnos.test.ts` 12/12 y `reports/reports.test.ts` 23/23.

## Decisiones del ejecutor

- Los tests de camino de alta usan 4 sedes propias (A, B, C, D) creadas con code unico; coach A y coach B para respetar el scope de sede de la PoS. Las sedes y usuarios del test no se borran al final (misma costumbre que `centavos-traslados-retiros.test.ts`); las cajas banco si.
- Egresos y traslados se testean sobre cajas `banco` propias (sin sede) para no chocar con las cajas de efectivo por sede.
- Un solo commit `feat` cubre Tasks 1 y 2 de servicios (ambos tocan `transaction-service.ts`).

## Desviaciones

Ninguna respecto del plan.

## Bugs encontrados

Ninguno nuevo. Se mantiene el aviso de 207-05: `coach-load-alta.test.ts` tiene 2 fallos preexistentes ajenos a este plan (no se corrio ni toco).

## Known Stubs

Ninguno.

## Self-Check: PASSED
