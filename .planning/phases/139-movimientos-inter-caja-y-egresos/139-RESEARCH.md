# Phase 139: Movimientos inter-caja y egresos - Research

**Researched:** 2026-06-24
**Domain:** Finance ledger extension (double-entry inter-caja transfers + expenses) on existing `financial_transactions`. Backend-only.
**Confidence:** HIGH (all claims verified against live source in this repo)

## Summary

Phase 139 extends the existing finance ledger with two new `kind` values — `cash_transfer` (inter-caja movement, modeled as a **2-row double-entry asiento**) and `expense` (1-row outflow) — and completes the `getBalance` outflow extension that phase 138 left as a `// TODO 139`. It is built entirely on assets already shipped by 137 (`void()`/`_void(tx)`, `firmMoneyConditions()`, `auditLog`, `AuditAction 'reconciliation'`) and 138 (`cash_registers`, `getBalance`, currency guard). No new dependencies. Migration **0155** (hand-written).

The single highest-risk change is making `financial_transactions.member_id` **NULLABLE**. The research below establishes — exhaustively, with file:line evidence — that **this change breaks no existing report**. Every member-keyed read either (a) `INNER JOIN`s `users ON users.id = ft.member_id` (NULL rows silently dropped — the correct outcome) AND (b) filters `kind IN ('plan_charge','debt_settlement')` / `kind='plan_charge'` (the new kinds are excluded by kind too) AND/OR (c) `direction='inflow'` (expense + cash_transfer-outflow are `outflow`). The new rows are **triple-excluded** from member metrics. The one TypeScript fallout is in `balance-service.applyDelta` (uses `transaction.memberId` directly), which is runtime-safe because these kinds carry no links (the loop body never runs) but needs a type-level guard.

**Primary recommendation:** Build a new `MovementService` (facade-style, mirrors `CashRegisterService`/`TransactionService` constructor shape) that owns `registerMovement()` (2-row + reconciliation + same-currency guard), `registerExpense()` (1-row), and `voidMovement()`/`voidExpense()` (reuse `TransactionService._void(tx)` for both rows atomically). Add `cash_transfer` + `expense` to `KINDS_ALLOWED_WITHOUT_LINKS`. Extend `getBalance` to subtract outflows via `firmMoneyConditions()`. Model reconciliation as a **separate `kind='adjustment'` row** linked to the movement (keeps `getBalance` arithmetic clean — see Pattern 3). Hand-write migration 0155.

## Architectural Responsibility Map

| Capability                           | Primary Tier                         | Secondary Tier                                      | Rationale                                                                                |
| ------------------------------------ | ------------------------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Inter-caja movement (2-row asiento)  | API / finance service                | DB (`financial_transactions` + `transaction_links`) | Business invariant (net 0, same-currency, atomic pair) lives in service; ledger persists |
| Expense (1-row outflow)              | API / finance service                | DB                                                  | Single insert reusing `create()` machinery                                               |
| Reconciliation (expected vs counted) | API / finance service                | DB + `audit_log`                                    | Discrepancy must leave a named trail AND adjust origen saldo                             |
| Caja firm balance with outflows      | API (`getBalance`)                   | DB (derived SUM)                                    | Derived-on-read; 139 adds the outflow term                                               |
| Void of the pair                     | API (`TransactionService._void(tx)`) | DB                                                  | Reuse 137 soft-void; both rows in one `db.transaction`                                   |
| member_id nullable                   | DB (schema/migration)                | API (type guards)                                   | Schema change; consumers already exclude these rows                                      |

## Standard Stack

No new packages. This phase uses only what is already in `el-templo-api`.

### Core (already installed — verified in repo)

| Library     | Version       | Purpose                         | Why Standard                                               |
| ----------- | ------------- | ------------------------------- | ---------------------------------------------------------- |
| drizzle-orm | (repo-pinned) | Query builder + schema          | Project ORM; `mysqlEnum`, `db.transaction`, `$inferSelect` |
| fastify     | (repo-pinned) | HTTP + Pino logger              | Project framework; `request.log`/`app.log`                 |
| vitest      | (repo-pinned) | Integration tests vs real MySQL | `pnpm test` → `vitest run`                                 |

**No `npm install` required.** [VERIFIED: package.json — only `"test": "vitest run"`, no `typecheck` script]

> **Package Legitimacy Audit: N/A** — this phase installs zero external packages. The Package Legitimacy Gate is skipped (nothing to verify).

## Architecture Patterns

### System Architecture Diagram

```
                       ┌─────────────────────────────────────────────┐
  POST /movements ───► │  MovementService.registerMovement()          │
  (admin only)         │  (NEW — facade, mirrors CashRegisterService) │
                       │                                              │
                       │  1. load origen + destino cajas (getBalance) │
                       │  2. GUARD: origen.currency===destino.currency│──► BadRequestError
                       │  3. db.transaction:                          │    "Moneda inconsistente"
                       │       ┌──────────────────────────────────┐  │
                       │       │ INSERT row A (outflow, origen)    │  │
                       │       │ INSERT row B (inflow,  destino)   │  │──► financial_transactions
                       │       │ INSERT links A↔B (target=tx)      │  │──► transaction_links
                       │       │ [if discrepancy]                  │  │
                       │       │   INSERT adjustment row (origen)  │  │──► reconciliation row
                       │       │   auditLog 'reconciliation'       │  │──► audit_log
                       │       │ applyDelta(rowA/B) = NO-OP        │  │    (no links→balances)
                       │       └──────────────────────────────────┘  │
                       └─────────────────────────────────────────────┘

  POST /expenses ────► registerExpense() → 1 row (expense/outflow) ──► financial_transactions
                       reuse TransactionService.create() (no links)

  POST /void  ───────► voidMovement(): find sibling via link,        ──► _void(tx) BOTH rows
                       _void(tx) row A + row B in ONE db.transaction       + reconciliation row

  GET caja balance ──► getBalance() = opening
                       + Σ(inflow validados since cutoff)
                       − Σ(outflow validados since cutoff)  ◄── 139 adds this term
```

