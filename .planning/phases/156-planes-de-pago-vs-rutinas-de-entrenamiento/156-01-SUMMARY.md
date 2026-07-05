---
phase: 156-planes-de-pago-vs-rutinas-de-entrenamiento
plan: 01
subsystem: settings + subscriptions (pricing)
tags: [white-label, pricing, settings, zero-price, gate, resolvePriceType]
requires:
  - "settings module (154): keys.ts, service.ts, routes.ts"
  - "subscriptions resolvePriceType (154, D-04) + WR-04 renew normalization"
provides:
  - "settings key pricing.zero_price_enabled (GET staff / PUT owner)"
  - "server-side Zero price gate en resolvePriceType (assign/change/renew/preview/PoS + boarding pass)"
  - "SettingsService.getZeroPriceEnabled / setZeroPriceEnabled"
  - "migración 0168 (seed idempotente 'on' para El Templo)"
affects:
  - "el-templo-api/src/modules/settings/*"
  - "el-templo-api/src/modules/subscriptions/service.ts (resolvePriceType + boarding pass)"
tech-stack:
  added: []
  patterns:
    - "réplica exacta del par card_surcharge (154): key + getFlag/setFlag DRY + GET staff/PUT owner"
    - "gate server-side en el punto único resolvePriceType; UI esconde después (plan 156-02+)"
    - "migración seed idempotente INSERT ... SELECT ... WHERE NOT EXISTS (analog 0166)"
key-files:
  created:
    - "el-templo-api/src/db/migrations/0168_seed_pricing_zero_price.sql"
    - "el-templo-api/test/settings/zero-price-setting.test.ts"
    - "el-templo-api/test/subscriptions/zero-price-gate.test.ts"
  modified:
    - "el-templo-api/src/modules/settings/keys.ts"
    - "el-templo-api/src/modules/settings/service.ts"
    - "el-templo-api/src/modules/settings/routes.ts"
    - "el-templo-api/src/modules/subscriptions/service.ts"
decisions:
  - "getFlag/setFlag privados en SettingsService (DRY): ambos pares (card + zero) se expresan sobre ellos"
  - "boarding pass ruteado por resolvePriceType (segundo pase) + pricePaid vía getBasePrice para no persistir tipo/monto inconsistente"
  - "enums de schemas.ts NO recortados (precedente 154: el gate es la normalización server-side)"
metrics:
  duration: ~5min
  completed: 2026-07-05
---

# Phase 156 Plan 01: Precio "Zero" a configuración Summary

Precio "Zero" movido del default a configuración (PLAN-02): nueva key `pricing.zero_price_enabled` (GET staff / PUT owner-only) con default OFF y seed ON para El Templo (migración 0168), gateada server-side en el punto único `resolvePriceType` que normaliza `zero`→`regular` con la regla apagada, cubriendo assign/change/renew/preview/PoS y el boarding pass. Réplica exacta del patrón `card_surcharge` de la fase 154.

## What Was Built

**Task 1 — Setting Zero (commit `12cc9135`):**

- `keys.ts`: nueva key `zeroPrice: "pricing.zero_price_enabled"` en `PRICING_SETTINGS_KEYS`.
- `service.ts`: extraídos `getFlag(key)`/`setFlag(key, enabled)` privados (DRY); ambos pares (card-surcharge + zero) se expresan sobre ellos. `getZeroPriceEnabled`/`setZeroPriceEnabled` con default OFF.
- `routes.ts`: `GET /pricing/zero-price` (staff-readable, hook del plugin) y `PUT /pricing/zero-price` (owner-only vía `preHandler` OWNER_ROLES → 403), schema `{ enabled: boolean }`, `handleServiceError` en el catch.
- Migración `0168_seed_pricing_zero_price.sql`: copia idempotente de 0166 con seed `'on'` para El Templo (`INSERT ... SELECT ... WHERE NOT EXISTS`), sin `;` en comentarios.

**Task 2 — Gate + boarding pass + tests (commits `65b75ded` RED, `83a6aa54` GREEN):**

- `resolvePriceType`: rama simétrica `zero`→`regular` cuando la regla Zero está OFF (con log Pino `{ rule: PRICING_SETTINGS_KEYS.zeroPrice }`). Cubre automáticamente los 5 call sites (assign 1052, change 2813, 3238, renew 3545, preview 3945) incluida la herencia WR-04 de renovaciones.
- Boarding pass (assignPlan): ya no fuerza `priceTypeApplied = "zero"` directo; se rutea por `resolvePriceType("zero")` (segundo pase) y `pricePaid` se recalcula con `getBasePrice(plan, priceTypeApplied)` para no persistir un tipo con monto inconsistente. Con Zero ON el resultado sigue siendo `zero` + `priceZero` (idéntico a hoy); con Zero OFF queda `regular` + `priceRegular`.
- Tests: `zero-price-setting.test.ts` (default-OFF, PUT owner/no-owner 403, GET staff 200/member 403) + `zero-price-gate.test.ts` (assign ON→zero, assign OFF→regular, default-OFF, renovación WR-04, boarding pass OFF→regular asertando AMBOS campos, boarding pass ON→zero).

## Threat Model Coverage

- **T-156-01** (Elevation of Privilege, PUT owner-only): mitigado con `preHandler` OWNER_ROLES + test 403 no-owner.
- **T-156-02** (Tampering, payload `zero` con regla OFF): mitigado con la normalización server-side en `resolvePriceType` (valor persistido `regular`).
- **T-156-03** (Tampering, boardingPass bypass): mitigado ruteando el boarding pass por `resolvePriceType`.

## Deviations from Plan

None - plan ejecutado exactamente como fue escrito. La discreción DRY del plan (Task 1) se ejerció extrayendo `getFlag`/`setFlag` privados.

## Notas de verificación

- Gate local `tsc --noEmit` verde tras cada task (regla de proyecto: los suites de tests corren en CI, no localmente).
- Migración 0168: réplica idempotente del analog probado 0166; se valida al aplicar en CI/staging (`pnpm db:migrate`, runner propio; `_migrations` es la fuente de verdad). No se aplicó contra la DB local para no arrastrar migraciones pendientes del entorno de desarrollo.
- Los enums de `schemas.ts` NO se recortaron (precedente 154): el gate es la normalización server-side, no el schema.

## TDD Gate Compliance

Task 2 (`tdd="true"`): commit `test(...)` (`65b75ded`, RED) precede al commit `feat(...)` (`83a6aa54`, GREEN). Los tests no se corren localmente por regla de proyecto (CI-only); el gate RED→GREEN se honra en la secuencia de commits.

## Self-Check: PASSED

Todos los archivos creados/modificados existen en disco; los 3 commits (`12cc9135`, `65b75ded`, `83a6aa54`) están en el historial.
