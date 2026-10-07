---
phase: 194-invitaciones
plan: 17
subsystem: api
tags: [discounts, arbiter, referrals, partner, invitations, cobros, changePlanNow, change-plan-preview]
requires:
  - phase: 194-15
    provides: computeChargeDiscounts, settleChargeDiscounts, materializeSettlementLink
  - phase: 194-16
    provides: settlementColumns, chargeCallSite
provides:
  - "changePlanNow: UNA llamada a computeChargeDiscounts (mode charge, chargeCallSite change-now, auraSupported false, prorationCredit): partner e invitación compiten por monto sobre el neto post-prorrateo y se aplica UNO, con tope en dinero, vínculo en la tx y aviso post-commit"
  - "getChangePlanPreview sobre el mismo helper (mode preview): netAmount === cobro de changePlanNow; expone invitationDiscount* y winningDiscount"
  - "computeChargeDiscounts gana auraSupported y prorationCredit (opcionales) y devuelve priceAfterFilter"
affects: [194-18, 194-23]
key-files:
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/src/modules/subscriptions/schemas.ts
    - el-templo-api/test/invitations/discount-arbiter-paths.test.ts
    - el-templo-api/test/invitations/discount-characterization.test.ts
    - el-templo-api/test/referrals/change-plan-charge.test.ts
    - el-templo-api/test/referrals/preview-parity.test.ts
    - el-templo-api/test/subscriptions/pricing-golden.test.ts
key-decisions:
  - "La base de los descuentos del cambio inmediato es el NETO post-prorrateo (lista - crédito), como antes de la 194: el helper resta el crédito ANTES del árbitro (base del candidato, tope en dinero y precio post-filter). Con override el crédito NO se netea (comportamiento previo, D-20)"
  - "auraSupported es un parámetro del helper (no una variante): changePlanNow sigue sin AURA (T-176-24), el filter igual corre para el boarding pass"
  - "price_override_amount de la sub conserva el neto PRE-descuento (priceAfterFilter), como antes: el descuento vive en referral_*/partner_*"
requirements-completed: [D-08, D-10b, D-10c, D-20, D-21, D-26a, SC-3]
completed: 2026-10-07
---

# Phase 194 Plan 17: árbitro en changePlanNow + getChangePlanPreview Summary

**El cambio de plan inmediato y su preview pasan por el mismo `computeChargeDiscounts` que el alta y el cambio diferido: partner e invitación compiten por monto sobre el neto post-prorrateo y se aplica UNO (empate = invitación), con tope en dinero, piso por flag/categoría del plan destino, vínculo de invitación materializado en la tx y aviso al invitador post-commit; el override del admin ("mantener vencimiento") es el precio final sin descuentos encima.**

**VIAJA JUNTO con 194-14..194-18 y 194-23** (el árbitro ya cambia plata en producción en alta, cambio diferido y cambio inmediato; `renewSubscription` sigue componiendo hasta 194-18, y el admin sigue mostrando `referralDiscount*` hasta 194-23).

## Commits

- `0a31b37a9` feat(194-17): changePlanNow y getChangePlanPreview sobre el arbitro de descuentos
- `f758302b1` test(194-17): paridad preview-cobro del cambio inmediato con el arbitro
- `af2bb5632` test(194-17): preview con partner que pierde (12b) y flag D-10b en pricing-golden

## Qué cambió en el código

- `computeChargeDiscounts` (helper de 194-15/16) ganó dos parámetros opcionales: `auraSupported` (default `true`; `false` = `supports.discounts` del filter) y `prorationCredit` (se resta antes del árbitro; se ignora con override), el valor `chargeCallSite: "change-now"` y devuelve `priceAfterFilter`. No se creó una variante.
- `changePlanNow`: se reemplazaron el `resolvePlanPrice` propio, el candidato de partner aplicado directo y el bloque "referido compone sobre partner" por una llamada. Persiste `pricePaid = settlement.finalPrice`, las columnas vía `settlementColumns`, el vínculo con `materializeSettlementLink` dentro de la tx (si la tx falla, el `catch` existente restaura la sub vieja) y el aviso post-commit. El flip del `pending` heredado queda gateado por `planAllowsInvitationDiscount(targetPlan) && !prorateToMonthEnd`. El consumo del partner usa `won: settlement.partnerWon`.
- `getChangePlanPreview`: una llamada en `mode: "preview"` con el crédito remanente. `ChangePlanPreview` (+ `changePlanPreviewSchema`) suma `invitationDiscountPercent`, `invitationDiscountAmount`, `invitationDiscountCapped` y `winningDiscount`; `referralDiscount*` queda como alias deprecado con el mismo valor (hasta 194-23). El downgrade bloqueado devuelve los campos nuevos en 0/false/"none".
- `service.ts`: 8164 -> 8155 líneas (el diff del archivo es 142 inserciones / 151 eliminaciones por el código; baja).

### Shape final de `ChangePlanPreview`

