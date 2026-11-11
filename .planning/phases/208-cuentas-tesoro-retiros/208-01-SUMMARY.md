---
phase: 208-cuentas-tesoro-retiros
plan: 01
subsystem: api-finance
tags: [migracion, tesoro, cheque, medio-cuenta, monedas]
requires: ["207-12"]
provides:
  - "Migracion 0329: cash_registers.is_treasury (BOOLEAN NOT NULL DEFAULT FALSE) y valor 'cheque' al final de payment_method"
  - "shared/currency.ts: SUPPORTED_ACCOUNT_CURRENCIES (ARS, EUR, USD), AccountCurrency, isSupportedAccountCurrency, ACCOUNT_CURRENCY_SCHEMA"
  - "finance/payment-method-rules.ts: METHOD_ACCOUNT_RULE, isMethodAllowedForAccount, assertMethodAllowedForAccount (funcion pura unica medio-cuenta)"
  - "'cheque' en el tipo PaymentMethod sin mover ningun total (cheque = 0 en Resumen e ingresos por sede)"
affects: [208-02, 208-03, 208-04, 208-08, 209]
key-files:
  created:
    - el-templo-api/src/db/migrations/0329_tesoro_y_cheque.sql
    - el-templo-api/src/modules/finance/payment-method-rules.ts
    - el-templo-api/test/migrations/0329-tesoro-cheque.test.ts
    - el-templo-api/test/unit/payment-method-rules.test.ts
  modified:
    - el-templo-api/src/db/schema/cash-registers.ts
    - el-templo-api/src/db/schema/financial-transactions.ts
    - el-templo-api/src/modules/shared/currency.ts
    - el-templo-api/src/modules/finance/routes.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/finance/types.ts
    - el-templo-api/src/modules/finance/schemas.ts
decisions:
  - "Cobros sin cheque (D-09 habla de la cuenta DESDE la que se paga): PAYMENT_METHOD_ENUM y los enums de body de cobros no cambian, un test unit lo congela"
  - "Tesoro vs Central se distingue solo por is_treasury, invariante en el service (plan 208-02), sin CHECK"
metrics:
  tasks: 3
  completed: 2026-11-11
---

# Phase 208 Plan 01: base de Tesoro, USD y cheque

Migracion 0329 con `is_treasury` y el valor `cheque`, schemas Drizzle alineados byte-for-byte, lista unica de monedas de cuenta (ARS/EUR/USD) y la funcion pura medio-cuenta con su matriz de tests. Agregar `cheque` al tipo `PaymentMethod` no cambia ningun total.

## Commits

- `6af315b8f` feat(208-01): migracion 0329 (tesoro y cheque) y schemas
- `76bee3a7d` feat(208-01): monedas de cuenta y regla unica medio-cuenta
- `5835612d7` feat(208-01): cheque en los tipos de medio sin cambiar totales
- test(208-01): revenueByMethod incluye cheque en 0 en las aserciones de Resumen (hash en `git log`)

## Sitios que marco `tsc` por la clave `cheque` (Task 3)

Exactamente los tres previstos, mas el tipo y el schema de respuesta:

- `finance/routes.ts` `PAYMENT_METHOD_LABELS_ES` -> `cheque: "Cheque"`
- `finance/transaction-service.ts` `getSummary` (`revenueByMethod`) y `getIncomeByBranch` (`emptyByMethod`) -> `cheque: 0`
- `finance/types.ts` `FinanceSummary.revenueByMethod.cheque` y `finance/schemas.ts` `transactionsSummarySchema` -> `cheque: MONEY_RESPONSE_SCHEMA`

Nada en `analytics/` ni `reports/` (el `continue` de `getRevenueByMethod` ya ignora medios fuera de su lista).

## Decisiones del ejecutor / desviaciones

1. **Orden de commits:** como la Task 1 rompe `tsc` hasta que la Task 3 resuelve los `Record<PaymentMethod,...>`, se hicieron las tres tareas en el working tree y se commitearon en orden 1, 2, 3 (el commit de la Task 1 por si solo no compila; el HEAD final si).
2. **Test de "cobros sin cheque"** (criterio de la Task 3) quedo dentro de `payment-method-rules.test.ts`, commiteado junto con la Task 2 (el archivo es el mismo y se escribio entero). `SHARED_PAYMENT_METHOD_ENUM` ya estaba exportado desde `finance/schemas.ts:1093`, no hizo falta exportar nada nuevo.
3. Se agrego un comentario "sin cheque a proposito" sobre `PAYMENT_METHOD_ENUM` en `finance/schemas.ts`; el enum no cambia (6 valores).
5. **Desviacion en aserciones existentes:** el plan decia que `summary-sanity` e `income-by-branch` pasan "sin cambios en sus aserciones", pero 4 archivos comparan `revenueByMethod` con `toEqual` de 6 claves y la respuesta ahora trae `cheque: 0` (el tipo `FinanceSummary` lo exige). Se agrego `cheque: 0` a esas aserciones (`summary-sanity`, `summary-by-kind` RBK8, `transaction-service` SUM1/SUM8, `transactions-api` SU1). Ningun numero cambia. `income-by-branch` no necesito cambio.
4. Los enums de body de `coach-load-routes.ts`, `subscriptions/schemas.ts`, `programs/routes.ts` y `reports/schemas.ts` no se tocaron.

## Verificacion

- `npx tsc --noEmit` (api): 0 errores.
- `pnpm lint:tenant`: DISCREPANCIAS 0.
- `pnpm typecheck:tests`: 18 discrepancias (las preexistentes), ninguna en archivos de este plan.
- `npx vitest run --config vitest.config.unit.ts test/unit/payment-method-rules.test.ts`: 24/24 verdes.
- Tests con DB (en foreground, de a uno; MySQL local disponible): `0329-tesoro-cheque` 5/5, `summary-sanity` + `summary-by-kind` 15/15, `transaction-service` SUM1+SUM8 2/2 (`-t`), `income-by-branch` 4/4, `transactions-api` SU1 1/1 (`-t`).
- Nota operativa: dos archivos de test con DB en la misma corrida (transaction-service + income-by-branch) dejaron ambos con el hook `afterAll`/`beforeAll` caido tras ~555 s (todos los tests skipped), re-corridos de a uno pasan. Cada corrida con DB tarda ~7 min; correr de a un archivo.

## Para los planes siguientes

- `isTreasury` ya esta en el schema Drizzle: el `select()` de `cashRegisters` lo devuelve, hay que sumarlo a los response schemas de cajas (Ajv con `additionalProperties` puede recortarlo) cuando 208-02 lo exponga.
- `ACCOUNT_CURRENCY_SCHEMA` es `as const` con `enum` readonly: para usarlo dentro de un schema Ajv tipado como mutable puede hacer falta spread (`enum: [...SUPPORTED_ACCOUNT_CURRENCIES]`).
- La regla medio-cuenta recibe `{ type, name? }`: los services deben pasar el nombre de la cuenta para que el mensaje al usuario sea util.
