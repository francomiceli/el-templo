---
phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p
plan: 06
subsystem: api
tags:
  [fastify, drizzle, tenancy, referral-partners, subscriptions, aura, discount]

# Dependency graph
requires:
  - phase: 179-02
    provides: "PartnerReferralService (CRUD tenancy-native), schema partner_referrals (benefit_status/applied_*/benefit_expires_at) y partner_commissions, fixtures del módulo"
  - phase: 179-05
    provides: "qualifyPartnerOnCharge (cualificación+comisión, sin exclusiones D-17) colgado de assignPlan, columnas partnerDiscountPercent/Amount ya en schema+migración 0209"
provides:
  - "computePartnerDiscountCandidate (lectura pura, sin efectos secundarios) + consumePartnerBenefitOnCharge (UPDATE guardado por benefit_status='pending', idempotente vía affectedRows) en PartnerReferralService"
  - "resolvePartnerDiscountCandidate + consumePartnerBenefitAfterCharge, helpers gemelos en subscriptions/service.ts, wireados SOLO en assignPlan (las otras 3 charge-paths quedan para 179-07)"
  - "'Gana el mayor' (D-10/D-20) resuelto ANTES de auraService.spend(): el candidato de partner se calcula por lectura pura, luego se compara contra el tier AURA solicitado (empate a favor del partner) — si gana el partner, spend() NUNCA se llama"
  - "partner_discount_percent/partner_discount_amount materializados en el INSERT de subscriptions; el vínculo se consume con applied_reason='aplicado' (ganó) o 'perdio_vs_aura' (perdió pero la primera cuota ya pasó, applied_percent=0)"
  - "10 tests de integración contra MySQL real: aplicado, one-shot, gana partner, gana AURA, empate, exclusiones D-17 (paquete/especial), alta prorrateada, beneficio vencido, free_pass"
