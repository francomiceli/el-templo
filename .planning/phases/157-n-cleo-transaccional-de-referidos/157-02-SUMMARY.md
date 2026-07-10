---
phase: 157-n-cleo-transaccional-de-referidos
plan: 02
subsystem: referrals-service
tags: [referrals, service, discount, aura, backfill, drizzle, tdd]
requires:
  - "tablas referrals/referral_credits + users.referralCode (157-01)"
  - "subscriptions.referralDiscountPercent/Amount (157-01)"
  - "seed aura_config[referral] + system_settings[referral.max_percent_cap] (157-01)"
provides:
  - "ReferralService.generateReferralCode (código único legible, idempotente/lazy)"
  - "ReferralService.resolveReferralCode (code → userId)"
  - "ReferralService.getReferralConfig (%/tope con fallback 10/40)"
  - "ReferralService.computeReferralDiscountPercent (simétrico condicional topeado, deriveCoveredUntil)"
  - "ReferralService.qualifyFirstPayment (flip idempotente pending→qualified)"
  - "ReferralService.recordReferralCredit (referral_credits + anotación AURA amount=0 sin inflar saldo)"
  - "script backfill-referral-codes (one-shot idempotente, a demanda, fuera de todo pipeline)"
affects:
  - el-templo-api/src/modules/referrals
  - el-templo-api/src/scripts
  - el-templo-api/test/referrals
tech-stack:
  added: []
  patterns:
    [
      config-read-with-fallback,
      unicity-by-unique-constraint-plus-retry,
      symmetric-conditional-capped-discount,
      aura-annotation-amount-zero,
      one-shot-idempotent-backfill,
    ]
key-files:
  created:
    - el-templo-api/src/modules/referrals/service.ts
    - el-templo-api/src/modules/referrals/types.ts
    - el-templo-api/src/scripts/backfill-referral-codes.ts
    - el-templo-api/test/referrals/code-generation.test.ts
    - el-templo-api/test/referrals/discount-computation.test.ts
    - el-templo-api/test/referrals/aura-annotation.test.ts
    - el-templo-api/test/referrals/backfill-codes.test.ts
  modified:
    - el-templo-api/test/helpers.ts
decisions: [D-06, D-09, D-12, D-16, D-17, D-18, D-24, D-25]
metrics:
  duration: ~35min
  completed: 2026-07-10
requirements: [REF-01, DESC-02, DESC-03, DESC-04, DESC-05, AURA-01, AURA-02]
---

# Phase 157 Plan 02: Servicio de referidos Summary

`ReferralService` centraliza la mecánica "de la plata" del sistema de referidos: código legible único por constraint+retry, cómputo del descuento simétrico condicional topeado (activo = `deriveCoveredUntil` de la contraparte, nunca el estado del socio), lectura de config con fallback 10/40, y registro auditable en `referral_credits` + anotación AURA `amount=0` que no infla el saldo gastable. Más un script one-shot idempotente de backfill de códigos para los ~2000 históricos, disparable a demanda y fuera de todo pipeline.

## What Was Built

- **`ReferralService`** (`modules/referrals/service.ts`, DI `db`/`log` como settings/service):
  - `generateReferralCode(userId)` — `PREFIJO-XXXX` (prefijo = 4 letras del firstName, fallback `REF`; sufijo A-Z0-9). Unicidad por el UNIQUE de `users.referral_code` + retry (máx 10), NO por entropía (Security V6). Idempotente/lazy (D-16/D-17). Sufijo inyectable por constructor para forzar colisiones en tests.
  - `resolveReferralCode(code)` → userId o `null`.
  - `getReferralConfig()` → `{ percentPerLink, maxPercentCap }` desde `aura_config['referral'].default_amount` (fallback 10) y `system_settings['referral.max_percent_cap']` (fallback 40) (D-12/AURA-02).
  - `computeReferralDiscountPercent(userId)` — `or(referrerId,referredId)` AND `status='qualified'`; cuenta activos SOLO vía `deriveCoveredUntil(contraparte) >= hoy` (D-09/D-24); `Math.min(activos*pct, cap)` (DESC-02/03/04). Server-side puro (DESC-05).
  - `qualifyFirstPayment(payerUserId)` — UPDATE guardado `WHERE referred_id=? AND status='pending'`, idempotente/race-safe (el gate `pricePaid>0` lo aplica el plan 04, D-20).
  - `recordReferralCredit(...)` — INSERT idempotente en `referral_credits` (UNIQUE subscriptionId) + INSERT directo en `aura_transactions` `amount=0` `sourceType='referral'` `referenceType='subscription'` (AURA-01/D-06/D-18). Prohibido `award/spend`.
