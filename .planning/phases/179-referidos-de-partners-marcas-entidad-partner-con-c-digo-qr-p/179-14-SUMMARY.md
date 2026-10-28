---
phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p
plan: 14
subsystem: ui
tags:
  [
    vue,
    quasar,
    fastify,
    drizzle,
    referral-partners,
    subscriptions,
    pricing-preview,
  ]

# Dependency graph
requires:
  - phase: 179-09
    provides: "POST/DELETE /api/admin/members/:userId/partner-referral (asignación retroactiva + revocación en cascada)"
  - phase: 179-07
    provides: "partnerDiscountPercent/Amount en getPricingPreview (assign/after_current), gana-el-mayor resuelto server-side"
  - phase: 179-11
    provides: "usePartnersApi.ts (CRUD de partners), PartnerListItem"
provides:
  - "Sección Partner en MemberReferralsTab.vue: asignación retroactiva (q-select de partners activos, búsqueda local por nombre/código) + revocación con confirmación explícita del efecto sobre comisiones (D-14)"
  - "GET /api/admin/members/:userId/partner-referral (nuevo, deviation Rule 2): detalle del vínculo para la ficha del alumno — nombre/código del partner, fecha, estado del vínculo y del beneficio"
  - "getChangePlanPreview extendido con partnerDiscountPercent/Amount (nuevo, deviation Rule 2): paridad preview↔cobro para el flujo 'Cambio ahora, reinicia vencimiento', que 179-06/179-07 no cubrían"
  - "Fila 'Descuento partner (%)' en 4 bloques de resumen de precio de AssignPlanDialog.vue (Resumen de Precio, Cambio ahora/reinicia vencimiento, Cambio Programado, Confirmación de alta), sourced 100% del preview server-side"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GET de detalle de vínculo sin schema de respuesta explícito en Fastify (igual que el GET /referrals hermano) — evita a propósito el Pitfall 4 (fast-json-stringify descartando campos en silencio) en vez de tener que mantenerlo sincronizado."
    - "pricingDisplay (AssignPlanDialog.vue) expone partnerPercent/partnerAmount 0/0 en las ramas prorateToMonthEnd y useOverride en vez de replicar ahí la multiplicación que SÍ existe para referralAmount — mismo criterio DESC-05 (el front nunca calcula precio) llevado al límite: preferible no mostrar el descuento de partner en esos 2 modos que inventar price-math nueva."

key-files:
  created: []
  modified:
    - el-templo-admin/src/components/MemberReferralsTab.vue
    - el-templo-admin/src/composables/usePartnersApi.ts
    - el-templo-admin/src/components/AssignPlanDialog.vue
    - el-templo-admin/src/types/subscription.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/referral-partners/service.ts
    - el-templo-api/src/modules/referral-partners/types.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/src/modules/subscriptions/schemas.ts
    - el-templo-api/test/referral-partners/admin-assign-partner.test.ts
    - el-templo-api/test/referral-partners/change-plan-charge.test.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/tenant-manifest.ts

key-decisions:
  - 'Task 2 toca 4 bloques de resumen de precio, no 5: el bloque ''Mantener Vencimiento'' (keepDiffReferralAmount, línea ~729) queda deliberadamente sin fila de partner porque agregar el equivalente exigiría una multiplicación NUEVA (diff * pct / 100) que el preview no provee para ese modo (la diferencia es tipeada a mano por el admin) — violaría tanto DESC-05 como el criterio de aceptación explícito del plan (''grep -c "/ 100" no aumenta respecto de origin/master''). El texto del plan decía ''son 4'' bloques, consistente con esta exclusión.'
  - "En precio personalizado (useOverride), partnerPercent/Amount quedan en 0/0 por el mismo motivo — a diferencia de referralAmount, que ahí SÍ recalcula con la misma price-math del backend (patrón preexistente, no tocado). No se replicó para partner: hubiera sumado una tercera ocurrencia de '/ 100' al archivo."

requirements-completed: [D-09, D-10, D-14, D-15]

# Metrics
duration: ~110min
completed: 2026-08-23
---

# Phase 179 Plan 14: Partner en la ficha del alumno + diálogo de asignar plan Summary

**Sección Partner en la ficha del alumno (asignación retroactiva + revocación con aviso de comisiones) y fila de descuento de partner en el diálogo de asignar/cambiar plan, con dos endpoints backend nuevos (GET de detalle de vínculo, y partnerDiscount en getChangePlanPreview) agregados como deviation porque el plan asumía cobertura que 179-06/179-07/179-09 no completaban.**

## Performance

