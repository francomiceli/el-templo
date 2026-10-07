---
phase: 194-invitaciones
plan: 16
subsystem: api
tags: [discounts, arbiter, referrals, aura, partner, invitations, cobros, changePlanAfterCurrent]
requires:
  - phase: 194-15
    provides: computeChargeDiscounts, settleChargeDiscounts, materializeInvitationLink cableado en el alta
provides:
  - "changePlanAfterCurrent: UNA llamada a computeChargeDiscounts (mode charge, chargeCallSite change-after-current): un solo descuento, tope en dinero, vínculo en la tx y aviso post-commit"
  - "discount-arbiter.ts: settlementColumns (pura) = columnas referral_*/partner_* de la sub, compartida por assignPlan y changePlanAfterCurrent"
  - "service.ts: materializeSettlementLink (privado) compartido por assignPlan y changePlanAfterCurrent"
affects: [194-17, 194-18, 194-23]
key-files:
  created:
    - el-templo-api/test/invitations/discount-arbiter-paths.test.ts
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/discount-arbiter.ts
    - el-templo-api/test/invitations/discount-characterization.test.ts
    - el-templo-api/test/referrals/change-plan-charge.test.ts
    - el-templo-api/test/subscriptions/pricing-golden.test.ts
key-decisions:
  - "El helper computeChargeDiscounts gana un parámetro opcional chargeCallSite (assign | change-after-current) en vez de crear una variante: callSite solo cambia extras de salida del módulo AURA, no precios"
  - "La materialización del vínculo se habilita también en el cambio diferido (el plan lo pedía): es raro (un invitado normalmente ya tiene el vínculo desde el alta) pero ocurre si el plan del alta no tenía flag y la compra cae en la ventana D-13"
  - "partnerCompetingAmount quedó sin usos y se eliminó (y el import partnerCompetitor de service.ts)"
requirements-completed: [D-08, D-10b, D-10c, D-20, D-21, SC-3]
completed: 2026-10-07
---

# Phase 194 Plan 16: árbitro en changePlanAfterCurrent Summary

**El cambio de plan diferido (`startMode: after_current`) pasa por el mismo `computeChargeDiscounts` que el alta: AURA, partner e invitación compiten y se aplica UNO (mayor monto, empate = invitación/partner y los puntos AURA no se gastan), con tope en dinero, piso duro por flag/categoría del plan destino, vínculo de invitación materializado dentro de la tx y aviso al invitador después del commit.**

**VIAJA JUNTO con 194-14..194-18 y 194-23** (el árbitro ya cambia plata en producción en el alta y en el cambio diferido; `changePlanNow` y `renewSubscription` siguen componiendo hasta 194-17/18).

## Commits

- `1a63f9fe0` feat(194-16): changePlanAfterCurrent sobre el arbitro de descuentos + vinculo al comprar
- `660f21025` test(194-16): auraSpend invalido o sin saldo en el cambio diferido falla sin dejar sub ni credito

## Qué cambió en el código

- `changePlanAfterCurrent`: se reemplazaron el candidato de partner, el `resolvePlanPrice` propio, el bloque "partner post-filter" y el bloque "referido encima" por UNA llamada a `computeChargeDiscounts({ mode: "charge", chargeCallSite: "change-after-current", ... })`. Persiste `pricePaid = settlement.finalPrice` y las columnas vía `settlementColumns`; el `qualifyReferralOnCharge` del vínculo `pending` heredado queda gateado por `planAllowsInvitationDiscount(targetPlan) && !prorateToMonthEnd` (D-10b); el vínculo nuevo se crea en la tx (`materializeSettlementLink`) y el aviso va post-commit.
- `service.ts` neto: 93 inserciones / 135 eliminaciones (crece negativo). Para no duplicar entre `assignPlan` y el diferido se extrajo `materializeSettlementLink` y se usó `settlementColumns`; `assignPlan` quedó con el mismo comportamiento (verificado con `conversion-link.test.ts`).
- Se eliminó `partnerCompetingAmount` (sin usos).
- El log `partner: descuento de partner ganó` NO se replicó en el diferido (solo `assignPlan` lo emite).

