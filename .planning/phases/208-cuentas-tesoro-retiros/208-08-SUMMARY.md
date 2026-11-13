---
phase: 208-cuentas-tesoro-retiros
plan: 08
subsystem: admin
tags: [admin, tipos, composable, monedas, usd, cheque, regla-medio-cuenta]
requires: [208-01, 208-02, 208-04, 208-05, 208-06, 208-07]
provides:
  - utils/currencies.ts (ACCOUNT_CURRENCIES, AccountCurrency, ACCOUNT_CURRENCY_OPTIONS, currencySymbol)
  - formatPrice con USD (admin + app en sync)
  - utils/payment-method-rules.ts (espejo de la regla medio-cuenta de la API)
  - tipos y composable del admin para Tesoro, destinos de retiro y arqueo de apertura
affects: [208-09, 208-10]
tech-stack:
  added: []
  patterns: [espejo de regla de API en el admin solo para filtrar opciones]
key-files:
  created:
    - el-templo-admin/src/utils/currencies.ts
    - el-templo-admin/src/utils/payment-method-rules.ts
    - el-templo-admin/src/utils/__tests__/currencies.test.ts
    - el-templo-admin/src/utils/__tests__/payment-method-rules.test.ts
  modified:
    - el-templo-admin/src/utils/format-price.ts
    - el-templo-app/src/utils/format-price.ts
    - el-templo-app/test/format-price.test.ts
    - el-templo-admin/src/types/transaction.ts
    - el-templo-admin/src/composables/useTransactionsApi.ts
    - el-templo-admin/src/components/FinancialHistoryTab.vue
    - el-templo-admin/src/components/caja/MovimientosTab.vue
    - el-templo-admin/src/components/caja/BandejaPendientesTab.vue
    - el-templo-admin/src/components/caja/CuentaBancariaFormDialog.vue
    - el-templo-admin/src/components/caja/RegistrarRetiroDialog.vue
decisions:
  - "Cheque no se ofrece en PAYMENT_METHOD_FILTER_OPTIONS ni PAYMENT_METHOD_OPTIONS (cobros), solo en tipo, etiqueta y color"
  - "El tipo Currency de format-price.ts no se ensancha: las cuentas usan AccountCurrency"
duration: ~25 min
completed: 2026-11-11
---

# Phase 208 Plan 08: Base del admin (USD, cheque, regla espejada, composable) Summary

Base del admin para Tesoro/USD/retiros con destino: monedas de cuenta ARS/EUR/USD, `formatPrice` con USD (`US$`) idéntico en admin y app, espejo de la regla medio-cuenta usado por la Bandeja, `cheque` como medio en tipos/etiquetas, y tres métodos nuevos del composable.

## Commits

| Tarea | Commit | Descripción |
|-------|--------|-------------|
| 1 | `5f57ac423` | monedas de cuenta con USD y espejo de la regla medio-cuenta |
| 2 | `163bba4f9` | tipos y composable de Tesoro, destinos de retiro, arqueo de apertura y cheque |
| 3 | `124836555` | la Bandeja filtra cajas con la regla única medio-cuenta |

## Verificación

- Tests admin (vía vitest de la app, `--root ../el-templo-admin`): `currencies.test.ts` + `payment-method-rules.test.ts` = 14 verdes (matriz de 14 casos de la regla, incluye cubrir los 7 medios).
- Test app: `test/format-price.test.ts` = 8 verdes (suma USD entero, USD con centavos, USD distinto de ARS). El fallback de moneda desconocida sigue (`'USD?'`).
- vue-tsc admin: 27 (base 27), sin errores nuevos (diff contra la base vacío). vue-tsc app: 21 (base 21). eslint limpio en los archivos tocados.

## Deviations from Plan

**1. [Rule 3 - Bloqueante] `cheque` en el tipo en la Task 1.** El espejo de la regla es un `Record<PaymentMethod, ...>` y necesita `cheque`; el plan lo permite ("sumá cheque al tipo acá mismo"). Se movieron al commit de la Task 1: el valor del tipo, etiqueta, color `brown` (ninguno otro lo usa, sin azul), `FinanceSummary.revenueByMethod.cheque` y las claves `cheque` de `FinancialHistoryTab.vue` / `MovimientosTab.vue`. `SaldosPorCajaTab.vue` NO necesitó cambios (su acumulador se arma desde columnas, no es un `Record<PaymentMethod,...>`), así que no se tocó.