- **Duration:** ~110 min
- **Tasks:** 2/2 (plan) + 2 deviations backend tratadas como sub-tareas propias
- **Files modified:** 14 (10 producción, 4 tests)

## Accomplishments

- **`MemberReferralsTab.vue`** — sección "Partner" debajo de "Trajo a": sin vínculo, muestra un `q-select` de partners activos (`listPartners({isActive:true})`, cargado una vez y filtrado localmente por nombre/código) con botón "Asignar" deshabilitado hasta elegir; mensajería que distingue `qualified` ("la comisión quedó generada") de `pending` ("cuando pague se genera"). Con vínculo, muestra nombre/código/fecha/chip de estado/estado del beneficio y botón "Revocar" que abre un `$q.dialog` de confirmación explícito sobre el efecto en comisiones pendientes (se anulan) vs. liquidadas (no se tocan) — D-14. El `watch` sobre `props.userId` se extendió para resetear también `partnerLink`/`selectedPartnerId`/`partnerSearch` (T-179-55): un partner a medio elegir no sobrevive al cambio de ficha.
- **`usePartnersApi.ts`** — `assignPartnerToMember`, `revokePartnerFromMember`, `getMemberPartnerLink`, mismo patrón loading/error/throw del resto del composable.
- **Deviation backend 1 (Rule 2):** `GET /api/admin/members/:userId/partner-referral` — no existía ninguna ruta que devolviera el detalle del vínculo (nombre/código/fecha/estado) para la ficha; las rutas de 179-09 solo mutan (POST/DELETE). Nuevo método `PartnerReferralService.getMemberPartnerLink`, mismo guard que las hermanas (`assertReferralTargetInScope`, `MEMBER_LIFECYCLE_ROLES`), sin schema de respuesta explícito (mismo criterio que el GET `/referrals` — evita a propósito el Pitfall 4). Manifiesto ISO-01 384 (383→384), 4 tests de integración nuevos.
- **`AssignPlanDialog.vue`** — `pricingDisplay` extendido con `partnerPercent`/`partnerAmount`, tomados directo de `getPricingPreview`/`getChangePlanPreview` sin ninguna price-math nueva (DESC-05). Fila "Descuento partner (%)" en 4 de los 5 bloques que muestran "Descuento referido": Resumen de Precio (step 2), Cambio ahora/reinicia vencimiento, Cambio Programado (after_current) y Confirmación de alta. El quinto bloque ("Mantener Vencimiento") queda deliberadamente sin la fila — ver Decisiones.
- **Deviation backend 2 (Rule 2):** `getChangePlanPreview` (el preview que alimenta el bloque "Cambio ahora/reinicia vencimiento") no tenía `partnerDiscountPercent/Amount` — 179-07 extendió `getPricingPreview` pero no este método hermano, dejando un hueco de paridad preview↔cobro exactamente del tipo que `preview-parity.test.ts` existe para prevenir. Se replicó el mismo orden que `changePlanNow` (partner reduce `netAmount` primero, sin bloque AURA propio; referido sobre el remanente), derivando el tenant de `sub.branchId` (el preview no recibe `branchId` en su firma). Schema de respuesta y tipo `ChangePlanPreview` (API y admin) actualizados. 1 test nuevo de paridad preview↔cobro en `change-plan-charge.test.ts`.

## Task Commits

Cada task se commiteó atómicamente en el worktree `et-179` (rama `feat/179-referidos-partners`), con hooks:

1. **Deviation — GET partner-referral (D-15)** - `7259707f` (feat)
2. **Task 1: Sección Partner en MemberReferralsTab.vue** - `c81463ae` (feat)
3. **Deviation — partnerDiscount en getChangePlanPreview** - `cb478396` (feat)
4. **Task 2: Fila de descuento de partner en AssignPlanDialog.vue** - `b7def27e` (feat)

_Nota: el commit de metadatos de docs (STATE/ROADMAP/SUMMARY) lo maneja el orquestador, no este ejecutor._

## Files Created/Modified

- `el-templo-admin/src/components/MemberReferralsTab.vue` — sección Partner (+286 líneas)
- `el-templo-admin/src/composables/usePartnersApi.ts` — 3 métodos + 4 tipos nuevos (+103 líneas)
- `el-templo-admin/src/components/AssignPlanDialog.vue` — pricingDisplay + 4 filas de descuento (+51 líneas)
- `el-templo-admin/src/types/subscription.ts` — `partnerDiscountPercent/Amount` en `PricingPreview` y `ChangePlanPreview`
- `el-templo-api/src/modules/members/routes.ts` — `GET /:userId/partner-referral`
- `el-templo-api/src/modules/referral-partners/service.ts` — `getMemberPartnerLink`
- `el-templo-api/src/modules/referral-partners/types.ts` — `MemberPartnerLink`
- `el-templo-api/src/modules/subscriptions/service.ts` — `getChangePlanPreview` extendido
- `el-templo-api/src/modules/subscriptions/types.ts` / `schemas.ts` — `ChangePlanPreview` + response schema
- `el-templo-api/test/referral-partners/admin-assign-partner.test.ts` — 4 tests del GET nuevo
- `el-templo-api/test/referral-partners/change-plan-charge.test.ts` — 1 test de paridad preview↔cobro
- `el-templo-api/test/tenancy/iso-01-manifiesto.test.ts` / `test/tenant-manifest.ts` — baseline 383→384

