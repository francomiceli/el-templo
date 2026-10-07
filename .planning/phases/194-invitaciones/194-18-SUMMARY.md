---
phase: 194-invitaciones
plan: 18
subsystem: api
tags: [discounts, arbiter, referrals, partner, invitations, cobros, renewSubscription, renewal-preview, D-22]
requires:
  - phase: 194-15
    provides: computeChargeDiscounts, settleChargeDiscounts, materializeSettlementLink
  - phase: 194-16
    provides: settlementColumns, chargeCallSite
  - phase: 194-17
    provides: auraSupported, prorationCredit, priceAfterFilter
provides:
  - "renewSubscription sobre el árbitro: partner e invitación compiten por MONTO y se aplica UNO (empate = invitación), con tope en dinero, vínculo materializado en la tx y aviso post-commit; sin AURA; override y prorrateo = precio final"
  - "getRenewalPreview con MONTOS (basePrice, invitationDiscount*, partnerDiscount*, winningDiscount, finalPrice) y los inputs opcionales del cobro (startDate, prorateToMonthEnd, priceOverrideAmount/Reason); guard de plan Invitación"
  - "D-22 corregido: la base heredada devuelve referido, partner y AURA (reconstructRenewalBase)"
affects: [194-23]
key-files:
  created:
    - el-templo-api/src/modules/subscriptions/month-end.ts
    - el-templo-api/test/subscriptions/renewal-base.test.ts
  modified:
    - el-templo-api/src/modules/subscriptions/renewal-base.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/src/modules/subscriptions/schemas.ts
    - el-templo-api/src/modules/subscriptions/routes.ts
    - el-templo-api/src/modules/shared/hooks.ts
    - el-templo-api/src/modules/finance/coach-load-routes.ts
    - el-templo-api/test/invitations/discount-arbiter-paths.test.ts
    - el-templo-api/test/invitations/discount-characterization.test.ts
    - el-templo-api/test/referrals/preview-parity.test.ts
    - el-templo-api/test/referrals/discount-charge.test.ts
    - el-templo-api/test/subscriptions/renewal-after-partial-period.test.ts
key-decisions:
  - "D-22 CONFIRMADO (194-02): la base de renovación suma de vuelta referido + partner (montos guardados) y reconstruye el AURA invirtiendo floor(b*pct/100). Si hay dos bases posibles (99999 y 100000 dan ambas 90000 con 10%) se elige la MAYOR: las listas son redondas"
  - "UNA llamada a computeChargeDiscounts para renovación Y su preview: vive en un helper privado resolveRenewalCharge({mode: charge|preview}) que resuelve también base heredada, override, prorrateo y normalización WR-04. Paridad por construcción"
  - "La base de la renovación NO es la lista del plan: computeChargeDiscounts gana el parámetro opcional basePrice (reemplaza a la lista para el árbitro y el filter)"
  - "paymentMethod NO es input del preview: no cambia el precio de una renovación (la normalización por tarjeta depende del priceTypeApplied de la sub y de la regla del tenant)"
requirements-completed: [D-08, D-10c, D-10e, D-20, D-21, D-22, SC-3]
completed: 2026-10-07
---

# Phase 194 Plan 18: árbitro en renewSubscription + getRenewalPreview + corrección D-22 Summary

**La renovación y su preview pasan por el mismo `computeChargeDiscounts` (vía `resolveRenewalCharge`): partner e invitación compiten por monto y se aplica UNO con tope en dinero, el override y el prorrateo son el precio final, la base heredada ya no arrastra promos (D-22) y el preview devuelve los montos del cobro para que el admin deje de multiplicar en el cliente.**

**VIAJA JUNTO con 194-14..194-17 y 194-23 — no publicar la API sin el admin.** El admin (`MemberSubscriptionTab.vue`) todavía multiplica el % en el cliente sobre `renewalPreview.base` y lee `referralDiscountPercent` del pricing-preview: hasta 194-23 muestra precios que ya no coinciden con el cobro. Último plan de cableado: las 4 charge-paths y los 3 previews usan el mismo árbitro.

## Commits