**2. [Rule 3 - Bloqueante] Dos errores nuevos de vue-tsc fuera de los archivos del plan.**
- `CuentaBancariaFormDialog.vue`: `BankAccount.currency` ahora es `AccountCurrency`, y el form lo tenía como `'ARS' | 'EUR'`. Se ensanchó el tipo del form, de `defaultCurrency` y de `currencyOptions` a `AccountCurrency`. NO se sumó USD a las opciones del select: eso es de 208-09 (el comentario del archivo lo dice).
- `RegistrarRetiroDialog.vue`: `RegisterWithdrawalInput.destinationCashRegisterId` ahora es obligatorio y el diálogo todavía no lo manda. Puente: `// @ts-expect-error TS2345` con `TODO(208-10)` sobre la llamada a `registerWithdrawal`. **208-10 DEBE quitarlo** al cablear el selector de destino (si queda, vue-tsc avisa con TS2578 "unused @ts-expect-error"). Mientras tanto el retiro desde esta pantalla ya fallaba contra la API (destino obligatorio desde 208-06), no es regresión nueva en runtime.

## Decisiones del ejecutor

- `getWithdrawalDestinations` devuelve `WithdrawalDestination[]` desenvolviendo `{ destinations }` (la forma real de la ruta; el plan decía "Array"). Verificado contra `routes.ts` de la API.
- `registerOpeningCount` y `createTreasury` devuelven el cuerpo completo (`{ openingCount }` / `{ caja }`), igual que `createEfectivoCaja`.
- `CajaSaldoRow.currency` queda `string` (como hoy); solo las cuentas banco usan `AccountCurrency`.
- Bandeja: resultado idéntico al previo para todos los medios (los exentos internal/aura_credit ven todas las cajas de la moneda; cheque nuevo ve solo banco).

## Hallazgos para 208-09 / 208-10

- **Utilidades** (`src/utils/currencies.ts`): `ACCOUNT_CURRENCIES`, `AccountCurrency`, `ACCOUNT_CURRENCY_OPTIONS` (usarla en los selects de moneda), `currencySymbol(currency)` (reemplaza los `currencySymbol` locales de `RegistrarMovEgresoDialog.vue` y `RegistrarRetiroDialog.vue`). `formatPrice(n, currency)` ya muestra `US$`.
- **Regla**: `isMethodAllowedForAccount(method, accountType)` y `METHOD_ACCOUNT_RULE` en `src/utils/payment-method-rules.ts` (tipo `AccountType = 'efectivo' | 'banco'`). Para los pagos de Egresos (209) ofrecer `cheque` aparte: sigue fuera de `PAYMENT_METHOD_OPTIONS`.
- **Composable** (`useTransactionsApi()`): `createTreasury(input: CreateTreasuryInput) → { caja: CajaSaldoRow }` (403 no owner, 409 Tesoro duplicado en la moneda); `registerOpeningCount(cashRegisterId, { countedAmount, notes? }) → { openingCount: OpeningCountResult }` (countedAmount = contado TOTAL incluido fondo de cambio; solo Central/Tesoro); `getWithdrawalDestinations(cashRegisterId) → WithdrawalDestination[]` (vacío = hay que crear Central/Tesoro en esa moneda); `registerWithdrawal` ya exige `destinationCashRegisterId`.
- **Tipos** (`src/types/transaction.ts`): `CajaSaldoRow.isTreasury`, `WithdrawalListItem.format` (`'legacy_expense' | 'transfer'`) + `destinationCashRegisterId` + `destinationName`, `MovEgresoItem.responsibleName`, `WithdrawalDestination`, `CreateTreasuryInput`, `OpeningCountInput`, `OpeningCountResult`, `RegisterWithdrawalInput.destinationCashRegisterId: number`. `BankAccount.currency` y `CreateBankAccountInput.currency` son `AccountCurrency`.
- `PaymentMethod` suma `'cheque'`; si 209 agrega un selector de medios para egresos debe incluirlo explícitamente.

## Known Stubs

Ninguno (el `@ts-expect-error` de `RegistrarRetiroDialog.vue` es un puente documentado hacia 208-10).

## Self-Check: PASSED

- Archivos creados existen (currencies.ts, payment-method-rules.ts y sus tests).
- Commits `5f57ac423`, `163bba4f9`, `124836555` presentes en la rama.
