---
phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p
plan: 08
subsystem: api
tags:
  [
    fastify,
    drizzle,
    tenancy,
    scheduling,
    referral-partners,
    subscriptions,
    freemium-trial,
  ]

# Dependency graph
requires:
  - phase: 179-04
    provides: "attributePartnerAtSignup + findOriginForMember + PARTNER_BENEFIT_TTL_DAYS (30), fixtures del módulo, vínculo partner_referrals con benefit_status/benefit_expires_at"
  - phase: 179-06
    provides: "consumePartnerBenefitOnCharge (UPDATE guardado por benefit_status='pending', idempotente vía affectedRows) — reusado tal cual (reason ampliado) para consumir el free_pass"
provides:
  - "PartnerWeekService (scheduling/partner-week-service.ts): getPartnerWeekEligibility (unión discriminada eligible/reason) + activateAndReserve (assignPlan + BookingService.reserve() en un solo request, priceOverrideAmount=0 → membership_kind='bonificada')"
  - "GET /api/members/scheduling/partner-benefit + POST /api/members/scheduling/reserve-partner-week — shape congelado para la app (179-16)"
  - "Guard D-18 en getTrialEligibility (trials-service.ts): un socio con free_pass pending/consumed deja de ser elegible al trial freemium. BLOCKING_SUBSCRIPTION_STATUSES exportada para que partner-week-service reuse el mismo criterio sin copiarlo"
  - "consumePartnerBenefitOnCharge (referral-partners/service.ts) con reason ampliado a 'semana_activada' — mismo UPDATE guardado, reusado desde un flujo de scheduling en vez de subscriptions"
affects: [179-10, 179-16]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "activateAndReserve NO envuelve assignPlan+booking+consumo en una única db.transaction: assignPlan maneja su PROPIA transacción internamente (no acepta un tx externo) y el plan instruye reusarlo tal cual (único camino canónico a membership_kind='bonificada' vía priceOverrideAmount=0). Se sigue el fallback documentado: assignPlan corre y commitea; si bookingService.reserve() falla después, se loguea con log.error y se propaga el error SIN revertir la suscripción — el socio queda con una suscripción real y activa que puede usar por /reserve normal. El benefit_status recién se consume DESPUÉS de que la reserva exista, así que 'semana consumida sin clase reservada' nunca ocurre (el lado de la garantía que sí importa cerrar)"
    - "hasBlockingSubscription (privado) recibe el TenantCtx y filtra subscriptions por tenantWhere — más estricto que getTrialEligibility (que todavía no adoptó tenantWhere para ese mismo chequeo), posible porque partner-week-service ya deriva el ctx en los dos call sites"
    - "El plan buscado (paquete/7d/3clases) sale SIEMPRE server-side por planCategory+durationDays+classesPerWeek+country de la sede — el planId NUNCA viaja en el body (T-179-32)"
    - "Derivación de tenant 'tenant-safe' por PK del propio usuario que llama (users.tenantId) en las dos rutas member sin request.scope, mismo patrón documentado por 179-04 y por qualifyPartnerOnCharge (179-06)"
key-files:
  created:
    - el-templo-api/src/modules/scheduling/partner-week-service.ts
    - el-templo-api/test/referral-partners/semana-gratis.test.ts
  modified:
    - el-templo-api/src/modules/scheduling/routes.ts
    - el-templo-api/src/modules/scheduling/schemas.ts
    - el-templo-api/src/modules/scheduling/trials-service.ts
    - el-templo-api/src/modules/referral-partners/service.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts

key-decisions:
  - "activateAndReserve NO es una única db.transaction (ver tech-stack.patterns arriba) — documentado explícitamente en el docblock del método porque es la única desviación del ideal 'todo o nada' que el plan permitía como fallback dado el shape actual de assignPlan"
  - "consumePartnerBenefitOnCharge (179-06) se REUSA tal cual para el free_pass en vez de escribir un UPDATE paralelo — solo se amplió el tipo de `reason` con 'semana_activada'. Mismo UPDATE guardado por benefit_status='pending', misma garantía de idempotencia (T-179-31) sin duplicar la lógica"
  - "getPartnerWeekEligibility NO distingue el enum benefitStatus='expired' materializado (nunca se escribe — D-07 prohíbe el cron) del vencimiento evaluado en lectura contra benefit_expires_at: ambos casos devuelven reason:'expirado', defensivos ante un futuro escritor manual de ese estado"

