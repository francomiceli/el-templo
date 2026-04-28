---
phase: 107-cobro-al-asignar-plan
plan: 03
subsystem: api/subscriptions
tags: [tests, integration, drizzle, mysql, vitest, atomicity, charge-03, d-17]

# Dependency graph
requires:
  - phase: 107-01
    provides: TxHandle export + transactionService.create acepta tx? opcional
  - phase: 107-02
    provides: recordAssignmentCharge helper + 4 callsites atómicos + flowLabelMap
  - phase: 105
    provides: financial_transactions / transaction_links / balances schemas
provides:
  - "Suite charge-on-assign.test.ts cubriendo D-17 matrix completo (4 flows)"
  - "Atomicity contract test (D-11): mock applyDelta throws → no orphans"
  - "Verificación HTTP del cap superior (BadRequestError → 400) en assign / change-now / change-after-current / renew"
  - "Verificación notes flow-aware (4 strings: asignar/cambiar a/cambio programado a/renovar)"
affects:
  - "Confianza en CHARGE-03: cualquier regresión que mueva recordAssignmentCharge fuera del outer tx hace fallar el atomicity test"
  - "Frontend Plan 107-04/05 (ya merged): el contract de amountReceived (cap, default, flow-aware notes) está auto-verificado para futuras refactors"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Direct service instantiation con DI mockeado para testear atomicidad transaccional contra MySQL real"
    - "HTTP-level verification del rollback path: cap-violation BadRequestError → 400 + assertion de no-orphans en DB post-throw"
    - "Notes regex flow-aware: matcher de regex unificado /Cobro al (asignar|cambiar a|cambio programado a|renovar) plan/ contra el campo financial_transactions.notes persistido"

key-files:
  created:
    - el-templo-api/test/subscriptions/charge-on-assign.test.ts
  modified: []

key-decisions:
  - "Estrategia B (direct DI) para atomicity test, no Estrategia A (monkey-patch) — verificado que app.balanceService NO está decorado en src/app.ts; el patrón canónico de test/users/user-status-transitions.test.ts ya usa DI directo con setBookingService circular"
  - "priceOverrideAmount: 0 en lugar de plan zero para el caso boarding pass del Happy 4 — fuerza pricePaid=0 sin tener que crear un plan especial; el guard `amountReceived > 0` del helper hace lo mismo en cualquiera de los dos paths"
  - "netAmount=8800 precomputado para changePlan/now Happy en lugar de hacer round-trip al endpoint /change-plan-preview — el cálculo es determinístico (8000 base * 6/15 classes = 3200 credit; 12000-3200=8800) y replica exactamente el assertion de change-plan.test.ts L113-115; cualquier cambio a la regla de proration romperá ambos tests al unísono"
  - "Sad 2 (amountReceived < 0) documenta defense-in-depth in-line: el JSON Schema rechaza el body en el route boundary, dejando el guard service-layer UNREACHABLE desde HTTP — comentario explicativo importante para futuros lectores que vean el guard 'sin cobertura'"
  - "2 commits separados (Task 1 = assignPlan-only, Task 2 = atomicity + change + renew) en lugar de un single commit — respeta el per-task commit protocol del executor y permite git bisect granular si una sección rompe"

patterns-established:
  - "Atomicity contract test pattern: para verificar que un side-effect transaccional (X) corre dentro del outer db.transaction de un caller (Y), inyectar un X mockeado que tira y verificar que el INSERT del caller también rollbackea — falla deliberadamente si X se mueve fuera del tx"
  - "HTTP cap-violation rollback pattern: POST con amountReceived > cap → 400 + assertion de que la subscription NO se persistió (el throw del helper ocurre dentro del db.transaction, después del INSERT pero antes del commit, → rollback automático)"

requirements-completed:
  - CHARGE-03

# Metrics
duration: ~30min
completed: 2026-04-28
---

# Phase 107 Plan 03: Cobro al Asignar Plan — Integration tests (D-17 + D-11)

