---
phase: 120-fundaci-n-transversal-ticket-promedio
plan: 02
subsystem: subscriptions / analytics-foundation
tags: [migration, schema, snapshot, ticket, subscriptions]
requires:
  - subscription_plans.priceRegular (existing notNull int)
provides:
  - subscriptions.priceRegularSnapshot (nullable int column)
  - forward price-regular snapshot at the 4 real-charge insert sites
affects:
  - Plan 120-04 (ticket discount metric consumes priceRegularSnapshot)
tech-stack:
  added: []
  patterns:
    - Nullable column forward-snapshot (no backfill, list price never stored)
    - Hand-written ADD COLUMN migration, semicolon-safe comments
key-files:
  created:
    - el-templo-api/src/db/migrations/0136_add_subscriptions_price_regular_snapshot.sql
  modified:
    - el-templo-api/src/db/schema/subscriptions.ts
    - el-templo-api/src/modules/subscriptions/service.ts
decisions:
  - "Snapshot captured at exactly 4 real-charge insert sites; 5th bulkMigratePlan (\$0) left NULL by design"
  - "Column nullable — no backfill possible (historical list price was never stored)"
metrics:
  duration: ~6min
  completed: 2026-06-04
  tasks: 3
  files: 3
---

# Phase 120 Plan 02: Price Regular Snapshot Foundation Summary

Forward price snapshot (D-05/D-06): one nullable `price_regular_snapshot` column on `subscriptions`, captured from the plan's current `priceRegular` at the 4 membership-charge insert sites (assign, change-now, change-after-current, renew). Data foundation for the faithful ticket discount (TICKET-03, consumed in Plan 04).

## What Was Built

### Task 1 — Schema column

Added `priceRegularSnapshot: int("price_regular_snapshot")` (nullable) to `subscriptions.ts`, immediately after `priceOverrideReason`, with an inline comment documenting the NULL-before-migration semantics. No index, no drizzle-kit generate.

- Commit: `b9ca68d9`

### Task 2 — Migration 0136

Hand-written `0136_add_subscriptions_price_regular_snapshot.sql`: single `ALTER TABLE subscriptions ADD COLUMN price_regular_snapshot INT NULL AFTER price_override_reason;`. No `IF NOT EXISTS`. Comment block explains forward-only fidelity and the semicolon-safety invariant. Verified no `--` comment line contains a `;`. This is the ONLY migration in Phase 120 (D-06). Committed alongside the schema change.

- Commit: `b9ca68d9`

### Task 3 — Snapshot capture at 4 real-charge insert sites

Added `priceRegularSnapshot: <plan>.priceRegular` to each of the 4 real-charge `tx.insert(schema.subscriptions).values({...})` blocks, reusing the same in-scope plan variable as the adjacent `currency:` field:

| Site                 | Method                   | Line | Plan variable |
| -------------------- | ------------------------ | ---- | ------------- |
| assign               | `assignPlan`             | 1093 | `plan`        |
| change-now           | `changePlanNow`          | 2434 | `newPlan`     |
| change-after-current | `changePlanAfterCurrent` | 2809 | `targetPlan`  |
| renew                | `renewSubscription`      | 3080 | `plan`        |

The 5th insert site (`bulkMigratePlan`, `pricePaid: 0`, no `currency`, no `plan_charge`) is INTENTIONALLY left with a NULL snapshot — it is a legacy migration insert, not a real membership charge, and stays out of the ticket universe. `grep -c "priceRegularSnapshot:" service.ts` == 4 by design (count of 5 would be a regression).

- Commit: `1f5d1436`

## Verification

- `grep -c priceRegularSnapshot src/db/schema/subscriptions.ts` → 1
- `grep -c "ADD COLUMN price_regular_snapshot"` in migration → 1; no `;` in any `--` comment line
- `grep -c "priceRegularSnapshot:" src/modules/subscriptions/service.ts` → 4
- `pnpm exec tsc --noEmit` → exit 0 (clean) — confirms each plan variable (`plan`/`newPlan`/`targetPlan`) carries `priceRegular`
- Full test suite NOT run locally (MEMORY: CI runs it on staging push); migration applied via pipeline `pnpm db:migrate`, NOT locally and NOT via drizzle-kit.

## Deviations from Plan

None — plan executed exactly as written. The insert-site line numbers were ~17 lines below the plan's stated approximations (1075→1092, 2414→2432, 2788→2806, 3059→3076); each site was confirmed by its in-scope plan variable before editing.

## Known Stubs

None. Pre-migration rows and `bulkMigratePlan` rows remaining NULL is an intentional, documented design property (D-05/D-06), not a stub.

## Self-Check: PASSED

- FOUND: el-templo-api/src/db/migrations/0136_add_subscriptions_price_regular_snapshot.sql
- FOUND: schema change in el-templo-api/src/db/schema/subscriptions.ts
- FOUND: commit b9ca68d9 (schema + migration)
- FOUND: commit 1f5d1436 (service capture)
