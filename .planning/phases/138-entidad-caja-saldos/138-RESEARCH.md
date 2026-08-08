# Phase 138: Entidad caja + saldos - Research

**Researched:** 2026-06-24
**Domain:** Backend finance module (Fastify + Drizzle ORM + MySQL) — new `cash_registers` entity, automatic caja resolver, derived firm balance, currency guard, migration 0154
**Confidence:** HIGH (based on direct reads of the 137 schema, transaction-service, balance-service, seed, and migration precedents)

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 — Resolver 100% automático por `paymentMethod`** (no selector, no override):
  - `cash` → caja **efectivo de la sucursal** (`type='efectivo', branch_id = tx.branchId`, moneda de la sucursal).
  - `transfer` / `card` → caja **banco de la moneda** (`type='banco', currency = tx.currency`).
  - `aura_credit` / `internal` → **ninguna caja** (`cash_register_id = NULL`).
- **D-02 — `resolveCashRegister(paymentMethod, branchId, currency)`** vive en 138 como función reutilizable. La fase 140 la **reusa**, no la reinventa. Necesario en 138 porque el backfill la usa y `getBalance` no significa nada sin `cash_register_id` poblado.
- **D-03 — Sin override manual** en 138.
- **D-04 — caja ≠ sucursal.** `branchId` (NOT NULL) = dónde se cobró; `cash_register_id` (NULL) = adónde fue la plata. Caja efectivo sucursal = `type='efectivo', branch_id=X`; efectivo central = `type='efectivo', branch_id=NULL`; banco = `type='banco', branch_id=NULL`, **una por moneda** (ARS + EUR). Moneda se deriva del `country` de la sucursal (AR→ARS, ES→EUR).
- **D-05 — cajas arrancan limpias desde una fecha de corte** (go-live), NO backfill completo del histórico al saldo.
- **D-06 — Saldo = saldo de apertura (por caja, default 0) + Σ validados de esa caja DESDE la fecha de corte.** Las históricas (antes del corte) se etiquetan con `cash_register_id` derivado solo para historial/reportes, pero **excluidas del saldo** vía la fecha de corte. Fecha de corte = **única global del módulo**; saldo de apertura = **por caja**.
- **D-07 — saldos de apertura reales se cargan por migración** (no seed re-run), cuando Franco haga el conteo físico. En 138 la columna arranca en 0.
- **D-08 — Saldo DERIVADO en v1** (`SUM` con índice), NO materializado. La firma de `getBalance` debe ocultar si es derivado o cacheado. Reusa `firmMoneyConditions()` de 137.
- **D-09 — Guard de moneda:** asociar a una caja un monto de moneda ≠ a su `currency` lanza error (espejo de `BadRequestError` "Moneda inconsistente" de `balance-service.ts`).
- **D-10 — backend-only.** NO UI (display = fase 141; UI editar apertura = fase 142). Se prueba por integration tests.

### Claude's Discretion

- Forma exacta del schema del saldo de apertura. **Recomendación CONTEXT:** columnas `opening_balance` + `opening_date` en `cash_registers` (saldo "derivado + constante de apertura"). Esta research confirma y refina abajo.
- Cómo `getBalance` expresa la fecha de corte en el `SUM` (filtro `transaction_date >= cutoff` vs. flag por caja).
- Estructura interna de `CashRegisterService` (facade pattern) y dónde vive el resolver.
- Si el seed de cajas efectivo×sucursal cubre solo sucursales activas AR o también la virtual/Barcelona (Barcelona = EUR, su efectivo es caja EUR).
- Naming/REST shape de cualquier endpoint `getBalance` (138 es backend-only — endpoint opcional; el consumidor real es 141).

### Deferred Ideas (OUT OF SCOPE — IGNORE)

- Toda UI (saldo por caja, bandeja, editar apertura) → fases 141/142.
- Movimientos inter-caja (`cash_transfer`) y egresos (`expense`) → fase 139.
- Carga única dead-simple del profe → fase 140.
- Override manual de la caja del pago → descartado.
- Materialización del saldo (cache `applyDelta`) → diferido.
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                                                       | Research Support                                                                                                                                                     |
| ------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CAJA-01 | Cajas como entidad: efectivo×sucursal + efectivo central + banco por moneda (ARS+EUR); cada caja `currency` fija. | New `cash_registers` schema (below) + seed strategy. Branch list from seed-production.ts confirms 5 physical + 1 virtual, all AR today.                              |
| CAJA-02 | Cada pago se asocia a una caja (`cash_register_id`), distinta de `branchId`.                                      | Nullable FK column + `resolveCashRegister` wired into the **single** insert path (`transaction-service.ts:215`). Create-path audit table is the core deliverable.    |
| CAJA-03 | Saldo firme = Σ VALIDADOS (derivado v1); pendientes aparte, no suman.                                             | `getBalance` mirrors `getSummary` (`transaction-service.ts:1152`) per `cash_register_id`, reusing `firmMoneyConditions()`. Opening balance + cutoff model from D-06. |
| CAJA-04 | Una caja nunca mezcla monedas: rechaza monto de moneda ≠ a la suya.                                               | Currency guard mirrors `balance-service.ts:154-158`. Recommended enforcement point analyzed below.                                                                   |

</phase_requirements>

## Summary

Phase 138 is a tightly-scoped backend foundation that sits directly on top of phase 137's `firm-money.ts` and `validation_status`. The good news from the code audit: **there is exactly ONE runtime INSERT into `financial_transactions`** — `transaction-service.ts:215` inside `TransactionService.create()`. Every other create path (the REST route, all 4 `recordAssignmentCharge` callers, the enrollment add-on, and the void→correct re-create) funnels through `create()`. This means the resolver only needs to be wired in **one place** (plus the input plumbing to carry `cashRegisterId` through), which dramatically de-risks CAJA-02 versus the 14-call-site audit that 137 had to do.

