---
phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p
plan: 05
subsystem: api
tags: [fastify, drizzle, tenancy, referral-partners, subscriptions, commissions]

# Dependency graph
requires:
  - phase: 179-02
    provides: "PartnerReferralService (CRUD tenancy-native), schema partner_referrals/partner_commissions/referral_partners, fixtures del módulo"
  - phase: 179-04
    provides: "attributePartnerAtSignup + findOriginForMember, vínculo pending creado en el alta público"
provides:
  - "qualifyAndCommission en PartnerReferralService: flip idempotente y race-safe (SELECT previo + UPDATE guardado) + alta de comisión con onDuplicateKeyUpdate por subscription_id (D-11)"
  - "qualifyPartnerOnCharge, helper privado gemelo en subscriptions/service.ts, colgado de las 4 charge-paths (assignPlan:2074, changePlanNow:3788, changePlanAfterCurrent:4206, renewSubscription:4794) — sin guard excludedFromReferrals ni exclusión de prorateToMonthEnd (D-17)"
  - "13 tests de integración contra MySQL real cubriendo idempotencia, monedas ARS/EUR, paquete/especial, commissionType=none, vínculo revoked y las 4 charge-paths"
affects: [179-06, 179-08, 179-09, 179-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El hook 'membresía confirmada' de partners es un ESPEJO deliberado del de referidos (qualifyFirstPayment + recordReferralCredit), nunca lo reusa: dos bloques privados paralelos en subscriptions/service.ts, cada uno con su propio docblock"
    - "SELECT previo + UPDATE con la MISMA cláusula WHERE (status='pending') para el flip — atómico a nivel de fila bajo carrera concurrente, sin necesitar SELECT...FOR UPDATE"
    - "Idempotencia de la comisión por subscription_id (no por partner_referral_id): el flip ocurre una sola vez en el ciclo de vida del vínculo, pero el UNIQUE que importa es 'un cargo no genera dos comisiones aunque se reintente'"
    - "Tenant del cobro derivado por lectura-por-PK de la subscription recién escrita (comentario tenant-safe), DENY con log.warn si no resuelve a number — nunca asume tenant 1"
    - "qualifyPartnerOnCharge envuelve TODO en try/catch con log.warn: la comisión es contabilidad de negocio, nunca revierte un cobro ya efectuado (T-179-23)"
key-files:
  created:
    - el-templo-api/test/referral-partners/qualification-commission.test.ts
  modified:
    - el-templo-api/src/modules/referral-partners/service.ts
    - el-templo-api/src/modules/subscriptions/service.ts

key-decisions:
  - "El UPDATE guardado (misma cláusula que el SELECT previo) se prefiere sobre 'leer y después escribir' por precedente de carrera real (fase 157): MySQL serializa el UPDATE a nivel de fila, así que como mucho una llamada concurrente afecta la fila — la idempotencia real de la comisión la garantiza el UNIQUE de subscription_id + onDuplicateKeyUpdate, no el UPDATE del flip"
  - "commissionId devuelto puede ser 0 en el path de carrera real (dos llamadas concurrentes pasan el SELECT-previo viendo pending, ambas intentan INSERT, la segunda pega el ON DUPLICATE KEY UPDATE y MySQL no re-emite LAST_INSERT_ID en ese caso) — comportamiento aceptado porque subscriptions/service.ts descarta el valor de retorno (best-effort, solo logea)"
  - "Los tests de 'paquete'/'especial' (D-17) insertan el plan crudo vía schema.subscriptionPlans (createPlanSchema del admin API no acepta esas categorías en el enum), mismo patrón que createEspecialPlan de test/referrals/change-plan-charge.test.ts"

requirements-completed: [D-11, D-13, D-17]

# Metrics
duration: ~100min
completed: 2026-08-23
---

# Phase 179 Plan 05: El hook de la plata — cualificación y comisión de partner Summary

**`qualifyAndCommission` (flip idempotente + comisión con onDuplicateKeyUpdate por subscription_id) colgado como helper gemelo `qualifyPartnerOnCharge` en las 4 charge-paths de `subscriptions/service.ts` (assignPlan:2074, changePlanNow:3788, changePlanAfterCurrent:4206, renewSubscription:4794), sin el guard `excludedFromReferrals` que sí aplica a referidos (D-17), con 13 tests de integración verdes contra MySQL real.**

## Performance

- **Duration:** ~100 min
- **Tasks:** 3/3
- **Files modified:** 3 (2 modificados: `referral-partners/service.ts`, `subscriptions/service.ts`; 1 nuevo: `test/referral-partners/qualification-commission.test.ts`)

## Accomplishments

- `PartnerReferralService.qualifyAndCommission(ctx, payerUserId, subscriptionId)`: SELECT previo del vínculo `pending` con `innerJoin` a `referral_partners` (trae `commissionType`/`commissionValue`/`currency`) + UPDATE guardado con la misma cláusula WHERE (`tenantWhere` + `referredId` + `status='pending'`) — idempotente y race-safe, calcado de `qualifyFirstPayment`. INSERT en `partner_commissions` con `onDuplicateKeyUpdate({ set: { subscriptionId } })` — mismo no-op canónico que `recordReferralCredit`. `commissionType='none'` o `commissionValue<=0` flippea sin comisionar.
- `qualifyPartnerOnCharge` en `subscriptions/service.ts`: gate `pricePaid<=0 → return`, deriva el tenant por PK de la subscription recién escrita (comentario `tenant-safe:`, DENY con `log.warn` si no resuelve a `number`), llama a `qualifyAndCommission`, todo envuelto en `try/catch` best-effort. Wireado en las 4 charge-paths con diff aditivo (una línea de llamada + un comentario D-17 en cada punto), sin tocar el bloque de referidos existente.
- 13 tests de integración contra MySQL real: cargo real flippea+comisiona (assignPlan), cargo bonificado no comisiona, idempotencia de re-cobro (llamada directa al service con el mismo `subscriptionId`), un 2do cargo distinto (renovación) sobre un socio ya `qualified` no genera comisión nueva, vínculo `revoked` no flippea, `commissionType='none'` flippea sin comisionar, `paquete` y `especial` SÍ comisionan (D-17, contraste explícito con referidos), moneda ARS y EUR por sede del partner (D-13), y las 4 charge-paths (`changePlanNow`, `changePlanAfterCurrent`, `renewSubscription`) comisionan igual que `assignPlan`.
- `tsc --noEmit` en 0, `pnpm lint:tenant` en 0 discrepancias (el nuevo comentario `tenant-safe:` en `subscriptions/service.ts:596` quedó registrado en el inventario de exenciones), `git diff --name-only origin/master -- el-templo-api/src/modules/referrals/` vacío (regla dura de no tocar ese módulo respetada), suite completa `test/referral-partners test/referrals test/subscriptions` en 48/48 archivos y 416/416 tests verdes (cero regresión).

## Task Commits

Cada task se commiteó atómicamente en el worktree `et-179` (rama `feat/179-referidos-partners`):

1. **Task 1: qualifyAndCommission en PartnerReferralService** - `26e47dd4` (feat)
2. **Task 2: Helper gemelo en subscriptions/service.ts y wiring en las 4 charge-paths** - `1c24d17e` (feat)
3. **Task 3: Tests de cualificación y comisión** - `1d94a5e8` (test)

_Nota: el commit de metadatos de docs (STATE/ROADMAP/SUMMARY) lo maneja el orquestador, no este ejecutor._

## Líneas exactas de las 4 llamadas (para el plan 179-06, que toca los mismos métodos)

| Charge-path              | Método privado que llama | Línea de la llamada a `qualifyPartnerOnCharge` |
| ------------------------ | ------------------------ | ---------------------------------------------- |
| `assignPlan`             | `assignPlan`             | `subscriptions/service.ts:2074`                |
| `changePlanNow`          | `changePlanNow`          | `subscriptions/service.ts:3788`                |
| `changePlanAfterCurrent` | `changePlanAfterCurrent` | `subscriptions/service.ts:4206`                |
| `renewSubscription`      | `renewSubscription`      | `subscriptions/service.ts:4794`                |

El bloque de helpers privados "Partners (fase 179)" (docblock + `qualifyPartnerOnCharge`) arranca en `subscriptions/service.ts:571`, inmediatamente después del bloque de referidos existente.

## Files Created/Modified

- `el-templo-api/src/modules/referral-partners/service.ts` - `qualifyAndCommission` (+116 líneas, incluido el docblock que justifica el UPDATE guardado y la idempotencia por `subscription_id`)
- `el-templo-api/src/modules/subscriptions/service.ts` - import de `PartnerReferralService`, bloque privado `qualifyPartnerOnCharge` + docblock, 4 llamadas aditivas en las charge-paths
- `el-templo-api/test/referral-partners/qualification-commission.test.ts` - 13 tests nuevos (agrupados en 4 `describe`: assignPlan core, D-17 categorías, D-13 monedas, las 4 charge-paths)

## Decisions Made

Ver `key-decisions` en el frontmatter. La más relevante para el resto de la fase: **la idempotencia de la comisión va por `subscription_id`, no por `partner_referral_id`** — el flip del vínculo ocurre una sola vez en su ciclo de vida, pero lo que hay que blindar es que un cargo concreto no genere dos comisiones aunque se reintente. Esto es simétrico al patrón `unique_referral_credit_sub` que ya usa `referral_credits`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Branch ES insertada en runtime sin caja efectivo**

- **Found during:** Task 3, test "(10) partner de sede ES → currency='EUR'"
- **Issue:** `assignPlan` con `paymentMethod: "cash"` sobre una sede ES insertada por el test (`insertBranch(app, { country: "ES" })`) devolvía 400 "No existe caja efectivo para la sucursal 6" — `TransactionService.create()` hard-throws cuando una sede sin caja efectivo recibe un cargo cash (Fase 138). Las sedes sembradas por `test/setup.ts` traen caja; las insertadas en runtime no.
- **Fix:** Se agregó `ensureEfectivoCaja(app, esBranch.id, "EUR")` (helper preexistente de `test/helpers.ts`, ya usado por otros archivos del repo para este mismo caso) antes del `assignPlan`.
- **Files modified:** `el-templo-api/test/referral-partners/qualification-commission.test.ts`
- **Commit:** `1d94a5e8` (incluido en el commit de Task 3, sin commit separado — se detectó y corrigió antes del primer commit del archivo)

---

**Total deviations:** 1 auto-fixed (1 blocking, fixture gap del test — no un bug de negocio)
**Impact on plan:** Sin impacto en el código de producción. El fix es puramente de fixture de test.

## Issues Encountered

- La suite completa con `MAX_TEST_WORKERS` default (4) mostró 14 archivos rojos de `test/referrals` con "Login failed for admin@test.com" — el flake local conocido de worker-DB envenenada (`eltemplo_test_1` con schema pero sin seed por una corrida previa interrumpida), documentado en la memoria `reference_test_db_flake_worker_envenenada`. Re-corrida con `MAX_TEST_WORKERS=1` (cada archivo aislado, sin compartir DB de worker) dio 14/14 archivos y 94/94 tests verdes — confirmado que no es una regresión de este plan. La verificación final completa (`test/referral-partners test/referrals test/subscriptions`, 48 archivos / 416 tests) también corrió con `MAX_TEST_WORKERS=1` y quedó 100% verde.

## User Setup Required

None - no requiere configuración de servicios externos.

## Next Phase Readiness

- `qualifyAndCommission` y `qualifyPartnerOnCharge` quedan listos para que 179-06 (descuento de partner en el alta/cobro) cuelgue del mismo punto sin reabrir este archivo desde cero — las líneas exactas de las 4 charge-paths están documentadas arriba.
- El descuento de partner (179-06) SÍ debe usar `excludedFromReferrals` + `!prorateToMonthEnd` (a diferencia de la comisión de este plan) — el contraste ya está anotado en comentarios de una línea en cada charge-path.
- `partner_commissions` queda con filas `status='pending'` listas para el reporte de conversiones y la liquidación batch (179-09/179-10).
- Sin bloqueos.

---

_Phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p_
_Completed: 2026-08-23_

## Self-Check: PASSED

- FOUND: `el-templo-api/test/referral-partners/qualification-commission.test.ts`
- FOUND: commit `26e47dd4` (Task 1)
- FOUND: commit `1c24d17e` (Task 2)
- FOUND: commit `1d94a5e8` (Task 3)
- `git -C /home/franco/projects/et-179 status --porcelain` limpio
- `git diff --name-only origin/master -- el-templo-api/src/modules/referrals/` vacío
- `.planning/STATE.md` y `.planning/ROADMAP.md` sin tocar
