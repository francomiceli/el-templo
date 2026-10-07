---
phase: 194-invitaciones
plan: 14
subsystem: api
tags: [discounts, arbiter, referrals, aura, partner, invitations, cobros]
requires:
  - phase: 194-02
    provides: caracterización de descuentos (18 casos)
  - phase: 194-05
    provides: planAllowsInvitationDiscount
  - phase: 194-07
    provides: getInvitationSettings, getDiscountCapAmount
  - phase: 194-13
    provides: conversión de invitación (no se toca)
provides:
  - "subscriptions/discount-arbiter.ts: resolveInvitationDiscountCandidate, pickCoreCompetitor, applyArbiterResult, partnerCompetitor, capInvitationAmount, discountAmountOf"
  - "ReferralService.computeInvitationDiscountPercent (% por lado, simulateInvitationLink)"
  - "referrals/invitation-link.ts: findLinkableInvitation, materializeInvitationLink, notifyReferralLinkActivated, notifyInviterLinkActivated"
  - "PricingAdjustCtx.competingDiscountAmount (AURA compara por MONTO)"
affects: [194-15, 194-16, 194-17, 194-18, 194-19, 194-23]
tech-stack:
  patterns:
    - "Árbitro con funciones chicas puras + una función de lectura con deps inyectadas"
    - "Una sola implementación del % por lado; la firma pública vieja delega"
key-files:
  created:
    - el-templo-api/src/modules/subscriptions/discount-arbiter.ts
    - el-templo-api/src/modules/referrals/invitation-link.ts
    - el-templo-api/test/invitations/discount-arbiter.test.ts
  modified:
    - el-templo-api/src/modules/referrals/service.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/pricing.ts
    - el-templo-api/src/modules/shared/hooks.ts
    - el-templo-api/src/modules/aura/pricing-benefits.ts
    - el-templo-api/test/referrals/discount-computation.test.ts
    - el-templo-api/test/tenancy/mod-02-hooks.test.ts
key-decisions:
  - "Un cobro no cambia de precio en este plan: el árbitro entrega el núcleo y NADIE lo llama todavía (cableado = 194-15..18)"
  - "El vínculo se ofrece (linkToMaterialize) aunque el % hoy sea 0 (invitador sin membresía): se crea al comprar igual"
  - "mode charge|preview eliminado: preview y cobro comparten la misma función (paridad)"
requirements-completed: [D-05, D-08, D-09, D-10b, D-10c, D-10e, D-13, D-17, D-20, D-21, D-26, SC-3]
duration: ~3h (la mayor parte esperando provisioning de DB de test)
completed: 2026-10-06
---

# Phase 194 Plan 14: Núcleo del árbitro de descuentos Summary

**Un único módulo (`discount-arbiter.ts`) decide el descuento por invitación de un cobro con todos los gates y el tope en dinero, el % se separa por lado del vínculo sin cambiar el resultado con 10/10, el vínculo de descuento se puede materializar al comprar de forma idempotente y AURA pasa a compararse contra el competidor core por MONTO (empate = gana el core y no se gastan puntos).**

**194-14..194-18 + 194-23 (admin) VIAJAN JUNTOS en el mismo tren.**

## Commits

- `df8262d1f` feat(194-14): % por lado del vinculo y materializacion del vinculo al comprar (D-05, D-10e, D-26c)
- `a80bec5c6` feat(194-14): arbitro de descuentos por monto y hook AURA por monto (D-08, D-21, D-10c)

## Cambios de precio introducidos

**Ninguno.** Las 18 expectativas de `discount-characterization.test.ts` pasan SIN tocarse (las 12 anotaciones `194: cambia en ...` siguen pendientes para 194-15..18). Lo único que cambia de comportamiento visible es el criterio de AURA vs partner: de `partner% >= tier%` a `partner$ >= floor(base*tier%/100)`. Con la misma base es equivalente salvo empates por redondeo (`floor`) en bases chicas. El % por lado con 10/10 da el mismo número que antes (D-10e); solo se diferencia si gestión cambia `invitations.invitee_percent` (decisión D-10e, no cambio imprevisto). Nada se calcula con el árbitro en producción todavía: `resolveInvitationDiscountCandidate`, `pickCoreCompetitor`, `applyArbiterResult` y `materializeInvitationLink` no tienen llamadores fuera de los tests.

## Contrato final para 194-15..194-18

```ts
// subscriptions/discount-arbiter.ts
interface DiscountArbiterDeps { db; log; referralService: ReferralService }
type ArbiterPlan = Pick<PlanDetail, "planCategory" | "isTrial" | "allowsInvitationDiscount" | "country">
interface InvitationCandidateInput {
  userId; plan: ArbiterPlan; basePrice; isPriceOverride; boardingPassApplied;
  prorateToMonthEnd: boolean | undefined;
}
interface InvitationDiscountCandidate {
  percent; nominalAmount; amount; capApplied;
  linkToMaterialize: { invitationId; inviterId; channel } | null;
}
resolveInvitationDiscountCandidate(deps, ctx, input): Promise<InvitationDiscountCandidate | null>
partnerCompetitor(candidate: { percent } | null, basePrice): { percent, amount } | null
pickCoreCompetitor(partner, invitation): { kind: "partner" | "invitation"; amount } | null   // empate -> invitación; invitación con amount 0 no compite
applyArbiterResult({ priceAfterFilter, auraApplied, core }): { invitationAmount; partnerAmount; finalPrice }
capInvitationAmount(nominal, cap | null); discountAmountOf(base, percent)
// referrals/invitation-link.ts
findLinkableInvitation(exec, ctx, payerId, lateWindowDays); materializeInvitationLink(exec, ctx, log, link, payerId): Promise<boolean>
notifyInviterLinkActivated(db, log, ctx, inviterId, payerId)   // best-effort, DESPUÉS del commit
```