requirements-completed: [D-05, D-06, D-07, D-18, D-19]

# Metrics
duration: ~90min
completed: 2026-08-23
---

# Phase 179 Plan 08: Semana gratis de partner — elegibilidad, activación atómica y precedencia sobre el trial Summary

**`PartnerWeekService.activateAndReserve` activa una suscripción de 7 días/3 clases/precio 0/`membership_kind='bonificada'` y reserva la primera clase en el mismo request (sin `is_trial`, cuenta en capacidad), consumiendo el vínculo de partner recién después de que la reserva existe; `getTrialEligibility` gana un guard D-18 que excluye del trial freemium a quien tiene un beneficio de partner pendiente o consumido — 8 tests de integración contra MySQL real cubren activación, vencimiento en lectura y la precedencia sobre la fase 119.**

## Performance

- **Duration:** ~90 min
- **Tasks:** 3/3
- **Files modified:** 7 (2 nuevos: `partner-week-service.ts`, `test/referral-partners/semana-gratis.test.ts`; 5 modificados: `scheduling/routes.ts`, `scheduling/schemas.ts`, `scheduling/trials-service.ts`, `referral-partners/service.ts`, `test/tenant-manifest.ts`, `test/tenancy/iso-01-manifiesto.test.ts`)

## Accomplishments

- `PartnerWeekService.getPartnerWeekEligibility(userId)`: unión discriminada `{eligible:true, partnerName, expiresAt} | {eligible:false, reason}` con `reason` en `sin_beneficio | expirado | consumido | con_plan_activo`. El vencimiento (D-07) se evalúa EN LECTURA contra `benefit_expires_at > ahora` — nada lo materializa vía cron (prohibido, CON-04).
- `PartnerWeekService.activateAndReserve(userId, {scheduleId, date, branchId})`: todas las guardas ANTES de tocar la base (404 usuario/sede, 409 sede virtual/beneficio no activable/plan activo), busca el plan `paquete` de 7 días/3 clases del país de la sede server-side (T-179-32, el `planId` nunca sale del body), llama `subscriptionService.assignPlan` con `priceOverrideAmount:0` (único camino canónico a `membership_kind='bonificada'`), reserva con `BookingService.reserve()` SIN `isTrial` (la semana cuenta en capacidad, a diferencia del trial que la bypassea a propósito), y recién después consume el vínculo (`consumePartnerBenefitOnCharge` con `reason:'semana_activada'`, reusado tal cual de 179-06 con el tipo ampliado).
- `GET /api/members/scheduling/partner-benefit` y `POST /api/members/scheduling/reserve-partner-week` — schemas con `additionalProperties:false`, registrados en `schedulingMemberRoutes`.
- `trials-service.ts` `getTrialEligibility`: nuevo guard D-18 con la misma forma que el de suscripción bloqueante (`blockingSub`), sobre `partner_referrals` con `benefit_type='free_pass'` y `benefit_status IN ('pending','consumed')` → `eligible:false`. `BLOCKING_SUBSCRIPTION_STATUSES` exportada para que `partner-week-service.ts` reuse el mismo criterio de "plan activo" sin copiarlo.
- `test/tenant-manifest.ts` + `iso-01-manifiesto.test.ts`: 2 entradas `tenant-scoped` nuevas, `ENTRADAS_BASELINE` 378→380.
- 8 tests de integración HTTP contra MySQL real (`test/referral-partners/semana-gratis.test.ts`): activación 201 con `membership_kind='bonificada'`/`classes_remaining=3`/`end_date=start+7d`/booking NO trial/vínculo `consumed` con `applied_reason='semana_activada'`; segunda llamada 409 sin duplicar; vencimiento D-07 (expirado en lectura, atribución sigue viva — cross-assertion pagando un plan real después y verificando que la comisión SÍ dispara); precedencia D-18 sobre `trial-eligibility` en `pending` y `consumed`, con no-regresión de un freemium sin partner; cero comisión por la semana gratis (`price_paid=0`); socio con plan activo → 409 sin tocar nada; país sin el plan `paquete` configurado → 400 en español, cero escrituras.
- `tsc --noEmit` en 0, `pnpm lint:tenant` en 0 discrepancias (2 exenciones `tenant-safe` nuevas documentadas para las lecturas por PK del usuario que llama, sin `request.scope` en rutas member), `test/scheduling` + `test/tenancy` completos en verde (14 archivos / 185 tests) y `test/referral-partners/semana-gratis.test.ts` en 8/8.