The balance computation (`getBalance`) is a near-clone of `getSummary` (`transaction-service.ts:1152`): same `SUM(amount)` + `innerJoin(branches)` + `direction='inflow'` + `firmMoneyConditions()` pattern, but grouped/filtered by `cash_register_id` and with the D-06 cutoff added. The currency guard is a direct mirror of the existing `applyDelta` guard. The hardest design choices are: (1) where exactly the currency guard fires, and (2) how the cutoff-date + per-caja opening-balance is modeled — both resolved with concrete recommendations below.

**Primary recommendation:** Add `cash_register_id` (nullable FK) to `financial_transactions`; create `cash_registers` with `opening_balance` + `cutoff_date` columns; put `resolveCashRegister` + `getBalance` + the currency guard inside a new `CashRegisterService` (finance facade); wire the resolver into `CreateTransactionInput` → `transaction-service.ts:215` so it auto-populates on every create where `paymentMethod ∈ {cash, transfer, card}`; hand-write migration 0154 (the `sessions.goal_plan_type` drift WILL block `db:generate` again — confirmed below).

## Architectural Responsibility Map

| Capability                                      | Primary Tier                   | Secondary Tier         | Rationale                                                                              |
| ----------------------------------------------- | ------------------------------ | ---------------------- | -------------------------------------------------------------------------------------- |
| `cash_registers` entity + seed                  | Database / Storage             | —                      | New table; seed at migration time (D-07).                                              |
| `cash_register_id` column on ledger             | Database / Storage             | —                      | Additive nullable FK.                                                                  |
| `resolveCashRegister(method, branch, currency)` | API / Backend (finance facade) | —                      | Pure derivation; reused by 140. Belongs in `CashRegisterService`.                      |
| Wiring resolver into create path                | API / Backend                  | —                      | Single insert site (`transaction-service.ts:215`); resolver fills the new input field. |
| `getBalance` (derived firm balance)             | API / Backend                  | Database (indexed SUM) | Read aggregation; mirrors `getSummary`.                                                |
| Currency guard                                  | API / Backend                  | —                      | Application-level invariant; mirror of `applyDelta` guard.                             |
| Historical backfill                             | Database / Storage (migration) | —                      | One-shot SQL in 0154; labels-only, excluded from saldo by cutoff.                      |

## Standard Stack

### Core

| Library                  | Version         | Purpose                         | Why Standard                                                               |
| ------------------------ | --------------- | ------------------------------- | -------------------------------------------------------------------------- |
| drizzle-orm (mysql-core) | already in repo | Schema + query builder          | Project standard; `cash_registers` follows existing `mysqlTable` patterns. |
| Fastify                  | already in repo | HTTP + Pino logger              | Project standard; `CashRegisterService` takes `FastifyBaseLogger`.         |
| vitest                   | already in repo | Integration tests vs real MySQL | Existing `test/finance/*` pattern.                                         |

**Zero new dependencies.** [CITED: .planning/research/modulo-contable/STACK.md — "cero dependencias nuevas"] The entire milestone is built on the existing stack. Do NOT install anything (project rule: never install/update deps without asking).

### Alternatives Considered

| Instead of                                    | Could Use                                         | Tradeoff                                                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Derived `SUM` balance                         | Materialized cache like `balances` (`applyDelta`) | D-08 explicitly defers this — premature debt; volume is 8 sedes. Derived is correct for v1.                                                                                   |
| `opening_balance` columns on `cash_registers` | A synthetic `kind='adjustment'` opening tx        | CONTEXT recommends columns ("derivado + constante de apertura"). A tx would re-enter the ledger and complicate the cutoff filter. Columns are cleaner. **Recommend columns.** |
| `cutoff_date` global constant                 | Per-caja `cutoff_date` column                     | D-06 says cutoff is **global**, opening_balance is **per-caja**. A single global cutoff is simpler; see open question on storage location.                                    |

**Installation:** None. (Verified: no new packages required.)

## Package Legitimacy Audit

**Not applicable** — Phase 138 installs zero external packages. All work uses libraries already present in `el-templo-api` (drizzle-orm, fastify, vitest). No registry verification needed.

## Architecture Patterns

### System Architecture Diagram

```
                          ┌─────────────────────────────────────────┐
  CREATE PATH (write)     │  Callers of TransactionService.create() │
                          └─────────────────────────────────────────┘
  POST /transactions (routes.ts:179) ─┐
  recordAssignmentCharge (subs svc) ──┤   (4 callers: assign/change/
  enrollment add-on (enroll svc:398) ─┤    scheduled/renew)
  correct() re-create (txsvc:654) ────┤
                                      ▼
                         TransactionService.create(input, recordedBy, tx?)
                                      │
                          ┌───────────┴───────────┐
                          │ resolveCashRegister(   │  ← NEW (CashRegisterService)
                          │   input.paymentMethod, │     cash → efectivo(branch)
                          │   input.branchId,      │     transfer/card → banco(currency)
                          │   input.currency)      │     aura/internal → NULL
                          └───────────┬───────────┘
                                      │ cashRegisterId (or NULL)
                          ┌───────────▼───────────┐
                          │ currency guard         │  ← NEW: caja.currency === tx.currency
                          └───────────┬───────────┘
                                      ▼
                    INSERT financial_transactions (txsvc:215)
                      ... + cash_register_id           ← NEW column
                                      │
                                      ▼
                         applyDelta (balances) — UNCHANGED

  ───────────────────────────────────────────────────────────────────

  READ PATH (balance)
  CashRegisterService.getBalance(cashRegisterId) ── NEW
       │
       ├─ SELECT opening_balance, cutoff_date FROM cash_registers WHERE id=X
       │
       ├─ firme = opening_balance
       │        + Σ(amount) WHERE cash_register_id=X
       │              AND direction='inflow'
       │              AND firmMoneyConditions()           ← reused from 137
       │              AND transaction_date >= cutoff_date  ← D-06
       │
       └─ pendiente = Σ(amount) WHERE cash_register_id=X
                          AND validation_status='pendiente'
                          AND voided_at IS NULL
                          AND transaction_date >= cutoff_date   (shown separately, CAJA-03)
```

### Recommended Project Structure

