---
phase: 107-cobro-al-asignar-plan
plan: 01
subsystem: api/finance
tags: [drizzle, transactions, atomicity, fastify, mysql, typescript, refactor]

# Dependency graph
requires:
  - phase: 105-modelo-de-datos-drop-del-viejo
    provides: TransactionService.create + BalanceService.applyDelta atómico (TXN-05/06/07)
  - phase: 106-endpoints-transaccionales
    provides: REST endpoint POST /api/admin/transactions (caller backward-compat smoke)
provides:
  - "TxHandle exportado desde balance-service.ts (single source of truth)"
  - "TransactionService.create acepta tx?: TxHandle opcional via runner pattern"
  - "JSDoc de invariante en applyDelta documentando la regla anti-this.db"
affects:
  - 107-02 (subscriptions/service.ts envolverá transactionService.create dentro de su db.transaction outer)
  - 107-03 (test de atomicidad apoyado en este refactor)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional-tx runner pattern para servicios que pueden correr standalone o nested en una db.transaction externa"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/finance/balance-service.ts
    - el-templo-api/src/modules/finance/transaction-service.ts

key-decisions:
  - "Single source of truth para TxHandle: exportado desde balance-service.ts; transaction-service.ts lo importa, NO duplica"
  - "Runner pattern explícito (cb => cb(tx) || this.db.transaction(cb)) en vez de nesting via tx.transaction — Drizzle MySQL2 dispatch limpio sin riesgo de 'transaction already started'"
  - "Comentario JSDoc en applyDelta como defensa estática contra futuro refactor que swappee tx por this.db"

patterns-established:
  - "TxHandle export pattern: type Drizzle tx-handle exportado a nivel módulo finance, reusable por callers internos"
  - "Optional-tx runner: el caller ofrece tx para nesting; default a this.db.transaction si no se provee"

requirements-completed: [CHARGE-03]

# Metrics
duration: ~5min
completed: 2026-04-28
---

# Phase 107 Plan 01: Cobro al Asignar Plan — Refactor TransactionService para tx opcional

**TransactionService.create() ahora acepta `tx?: TxHandle` con runner pattern: callers (Plan 02) pueden envolver create() dentro de su propia db.transaction para atomicidad real subscription+cobro; el endpoint REST sigue funcionando idéntico (fallback abre db.transaction propia).**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-28T22:39:00Z
- **Completed:** 2026-04-28T22:44:21Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `TxHandle` promovido a tipo público en `balance-service.ts` (single source of truth para el módulo finance).
- `TransactionService.create()` ahora acepta tercer parámetro opcional `tx?: TxHandle`; cuando se provee, todas las queries internas (member exists, branch exists, link probes, INSERT financial_transactions, INSERT transaction_links, applyDelta) corren contra esa conexión.
- Backward-compat **verificada con tests reales** (100/100 finance tests verdes, sin modificar archivos de test): cuando el caller no pasa `tx`, el runner cae al `this.db.transaction(cb)` y el comportamiento es idéntico al pre-refactor.
- JSDoc de invariante en `applyDelta` documenta que todas las queries del body DEBEN usar el `tx` recibido, nunca `this.db` (mitigación T-107-01 en el threat model).

## Task Commits