Cómo cablear una charge-path (orden obligatorio, también en el docblock del árbitro):

1. Antes del filter: `invitation = resolveInvitationDiscountCandidate(...)` y `partner = partnerCompetitor(partnerBenefitCandidate, basePricePreFilter)`; `core = pickCoreCompetitor(partner, invitation)`. Pasar `competingDiscountAmount: core?.amount ?? null` a `resolvePlanPrice`.
2. Después del filter: `applyArbiterResult({ priceAfterFilter: resolved.price, auraApplied: auraDiscountPercent !== null, core: resolved.exclusive ? null : core })`.
3. `referral_credits.percent` = `invitation.percent` NOMINAL y `amount` = el monto recortado por el tope (`invitationAmount`).
4. Si `invitation?.linkToMaterialize` y el cobro cobra (`pricePaid > 0`): `materializeInvitationLink(tx, ...)` dentro de la tx del cobro (aunque la invitación haya perdido contra AURA/partner: el vínculo sirve para los cobros siguientes), y `notifyInviterLinkActivated` DESPUÉS del commit. Esto reemplaza `qualifyReferralOnCharge` + `computePriceWithReferralDiscount` en esa charge-path (el flip `pending -> qualified` sigue siendo de `qualifyFirstPayment`).
5. Para el partner: `partnerBenefitWon`, `consumePartnerBenefitAfterCharge` y el log siguen igual; el ganador core pasa a decidirse con `core.kind`.

Notas:
- `boardingPassApplied` existe como gate del candidato, pero antes del filter el boarding pass no se conoce (vive en `moduleInput`, opaco al core): el llamador pasa `false` y deja que `resolved.exclusive` anule el core después (igual que el partner hoy). El gate queda cubierto por test para los llamadores que sí lo sepan.
- `partnerCompetingAmount` (privado en `SubscriptionService`) hoy calcula el monto del partner para los 3 call sites; 194-15..18 lo reemplazan por `core?.amount`.
- El candidato simula el vínculo `pending` y el vínculo por crear en AMBOS contextos (preview y cobro): hoy el cobro califica el `pending` ANTES de calcular y el preview lo simula, y el resultado es el mismo número.

## Tests

| Archivo | Resultado |
|---|---|
| `test/invitations/discount-arbiter.test.ts` | 52 verdes (10 vínculo/materialización, 8 pickCore, 4 apply, 2 cap/fórmula, 19 candidato, 9 hook AURA commit+preview) |
| `test/referrals/discount-computation.test.ts` | 14 verdes (5 nuevos por lado: 10/10, 15/10, tope con lado invitado, simulate x2) |
| `test/tenancy/mod-02-hooks.test.ts` + `mod-02-pricing-module-off.test.ts` | verdes (módulo AURA apagado sin cambios) |
| `test/invitations/discount-characterization.test.ts` | 18/18 SIN cambiar ninguna expectativa |
| `test/referral-partners/{discount-charge,preview-parity,change-plan-charge}.test.ts` | 23/23 verdes (partner vs AURA y paridad preview/cobro) |

Gates: `tsc --noEmit` 0; `lint:tenant` DISCREPANCIAS 0; `typecheck:tests` sin errores en los archivos tocados (el `makeCtx` de `mod-02-hooks.test.ts` ya fallaba antes por no traer `competingDiscountPercent`; ahora trae `competingDiscountAmount` y ese error preexistente desapareció).

### Mutation testing (honesto)

14 mutantes aplicados a mano en 2 tandas, restaurados desde copia, todos MATADOS:

| Mutante | Test que lo mata |
|---|---|
| AURA `>=` -> `>` en `coreCompetitorMatchesTier` | commit y preview "competidor 10000 (empate)" |
| `pickCoreCompetitor` empate `>=` -> `>` | "partner 9000 vs invitación 9000 (empate)" |
| `capInvitationAmount` devuelve nominal con tope | tabla de tope + "tope ES=20000" |
| gate D-20 removido | "precio personalizado (D-20) -> null" |
| gate D-26a removido | "boarding pass (D-26a) -> null" |
| gate base 0: `<= 0` -> `< 0` | "precio base 0 -> null" |
| ventana tardía `>=` -> `>` | "el borde de la ventana ... exactamente 30 días" |
| se quita `simulatePendingQualification` | "vínculo pending ... simula su cualificación" |
| `if (percent <= 0 && link === null)` -> `if (percent <= 0)` | "invitador sin membresía ... vínculo se ofrece" |
| `applyArbiterResult` sin `auraApplied` | "AURA aplicó: ningún core descuenta" |
| `invitation.amount > 0` -> `>= 0` | "invitación con monto 0 no compite" |
| lados invertidos (invitee/perLink) | "15/10" y "tope % con lado invitado" |
| se quita la guarda de simulate duplicado | "simulateInvitationLink se ignora..." |
| `materializeInvitationLink` relanza el duplicado | "es idempotente" |

