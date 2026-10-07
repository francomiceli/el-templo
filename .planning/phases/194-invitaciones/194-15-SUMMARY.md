---
phase: 194-invitaciones
plan: 15
subsystem: api
tags: [discounts, arbiter, referrals, aura, partner, invitations, cobros, assignPlan, pricing-preview]
requires:
  - phase: 194-06
    provides: assignPlanInternal, cierre de accesos de invitación (D-07)
  - phase: 194-14
    provides: discount-arbiter.ts, invitation-link.ts, hook AURA por monto
provides:
  - "SubscriptionService.computeChargeDiscounts (privado): ÚNICA llamada del alta (cobro y preview) al árbitro"
  - "discount-arbiter.ts: resolveChargeInvitation, prepareChargeDiscounts, settleChargeDiscounts (+ tipos PreparedChargeDiscounts, ChargeSettlement)"
  - "assignPlan: un solo descuento (AURA | partner | invitación), vínculo de invitación materializado en la tx del cobro, aviso post-commit"
  - "PricingPreview: invitationDiscountPercent/Amount/Capped y winningDiscount; referralDiscount* deprecado con el mismo valor"
affects: [194-16, 194-17, 194-18, 194-23]
tech-stack:
  patterns:
    - "Una función de cableado por charge-path; la lógica (gates, tope, ganador, vínculo) vive en el árbitro"
    - "Candidato SOLO-VÍNCULO: D-20 cierra el descuento pero no el vínculo"
key-files:
  created:
    - el-templo-api/test/invitations/conversion-link.test.ts
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/discount-arbiter.ts
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/src/modules/subscriptions/schemas.ts
    - el-templo-api/test/invitations/discount-arbiter.test.ts
    - el-templo-api/test/invitations/discount-characterization.test.ts
    - el-templo-api/test/referrals/discount-charge.test.ts
    - el-templo-api/test/referrals/preview-parity.test.ts
    - el-templo-api/test/referral-partners/preview-parity.test.ts
    - el-templo-api/test/referrals/qualification.test.ts
    - el-templo-api/test/referrals/activation-notification.test.ts
    - el-templo-api/test/subscriptions/pricing-golden.test.ts
    - el-templo-api/test/subscriptions/member-plans.test.ts
    - el-templo-api/test/tenancy/mod-02-pricing-module-off.test.ts
key-decisions:
  - "El vínculo también nace con override > 0 y con boarding pass (el plan solo lo pedía explícito para override): ambos son la compra paga de un plan con flag y el qualify legacy ya corría en esos cobros. NO nace con prorrateo de fin de mes ni con cobro en $0"
  - "Un beneficio de partner que pierde contra la invitación se consume igual (applied_reason='perdio_vs_aura'), mismo criterio de la 179 D-20 contra AURA"
  - "El flip del vínculo `pending` heredado sigue fuera de la tx (como hoy) pero gateado por planAllowsInvitationDiscount; el precio ya no depende de él (el candidato lo simula)"
requirements-completed: [D-05, D-08, D-10b, D-10c, D-13, D-17, D-20, D-21, D-26, SC-3]
completed: 2026-10-07
---

# Phase 194 Plan 15: assignPlan y getPricingPreview sobre el árbitro Summary

**El alta (`assignPlan`) y su preview (`getPricingPreview`) pasan por UN helper (`computeChargeDiscounts`) que arma candidatos, corre el filter de AURA por monto y aplica un solo descuento (el de mayor monto, empate = invitación/partner y los puntos AURA no se gastan); el vínculo de invitación nace `qualified` dentro de la tx del primer cobro pago de un plan con flag, a nombre del invitador de la invitación más reciente, y el invitador se entera después del commit.**

**VIAJA JUNTO con 194-14, 194-16, 194-17, 194-18 y 194-23** (el árbitro ya cambia plata en producción en el alta; las otras charge-paths y el admin siguen componiendo/mostrando lo viejo hasta esos planes).

## Commits

- `caf27b452` feat(194-15): assignPlan y getPricingPreview sobre el arbitro de descuentos + vinculo al comprar
- `e42d6ed4d` test(194-15): paridad preview-cobro del alta con el arbitro (AURA, partner, tope, vinculo a materializar)
- `45f821454` test(194-15): override y boarding pass excluyen tambien al partner en el alta