```
el-templo-api/src/
├── db/schema/cash-registers.ts          # NEW — cash_registers table + relations
├── db/schema/financial-transactions.ts  # MODIFIED — + cash_register_id nullable FK + index
├── db/schema/index.ts                   # MODIFIED — export ./cash-registers
├── db/migrations/0154_cash_registers.sql # NEW — table + column + seed + backfill (hand-written)
├── modules/finance/
│   ├── cash-register-service.ts         # NEW — resolveCashRegister + getBalance + guard
│   ├── transaction-service.ts           # MODIFIED — wire resolver into create() insert
│   ├── types.ts                         # MODIFIED — + cashRegisterId on CreateTransactionInput
│   └── routes.ts                        # MODIFIED (optional) — GET balance endpoint (or defer to 141)
└── test/finance/
    └── cash-register-service.test.ts    # NEW — seed, resolver, getBalance, guard, invariants
```

### Pattern 1: Facade-style domain service in `modules/finance/`

**What:** `CashRegisterService` constructed with `(db, log)` like `BalanceService`, holding `resolveCashRegister`, `getBalance`, and the currency guard.
**When to use:** All finance domain logic (project rule: facade pattern in `modules/finance/`).
**Example:**

```typescript
// Source: el-templo-api/src/modules/finance/balance-service.ts (constructor pattern)
export class CashRegisterService {
  constructor(
    private readonly db: MySql2Database<typeof schema>,
    private readonly log: FastifyBaseLogger,
  ) {}
  // resolveCashRegister(...), getBalance(...)
}
```

### Pattern 2: Resolver reused at the single insert site

**What:** `create()` calls `resolveCashRegister` and stamps `cash_register_id` on the insert. Because `CreateTransactionInput` already flows through `create()`, the resolver runs once and covers ALL create paths.
**Where:** `transaction-service.ts:213-236` (the `.values({...})` block).
**Decision for the planner:** Two options for _who_ calls the resolver:

- **(A, recommended)** `create()` itself calls `resolveCashRegister(input.paymentMethod, input.branchId, input.currency ?? 'ARS')` and stamps the result — every caller is automatically covered, zero edits to the 4 `recordAssignmentCharge` callers or enrollment. Mirrors how `validationStatus ?? 'validado'` already defaults inside `create()`.
- **(B)** Each caller resolves and passes `cashRegisterId` in the input (like 137 passed `recorderRole`). More explicit but requires touching every caller and risks a missed path.
- **Recommendation: (A).** The single-insert-site reality makes (A) both safer and DRYer. Allow an optional `input.cashRegisterId` override slot only if a future caller needs to pre-resolve (e.g. 139 movimientos) — default to resolver when undefined.

### Pattern 3: getBalance mirrors getSummary

**What:** Reuse the exact `SUM(amount)` + `innerJoin(branches)` + `direction='inflow'` + `firmMoneyConditions()` shape from `getSummary` (`transaction-service.ts:1152-1187`), scoped to one `cash_register_id` and gated by `transaction_date >= cutoff_date`.

```typescript
// Mirror of transaction-service.ts:1153-1187
const firmConds: SQL[] = [
  eq(schema.financialTransactions.cashRegisterId, cashRegisterId),
  eq(schema.financialTransactions.direction, "inflow"),
  ...firmMoneyConditions(), // not voided AND validado
  gte(schema.financialTransactions.transactionDate, cutoffDate), // D-06
];
const [row] = await this.db
  .select({
    total: sql<number>`COALESCE(SUM(${schema.financialTransactions.amount}), 0)`,
  })
  .from(schema.financialTransactions)
  .where(and(...firmConds));
const firme = openingBalance + Number(row?.total ?? 0);
```

### Anti-Patterns to Avoid

- **Resolving caja per-caller (option B above) without a fallback in `create()`.** A future caller that forgets to resolve silently writes `cash_register_id = NULL` for a cash inflow → invisible to the balance. Centralize in `create()`.
- **Backfilling historical cash into the saldo.** D-05 is emphatic: that money already moved/was deposited and the withdrawals were never recorded (movimientos start in 139). The backfill stamps `cash_register_id` for _history/reports only_; the cutoff excludes it from `getBalance`.
- **A single global "banco" caja.** D-04: one banco per currency (ARS + EUR). The currency isolation is inherited from the ledger.
- **Mutating `cash_registers.opening_balance` via a tx.** Opening balance is a constant set by migration (D-07), not a ledger entry.

## Don't Hand-Roll

| Problem                     | Don't Build                                                       | Use Instead                                        | Why                                                                                    |
| --------------------------- | ----------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| "Firm money" predicate      | A new `voided_at IS NULL AND validation_status='validado'` inline | `firmMoneyConditions()` from `firm-money.ts`       | 137's single source of truth; if it changes, caja inherits automatically (D-08).       |
| Currency isolation          | Custom per-report currency math                                   | Per-caja `currency` column + guard at insert       | Ledger already never mixes currencies; caja inherits.                                  |
| Balance SUM aggregation     | A new query from scratch                                          | Clone `getSummary` (`transaction-service.ts:1152`) | Same indexed `SUM` + join pattern, proven.                                             |
| Branch → country → currency | Hardcoded branch-id→currency map                                  | `branches.country` (AR/ES) → ARS/EUR               | `country` column already authoritative; `country-scope.ts:160` shows the read pattern. |

**Key insight:** This phase is almost entirely _composition of existing pieces_ (firm-money filter, getSummary shape, applyDelta guard, branches.country). The only genuinely new logic is the resolver's 3-way branch and the cutoff/opening-balance arithmetic.

## Runtime State Inventory

> This phase ADDS a table and a column; it is not a rename. But it has a backfill + seed obligation, so the relevant "runtime state" question is: _what existing data must be populated for the new column to be meaningful?_