### Recommended Project Structure

```
el-templo-api/src/modules/finance/
├── movement-service.ts      # NEW — registerMovement/registerExpense/void* (facade)
├── transaction-service.ts   # EDIT — add 2 kinds to KINDS_ALLOWED_WITHOUT_LINKS; expose _void reuse
├── cash-register-service.ts # EDIT — getBalance: subtract outflows (the // TODO 139)
├── routes.ts                # EDIT — POST /movements, /expenses, /movements/:id/void, /expenses/:id/void
├── types.ts                 # EDIT — RegisterMovementInput, RegisterExpenseInput, MovementDetail
└── ...
el-templo-api/src/db/schema/financial-transactions.ts   # EDIT — +2 kinds, member_id nullable
el-templo-api/src/db/migrations/0155_*.sql              # NEW — hand-written
el-templo-api/test/finance/movement-service.test.ts     # NEW — integration tests
```

### Pattern 1: Double-entry movement (2 linked rows, net 0)

**What:** A movement is TWO `financial_transactions` rows in one `db.transaction`, linked to each other via `transaction_links` (`target_kind='transaction'`).

**When to use:** Inter-caja transfer (efectivo Jujuy → efectivo central; efectivo → banco same currency).

**Mechanics (verified against `correct()` precedent at transaction-service.ts:597-715, which already links a recreated row → original via `target_kind='transaction'` with `allocatedAmount: 0`):**

```typescript
// Source: derived from transaction-service.ts:679-684 (correct() link pattern)
//         + 138 D-01 cashRegisterId override path (create input.cashRegisterId)
await this.db.transaction(async (tx) => {
  // GUARD same currency BEFORE any write (mirror balance-service.ts:154-158,
  // cash-register-service.ts:96-100).
  if (origenCaja.currency !== destinoCaja.currency) {
    throw new BadRequestError(
      `Moneda inconsistente: origen ${origenCaja.currency}, destino ${destinoCaja.currency}`,
    );
  }

  // Row A — outflow at origen. memberId: null (D-06). paymentMethod 'internal'
  // (resolveCashRegister returns null for 'internal'); cashRegisterId OVERRIDE
  // to origen so the resolver is bypassed — movements specify cajas explicitly.
  const rowA = await txnService.create(
    {
      memberId: null,
      kind: "cash_transfer",
      direction: "outflow",
      amount: N,
      currency: origenCaja.currency,
      paymentMethod: "internal",
      transactionDate,
      effectiveDate,
      branchId,
      cashRegisterId: origenCaja.id, // explicit override (types.ts:78-89 slot)
      notes,
      links: [],
    }, // links: [] OK — kind in KINDS_ALLOWED_WITHOUT_LINKS
    adminId,
    tx,
  );
  // Row B — inflow at destino.
  const rowB = await txnService.create(
    {
      memberId: null,
      kind: "cash_transfer",
      direction: "inflow",
      amount: N,
      currency: destinoCaja.currency,
      paymentMethod: "internal",
      transactionDate,
      effectiveDate,
      branchId,
      cashRegisterId: destinoCaja.id,
      notes,
      links: [],
    },
    adminId,
    tx,
  );
  // Link the pair both ways (so voidMovement can find the sibling from either).
  await tx.insert(schema.transactionLinks).values([
    {
      transactionId: rowA.id,
      targetKind: "transaction",
      targetId: rowB.id,
      allocatedAmount: 0,
    },
    {
      transactionId: rowB.id,
      targetKind: "transaction",
      targetId: rowA.id,
      allocatedAmount: 0,
    },
  ]);
});
```

**Why `create()` reuse works:** `create()` (transaction-service.ts:121) already accepts an optional `tx?` handle (line 125) for nested atomicity, an optional `cashRegisterId` override (line 223-224 — `input.cashRegisterId !== undefined` bypasses the paymentMethod resolver), and tolerates `links: []` when the kind is in `KINDS_ALLOWED_WITHOUT_LINKS` (line 140). `applyDelta` at line 285 runs but is a **no-op** for link-less rows (see Pitfall 2).

> **Discretion note (link direction):** Both-ways links (A→B and B→A) make `voidMovement(id)` symmetric — find the sibling regardless of which id the caller passes. A "principal + mirror" single-link is also valid but forces the caller to always pass the principal id. Recommend **both-ways** for caller ergonomics; the `uniq_tx_target` unique index (transaction-links.ts:38) permits it (different `transaction_id`).

### Pattern 2: Expense (1 row, no destino)

**What:** Single `kind='expense', direction='outflow'` row, `cashRegisterId=origen`, free-text `notes`, no links, `memberId: null`.

```typescript
// Reuses create() directly — no new insert path.
await txnService.create(
  {
    memberId: null,
    kind: "expense",
    direction: "outflow",
    amount: N,
    currency: caja.currency,
    paymentMethod: "internal",
    transactionDate,
    effectiveDate,
    branchId,
    cashRegisterId: caja.id,
    notes: freeText,
    links: [],
  },
  adminId,
);
```

### Pattern 3: Reconciliation (expected vs counted) — RECOMMENDED model