## Firma final

```ts
// subscriptions/service.ts (privado)
private async computeChargeDiscounts(params: {
  mode: "charge" | "preview";
  ctx: TenantContext; userId: number; plan: PlanDetail;
  priceTypeRequested: PriceType; moduleInput: Record<string, unknown>;
  override?: { amount: number; reason?: string };
  prorate?: { computed: number };
  prorateToMonthEnd?: boolean;
}): Promise<{
  resolved: ResolvedPlanPrice;
  partnerCandidate: { linkId: number; percent: number } | null; // null con boarding pass
  settlement: ChargeSettlement;
}>
// mode "charge" => callSite "assign", commit true, exclusiveBenefits true (gasta AURA, marca boarding pass)
// mode "preview" => callSite "preview", commit false, exclusiveBenefits false (solo lectura)

// subscriptions/discount-arbiter.ts
resolveChargeInvitation(deps, ctx, input): Promise<InvitationDiscountCandidate | null>  // override => candidato SOLO-VÍNCULO
prepareChargeDiscounts(deps, ctx, input, partnerCandidate): Promise<{ invitation, core, competingDiscountAmount }>
settleChargeDiscounts({ priceAfterFilter, auraApplied, exclusive, prepared }): ChargeSettlement
interface ChargeSettlement {
  finalPrice; winningDiscount: "none"|"aura"|"partner"|"invitation"|"boarding_pass";
  invitationAmount; invitationPercent /* NOMINAL */; invitationCapped;
  partnerWon; partnerAmount; linkToMaterialize: InvitationLinkToMaterialize | null /* null si finalPrice <= 0 */;
}
```

Cómo cablear 194-16/17/18: una llamada al helper equivalente por charge-path (los tres hoy usan `partnerCompetingAmount` + `qualifyReferralOnCharge` + `computePriceWithReferralDiscount`; esos tres quedan para ellos). El plan decía `mode` con efecto: acá lo tiene (callSite/commit/supports del filter).

## Cambios de precio introducidos (antes / después, alta, base 100000)

| Caso | Antes | Después | Decisión |
|---|---|---|---|
| Solo invitación 10% | 90000 | 90000 | (se conserva) |
| AURA 10% + invitación 10% (empate) | 81000, AURA gastada | **90000, AURA NO gastada**, gana invitación | D-08 / D-21 |
| AURA 30% + invitación 10% + partner 10% | 63000 | **70000**, solo AURA | D-21 |
| Partner 20% + invitación 10% | 72000 | **80000**, solo partner | D-21 |
| Partner 15% + invitación 10% | 76500 | **85000**, solo partner | D-21 |
| Override 50000 + invitación | 45000 | **50000** (override = precio final) | D-20 |
| Boarding pass (Zero 70000) + invitación | 63000 | **70000** | D-26a |
| ES: AURA 10% + referido 10% (base 10000) | 8100, AURA gastada | **9000**, AURA no gastada | D-08 |
| Tope AR 5000 con invitación 10% | 90000 (sin tope) | **95000**, crédito `{percent:10, amount:5000}` | D-10c |
| Plan SIN flag + invitación/pending | 90000 | **100000**, sin vínculo ni cualificación | D-10b |
| Compra a +31 días del vencimiento de accesos | (sin vínculo previo) | sin vínculo y sin descuento; a +30 sí | D-13 |

Ningún cambio fuera de D-08/D-10b/D-10c/D-20/D-21/D-26a. El vínculo heredado `qualified` (D-17) sigue descontando igual salvo el tope en dinero (cuando está cargado).

## Anotaciones de caracterización

`grep -c "194: cambia en 194-15"` = 0 (eran 5: (b) (b2) (c) (d) (e)); ahora hay 13 líneas `194-15 D-`. Quedan **6** anotaciones `194: cambia en` (más la línea de la cabecera que describe la convención): 194-16 → (g); 194-17 → (f1) (f2); 194-18 → (i) (i2) (j). El caso (i2) cambió de armado a propósito (el alta ya no compone AURA 10% + referido): ahora usa AURA 30% (5000) que le gana a la invitación, y su expectativa de renovación (63000) sigue siendo la composición vieja que 194-18 debe corregir.

## Tests