- `b1213cada` feat(194-18): base de renovacion sin promos pegadas (D-22 confirmado)
- `695791083` feat(194-18): renewSubscription y getRenewalPreview sobre el arbitro de descuentos
- `f2ae193bf` test(194-18): paridad preview-cobro de la renovacion con el arbitro y precarga de la PoS del profe
- `3d48230cf` test(194-18): fixtures de renovacion con flag del plan (D-10b) y forma ampliada del preview
- `59cf6dc5f` test(194-18): base negociada (caso Pomilio) en cobro y preview de la renovacion

## Qué cambió en el código

- **D-22** (`renewal-base.ts`): `reconstructRenewalBase(sub, onAuraUnresolved?)` pura. `neto = pricePaid + referralDiscountAmount + partnerDiscountAmount`; con `auraDiscountPercent` se invierte `b - floor(b*pct/100) = neto` (la ventana exacta tiene 1-2 enteros; se elige la mayor; sin solución devuelve el neto y avisa, T-194-62). `resolveRenewalBase` (extraída de `service.ts`) la usa para la sub actual y para el recorrido hacia atrás (`previous_period`), y `findRenewableSubscription` selecciona `partnerDiscountAmount` y `auraDiscountPercent`.
- **`resolveRenewalCharge`** (`service.ts`): ÚNICO lugar donde se resuelve el precio de una renovación. Prorrateo (proporcional editable, tope = mes completo → 400), override con razón (400 sin razón en `charge`, el preview la tolera con una razón de relleno), normalización WR-04 (credit_card→regular con la regla OFF) y UNA llamada a `computeChargeDiscounts({ chargeCallSite: "renew", auraSupported: false, basePrice, override, prorate, prorateToMonthEnd })`. `resolveRenewalStart` (pura) comparte la derivación de `newStartDate` entre cobro y preview.
- **`renewSubscription`**: persiste `pricePaid = settlement.finalPrice` y las columnas con `settlementColumns`; materializa el vínculo con `materializeSettlementLink` dentro de la tx y avisa al invitador post-commit; el flip `pending→qualified` queda gateado por `planAllowsInvitationDiscount(plan) && !prorateToMonthEnd`; el consumo del partner usa `won: settlement.partnerWon`.
- **`getRenewalPreview(ctx, userId, subscriptionId, options?)`**: mismo helper en `mode: "preview"`, con guard de plan Invitación (400, igual que renovar).
- **Eliminado**: `computePriceWithReferralDiscount` y la llamada a `qualifyReferralOnCharge` sin gate de la renovación (el método queda, lo usan las otras 3 paths gateadas). `PricingCallSite` suma `"renew"` (`shared/hooks.ts`).
- **Tamaño de `service.ts`: 8155 -> 8086 líneas (-69).** El primer intento llegó a 8253 (helper + preview + start-date); para bajar se movieron `resolveRenewalBase`, `RenewalBaseSub` y la aritmética pura de fin de mes (`daysBetween`, `computeMonthEndProration`, `computeProratedPrice`, `isMonthEndProratedPeriod`, sin cambios de comportamiento) a `renewal-base.ts` / `month-end.ts`.
- **Ruta**: `GET /members/:userId/subscription/renewal-preview` acepta `startDate`, `prorateToMonthEnd`, `priceOverrideAmount`, `priceOverrideReason` (todos opcionales) y `renewalPreviewSchema` serializa los campos nuevos (Pitfall 4). Misma ruta: el manifiesto no cambia.
- **Coach (PoS)**: `renewAmountFor` (`coach-load-routes.ts`) precarga `preview.finalPrice` (antes `pricePaid`/`base`, que ya no coinciden con el cobro: con D-22 una sub con AURA habría precargado 90000 y cobrado 100000, dejando saldo pendiente) y cae al monto heredado también con `BadRequestError` (sub Invitación: el guard nuevo del preview habría roto el autocompletar con 400).

### Contrato final de `RenewalPreview` (para 194-23)