## Decisions Made

Ver `key-decisions` en el frontmatter. Resumen: el plan pedía parity de bloques "Descuento partner" == "Descuento referido" (5 ocurrencias reales de "Descuento referido" en el archivo, aunque el texto del plan decía "son 4"). Los 4 blocks alimentados por un preview server-side (Resumen de Precio, Cambio ahora/reinicia vencimiento, Cambio Programado, Confirmación de alta) tienen paridad completa. El quinto ("Mantener Vencimiento") usa una diferencia tipeada a mano por el admin con una multiplicación cliente-side preexistente solo para referido — replicarla para partner habría violado la restricción explícita del plan de no sumar price-math nueva (`grep "/ 100"` sin cambios vs. `origin/master`, verificado: 2 antes, 2 después). Mismo criterio aplicado a la rama `useOverride` de `pricingDisplay`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Sin GET para leer el vínculo de partner de un socio**

- **Found during:** Task 1, al diseñar el estado "Con vínculo" de la sección Partner
- **Issue:** El must_have D-15 del plan ("ver el vínculo existente") no tiene de dónde leer: 179-09 solo agregó POST (asignar) y DELETE (revocar), ninguna ruta devuelve nombre/código/fecha/estado. `findOriginForMember` (que sí existe) solo informa `kind: 'partner'` sin detalle.
- **Fix:** `PartnerReferralService.getMemberPartnerLink(ctx, referredId)` (join `partner_referrals` + `referral_partners`, mismo shape recortado que `ConversionRow`) + ruta `GET /api/admin/members/:userId/partner-referral`, mismo guard que las rutas hermanas. Sin schema de respuesta explícito (mismo criterio que el GET `/referrals` — evita el Pitfall 4 en vez de tener que mantenerlo sincronizado). Manifiesto ISO-01 bump 383→384 documentado con nota fechada, igual que los bumps anteriores de la fase.
- **Files modified:** `el-templo-api/src/modules/members/routes.ts`, `el-templo-api/src/modules/referral-partners/{service,types}.ts`, `el-templo-api/test/{tenant-manifest.ts,tenancy/iso-01-manifiesto.test.ts,referral-partners/admin-assign-partner.test.ts}`
- **Verification:** `tsc --noEmit` 0 errores; 4 tests nuevos (sin vínculo→null, con vínculo→detalle completo, country-scope 404, sin token 401) + los 10 preexistentes de `admin-assign-partner.test.ts`, 14/14 verdes; `iso-01-manifiesto.test.ts` 11/11 verde con el nuevo baseline
- **Committed in:** `7259707f`

**2. [Rule 2 - Missing Critical] `getChangePlanPreview` sin descuento de partner**

- **Found during:** Task 2, al ubicar los 5 bloques "Descuento referido" antes de editar (paso explícito del `read_first` del plan)
- **Issue:** 179-06/179-07 wirearon "gana el mayor" en las 4 charge-paths + `getPricingPreview`, pero `getChangePlanPreview` (endpoint distinto que alimenta específicamente el bloque "Cambio ahora, reinicia vencimiento") quedó afuera — el admin vería un neto sin descuento de partner que `changePlanNow` sí aplicaría al cobrar, exactamente el tipo de divergencia preview↔cobro que motivó `test/referrals/preview-parity.test.ts` en su momento (bug real ya ocurrido en producción, según el comentario de ese archivo).
- **Fix:** Bloque de partner agregado en `getChangePlanPreview`, mismo orden y helper (`resolvePartnerDiscountCandidate`) que `changePlanNow`: candidato resuelto sobre `sub.branchId` (el preview no recibe `branchId` en su firma, como ya hace `getPricingPreview` con `users.branchId`), aplicado DIRECTO sobre `netAmount` (sin bloque AURA en este flujo), referido computado sobre el remanente. `ChangePlanPreview` (tipo API + admin) y `changePlanPreviewSchema` actualizados (mismo Pitfall 4 ya atrapado una vez en `pricingPreviewResponseSchema`, plan 179-07 — esta vez corregido preventivamente, no descubierto por un test fallando).
- **Files modified:** `el-templo-api/src/modules/subscriptions/{service,types,schemas}.ts`, `el-templo-api/test/referral-partners/change-plan-charge.test.ts`, `el-templo-admin/src/types/subscription.ts`
- **Verification:** `tsc --noEmit` 0 errores (API); 1 test nuevo de paridad preview↔cobro (netAmount del preview === pricePaid del cobro real) + consulta doble no consume el vínculo; `change-plan-charge.test.ts` 9/9 verde, `test/subscriptions/change-plan.test.ts` 17/17 y `test/referrals/preview-parity.test.ts` 7/7 sin regresión
- **Committed in:** `cb478396`