## Deviations from Plan

**1. [Diseño] `mode: "charge" | "preview"` eliminado de `resolveInvitationDiscountCandidate`.** Con el orden real (candidato ANTES del filter) el cobro también necesita simular la cualificación del `pending` y el vínculo por crear, así que ambos modos hacían lo mismo; un parámetro sin efecto era peor que no tenerlo y una sola función da paridad preview/cobro por construcción.

**2. [Diseño] `applyArbiterResult` recibe `priceAfterFilter` en vez de `basePrice`.** Con `auraApplied=true` el precio final es el que dejó el filter y no se deriva de la lista; con core, `priceAfterFilter` es la lista (el core solo participa sin override/prorrateo/boarding). Nunca baja de 0.

**3. [Ubicación] `findLinkableInvitation` / `materializeInvitationLink` / avisos viven en `referrals/invitation-link.ts` (archivo nuevo)** y no en `InvitationService` (lección 194-32: no engordarlo). `deps` del árbitro no incluye `invitationService`: no hace falta.

**4. [Rule 3] `isDuplicateKeyError` pasó a `export` en `referrals/service.ts`** para reusar la detección del UNIQUE en `materializeInvitationLink` (en vez de duplicarla).

**5. [Reorganización mínima en `subscriptions/service.ts`]** `qualifyReferralOnCharge` ahora delega el aviso en `notifyReferralLinkActivated` (extraído sin cambio de texto) y se agregó `partnerCompetingAmount` (16 líneas, privado) para calcular la lista pre-filter; neto +30 líneas, ya que sale el bloque try/catch. Se quitó el import de `NotificationService`.

**6. [Import circular]** `referrals/service.ts` <-> `referrals/invitation-settings.ts` (service lee los settings por lado; settings usa `ReferralService.getReferralConfig`). Funciona porque ambos usan el otro solo en tiempo de llamada y ya existe el mismo patrón `referrals/service` <-> `subscriptions/service`. Alternativa descartada: partir `getReferralConfig` en un tercer archivo (churn en 14 call sites de `getInvitationSettings`).

## Para planes siguientes

- **194-19 (Mis invitados):** `getReferralOverview` calcula `discount.percent` con la implementación nueva (correcto) pero `perLinkPercent`/`activeCount` siguen siendo un solo % por vínculo: con `invitee_percent != perLinkPercent` el desglose no cuadra con el total. Hay que desglosar por lado ahí.
- **194-18:** `getRenewalPreview` y la renovación pueden usar `resolveInvitationDiscountCandidate` tal cual (sin invitación activa, solo con vínculos); recordar el guard de sub Invitación de 194-06.
- Con el vínculo creado al comprar, `computeInvitationDiscountPercent` usa `new Date().toISOString()` (UTC) para "hoy" en la cobertura de la contraparte, igual que antes (deuda preexistente, no se tocó).
- `lint:tenant`: un `sql\`DATE_ADD(${schema.invitations.accessExpiresOn}...\`` dentro de un statement con `tenantWhere` no necesita comentario `tenant-safe`.

## Lecciones

- `cleanAllTestData` vacía `aura_config` y `system_settings`: un test del lado INVITADOR (`percentPerLink`) que no resiembra `aura_config.referral` hereda un valor stale de otra suite (20 en este worker, dio 40 en vez de 20). Resembrar siempre en `beforeEach`.
- `prettier --write` explícito sobre un test ya comiteado reformatea líneas ajenas (el archivo no estaba formateado): no correrlo sobre archivos preexistentes; el lint-staged del commit ya formatea lo staged.
- Un `describe`/`it.each` con `as const` y objetos de override tipa bien contra `Partial<Input>` sin casts.
- Mutation testing por tandas: mutar funciones con tests en archivos distintos juntos y mapear cada fallo al mutante es 2 corridas en vez de 14 (cada archivo de integración paga ~170 s de provisioning).

## Known Stubs

None. El árbitro no está cableado a ninguna charge-path a propósito (alcance del plan); el cableado es 194-15..18.

## Threat Flags

None. T-194-48 (un solo descuento, tabla de casos), T-194-49 (gates D-20/D-26a), T-194-50 (UNIQUE + idempotencia + D-26c) y T-194-51 (empate = core, sin gastar puntos, commit y preview) cubiertos con test y mutación.

## Self-Check: PASSED

- FOUND: `el-templo-api/src/modules/subscriptions/discount-arbiter.ts`, `el-templo-api/src/modules/referrals/invitation-link.ts`, `el-templo-api/test/invitations/discount-arbiter.test.ts`
- FOUND: commits `df8262d1f` y `a80bec5c6`
