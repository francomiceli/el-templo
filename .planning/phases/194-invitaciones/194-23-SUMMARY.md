---
phase: 194-invitaciones
plan: 23
subsystem: admin
tags: [discounts, arbiter, invitations, admin, cobros, previews, pitfall-6, D-20]
requires:
  - phase: 194-15
    provides: PricingPreview con invitationDiscount* y winningDiscount
  - phase: 194-17
    provides: ChangePlanPreview con invitationDiscount* y winningDiscount
  - phase: 194-18
    provides: RenewalPreview con montos y querystring de inputs
provides:
  - "AssignPlanDialog sin price-math de descuentos: alta, cambio y mantener vencimiento precargan los montos/precios del servidor"
  - "MemberSubscriptionTab: la renovacion usa finalPrice / invitationDiscount* / partnerDiscount* de renewal-preview"
  - "Tipos y composable del admin con el contrato final de los 3 previews (+ RenewalPreviewOptions)"
affects: [194-24, 194-27]
key-files:
  modified:
    - el-templo-admin/src/components/AssignPlanDialog.vue
    - el-templo-admin/src/components/MemberSubscriptionTab.vue
    - el-templo-admin/src/types/subscription.ts
    - el-templo-admin/src/composables/useSubscriptionsApi.ts
key-decisions:
  - "D-20 en el cliente: con precio personalizado (alta, renovacion, mantener vencimiento) y con prorrateo, el precio digitado ES el final. No se consulta al servidor para esos modos (su regla es override = precio final) y no hay linea de invitacion"
  - "Mantener vencimiento: chargeBase = la diferencia digitada del admin (no se pisa con netAmount del preview, leccion 194-17)"
  - "Solo se muestra el descuento ganador: la linea de invitacion/partner aparece solo si winningDiscount coincide"
  - "La normalizacion de recargo (WR-04) se detecta con basePrice !== base del mismo renewal-preview: se elimina el pricing-preview auxiliar de la renovacion"
requirements-completed: [D-08, D-20, D-21, D-10c, D-26, D-27, SC-3]
completed: 2026-10-07
---

# Phase 194 Plan 23: admin con montos del servidor Summary

**VIAJA JUNTO con 194-14..194-18 (árbitro) — mismo push/tren.**

**El admin deja de multiplicar porcentajes: alta, cambio de plan y renovación muestran y precargan los montos que devuelve el servidor (un solo descuento ganador, con tope en dinero), el precio personalizado y la diferencia de "mantener vencimiento" son el precio final (D-20), y las líneas dicen "Descuento por invitación (N%) · con tope".**

## Commits

- `5d06ce2ef` feat(194-23): AssignPlanDialog con montos del servidor y copy de invitacion (incluye tipos y composable)
- `eaa20f7cf` feat(194-23): renovacion del admin con montos del servidor

## Qué cambió

- **Tipos** (`types/subscription.ts`): `PricingPreview` y `ChangePlanPreview` pierden `referralDiscount*` (alias deprecado de la API) y ganan `invitationDiscountPercent/Amount/Capped` + `winningDiscount` (`WinningDiscount`); `partnerDiscountPercent/Amount` de `PricingPreview` pasan a `number | null` (como los serializa la API). `RenewalPreview` con el contrato completo de 194-18 y `RenewalPreviewOptions`. `SubscriptionDetail.referralDiscount*` se mantiene (columnas guardadas de la sub, no del preview).
- **Composable**: `getRenewalPreview(userId, subscriptionId, options?)` manda `startDate`, `prorateToMonthEnd`, `priceOverrideAmount`, `priceOverrideReason` solo si vienen.
- **AssignPlanDialog**: `pricingDisplay` toma invitación y partner del preview solo si `winningDiscount` es ese; rama override = `finalPrice: override`, invitación 0 (D-20); eliminados `Math.floor` de porcentajes y `keepDiffReferralAmount` (y su línea); `chargeBase` en mantener vencimiento = diferencia digitada. Una sola función `invitationDiscountLabel(percent, capped)` da el copy en las 4 líneas (alta, cambio inmediato, cambio programado, confirmación).
- **MemberSubscriptionTab**: `renewalChargeBase` = prorrateo editado | override digitado | `renewalPreview.finalPrice` (fallback a la base heredada mientras carga, con el botón de confirmar deshabilitado). Líneas de invitación (con "· con tope") y partner (esta última no existía: el admin ignoraba el partner y el monto precargado no coincidía). El preview se vuelve a pedir al cambiar la fecha de inicio (`loadRenewalPreview`, contador anti-race, `renewalQuoteLoading` bloquea confirmar). Eliminados `renewalReferralPct`, `loadRenewalReferralPct`, `detectRenewalNormalization`, `renewalBasePreReferral`, `renewalReferralAmount`.