---

**Total deviations:** 2 auto-fixed (ambas Rule 2 — missing critical functionality, requerida por los must_haves D-15 y por el criterio de aceptación de paridad de bloques del propio plan)
**Impact on plan:** Ambas eran bloqueantes para completar el plan tal como estaba escrito (sin la primera, el must_have D-15 "ver el vínculo existente" no tiene datos; sin la segunda, uno de los 4 bloques contados por el plan quedaría sin descuento real). Ningún cambio arquitectural — ambas son métodos/rutas nuevos calcados de patrones ya existentes en los mismos archivos. Sin scope creep hacia otras superficies de la fase 179 (liquidación, CRUD de partners, etc. no se tocaron).

## Issues Encountered

Ninguno bloqueante. Los comandos `vitest run` contra archivos de `test/referral-partners`/`test/subscriptions`/`test/tenancy` superan sistemáticamente el timeout por defecto de 120s del harness (provisioning de la DB de test por worker) — se corrieron en foreground con `MAX_TEST_WORKERS=1` y `--hookTimeout=180000`, monitoreados vía notificación de finalización, nunca con `pgrep`/loops de espera con sleep repetido.

## User Setup Required

None - no requiere configuración de servicios externos.

## Next Phase Readiness

- El ciclo completo de partner queda operable desde las dos superficies donde el staff trabaja con un alumno concreto: la ficha (atribución retroactiva + revocación) y el diálogo de cobro (visibilidad del descuento en los 4 flujos server-previewed).
- El bloque "Mantener Vencimiento" queda como deuda conocida y documentada si en el futuro se decide mostrar ahí el descuento de partner: requeriría un endpoint de preview específico para ese modo (la diferencia manual no pasa hoy por ningún preview), no una multiplicación cliente-side.
- Sin bloqueos.

---

_Phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p_
_Completed: 2026-08-23_

## Self-Check: PASSED

- FOUND: `el-templo-admin/src/components/MemberReferralsTab.vue` (sección Partner)
- FOUND: `el-templo-admin/src/composables/usePartnersApi.ts` (assignPartnerToMember/revokePartnerFromMember/getMemberPartnerLink)
- FOUND: `el-templo-admin/src/components/AssignPlanDialog.vue` (partnerPercent/partnerAmount, 4 filas "Descuento partner")
- FOUND: `el-templo-api/src/modules/members/routes.ts` (GET :userId/partner-referral)
- FOUND: `el-templo-api/src/modules/referral-partners/service.ts` (getMemberPartnerLink)
- FOUND: `el-templo-api/src/modules/subscriptions/service.ts` (getChangePlanPreview con partnerDiscount\*)
- FOUND: commit `7259707f` (GET partner-referral, deviation)
- FOUND: commit `c81463ae` (Task 1)
- FOUND: commit `cb478396` (getChangePlanPreview, deviation)
- FOUND: commit `b7def27e` (Task 2)
- `git -C /home/franco/projects/et-179 status --porcelain` limpio
- `pnpm dlx --package vue-tsc@2.2.12 --package typescript@5.9.3 -- vue-tsc --noEmit -p tsconfig.json` (admin): 20 errores, todos pre-existentes (baseline sin cambios), 0 en archivos del plan
- `pnpm exec eslint` (admin, repo completo): 0 errores, solo warnings pre-existentes ajenos
- `pnpm exec quasar build` (admin): build succeeded
- `pnpm exec tsc --noEmit` (api): 0 errores
- `vitest run test/referral-partners/admin-assign-partner.test.ts`: 14/14 verde
- `vitest run test/referral-partners/change-plan-charge.test.ts`: 9/9 verde
- `vitest run test/tenancy/iso-01-manifiesto.test.ts`: 11/11 verde
- `vitest run test/subscriptions/change-plan.test.ts test/referrals/preview-parity.test.ts`: 24/24 verde
- `.planning/STATE.md` y `.planning/ROADMAP.md` sin tocar
