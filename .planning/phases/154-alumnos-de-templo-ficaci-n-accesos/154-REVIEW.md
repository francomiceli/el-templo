---
phase: 154-alumnos-de-templo-ficaci-n-accesos
reviewed: 2026-07-04T20:07:01Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - el-templo-admin/src/components/AssignPlanDialog.vue
  - el-templo-admin/src/components/PlanFormDialog.vue
  - el-templo-admin/src/composables/usePricingSettingsApi.ts
  - el-templo-admin/src/config/templo-config.ts
  - el-templo-admin/src/pages/AlumnoDetailPage.vue
  - el-templo-admin/src/pages/AlumnosPage.vue
  - el-templo-admin/src/pages/CobrosPage.vue
  - el-templo-admin/src/pages/ConfiguracionPreciosPage.vue
  - el-templo-admin/src/router/routes.ts
  - el-templo-admin/src/types/member.ts
  - el-templo-api/src/app.ts
  - el-templo-api/src/db/migrations/0166_seed_pricing_card_surcharge.sql
  - el-templo-api/src/modules/members/routes.ts
  - el-templo-api/src/modules/members/schemas.ts
  - el-templo-api/src/modules/settings/index.ts
  - el-templo-api/src/modules/settings/keys.ts
  - el-templo-api/src/modules/settings/routes.ts
  - el-templo-api/src/modules/settings/service.ts
  - el-templo-api/src/modules/subscriptions/service.ts
  - el-templo-api/test/finance/coach-load-pricing-gate.test.ts
  - el-templo-api/test/members/members.test.ts
  - el-templo-api/test/settings/pricing-setting.test.ts
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 154: Code Review Report

**Reviewed:** 2026-07-04T20:07:01Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Se revisaron los 22 archivos de la fase 154 (Alumnos: de-Templo-ficación + accesos) contra las decisiones locked D-01..D-08. Los invariantes centrales se cumplen:

- **PUT owner-only verificado:** el `preHandler` de `PUT /pricing/card-surcharge` devuelve 403 para roles no-owner (`settings/routes.ts:62-69`), con test de integración que lo cubre (caso d del test de settings).
- **Gate de precio server-side verificado:** `resolvePriceType` (`subscriptions/service.ts:4254-4266`) normaliza `credit_card`→`regular` con la regla OFF, y está cableado en los 3 flujos que consumen `input.priceTypeApplied` (assignPlan:1052, changePlanNow:2813, changePlanAfterCurrent:3238). El valor normalizado es el que se PERSISTE (`priceTypeApplied: resolvedPriceType`), sin drift monto↔tipo. El PoS del profe (coach-load `card`→`credit_card`→`assignPlan`) pasa por el mismo punto. Tests de integración cubren ON/OFF/ausente + persistencia.
- **Default OFF + seed 0166 verificados:** `getCardSurchargeEnabled` devuelve `false` con key ausente; la migración 0166 es idempotente (`WHERE NOT EXISTS`), replica byte-a-byte el patrón ya probado en prod de la 0157, sin `;` en comentarios, numeración correcta (siguiente a 0165). El pipeline de deploy migra antes de reiniciar, así que prod nunca sirve con la key ausente.
- **Rename Avatar→Categoría UI-only verificado:** solo labels (`'Avatar'`→`'Categoría'`, `'Sin avatar'`→`'Sin categoría'`); `avatarType`, slots internos y `AVATAR_LABELS` intactos. No quedan strings "Avatar" visibles en AlumnosPage/AlumnoDetailPage (MemberFormDialog nunca tuvo el campo).
- **Gating de niveles griegos verificado:** `TEMPLO_GREEK_LEVELS` en `templo-config.ts` (constante de superficie, no reusa `canAccessTraining` — D-08); gatea columna, filtro, badge/subtítulo de la ficha y el export vía `includeGreekLevel` (default server-side `!== false` = true, backwards-compatible; 3 tests de export lo cubren). Se verificó que ningún test existente depende del pricing de tarjeta vía assignPlan (sin regresión por el default OFF en el DB de test).
- Sin `console.*`, sin `any`, sin drizzle-kit.

Los hallazgos son 4 warnings (una brecha de autorización en el GET de la setting, un bypass del punto único en el pricing-preview, una brecha de reactividad en CobrosPage y una consecuencia no cubierta de la regla en renovaciones) y 3 info.

## Warnings