affects: [179-07, 179-08, 179-09, 179-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "computePartnerDiscountCandidate es deliberadamente una LECTURA PURA (sin UPDATE ni INSERT): se llama ANTES de saber si el partner gana contra AURA, así que llamarla más de una vez nunca cambia una fila — la escritura vive únicamente en consumePartnerBenefitOnCharge, invocada DESPUÉS de resuelto el ganador"
    - "partnerWins = candidato.percent >= (tier?.percent ?? 0): una sola fórmula cubre tanto 'hay competencia de AURA' como 'no se pidió AURA' (tier undefined → baseline 0, cualquier candidato con percent>0 gana solo) — evita duplicar el bloque de aplicación de descuento en dos ramas separadas"
    - "El tenantId para el candidato (ANTES del INSERT de subscriptions, sin fila propia todavía) se deriva de branches.id=input.branchId — a diferencia de qualifyPartnerOnCharge/consumePartnerBenefitAfterCharge (AMBOS post-INSERT), que leen por PK de subscriptions.tenantId, mismo patrón 'tenant-safe' de 179-05"
    - "Motivo auditable 'perdio_vs_aura' con applied_percent=0/applied_amount=0: el beneficio se consume aunque no redujo el precio, porque 'la primera cuota' ya pasó (D-09) — evita que el socio reclame el descuento en un cobro futuro sobre el mismo vínculo"
key-files:
  created:
    - el-templo-api/test/referral-partners/discount-charge.test.ts
  modified:
    - el-templo-api/src/modules/referral-partners/service.ts
    - el-templo-api/src/modules/subscriptions/service.ts

key-decisions:
  - "El candidato de descuento sólo se resuelve dentro de la rama 'Normal price calculation' de assignPlan (la única que compite con AURA) — las ramas de alta prorrateada, boarding pass y price override NUNCA llaman a resolvePartnerDiscountCandidate, así que las exclusiones D-17 (prorateToMonthEnd, categorías especial/paquete) quedan garantizadas por construcción y no por un guard adicional en cada rama"
  - "consumePartnerBenefitAfterCharge no-opea cuando candidate===null (nunca hubo candidato) o cuando won=false && pricePaid<=0 (un mes 100% bonificado no 'usa' la primera cuota real del socio) — mismo umbral pricePaid>0 que qualifyPartnerOnCharge/qualifyReferralOnCharge de 179-05/157"
  - "El test one-shot (D-09) usa un SEGUNDO cargo REAL en una categoría distinta (online_regular, grantsAllPrograms) en vez de cancelar+reasignar: prueba que el vínculo YA consumido es lo que bloquea el descuento, no una exclusión de categoría (que hubiera dado un falso positivo con 'especial'/'paquete')"

requirements-completed: [D-09, D-10, D-17, D-20]

# Metrics
duration: ~70min
completed: 2026-08-23
---

# Phase 179 Plan 06: Descuento de partner one-shot y gana-el-mayor vs AURA Summary

**`resolvePartnerDiscountCandidate` resuelve el candidato de descuento de partner por lectura pura ANTES del bloque AURA en `assignPlan`; `partnerWins = candidato.percent >= (tier?.percent ?? 0)` decide sin ambigüedad quién gana (empate a favor del partner) y, si gana el partner, `auraService.spend()` nunca se invoca — 10 tests de integración contra MySQL real, incluida la aserción explícita de saldo AURA intacto.**

## Performance

- **Duration:** ~70 min
- **Tasks:** 3/3
- **Files modified:** 3 (2 modificados: `referral-partners/service.ts`, `subscriptions/service.ts`; 1 nuevo: `test/referral-partners/discount-charge.test.ts`)

## Accomplishments

- `PartnerReferralService.computePartnerDiscountCandidate(ctx, userId)`: SELECT puro sobre `partner_referrals` filtrando `benefit_type='discount_percent'`, `benefit_status='pending'`, `status<>'revoked'` y `benefit_expires_at > now()` (D-07, vencimiento evaluado en lectura) — sin `update(` ni `insert(` en el método, verificado a mano y por revisión de código.
- `PartnerReferralService.consumePartnerBenefitOnCharge(ctx, userId, subscriptionId, applied)`: `UPDATE` guardado con `benefit_status='pending'` en la misma cláusula WHERE del filtro — devuelve `true` sólo si `affectedRows>0`, así que un doble consumo concurrente es imposible y una segunda llamada nunca pisa los valores ya grabados por la primera.
- `subscriptions/service.ts`: `resolvePartnerDiscountCandidate` (helper privado, aplica `excludedFromReferrals(planCategory) || prorateToMonthEnd` → `null` antes de tocar la tabla) llamado dentro de la rama "Normal price calculation" de `assignPlan`, ANTES de las validaciones de `auraSpend`. `partnerWins` se computa con una sola fórmula (`candidato.percent >= (tier?.percent ?? 0)`) que cubre tanto la competencia real contra un tier de AURA como el caso sin `auraSpend` solicitado. Si gana el partner: `pricePaid`, `partnerDiscountPercent`/`Amount` se setean y `auraService.spend()` JAMÁS se llama; si pierde (o no había candidato), el bloque AURA corre exactamente como antes.
- `partnerDiscountPercent`/`partnerDiscountAmount` materializados en el `INSERT` de `subscriptions`, junto a `referralDiscount*` existentes.
- `consumePartnerBenefitAfterCharge`: helper post-INSERT (mismo lugar donde 179-05 cuelga `qualifyPartnerOnCharge`) que llama a `consumePartnerBenefitOnCharge` con `reason:'aplicado'` (ganó) o `reason:'perdio_vs_aura'` con `percent=0`/`amount=0` (perdió pero `pricePaid>0`, la primera cuota igual pasó) — envuelto en `try/catch` best-effort (T-179-23): el cobro ya ocurrió y nunca se revierte por un fallo de anotación.
- 10 tests de integración contra MySQL real: descuento aplicado + vínculo consumido, one-shot (2do cargo real en otra categoría NO repite el descuento), gana el partner (30% vs tier AURA 10%, saldo AURA verificado antes/después bit a bit), gana AURA (10% vs tier 30%, `applied_percent=0`/`applied_reason='perdio_vs_aura'`, puntos SÍ gastados), empate a favor del partner, D-17 con planes `paquete` y `especial` (sin descuento pero la comisión SÍ se genera — contraste cruzado con 179-05), alta prorrateada (sin descuento, beneficio sigue `pending`), beneficio vencido (sin descuento, `benefit_status` sigue `pending`, D-07), vínculo `free_pass` (nunca produce descuento porcentual).
- `tsc --noEmit` en 0, `pnpm lint:tenant` en 0 discrepancias (las dos nuevas lecturas `tenant-safe` — candidato pre-INSERT por `branches.id` y consumo post-INSERT por PK de `subscriptions` — quedaron auto-registradas en el inventario de exenciones vía comentario), `git diff --name-only origin/master -- el-templo-api/src/modules/referrals/` vacío (regla dura respetada), suite completa `test/referral-partners test/referrals test/subscriptions` en 50/50 archivos y 430/430 tests verdes (cero regresión).

## Task Commits

Cada task se commiteó atómicamente en el worktree `et-179` (rama `feat/179-referidos-partners`):

1. **Task 1: computePartnerDiscountCandidate + consumePartnerBenefitOnCharge** - `d2a64d5d` (feat)
2. **Task 2: Orden gana-el-mayor en assignPlan y materialización de partner*discount*\*** - `9a4fed37` (feat)
3. **Task 3: Tests del descuento y del gana-el-mayor** - `1ff755c0` (test)

_Nota: el commit de metadatos de docs (STATE/ROADMAP/SUMMARY) lo maneja el orquestador, no este ejecutor._

## Files Created/Modified

- `el-templo-api/src/modules/referral-partners/service.ts` - `computePartnerDiscountCandidate` (lectura pura) + `consumePartnerBenefitOnCharge` (UPDATE guardado, idempotente por `affectedRows`), +99 líneas
- `el-templo-api/src/modules/subscriptions/service.ts` - import `AuraDiscountTier`, declaración de `partnerBenefitCandidate`/`partnerBenefitWon`/`partnerDiscountPercent`/`partnerDiscountAmount`, helper `resolvePartnerDiscountCandidate`, reordenamiento del bloque AURA de `assignPlan` (candidato ANTES de `spend()`, `partnerWins` decide), materialización en el INSERT, helper post-cargo `consumePartnerBenefitAfterCharge` + su llamada tras `qualifyPartnerOnCharge`, +202/-8 líneas
- `el-templo-api/test/referral-partners/discount-charge.test.ts` - 10 tests nuevos (archivo nuevo, 519 líneas)

## Decisions Made

Ver `key-decisions` en el frontmatter. La más relevante para 179-07 (que replica esta lógica en `changePlanNow`/`changePlanAfterCurrent`/`renewSubscription`): **el candidato sólo se resuelve dentro de la rama de cálculo normal de precio** — las ramas de alta prorrateada / boarding pass / price override de `assignPlan` nunca invocan `resolvePartnerDiscountCandidate`, así que las exclusiones D-17 quedan garantizadas por construcción (no por un guard repetido). Las otras 3 charge-paths de 179-07 tendrán su propia rama de cálculo normal a identificar caso por caso.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Colisión de nombre de plan en el test one-shot (D-09)**

- **Found during:** Task 3, test "(2) one-shot"
- **Issue:** El segundo `createPlan` del test no sobreescribía `name`, así que reusaba el nombre default de `basePlan` ("Plan Flex Mensual") con el mismo `country` que el primer plan del test — la UNIQUE `(name, country)` de `subscription_plans` devolvía 409 en vez del 201 esperado.
- **Fix:** Se agregó `name: \`Plan Online D-09 ${seq}\``al segundo`createPlan`.
- **Files modified:** `el-templo-api/test/referral-partners/discount-charge.test.ts`
- **Commit:** `1ff755c0` (incluido en el commit de Task 3, corregido antes del primer commit del archivo)

---

**Total deviations:** 1 auto-fixed (1 bug de fixture de test)
**Impact on plan:** Sin impacto en el código de producción. El fix es puramente de fixture de test.

## Issues Encountered

None — la corrida completa (`test/referral-partners test/referrals test/subscriptions`, 50 archivos / 430 tests) con `MAX_TEST_WORKERS=1` quedó verde en el primer intento tras el fix de la deviation de arriba.

## User Setup Required

None - no requiere configuración de servicios externos.

## Next Phase Readiness

- `resolvePartnerDiscountCandidate`/`consumePartnerBenefitAfterCharge` quedan documentados con la forma exacta que 179-07 debe replicar en las otras 3 charge-paths (`changePlanNow`, `changePlanAfterCurrent`, `renewSubscription`): identificar la rama de cálculo normal de precio de cada una, insertar la resolución del candidato ANTES de su bloque AURA respectivo, y colgar el consumo post-cargo junto a la llamada existente de `qualifyPartnerOnCharge`.
- `computePartnerDiscountCandidate`/`consumePartnerBenefitOnCharge` en `PartnerReferralService` son reutilizables tal cual desde cualquier charge-path — no necesitan cambios para 179-07.
- Sin bloqueos.

---

_Phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p_
_Completed: 2026-08-23_

## Self-Check: PASSED

- FOUND: `el-templo-api/test/referral-partners/discount-charge.test.ts`
- FOUND: commit `d2a64d5d` (Task 1)
- FOUND: commit `9a4fed37` (Task 2)
- FOUND: commit `1ff755c0` (Task 3)
- `git -C /home/franco/projects/et-179 status --porcelain` limpio
- `git diff --name-only origin/master -- el-templo-api/src/modules/referrals/` vacío
- `.planning/STATE.md` y `.planning/ROADMAP.md` sin tocar