## Cambios de precio introducidos (cambio diferido, base 100000, salvo indicación)

| Caso | Antes | Después | Decisión |
|---|---|---|---|
| AURA 10% + invitación 10% (empate) | AURA gastada, componían (81000 sobre 100000; 162000 sobre 200000) | **90000 (180000 sobre 200000)**, gana la invitación, AURA NO gastada | D-08 / D-21 |
| Partner 20% + invitación 10% | 72000 (componían) | **80000**, solo partner | D-21 |
| Boarding pass + invitación | 5400 (sobre 12000) | **6000** (precio Zero), la invitación no se acumula | D-26a |
| Plan destino SIN flag + vínculo | descontaba 10% | **precio de lista**, no cualifica | D-10b |
| Tope AR 5000 con invitación 10% | 90000 | **95000**, crédito `{percent:10, amount:5000}` | D-10c |
| Override con motivo + invitación/partner | el referido componía | **el override es el precio final** | D-20 |

Ningún cambio fuera de D-08/D-10b/D-10c/D-20/D-21/D-26a. Se conserva: solo invitación 10% sobre plan con flag (90000), AURA que gana por monto (80000 con tier 20%), `pending` heredado que cualifica en el mismo cobro (plan con flag).

## Anotaciones de caracterización

`grep -c "194: cambia en 194-16"` = 0 (antes 1: el caso (g)); hay 2 líneas `194-16 D-` (comentario del título y del cuerpo). Quedan 5 anotaciones `194: cambia en` + la línea de cabecera que describe la convención: 194-17 → (f1) (f2); 194-18 → (i) (i2) (j). Caso (g): ahora 180000 sobre plan destino de 200000, `referralDiscountAmount` 20000 (sobre la LISTA), AURA no gastada (saldo 1000 intacto).

## Tests

| Archivo | Resultado |
|---|---|
| `test/invitations/discount-arbiter-paths.test.ts` (NUEVO) | 26 verdes: 12 de cobro heredado/AURA/tope/piso duro/partner/override/boarding/pending, 5 de vínculo que nace con el diferido (ventana, AURA 30%, sin flag, override, $0), 2 de `auraSpend` inválido, 4 puros de `settlementColumns` |
| `test/invitations/discount-characterization.test.ts` | 18/18 ((g) con la expectativa nueva) |
| `test/referrals/change-plan-charge.test.ts` | verde tras fixture de flag (a)(b)(c)(e) + (e) pasó a empate AURA/invitación |
| `test/subscriptions/pricing-golden.test.ts` | verde tras flag en el plan destino del referral y boarding pass (D-26a: 5400 -> 6000) |
| `test/referral-partners/change-plan-charge.test.ts`, `referral-partners/qualification-commission.test.ts`, `subscriptions/change-plan.test.ts`, `zero-price-gate`, `charge-on-assign`, `invitations/purchase-closes-access`, `invitations/conversion-link`, `tenancy/iso-03-subs-branch-tampering`, `iso-03-subs-escritura` | verdes sin cambios |

Gates: `tsc --noEmit` 0; `lint:tenant` DISCREPANCIAS 0; `typecheck:tests` sin errores en los archivos tocados.

### Mutation testing (honesto)

13 mutantes definidos, 11 aplicados y MUERTOS en 3 tandas (restaurando con `git checkout` sobre el commit entre tandas), 1 equivalente (aplicado, sobrevivió) y 1 sin correr.

