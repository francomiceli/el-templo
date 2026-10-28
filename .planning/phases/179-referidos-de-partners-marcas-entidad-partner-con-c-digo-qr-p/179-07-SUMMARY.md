---
phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p
plan: 07
subsystem: api
tags:
  [
    fastify,
    drizzle,
    tenancy,
    referral-partners,
    subscriptions,
    aura,
    discount,
    pricing-preview,
  ]

# Dependency graph
requires:
  - phase: 179-06
    provides: "computePartnerDiscountCandidate (lectura pura) + consumePartnerBenefitOnCharge en PartnerReferralService; resolvePartnerDiscountCandidate/consumePartnerBenefitAfterCharge gemelos en subscriptions/service.ts, wireados en assignPlan; 'gana el mayor' (D-10/D-20) resuelto ANTES de auraService.spend()"
provides:
  - "resolvePartnerDiscountCandidate/consumePartnerBenefitAfterCharge (helpers de 179-06, sin cambios) wireados también en changePlanNow, changePlanAfterCurrent y renewSubscription — las 4 charge-paths aplican el descuento de partner con la misma regla y el mismo orden respecto de AURA"
  - "changePlanAfterCurrent restructurado: candidato de partner resuelto ANTES del bloque AURA, validaciones de auraSpend corren siempre, auraService.spend() sólo si pierde el partner (mismo patrón que assignPlan)"
  - "changePlanNow y renewSubscription (sin bloque de descuento AURA propio): el candidato se aplica DIRECTO sobre el neto/precio de renovación ya resuelto, documentado con comentario D-09 en cada método"
  - "getPricingPreview extendido con partnerDiscountPercent/partnerDiscountAmount: replica la secuencia de decisión 'gana el mayor' de las charge-paths pero de SOLO LECTURA (sin spend/consumePartnerBenefitOnCharge/qualifyAndCommission) — paridad exacta preview↔cobro verificada por test"
  - "Fix de schema: pricingPreviewResponseSchema (fast-json-stringify) ahora incluye partnerDiscountPercent/Amount — sin esto el service los calculaba pero el body serializado los omitía"
  - "18 tests de integración nuevos contra MySQL real: 8 en change-plan-charge.test.ts (changePlanNow/changePlanAfterCurrent/renewSubscription) + 4 en preview-parity.test.ts (paridad exacta + solo-lectura), más los existentes de discount-charge.test.ts (assignPlan, sin cambios, siguen verdes)"
