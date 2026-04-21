---
phase: 98
plan: 01
subsystem: db/schema + migrations
tags: [multi-currency, country-scope, drizzle, migration, es-seed]
requires: []
provides:
  - subscription_plans.country / subscription_plans.currency
  - subscriptions.currency
  - payments.currency
  - promo_plans.country
  - gladius_products.country
  - ux_subscription_plans_name_country (unique index)
  - 12 ES/EUR seed rows in subscription_plans (added by migration once Plan 02 applies it)
affects:
  - every downstream plan in phase 98 (server scoping, validation, UI)
tech-stack-added: []
patterns:
  - manual SQL migration (Phase 86 precedent)
  - unique-index-backed INSERT IGNORE for idempotent seed rows
  - defensive backfill UPDATEs alongside ALTER TABLE ... DEFAULT
key-files-created:
  - el-templo-api/src/db/migrations/0091_multi_currency_and_country_scope.sql
key-files-modified:
  - el-templo-api/src/db/schema/subscription-plans.ts
  - el-templo-api/src/db/schema/subscriptions.ts
  - el-templo-api/src/db/schema/payments.ts
  - el-templo-api/src/db/schema/promo-plans.ts
  - el-templo-api/src/db/schema/gladius-products.ts
decisions:
  - Migration numbered 0091 (not 0069 referenced in SPEC/CONTEXT -- corrected to next sequential slot)
  - price_credit_card left NULL for all ES plans (no proportional EUR value specified)
  - price_zero set equal to price_regular for ES plans (SPEC gives a single EUR price per plan)
  - Unique index created with plain CREATE UNIQUE INDEX (no IF NOT EXISTS) -- runner handles re-apply
completed: 2026-04-21
duration: ~25min
commit: 7c19b713
---

# Phase 98 Plan 01: Multi-currency and country-scoped plans -- Foundation migration Summary

Foundation schema migration that introduces country/currency awareness across pricing-owning tables and seeds 12 ES/EUR subscription plans. Updates five Drizzle schema files, writes `0091_multi_currency_and_country_scope.sql` with six `ALTER TABLE`s, six defensive backfill `UPDATE`s, a unique index on `subscription_plans(name, country)`, and twelve `INSERT IGNORE` seed rows. Migration file is committed but NOT applied -- Plan 02 handles application via `pnpm db:migrate`.

## What Changed

### Drizzle schema files (5)