```ts
interface RenewalPreview {
  subscriptionId: number;
  base: number;                       // base del mes completo SIN promos pegadas (D-22); compat
  source: "inherited" | "previous_period" | "plan_price";
  basePrice: number;                  // precio de ESTA renovación antes de partner/invitación
                                      // (= base sin opciones ni normalización; con override o
                                      // prorrateo es ese monto; con la regla de tarjeta OFF y sub
                                      // heredada en credit_card es el precio regular)
  invitationDiscountPercent: number;  // % NOMINAL si la invitación ganó, si no 0
  invitationDiscountAmount: number;   // monto ya recortado por el tope D-10c
  invitationDiscountCapped: boolean;
  winningDiscount: "none" | "partner" | "invitation"; // AURA/boarding pass no existen acá
  partnerDiscountPercent: number;     // 0 si no ganó
  partnerDiscountAmount: number;      // 0 si no ganó
  finalPrice: number;                 // == price_paid de renewSubscription con los mismos inputs
}
// RenewalPreviewOptions (querystring, todos opcionales):
//   startDate (YYYY-MM-DD), prorateToMonthEnd, priceOverrideAmount (>=0; con prorrateo = el
//   proporcional editado), priceOverrideReason (el preview la tolera vacía).
```

Referencias: `PricingPreview` (194-15) y `ChangePlanPreview` (194-17) comparten `invitationDiscount*`, `winningDiscount`; `referralDiscount*` sigue como alias deprecado en esos dos hasta 194-23. **194-23:** en "mantener vencimiento" del cambio de plan el admin usa su propia diferencia (194-17); para la renovación consumir `finalPrice`/`invitationDiscount*`/`partnerDiscount*` y pasar `priceOverrideAmount` / `prorateToMonthEnd` + `startDate` al preview en vez de calcular `renewalReferralAmount`/`renewalChargeBase` en el cliente (`MemberSubscriptionTab.vue ~1080-1140`).

## Cambios de precio de la renovación (lista 100000, 10% por vínculo)

| Caso | Antes | Después | Decisión |
|---|---|---|---|
| Partner 20% + invitación 10% | 72000 (partner 20000 + referido 8000 sobre 80000) | **80000**, solo partner | D-21 |
| Partner 5% + invitación 10% | componían (85500) | **90000**, gana la invitación; el partner se consume `perdio_vs_aura` | D-21 |
| Override con motivo + partner/invitación | el partner y el referido descontaban ENCIMA del override | **override = precio final**, el beneficio de partner no se consume, el vínculo nace igual | D-20 |
| Plan SIN flag + vínculo | 90000 y cualificaba el `pending` | **100000**, no cualifica; el partner SÍ descuenta (el flag es solo de la invitación) | D-10b |
| Tope en dinero AR 5000 | 90000 | **95000**, crédito `{percent:10, amount:5000}` | D-10c |
| Alta con AURA 10% (90000) -> renovar | 90000 para siempre | **100000** | D-22 |
| Alta con AURA 30% + vínculo (70000) -> renovar | 63000 (referido sobre la base ya rebajada) | **90000** (base 100000, solo la invitación) | D-22 |
| Alta con partner 20% (80000) -> renovar | 80000 para siempre | **100000** | D-22 |

Se conserva: prorrateo a fin de mes = precio final sin descuentos (ya era así: el partner y el referido ya estaban excluidos), invitación sola 10% (90000), base negociada heredada (75000 -> 67500 con el vínculo), normalización WR-04, subs ya creadas intactas (D-08: test sobre una sub histórica compuesta 81000 que no se toca). Ningún cambio fuera de D-08/D-10b/D-10c/D-20/D-21/D-22. Impacto en prod de D-22: 0 socios (verificado en 194-02).

## Anotaciones de caracterización

`grep -c "194: cambia en" discount-characterization.test.ts` = **0** (también se reescribió la línea de cabecera que describía la convención). (i), (i2), (j) pasaron a `// 194-18 D-22`; (h) conserva el precio (90000) y su `toEqual` del preview pasó a la forma ampliada.

## Tests