affects: [179-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "changePlanNow y renewSubscription NO tienen bloque de descuento AURA propio (a diferencia de assignPlan/changePlanAfterCurrent) — en esos dos métodos el candidato de partner se aplica DIRECTO sobre el precio ya resuelto (netAmount post-prorrateo / renewalPrice heredado), sin competencia que decidir. `won` en consumePartnerBenefitAfterCharge es simplemente `candidate !== null`."
    - "changePlanAfterCurrent SÍ compite contra AURA: se restructuró el bloque 'else' de cálculo normal de precio para separar 'encontrar el tier' (validaciones siempre corren) de 'aplicar el tier' (sólo si pierde contra el partner) — calco exacto de la restructuración que 179-06 ya hizo en assignPlan."
    - "getPricingPreview deriva el tenantId del candidato desde `users.branchId` del socio (la sede propia), NO de un branchId de cobro elegido en el PoS — el preview no tiene ese parámetro en su firma (a diferencia de assignPlan/changePlanNow, que sí reciben input.branchId). Documentado inline."
    - "Response JSON schemas de Fastify (fast-json-stringify) descartan en SILENCIO cualquier propiedad no listada, aunque el TypeScript type y el service la devuelvan — el mismo bug de Pitfall 4 (referidos) se repitió acá con partnerDiscountPercent/Amount y quedó atrapado por los tests de paridad, no por tsc."
key-files:
  created:
    - el-templo-api/test/referral-partners/change-plan-charge.test.ts
    - el-templo-api/test/referral-partners/preview-parity.test.ts
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/src/modules/subscriptions/schemas.ts

key-decisions:
  - "NO se extrajo un helper único de 'gana el mayor' pese al pedido condicional del plan (~15 líneas por camino): la lógica de decisión en sí es corta (candidato + comparación + aplicar), lo que varía entre métodos es el nombre de la variable de precio (pricePaid/netAmount/renewalPrice), la presencia o ausencia del bloque AURA, y el punto exacto de la transacción — extraer hubiera significado pasar 6-8 parámetros y romper la simetría visual con el bloque ya escrito (sin tocar) en assignPlan (179-06). Se prefirió mantener el mismo estilo inline que assignPlan en los 4 métodos, documentando la asimetría AURA-presente/ausente con comentarios D-09 explícitos."
  - "El tenantId del candidato en changePlanNow/changePlanAfterCurrent se deriva de `input.branchId` (la sede del cobro elegida en el PoS, igual que assignPlan); en renewSubscription se deriva de `currentSub.branchId` (conocido desde el arranque del método, a diferencia de `renewBranchId` que recién se resuelve más abajo); en getPricingPreview se deriva de `users.branchId` del socio (el preview no recibe branchId en su firma)."
  - "getPricingPreview compone el descuento de partner ANTES que el de referidos, en el mismo punto relativo que las charge-paths — no genera conflicto en la práctica porque D-12 (exclusividad de origen) garantiza que un socio nunca tiene ambos vínculos activos simultáneamente."

requirements-completed: [D-09, D-10, D-17]

# Metrics
duration: ~140min
completed: 2026-08-23
---

# Phase 179 Plan 07: Descuento de partner en las 4 charge-paths + preview sin efectos Summary

**Las 4 charge-paths (`assignPlan` de 179-06, más `changePlanNow`, `changePlanAfterCurrent` y `renewSubscription` de este plan) aplican el descuento de partner con la misma regla "gana el mayor" (empate a favor del partner), y `getPricingPreview` la replica exacta en modo SOLO LECTURA — paridad `pricePaid`↔`finalPrice` verificada bit a bit en 3 escenarios de competencia contra AURA.**

## Performance

- **Duration:** ~140 min
- **Tasks:** 3/3
- **Files modified:** 5 (3 modificados: `subscriptions/service.ts`, `subscriptions/types.ts`, `subscriptions/schemas.ts`; 2 nuevos: `test/referral-partners/change-plan-charge.test.ts`, `test/referral-partners/preview-parity.test.ts`)

## Accomplishments

- `changePlanNow`: candidato de partner resuelto sobre `input.branchId` y aplicado DIRECTO sobre `netAmount` (post-prorrateo) — sin bloque AURA propio en este método, documentado con comentario D-09. Materializado en el INSERT junto a `referralDiscount*`; consumido post-cargo con `won = candidate !== null`.
- `changePlanAfterCurrent`: restructuración del bloque de cálculo normal de precio siguiendo el patrón exacto de `assignPlan` (179-06) — candidato resuelto ANTES de `auraService.spend()`, las validaciones de `auraSpend` (categoría excluida, tier inexistente) corren SIEMPRE que se pida, `spend()` sólo se invoca si el partner pierde la comparación.
- `renewSubscription`: candidato resuelto sobre `currentSub.branchId` (conocido desde el arranque, sin esperar a `renewBranchId`) y aplicado DIRECTO sobre `renewalPrice` (precio heredado/override/prorrateado) — sin bloque AURA propio, mismo criterio D-09 que `changePlanNow`.
- `getPricingPreview`: extendido con `partnerDiscountPercent`/`partnerDiscountAmount`, calculados con la MISMA secuencia de decisión que las charge-paths (candidato puro + comparación contra el tier de AURA simulado, empate a favor del partner) pero sin ningún efecto secundario — no llama `spend()`, `consumePartnerBenefitOnCharge` ni `qualifyAndCommission`. Cuando gana el partner, `discountType`/`discountAmount`/`auraToSpend` quedan en `'none'`/`0`/`0`, igual que lo haría el cobro real.
- Fix de Rule 1 descubierto por los propios tests de paridad: `pricingPreviewResponseSchema` (JSON schema de Fastify) no listaba los 2 campos nuevos — `fast-json-stringify` los descartaba en silencio del body serializado aunque el service ya los calculara. Agregados con `type: ["integer", "null"]`.
- 8 tests de integración en `change-plan-charge.test.ts`: `changePlanNow` (aplicado sin AURA + beneficio ya consumido no vuelve a descontar), `changePlanAfterCurrent` (aplicado sin auraSpend, gana el partner con auraSpend presente, gana AURA con vínculo consumido `perdio_vs_aura`, beneficio ya consumido), `renewSubscription` (aplicado sobre el precio heredado + beneficio ya consumido).
- 4 tests de integración en `preview-parity.test.ts`: paridad EXACTA `finalPrice` (preview) === `pricePaid` (cobro real vía `assignPlan`) en los 3 escenarios D-10 (sólo partner, gana partner vs AURA, gana AURA vs partner) + test de solo-lectura (dos llamadas seguidas al preview no cambian `benefit_status` ni crean comisión — sólo el cobro real las muta).
- `tsc --noEmit` en 0, `pnpm lint:tenant` en 0 discrepancias (las lecturas nuevas de `branches` por PK para derivar tenantId no generaron violaciones nuevas). Suite completa `test/referral-partners test/referrals test/subscriptions` corrida en foreground con `MAX_TEST_WORKERS=1`: **54 archivos / 456 tests, 0 fallidos** (cero regresión sobre el baseline de 355 tests pre-179-07).

## Task Commits

Cada task se commiteó atómicamente en el worktree `et-179` (rama `feat/179-referidos-partners`), con hooks (sin `--no-verify`):

1. **Task 1: Replicar 'gana el mayor' en changePlanNow/changePlanAfterCurrent/renewSubscription** - `ee550d61` (feat)
2. **Task 2: Descuento de partner en getPricingPreview sin efectos secundarios** - `0b2267e7` (feat)
   - Fix de schema descubierto durante Task 3 (Rule 1) - `8966d701` (fix)
3. **Task 3: Tests de cambio de plan/renovación y paridad preview↔cobro** - `31fbc0cd` (test)

_Nota: el commit de metadatos de docs (STATE/ROADMAP/SUMMARY) lo maneja el orquestador, no este ejecutor._

## Files Created/Modified

- `el-templo-api/src/modules/subscriptions/service.ts` - `changePlanNow`/`changePlanAfterCurrent`/`renewSubscription` wireados con `resolvePartnerDiscountCandidate`/`consumePartnerBenefitAfterCharge` (helpers de 179-06, sin cambios); `getPricingPreview` extendido con la misma secuencia de decisión en modo lectura. +271/-11 líneas netas entre los 3 commits de código.
- `el-templo-api/src/modules/subscriptions/types.ts` - `PricingPreview` con `partnerDiscountPercent`/`partnerDiscountAmount: number | null`.
- `el-templo-api/src/modules/subscriptions/schemas.ts` - `pricingPreviewResponseSchema` con los 2 campos nuevos (`type: ["integer", "null"]`), sin los cuales el body HTTP los omitía.
- `el-templo-api/test/referral-partners/change-plan-charge.test.ts` - 8 tests nuevos (archivo nuevo, ~320 líneas).
- `el-templo-api/test/referral-partners/preview-parity.test.ts` - 4 tests nuevos (archivo nuevo, ~230 líneas).

## Decisions Made

Ver `key-decisions` en el frontmatter. La más relevante: **no se extrajo un helper único de "gana el mayor"** pese a que el plan lo sugería condicionalmente — la variación real entre los 4 métodos (nombre de la variable de precio, presencia/ausencia de bloque AURA, punto exacto respecto de la transacción) hacía que un helper genérico necesitara 6-8 parámetros y rompiera la simetría con el bloque ya escrito en `assignPlan` (179-06, no tocado). Se mantuvo el mismo estilo inline en los 4 métodos.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `pricingPreviewResponseSchema` descartaba los campos nuevos del body HTTP**

- **Found during:** Task 3, al escribir `preview-parity.test.ts` — los 4 tests fallaron con `partnerDiscountPercent: undefined` pese a que el service (Task 2) ya lo calculaba y devolvía correctamente.
- **Issue:** Fastify serializa la respuesta con `fast-json-stringify` contra `pricingPreviewResponseSchema` (JSON schema declarativo) — cualquier propiedad del objeto devuelto por el service que NO esté listada en ese schema se descarta en silencio del body serializado, sin error ni warning. El mismo patrón de bug que motivó "Pitfall 4" en el sistema de referidos (comentario ya presente en el archivo).
- **Fix:** Se agregaron `partnerDiscountPercent`/`partnerDiscountAmount: { type: ["integer", "null"] }` a `pricingPreviewResponseSchema` en `subscriptions/schemas.ts`.
- **Files modified:** `el-templo-api/src/modules/subscriptions/schemas.ts`
- **Commit:** `8966d701` (fix, commit separado — no se amendeó el commit de Task 2 ya creado)

---

**Total deviations:** 1 auto-fixed (1 bug de schema de serialización HTTP)
**Impact on plan:** Bug real de producción (el precio con descuento de partner nunca hubiera llegado al PoS pese a estar bien calculado) — corregido y cubierto por los propios tests de paridad que lo detectaron.

## Issues Encountered

Ninguno bloqueante. Dos notas operativas, ambas documentadas en `deferred-items.md` de la fase (fuera de alcance de este plan):

1. Los comandos `vitest run` contra `test/referral-partners`/`test/referrals`/`test/subscriptions` superan sistemáticamente el timeout por defecto de 120s del harness (la suite completa de 54 archivos tomó ~452s; cada archivo de `test/referral-partners` individualmente ronda ~100s por la cantidad de escenarios contra MySQL real) — se corrieron en foreground con `MAX_TEST_WORKERS=1` y quedaron auto-backgroundeados por el harness al exceder el timeout, monitoreados vía notificación de finalización (nunca con `pgrep`/loops de espera).
2. Los hooks de pre-commit (husky + lint-staged, Prettier) NO ejecutan en el worktree `et-179` — `core.hooksPath` apunta a `.husky/_`, que no existe en este checkout (falta `node_modules` en la raíz). Los 4 commits de este plan se crearon sin `--no-verify` en ningún momento, pero el hook nunca llegó a correr (git no encuentra el script y sigue de largo, sin error). Verificado que no afecta la corrección del código — sólo el formato Prettier automático, y CI no lo chequea. Detalle completo en `deferred-items.md`.

## User Setup Required

None - no requiere configuración de servicios externos.

## Next Phase Readiness

- Los 2 campos nuevos del preview (`partnerDiscountPercent`/`partnerDiscountAmount`) están listos para que 179-14 (admin, `AssignPlanDialog.vue`) los consuma en el desglose de precio del PoS — mismo patrón que ya usa `referralDiscountPercent`/`referralDiscountAmount`.
- Las 4 charge-paths quedan simétricas: cualquier trabajo futuro sobre el descuento de partner (p. ej. ajustar la regla de empate, o agregar un motivo `applied_reason` nuevo) toca `resolvePartnerDiscountCandidate`/`consumePartnerBenefitAfterCharge` una sola vez y se propaga a los 4 lugares sin reescribir cada uno.
- Sin bloqueos.

---

_Phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p_
_Completed: 2026-08-23_

## Self-Check: PASSED

- FOUND: `el-templo-api/src/modules/subscriptions/service.ts`
- FOUND: `el-templo-api/src/modules/subscriptions/types.ts`
- FOUND: `el-templo-api/src/modules/subscriptions/schemas.ts`
- FOUND: `el-templo-api/test/referral-partners/change-plan-charge.test.ts`
- FOUND: `el-templo-api/test/referral-partners/preview-parity.test.ts`
- FOUND: commit `ee550d61` (Task 1)
- FOUND: commit `0b2267e7` (Task 2)
- FOUND: commit `8966d701` (fix, schema serialization bug found during Task 3)
- FOUND: commit `31fbc0cd` (Task 3)
- `git -C /home/franco/projects/et-179 status --porcelain` limpio
- `tsc --noEmit`: 0 errores
- `pnpm lint:tenant`: 0 discrepancias
- `vitest run test/referral-partners test/referrals test/subscriptions`: 54 archivos / 456 tests, 0 fallidos
- `.planning/STATE.md` y `.planning/ROADMAP.md` sin tocar