| File                                                | Column(s) added                                                                                                                               |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/db/schema/subscription-plans.ts` | `country: varchar("country", { length: 2 }).default("AR").notNull()`, `currency: varchar("currency", { length: 3 }).default("ARS").notNull()` |
| `el-templo-api/src/db/schema/subscriptions.ts`      | `currency: varchar("currency", { length: 3 }).default("ARS").notNull()` (between `pricePaid` and `priceTypeApplied`)                          |
| `el-templo-api/src/db/schema/payments.ts`           | `currency: varchar("currency", { length: 3 }).default("ARS").notNull()` (between `amount` and `paymentMethod`)                                |
| `el-templo-api/src/db/schema/promo-plans.ts`        | `country: varchar("country", { length: 2 }).default("AR").notNull()` (between `promoType` and `isActive`)                                     |
| `el-templo-api/src/db/schema/gladius-products.ts`   | `country: varchar("country", { length: 2 }).default("AR").notNull()` (between `status` and `sortOrder`)                                       |

### Migration file (new)

`el-templo-api/src/db/migrations/0091_multi_currency_and_country_scope.sql` contains, in order:

1. **6 `ALTER TABLE ... ADD COLUMN`** (country on plans/promos/gladius, currency on plans/subs/payments).
2. **6 defensive backfill `UPDATE ... WHERE col IS NULL OR col = ''`** (one per newly-added column). Belt-and-suspenders -- no-op on a fresh ALTER, indispensable on re-runs.
3. **`CREATE UNIQUE INDEX ux_subscription_plans_name_country ON subscription_plans (name, country)`** -- makes the 12 ES `INSERT IGNORE` statements genuinely dedup-keyed.
4. **12 `INSERT IGNORE INTO subscription_plans`** seed rows, country='ES', currency='EUR', with exact EUR prices (cents) per SPEC Requirement 4.

## AR plan → ES plan attribute mapping

ES plan attributes (plan_tier, booking_mode, plan_category, duration_days, classes_per_week, multi_branch, is_trial, is_group, group_max_members, linked_program_id) were copied from the matching AR plan queried directly from the local `eltemplo` DB on 2026-04-21. Not invented.

| ES name (SPEC canonical, with accents) | AR template name (DB, ASCII form) | tier        | booking_mode | plan_category  | dur_days | cpw  | multi | trial | group | gmax | linked | EUR (cents) |
| -------------------------------------- | --------------------------------- | ----------- | ------------ | -------------- | -------- | ---- | ----- | ----- | ----- | ---- | ------ | ----------- |
| Flex                                   | Flex                              | flex        | fixed        | presencial     | 30       | 2    | 0     | 0     | 0     | NULL | 3      | 7000        |
| Flex+                                  | Flex+                             | flex        | flexible     | presencial     | 30       | 6    | 0     | 0     | 0     | NULL | 3      | 9000        |
| Foundation                             | Foundation                        | foundation  | fixed        | presencial     | 120      | 2    | 0     | 0     | 0     | NULL | 3      | 21000       |
| Foundation+                            | Foundation+                       | foundation  | flexible     | presencial     | 120      | 6    | 1     | 0     | 0     | NULL | 3      | 30000       |
| Performance                            | Performance                       | performance | flexible     | presencial     | 240      | 6    | 1     | 0     | 0     | NULL | 3      | 50000       |
| Sesión de Prueba                       | Sesion de Prueba                  | other       | fixed        | presencial     | 1        | 1    | 0     | 1     | 0     | NULL | 3      | 0           |
| 30 Días Online                         | 30 Dias Online                    | other       | flexible     | online_regular | 30       | NULL | 0     | 0     | 0     | NULL | 2      | 2000        |
| Cero a Atleta                          | Cero a Atleta                     | other       | flexible     | online_regular | 30       | NULL | 0     | 0     | 0     | NULL | 5      | 3000        |
| Foundation Online                      | Foundation Online                 | other       | flexible     | online_regular | 30       | NULL | 0     | 0     | 0     | NULL | 3      | 3000        |
| Piernas y Glúteos                      | Piernas y Gluteos                 | other       | flexible     | online_goal    | 30       | NULL | 0     | 0     | 0     | NULL | 4      | 3000        |
| Promo Gratuito 30 Días                 | Promo Gratuito 30 Dias            | other       | flexible     | online_regular | 30       | NULL | 0     | 1     | 0     | NULL | NULL   | 0           |
| Tu Primer Front Lever                  | Tu Primer Front Lever             | other       | flexible     | online_goal    | 30       | NULL | 0     | 0     | 0     | NULL | 6      | 3000        |

## Decisions made during execution

- **Migration number:** `0091` (next sequential slot after `0090_completed_sessions_level.sql`). SPEC/CONTEXT reference `0069` but that predates intervening migrations; the PLAN already flagged this in its `note_on_migration_number` block.
- **`price_credit_card = NULL` for all 12 ES plans.** The AR `Foundation` / `Foundation+` / `Performance` rows have non-NULL `price_credit_card` surcharges (280000/370000/670000 in ARS cents), but no proportional EUR surcharge was specified. Per plan's action guidance ("if unsure, set NULL and note in SUMMARY"), NULL was used. This can be filled in later by a small data migration or manual SQL once pricing is finalized.
- **`price_zero = price_regular` for all 12 ES plans.** SPEC Requirement 4 gives a single EUR price per plan -- no zero-payment discount specified for ES. Equal values preserve the NOT NULL constraint without implying a discount.
- **ES names use SPEC's canonical accented form** ("Sesión", "Días", "Glúteos") even though AR plan names in the DB are ASCII-only. Collation is `utf8mb4_0900_ai_ci` (accent-insensitive). Unique index is on `(name, country)` so the AR (country='AR') and ES (country='ES') rows never collide regardless of accent folding.
- **`CREATE UNIQUE INDEX` without `IF NOT EXISTS`** per plan guidance. The `run-migrations.ts` runner catches `"Duplicate key name"` errors and skips them, so hand-driven re-runs stay safe even without the `IF NOT EXISTS` syntax.
- **Drizzle `$type<'AR' | 'ES'>()` narrowing NOT applied.** The PLAN's interface block specified plain `varchar(...)` without type narrowing, and CLAUDE.md guidance in the executor context left the literal-union narrowing as "if the Drizzle version supports it." Left as plain string to match the PLAN verbatim; follow-up plans that add type-safe scope parameters can narrow via cast sites (e.g., service method signatures `country: 'AR' | 'ES'`).

## Deviations from Plan

None. The plan was executed exactly as written:

- 5 schema files modified with the exact column definitions from the plan's interfaces block.
- Migration file contains the 4 sections in the prescribed order.
- 6 ALTERs, 6 defensive UPDATEs, 1 unique index, 12 INSERT IGNOREs -- all counts match.
- `pnpm db:generate` was NOT run (manual SQL per Phase 86 precedent, D-15).
- `pnpm db:migrate` was NOT run (that is Plan 02's blocking checkpoint task).
- No dependencies installed, no remote pushes.

## Verification

All automated acceptance-criteria checks passed before commit:

- `grep -c 'country: varchar("country"'` in `subscription-plans.ts` / `promo-plans.ts` / `gladius-products.ts` → 1 each
- `grep -c 'currency: varchar("currency"'` in `subscription-plans.ts` / `subscriptions.ts` / `payments.ts` → 1 each
- `0091_multi_currency_and_country_scope.sql` exists
- `grep -c '^ALTER TABLE' 0091_*.sql` → 6
- `grep -c '^UPDATE .* WHERE .* IS NULL' 0091_*.sql` → 6
- `grep -iE 'UNIQUE (INDEX|KEY)[^;]*subscription_plans[^;]*name[^;]*country' 0091_*.sql` → matches
- `grep -c 'INSERT IGNORE INTO subscription_plans\|INSERT INTO subscription_plans' 0091_*.sql` → 12
- All expected price strings present: `7000`, `9000`, `21000`, `30000`, `50000`, `2000`, `3000`
- `'ES'` and `'EUR'` present (13 occurrences each -- 1 per plan + comment lines)
- `cd el-templo-api && pnpm tsc --noEmit` → exits 0 (no TypeScript errors)

## Next Step

Plan 02 (Wave 1 continuation) must run `pnpm db:migrate` against both `eltemplo` (local dev) and `eltemplo_test` databases, then verify:

- `_migrations` table contains a row with `name = '0091_multi_currency_and_country_scope.sql'`
- `SELECT COUNT(*) FROM subscription_plans WHERE country='ES'` returns 12
- `SELECT COUNT(*) FROM subscription_plans WHERE country IS NULL OR currency IS NULL` returns 0
- Unique index `ux_subscription_plans_name_country` present (`SHOW INDEX FROM subscription_plans`)
- Equivalent row-count assertions on `subscriptions.currency`, `payments.currency`, `promo_plans.country`, `gladius_products.country`

## Commits

- `7c19b713` — feat(98-01): add country/currency schema + 0091 migration with AR/ARS backfill and 12 ES plan seeds

## Self-Check: PASSED

- FOUND: el-templo-api/src/db/migrations/0091_multi_currency_and_country_scope.sql
- FOUND: el-templo-api/src/db/schema/subscription-plans.ts (modified, country+currency columns present)
- FOUND: el-templo-api/src/db/schema/subscriptions.ts (modified, currency column present)
- FOUND: el-templo-api/src/db/schema/payments.ts (modified, currency column present)
- FOUND: el-templo-api/src/db/schema/promo-plans.ts (modified, country column present)
- FOUND: el-templo-api/src/db/schema/gladius-products.ts (modified, country column present)
- FOUND: commit 7c19b713 in git log
