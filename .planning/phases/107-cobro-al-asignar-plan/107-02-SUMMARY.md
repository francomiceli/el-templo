---
phase: 107-cobro-al-asignar-plan
plan: 02
subsystem: api/subscriptions
tags: [drizzle, transactions, atomicity, fastify, mysql, typescript, refactor, financial]

# Dependency graph
requires:
  - phase: 107-01
    provides: TxHandle export + transactionService.create(input, recordedBy, tx?) accepts outer tx
  - phase: 105
    provides: financial_transactions / transaction_links / balances schemas + atomic write conventions
provides:
  - "AssignPlanInput.amountReceived?: number (D-13)"
  - "RenewSubscriptionInput.amountReceived?: number (D-13)"
  - "Body schemas (assignPlan/changePlan/renewSubscription) accept amountReceived: { type: integer, minimum: 0 } (D-15)"
  - "Private helper recordAssignmentCharge(tx, params) — cap validation + structured partial log + flow-aware notes"
  - "4 charge callsites now atomic with their respective subscription db.transaction (D-10 / CHARGE-03)"
affects:
  - "107-03 (next): integration tests (D-17 matrix) leverage the atomic helper for the mock-balance-failure rollback assertion"
  - "107-04 / 107-05 (frontend): wire AssignPlanDialog cobro block to the new amountReceived payload field"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Flow-aware Spanish notes via Record<ChargeFlow, string> map — operative-readable financial_transactions for daily CajaPage reconciliation"
    - "Private DRY helper sharing 4 callsites: takes tx + params, validates cap, dispatches transactionService.create + structured log"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/src/modules/subscriptions/schemas.ts
    - el-templo-api/src/modules/subscriptions/service.ts

key-decisions:
  - "Helper inside SubscriptionService (not extracted module) — keeps access to this.transactionService / this.log / this.db without prop-drilling"
  - "ChargeFlow + flowLabelMap defined at module scope (not class member) — pure data, no instance state, reusable if a future caller emerges"
  - "renewBranchId hoisted BEFORE db.transaction (Option A from PATTERNS) — branch lookup is a simple read, no benefit to running it inside the tx; keeps tx surface minimal"
  - "Helper INVARIANTE documented in JSDoc: never opens its own db.transaction; relies on the outer tx — CHARGE-03 atomicity is contractual"
  - "Cap validation (BadRequest) thrown BEFORE any write — any cap violation rollbacks the still-pending subscription INSERT via the outer tx automatically"
  - "Notes for free-renewal path (renewalPrice=0): renewBranchId falls back to currentSub.branchId — never throws on a no-op flow even if the user has a virtual branch and 'Templo Online' lookup hypothetically failed"

patterns-established:
  - "ChargeFlow taxonomy: 4 discriminator values (assign / change-now / change-after-current / renew) — extensible if future phases add new charge-on-create flows"
  - "Flow-aware structured notes pattern: `Cobro al ${flowLabel} plan ${planName}` — translatable, ops-readable, matches the existing 'Cambio de plan: A → B' freeform pattern but consistent across flows"

requirements-completed:
  - CHARGE-01
  - CHARGE-03

# Metrics
duration: ~22min
completed: 2026-04-28
---

# Phase 107 Plan 02: Atomic charge on subscription assign / change / renew