```ts
interface ChangePlanPreview {
  allowed: boolean; reason?: string;
  currentPlan: { id; name; priceRegular; pricePaid };
  targetPlan: { id; name; priceRegular };
  proration: ProrationResult | null;
  netAmount: number | null;            // lista - crédito - descuento ganador (== cobro de changePlanNow)
  referralDiscountPercent: number;     // @deprecated = invitationDiscountPercent
  referralDiscountAmount: number;      // @deprecated = invitationDiscountAmount
  invitationDiscountPercent: number;   // % NOMINAL si la invitación ganó, si no 0
  invitationDiscountAmount: number;    // monto ya recortado por el tope D-10c
  invitationDiscountCapped: boolean;
  winningDiscount: "none" | "aura" | "partner" | "invitation" | "boarding_pass"; // acá: none | partner | invitation
  partnerDiscountPercent: number;      // 0 si no ganó
  partnerDiscountAmount: number;       // 0 si no ganó
  expiryDate?: string;
}
```

## Cambios de precio introducidos (cambio inmediato; plan destino 200000, crédito 50000, neto 150000)

| Caso | Antes | Después | Decisión |
|---|---|---|---|
| Partner 20% + invitación 10% | 108000 (partner 30000 + referido 12000 sobre el remanente) | **120000**, solo partner | D-21 |
| Override con motivo + partner | el partner descontaba encima del override | **el override es el precio final**, el partner ni compite (su beneficio sigue pendiente) | D-20 |
| Override con motivo + invitación | el referido descontaba encima | **override = precio final**, el vínculo nace igual si hay invitación en ventana | D-20 |
| Boarding pass + partner/invitación | componían sobre el neto Zero | **neto Zero, sin descuentos** | D-26a |
| Plan destino SIN flag + vínculo qualified/pending | descontaba 10% (y cualificaba) | **neto sin descuento**, no cualifica (el partner sí descuenta: el flag es solo de la invitación) | D-10b |
| Tope AR 5000 con invitación 10% | 135000 (sin tope) | **145000**, crédito `{percent:10, amount:5000}` | D-10c |
| Partner 5% (7500) vs invitación 10% (15000) | componían | **135000**, gana la invitación; el partner se consume `perdio_vs_aura` | D-21 |

Se conserva: invitación sola 10% sobre el neto post-prorrateo (135000), AURA ignorada (`auraSpend` no gasta puntos), `price_override_amount` = neto pre-descuento, razón "Cambio de plan: credito $..." byte a byte, el cobro 0 sin flip.

Ningún cambio fuera de D-08/D-10b/D-10c/D-20/D-21/D-26a.

## Anotaciones de caracterización

`grep -c "194: cambia en 194-17"` = 0 (eran (f1) y (f2)). (f1) pasó a `// 194-17 D-21` (el número no cambia: invitación sola; se agregaron aserciones de `invitationDiscount*` y `winningDiscount`); (f2) pasó de 108000 a 120000 (`// 194-17 D-21`). Quedan 3 anotaciones `194: cambia en 194-18` ((i) (i2) (j)) más la línea de cabecera que describe la convención (4 coincidencias del grep). (f3) conserva `194: se conserva`.

## Tests

| Archivo | Resultado |
|---|---|
| `test/invitations/discount-arbiter-paths.test.ts` | 44 verdes (+18 `describe changePlanNow`: invitación sola sobre el neto, partner gana/pierde, tope, tope vs partner, sin flag (+ partner sí), override, boarding pass, AURA ignorada, sin descuento, pending cualifica/no cualifica, neto 0, sub `changed`, 3 de vínculo que nace con el cambio) |
| `test/referrals/preview-parity.test.ts` | 21 verdes (+8 `changePlanNow`: (11) invitación sola, (12) partner gana, (12b) partner pierde, (13) tope, (14) sin flag, (15) `pending` simulado/idempotente, (16) vínculo a materializar, (17) downgrade con campos en 0; (3) con flag) |
| `test/invitations/discount-characterization.test.ts` | 18/18 ((f1) (f2) con la expectativa nueva) |
| `test/referrals/change-plan-charge.test.ts` | 7/7 (fixture con flag en (f)) |
| `test/subscriptions/pricing-golden.test.ts` | verde (flag en 2 planes destino) |
| `subscriptions/change-plan`, `referral-partners/change-plan-charge`, `referral-partners/qualification-commission`, `referral-partners/preview-parity`, `zero-price-gate`, `charge-on-assign`, `invitations/purchase-closes-access`, `tenancy/iso-03-subs-{branch-tampering,escritura,lecturas}`, `programs/enrollment-lifecycle`, `subscriptions/{bookings-reactivation,dual-subscription,bundle-todos-los-programas}` | verdes sin cambios |

Gates: `tsc --noEmit` 0; `lint:tenant` DISCREPANCIAS 0; `typecheck:tests` sin errores en los archivos tocados.

### Mutation testing (honesto)

17 mutantes definidos, 16 aplicados: 15 MUERTOS y 1 equivalente (sobrevivió); 1 sin correr (M2, subsumido). Restaurando con `git checkout` entre tandas.

