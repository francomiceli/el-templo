---
phase: 98-multi-currency-and-country-scoped-plans
plan: 02
subsystem: shared-primitives
tags: [migration, preHandler, formatter, multi-currency]
requires:
  - "phase 98 plan 01 (schema + migration file + Drizzle schemas)"
provides:
  - "0091 migration applied to local eltemplo DB (_migrations row present)"
  - "attachCountryScope preHandler (el-templo-api/src/modules/shared/country-scope.ts)"
  - "formatPrice utility duplicated in el-templo-admin and el-templo-app"
affects:
  - "Plan 03 (server enforcement — imports attachCountryScope and registers it per plugin)"
  - "Plans 04-10 (UI — import formatPrice at ~10 call sites)"
  - "Plan 11 (integration tests — run against the same runner; test DB is bootstrapped by test/helpers.ts)"
tech_stack:
  added: []
  patterns:
    - "Fastify preHandler with ambient FastifyRequest augmentation (matches plugins/auth.ts)"
    - "Duplicated per-app utility file (matches extract-error.ts — no pnpm workspace)"
    - "Intl.NumberFormat with per-currency locale (es-AR for ARS, es-ES for EUR)"
key_files:
  created:
    - "el-templo-api/src/modules/shared/country-scope.ts"
    - "el-templo-admin/src/utils/format-price.ts"
    - "el-templo-app/src/utils/format-price.ts"
    - ".planning/phases/98-multi-currency-and-country-scoped-plans/deferred-items.md"
  modified:
    - "el-templo-api/src/db/migrations/0091_multi_currency_and_country_scope.sql"
decisions:
  - "Deviated from PLAN's `request.user.branchId` access — JWT payload only carries {userId,email,role}. Resolved branch country via a single users->branches JOIN keyed on userId."
  - "Formatter divides by 100 (minor-unit / cents scale), confirming the SPEC Req 4 EUR seed values (7000 = €70). AR call-site migration in Plan 04+ adjusts existing peso-scale callers."
  - "Unknown currency fallback returns a plain `es-AR` number instead of throwing — deployed mobile app compat per D-19."
metrics:
  duration: "~25 minutes"
  completed_date: "2026-04-21"
---

# Phase 98 Plan 02: Shared primitives + migration apply — Summary

Applied the 0091 multi-currency migration to the local `eltemplo` DB, created
the `attachCountryScope` Fastify preHandler, and duplicated the `formatPrice`
utility in both frontend apps.

## Deviations from Plan

### Rule 1 - Bug: 0091 migration was unrunnable due to stray semicolons in comment prose

**Found during:** Checkpoint before Task 1 (prior agent diagnosis; user-approved
Option A remediation).

**Issue:** `run-migrations.ts` splits SQL on `;` **before** stripping `--`
comment lines. Two narrative comments in `0091_multi_currency_and_country_scope.sql`
contained inline semicolons:

- Line 5: `--    already backfills on ALTER; these UPDATEs are ...`
- Line 65: `-- specified for ES; SPEC gives a single EUR price per plan).`

Each semicolon split the stream mid-comment, producing a malformed phantom
statement at parse time. 0083-0090 applied cleanly; 0091 failed with zero
partial side-effects (no `_migrations` row, no columns created, no seed rows),
confirmed via SQL probe before fixing.

**Fix:** Replaced each `;` inside the comments with a `:` so the prose reads
naturally without tripping the parser. No SQL semantics changed — purely a
comment-text edit.

**Verification:** Post-fix `awk` count shows 25 statement-terminating
semicolons (6 ALTER + 6 UPDATE + 1 CREATE INDEX + 12 INSERT IGNORE = 25) and
zero semicolons on lines starting with `--`.

**Commit:** `8314b225`
**Files modified:** `el-templo-api/src/db/migrations/0091_multi_currency_and_country_scope.sql`

### Rule 2 - Correctness: JWT payload does not include branchId

**Found during:** Task 2 implementation.

**Issue:** The PLAN's action block and behavior spec both referenced
`request.user.branchId`, but `el-templo-api/src/plugins/auth.ts` declares the
JWT payload as `{ userId, email, role }` only — there is no `branchId` on
`request.user`.

