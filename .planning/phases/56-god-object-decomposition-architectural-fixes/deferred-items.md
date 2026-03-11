# Deferred Items — Phase 56

## Drizzle Correlated Subquery Bug in Payments Service

**Found during:** Plan 56-05, Task 1
**File:** `el-templo-api/src/modules/payments/service.ts`
**Lines:** 433, 494, 512, 537

The payments service has the same Drizzle ORM correlated subquery bug that was fixed in the analytics service. Using `${schema.subscriptions.id}` inside `sql` template literal correlated subqueries generates parameter placeholders instead of column references. These should be replaced with raw SQL column names (`subscriptions.id`, `subscriptions.price_paid`).

**Impact:** The morosos count, overdue detection, and financial summary in the payments module may return incorrect results when subscriptions have linked payments.

**Fix:** Replace all `${schema.subscriptions.id}` with `subscriptions.id` and `${schema.subscriptions.pricePaid}` with `subscriptions.price_paid` inside correlated subqueries in `payments/service.ts`.