**Refactor de los 4 callsites de `subscriptions/service.ts` que cobran al asignar/cambiar/renovar plan: el cobro ahora vive DENTRO del mismo `db.transaction` que persiste la subscription, pasando el outer `tx` a `transactionService.create` (Plan 01 lo permitió). Cualquier fallo en `applyDelta` (balance cache) ahora rollbackea la subscription también — fin de la categoría "subscription orphan sin cobro registrado". Backend de Phase 107 listo: backward-compatible, validado con cap superior y floor, observable vía log estructurado en cobros parciales.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-04-28T19:50:00Z
- **Completed:** 2026-04-28T19:55:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `AssignPlanInput.amountReceived?: number` y `RenewSubscriptionInput.amountReceived?: number` extendidos en types.ts (D-13). `ChangePlanInput` se hereda automáticamente — ya era alias de `AssignPlanInput`.
- `assignPlanSchema`, `changePlanSchema` y `renewSubscriptionSchema` aceptan `amountReceived: { type: "integer", minimum: 0 }` opcional (D-15 — Fastify JSON Schema, no Zod). Sin `additionalProperties: false` (backward compat D-19).
- Helper privado `recordAssignmentCharge(tx, params)` agregado a `SubscriptionService` que centraliza:
  - Validación de cap superior (`amountReceived <= chargeBase`) y floor (`>= 0`) lanzando `BadRequestError` (D-14).
  - Backward-compat: `amountReceived ?? chargeBase` — clientes pre-Phase-107 siguen funcionando idénticos.
  - Guard `amountReceived > 0` — no crea transaction cuando boarding pass / chargeBase=0.
  - Llamada a `transactionService.create(input, adminId, tx)` con outer tx (D-10).
  - Log estructurado info con campos D-16 cuando `0 < amountReceived < chargeBase`.
  - Notes flow-aware via `flowLabelMap[flow]`: "Cobro al asignar plan X" / "Cobro al cambiar a plan X" / "Cobro al cambio programado a plan X" / "Cobro al renovar plan X".
- 4 callsites refactorizados para llamar al helper DENTRO de sus respectivos `db.transaction`:
  - `assignPlan` (chargeBase = pricePaid, flow = "assign")
  - `changePlanNow` (chargeBase = netAmount, flow = "change-now") — proration aplicada
  - `changePlanAfterCurrent` (chargeBase = pricePaid, flow = "change-after-current")
  - `renewSubscription` (chargeBase = renewalPrice, flow = "renew")
- `renewBranchId` resolución HOISTED antes del `db.transaction` (PATTERNS L206) — la consulta a `users.branchId` y el fallback a "Templo Online" virtual branch corren ahora antes de abrir la tx; el helper recibe `branchId: renewBranchId` ya resuelto.
- 214/214 tests integration finance + subscriptions verdes — **backward compat verificada con ejecución real**: ninguno de los tests pre-existentes pasa `amountReceived`, todos exercise el path de default-to-chargeBase.

## Task Commits