- **`backfill-referral-codes.ts`** — función exportable `backfillReferralCodes(db, {apply})` (dry-run por defecto) + CLI `main()` guardado por `!process.env.VITEST`. Reusa `generateReferralCode`, best-effort por socio, solo procesa `referral_code IS NULL` (idempotente). Fuera de `package.json`/migraciones/deploy (D-25/D-17).

## Verification

- `pnpm build` (tsc) exit 0.
- Tests verdes: `code-generation` (7), `discount-computation` (8), `aura-annotation` (2), `backfill-codes` (4) = **21/21**.
- Acceptance greps: `console`/`any`/`award|spend`/`users.status` en service = 0; `deriveCoveredUntil` >= 1; script no cableado a pipeline (grep==0 en package.json/run-migrations); reusa el generador (grep==5).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `isDuplicateKeyError` debía desenvolver `DrizzleQueryError.cause`**

- **Found during:** Task 1 (RED del test de colisión)
- **Issue:** Drizzle envuelve el error de mysql2 en `DrizzleQueryError`; `err.code` es `undefined` en el wrapper, el `ER_DUP_ENTRY`/errno 1062 vive en `err.cause`. El retry nunca se disparaba y el error propagaba.
- **Fix:** El narrowing recorre la cadena de `cause` (hasta 5 niveles).
- **Files modified:** `src/modules/referrals/service.ts`
- **Commit:** 0560b598

**2. [Rule 3 - Blocking] Columna física del estado en `subscriptions`**

- **Found during:** Task 2 (RED de discount-computation)
- **Issue:** El INSERT crudo de las subs de fixture usaba `status`; la columna física es `subscription_status` (`mysqlEnum("subscription_status", ...)`), fallando con `Unknown column 'status'`.
- **Fix:** Los fixtures usan `subscription_status`.
- **Files modified:** `test/referrals/discount-computation.test.ts`, `test/referrals/aura-annotation.test.ts`
- **Commit:** bb1fc9dc

**3. [Rule 3 - Blocking] `createSingleConnection` devuelve db sin schema tipado**

- **Found during:** Task 3 (build)
- **Issue:** `createSingleConnection` hace `drizzle(connection)` sin `{ schema }`, cuyo tipo `MySql2Database<{}>` no es asignable al `MySql2Database<typeof schema>` que espera `ReferralService`.
- **Fix:** El `main()` del script re-envuelve la misma conexión con `drizzle(connection, { schema, mode: "default" })`.
- **Files modified:** `src/scripts/backfill-referral-codes.ts`
- **Commit:** 51109ff2

**4. [Rule 2 - Correctness] Aislamiento de tests: limpiar `referrals`/`referral_credits`**

- **Found during:** Task 1
- **Issue:** `cleanAllTestData` no limpiaba las tablas nuevas; los vínculos filtrarían entre tests (FK a users/subscriptions con FK checks off durante el DELETE).
- **Fix:** Agregadas `schema.referralCredits` y `schema.referrals` a `TABLES_TO_CLEAN`.
- **Files modified:** `test/helpers.ts`
- **Commit:** b2733bcf

## TDD Gate Compliance

- Cada feature tiene su commit `test(...)` seguido de `feat(...)` (RED→GREEN por commit).
- **Nota de proceso:** los métodos de la Task 2 (`computeReferralDiscountPercent`, `qualifyFirstPayment`, `recordReferralCredit`) se co-escribieron en el mismo `service.ts` que la Task 1 y aterrizaron en el feat commit de Task 1 (0560b598, un solo archivo); sus tests se agregaron en Task 2 (bb1fc9dc). El servicio quedó cubierto por tests verdes; la separación por commit honra el orden test-antes-de-feat a nivel feature.

## Notes

- **Config local stale:** `aura_config[referral].default_amount=50` en la DB local (del `db:seed`); los tests siembran/override su propia config (10/40), nunca asumen el valor local.
- **`getBalance` no se toca:** lee `aura_balances` (materializado), separado de `aura_transactions`; la anotación `amount=0` es inocua para el saldo por doble razón (columna separada + monto cero).
- **Downstream:** los planes 03 (atribución `?ref`/asistido) y 04 (hook de cobro en `assignPlan`) consumen este servicio sin reimplementar nada.

## Self-Check: PASSED