| Archivo | Resultado |
|---|---|
| `test/subscriptions/renewal-base.test.ts` | nuevo, 12 casos (tabla + barrido exhaustivo de la inversión AURA) |
| `test/invitations/discount-arbiter-paths.test.ts` | 64 verdes (+20 `describe renewSubscription`: invitación sola, partner gana/pierde, tope, tope vs partner, sin flag (+ partner sí), `pending` sin/con flag, override, override sin razón, prorrateo, sub histórica compuesta (D-08/D-22) con y sin vínculo, base negociada, `amountReceived` = neto, cobro fallido sin sub, sin descuento, 3 de vínculo que nace con la renovación) |
| `test/referrals/preview-parity.test.ts` | 37 verdes (+16: estándar, compat/idempotente/sin escrituras, partner gana/pierde, tope, override, prorrateo (+ 400 sobre el mes), recargo de tarjeta ON/OFF, vínculo a materializar, D-22, base negociada, guard Invitación, precarga del profe (2)) |
| `test/invitations/discount-characterization.test.ts` | 18/18 |
| `test/subscriptions/renewal.test.ts`, `renewal-after-partial-period` (7), `renewal-proration-month-end`, `renewal-schedules`, `especial-pass`, `referrals/discount-charge` (6), `referral-partners/{qualification-commission,preview-parity,change-plan-charge}`, `finance/coach-load`, `tenancy/iso-03-{subs-lecturas,cobertura-subs-sched}` | verdes (los 2 fixtures que rompieron se actualizaron, ver Deviations) |

Gates: `tsc --noEmit` 0; `lint:tenant` DISCREPANCIAS 0; `typecheck:tests` sin errores en los archivos tocados.

### Mutation testing (honesto)

17 mutantes aplicados, 17 muertos; 2 equivalentes no aplicados. Los que comparten flujo se corrieron aparte cuando se enmascaraban.

| Mutante | Test que lo mata |
|---|---|
| M1 sin add-back de partner en la base | "partner 15%", "compuesto partner + referido" (unit), (j) |
| M2 sin reconstruir AURA | 7 unit de AURA, (i), (i2) |
| M3 `won: partnerBenefitCandidate !== null` | (3) `perdio_vs_aura` |
| M4 override ignorado por el helper | (6) |
| M6 sin materializar el vínculo en renew | los 3 de "vínculo que nace con la renovación" |
| M8 `qualifyReferralOnCharge` sin gate de flag | (5b) |
| M9 helper sin `prorateToMonthEnd` | (7) y "prorrateo: ni descuento ni vínculo" |
| M10 sin normalización WR-04 | (23) |
| M11 `basePrice` del preview = base heredada | (21) y (23) |
| M13 sin guard de plan Invitación en el preview | (26) |
| M14 `partnerDiscountPercent` del preview siempre del candidato | (19b) |
| M15 schema de respuesta sin `finalPrice` | 11 tests de preview-parity |
| M16 coach-load precarga `pricePaid`/`base` | (27) |
| M17 coach-load sin catch de `BadRequestError` | (28) (se corrió SIN M13: con el guard sacado no hay 400 que atrapar) |
| M18 helper ignora `basePrice` (usa lista) | (8c) base negociada (agregado por este mutante: antes sobrevivía) |
| M19 override sin razón aceptado en `charge` | (6b) |
| M21 preview con `invitationDiscountCapped: false` fijo | (20) (la primera versión del mutante pegó en el preview del cambio inmediato: el ancla se corrigió) |
| M5 `auraSupported: true` | **Equivalente, no aplicado**: la renovación nunca manda `auraSpend` en `moduleInput` |
| M12 preview en `mode: "charge"` | **Equivalente, no aplicado**: con `moduleInput: {}` el filter no gasta ni marca nada |

## Deviations from Plan

**1. [Alcance] Archivos fuera de `files_modified`.** `month-end.ts` (nuevo) y `renewal-base.ts` (ganó `resolveRenewalBase`) para que `service.ts` BAJE de tamaño; `shared/hooks.ts` (`"renew"` en `PricingCallSite`); `finance/coach-load-routes.ts` (precarga de la PoS del profe, ver arriba: sin eso D-22 dejaba saldos pendientes y el guard nuevo rompía el autocompletar); `test/referrals/discount-charge.test.ts` (3 planes de renovación sin flag: D-10b, mismo patrón de 194-15/16/17) y `test/subscriptions/renewal-after-partial-period.test.ts` (3 `toEqual` del preview pasaron a `toMatchObject` por la forma ampliada).