| Mutante | Test que lo mata |
|---|---|
| M1 `auraSupported: true` en changePlanNow | (8) AURA ignorada |
| M3 base del candidato sin netear el crédito | (1)(2)(3)(4b)(5b)(8) |
| M4 crédito también con override | (6) y el de vínculo con override |
| M6 sin materializar el vínculo | los 2 tests de vínculo que nace |
| M7 sin aviso al invitador | "invitación en ventana ... avisa" |
| M8 `won: partnerBenefitCandidate !== null` | (3) (`perdio_vs_aura`) |
| M9 sin gate `planAllowsInvitationDiscount` en el flip | (10b) |
| M10 sin `qualifyReferralOnCharge` | (10) |
| M11 `price_override_amount` = neto post-descuento | (1) |
| M14 preview con `prorationCredit: 0` | (3)(11)-(16) de preview-parity |
| M16 preview: partner siempre del candidato | (12b) (agregado por este mutante: antes sobrevivía) |
| M17 preview: `invitationDiscountCapped: false` | (13) |
| M18 partner también con override (helper) | (6) del diferido y (6) de now |
| M19 schema de respuesta sin `invitationDiscountAmount` | (11)-(17) |
| M20 `priceAfterFilter` sin restar el crédito | 17 tests |
| M5 `chargeCallSite: "assign"` en changePlanNow | **SOBREVIVIÓ: equivalente.** `callSite` solo distingue `"preview"` en `pricing-benefits.ts:111/235`; mismo caso que M20 de 194-16 |
| M2 `prorationCredit: 0` en la llamada de now | no corrido: el efecto (precio sin netear) lo cubren M3/M20 |

## Deviations from Plan

**1. [Alcance] Archivos fuera de `files_modified`.** `schemas.ts` (Pitfall 4: sin las 4 entradas el serializador de `changePlanPreviewSchema` descarta `invitationDiscount*`/`winningDiscount`), `test/subscriptions/pricing-golden.test.ts` (2 planes destino creados por API sin flag) y `test/referrals/preview-parity.test.ts` caso (3) (mismo motivo, patrón de 194-15/16).

**2. [Alcance] El código del preview está en el commit 1.** Task 1 y Task 2 comparten `computeChargeDiscounts` y los mismos hunks de `service.ts` (sin `git add -p` no se pueden separar): el commit 1 lleva changePlanNow + preview + tipos/schema; los commits 2 y 3 los tests de paridad.

**3. [Diseño] Parámetros del helper en vez de variante.** `auraSupported` y `prorationCredit` son opcionales del helper existente (el plan hablaba de `auraSupported: false`). Cumple "una llamada por charge-path y su preview".

**4. [Observación] El "mantener vencimiento" del admin hoy manda la diferencia como precio personalizado.** Con D-20 esa diferencia es el precio final: el preview de este plan NO la conoce (asume regular, sin override), por lo que el admin que precarga el monto del preview en ese modo sigue usando su propia diferencia; 194-23 no debe pisarla con `netAmount`.

## Known Stubs

None.

## Threat Flags

None. T-194-57 (composición partner + invitación) mitigada: un solo descuento por monto + (f2) explícito + mutantes M8/M18; T-194-58 (preview ≠ cobro) mitigada: mismo helper, 8 casos de paridad y mutantes M14/M16/M17/M19.

## Para planes siguientes

- **194-18 (`renewSubscription`):** replicar con el mismo helper (`chargeCallSite` suma `"renew"`; `auraSupported` según el path; base heredada de renovación NO es un descuento sobre la lista, D-22). `computePriceWithReferralDiscount` y `qualifyReferralOnCharge` (sin gate) quedan vivos solo para renew: eliminarlos al cablearla. Guard de plan Invitación en `getRenewalPreview` (lección tras 194-06). Los planes destino creados por API en tests de renovación necesitan `allowsInvitationDiscount: true`.
- **194-23 (admin):** consumir `invitationDiscountPercent/Amount/Capped` y `winningDiscount` de `change-plan-preview` además del PoS; ver Deviation 4 sobre el modo "mantener vencimiento".

## Lecciones

- Los planes `createPlan` sin `classesPerWeek: undefined` prorratean por CLASES: con la sub sin usar el remanente es el valor entero (no la mitad por días). Los tests de preview-parity derivan los números de `preview.proration.remainingValue` en vez de asumir 50%.
- Un mutante que rompe el preview entero (`prorationCredit: 0`) enmascara a los demás: aplicar cada mutante del preview solo o con otro que no comparta tests (M16/M17/M19 hubo que correrlos de a uno).
- Mutantes que comparten líneas (p. ej. M1 y M5 sobre el mismo bloque, M16 y M17) no se pueden aplicar juntos: el script de mutación con aserción de unicidad aborta a mitad y deja aplicado solo el primero (cuidado al interpretar la tanda).

## Self-Check: PASSED

- Commits `0a31b37a9`, `f758302b1`, `af2bb5632`: FOUND
- `grep -n "auraSupported: false" service.ts`: 2 líneas de código (preview y now) + comentarios; `grep -c "194: cambia en 194-17"` = 0
- Worktree limpio salvo este SUMMARY