**Decision (Claude's discretion per D-04 / CONTEXT line 70):** model the discrepancy as a **separate `kind='adjustment'` row** linked to the movement's origen row (`target_kind='transaction'`), NOT as extra columns on the movement row.

**Why a separate adjustment row beats columns on the movement row:**

- `getBalance` already sums by `(cash_register_id, direction, validado)` — an `adjustment` row with `direction='outflow'` (if counted < expected, plata faltante) or `direction='inflow'` (counted > expected, sobrante) at the origen caja **automatically** corrects the derived saldo to reflect the physical count. No special-casing in `getBalance`. [VERIFIED: cash-register-service.ts:143-156 sums any direction by sign once Pattern 4 lands]
- `kind='adjustment'` is already a valid enum value (financial-transactions.ts:27-32) AND already in `KINDS_ALLOWED_WITHOUT_LINKS` (transaction-service.ts:57-60) — zero schema/enum churn for the reconciliation row itself.
- The named trail (motivo + autor + fecha) lives in `audit_log` via `AuditAction 'reconciliation'` (audit-log.ts:30 — already declared, signaling this was foreseen) + the row's `notes`/`voidReason`. No phantom saldo, no silent adjust (D-04 satisfied).
- Columns-on-the-movement-row (`expected_amount`/`counted_amount`/`discrepancy`) would require `getBalance` to learn about a new correction term — couples the read path to reconciliation. Reject.

**Capture rule (D-04 discretion — CONTEXT line 73):** capture `expected_amount` (= origen `getBalance().firmeBalance` at the moment, snapshotted into the audit payload) ALWAYS; emit the adjustment row ONLY when `counted !== expected`. Recommend always recording expected+counted in the audit payload even when equal (cheap, gives a clean reconciliation history); emit the saldo-moving adjustment row only on a real difference.

```typescript
// Inside the same db.transaction as the movement rows:
const expected = (await cashRegisterService.getBalance(origenCaja.id))
  .firmeBalance;
if (counted !== expected) {
  const diff = counted - expected; // >0 sobrante, <0 faltante
  const adj = await txnService.create(
    {
      memberId: null,
      kind: "adjustment",
      direction: diff > 0 ? "inflow" : "outflow",
      amount: Math.abs(diff),
      currency: origenCaja.currency,
      paymentMethod: "internal",
      transactionDate,
      effectiveDate,
      branchId,
      cashRegisterId: origenCaja.id,
      notes: `Reconciliación movimiento #${rowA.id}: esperado ${expected}, contado ${counted}`,
      links: [
        { targetKind: "transaction", targetId: rowA.id, allocatedAmount: 0 },
      ],
    },
    adminId,
    tx,
  );
  await auditLog.write(tx, {
    actorId: adminId,
    action: "reconciliation",
    targetKind: "transaction",
    targetId: rowA.id,
    payload: {
      movementId: rowA.id,
      adjustmentId: adj.id,
      expected,
      counted,
      diff,
    },
    reason: motivo,
  });
}
```

> **Note for planner:** `adjustment` rows are `direction='inflow'` sometimes — confirm `getBalance` outflow extension (Pattern 4) handles BOTH directions generically, not just outflow.

### Pattern 4: getBalance outflow extension (the `// TODO 139`)

**What:** `getBalance` (cash-register-service.ts:126-182) currently sums inflow-only (line 151 `direction='inflow'`). 139 adds the outflow subtraction.

```typescript
// Source: cash-register-service.ts:143-156 (existing firm inflow SUM)
// Generalize to signed: firmeBalance = opening + Σinflow − Σoutflow.
const [inflowRow] = await this.db
  .select({ total: sql<number>`COALESCE(SUM(amount),0)` })
  .from(schema.financialTransactions)
  .where(
    and(
      eq(schema.financialTransactions.cashRegisterId, cashRegisterId),
      eq(schema.financialTransactions.direction, "inflow"),
      ...firmMoneyConditions(), // reuse — never inline
      gte(schema.financialTransactions.transactionDate, caja.cutoffDate),
    ),
  );
const [outflowRow] = await this.db
  .select({ total: sql<number>`COALESCE(SUM(amount),0)` })
  .from(schema.financialTransactions)
  .where(
    and(
      eq(schema.financialTransactions.cashRegisterId, cashRegisterId),
      eq(schema.financialTransactions.direction, "outflow"),
      ...firmMoneyConditions(),
      gte(schema.financialTransactions.transactionDate, caja.cutoffDate),
    ),
  );
const firmeBalance =
  caja.openingBalance +
  Number(inflowRow?.total ?? 0) -
  Number(outflowRow?.total ?? 0);
```

**Net-0 invariant (verify by test):** a movement inserts +N inflow at destino and −N outflow at origen, both same currency. Σ of both same-currency cajas' firmeBalance is unchanged after a movement (D-09 / CONTEXT line 125). The pendiente-amount SUM (lines 160-174) is unaffected — these rows are born `validado`, never `pendiente`.

> **Pre-existing refund concern (flag to planner):** `direction='outflow'` already exists in the ledger for `kind='refund'` (balance-service.ts:76-77 convention). Before 139, `getBalance` was inflow-only, so a historical refund's outflow row was **never subtracted** from a caja saldo. After Pattern 4, ALL outflow rows since cutoff get subtracted — including any refund rows. Verify there are no `refund` rows with a `cash_register_id` since cutoff that would suddenly reduce a caja's saldo. Most refunds historically have `cash_register_id = NULL` (aura_credit/internal), but a `cash`/`transfer` refund could carry a caja. **The plan needs a test asserting that pre-139 caja saldos that included refunds stay correct, OR an explicit decision that refund outflows SHOULD reduce the caja (likely correct — a cash refund really does leave the caja).**

### Anti-Patterns to Avoid