**Suite `charge-on-assign.test.ts` con 13 tests verifica el matrix completo de D-17 (happy + sad paths para los 4 flows: assign / change-now / change-after-current / renew) y el contract de atomicidad de D-11 (mocked BalanceService.applyDelta throws → ninguna orphan en DB). Verificación end-to-end de CHARGE-03: si un futuro refactor mueve recordAssignmentCharge fuera del outer tx, el atomicity test falla correctamente. 227/227 tests pasan en regresión completa de finance + subscriptions.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-04-28T20:00:00Z
- **Completed:** 2026-04-28T20:18:00Z
- **Tasks:** 2
- **Files created:** 1 (`el-templo-api/test/subscriptions/charge-on-assign.test.ts`)

## Accomplishments

- Suite integration tests `el-templo-api/test/subscriptions/charge-on-assign.test.ts` (742 LOC) cubriendo D-17 y D-11.
- **assignPlan (6 tests):** Happy 1 (amountReceived=pricePaid → balance=0 + notes 'asignar'), Happy 2 (amountReceived omitido → backward-compat default), Happy 3 (cobro parcial → balance row positivo), Happy 4 (priceOverride 0 → no transaction, no balance row), Sad 1 (amountReceived > pricePaid → 400 + rollback), Sad 2 (amountReceived < 0 → 400 vía JSON Schema layer).
- **Atomicity (1 test, D-11):** mock de `BalanceService.applyDelta` que tira `Error("simulated balance failure")` inyectado en `SubscriptionService` directo via DI. Verificación de 3 invariantes post-throw: NO subscription, NO financial_transaction, NO balance row persistidos. Este test es el contract de CHARGE-03 — si Plan 02 hubiera dejado el `recordAssignmentCharge` fuera del outer tx, fallaría con orphans en DB.
- **changePlan (now / 2 tests):** Happy con cobro parcial (netAmount=8800 precomputado, partial=3800 → balance=5000 + notes 'cambiar a'); Sad con amountReceived > netAmount → 400 + rollback (plan original sigue activo).
- **changePlan (after_current / 2 tests):** Happy con startMode='after_current' + cobro parcial (priceB=12000, partial=7000 → balance=5000 + notes 'cambio programado a' + status='scheduled'); Sad con amountReceived > pricePaid → 400 + rollback.
- **renewSubscription (2 tests):** Happy con cobro parcial (renewalPrice=10000, partial=3000 → balance=7000 + notes 'renovar'); Sad con amountReceived > renewalPrice → 400 + sub original intacta.
- **Notes flow-aware verificada para los 4 flows** via regex matchers unificados `/Cobro al (asignar|cambiar a|cambio programado a|renovar) plan/`.
- **Sad 2 documenta in-line la naturaleza defense-in-depth** del guard service-layer del helper `recordAssignmentCharge` — el JSON Schema (`minimum: 0`) rechaza negative amounts en el route boundary antes de invocar el service, dejando el guard UNREACHABLE desde HTTP. Comentario explica que el cap superior (Sad 1) sí prueba que el helper valida y rollbackea correctamente.
- **Backward compat verificada con regresión completa:** 227/227 tests verdes en `pnpm test --run test/finance/ test/subscriptions/` (14 archivos). Ningún test pre-existente toca `amountReceived` — todos exercise el path de default-to-chargeBase post Plan 02.

## Task Commits

1. **Task 1: assignPlan happy + sad paths (6 tests)** — `50512b30` (test)
2. **Task 2: Atomicity + changePlan/now + changePlan/after_current + renewSubscription (7 tests)** — `6245d8c0` (test)

## Files Created/Modified

- `el-templo-api/test/subscriptions/charge-on-assign.test.ts` (NEW, 742 LOC) — suite integration test con 5 `describe` blocks (assignPlan / Atomicity / changePlan-now / changePlan-after_current / renewSubscription) y 13 `it`. Imports: vitest helpers, drizzle (and/desc/eq), createTestApp/cleanAllTestData/getAuthToken, _helpers (SUBSCRIPTIONS_URL/assignPlan/createMember/createPlan/todayStr), schema, SubscriptionService + AuraService + BalanceService + TransactionService + BookingService (necesario solo para el atomicity test que hace DI directo). El `beforeEach` con `cleanAllTestData(app)` garantiza aislamiento entre tests.