**2. [Diseño] Una sola llamada compartida, no dos.** El plan pedía una llamada en renew y otra en su preview; `resolveRenewalCharge` las unifica (un solo call site de `computeChargeDiscounts` para ambos, `mode` distingue). `grep -c "computeChargeDiscounts"` = 11 (definición + 6 call sites + comentarios).

**3. [Diseño] `paymentMethod` no es input del preview.** El plan lo listaba entre los inputs que cambian el precio; en `renewSubscription` el medio de pago solo va al registro del cobro. La "regla de recargo con tarjeta" se resuelve por el `priceTypeApplied` de la sub y la regla del tenant (`resolvePriceType`), que el preview ya aplica (test (23)/(23b) ON/OFF).

**4. [Diseño] D-22: la base MAYOR, no la "mínima".** El plan decía "b mínima" pero su propio caso ("pricePaid 90000, AURA 10% -> 100000") exige la mayor (99999 y 100000 dan ambos 90000). Se eligió la mayor (listas redondas, diferencia máxima 1 unidad); documentado en el docblock y fijado por el barrido unitario.

**5. [Diseño] `basePrice` del preview ≠ `base` en general.** El plan decía `basePrice (= base)`: sin opciones ni normalización coinciden; con override, prorrateo o normalización es el precio de ESA renovación antes de descuentos (lo que el admin necesita para `final = basePrice - descuento`). `base` queda intacto por compat.

**6. [D-10b] La renovación hereda el flag del plan.** Antes de este plan renovar descontaba y cualificaba sin mirar el flag; ahora igual que el resto (decisión D-10b; los planes de producción se backfillearon con el flag en 1, D-23).

## Known Stubs

None.

## Threat Flags

None. T-194-59 (acumulación encubierta vía base heredada) mitigada: `reconstructRenewalBase` + mutantes M1/M2; T-194-60 (preview ≠ cobro) mitigada: mismo helper, 16 casos de paridad y mutantes M10/M11/M14/M15/M21; T-194-61 (retroactividad) mitigada: test (8) sobre una sub histórica que no se toca; T-194-62 (base mal reconstruida) mitigada: búsqueda exacta acotada, barrido unitario y fail-safe sin solución.

## Lecciones

- Un comando de Bash de más de 600 s se manda solo a segundo plano: con 4 archivos de integración (~600 s+) pasó. Mantener ≤3 archivos por corrida (`timeout 540`) o esperar el proceso con `timeout N tail --pid=<pid> -f /dev/null` (un solo bloqueo, no un loop) sin lanzar otro vitest.
- El mismo bloque de código se repite en varias charge-paths (vínculo, `won`, `invitationDiscountCapped`): los mutantes necesitan un ancla única (la primera versión de M21 mutó el preview del cambio inmediato y "mató" un test de 194-17 por error). Verificar siempre QUÉ test muere.
- Mutantes que se interponen (M13 saca el 400 que M17 necesita atrapar): correrlos por separado.
- Los consumidores internos de un preview (`renewAmountFor` del profe) también cambian de contrato: grepear `getRenewalPreview` y probar el camino de error nuevo (400 de sub Invitación).
- `base negociada` (75000 en vez de lista) es el único caso que distingue "usa la base heredada" de "usa la lista": sin él el mutante M18 sobrevivía.
- Ningún test de integración de la fase debe asumir que la base de renovación es la lista; derivarla de la sub (UPDATE de `price_paid` sobre la sub vigente con `tenant_id`) permite simular subs históricas compuestas sin API.

## Self-Check: PASSED

- Commits `b1213cada`, `695791083`, `f2ae193bf`, `3d48230cf`, `59cf6dc5f`: FOUND
- `grep -c "194: cambia en" test/invitations/discount-characterization.test.ts` = 0; `computePriceWithReferralDiscount` sin ocurrencias en `src`; `service.ts` 8086 líneas (< 8155)
- Worktree limpio salvo este SUMMARY