## Task Commits

Cada task se commiteó atómicamente en el worktree `et-179` (rama `feat/179-referidos-partners`):

1. **Task 1: partner-week-service.ts — elegibilidad y activación atómica** - `4a73304b` (feat, incluye el fix necesario en `referral-partners/service.ts`: `reason` ampliado con `'semana_activada'`)
2. **Task 2: rutas member, guard de precedencia sobre el trial (D-18) y manifiesto** - `09b32baa` (feat)
3. **Task 3: tests de la semana gratis, vencimiento y precedencia** - `b9c48627` (test)

_Nota: el commit de metadatos de docs (STATE/ROADMAP/SUMMARY) lo maneja el orquestador, no este ejecutor._

## Files Created/Modified

- `el-templo-api/src/modules/scheduling/partner-week-service.ts` - `PartnerWeekService` (nuevo): `getPartnerWeekEligibility`, `activateAndReserve`, `hasBlockingSubscription` (privado)
- `el-templo-api/src/modules/scheduling/routes.ts` - `PartnerWeekService` instanciado en `schedulingMemberRoutes`; rutas `GET /partner-benefit` y `POST /reserve-partner-week`
- `el-templo-api/src/modules/scheduling/schemas.ts` - `partnerBenefitSchema`, `reservePartnerWeekSchema`
- `el-templo-api/src/modules/scheduling/trials-service.ts` - guard D-18 en `getTrialEligibility`; `BLOCKING_SUBSCRIPTION_STATUSES` exportada
- `el-templo-api/src/modules/referral-partners/service.ts` - `consumePartnerBenefitOnCharge.applied.reason` ampliado con `"semana_activada"` (docblock actualizado)
- `el-templo-api/test/tenant-manifest.ts` - 2 entradas nuevas (`GET .../partner-benefit`, `POST .../reserve-partner-week`)
- `el-templo-api/test/tenancy/iso-01-manifiesto.test.ts` - `ENTRADAS_BASELINE` 378→380 + título del `it`
- `el-templo-api/test/referral-partners/semana-gratis.test.ts` - 8 tests de integración (archivo nuevo, ~530 líneas)

## Shape de `GET /partner-benefit` (para la app, plan 179-16)

```ts
// 200
| { eligible: true; partnerName: string; expiresAt: string /* ISO */ }
| {
    eligible: false;
    reason: "sin_beneficio" | "expirado" | "consumido" | "con_plan_activo";
  }
```

`POST /reserve-partner-week` — body `{ scheduleId: integer, date: string (YYYY-MM-DD), branchId: integer }`, `additionalProperties:false`. Respuesta 201:

```ts
{
  subscriptionId: number;
  bookingId: number;
  endDate: string | null;
  classesRemaining: number | null;
}
```

## Decisión de transaccionalidad (para quien retome esto)

`activateAndReserve` NO es una `db.transaction` única de punta a punta. `assignPlan` (subscriptions/service.ts) maneja su propia transacción internamente y no acepta un `tx` externo; el plan instruía reusarlo tal cual (es el único camino canónico a `membership_kind='bonificada'` vía `priceOverrideAmount=0`), así que envolver todo en una tx propia hubiera exigido reimplementar la creación de la suscripción por fuera de `assignPlan`.

Orden real: `assignPlan` corre y COMMITEA la suscripción → se intenta `bookingService.reserve()` → si falla, se loguea con `log.error` (queda una suscripción activa sin booking) y el error se PROPAGA sin revertir la suscripción. No es un medio-estado silencioso: el socio ya tiene una suscripción real y activa y puede reservar normalmente por `/reserve` sin pasar de nuevo por este endpoint (un segundo intento acá mismo da 409 `con_plan_activo`, cubierto por el guard). El consumo del beneficio (`benefit_status=consumed`) se hace DESPUÉS de que la reserva exista — la garantía que sí importa ("nunca semana consumida sin clase reservada") queda cerrada.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Violación de tenancy (CON-06) en `hasBlockingSubscription`**