| Archivo | Resultado |
|---|---|
| `test/invitations/conversion-link.test.ts` (NUEVO) | 23 verdes: vínculo al comprar (accesos vigentes, canal, invitación más reciente, anulada), ventana D-13 (borde 30/31, configurable), flag D-10b (incl. legacy pending), AURA/partner vs invitación, tope D-10c (+D-17 heredado), override/boarding (+partner), override $0, rollback atómico (spy en `auditLog.write`), prorrateo |
| `test/invitations/discount-arbiter.test.ts` | 70 verdes (+18: `settleChargeDiscounts` 8, `resolveChargeInvitation` 7, `prepareChargeDiscounts` 4) |
| `test/invitations/discount-characterization.test.ts` | 18/18 (5 expectativas cambiadas + fixture con flag) |
| `test/referrals/discount-charge.test.ts` | 6 verdes ((e) pasó a empate AURA/invitación, (e2) AURA 30% gana) |
| `test/referrals/preview-parity.test.ts` | 13 verdes (+6 paridad preview↔cobro del árbitro) |
| `test/referral-partners/preview-parity.test.ts` | 8 verdes (+4 partner vs invitación vs AURA) |
| `qualification`, `activation-notification`, `pricing-golden`, `member-plans`, `mod-02-pricing-module-off`, partners `discount-charge`/`qualification-commission`, `change-plan-charge`, `especial-pass`, `iso-03-subs-lecturas` | verdes tras el fixture del flag y 3 expectativas de golden (D-26a, D-08) |

Gates: `tsc --noEmit` 0; `lint:tenant` DISCREPANCIAS 0; `typecheck:tests` sin errores en los archivos tocados.
Preexistente ajeno: `test/subscriptions/lifecycle.test.ts` "autoExpireDueSubscriptions (cron)" falla de noche (21-24 ART, `todayStr()` UTC) — no tocado.

### Mutation testing (honesto)

21 mutantes aplicados a mano en 6 tandas, restaurados con `git checkout`, TODOS matados (una tanda se invalidó porque otra sesión corrió vitest a la vez y dropeó las DB `eltemplo_test_N`: se repitió).

| Mutante | Test que lo mata |
|---|---|
| `settle`: vínculo con `finalPrice >= 0` | "el vínculo NO se ofrece si el cobro no cobra" (unit) |
| `settle`: core sin anular con `exclusive` | "boarding pass (exclusive)" unit + boarding de conversion-link |
| `settle`: `partnerWon` sin `!auraApplied` | partner-parity (3) y (8) (AURA gana a partner) |
| `settle`: `invitationCapped` sin exigir que ganó | "tope aplicado ... solo si la invitación ganó" |
| `settle`: `invitationPercent` sin exigir que ganó | "AURA aplicó: nadie más descuenta" |
| `settle`: etiqueta invitation -> partner | parity (5)-(8) + unit |
| `resolveChargeInvitation` sin rama solo-vínculo | "override: sin descuento pero con vínculo" + conversion override |
| `linkGatesClosed` sin el prorrateo | candidato it.each prorrateo + conversion prorrateo |
| servicio: qualify legacy sin gate de flag | "legacy `pending` + plan SIN flag" |
| servicio: `isPriceOverride: false` | caracterización (d) |
| servicio: partner también con override | "override con motivo + partner 20%" |
| servicio: sin materializar el vínculo | 13 tests de conversion-link |
| servicio: partner con boarding pass no se anula | "boarding pass + partner 20%" |
| servicio: `exclusiveBenefits` siempre false | boarding pass (conversion + partner) |
| servicio: `commit: true` también en preview | partner-parity (4) "preview SOLO LECTURA" + AURA previews |
| servicio: `referral_discount_percent` con `>= 0` | "AURA 30% gana: referralDiscountPercent null" |
| servicio: preview sin `partnerDiscountPercent` | partner-parity (1)(2)(5) |
| servicio: `referral_discount_amount + 1` | todos los de monto |
| servicio: `auraApplied: false` | caracterización (b2), parity (6), conversion AURA |
| servicio: quitar `qualifyReferralOnCharge` | qualification (a)(d)(e) |
| servicio: aviso al invitador DENTRO de la tx | "si el cobro falla después de crear el vínculo" y el aviso único de "accesos vigentes" (llegaban 2) |