- **Parallel `cash_movements` table:** ARCHITECTURE.md § Punto 3 explicitly rejects this — "fragmenta la verdad financiera y obliga a UNIR dos ledgers." One book.
- **Member sentinel user for egresos:** ARCHITECTURE.md originally _recommended_ a sentinel, but **CONTEXT D-06 (line 51-53) overrode it to nullable** — "modelo honesto, sin usuario sentinel 'Gimnasio' que ensucie listas/conteos de socios." Follow CONTEXT (authoritative), not the older ARCHITECTURE recommendation.
- **Inlining `validado AND voided_at IS NULL`:** always `...firmMoneyConditions()` (firm-money.ts:32). Never inline (137 centralized this across 14 call sites).
- **`drizzle-kit migrate`/`push`:** CLAUDE.md forbids. Hand-write 0155 (the `sessions.goal_plan_type` drift blocks `db:generate` interactively — same reason 0153/0154 were hand-written).
- **Movement as a single row with both cajas:** ROADMAP said "una sola fila origen+destino" but D-02 (CONTEXT line 40) resolved this to the 2-row asiento. ROADMAP MOV-01 criterion is to be updated to "asiento de 2 filas linkeadas."

## Don't Hand-Roll

| Problem                                         | Don't Build     | Use Instead                                                                                                    | Why                                                                                                                   |
| ----------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Insert ledger row + caja stamp + balances delta | New insert path | `TransactionService.create(input, actor, tx)`                                                                  | One choke-point; handles cashRegisterId override, link validation, applyDelta atomically (transaction-service.ts:121) |
| Soft-void a row + balance rollback + audit      | New void logic  | `TransactionService._void(tx, id, ...)`                                                                        | 137 primitive; atomic against caller's tx (transaction-service.ts:348)                                                |
| Firm-money filter                               | Inline SQL      | `firmMoneyConditions()`                                                                                        | Single source of truth (firm-money.ts:32)                                                                             |
| Same-currency guard                             | New error path  | Mirror `BadRequestError "Moneda inconsistente"` (cash-register-service.ts:96-100 / balance-service.ts:154-158) | Consistent message + precedent                                                                                        |
| Reconciliation trail                            | New audit table | `auditLog.write(tx, {action:'reconciliation',...})`                                                            | `'reconciliation'` already in `AuditAction` (audit-log.ts:30)                                                         |
| Caja saldo derivation                           | New SUM         | Extend `getBalance` (cash-register-service.ts:126)                                                             | Signature is stable by design (D-08); 139 extends the body                                                            |

**Key insight:** 139 is almost entirely _composition_ of 137+138 primitives. The only genuinely new code is `MovementService` orchestration (the 2-row pair + reconciliation) and the `getBalance` outflow term. Resist building anything else.

## member_id-NULLABLE BLAST RADIUS (the #1 risk)

**Conclusion: making `financial_transactions.member_id` nullable breaks NO existing report.** Every consumer is protected by at least one — usually all three — of: (A) `INNER JOIN users ON users.id = ft.member_id` (NULL → row dropped), (B) `kind IN ('plan_charge','debt_settlement')` or `kind='plan_charge'` (new kinds excluded), (C) `direction='inflow'` (expense + cash_transfer-outflow are outflow). The new `cash_transfer`/`expense` rows are **structurally invisible** to member metrics.

| File:line                                                       | Query                       | Member-keyed?                                                                                                             | NULL-member impact                                                    | Action                      |
| --------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------- |
| `analytics/advanced-finance-service.ts:217-224`                 | revenue trend by month      | INNER JOIN users (A) + `kind IN (plan_charge,debt_settlement)` (B) + `direction=inflow` (C)                               | Triple-excluded — NULL rows never reach it                            | None — verified safe        |
| `analytics/ltv-service.ts:311-328`                              | LTV per member              | INNER JOIN users (A) + same kind/direction filter (B,C) (lines 286-296)                                                   | Triple-excluded                                                       | None                        |
| `analytics/ticket-service.ts:471+`, `527+`                      | avg ticket                  | INNER JOIN subscription link (requires subscription) + `kind='plan_charge'` + `direction=inflow` (lines 437-444, 527-534) | Excluded (no subscription link + wrong kind)                          | None                        |
| `analytics/service.ts:1077,1152,1223,1350`                      | yaPago / revenue aggregates | INNER JOIN users (A) + `kind IN(...)` (B) + `direction=inflow` (C) (lines 1049-1059, 1124-1134, 1192-1202, 1323-1333)     | Triple-excluded                                                       | None                        |
| `analytics/service.ts:539-545`                                  | yaPago EXISTS (raw SQL)     | `ft.kind='plan_charge' AND ft.direction='inflow' AND firmMoneySqlFor('ft')`                                               | Excluded by kind+direction                                            | None                        |
| `reports/service.ts:337-388`                                    | charge history              | INNER JOIN subscription link + INNER JOIN users (A) + `kind IN(plan_charge,debt_settlement)` + `direction=inflow`         | Quadruple-excluded                                                    | None                        |
| `finance/transaction-service.ts:list()` 779-909                 | admin caja list             | INNER JOIN users (A) + INNER JOIN branches                                                                                | **NULL-member rows DROPPED**                                          | ⚠️ See note below           |
| `finance/transaction-service.ts:exportRowsForExcel()` 1302-1405 | excel export                | INNER JOIN users (A) + branches                                                                                           | NULL-member rows DROPPED                                              | ⚠️ Same — 141 concern       |
| `finance/transaction-service.ts:getSummary()` 1172-1288         | caja summary cards          | `direction='inflow'` + `firmMoneyConditions()` + INNER JOIN **branches only** (NO users join)                             | ⚠️ `cash_transfer` INFLOW rows MATCH                                  | ⚠️ See getSummary note      |
| `finance/transaction-service.ts:getFinancialHistory()` 952-1043 | member financial history    | `WHERE ft.member_id = :memberId` (line 963,969)                                                                           | NULL never `= memberId` → excluded                                    | None                        |
| `finance/transaction-service.ts:listForMember()` 735-770        | member tx list              | `WHERE ft.member_id = :memberId`                                                                                          | Excluded                                                              | None                        |
| `finance/balance-service.ts:applyDelta()` 81-185                | balances cache writer       | iterates `links`; uses `transaction.memberId` at lines 106,128,166,175                                                    | **No links → loop body never runs** for cash_transfer/expense → no-op | ⚠️ TS type only — see below |
| `finance/cash-register-service.ts:getBalance()` 126-182         | caja saldo                  | `WHERE cash_register_id = X` (NO member predicate)                                                                        | These rows are WHAT it should sum (their whole point)                 | Pattern 4 extension         |
| `scripts/backfill-historical-payments.ts:395,474`               | one-off backfill            | uses `memberId` from hardcoded payment list                                                                               | Never inserts NULL                                                    | None (historical script)    |