### WR-01: El GET de la setting de precios es legible por tokens de SOCIO (rol `member`), no solo staff

**File:** `el-templo-api/src/modules/settings/routes.ts:25-27`
**Issue:** El hook del plugin solo hace `fastify.authenticate` (verifica JWT — `plugins/auth.ts:50-64` no chequea rol). Los JWT de la app de socios llevan `role: "member"` (`modules/auth/routes.ts:287`), así que cualquier socio logueado puede leer `GET /api/admin/settings/pricing/card-surcharge`. Esto contradice el modelo de acceso documentado en el propio archivo ("readable by ANY authenticated staff") y el patrón del repo: los plugins hermanos bajo `/api/admin/*` gatean por rol en el hook (p.ej. `users/routes.ts:26-34`, coach-load con `FINANCE_LOAD_ROLES`). Hoy el dato filtrado es un boolean inocuo, pero cualquier setting futura agregada a este plugin hereda la lectura member-accessible — el riesgo es el patrón, no el dato actual. Además, el test de settings prueba GET con coach (caso e) pero no con token de member, así que el gap no está blindado.
**Fix:**

```typescript
import { ALL_STAFF_ROLES, OWNER_ROLES } from "../shared/permissions";

fastify.addHook("onRequest", async (request, reply) => {
  await fastify.authenticate(request, reply);
  if (!(ALL_STAFF_ROLES as readonly string[]).includes(request.user.role)) {
    return reply.code(403).send({
      error: "Acceso denegado",
      message: "Solo staff puede consultar la configuración",
    });
  }
});
```

Y agregar un caso de test: GET con token de member ⇒ 403.

### WR-02: `getPricingPreview` bypasea `resolvePriceType` — el preview puede mostrar el precio de tarjeta con la regla OFF

**File:** `el-templo-api/src/modules/subscriptions/service.ts:3903-3924`
**Issue:** El docstring de `resolvePriceType` lo declara "the single server-side point of truth", pero `getPricingPreview` llama `this.getBasePrice(plan, priceType)` con el `priceType` crudo del cliente (línea 3924, expuesto vía `GET /members/:userId/subscription/pricing-preview`, consumido por AssignPlanDialog). Con la regla OFF, un request con `priceType=credit_card` devuelve `basePrice = priceCreditCard`, mientras el `assignPlan` posterior cobrará `priceRegular` — el preview y el cobro real divergen. Hoy la UI esconde la opción tarjeta con la regla OFF, así que el path normal no lo dispara; pero queda alcanzable por llamada directa, por una UI con la regla cacheada stale, o por el race de fetch (el owner apaga la regla mientras un admin tiene el dialog abierto con tarjeta seleccionada). En El Templo (regla ON por 0166) no hay impacto, pero para white-label el "punto único" queda con un agujero declarado inexistente.
**Fix:**

```typescript
async getPricingPreview(
  userId: number,
  planId: number,
  priceType: PriceType,
  auraSpend?: number,
): Promise<PricingPreview> {
  const resolvedPriceType = await this.resolvePriceType(priceType);
  // ...
  const basePrice = this.getBasePrice(plan, resolvedPriceType);
```

### WR-03: El watch que autocalcula `amount` en CobrosPage no depende de `cardSurchargeEnabled` — monto stale si la regla llega después de elegir plan+tarjeta

**File:** `el-templo-admin/src/pages/CobrosPage.vue:1321-1326` (watch), `1262` (ref), `1452/1484` (submit `amountReceived: amount.value`)
**Issue:** `amount` se setea solo dentro de `watch([selectedPlan, paymentMethod, zeroPrice], ...)` leyendo `altaPrice` (que sí depende de `cardSurchargeEnabled` vía `getBasePriceFor`). `cardSurchargeEnabled` arranca en `false` y se resuelve async en `onMounted`. Si el fetch de la regla resuelve DESPUÉS de que el profe eligió plan + método `card` (red lenta, retry), `amount` queda calculado con precio regular y NO se recalcula cuando la regla llega en ON. Ese `amount` viaja como `amountReceived` al alta: el server (gate ON) fija `chargeBase = priceCreditCard` y el cobro queda PARCIAL — el socio nace con deuda fantasma por la diferencia del recargo. La UI incluso mostraría la diferencia como deuda (línea 493 usa `altaPrice` reactivo contra el `amount` congelado), lo que confirma la inconsistencia interna. Ventana chica (el fetch corre al montar), pero el fix es de una línea.
**Fix:**

