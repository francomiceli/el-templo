# Phase 98 — Pickup Notes (AFK run)

Things the user should review when back. Append-only log.

---

## 2026-04-21 — Scale convention fixed mid-execution

**Issue:** Phase 98 SPEC + CONTEXT said "amount in whole currency units" but also told the planner to store ES plans in cents (7000 = €70). AR plans are stored as whole pesos (15000 = $15.000). `formatPrice` (Plan 02) divided by 100 — correct for EUR-as-cents, wrong for AR-as-pesos.

**User decision (while AFK):** "We don't use cents ANYWHERE, pesos or euros."

**Fix applied:**

1. Migration `0092_normalize_es_prices_to_whole_eur.sql` — divides ES plan `price_regular` and `price_zero` by 100 for the 12 seeded ES plans.
2. `formatPrice` in both apps changed to NOT divide by 100 — treats all amounts as whole currency units. Both AR and EUR now consistent.
3. SPEC.md Requirement 4 acceptance updated: EUR prices stored as whole units (Flex €70 = 70, Performance €500 = 500), NOT in cents.

**Files touched:**

- `el-templo-api/src/db/migrations/0092_normalize_es_prices_to_whole_eur.sql` (new)
- `el-templo-admin/src/utils/format-price.ts`
- `el-templo-app/src/utils/format-price.ts`
- `.planning/phases/98-multi-currency-and-country-scoped-plans/98-SPEC.md` (Req 4 acceptance updated)

**What to review:**

- Migration 0092 — confirm applied cleanly to local dev DB (should have been run during pickup of Plan 08)
- Staging + prod will need 0092 run alongside 0091 when deployed

---