## Verificación

- `pnpm lint` del admin: 0 errores (8 warnings preexistentes ajenos). `timeout 900 pnpm build`: OK. `dist/` no versionado.
- `grep -c "Math.floor([^)]*referral"` AssignPlanDialog = 0; `renewalReferralAmount|renewalReferralPct` en MemberSubscriptionTab = 0; `keepDiffReferralAmount` = 0; `finalPrice` en la pestaña ≥ 1.
- Chequeo canónico de "referid" sobre los 4 archivos: sin salidas.
- No hay tests de frontend en el admin; la paridad preview-cobro está cubierta por los tests de API de 194-15..18 (`preview-parity`).

## Deviations from Plan

**1. [Diseño] `grep -c "Descuento por invitación"` AssignPlanDialog = 1, no ≥ 3.** El criterio asumía el literal repetido por línea; para no duplicar copy (DRY) hay UNA función `invitationDiscountLabel` usada en las 4 líneas. El copy está igual en todos los sitios.

**2. [Diseño] Override y prorrateo no consultan al servidor.** El plan pedía pasar override/prorrateo al preview en cada cambio (con debounce). Como el servidor define "override = precio final" y "prorrateo = precio final sin descuentos", el valor digitado ya es el que cobra la API; pedirlo solo agregaba un monto stale durante el debounce. El preview sí se re-pide al cambiar la fecha de inicio (puede cambiar qué vínculo aplica). El composable acepta igual todas las opciones por si hace falta.

**3. [Diseño] `paymentMethod` no se manda** (194-18 Deviation 3: no cambia el precio de la renovación).

**4. [Mejora] Detección de normalización WR-04 simplificada.** Antes: una llamada extra a `pricing-preview` con `credit_card`. Ahora: `basePrice !== base` del propio renewal-preview (el servidor ya normaliza con `resolvePriceType`). Una request menos y sin el cálculo `finalPrice + referralDiscountAmount`.

**5. [Alcance] Línea de partner en la renovación.** No estaba en el plan; sin ella el precio precargado (finalPrice del servidor, que descuenta el partner) no se explicaba en pantalla.

## Known Stubs

None.

## Threat Flags

None. T-194-76 mitigada (el cliente no multiplica porcentajes; lo único que calcula es el proporcional sugerido de fin de mes, sin descuentos). T-194-77 mitigada (los montos precargados salen del mismo helper que el cobro; el modo mantener vencimiento y los override usan el precio digitado, que el servidor trata como final).

## Lecciones

- El campo `partnerDiscountPercent/Amount` del pricing-preview es `null` cuando el partner no ganó (el de renewal y change-plan vienen en 0): tipar con `number | null` y usar `?? 0`.
- La base heredada de la renovación no cambia con las opciones (override/prorrateo/fecha): un solo `renewalPreview` sirve para `base`, `source` y la normalización; solo los montos dependen de la fecha.
- El admin no tiene `vue-tsc` (D-27): un campo renombrado en los tipos NO rompe el build ni el lint. Después de tocar tipos hay que grepear los consumidores a mano (acá `referralDiscountPercent` en la pestaña).
- Hook del harness: no encadenar `cd && git` ni heredocs; usar Edit/Write y llamadas separadas.

## Self-Check: PASSED

- Commits `5d06ce2ef`, `eaa20f7cf`: FOUND
- Worktree limpio salvo este SUMMARY