```typescript
watch([selectedPlan, paymentMethod, zeroPrice, cardSurchargeEnabled], () => {
  if (mode.value !== "alta") return;
  if (selectedPlan.value && paymentMethod.value) {
    amount.value = altaPrice.value;
  }
});
```

### WR-04: La regla OFF no alcanza a las renovaciones — el precio con recargo heredado se perpetúa vía `renewSubscription`

**File:** `el-templo-api/src/modules/subscriptions/service.ts:3508-3517`
**Issue:** `renewSubscription` hereda `renewalPrice = currentSub.pricePaid` y el `priceTypeApplied` de la sub anterior (diseño intencional post-caso Pomilio, para arrastrar overrides). Consecuencia no contemplada por ALUM-03: en una instalación que tuvo la regla ON y la apaga, todo socio asignado con `credit_card` sigue pagando el precio CON recargo en cada renovación, indefinidamente, y su `priceTypeApplied` persiste como `credit_card` — exactamente el estado que `resolvePriceType` promete impedir para altas/cambios. "Tarjeta deja de usar priceCreditCard" (D-03) se cumple solo para subs nuevas. Sin impacto en El Templo (regla ON), pero es una brecha real del requirement para el caso white-label que motiva la fase, y no hay test ni documentación que fije la decisión.
**Fix:** Decisión de negocio a fijar explícitamente. Opción mínima: en `renewSubscription`, cuando `currentSub.priceTypeApplied === 'credit_card'` y no hay `priceOverrideAmount`, resolver `await this.resolvePriceType('credit_card')`; si normaliza a `regular`, recomputar `renewalPrice = plan.priceRegular` (o al menos re-etiquetar el `priceTypeApplied` persistido). Si se decide conservar la herencia, documentarlo en el docstring de `resolvePriceType` (hoy afirma ser el punto único sin esta excepción) y en la UI de ConfiguracionPreciosPage.

## Info

### IN-01: `applyMemberDeepLink` no replica el reset completo de `onMemberSelected`

**File:** `el-templo-admin/src/pages/CobrosPage.vue:1633-1645` (deep-link) vs `1398-1403` (`onMemberSelected`)
**Issue:** El path canónico de selección hace `resetChargeFields()` + `resetAltaFields()`; el deep-link solo `resetAltaFields()`. Hoy es inocuo porque corre en `onMounted` con el form prístino, pero los dos paths ya divergen y cualquier estado futuro en charge-fields que deba limpiarse al cambiar de socio se va a escapar por el deep-link.
**Fix:** Agregar `resetChargeFields()` antes de `resetAltaFields()` en `applyMemberDeepLink` (paridad exacta con `onMemberSelected`).

### IN-02: El key canónico se re-declara como literal en el test de settings

**File:** `el-templo-api/test/settings/pricing-setting.test.ts:113,132`
**Issue:** `keys.ts` ordena "Do NOT re-declare this string anywhere else in the repo — import it", y `coach-load-pricing-gate.test.ts` lo importa correctamente, pero `pricing-setting.test.ts` usa el literal `"pricing.card_surcharge_enabled"` dos veces. Un rename del key pasaría tsc y rompería solo estos asserts en CI. (La migración SQL es la excepción inevitable.)
**Fix:** Importar `PRICING_SETTINGS_KEYS` de `src/modules/settings/keys` y usar `PRICING_SETTINGS_KEYS.cardSurcharge` en ambos `where`.

### IN-03: El deep-link deja el query param vivo y arma el guard de abandono sin interacción del usuario

**File:** `el-templo-admin/src/pages/CobrosPage.vue:1626-1657`
**Issue:** (a) `?memberId=` no se limpia tras consumirse — un refresh re-preselecciona al socio aunque el profe ya haya cobrado o cambiado de socio. (b) Al preseleccionar, `formHasData` (línea 1062: `selectedMember != null || ...`) pasa a true, así que salir de /cobros inmediatamente después de llegar por el deep-link dispara el diálogo de "abandonar" sin que el usuario haya tocado nada.
**Fix:** Tras el prefill exitoso, `void router.replace({ path: '/cobros' })` para consumir el param; opcionalmente trackear un flag `prefilledOnly` para no armar el abandon-guard hasta la primera interacción real.

---

_Reviewed: 2026-07-04T20:07:01Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