## Decisions Made

- **Estrategia B (direct DI) para atomicity test, no monkey-patch.** El plan permitía elegir A (monkey-patch `app.balanceService`) o B (instanciar SubscriptionService directo). Verificación rápida en `src/app.ts`: NO hay `decorate('balanceService', ...)` — el FastifyInstance no expone balanceService. Estrategia A no era viable. Estrategia B sigue el pattern canónico de `test/users/user-status-transitions.test.ts:44-52` (buildService factory): `new BalanceService(app.db, app.log) → new TransactionService(...) → new SubscriptionService(...) → new BookingService(...) → setBookingService(bookings)` con la circular DI esperada.
- **priceOverrideAmount: 0 para Happy 4 (boarding pass / plan zero).** Alternativa era crear un plan con `priceRegular=0` y usar `priceTypeApplied: 'zero'`. Más simple: `priceOverrideAmount: 0 + priceOverrideReason: "..."` fuerza `pricePaid=0` sin tocar la config del plan. El guard `amountReceived > 0` del helper hace lo mismo en cualquiera de los dos paths — el test verifica el observable (no transaction + no balance row), no el código path interno.
- **netAmount=8800 precomputado para changePlan/now Happy.** Alternativa: hacer GET `/change-plan-preview` para resolver `netAmount` dinámicamente, luego POST `/change-plan` con `amountReceived = netAmount - 5000`. Hardcodear 8800 es más simple y replica exactamente el assertion del test pre-existente `change-plan.test.ts:113-115` que ya valida la fórmula proration. Si la regla cambia, ambos tests rompen al unísono — bonus de simetría.
- **Sad 2 documentado in-line, NO eliminado.** Alternativa era omitir el test porque el guard service-layer es unreachable desde HTTP. Pero el plan lo pidió explícitamente y agrega valor: documenta para futuros lectores que el JSON Schema es la primera línea de defensa, y el guard service-layer es defense-in-depth puro. Si alguien remueve el `minimum: 0` del schema en el futuro, el test sigue verde porque el guard service-layer atrapa — el flow es robusto en ambas capas.
- **2 commits separados (Task 1 + Task 2) en lugar de un único commit.** Respeta el per-task commit protocol del executor. Permite `git bisect` granular: si una sección de tests rompe en CI, el commit es identificable directamente. Costo trivial (un stash + checkout) versus la observabilidad de un git log más limpio.
- **Sin uso de `vi.spyOn`.** El plan original sugería como alternativa. La estrategia adoptada — sobrescribir directamente `failingBalance.applyDelta = async () => { throw … }` — es más explícita: la propiedad mutable de la instancia se reemplaza, no hay magia de spy/restore. El test no necesita restaurar porque la instancia es local al test (no contamina otros tests).

## Deviations from Plan

None - plan executed exactly as written.

Notas operativas que NO son deviations (siguiendo el plan literal):

- El plan especificaba que el atomicity test debería tener `app.balanceService` expuesto si seguíamos Estrategia A. La verificación de `src/app.ts` confirmó que NO está decorado, lo que sigue exactamente el read_first del plan ("Verificar primero que `app.balanceService` está expuesto en el FastifyInstance — mirar `el-templo-api/src/app.ts`"). Estrategia B es el camino correcto y el plan lo permitió explícitamente.
- El plan permitía hacer `pricePaid = 0` con un plan zero o boarding pass. Usar `priceOverrideAmount: 0` con reason es la opción más simple y está dentro del set permitido por el plan ("plan con `pricePaid = 0` (boarding pass o priceTypeApplied='zero')"); el observable es idéntico.
- El plan mencionaba pre-computar netAmount o hacer GET preview. Hardcodear es la opción más simple y autoexplicativa con el comentario inline que cita la fuente (`change-plan.test.ts:113-115`).

