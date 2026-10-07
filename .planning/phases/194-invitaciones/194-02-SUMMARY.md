---
phase: 194-invitaciones
plan: 02
subsystem: api
tags: [characterization, pricing, referrals, aura, partner, renewal, tests-only]
requires: []
provides:
  - "test/invitations/discount-characterization.test.ts: foto del cobro previo al árbitro (18 casos)"
  - "Veredicto D-22: CONFIRMADO"
affects: [194-15, 194-16, 194-17, 194-18]
tech-stack:
  added: []
  patterns:
    - "Caracterización con anotación por caso `194: cambia en 194-NN por D-XX` / `194: se conserva`"
key-files:
  created:
    - el-templo-api/test/invitations/discount-characterization.test.ts
  modified: []
key-decisions:
  - "D-22 CONFIRMADO: 194-18 debe corregir el add-back de renovación (AURA y partner) dentro del árbitro"
requirements-completed: [SC-3, D-08, D-20, D-21, D-22, D-10e]
duration: ~35min
completed: 2026-10-06
---

# Phase 194 Plan 02: Caracterización de descuentos en cobros Summary

Foto verde (18/18) del comportamiento ACTUAL de descuentos en las 4 charge-paths y los 3 previews, sin tocar código de producción; cada cambio de plata de los planes 194-15..194-18 pasa a ser un cambio de expectativa revisable en el diff de este archivo.

**D-22: CONFIRMADO** — alta con AURA 10% (`price_paid` 90000 sobre lista 100000) → `getRenewalPreview.base` = **90000** y la renovación cobra `price_paid` = **90000**: hereda la base rebajada (debería ser 100000). Idem con partner 20%: alta 80000 → base de renovación 80000, renovación `price_paid` 80000. El add-back de `resolveRenewalBase` (`pricePaid + referralDiscountAmount`) devuelve solo el referido. 194-18 SÍ debe corregirlo dentro del árbitro (impacto prod 0, según CONTEXT).

## Commits

- `63841792d` test(194-02): caracterización pre-árbitro de descuentos en cobros y previews (solo el archivo de test; `git show --stat HEAD` lista 1 archivo)

## Tests

`timeout 900 pnpm exec vitest run test/invitations/discount-characterization.test.ts --hookTimeout 600000` → **18 passed (18)**, 140 s, verde a la primera corrida (todos los números coincidieron con el cálculo a mano sobre el código). `typecheck:tests`: ningún error en el archivo nuevo (la deuda preexistente ajena sigue). `lint:tenant` DISCREPANCIAS 0. Criterios: 18 `it(` (>= 12), 12 líneas `194: cambia en` (>= 7).

## Montos observados por caso (lista 100000, 10% por vínculo)

