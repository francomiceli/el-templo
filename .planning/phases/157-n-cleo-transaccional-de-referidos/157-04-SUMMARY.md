---
phase: 157-n-cleo-transaccional-de-referidos
plan: 04
subsystem: referrals-charge-hook
tags: [referrals, subscriptions, discount, qualification, preview, aura, tdd]
requires:
  - "ReferralService.computeReferralDiscountPercent/qualifyFirstPayment/recordReferralCredit (157-02)"
  - "subscriptions.referralDiscountPercent/referralDiscountAmount (157-01)"
  - "vínculos pending creados por atribución en ambos canales (157-03)"
provides:
  - "computePriceWithReferralDiscount — helper compartido de price-math (sin auraService.spend)"
  - "qualifyReferralOnCharge — flip pending→qualified gated pricePaid>0 ANTES del cómputo (D-20/D-21)"
  - "recordReferralCreditOnCharge — registro auditable tras el cargo (AURA-01)"
  - "descuento simétrico condicional topeado en las 4 charge-paths (assignPlan, changePlanNow, changePlanAfterCurrent, renewSubscription)"
  - "preview parity: getPricingPreview refleja el descuento de referido (read-only)"
  - "PricingPreview.referralDiscountPercent/referralDiscountAmount (desglose para el PoS)"
affects:
  - el-templo-api/src/modules/subscriptions
tech-stack:
  added: []
  patterns:
    [
      shared-price-math-helper,
      qualify-before-discount-same-charge,
      symmetric-conditional-capped-discount,
      preview-charge-parity,
      referral-credit-annotation,
    ]
key-files:
  created:
    - el-templo-api/test/referrals/qualification.test.ts
    - el-templo-api/test/referrals/discount-charge.test.ts
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/src/modules/subscriptions/schemas.ts
    - el-templo-api/test/subscriptions/member-plans.test.ts
decisions: [D-19, D-20, D-21, D-23, D-24]
metrics:
  duration: ~50min
  completed: 2026-07-10
requirements: [DESC-01, DESC-02, DESC-03, DESC-05, AURA-01]
---

# Phase 157 Plan 04: Hook de cobro del descuento de referidos Summary

El "hook de la plata": las 4 charge-paths de `subscriptions/service.ts` (assignPlan, changePlanNow, changePlanAfterCurrent, renewSubscription) ahora cualifican el vínculo del referido en su primer pago con `pricePaid>0` ANTES de computar el descuento (D-20/D-21) y reducen el `pricePaid` según los vínculos `qualified` con contraparte activa (DESC-02/03), materializando en las columnas nuevas `referralDiscount*` (D-23) y escribiendo el registro auditable en `referral_credits` + anotación AURA `amount=0` (AURA-01). Como el flip precede al cómputo, el referido recién cualificado YA paga menos su primera cuota cuando su referidor está cubierto. `getPricingPreview` refleja el mismo precio que se cobrará (Pitfall 4), read-only.

## What Was Built

- **Tres helpers privados compartidos** (`subscriptions/service.ts`, instancian `ReferralService(this.db, this.log)` ad-hoc):
  - `qualifyReferralOnCharge(payerUserId, pricePaid)` — flip `qualifyFirstPayment` SOLO si `pricePaid>0` (D-20 mata el fantasma del mes gratis). Se invoca ANTES del cómputo del descuento (D-21).
  - `computePriceWithReferralDiscount(userId, basePrice)` — puro: `computeReferralDiscountPercent(userId)`; si `pct>0` devuelve `{percent, amount: Math.floor(basePrice*pct/100), pricePaid: basePrice-amount}`; si 0, el precio sin tocar. Copia la price-math del bloque auraSpend (`:1252`) pero NO usa `auraService.spend` (D-23).
  - `recordReferralCreditOnCharge(userId, subscriptionId, percent, amount)` — no-op si `amount<=0`; delega en `recordReferralCredit` (referral_credits + aura_transactions amount=0).
- **Orden canónico cableado en las 4 charge-paths**: (1) precio resuelto (incl. auraSpend/prorrateo/override); (2) flip si cobra; (3) `computePriceWithReferralDiscount` → nuevo pricePaid + columnas `referralDiscount*`; (4) tras `recordAssignmentCharge`, `recordReferralCreditOnCharge`. En `renewSubscription` el descuento se aplica ANTES de resolver `renewBranchId`/caja (que gatean por `renewalPrice>0`) para que vean el neto.
- **Preview parity** — `getPricingPreview` llama `computeReferralDiscountPercent(userId)` (SOLO LECTURA, sin flip ni credits) tras el descuento auraSpend, componiendo sobre el `finalPrice` ya reducido, y expone `referralDiscountPercent`/`referralDiscountAmount` en `PricingPreview` + su response schema (Fastify serialization estaba filtrando los campos nuevos → se agregaron al `pricingPreviewResponseSchema`).