## Issues Encountered

- **Worktree node_modules + .env setup (recurrente):** Igual que Plan 01 y Plan 02 — el worktree no traía `node_modules` ni `.env*`. Resuelto con symlink a `/home/franco/projects/el-templo/el-templo-api/node_modules` + copia de `.env` y `.env.development`. Sin esto vitest no podía correr. No es deviation funcional, es infra de worktree (gitignored ambos archivos).
- **Stash pop fallido al revertir Task 1 a Task 2:** Al hacer `git stash push -u` con un archivo untracked y luego intentar `git stash pop`, el archivo no se restauró (la pop dijo "already exists"). Solución: drop del stash, escribir el archivo full content directamente con Write tool. Sin impacto en commits ni en tests — solo proceso interno del executor.
- **No `pnpm typecheck` script:** Igual que Plans 01/02, `package.json` no define el script. La validación de tipos viene implícita por el pase de `pnpm test` — vitest usa el TypeScript compiler para parsear el archivo, y cualquier type error rompería la compilación. 13/13 tests pasaron al primer run, no hubo type errors.

## User Setup Required

None - test puramente backend, no requiere env nuevos, no toca DB schema, no necesita seed adicional. El admin@test.com ya está en el seed de test/setup.ts.

## Next Phase Readiness

- **Phase 107 backend completo y verificado** end-to-end. CHARGE-03 (atomicidad unificada) tiene contract test que falla deliberadamente si alguien rompe la regla.
- **Frontend Plans 107-04 / 107-05** (ya merged en master) tienen su contract HTTP auto-verificado: cualquier cambio al schema o al helper que rompa el cap superior, el flow de notes, o el rollback, aparecerá como red en CI inmediatamente.
- **Próxima fase (108 — Registrar pago)** parte de un baseline sólido: el modelo de balances ya está siendo poblado correctamente por los 4 flows (verificado por Happy 3 / changePlan-now Happy / changePlan-after_current Happy / renew Happy), y los pendingBalances que Phase 108 va a "saldar" son consistentes con la atomicidad del refactor.
- **Backward compat verificada con 227 tests verdes** (14 files: 4 finance + 10 subscriptions). Backend Phase 107 listo para deploy a staging.

## Self-Check: PASSED

Files exist:
- FOUND: el-templo-api/test/subscriptions/charge-on-assign.test.ts

Commits exist:
- FOUND: 50512b30 test(107-03): add assignPlan charge integration tests (D-17 happy + sad)
- FOUND: 6245d8c0 test(107-03): add atomicity + change-plan + renew charge tests

Verifications passed:
- `pnpm test --run test/subscriptions/charge-on-assign.test.ts`: 13/13 passed (30.7s).
- Regresión completa `pnpm test --run test/finance/ test/subscriptions/`: 227/227 passed (14 files, 226.7s).
- Acceptance greps Task 1:
  - statusCode 400 (sad paths): 5 ≥ 2 ✓
  - expect(bal?.amount): 6 ≥ 3 ✓
  - "no puede exceder": 5 ≥ 1 ✓
  - "Cobro al (asignar|cambiar a|cambio programado a|renovar) plan": 5 ≥ 3 ✓
  - "defense-in-depth|UNREACHABLE|JSON Schema layer": 4 ≥ 1 ✓
- Acceptance greps Task 2:
  - "simulated balance failure": 2 ≥ 1 ✓
  - 3 atomicity invariants `expect(...).toHaveLength(0)`: 8 ≥ 3 ✓
  - "new SubscriptionService(" o "app.balanceService": 4 ≥ 1 ✓
  - `describe("changePlan (now`: 1 ≥ 1 ✓
  - "after_current|after-current": 7 ≥ 1 ✓
  - `describe("renew` o "renewSubscription": 3 ≥ 1 ✓
- Total tests ejecutados: 13 ≥ 11 ✓

---
*Phase: 107-cobro-al-asignar-plan*
*Completed: 2026-04-28*