**Fix:** Resolved the user's branch country via a single JOIN on users ->
branches keyed on `request.user.userId` (reusing the same SQL shape as
`holiday-service.ts` lines 41-44). One extra SELECT per request. Plan 03's
per-route registration will not be affected.

**Files:** `el-templo-api/src/modules/shared/country-scope.ts` (only — Plan 03
owns plugin registration).

### PLAN acceptance-criterion arithmetic erratum

`98-02-PLAN.md` line 219 asserts the ES plan sum is 102000; the correct sum
of SPEC Req 4 values is **131000** (7000 + 9000 + 21000 + 30000 + 50000 + 0 +
2000 + 3000 + 3000 + 3000 + 0 + 3000). Each individual seed row matches SPEC
exactly — only the total was miscalculated. No data change needed; future
plans that duplicate this sum-check should use 131000. Logged in
`deferred-items.md`.

### Out of scope (deferred)

- Pre-existing `tsc --noEmit` errors in both frontends (pdfmake typing;
  Quasar/Vite module-alias typings). Confirmed none originate from the new
  `format-price.ts` files via filename filter. See `deferred-items.md`.
- Hardening `run-migrations.ts` to strip comments before splitting on `;`.
  Non-trivial change, belongs in its own plan. See `deferred-items.md`.
- Folding `branchId` into the JWT payload. Saves a lookup per request but
  invalidates existing tokens on rollout. See `deferred-items.md`.

## Migration apply transcript

```
> tsx src/db/run-migrations.ts
[dotenv] injecting env (12) from .env.development
[dotenv] injecting env (6) from .env
Applying: 0091_multi_currency_and_country_scope.sql (25 statements)
  Applied successfully
Applied 1 migration(s)
```

Only 0091 was pending — migrations 0083-0090 had applied cleanly on an
earlier run. The 0091 apply was a single clean run, no `_migrations`
manipulation required. (Per user preference `feedback_prod_data_via_migrations`,
no manual `_migrations` DELETE/UPDATE was executed.)

## Verification query results (local `eltemplo` DB)

| Check | Query                                                                                      | Result                                               | Expected                                   | Status             |
| ----- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------ | ------------------ |
| 1     | `SELECT name FROM _migrations WHERE name LIKE '0091%'`                                     | 1 row, applied 2026-04-21 19:14:02                   | 1 row                                      | OK                 |
| 2     | `SELECT DISTINCT country FROM subscription_plans`                                          | `{AR, ES}`                                           | `{AR, ES}`                                 | OK                 |
| 3     | `SELECT COUNT(*) FROM subscription_plans WHERE country='ES'`                               | `12`                                                 | `12`                                       | OK                 |
| 4     | `SELECT SUM(price_regular) FROM subscription_plans WHERE country='ES'`                     | `131000`                                             | `131000` (plan text said 102000 — erratum) | OK, per SPEC Req 4 |
| 5     | Null-backfill on plans `(country IS NULL OR currency IS NULL)`                             | `0`                                                  | `0`                                        | OK                 |
| 6     | Null-backfill on subscriptions `(currency IS NULL)`                                        | `0`                                                  | `0`                                        | OK                 |
| 7     | Null-backfill on payments `(currency IS NULL)`                                             | `0`                                                  | `0`                                        | OK                 |
| 8     | Null-backfill on promo_plans `(country IS NULL)`                                           | `0`                                                  | `0`                                        | OK                 |
| 9     | Null-backfill on gladius_products `(country IS NULL)`                                      | `0`                                                  | `0`                                        | OK                 |
| 10    | `SHOW INDEX FROM subscription_plans WHERE Key_name = 'ux_subscription_plans_name_country'` | 2 rows (`name` seq 1, `country` seq 2, Non_unique=0) | 2 unique-index rows                        | OK                 |

ES plan spot-check (all rows currency='EUR', country='ES'):