| Category            | Items Found                                                                                                                    | Action Required                                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stored data         | `financial_transactions` historical rows have NO `cash_register_id`. After the column is added they are NULL until backfilled. | Migration 0154 backfill: derive `cash_register_id` from `(payment_method, branch_id, currency)` per D-01 rule — labels only, excluded from saldo by cutoff.                                                            |
| Stored data         | `cash_registers` table is empty at creation.                                                                                   | Migration 0154 seed: 1 efectivo per active physical branch (currency from branch.country), 1 efectivo central (`branch_id=NULL`), 1 banco ARS, 1 banco EUR. **Seed MUST run before backfill** (FK targets must exist). |
| Live service config | None — no external service stores caja state.                                                                                  | None.                                                                                                                                                                                                                  |
| OS-registered state | None.                                                                                                                          | None — verified, no cron/scheduler touches caja in 138.                                                                                                                                                                |
| Secrets/env vars    | None — no new env var.                                                                                                         | None. (No `.env.example` update needed.)                                                                                                                                                                               |
| Build artifacts     | None — schema change auto-picked-up by `$inferSelect`; no compiled artifact carries caja.                                      | None.                                                                                                                                                                                                                  |

**Backfill derivation SQL (per D-01, history-only):**

- `payment_method='cash'` → efectivo caja WHERE `branch_id = ft.branch_id` (match on currency too).
- `payment_method IN ('transfer','card')` → banco caja WHERE `currency = ft.currency`.
- `payment_method IN ('aura_credit','internal')` → leave `cash_register_id` NULL.
- This is a set of `UPDATE financial_transactions ft JOIN cash_registers cr ... SET ft.cash_register_id = cr.id WHERE ...` statements. **Watch the project rule: never `;` inside SQL comments** (the runner splits on `;` before stripping `--`).

## Create-Path Audit (THE core deliverable — CAJA-02)

**Finding:** There is exactly **ONE** runtime INSERT into `financial_transactions`: `transaction-service.ts:215` inside `TransactionService.create()`. All create paths converge here. The backfill script (`scripts/backfill-historical-payments.ts:473`) is a one-off historical-import script, NOT a runtime path — it does not need the resolver (handled by the migration backfill instead).