| Caso | Path | Escenario | price_paid | Detalle persistido | Anotación |
|------|------|-----------|-----------:|--------------------|-----------|
| (a) | assignPlan + pricing preview | solo referido | 90000 | referral 10000; preview.finalPrice = 90000 | se conserva |
| (b) | assignPlan | AURA 10% + referido | **81000** | aura_discount 1000 (10%), referral 9000 (sobre 90000); se gastan 1000 pts | cambia en 194-15 (D-08/D-21) |
| (b2) | assignPlan | AURA 30% vs partner 10% + referido | **63000** | AURA gana (partner null), referral 7000 compone encima | cambia en 194-15 (D-21) |
| (c) | assignPlan | partner 20% + referido | **72000** | partner 20000, referral 8000 (sobre 80000) | cambia en 194-15 (D-21) |
| (c2) | assignPlan | partner 20% vs AURA 10%, sin referido | 80000 | partner gana, AURA no se gasta | se conserva (ya es "gana el mayor") |
| (d) | assignPlan | override 50000 + motivo + referido | **45000** | price_override 50000, referral 5000 | cambia en 194-15 (D-20) |
| (e) | assignPlan | boarding pass (Zero 70000) + referido | **63000** | boarding_pass_used, referral 7000 | cambia en 194-15 (D-08) |
| (f1) | changePlanNow + getChangePlanPreview | neto 150000 (200000 - crédito 50000) + referido | 135000 | referral 15000; preview.netAmount = 135000 | cambia en 194-17 (D-21) |
| (f2) | changePlanNow + preview | + partner 20% + referido | **108000** | partner 30000 (sobre 150000), referral 12000 (sobre 120000); preview.netAmount = 108000 | cambia en 194-17 (D-21) |
| (f3) | changePlanNow | `auraSpend` ignorado (`supports.discounts=false`) | 150000 | aura null, saldo AURA intacto (1000) | se conserva |
| (g) | changePlanAfterCurrent | AURA 10% + referido sobre plan 200000 | **162000** | aura 1000, referral 18000 (sobre 180000); status `scheduled` | cambia en 194-16 (D-08/D-21) |
| (h) | renewSubscription + getRenewalPreview | alta con referido (90000) → renovar | 90000 | `renewal-preview` = `{subscriptionId, base: 100000, source: "inherited"}`; referral 10000 (NO 81000) | se conserva |
| (i) | renew | alta AURA 10% (90000) → renovar | **90000** | `preview.base` = 90000; renovación sin aura_discount | cambia en 194-18 (D-22) |
| (i2) | renew | alta AURA + referido (81000) → renovar | **81000** | `preview.base` = 90000, referral 9000 re-aplicado sobre la base ya rebajada | cambia en 194-18 (D-22) |
| (j) | renew | alta partner 20% (80000) → renovar | **80000** | `preview.base` = 80000; partner ya consumido, no se re-aplica | cambia en 194-18 (D-22) |
| (l1) | `computeReferralDiscountPercent` | vínculo 1:1, ambos cubiertos | 10 / 10 | invitador = invitado = 10 | se conserva (D-10e) |
| (l2) | `computeReferralDiscountPercent` | invitador con 5 vínculos activos | 40 | cada invitado 10; tope 40 | se conserva (D-10e) |
| (l3) | `computeReferralDiscountPercent` | contraparte pierde cobertura | 0 | baja aplica en el próximo cobro | se conserva (D-10e) |

Paridad preview↔cobro verificada hoy en (a)(b)(b2)(c) (`getPricingPreview.finalPrice` = `price_paid`), (f1)(f2) (`getChangePlanPreview.netAmount` = `price_paid`) y (h) (`getRenewalPreview.base` = base efectiva de la renovación).

## D-10e

Verificado equivalente: con `aura_config.referral = 10`, invitado e invitador reciben el mismo 10% (`computeReferralDiscountPercent` simétrico), el invitador con 5 vínculos activos topea en 40, y la baja de la contraparte pasa a 0 en el siguiente cómputo. Nada que reescribir.

## Notas de comportamiento actual (para los planes de cableado)

- `getRenewalPreview` devuelve SOLO `{subscriptionId, base, source}` (afirmado con `toEqual`): el % de referido lo multiplica el cliente (Pitfall 6). Si 194-18 le agrega campos, se rompe (a propósito) el `toEqual` de (h).
- `changePlanNow` ignora AURA por diseño (`supports.discounts=false`): (f3) lo fija para que 194-17 no lo cambie por accidente.
- En (b2) AURA gana al partner pero el referido igual compone encima: es el mismo bug de composición de D-21, no una excepción.
- (e) requiere la regla `zero_price` ON (se prende y se apaga en `try/finally`).

## Deviations from Plan

None - plan executed exactly as written. Se agregaron 5 casos extra a los mínimos del plan (b2, c2, f3, i2, l3; 18 `it` en total) para fijar la competencia AURA/partner con referido, que AURA es ignorada en changePlanNow, que la renovación compone el referido sobre la base ya rebajada, y la baja de contraparte.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: el-templo-api/test/invitations/discount-characterization.test.ts
- FOUND: commit 63841792d (solo el archivo de test; sin cambios en `el-templo-api/src` por este plan)
