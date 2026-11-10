---
phase: 207-centavos-sede-alumno
plan: 01
subsystem: api-finance
tags: [decimal, money, migrations, ajv, member-branch]
requires: []
provides:
  - "15 columnas de importe del ledger y cajas en DECIMAL(14,2)"
  - "financial_transactions.member_branch_id (FK + indice) con backfill"
  - "shared/money.ts (helper de plata) y keyword Ajv moneyTwoDecimals"
affects: [207-02, 207-03, 207-04, 207-05, 207-06]
tech-stack:
  added: []
  patterns: ["decimal(..., { mode: number })", "centavos enteros para sumar/comparar"]
key-files:
  created:
    - el-templo-api/src/db/migrations/0327_centavos_y_sede_del_alumno.sql
    - el-templo-api/src/db/migrations/0328_backfill_member_branch_id.sql
    - el-templo-api/src/modules/shared/money.ts
    - el-templo-api/test/unit/money.test.ts
    - el-templo-api/test/migrations/0327-0328-centavos-sede-alumno.test.ts
  modified:
    - el-templo-api/src/db/schema/financial-transactions.ts
    - el-templo-api/src/db/schema/transaction-links.ts
    - el-templo-api/src/db/schema/balances.ts
    - el-templo-api/src/db/schema/cash-registers.ts
    - el-templo-api/src/db/schema/cash-counts.ts
    - el-templo-api/src/db/schema/weekly-board.ts
    - el-templo-api/src/app.ts
    - el-templo-api/test/tenancy/iso-03-finance-coach-load.test.ts
decisions:
  - "Sin decimalNumbers global (desviacion aceptada del plan): columnas en mode number y Number() en SQL crudo"
  - "2 decimales validados con Number(n.toFixed(2)) === n en vez de multipleOf"
metrics:
  tasks: 3
  completed: 2026-11-10
---

# Phase 207 Plan 01: base de centavos y sede del alumno

Migraciones 0327 (15 columnas a DECIMAL(14,2) + `member_branch_id` con FK e indice) y 0328 (backfill idempotente), schemas Drizzle en `decimal` mode number, helper `shared/money.ts` y keyword Ajv `moneyTwoDecimals` registrada en `app.ts`.

## Commits

- `536379bbc` feat(207-01): migraciones 0327/0328 y schemas DECIMAL(14,2) + member_branch_id
- `90f49cd5a` test(207-01): tests unit del helper de plata y la keyword Ajv (RED)
- `85745c53e` feat(207-01): helper unico de plata shared/money.ts y keyword Ajv moneyTwoDecimals (GREEN)
- `e74807c49` test(207-01): test de migracion 0327/0328 y lectura cruda normalizada

## Verificacion

- `tsc --noEmit` = 0; `pnpm lint:tenant` = 0.
- `typecheck:tests`: 18 discrepancias, todas en archivos ajenos (analytics, members, attendance, lifecycle, `coach-load-alta`), ninguna menciona archivos de este plan.
- `test/unit/money.test.ts`: 41/41 (config unit).
- `test/migrations/0327-0328-centavos-sede-alumno.test.ts`: 24/24 (15 columnas contra INFORMATION_SCHEMA, FK, indice, ida y vuelta, backfill con updated_at preservado y re-ejecucion).
- `test/tenancy/iso-03-finance-coach-load.test.ts`: paso en la corrida conjunta (57 pasaron; los 2 fallos de esa corrida eran del test de migracion nuevo, corregidos).
- Numeracion 0327/0328 libre en `origin/master` y `origin/staging` (ambos terminan en 0326).

## Decisiones del ejecutor / desviaciones

1. **[Rule 1] Tipado del plugin Ajv.** El plugin tipado con una interfaz estrecha rompio `tsc` en `Fastify({ ajv: { plugins } })` (18 errores en cascada, `Plugin<unknown>` exige devolver la instancia y `addKeyword` de Ajv acepta `string | KeywordDefinition`). Solucion: `AjvKeywordHost.addKeyword(def: unknown)` y `ajvMoneyPlugin<T extends AjvKeywordHost>(ajv: T): T` (devuelve la instancia). Contrato funcional intacto.
2. **assertMoneyAmount:** el cero solo se acepta con `allowZero` (incluso con `allowNegative`), conforme al contrato.
3. **Test de migracion:** el primer statement de 0327 arrastra el header de comentarios, el test los filtra antes de verificar `ALTER TABLE`. La lectura Drizzle del test necesito `tenantWhere` por el sentinel de tenancy.
4. Lecturas crudas de importes en tests: el barrido multilinea solo encontro `iso-03-finance-coach-load.test.ts:~1352` (normalizada con `Number()`); `:848` y `iso-03-finance-transacciones.test.ts:426` ya normalizaban.
5. El archivo `iso-03-finance-coach-load.test.ts` ya estaba fuera de formato Prettier antes del cambio (no se reformateo para no inflar el diff).
6. La relation `memberBranch` en `financialTransactionsRelations` quedo (tsc no protesto).
7. No habia MySQL accesible por `db:migrate` manual sin credenciales: la migracion se probo via el provisioning de la DB de test y el test de INFORMATION_SCHEMA.

## Bugs encontrados

Ninguno fuera del plan. Nota para los planes siguientes: `typecheck:tests` ya tiene drift preexistente (`confirmedAt` en attendance, `cancelCloseMinutes` en activities, tipo de `status` en `coach-load-alta`).

## Known Stubs

Ninguno. La keyword `moneyTwoDecimals` no la usa ninguna ruta todavia (planes 02-05).

## Self-Check: PASSED