1. **Task 1: Export TxHandle desde balance-service.ts** — `26663b0d` (feat)
2. **Task 2: TransactionService.create acepta tx? opcional con runner pattern** — `e493b13e` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/finance/balance-service.ts` — `type TxHandle` → `export type TxHandle`; agregado JSDoc de invariante (todas las queries usan `tx`, nunca `this.db`) sobre `applyDelta`. Body de `applyDelta` sin cambios.
- `el-templo-api/src/modules/finance/transaction-service.ts` — Import `TxHandle` desde balance-service. Signature `create(input, recordedBy, tx?: TxHandle)`. Runner pattern: cuando `tx` provisto, reusa esa conexión; cuando no, abre `this.db.transaction`. Variable interna del callback renombrada de `tx` → `txHandle` para no colisionar con el parámetro outer. `balanceService.applyDelta(txHandle, ...)` recibe el handle resuelto por el runner.

## Decisions Made

- **Runner explícito (no nested tx.transaction):** Drizzle MySQL2 no soporta nested transactions con savepoints automáticos del modo que el plan necesita; el runner pattern explícito es la solución mecánica más simple — un `if tx then cb(tx) else this.db.transaction(cb)` — y evita la categoría de bug "transaction already started" cuando un caller pasa un `tx` activo.
- **TxHandle exportado, no duplicado:** Plan permitía duplicar el tipo en `transaction-service.ts`. Elegí exportar desde `balance-service.ts` (single source of truth) — es el patrón canónico DRY y mañana cuando Plan 02 también lo importe queda claro de dónde viene.
- **Variable inner renombrada `tx` → `txHandle`:** El parámetro outer se llama `tx`; el callback de `db.transaction` también recibía `tx`. Renombrar el inner a `txHandle` elimina shadowing y deja el código auto-documentado: `tx` es lo que viene de afuera (puede ser undefined), `txHandle` es lo que se usa adentro (siempre definido, resuelto por el runner).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **Worktree setup gap (no deviation, infra-level):** El worktree `agent-a70358a0f12871ac7` no tenía `node_modules` ni `.env*`. Se resolvió creando un symlink a `/home/franco/projects/el-templo/el-templo-api/node_modules` y copiando `.env` y `.env.development`. Ambos archivos están gitignored y no se commitearon. Sin este setup, ni typecheck ni vitest podían correr.
- **Plan acceptance grep sutil:** El plan especificaba `grep -c "this\.db\.(insert|update|delete|select)" balance-service.ts` retornando `0`. El archivo SÍ tiene `this.db.select(...)` pero todos en read methods públicos (lines 196, 216, 240, 265) — fuera de `applyDelta`. La intención del check (todas las queries del body de applyDelta usan tx) está cumplida; el grep regex solo matchea single-line (no hay `this.db.select` en una línea, todos son chained: `await this.db\n.select(...)`), por eso devuelve 0. No hay regresión.

## User Setup Required

None - refactor puramente interno del módulo finance. No env vars nuevos, no schema DB.

## Next Phase Readiness

- **Plan 02 (subscriptions/service.ts refactor) desbloqueado.** Ahora puede:
  ```ts
  await this.db.transaction(async (outerTx) => {
    const subId = await outerTx.insert(subscriptions)...
    if (this.transactionService && amountReceived > 0) {
      await this.transactionService.create(input, adminId, outerTx); // ← nesting works
    }
    // si applyDelta tira, todo rollbackea junto
  });
  ```
- **Tests de atomicidad (Plan 03)** pueden ahora mockear `balanceService.applyDelta` para que tire dentro del flow de `assignPlan`, y verificar que la subscription también rollbackeó. Antes de este plan ese test era imposible porque el `transactionService.create` corría en su propia tx independiente.
- **Sin riesgo de regresión en producción:** los 4 callsites legacy en `subscriptions/service.ts` (L1117 assignPlan, L2271 changePlanNow, L2641 changePlanAfterCurrent, L2927 renew) siguen llamando `transactionService.create(input, adminId)` sin `tx` y se comportan idéntico al pre-refactor. Plan 02 los migrará uno por uno.

## Self-Check: PASSED

Files exist:
- FOUND: el-templo-api/src/modules/finance/balance-service.ts
- FOUND: el-templo-api/src/modules/finance/transaction-service.ts

Commits exist:
- FOUND: 26663b0d feat(107-01): export TxHandle and document applyDelta atomicity invariant
- FOUND: e493b13e feat(107-01): TransactionService.create accepts optional tx for nested atomicity

Verifications passed:
- TypeScript typecheck (`tsc --noEmit`): 0 errors.
- Finance integration tests (`vitest run test/finance/transaction-service.test.ts test/finance/transactions-api.test.ts`): 100/100 passed (152.6s duration).
- Grep checks: `^export type TxHandle` matches in balance-service.ts; `tx\?: TxHandle` and `const runner = tx` match in transaction-service.ts; `import .*TxHandle.*from .\\./balance-service` matches (no duplicate type).

---
*Phase: 107-cobro-al-asignar-plan*
*Completed: 2026-04-28*