## Deviations from Plan

**1. [Rule 2 - contrato] `schemas.ts` agregado.** `pricingPreviewResponseSchema` descartaba los campos nuevos del body HTTP (mismo Pitfall 4 que ya pasó con referidos y partner): sin las 4 entradas `invitationDiscount*`/`winningDiscount` el admin no los vería. Archivo fuera de `files_modified`.

**2. [Alcance] El código del preview está en el commit 1.** Task 1 y Task 2 comparten `computeChargeDiscounts` y están en los mismos hunks de `service.ts` (sin `git add -p` interactivo no se pueden separar); el commit 1 lleva assign + preview, y el commit 2 los tests de paridad.

**3. [Rule 1 - fixtures] El flag D-10b rompe tests viejos que crean planes por API.** `createPlan` crea con `allowsInvitationDiscount=false`: los planes de `qualification`, `activation-notification`, `pricing-golden` (4 casos), `member-plans` (2), `mod-02-pricing-module-off`, `referrals/preview-parity` y `discount-charge` ahora piden el flag (en producción D-23 lo backfilleó). Además 3 expectativas de `pricing-golden` cambiaron por D-26a/D-08 (combo triple boarding+referral 4500→5000; ES AURA+referral 8100→9000).

**4. [Diseño] Vínculo con override y boarding pass.** Ver key-decisions: el plan solo lo pedía para override; se extendió a boarding pass por paridad con el `qualify` legacy y porque es una compra paga. Un solo lugar (`settleChargeDiscounts` + `resolveChargeInvitation`), cubierto por test y mutantes.

**5. [Rule 1 - caracterización] (i2) re-armado.** Su paso inicial ("AURA 10% + referido 10% → 81000") ya no existe por D-08; se reescribió con AURA 30% y se re-derivó la renovación.

## Para planes siguientes

- **194-16/17/18** reemplazan `partnerCompetingAmount` + `qualifyReferralOnCharge` + `computePriceWithReferralDiscount` por el mismo flujo; `partnerCompetingAmount` y `computePriceWithReferralDiscount` quedan vivos mientras tanto. Sus tests de caracterización ((f1) (f2) (g) (h) (i) (i2) (j)) siguen con planes SIN flag donde no hace falta; al cablear cada path hay que agregar el flag al fixture (el alta de la caracterización ya lo trae en `monthPlan`).
- **194-23 (admin):** consumir `invitationDiscountPercent/Amount/Capped` y `winningDiscount`; `referralDiscount*` queda con el mismo valor (compat) y se retira después.
- **Decisión a confirmar con Franco:** un partner que pierde contra la invitación pierde su beneficio de UNA cuota (se consume `perdio_vs_aura`); igual que contra AURA en la 179.
- El `qualifyReferralOnCharge` del `pending` heredado sigue fuera de la tx del cobro (preexistente): si el cobro falla después, el vínculo quedó `qualified`.

## Lecciones

- `createPlan` (helper de API) crea con el flag en `false`: todo test de descuento de referido por assign/preview necesita `allowsInvitationDiscount: true`.
- La respuesta del preview pasa por `pricingPreviewResponseSchema`: cada campo nuevo del servicio necesita su entrada en `schemas.ts` o el serializador lo borra en silencio.
- Los mutantes que tocan el mismo bloque (p. ej. gate de flag y quitar el `qualify`) no se pueden aplicar juntos: el segundo no encuentra su texto. El script de mutación con aserción de unicidad lo detecta.
- Otra sesión corriendo vitest (`et-195-seo`) dropea las DB `eltemplo_test_N` en medio de la corrida propia ("Unknown database"): tests que pasan en 1-5 ms con errores `ER_BAD_DB_ERROR` = corrida invalidada, repetir.
- `vi.spyOn(auditLog, "write").mockRejectedValueOnce(...)` es una forma barata de probar atomicidad: la auditoría es lo último de la tx del alta.

## Known Stubs

None.

## Threat Flags

None. T-194-52 (un solo descuento + caracterización), T-194-53 (vínculo solo con cobro pago, en la tx), T-194-54 (mismo helper con `mode` + tests de paridad) y T-194-55 (`referral_credits` con % nominal y monto recortado) cubiertos por test y mutación.