### Two items needing planner attention (NOT blockers, but must be in the plan)

**⚠️ A. `getSummary()` revenueByKind + the cash_transfer-INFLOW row (transaction-service.ts:1172-1288).**
`getSummary` filters `direction='inflow'` + `firmMoneyConditions()` and joins **branches only (no users)**. A `cash_transfer` INFLOW row (the destino leg of a movement) is `direction='inflow'`, `validado`, not voided, and has a `branchId` (still NOT NULL) → it **matches** `getSummary`'s conds. Two concrete effects:

1. `monthlyRevenue` (line 1197-1207) would **inflate** by the destino leg amount — but it's a caja-to-caja move, NOT revenue.
2. `revenueByKind[r.kind]` (line 1283) assigns into a fixed-key record (`plan_charge/debt_settlement/refund/adjustment/advance_payment` — types.ts:30, RevenueByKind). `r.kind = 'cash_transfer'` is NOT a key → `revenueByKind['cash_transfer'] = N` silently widens the object at runtime (TS `Record<TransactionKind,number>` will also error once `TransactionKind` includes the new values).
   **Action:** add `kind IN ('plan_charge','debt_settlement','refund','adjustment','advance_payment')` (i.e. exclude `cash_transfer`,`expense`) to `getSummary`'s `conds[]`, OR add `notInArray(kind, ['cash_transfer','expense'])`. This keeps `monthlyRevenue` and `revenueByKind` as member-revenue-only. **Add a regression test** (summary-by-kind.test.ts already exists — extend it to assert a cash_transfer inflow does NOT change `monthlyRevenue`). `expense` is `outflow` so already excluded by `direction='inflow'`; only the cash_transfer inflow leg is the leak.