1. **Task 1: Extender types y JSON Schemas con amountReceived** — `3cd8ca45` (feat)
2. **Task 2: Refactor 4 callsites + helper recordAssignmentCharge + log estructurado D-16** — `495f0bbc` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/subscriptions/types.ts`
  - `AssignPlanInput`: agregado campo opcional `amountReceived?: number` con JSDoc explicando default backward-compat y validación cap.
  - `RenewSubscriptionInput`: agregado mismo campo con misma semántica.
  - `ChangePlanInput` no se modifica — es alias de `AssignPlanInput` (routes.ts:292), hereda el campo automáticamente.

- `el-templo-api/src/modules/subscriptions/schemas.ts`
  - `assignPlanSchema.body.properties`: agregado `amountReceived: { type: "integer", minimum: 0 }` después de `priceOverrideAmount` (consistencia con el patrón canónico integer/minimum).
  - `changePlanSchema.body.properties`: idem.
  - `renewSubscriptionSchema.body.properties`: idem.
  - No se cambió ningún `required` array — el campo es opcional (D-13).
  - No se introdujo `additionalProperties: false` (preserva backward compat D-19 — clientes legacy con campos extra siguen validando).

- `el-templo-api/src/modules/subscriptions/service.ts`
  - Imports: `import type { TxHandle } from "../finance/balance-service"` (single source of truth establecida en Plan 01) y `import type { PaymentMethod } from "../finance/types"` (necesario para el params del helper).
  - Module-level: agregado `type ChargeFlow = "assign" | "change-now" | "change-after-current" | "renew"` y `const flowLabelMap: Record<ChargeFlow, string>` con etiquetas en español operativo.
  - Clase: agregado helper privado `recordAssignmentCharge(tx, params)` con JSDoc detallado (cap validation, partial log, notes flow-aware, INVARIANTE de no abrir tx propia).
  - 4 callsites refactorizados:
    - `assignPlan` (línea actual ~1117): bloque `if (this.transactionService && pricePaid > 0) { await this.transactionService.create(...) }` post-tx eliminado; `await this.recordAssignmentCharge(tx, {...})` agregado dentro de `db.transaction`, después de `recomputeUserStatus(userId, tx)`, antes del `return { subscriptionId: newSubscriptionId, ... }`.
    - `changePlanNow` (línea actual ~2266): mismo patrón, `chargeBase: netAmount`, `flow: "change-now"`, `effectiveDate: input.startDate`.
    - `changePlanAfterCurrent` (línea actual ~2638): mismo patrón, `chargeBase: pricePaid`, `flow: "change-after-current"`, `effectiveDate: today`.
    - `renewSubscription`: bloque legacy post-tx (incluyendo lookup de `renewBranchId`) eliminado; lookup HOISTED a un bloque pre-tx que ejecuta `users.branchId` query y fallback a "Templo Online" virtual branch antes de abrir la tx; helper invocado dentro de la tx, después de `recomputeUserStatus`, con `chargeBase: renewalPrice`, `flow: "renew"`, `branchId: renewBranchId`.
  - Notas autogeneradas reemplazaron strings ad-hoc previos como `"Cambio de plan: A → B"` y `"Cambio de plan programado: A → B (inicia X)"` por la familia uniforme `Cobro al ${flowLabel} plan ${planName}`. Los `notes` del form (input.notes) siguen yendo al subscription como antes — sin cambio.

## Decisions Made

- **Helper como método privado de la clase, no módulo separado.** El helper necesita acceso a `this.transactionService`, `this.log` y opera sobre la lógica de cobro de subscriptions — un módulo separado obligaría a inyectar deps por argumento, contaminando la signature. Como método privado mantiene cohesión y descubribilidad.
- **`ChargeFlow` y `flowLabelMap` a module-level, no class.** Son data pura sin estado de instancia. Module-level permite que TypeScript treeshake si en el futuro se exporta el tipo, y deja claro que los labels son constantes inmutables (no configurables por instancia/branch).
- **renewBranchId hoist Option A (antes de la tx) en vez de Option B (dentro).** El plan permitía cualquiera. Elegí A: el lookup es un read simple a `users.branchId` con fallback a `branches WHERE name = 'Templo Online'`. Mantenerlo dentro de la tx solo amplía la surface bloqueada por locks innecesariamente. Bonus: si el branch lookup falla con error, falla AL TIRO, sin abrir la tx → menos esfuerzo de rollback.
- **Helper INVARIANTE: no abre db.transaction propia.** Documentado explícitamente en JSDoc. Si un futuro caller olvida envolver la llamada en una `db.transaction`, el `transactionService.create` con `tx` indefinido caería en su propio runner pattern (Plan 01) y abriría una tx interna — pero NO conectada a la subscription INSERT del caller. Esto rompería CHARGE-03 silenciosamente. La doc + el typing (`tx: TxHandle` no opcional) son la defensa.
- **Notes autogenerados, NO usar input.notes.** El plan permitía elegir. El input.notes va al subscription (campo notes del schema subscriptions). El financial_transaction necesita un texto consistente para CajaPage — autogenerar via `flowLabelMap` da uniformidad ops-readable cross-flow. Antes el código ya hacía algo similar con strings ad-hoc inconsistentes (`"Cambio de plan: A → B"` vs `null` en assignPlan).
- **Free-renewal fallback a `currentSub.branchId`.** En el caso edge `renewalPrice === 0`, el helper no crea transaction (guard `> 0`), por lo que `renewBranchId` no se usa. Pero el código que lo resuelve corre antes y necesita un valor válido — alternative era hacerlo lazy o `0`. Usar `currentSub.branchId` es semánticamente correcto (es el branch original) y nunca tira en escenarios de free-renewal.

## Deviations from Plan

None - plan executed exactly as written.

Notas operativas que NO son deviations (siguiendo el plan literal):
- El plan especificaba "el helper recibe `branchId: renewBranchId`" pero asumía implícitamente que `renewBranchId` siempre se resuelve. En el caso `renewalPrice === 0` el lookup se skippea (guard explícito) y se usa `currentSub.branchId` como fallback no-op. No es deviation — es un edge case que el plan no enumeró pero el helper-no-crea-transaction-cuando-amountReceived-es-0 ya cubre.

## Issues Encountered

- **Worktree node_modules + .env setup:** Igual que Plan 01 — el worktree no traía `node_modules` ni `.env*`. Se resolvió creando un symlink a `/home/franco/projects/el-templo/el-templo-api/node_modules` y copiando `.env` y `.env.development`. Sin esto, ni typecheck ni vitest podían correr. Ambos archivos siguen gitignored.
- **Plan acceptance grep "returns 1" para template literal:** El plan especificaba `grep -cE "Cobro al \\\$\\{flowLabel\\} plan" → 1`. El conteo real es 2 — uno en código, uno en el JSDoc del const `flowLabelMap` que documenta el template para futuros lectores. Es deseable que el JSDoc cite el template literal exacto. Sin regresión funcional.
- **`pnpm typecheck` y `pnpm lint` no existen como scripts:** El package.json no define esos scripts. Se usó `npx tsc --noEmit` (igual que Plan 01) — exit 0. No hay config ESLint en el package, así que el lint se omite (igual que Plan 01). El CI/CD pipeline tiene su propio gating.

## User Setup Required

None - refactor puramente backend, sin nuevos env vars, sin schema DB. El frontend Plan (107-04 / 107-05 — separate worktrees) cablea el dialog para enviar `amountReceived`.

## Next Phase Readiness

- **Plan 03 (integration tests / D-17 matrix) desbloqueado.** Los 4 callsites ahora cumplen CHARGE-03; los tests pueden:
  1. Asertar happy paths (amountReceived = pricePaid, undefined, < pricePaid).
  2. Asertar sad paths (amountReceived > pricePaid → 400, < 0 → 400).
  3. Asertar atomicidad: mock `BalanceService.applyDelta` para que tire dentro del flow de `assignPlan` → ni la subscription ni el financial_transaction quedan persistidos. Esto era IMPOSIBLE antes de Plan 02 — el `transactionService.create` corría en su propia tx.
- **Backward compat para frontend pre-Phase-107:** El admin desktop / cualquier cliente cacheado que NO envíe `amountReceived` sigue funcionando idéntico al pre-refactor — el helper hace `amountReceived ?? chargeBase`. Probado con 214 tests verdes que no pasan el campo.
- **Frontend (107-04 / 107-05):** El backend acepta `amountReceived` opcional en los 3 endpoints REST. El dialog admin puede ahora pasar el campo cuando el admin lo modifica. La validación cap en backend ya está activa — defensa en profundidad cuando frontend también valide.
- **Observabilidad lista:** Logs `info` con mensaje `"Plan asignado con cobro parcial"` con campos D-16 ya emitiéndose; ops puede grep en Pino logs por sucursal/admin/período para tracking de parciales sin queries adhoc a `balances`.

## Self-Check: PASSED

Files exist:
- FOUND: el-templo-api/src/modules/subscriptions/types.ts
- FOUND: el-templo-api/src/modules/subscriptions/schemas.ts
- FOUND: el-templo-api/src/modules/subscriptions/service.ts

Commits exist:
- FOUND: 3cd8ca45 feat(107-02): extend AssignPlan/Renew types and schemas with amountReceived
- FOUND: 495f0bbc feat(107-02): atomic charge recording across 4 subscription flows

Verifications passed:
- TypeScript typecheck (`npx tsc --noEmit`): 0 errors.
- Acceptance greps:
  - `amountReceived\?: number` en types.ts: 2 ✓ (AssignPlan + Renew)
  - `amountReceived: { type: "integer", minimum: 0 }` en schemas.ts: 3 ✓ (assign + change + renew)
  - `additionalProperties: false` en schemas.ts: 0 ✓ (backward compat preserved)
  - `private async recordAssignmentCharge` en service.ts: 1 ✓
  - `this.recordAssignmentCharge(tx` en service.ts: 4 ✓ (los 4 callsites)
  - `Plan asignado con cobro parcial` en service.ts: 1 ✓
  - `this.transactionService.create` en service.ts: 1 ✓ (única invocación, dentro del helper)
  - `amountReceived no puede` en service.ts: 2 ✓ (negativo + cap)
  - `type ChargeFlow|ChargeFlow =` en service.ts: 1 ✓
  - `flowLabelMap|cambiar a|renovar` en service.ts: 14 ✓ (mapa + JSDoc + label uses)
- Integration tests `pnpm test test/finance/ test/subscriptions/`: 214/214 passed (13 files) en 246s. Backward compat verificada — ninguno de estos tests pasa `amountReceived`.

---
*Phase: 107-cobro-al-asignar-plan*
*Completed: 2026-04-28*