| #   | File : line                                   | Insert context                                                                    | Reaches `create()`?      | paymentMethods that flow                            | Needs `cash_register_id`?                                                                                                                                                                               |
| --- | --------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `finance/transaction-service.ts:215`          | The **single** `.insert(financialTransactions).values({...})` inside `create()`.  | — (this IS the site)     | all 5                                               | **YES — stamp here.** Resolver runs in `create()`; populates for cash/transfer/card, NULL for aura_credit/internal.                                                                                     |
| 2   | `finance/routes.ts:179`                       | `POST /api/admin/transactions` → `transactionService.create(...)`.                | ✅                       | admin-chosen (any)                                  | Covered by #1. No edit if option A.                                                                                                                                                                     |
| 3   | `subscriptions/service.ts:296`                | `recordAssignmentCharge` → `transactionService.create(...)` (kind=`plan_charge`). | ✅                       | `params.paymentMethod` (cash/transfer/card typical) | Covered by #1.                                                                                                                                                                                          |
| 4   | `subscriptions/service.ts:1211`               | `recordAssignmentCharge` caller (assign plan).                                    | ✅ (via #3)              | inherits                                            | Covered by #1.                                                                                                                                                                                          |
| 5   | `subscriptions/service.ts:2798`               | `recordAssignmentCharge` caller (change plan).                                    | ✅ (via #3)              | inherits                                            | Covered by #1.                                                                                                                                                                                          |
| 6   | `subscriptions/service.ts:3141`               | `recordAssignmentCharge` caller (scheduled change).                               | ✅ (via #3)              | inherits                                            | Covered by #1.                                                                                                                                                                                          |
| 7   | `subscriptions/service.ts:3462`               | `recordAssignmentCharge` caller (renew).                                          | ✅ (via #3)              | inherits                                            | Covered by #1.                                                                                                                                                                                          |
| 8   | `programs/enrollment-service.ts:398`          | Add-on enrollment → `transactionService.create(...)` (kind=`plan_charge`).        | ✅                       | `input.paymentMethod ?? 'cash'`                     | Covered by #1.                                                                                                                                                                                          |
| 9   | `finance/transaction-service.ts:654`          | `correct()` re-creates the corrected row → `this.create(newInput, ...)`.          | ✅                       | copies `original.paymentMethod`                     | Covered by #1. Re-resolution is correct: the corrected row gets a fresh cash_register_id.                                                                                                               |
| 10  | `scripts/backfill-historical-payments.ts:473` | One-off import script, direct `tx.insert(financialTransactions)`.                 | ❌ (bypasses `create()`) | historical                                          | **NOT runtime.** Handled by migration 0154 backfill SQL, not the resolver. No code change needed if the script is not re-run; if it is ever re-run post-138, add resolver there too (flag for planner). |

**Conclusion:** Wiring the resolver into `create()` (option A) covers paths #1-#9 with a single edit. Path #10 is out of the runtime hot path and handled by the migration backfill. This is materially simpler than 137's 14-site audit.

**aura_credit / internal note:** These correctly resolve to `cash_register_id = NULL` (D-01). They are not firm cash in any caja. `getBalance` never sees them (it filters `cash_register_id = X`). Verify with a test that an `aura_credit` charge produces NULL and does not appear in any caja balance.

## Branch → Currency / Seed Mapping

**Active branches (from `seed-production.ts:43-80`):**

| name                   | code    | isVirtual | country (default) | currency | Needs efectivo caja?       |
| ---------------------- | ------- | --------- | ----------------- | -------- | -------------------------- |
| El Templo Alem         | ALEM    | false     | AR                | ARS      | ✅                         |
| El Templo Constitucion | CONST   | false     | AR                | ARS      | ✅                         |
| El Templo Jujuy        | JUJUY   | false     | AR                | ARS      | ✅                         |
| El Templo Mogotes      | MOGOTES | false     | AR                | ARS      | ✅                         |
| El Templo Moreno       | MORENO  | false     | AR                | ARS      | ✅                         |
| Templo Online          | ONLINE  | true      | AR                | ARS      | **Discretion — see below** |

**Key findings:**

- `branches.country` defaults to `'AR'` and **no seed sets ES today** (verified: no `'ES'`/Barcelona branch in `seed-production.ts`). [VERIFIED: codebase grep — no ES branch rows] So at go-live, **all efectivo cajas are ARS**. The banco EUR caja is seeded for forward-compat (D-04 mandates it) but will have zero transactions until an ES branch exists.
- **Currency derivation is `country`-based, not hardcoded.** The existing read pattern is `branches.country` → AR/ES (`country-scope.ts:116,160-170`). The seed should derive currency as `country === 'ES' ? 'EUR' : 'ARS'`. There is **no existing branch→currency helper function** — the mapping lives implicitly in `financial_transactions.currency` (default `'ARS'`) and in `country-scope`. Recommend a tiny `countryToCurrency(country)` helper (or inline the ternary) in the seed/resolver.
- **Virtual branch (ONLINE):** `isVirtual=true`. Online payments are almost always transfer/card → banco caja, not efectivo. **Recommendation:** do NOT seed an efectivo caja for the virtual branch (it would never receive cash). Seed efectivo only for `isVirtual=false AND isActive=true` branches (mirrors the seed-production pattern at line 261: `eq(branches.isVirtual, false), eq(branches.isActive, true)`). Flag as a discretion decision for discuss/plan.
- **Barcelona / EUR:** No Barcelona branch exists yet. When one is added (`country='ES'`), the seed logic `efectivo per active physical branch with currency = countryToCurrency(country)` automatically gives it an EUR efectivo caja. Banco EUR already exists. **Make the seed derive currency from country so it is future-proof, rather than hardcoding ARS.**

**Recommended seed set (go-live):**

- 5 efectivo cajas (ALEM, CONST, JUJUY, MOGOTES, MORENO), all ARS, `branch_id` = respective branch.
- 1 efectivo central: `type='efectivo', branch_id=NULL, currency='ARS'`.
- 1 banco ARS: `type='banco', branch_id=NULL, currency='ARS'`.
- 1 banco EUR: `type='banco', branch_id=NULL, currency='EUR'`.
- **Total: 8 cajas.** All `opening_balance=0`, `cutoff_date` = go-live date (single global value).

**Seed-must-precede-backfill ordering** (D-06 integration point): the migration must INSERT cajas, then `UPDATE financial_transactions ... JOIN cash_registers`. FK requires the targets to exist first.

## getBalance Pattern & Cutoff/Opening-Balance Model

**Recommended schema (resolving the Discretion item):**

```
cash_registers:
  opening_balance int NOT NULL DEFAULT 0     -- conteo físico inicial por caja (D-06/D-07)
  cutoff_date     date NOT NULL              -- go-live; transactions before this excluded from saldo
```

**Cutoff storage decision (Discretion):** D-06 says cutoff is a **single global** value, opening_balance is **per-caja**. Two valid models:

- **(A, recommended) `cutoff_date` column on each caja, seeded with the same global value.** Pros: `getBalance` is a pure self-contained query (no second table read); a future per-caja go-live (staggered rollout per sede) is trivially supported. Cons: the "global" invariant is convention, not enforced.
- **(B) A single `finance_settings` row holding one global `cutoff_date`.** Pros: literally enforces "one global." Cons: needs the settings table (which was partially dismantled in 136-07 per memory) and a join/extra read in getBalance.
- **Recommendation: (A).** Keeps 138 self-contained (no settings-table dependency, which is itself an open question for 142), and a per-caja cutoff column is strictly more flexible. Seed all cajas with the same `cutoff_date`. Document that "global" is enforced by seed convention.

**getBalance return shape (recommended):**

```typescript
interface CashRegisterBalance {
  cashRegisterId: number;
  currency: string; // the caja's fixed currency
  firmeBalance: number; // opening_balance + Σ validados since cutoff
  pendienteAmount: number; // Σ pendientes since cutoff (shown SEPARATELY, CAJA-03)
}
```

- `firmeBalance` uses `direction='inflow' AND firmMoneyConditions() AND transaction_date >= cutoff`.
- `pendienteAmount` uses `validation_status='pendiente' AND voided_at IS NULL AND transaction_date >= cutoff` — **NOT added** to firme. This is the CAJA-03 invariant.
- **Outflows note:** In 138 there are no outflows in a caja yet (movimientos/egresos are 139). `getBalance` may include `direction='inflow'` only for now; design the signature so 139 can extend to net inflow−outflow without changing callers (D-08: hide derivation details). Recommend computing firme as `opening + Σ(signed amount)` where for 138 only inflows exist — or explicitly inflow-only with a comment that 139 adds the outflow term. **Flag for planner:** decide whether `getBalance` SUMs `direction='inflow'` only (simplest, correct for 138) or a signed expression now (forward-compatible). Recommend inflow-only with a clear TODO marker for 139.

**Confirmation:** `firmMoneyConditions()` returns `[isNull(voidedAt), eq(validationStatus,'validado')]` — exactly the firm filter to reuse. [VERIFIED: firm-money.ts:32-37]

## Currency Guard (CAJA-04 / D-09)

**Existing precedent** (`balance-service.ts:154-158`):

```typescript
if (sub.currency !== transaction.currency) {
  throw new BadRequestError(
    `Moneda inconsistente: la suscripcion es ${sub.currency}, la transaccion es ${transaction.currency}`,
  );
}
```

**Where to enforce — analysis:**

- **(A, recommended) Inside `create()`, right after the resolver returns a `cashRegisterId`.** Load the resolved caja's `currency` and assert `caja.currency === (input.currency ?? 'ARS')`; throw `BadRequestError("Moneda inconsistente: ...")` if not. This guards the actual write site — nothing can persist a mismatched association. It also naturally covers all create paths (same single-insert-site logic).
- **(B) Inside `resolveCashRegister`.** The resolver already takes `currency`; it could refuse to return a caja whose currency mismatches. But the resolver's _banco_ branch resolves _by_ currency, so a mismatch there is structurally impossible; the _efectivo_ branch resolves by branch, so the branch's caja currency could differ from `tx.currency` (e.g. an EUR cash payment recorded at an ARS branch — a real error to catch). So the guard belongs where efectivo is resolved.
- **(C) At insert time as a DB constraint.** Not feasible cleanly (cross-row check); application-level is the precedent.
- **Recommendation: combine A+B.** Put the assertion inside `resolveCashRegister` (it has both the caja currency and `tx.currency` in hand) so the guard travels with the resolver and 140/139 inherit it for free. Mirror the exact `BadRequestError` message style. Add a defensive re-check in `create()` only if option A's plumbing makes it cheap. The cleanest single home is **the resolver**, because the resolver is the one reusable choke-point (D-02) that every future caller passes through.

**Test must cover:** resolving an efectivo caja for a branch whose currency ≠ the tx currency throws "Moneda inconsistente"; a banco resolution always matches by construction.

## Migration 0154 — Hand-Write (the `db:generate` drift WILL recur)

**Confirmed drift:** `sessions.goal_plan_type` is `varchar("goal_plan_type", { length: 30 })` in the schema [VERIFIED: sessions.ts:25]. This is the column that triggered the interactive prompt in 137 and forced hand-writing 0153. **The same drift will block `pnpm db:generate` for 0154.** [ASSUMED from CONTEXT note + confirmed drift source] — plan to **hand-write 0154** following the 0153/0151 precedent.

**0153 precedent** (`migrations/0153_validation_status.sql`): plain `ALTER TABLE ... ADD COLUMN ... ADD INDEX`, comments use `--` with **no `;` inside them**, enum order matches the schema byte-for-byte.

**0154 must contain (in order):**

1. `CREATE TABLE cash_registers (...)` — id, name, type enum('efectivo','banco'), branch_id int NULL FK branches(id), currency varchar(3) NOT NULL, opening_balance int NOT NULL DEFAULT 0, cutoff_date date NOT NULL, is_active boolean NOT NULL DEFAULT true, created_at, updated_at.
2. `ALTER TABLE financial_transactions ADD COLUMN cash_register_id int NULL` + FK to `cash_registers(id)` + `ADD INDEX idx_financial_tx_cash_register (cash_register_id, transaction_date)` (supports the per-caja SUM with the cutoff range).
3. **Seed cajas** — 8 INSERT rows (5 efectivo ARS per branch_id, 1 efectivo central NULL, banco ARS, banco EUR). `cutoff_date` = go-live; `opening_balance` = 0 (D-07: real values loaded later by a separate migration).
4. **Backfill** `UPDATE financial_transactions ft JOIN cash_registers cr SET ft.cash_register_id = cr.id WHERE ...` per the D-01 derivation (history-only labels).

**Project migration rules (CLAUDE.md + memory):**

- Edit Drizzle schema → `pnpm db:generate` (will hit drift → hand-write instead) → `pnpm db:migrate` (custom runner, `_migrations` table is source of truth).
- **NEVER** `drizzle-kit push` / `drizzle-kit migrate`.
- **NEVER** `;` inside SQL comments (runner splits on `;` before stripping `--`).
- **ALWAYS** commit the migration SQL alongside the schema change (memory: executors miss this).
- Enum order in the SQL MUST match the `mysqlEnum` in `cash-registers.ts` byte-for-byte (drift = CI "Unknown column" that tsc can't see — see reference_drizzle_enum_column_name).
- `mysqlEnum` first arg = column name and must match the migration (reference_drizzle_enum_column_name).

## Common Pitfalls

### Pitfall 1: Resolving caja per-caller instead of in `create()`

**What goes wrong:** A cash inflow gets `cash_register_id = NULL` → invisible to `getBalance` → saldo understated.
**Why it happens:** Spreading resolution across 9 call sites; one is missed.
**How to avoid:** Resolve inside `create()` (option A). Single choke-point.
**Warning signs:** A test asserting that a `cash` charge via `recordAssignmentCharge` (not via REST) still has a non-null `cash_register_id`.

### Pitfall 2: Backfilled history inflating the saldo

**What goes wrong:** Historical cash sums into day-1 balance → trust destroyed (D-05's exact fear).
**Why it happens:** `getBalance` forgets the `transaction_date >= cutoff` clause.
**How to avoid:** Always include the cutoff filter; test that a pre-cutoff validado tx is labeled but NOT in `firmeBalance`.
**Warning signs:** `getBalance` for a fresh caja returns a large number despite `opening_balance=0`.

### Pitfall 3: Pendientes leaking into firme

**What goes wrong:** `getBalance` sums pendientes into firme → violates CAJA-03.
**Why it happens:** Forgetting `firmMoneyConditions()` includes `validation_status='validado'`.
**How to avoid:** Reuse `firmMoneyConditions()` verbatim; compute `pendienteAmount` in a separate query. Test the invariant explicitly.
**Warning signs:** A pendiente charge changes `firmeBalance`.

### Pitfall 4: `;` inside SQL comments in 0154

**What goes wrong:** The custom runner splits on `;` before stripping `--`, breaking the migration.
**Why it happens:** Natural-language comments with semicolons.
**How to avoid:** Project memory rule — no `;` in comments. (reference: feedback_no_semicolon_in_sql_comments)
**Warning signs:** Migration runner errors on a fragment that is actually a comment.

### Pitfall 5: `db:generate` interactive drift blocks the pipeline

**What goes wrong:** `pnpm db:generate` hangs on the `sessions.goal_plan_type` ambiguity prompt (pre-existing, unrelated to 138).
**How to avoid:** Hand-write 0154 like 0153. Do not try to auto-generate.
**Warning signs:** drizzle-kit prompts for an unrelated column rename.

### Pitfall 6: Seeding efectivo for the virtual/online branch

**What goes wrong:** A never-used ARS efectivo caja for ONLINE clutters reports; online cash is nonsensical.
**How to avoid:** Seed efectivo only for `isVirtual=false AND isActive=true` (mirror seed-production.ts:261). Confirm with discuss/plan.

## Code Examples

### Resolver (recommended shape)

```typescript
// modules/finance/cash-register-service.ts (NEW)
// Source pattern: D-01 rule + balance-service.ts guard precedent
async resolveCashRegister(
  paymentMethod: PaymentMethod,
  branchId: number,
  currency: string,
): Promise<number | null> {
  if (paymentMethod === "aura_credit" || paymentMethod === "internal") {
    return null; // not firm cash in any caja (D-01)
  }
  if (paymentMethod === "transfer" || paymentMethod === "card") {
    const [banco] = await this.db.select({ id: schema.cashRegisters.id })
      .from(schema.cashRegisters)
      .where(and(
        eq(schema.cashRegisters.type, "banco"),
        eq(schema.cashRegisters.currency, currency),
        eq(schema.cashRegisters.isActive, true),
      )).limit(1);
    if (!banco) throw new BadRequestError(`No existe caja banco para ${currency}`);
    return banco.id;
  }
  // cash → efectivo de la sucursal; guard de moneda (CAJA-04/D-09)
  const [efectivo] = await this.db.select({
      id: schema.cashRegisters.id, currency: schema.cashRegisters.currency,
    })
    .from(schema.cashRegisters)
    .where(and(
      eq(schema.cashRegisters.type, "efectivo"),
      eq(schema.cashRegisters.branchId, branchId),
      eq(schema.cashRegisters.isActive, true),
    )).limit(1);
  if (!efectivo) throw new BadRequestError(`No existe caja efectivo para la sucursal ${branchId}`);
  if (efectivo.currency !== currency) {
    throw new BadRequestError(
      `Moneda inconsistente: la caja es ${efectivo.currency}, el cobro es ${currency}`,
    );
  }
  return efectivo.id;
}
```

### Wiring into create() (option A)

```typescript
// transaction-service.ts — inside create(), before the .insert(...).values({...})
const cashRegisterId =
  input.cashRegisterId !== undefined
    ? input.cashRegisterId
    : await this.cashRegisterService.resolveCashRegister(
        input.paymentMethod,
        input.branchId,
        input.currency ?? "ARS",
      );
// ...then in .values({...}): cashRegisterId,
```

**Note for planner:** `create()` will need a `CashRegisterService` reference. Inject it in the constructor (like `balanceService`) and update all `new TransactionService(...)` call sites (`auth/routes.ts`, `members/routes.ts`, `subscriptions/routes.ts`, `finance/routes.ts`, `programs/routes.ts` — 5 sites, all currently `new TransactionService(fastify.db, fastify.log, balanceService)`).

## Validation Architecture

### Test Framework

| Property           | Value                                                                      |
| ------------------ | -------------------------------------------------------------------------- |
| Framework          | vitest (already configured)                                                |
| Config file        | per-worker test MySQL (`eltemplo_test_<POOL_ID>`) via `test/setup.ts`      |
| Quick run command  | `cd el-templo-api && pnpm test test/finance/cash-register-service.test.ts` |
| Full suite command | `cd el-templo-api && pnpm test` (runs in CI on push to staging)            |

**Project rule (memory):** do NOT run the full local suite — CI runs it on push to staging; local typecheck (`pnpm typecheck`/build) is fine.

### Phase Requirements → Test Map

| Req     | Behavior                                                                                       | Test Type   | Command                                                          | File Exists? |
| ------- | ---------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------- | ------------ |
| CAJA-01 | Seed produces 8 cajas, correct types/currencies/branch_ids                                     | integration | `pnpm test test/finance/cash-register-service.test.ts -t "seed"` | ❌ Wave 0    |
| CAJA-02 | `cash`→efectivo(branch), `transfer`/`card`→banco(currency), `aura_credit`/`internal`→NULL      | integration | `... -t "resolver"`                                              | ❌ Wave 0    |
| CAJA-02 | A `cash` charge via `recordAssignmentCharge` (not REST) still stamps non-null cash_register_id | integration | `... -t "create stamps caja"`                                    | ❌ Wave 0    |
| CAJA-03 | getBalance = opening + Σ validados since cutoff; pendientes separate, don't sum                | integration | `... -t "getBalance firme"`                                      | ❌ Wave 0    |
| CAJA-03 | Pre-cutoff validado tx is labeled but NOT in firmeBalance                                      | integration | `... -t "cutoff excludes history"`                               | ❌ Wave 0    |
| CAJA-04 | efectivo caja currency ≠ tx currency throws "Moneda inconsistente"                             | integration | `... -t "currency guard"`                                        | ❌ Wave 0    |

### Sampling Rate

- **Per task commit:** `pnpm typecheck` (local) + the new test file.
- **Per wave merge / phase gate:** full suite green in CI on push to staging.

### Wave 0 Gaps

- [ ] `test/finance/cash-register-service.test.ts` — covers CAJA-01..04. Reuse `test/finance/transaction-service.test.ts` scaffolding (`createTestApp`, `seedSubscription`, direct Drizzle inserts).
- [ ] No new fixtures needed beyond seeding cajas in `beforeAll`.
- [ ] Framework already installed — no install step.

## Security Domain

> `security_enforcement` not explicitly disabled — included.

### Applicable ASVS Categories

| ASVS Category       | Applies                              | Standard Control                                                                                                                  |
| ------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication   | no                                   | Inherited from finance route guard (no new endpoint required in 138).                                                             |
| V4 Access Control   | yes (if a balance endpoint is added) | Reuse `FINANCE_READ_ROLES` + `attachCountryScope` from `finance/routes.ts:82-93`. Backend-only phase; if no endpoint, N/A.        |
| V5 Input Validation | yes                                  | `paymentMethod`/`branchId`/`currency` are enum/int already validated upstream; resolver throws `BadRequestError` on missing caja. |
| V6 Cryptography     | no                                   | No crypto.                                                                                                                        |

### Known Threat Patterns

| Pattern                                         | STRIDE                 | Standard Mitigation                                                                                         |
| ----------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| SQL injection in backfill UPDATE                | Tampering              | Parameterized via Drizzle / static migration SQL with no user input. The 0154 SQL is static.                |
| Currency mismatch persisting bad financial data | Integrity (Tampering)  | Currency guard in resolver (CAJA-04/D-09) — application-enforced invariant.                                 |
| Cross-country data leak via balance endpoint    | Information disclosure | If an endpoint is added, attach `country` scope (existing `attachCountryScope`). Otherwise deferred to 141. |

## State of the Art

| Old Approach                                           | Current Approach                                | When Changed     | Impact                                                      |
| ------------------------------------------------------ | ----------------------------------------------- | ---------------- | ----------------------------------------------------------- |
| Inline `voided_at IS NULL` firm filter across 14 sites | `firmMoneyConditions()` single source of truth  | Phase 137        | 138's `getBalance` reuses it directly.                      |
| Caja conceptually = branch                             | Caja = first-class entity decoupled from branch | Phase 138 (this) | `branchId` (where) ≠ `cash_register_id` (where money went). |

**Deprecated/outdated:** none relevant to this phase.

## Assumptions Log

| #   | Claim                                                                                           | Section                     | Risk if Wrong                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| A1  | `db:generate` will again block on `sessions.goal_plan_type` drift, requiring hand-written 0154. | Migration 0154              | Low — if `db:generate` works, use it; the hand-written path is a safe fallback either way.                                  |
| A2  | No ES/Barcelona branch exists at go-live, so all efectivo cajas are ARS.                        | Branch→Currency             | Low — verified via grep; if an ES branch is added later, the country-derived seed handles it.                               |
| A3  | Virtual/ONLINE branch should NOT get an efectivo caja.                                          | Branch→Currency / Pitfall 6 | Low — discretion item; planner/discuss confirms. Wrong = one unused caja, harmless.                                         |
| A4  | Option A (resolve in `create()`) is preferred over per-caller resolution.                       | Create-Path Audit           | Low — both work; A is DRYer given single insert site.                                                                       |
| A5  | Per-caja `cutoff_date` column (seeded with one global value) over a settings-table global.      | getBalance model            | Medium — affects schema; if discuss prefers a single enforced global, switch to settings row. Recommend confirming in plan. |
| A6  | `getBalance` is inflow-only in 138 (outflows arrive in 139).                                    | getBalance model            | Low — correct for 138 scope; signature designed to extend.                                                                  |

## Open Questions

1. **Where does the global cutoff_date live — per-caja column or finance_settings?**
   - What we know: D-06 says cutoff is a single global value; settings subsystem was partly dismantled in 136-07 (memory).
   - What's unclear: whether a settings table will exist by 142 to host it.
   - Recommendation: per-caja `cutoff_date` column seeded with one value (A5). Self-contained, no settings dependency.

2. **Should `getBalance` SUM inflow-only now, or a signed expression for 139 forward-compat?**
   - Recommendation: inflow-only with a `// TODO 139: subtract outflows` marker; D-08 says hide derivation from callers, so 139 can change the body without touching the signature.

3. **Does the virtual/ONLINE branch get an efectivo caja?**
   - Recommendation: no (Pitfall 6). Confirm in plan.

4. **Is a `GET balance` REST endpoint in 138 scope, or strictly service-only?**
   - 138 is backend-only (D-10) and the display consumer is 141. Recommendation: ship `CashRegisterService.getBalance` as a service method with full test coverage; add the thin endpoint in 141 unless the planner wants it now for manual verification. If added, reuse `FINANCE_READ_ROLES` + country scope.

## Environment Availability

| Dependency                                                          | Required By        | Available | Version     | Fallback |
| ------------------------------------------------------------------- | ------------------ | --------- | ----------- | -------- |
| MySQL (eltemplo_test)                                               | Integration tests  | ✓ (CI)    | per repo    | —        |
| pnpm                                                                | build/test/migrate | ✓         | per repo    | —        |
| Drizzle migration runner (`run-migrations.ts`, `_migrations` table) | 0154 apply         | ✓         | repo custom | —        |

No new external dependencies. No env vars added.

## Sources

### Primary (HIGH confidence)

- `el-templo-api/src/modules/finance/firm-money.ts` — `firmMoneyConditions()` to reuse (lines 32-37).
- `el-templo-api/src/modules/finance/transaction-service.ts` — single insert site (215), `create()` (119-280), `correct()` re-create (654), `getSummary` (1152-1268).
- `el-templo-api/src/modules/finance/balance-service.ts:154-158` — currency guard precedent.
- `el-templo-api/src/modules/finance/types.ts` — `CreateTransactionInput`, `PaymentMethod`.
- `el-templo-api/src/db/schema/financial-transactions.ts` — table to extend; enum/index patterns.
- `el-templo-api/src/db/schema/branches.ts` — `country` column (currency derivation).
- `el-templo-api/src/db/seed-production.ts:43-93,259-261` — branch list, virtual/active filtering pattern.
- `el-templo-api/src/db/migrations/0153_validation_status.sql` — hand-written migration precedent.
- `el-templo-api/src/modules/subscriptions/service.ts:249-334` — `recordAssignmentCharge` + 4 callers.
- `el-templo-api/src/modules/programs/enrollment-service.ts:398` — add-on create path.
- `.planning/research/modulo-contable/ARCHITECTURE.md` § Punto 2 — proposed schema + derived saldo.
- `.planning/phases/138-entidad-caja-saldos/138-CONTEXT.md` — D-01..D-10.
- `.planning/REQUIREMENTS.md` — CAJA-01..04.

### Secondary (MEDIUM confidence)

- Project memory (CLAUDE.md, MEMORY.md) — migration rules, `;`-in-comments, never run local suite, commit migration SQL, references on Drizzle enum drift.

### Tertiary (LOW confidence)

- None — all claims grounded in direct file reads.

## Metadata

**Confidence breakdown:**

- Create-path audit: HIGH — single insert site verified by exhaustive grep; all callers traced.
- Standard stack: HIGH — zero new deps, verified against repo.
- Schema/migration: HIGH — mirrors 0153/0151 precedent; drift source confirmed.
- Seed/currency mapping: HIGH — branch list read directly; ES absence verified.
- getBalance/guard: HIGH — direct clones of getSummary + applyDelta guard.

**Research date:** 2026-06-24
**Valid until:** 2026-07-24 (stable internal codebase; re-verify if 137 firm-money or finance services change)