- **Found during:** Task 1, al correr `pnpm lint:tenant` como parte de la verificación
- **Issue:** El chequeo de "plan activo" (mismo criterio que `getTrialEligibility.blockingSub`) leía `subscriptions` sin `tenantWhere`, marcado como violación NO listada.
- **Fix:** `hasBlockingSubscription` ahora recibe el `TenantCtx` (ya disponible en los dos call sites) y filtra con `tenantWhere(schema.subscriptions, ctx)` — más estricto que el precedente de `trials-service.ts` (que todavía no adoptó `tenantWhere` para ese mismo chequeo), posible porque este servicio nuevo ya deriva el `ctx` desde el arranque de cada método público.
- **Files modified:** `el-templo-api/src/modules/scheduling/partner-week-service.ts`
- **Commit:** `4a73304b`

### Ajuste no listado en `files_modified` del plan (documentado, no un bug)

El plan action de la Task 1 instruía explícitamente "extender el tipo de `reason` con `semana_activada` si hace falta" sobre `consumePartnerBenefitOnCharge`, que vive en `el-templo-api/src/modules/referral-partners/service.ts` — archivo NO listado en el frontmatter `files_modified` del plan (que solo listaba archivos de `scheduling`). Se aplicó el cambio de todos modos (dos líneas: el docblock y la unión de `reason`) porque el plan lo pedía por texto explícito y era la alternativa DRY frente a duplicar el `UPDATE` guardado dentro de `partner-week-service.ts`. Incluido en el commit de la Task 1.

---

**Total deviations:** 1 auto-fixed (1 bug de tenancy) + 1 ajuste de archivo no listado explícitamente instruido por el texto del plan.
**Impact on plan:** Sin impacto en el alcance funcional. El fix de tenancy es necesario para pasar el gate CON-06; la extensión de `reason` es la que el propio plan pedía.

## Issues Encountered

Ninguno más allá de lo documentado en Deviations. La corrida completa (`test/referral-partners test/scheduling test/tenancy`, corrida en foreground con `MAX_TEST_WORKERS=1`) quedó verde sin iteración adicional más allá del fix de tenancy detectado por `lint:tenant`.

## User Setup Required

None - no requiere configuración de servicios externos.

## Next Phase Readiness

- El shape de `GET /partner-benefit` / `POST /reserve-partner-week` queda congelado y documentado arriba, listo para que la app (plan 179-16) lo consuma calcando el patrón `trial-eligibility`/`reserve-trial` de `useSchedulingApi.ts`/`ReservasPage.vue`.
- El guard D-18 en `getTrialEligibility` cierra el agujero de "doble gratis" que la fase 119 dejaba abierto: cualquier plan futuro que toque la elegibilidad de trial debe tener en cuenta este guard.
- El reporte "beneficios de partner sin conversión" (D-08, diferido al plan 179-10) puede apoyarse en `benefit_status='pending' AND benefit_expires_at < NOW()` para listar los vencidos sin activar — el mismo criterio de lectura que usa `getPartnerWeekEligibility`.
- Sin bloqueos.

---

_Phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p_
_Completed: 2026-08-23_

## Self-Check: PASSED

- FOUND: `el-templo-api/src/modules/scheduling/partner-week-service.ts`
- FOUND: `el-templo-api/test/referral-partners/semana-gratis.test.ts`
- FOUND: `el-templo-api/src/modules/scheduling/routes.ts`
- FOUND: `el-templo-api/src/modules/scheduling/schemas.ts`
- FOUND: `el-templo-api/src/modules/scheduling/trials-service.ts`
- FOUND: `el-templo-api/src/modules/referral-partners/service.ts`
- FOUND: `el-templo-api/test/tenant-manifest.ts`
- FOUND: `el-templo-api/test/tenancy/iso-01-manifiesto.test.ts`
- FOUND: commit `4a73304b` (Task 1)
- FOUND: commit `09b32baa` (Task 2)
- FOUND: commit `b9c48627` (Task 3)
- `tsc --noEmit`: 0 errores
- `pnpm lint:tenant`: 0 discrepancias
- `test/referral-partners/semana-gratis.test.ts`: 8/8 verde (corrida aislada, foreground)
- `pnpm exec vitest run test/referral-partners test/scheduling test/tenancy` (verificación completa del plan, `MAX_TEST_WORKERS=1`, foreground): **34 archivos / 409 tests verde**, exit code 0