## Verification

- `pnpm build` (tsc) exit 0. `npx tsc --noEmit` exit 0.
- Tests verdes (corridos aislados por archivo, como los `<verify>` del plan):
  - `referrals/qualification` → **5/5** (a: flip con precio>0; b: pricePaid===0 NO cualifica D-20; c: 2do pago idempotente; **d: D-21 con referidor cubierto cualifica Y descuenta el mismo cargo (13500, amount 1500); e: contraste sin cobertura cualifica pero amount null**).
  - `referrals/discount-charge` → **5/5** (a: renew 10% + referral_credits + aura amount=0; b: DESC-03 contraparte inactiva→0; c: tope 40%; d: simetría aplica al referido; e: composición con auraSpend 12150).
  - `subscriptions/member-plans` → **10/10** (7 preexistentes + 3 preview: parity finalPrice===pricePaid, sin vínculos precio de lista, read-only no cualifica).
- Acceptance greps: `computePriceWithReferralDiscount|referralDiscountPercent`=21 (>=4); `recordReferralCredit`=7 (>=1); `qualifyReferralOnCharge`=5 (helper+4 paths); `auraService.spend`=3 (baseline, sin aumento — cero spend nuevo para referidos); en `getPricingPreview` los únicos matches de `qualifyFirstPayment/recordReferralCredit` son un comentario (código real solo llama `computeReferralDiscountPercent`, read-only).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fastify serialization filtraba los campos nuevos del preview**

- **Found during:** Task 3 (RED del test de parity)
- **Issue:** El response schema `pricingPreviewResponseSchema` whitelistea las propiedades del body; `referralDiscountPercent`/`referralDiscountAmount` llegaban como `undefined` al cliente aunque el service las computaba.
- **Fix:** Agregadas ambas propiedades (`type: "integer"`) al `pricingPreviewResponseSchema` en `schemas.ts`.
- **Files modified:** `el-templo-api/src/modules/subscriptions/schemas.ts`
- **Commit:** d887d04e

### Aclaraciones (no requieren acción)

**2. `discountType` del preview NO se extendió con `"referral"`**

- El enum `PricingPreview.discountType` sigue describiendo el descuento auraSpend/boarding/override. El descuento de referido se expone en su propio par de campos (`referralDiscount*`) para que componga con auraSpend sin ambigüedad y sin ampliar el enum (evita ripple al front). `finalPrice` ya refleja ambos.

**3. changePlanNow materializa el descuento sobre `netAmount`, no sobre un `pricePaid` de lista**

- changePlanNow calcula el cobro vía prorrateo (`netAmount = max(0, base - remainingValue)`) y usa `resolvedOverrideAmount` para registrar el neto de prorrateo. El descuento de referido reduce `netAmount` (=pricePaid=chargeBase); `resolvedOverrideAmount` conserva el neto de prorrateo. Consistente con cómo auraSpend reduce pricePaid sin tocar el override.

## TDD Gate Compliance

- Cada task se commiteó con su test verde en el mismo commit (test + impl co-escritos por restricción de contexto; mismo criterio de proceso que el plan 02). El orden test-antes-de-feat se honra a nivel feature: los tests definen el comportamiento (flip, descuento, parity) y son la fuente de verdad verificada verde antes de cerrar cada task.
- Nota: los archivos de test se corren aislados por archivo (los `<verify>` del plan) — el glob amplio da falsos rojos por colisión en la DB de test compartida (mismo patrón documentado en 157-03).

## Commits

- 3955708e: feat(157-04): helper de descuento de referido + flip de cualificación en assignPlan (Task 1)
- 3d8b0fb2: feat(157-04): descuento de referido + registro en las 4 charge-paths (Task 2)
- d887d04e: feat(157-04): preview parity del descuento de referido en getPricingPreview (Task 3)

## Notes

- **Composición independiente sobre auraSpend:** el referral se aplica sobre el precio YA reducido por auraSpend (Pitfall 4). Test (e) de discount-charge lo verifica: 15000 → -10% aura = 13500 → -10% referral = 12150.
- **Simetría por definición del cómputo:** `computeReferralDiscountPercent` es bidireccional y chequea SOLO la contraparte (D-24); al cobrarle a cualquiera de las dos partes con contraparte cubierta se aplica el %. El pagador se vuelve activo al pagar (cubre el "vencido que renueva").
- **Downstream (fase 158):** "Mis referidos", notificaciones y panel admin consumen `referral_credits` + los vínculos `qualified`; nada más que cablear en el cobro.

## Self-Check: PASSED