| Name                   | price_regular |
| ---------------------- | ------------- |
| Flex                   | 7000          |
| Flex+                  | 9000          |
| Foundation             | 21000         |
| Foundation+            | 30000         |
| Performance            | 50000         |
| Sesión de Prueba       | 0             |
| 30 Días Online         | 2000          |
| Cero a Atleta          | 3000          |
| Foundation Online      | 3000          |
| Piernas y Glúteos      | 3000          |
| Promo Gratuito 30 Días | 0             |
| Tu Primer Front Lever  | 3000          |

All values match SPEC Requirement 4 exactly.

## Test DB skipped

Per prior executor Q2 approval, the integration-test DB (`eltemplo_test`) was
not manually migrated in this plan. Plan 11's `test/helpers.ts` bootstraps
the test DB inside `beforeAll` using the same `run-migrations.ts` runner, so
0091 will apply automatically the next time `pnpm test` runs.

## attachCountryScope preHandler

Created `el-templo-api/src/modules/shared/country-scope.ts`:

- Exports `attachCountryScope(request, db)` async preHandler
- Exports `CountryCode` type (`'AR' | 'ES'`) and `CountryScope` interface
- Augments `FastifyRequest` with `scope: CountryScope` via ambient module declaration
- Owner (role in `OWNER_ROLES`): honors `?country=AR|ES` query param (D-02, D-06)
- Non-owner: ignores any client-supplied country; derives from branch (D-02)
- Resolves branch country via `users -> branches` JOIN on `request.user.userId`
- No `any` types, no `console.log`; uses `request.log.warn` for diagnostics
- Plugin registration happens in Plan 03 — this plan creates the primitive only

TypeScript compiles clean (`cd el-templo-api && pnpm tsc --noEmit` returns 0).

## formatPrice utility

Created two matching files with per-app Prettier conventions:

- `el-templo-admin/src/utils/format-price.ts` (semicolons, single quotes)
- `el-templo-app/src/utils/format-price.ts` (no semicolons, single quotes)

Logically identical: divides amount by 100 then formats with
`Intl.NumberFormat('es-AR' | 'es-ES', { style: 'currency', currency, maximumFractionDigits: 0 })`.
Unknown currency strings fall back to `value.toLocaleString('es-AR')` per
D-19's "deployed-app compat" rule.

Grep checks pass in both files (`export function formatPrice`, `export type Currency`,
`Intl.NumberFormat`). ESLint and Prettier pre-commit hooks passed on both.

## Follow-up recommendations

1. **Harden `run-migrations.ts`** to strip comment lines before splitting on
   `;`. Directly eliminates the class of bug that bit 98-02 Task 0. Small,
   low-risk change (see `deferred-items.md` for proposed patch).
2. **Fix pre-existing frontend `tsc --noEmit` errors** (pdfmake typing in
   admin; Quasar/Vite module-alias typings in app). Dedicated plan; independent
   of Phase 98.
3. **Consider adding `branchId` to the JWT payload** if profiling of the new
   preHandler shows the extra JOIN is a hot-path concern. Non-trivial deploy
   coordination (existing tokens invalidated).

## Self-Check: PASSED

Files created (verified):

- `el-templo-api/src/modules/shared/country-scope.ts` - FOUND
- `el-templo-admin/src/utils/format-price.ts` - FOUND
- `el-templo-app/src/utils/format-price.ts` - FOUND
- `.planning/phases/98-multi-currency-and-country-scoped-plans/deferred-items.md` - FOUND

Commits (verified via `git log --oneline`):

- `8314b225` fix(98-02): escape stray semicolons in 0091 migration comments that broke SQL parser - FOUND
- `c9ff757e` feat(98-02): add attachCountryScope preHandler for country-scoped data access - FOUND
- `944f4b89` feat(98-02): add formatPrice utility to admin and member app - FOUND

Migration row (verified via `SELECT name FROM _migrations WHERE name LIKE '0091%'`):

- `0091_multi_currency_and_country_scope.sql` at 2026-04-21 19:14:02 - FOUND

All acceptance criteria satisfied except the two docstring exceptions noted
above (PLAN's 102000 sum erratum; PLAN's `request.user.branchId` reference).