**⚠️ B. `applyDelta` TypeScript fallout (balance-service.ts:106,128,166,175).**
`FinancialTransactionRow["memberId"]` is currently `number`. After the schema change it becomes `number | null`. `applyDelta` uses `transaction.memberId` in `eq(schema.balances.memberId, transaction.memberId)` (line 106) and three insert/log sites (128,166,175). At **runtime** this is safe for cash_transfer/expense because they carry no links → the `for (const link of links)` loop (line 87) never enters the body. But `tsc --noEmit` will flag `number | null` where `number` is expected (balances.memberId is NOT NULL).
**Action:** narrow at the top of `applyDelta` — e.g. `if (links.length === 0) return;` early (semantically correct: no links = no balance effect, the documented contract). This both satisfies TS and makes the no-op explicit. Alternatively assert `transaction.memberId !== null` after the link-kind guards (a link-bearing row always has a member). Recommend the `if (links.length === 0) return;` guard. **Verify `balances.memberId` is itself NOT NULL** (it is a member's debt cache — confirm in schema/balances.ts) so the narrowing is justified.

> **Why INNER JOIN dropping NULL rows is CORRECT, not a bug:** egresos/movimientos have no socio. A revenue/LTV/ticket report keyed by member SHOULD NOT show them. The INNER JOIN is the natural filter. The only place that must SEE these rows is the caja history/report (phase 141) — which is out of 139's scope and will need a LEFT JOIN or a separate query (flag for 141, see Open Questions).

## Migration 0155 (hand-written)

**Two changes, additive/non-destructive:**

1. Extend `kind` enum: append `'cash_transfer'`, `'expense'` (order MUST match the `mysqlEnum` in financial-transactions.ts byte-for-byte).
2. Alter `member_id` to NULLABLE (drop the NOT NULL — loosening, non-destructive; existing rows keep their value).

```sql
-- Phase 139-01 — cash_transfer + expense kinds, member_id nullable (MOV-01..04, D-06)
-- Hand-written: db:generate hits the pre-existing sessions.goal_plan_type interactive
-- drift (same as 0153/0154). NEVER drizzle-kit push/migrate.
-- enum order MUST match the mysqlEnum in financial-transactions.ts byte-for-byte
-- (enum drift = CI "Unknown column" that tsc cannot detect).
-- member_id loosening NOT NULL is non-destructive  no row is rewritten.

ALTER TABLE `financial_transactions`
  MODIFY COLUMN `kind`
  enum('plan_charge','debt_settlement','refund','adjustment','advance_payment','cash_transfer','expense')
  NOT NULL;

ALTER TABLE `financial_transactions`
  MODIFY COLUMN `member_id` int NULL;
```

**Migration rules (CLAUDE.md + MEMORY):**

- NEVER `;` inside SQL comments — the runner splits by `;` before stripping `--` [VERIFIED: MEMORY feedback_no_semicolon_in_sql_comments]. Note the comment lines above use no semicolons.
- ALWAYS commit the SQL file alongside the schema change.
- Apply with `pnpm db:migrate` (custom runner, `_migrations` table is source of truth). Never `drizzle-kit migrate`.
- `MODIFY COLUMN member_id int NULL` keeps the existing FK to `users.id` (the FK constraint does not require NOT NULL). Verify the FK name is unaffected (no DROP/ADD of the FK needed for a nullability change in MySQL `MODIFY`).
- After editing the Drizzle schema (`kind` enum + drop `.notNull()` on `memberId`), `TransactionKind` and `CreateTransactionInput.memberId` types widen automatically (`$inferSelect`/`$inferInsert`). `CreateTransactionInput.memberId` (types.ts:58) must change to `number | null`.

## Common Pitfalls

### Pitfall 1: cash_transfer-inflow leaking into getSummary revenue

**What goes wrong:** destino leg (`direction='inflow'`) matches `getSummary` conds, inflating `monthlyRevenue` and assigning into the fixed `revenueByKind` record.
**Why:** `getSummary` filters by direction+firm-money but NOT by kind whitelist.
**How to avoid:** exclude `cash_transfer`/`expense` in `getSummary.conds[]`; extend `revenueByKind` record OR keep it member-kinds-only.
**Warning signs:** `monthlyRevenue` jumps after a movement; `revenueByKind` gains a `cash_transfer` key.

### Pitfall 2: assuming applyDelta needs special-casing for the new kinds

**What goes wrong:** adding a `kind === 'cash_transfer'` early-return inside applyDelta.
**Why it's wrong:** unnecessary — the loop over `links` (balance-service.ts:87) is already a no-op for link-less rows; `target_kind='transaction'` links are explicitly `continue`d (line 89). The `correct()` provenance link (allocatedAmount 0, target_kind='transaction') already proves applyDelta ignores tx-to-tx links.
**How to avoid:** add ONLY the `if (links.length === 0) return;` guard (for the TS null-narrowing), and **assert no-op with a test** (D-07 / CONTEXT line 126): insert a cash_transfer/expense → `balances` row count and amounts unchanged.

### Pitfall 3: void of the pair not finding the sibling

**What goes wrong:** `voidMovement(id)` voids only one row, leaving the other live → caja saldos asymmetric, net-0 broken.
**How to avoid:** in one `db.transaction`, read the sibling via `transaction_links WHERE transaction_id=id AND target_kind='transaction'` (both-ways links make this symmetric), then `_void(tx, id)` AND `_void(tx, siblingId)`. If a reconciliation `adjustment` row is linked, void it too (it linked to rowA). Egreso void = single `_void` (no sibling). **Test:** void a movement → both legs `voided_at` set, both cajas' saldos return to pre-movement.

### Pitfall 4: refund outflows suddenly subtracted by the new getBalance

**What goes wrong:** Pattern 4 subtracts ALL outflow validados since cutoff — including pre-existing `kind='refund'` outflow rows that carry a `cash_register_id`.
**How to avoid:** decide explicitly whether refund outflows SHOULD reduce caja saldo (likely YES — a cash refund leaves the caja). Add a test pinning the chosen behavior. Check whether any refund rows since cutoff have a non-NULL `cash_register_id`.

### Pitfall 5: enum order drift

**What goes wrong:** mysqlEnum array order ≠ migration order → CI "Unknown column" that tsc can't see [VERIFIED: financial-transactions.ts:64 comment, reference_drizzle_enum_column_name.md].
**How to avoid:** APPEND the 2 new values at the END of both the migration `enum(...)` and the `mysqlEnum(...)`; never reorder existing values.

## Code Examples

### Reusing \_void for both legs (void the pair)

```typescript
// Source: transaction-service.ts:348 (_void signature) + :320-323 (sibling-by-link read)
async voidMovement(id: number, voidedBy: number, reason: string): Promise<void> {
  await this.db.transaction(async (tx) => {
    const links = await tx.select().from(schema.transactionLinks)
      .where(and(
        eq(schema.transactionLinks.transactionId, id),
        eq(schema.transactionLinks.targetKind, "transaction"),
      ));
    await this.txnService._void(tx, id, voidedBy, { reason });          // requires _void be reachable
    for (const l of links) {
      await this.txnService._void(tx, l.targetId, voidedBy, { reason });
    }
  });
}
```

> **Access note:** `_void` is currently `private` (transaction-service.ts:348). To call it from `MovementService`, either (a) add a thin public `voidPair(ids[], ...)` on `TransactionService` that wraps `_void` for N ids in one tx (cleanest — keeps `_void` private, mirrors how `correct()` uses it internally), or (b) widen `_void` to package-internal. Recommend (a).

## State of the Art

| Old Approach                           | Current Approach                     | When Changed                            | Impact                                                       |
| -------------------------------------- | ------------------------------------ | --------------------------------------- | ------------------------------------------------------------ |
| getBalance inflow-only (`// TODO 139`) | signed: opening + Σinflow − Σoutflow | Phase 139                               | caja saldo reflects expenses/movements                       |
| member_id NOT NULL + sentinel proposal | member_id NULLABLE, no sentinel      | CONTEXT D-06 supersedes ARCHITECTURE.md | honest model; reports already exclude by kind/direction/join |
| movement = "una sola fila" (ROADMAP)   | 2-row double-entry asiento           | CONTEXT D-02                            | standard accounting; reuses ledger + getBalance + links      |

**Deprecated/outdated:**

- ARCHITECTURE.md § Punto 3 "Recomendación: member sentinel" — **superseded** by CONTEXT D-06 (nullable). Do not implement a sentinel user.

## Assumptions Log

| #   | Claim                                                                                                                                                  | Section        | Risk if Wrong                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | `balances.memberId` is NOT NULL (justifies the `applyDelta` early-return narrowing)                                                                    | Blast radius B | Low — verify in schema/balances.ts during planning; if nullable, the narrowing is even safer                                             |
| A2  | No `refund` rows since cutoff carry a non-NULL `cash_register_id` (so Pattern 4 doesn't silently change historical caja saldos)                        | Pitfall 4      | Medium — a query against prod/test data confirms; if some exist, decide intended behavior                                                |
| A3  | `MODIFY COLUMN member_id int NULL` preserves the existing FK without an explicit DROP/ADD                                                              | Migration 0155 | Low — MySQL nullability change via MODIFY keeps the FK; verify on the test DB before pushing                                             |
| A4  | `paymentMethod='internal'` is the right method for movements/expenses (resolveCashRegister returns null for it, and we override cashRegisterId anyway) | Pattern 1/2    | Low — `internal` already in the payment_method enum (financial-transactions.ts:37-43); the cashRegisterId override bypasses the resolver |

## Open Questions

1. **Phase 141 caja history must SHOW egresos/movimientos (NULL member).**
   - What we know: every current finance list/export uses INNER JOIN users → drops NULL-member rows.
   - What's unclear: 141 will need a LEFT JOIN users (or a kind-aware query) to render egresos/movimientos in the caja history.
   - Recommendation: out of 139 scope; flag explicitly in 139-SUMMARY so 141's research/plan picks it up. 139's job is only that these rows EXIST and saldo is correct.

2. **Should reconciliation always emit an audit row, or only on diff?**
   - Recommendation (Pattern 3): always record expected+counted in the audit payload; emit the saldo-moving `adjustment` row only when `counted !== expected`. This is Claude's discretion per D-04 — safe either way.

3. **Cross-currency movements (FX) — explicitly out of v1 (D-03).**
   - The same-currency guard rejects them. Mark as a gap if ever needed (D-03 / deferred). No action.

## Environment Availability

| Dependency              | Required By         | Available | Version  | Fallback                                                                                     |
| ----------------------- | ------------------- | --------- | -------- | -------------------------------------------------------------------------------------------- |
| MySQL (`eltemplo_test`) | Integration tests   | ✓ (CI)    | —        | Tests run in CI on push to staging, NOT locally [MEMORY: feedback_tests_run_in_ci_not_local] |
| `npx tsc --noEmit`      | Local type check    | ✓         | repo tsc | No `pnpm typecheck` script exists — use `npx tsc --noEmit` [VERIFIED: package.json]          |
| drizzle-kit             | (NOT used for 0155) | ✓         | —        | Hand-write migration; `db:generate` blocked by sessions.goal_plan_type drift                 |

**No external dependencies blocking execution.** All composition of existing 137/138 assets.

## Validation Architecture

> `.planning/config.json` nyquist_validation not confirmed absent → treating as enabled.

### Test Framework

| Property           | Value                                                            |
| ------------------ | ---------------------------------------------------------------- |
| Framework          | vitest (integration vs real MySQL `eltemplo_test`)               |
| Config file        | repo vitest config (per `test/helpers.ts`)                       |
| Quick run command  | `cd el-templo-api && npx tsc --noEmit` (local — tests run in CI) |
| Full suite command | `cd el-templo-api && pnpm test` (CI on push to staging)          |

### Phase Requirements → Test Map

| Req ID     | Behavior                                                                      | Test Type   | Automated Command                                 | File Exists? |
| ---------- | ----------------------------------------------------------------------------- | ----------- | ------------------------------------------------- | ------------ |
| MOV-01     | movement = 2 linked rows, net 0, atomic                                       | integration | `pnpm test test/finance/movement-service.test.ts` | ❌ Wave 0    |
| MOV-01     | same-currency guard rejects cross-currency                                    | integration | same                                              | ❌ Wave 0    |
| MOV-02     | reconciliation: saldo reflects counted, trail recorded                        | integration | same                                              | ❌ Wave 0    |
| MOV-03     | expense = 1 row, subtracts from caja saldo                                    | integration | same                                              | ❌ Wave 0    |
| MOV-04     | void movement voids BOTH legs atomically; saldo restored                      | integration | same                                              | ❌ Wave 0    |
| MOV-04     | void expense = single row                                                     | integration | same                                              | ❌ Wave 0    |
| D-07       | applyDelta no-op: cash_transfer/expense leave `balances` untouched            | integration | same                                              | ❌ Wave 0    |
| D-09       | getBalance net-0 invariant: Σ same-currency cajas unchanged after movement    | integration | extend `cash-register-service.test.ts`            | ✅ extend    |
| Regression | cash_transfer inflow does NOT inflate getSummary monthlyRevenue/revenueByKind | integration | extend `summary-by-kind.test.ts`                  | ✅ extend    |
| Regression | 138 inflow-only balance tests still green after outflow extension             | integration | `cash-register-service.test.ts`                   | ✅ exists    |

### Sampling Rate

- **Per task commit:** `npx tsc --noEmit` (local; full suite is CI-only per MEMORY)
- **Per wave merge:** push to staging → CI runs `pnpm test`
- **Phase gate:** CI green on staging before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `test/finance/movement-service.test.ts` — covers MOV-01..04 + applyDelta no-op
- [ ] Extend `test/finance/cash-register-service.test.ts` — getBalance outflow + net-0 invariant + refund-outflow behavior (Pitfall 4)
- [ ] Extend `test/finance/summary-by-kind.test.ts` — cash_transfer-inflow exclusion regression

## Security Domain

> `security_enforcement` not confirmed false → included. Backend-only finance phase.

### Applicable ASVS Categories

| ASVS Category             | Applies | Standard Control                                                                                                                                                                                                                                              |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V4 Access Control         | yes     | Movements/expenses/void are admin-only. Reuse `FINANCE_VOID_ROLES` (routes.ts) for void; movements/expenses need an equivalent write-role check + country scope (T-106-03/04 pattern, routes.ts:124,227). Coach (recepcion) MUST NOT register/void movements. |
| V5 Input Validation       | yes     | Fastify JSON schema on new routes (mirror `voidTransactionSchema`). amount > 0, valid caja ids, reason non-empty for void. NEVER accept `cashRegisterId`/`memberId` for member-keyed paths from raw body (D-03 precedent).                                    |
| V7 Error Handling/Logging | yes     | `request.log` (Pino, no console.log — CLAUDE.md). `auditLog.write` for void + reconciliation (forensic trail, D-04/D-08).                                                                                                                                     |
| V6 Cryptography           | no      | —                                                                                                                                                                                                                                                             |

### Known Threat Patterns

| Pattern                                           | STRIDE      | Standard Mitigation                                                                          |
| ------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------- |
| Coach registers a movement/expense (privilege)    | Elevation   | Role check at route (admin-only); reuse FINANCE_VOID_ROLES-style gate                        |
| Cross-country caja manipulation                   | Tampering   | `request.scope` country check on origen/destino cajas' branch (routes.ts:227 precedent)      |
| Phantom saldo / silent adjust                     | Repudiation | Reconciliation leaves named trail (motivo+autor+fecha) via audit_log 'reconciliation' (D-04) |
| Orphan half-movement (one leg voids, other lives) | Integrity   | Both legs in ONE db.transaction; void the pair atomically (Pitfall 3)                        |

## Project Constraints (from CLAUDE.md)

- API logging: Pino (`request.log`/`app.log`) — never `console.log`.
- No `any`: `catch (err: unknown)` + `instanceof Error`; type the new input/output shapes.
- New API routes MUST have integration tests in `el-templo-api/test/` vs real MySQL (`eltemplo_test`, see `test/helpers.ts`).
- Schema via Drizzle files; migration via `pnpm db:migrate` (custom runner, `_migrations` source of truth). NEVER `drizzle-kit migrate`/`push`.
- Never `;` inside SQL comments (runner splits on `;` before stripping `--`).
- Always commit the migration SQL alongside the schema change.
- Facade pattern for complex finance services (precedent: `edit-service.ts` → domain services; here `MovementService` is a thin facade over `TransactionService`/`CashRegisterService`).
- Update `.env.example` if any new env var (none expected this phase).
- No new dependencies without asking (none needed).

## Sources

### Primary (HIGH confidence — read directly this session)

- `el-templo-api/src/modules/finance/transaction-service.ts` — create()/void()/\_void()/correct()/getSummary()/list()/exportRowsForExcel(); KINDS_ALLOWED_WITHOUT_LINKS:57
- `el-templo-api/src/modules/finance/cash-register-service.ts` — getBalance (// TODO 139:121), resolveCashRegister, currency guard
- `el-templo-api/src/modules/finance/balance-service.ts` — applyDelta (link-iteration no-op, memberId usage)
- `el-templo-api/src/modules/finance/firm-money.ts`, `types.ts`
- `el-templo-api/src/db/schema/financial-transactions.ts`, `transaction-links.ts`
- `el-templo-api/src/modules/shared/audit-log.ts` — AuditAction 'reconciliation'
- `el-templo-api/src/modules/{analytics,reports}/*.ts` — verified every member-keyed finance query's kind/direction/join filters (blast radius)
- `el-templo-api/src/db/migrations/0153_*.sql`, `0154_*.sql` — hand-written precedent
- `.planning/phases/139-.../139-CONTEXT.md` (D-01..D-10, authoritative)
- `.planning/REQUIREMENTS.md` (MOV-01..04)
- `.planning/research/modulo-contable/ARCHITECTURE.md` § Punto 3

### Secondary (MEDIUM — MEMORY/CLAUDE.md)

- CLAUDE.md (migration rules, logging, tests, facade)
- MEMORY: feedback_no_semicolon_in_sql_comments, feedback_tests_run_in_ci_not_local, reference_drizzle_enum_column_name

## Phase Requirements

| ID     | Description                                                    | Research Support                                                                              |
| ------ | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| MOV-01 | Movement = single atomic op origen+destino, net 0              | Pattern 1 (2-row asiento via create(tx) + both-ways links); same-currency guard               |
| MOV-02 | Expected vs counted, trail of physical differences             | Pattern 3 (separate adjustment row + audit 'reconciliation', adjusts origen saldo explicitly) |
| MOV-03 | Expense = outflow from a caja, amount + free note, no category | Pattern 2 (1-row create()); getBalance subtracts it (Pattern 4)                               |
| MOV-04 | Movements/expenses voidable with trail (orthogonal void)       | void-the-pair (Pitfall 3 + Code Examples), reuse \_void(tx); egreso = single void             |

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no new packages; all composition of verified in-repo assets.
- Architecture (2-row + reconciliation + getBalance): HIGH — every primitive read directly; `correct()` is a working precedent for tx-to-tx links + nested \_void.
- member_id blast radius: HIGH — exhaustive grep + per-query filter verification; conclusion (no report breaks) is evidence-backed, not assumed.
- Pitfalls (getSummary leak, refund outflow): HIGH for getSummary (verified conds), MEDIUM for refund-outflow (needs a data check — A2).

**Research date:** 2026-06-24
**Valid until:** 2026-07-24 (stable internal codebase; revalidate if 137/138 services change)