| Mutante | Test que lo mata |
|---|---|
| diferido con `mode: "preview"` (no gasta AURA) | (2) (3b) (4b) (8) |
| sin aviso al invitador post-commit | "invitación en ventana ... avisa" |
| ignorar `override` | (7) y "override ... el vínculo nace igual" y "$0" |
| `settlementColumns(settlement, null)` (partner sin %) | (6) |
| sin gate `planAllowsInvitationDiscount` en el `qualify` | (10b) |
| `won: false` al consumir el partner | (6) (`aplicado`) |
| `pricePaid = resolved.price` (ignorar al árbitro) | (1) (4) (6) (6b) (10) y vínculo |
| quitar `qualifyReferralOnCharge` | (10) |
| no materializar el vínculo en el diferido | 3 tests de vínculo + (1)/(10) |
| `settlementColumns`: partner % = 0 | unit "partner ganador" y (6) |
| `settlementColumns`: % de invitación = monto | (1) (4) y unit "invitación ganadora" |
| `callSite: "preview"` en cobros (M20) | **SOBREVIVIÓ: equivalente.** `callSite` solo agrega salidas del módulo AURA en el preview (`pricing-benefits.ts:111/235`); las validaciones y el gasto dependen de `commit`, no de `callSite`. Se agregó (8b) para fijar el comportamiento de commit |
| `materializeSettlementLink` devolviendo `null` (M16, assign sin aviso) | **no corrido**: compartido con el diferido, que ya mata M6 y los tests de vínculo; el aviso de assign lo cubre `conversion-link.test.ts` desde 194-15 |

## Deviations from Plan

**1. [Alcance] Archivos fuera de `files_modified`.** `discount-arbiter.ts` (`settlementColumns`), `test/referrals/change-plan-charge.test.ts` y `test/subscriptions/pricing-golden.test.ts`: los dos tests tienen planes destino creados por la API (flag en `false`) y expectativas viejas por D-08/D-26a (mismo patrón que 194-15). Documentado en el commit.

**2. [Calidad] Refactor mínimo de `assignPlan`.** Para que el diferido no duplique 12 líneas de materialización + 10 de columnas, se extrajo `materializeSettlementLink` / `settlementColumns` y `assignPlan` pasó a usarlos (comportamiento idéntico, suite de 194-15 verde).

**3. [Observación] Con empate y tier válido el saldo AURA no se valida.** Con invitación 10% y `auraSpend: 1000` sin saldo, el cobro responde 201 a 90000 (gana el core antes del `spend`): es consecuencia directa de 194-14/D-21 ("AURA no se aplica NI se gasta"), no un cambio de 194-16. Con tier inválido o con AURA que GANA y sin saldo sí hay 4xx (test (8b)).

## Known Stubs

None.

## Threat Flags

None. T-194-56 mitigada: mismo helper que el alta, caso (g) actualizado explícitamente, mutantes del cableado muertos.

## Para planes siguientes

- 194-17 (`changePlanNow`) y 194-18 (`renewSubscription`): replicar con `computeChargeDiscounts` (el `chargeCallSite` ya soporta `change-after-current`; sumar `change-now`/`renew` al tipo si hace falta; recordar `supports.discounts=false` en `changePlanNow`, que hoy NO permite AURA, y que su `prorate` es el neto post-prorrateo). Reusar `materializeSettlementLink` y `settlementColumns`.
- Los planes destino creados por API en tests de cambio de plan/renovación necesitan `allowsInvitationDiscount: true`.
- `let x = null as number | null` es necesario para variables asignadas dentro del callback de `db.transaction` (TS angosta a `null`).

## Lecciones

- `callSite` en el filter de pricing es solo informativo para las salidas de preview; no intentar "probarlo" con precios.
- Un test de aviso/atomicidad del vínculo en el diferido no tiene un punto de falla natural después de la materialización (es lo último de la tx); la atomicidad queda cubierta por el patrón de 194-15 (`auditLog.write` en el alta).

## Self-Check: PASSED

- `el-templo-api/test/invitations/discount-arbiter-paths.test.ts`: FOUND
- Commits `1a63f9fe0`, `660f21025`: FOUND
- `computeChargeDiscounts` en service.ts: 6 apariciones (>= 4); `194: cambia en 194-16`: 0; `194-16 D-`: 2
