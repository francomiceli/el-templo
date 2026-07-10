# Phase 157: Núcleo transaccional de referidos - Pattern Map

**Mapped:** 2026-07-10
**Files analyzed:** 12 (5 new, 7 modified) + 5 new test files
**Analogs found:** 12 / 12 (all surfaces have a concrete in-repo analog)

> Scope note: this branch tops out at migration **0173**; master/staging at **0175**. Numbers below say `0176+` per RESEARCH Pitfall 1. Re-verify `git ls-tree origin/master` before writing the SQL.

## File Classification

| New/Modified File                                                                           | Role         | Data Flow                    | Closest Analog                                                                                            | Match Quality     |
| ------------------------------------------------------------------------------------------- | ------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------- |
| `el-templo-api/src/db/schema/referrals.ts` (NEW)                                            | model/schema | CRUD                         | `db/schema/aura-transactions.ts` (enums + uniqueIndex + self/user FK)                                     | exact             |
| `el-templo-api/src/db/schema/referral-credits.ts` (NEW)                                     | model/schema | event-driven (append-only)   | `db/schema/user-sepa-details.ts` (recent additive table) + `aura-transactions.ts` (idempotency index)     | exact             |
| `el-templo-api/src/db/schema/users.ts` (MODIFY: `+referralCode`, `+referredBy`)             | model/schema | transform                    | `users.ts:163` `createdBy` self-FK + `:191` index                                                         | exact (same file) |
| `el-templo-api/src/db/schema/index.ts` (MODIFY: 2 exports)                                  | config       | —                            | `index.ts:54` `export * from "./user-sepa-details"`                                                       | exact             |
| `el-templo-api/src/db/migrations/0176_referrals_core.sql` (NEW)                             | migration    | batch                        | `0171_user_sepa_details.sql` (CREATE TABLE) + `0157_seed_finance_overdue_threshold.sql` (idempotent seed) | exact             |
| `el-templo-api/src/modules/referrals/service.ts` (NEW)                                      | service      | CRUD + transform             | `modules/settings/service.ts` (config read-with-fallback) + `subscriptions/service.ts` helpers            | role-match        |
| `el-templo-api/src/modules/subscriptions/service.ts` (MODIFY: 4 charge-paths + preview)     | service      | request-response / transform | its own `input.auraSpend` discount block (`:1252-1274`)                                                   | exact (same file) |
| `el-templo-api/src/modules/auth/routes.ts` (MODIFY: resolve `?ref`)                         | route        | request-response             | `auth/routes.ts:193-273` `promoCode` flow (same file)                                                     | exact (same file) |
| `el-templo-api/src/modules/members/service.ts` (MODIFY: `createMember` writes `referredBy`) | service      | CRUD                         | `members/service.ts:815` `createdBy: input.createdBy` (fase 114 pattern)                                  | exact (same file) |
| `el-templo-app/src/pages/RegisterPage.vue` (MODIFY: capture `?ref`)                         | component    | request-response             | `RegisterPage.vue:213` `route.query.promo` computed (same file)                                           | exact (same file) |
| `el-templo-admin/src/components/MemberFormDialog.vue` (MODIFY: "¿Quién lo trajo?")          | component    | request-response             | `scheduling/SlotDetailDialog.vue:366-399` member-search q-select + `:898` `onMemberSearch`                | role-match        |
| `el-templo-api/test/referrals/*.test.ts` (5 NEW)                                            | test         | —                            | `test/subscriptions/renewal.test.ts` + `test/subscriptions/_helpers.ts`                                   | exact             |

## Pattern Assignments

### `el-templo-api/src/db/schema/referrals.ts` (NEW — model, CRUD)

**Analog:** `db/schema/aura-transactions.ts` (enums + uniqueIndex + FK) and `users.ts` (self-FK typing).

**Enum + table skeleton** — copy the `mysqlEnum` + `mysqlTable(name, {...}, (table) => [ ... ])` shape from `aura-transactions.ts:13-50`:

```typescript
// aura-transactions.ts:13 — enum declared at module scope, first arg = physical column name
export const sourceTypeEnum = mysqlEnum("source_type", ["training_completion", ...]);
export const auraTransactions = mysqlTable("aura_transactions", { ... }, (table) => [
  uniqueIndex("unique_user_source_ref").on(table.userId, table.sourceType, ...),
]);
```

For `referrals`, declare `status` (`pending|qualified|revoked`) and `attributionChannel` (`self_service|assisted`) as module-scope `mysqlEnum` — **cross-check the first-arg column name byte-for-byte against the SQL** (RESEARCH Pitfall 3). `referredId` gets `.unique()` (D-14). Both `referrerId`/`referredId` are `int(...).references(() => users.id)`.

**Self-referencing FK typing** — both FKs point at `users.id`; use the `AnyMySqlColumn` callback form from `users.ts:11` + `:163` to avoid circular-init TS error (also applies to `createdBy` on this table):

```typescript
// users.ts:163 [VERIFIED]
createdBy: int("created_by").references((): AnyMySqlColumn => users.id, {
  onDelete: "set null",
}),
```

Note: `referrals.referrerId`/`referredId` reference `users` (a different table), so the plain `() => users.id` form is fine there; only same-table self-refs need `AnyMySqlColumn`.

**Timestamps** — copy `createdAt`/`updatedAt` from `user-sepa-details.ts:30-31` (`.defaultNow().notNull()` / `.onUpdateNow()`). `qualifiedAt: timestamp("qualified_at")` nullable (set on flip).

**Relations block** — copy the `relations(...)` export shape from `aura-transactions.ts:52-60`.

---

### `el-templo-api/src/db/schema/referral-credits.ts` (NEW — model, append-only)

**Analog:** `user-sepa-details.ts` (recent additive table, clean shape) + `aura-transactions.ts:42-49` idempotency index.

**Idempotency** — the auditable annotation must be idempotent per-charge. Reuse the `uniqueIndex(...).on(...)` pattern from `aura-transactions.ts:43`, keyed by **`subscriptionId`** (the per-charge sub id), NOT `referralId` (RESEARCH Anti-Pattern: monthly collision). Columns: `userId`, `subscriptionId`, `percent`, `amount`, `createdAt`.

**Column style** — `int`/`varchar` + `.defaultNow().notNull()` timestamps exactly as `user-sepa-details.ts:10-31`.

---

### `el-templo-api/src/db/schema/users.ts` (MODIFY — add `referralCode`, `referredBy`)

**Analog:** same file, `createdBy` at `:163` and its index at `:191`.

**`referredBy`** — clone `createdBy` verbatim (`:163-165`): self-FK `AnyMySqlColumn` callback, `onDelete: "set null"`. Add matching `index("idx_users_referred_by").on(table.referredBy)` next to `:191`.

**`referralCode`** — `varchar("referral_code", { length: 16 }).unique()` (REF-01; nullable — lazy/eager fill per D-25). Mirror the inline-comment discipline seen throughout this file (every column documents its phase + decision).

---

### `el-templo-api/src/db/schema/index.ts` (MODIFY — 2 exports)

**Analog:** `index.ts:54` `export * from "./user-sepa-details";`. Append `export * from "./referrals";` and `export * from "./referral-credits";` (Runtime State Inventory: required or types won't compile).

---

### `el-templo-api/src/db/migrations/0176_referrals_core.sql` (NEW — migration, hand-written)

**Analog A — CREATE TABLE:** `0171_user_sepa_details.sql` (whole file). Copy the `CREATE TABLE IF NOT EXISTS` + explicit `CONSTRAINT ... PRIMARY KEY` / `UNIQUE` / `FOREIGN KEY` style (`:5-20`). Header comment must state "hand-written: drizzle-kit generate roto por drift" (`:1-4`).

**Analog B — idempotent seed** (`aura_config` fila `referral` + `system_settings['referral.max_percent_cap']`): `0157_seed_finance_overdue_threshold.sql` (whole file):

```sql
-- 0157 [VERIFIED]
INSERT INTO `system_settings` (`setting_key`, `setting_value`)
SELECT 'finance.pending_overdue_days', '3'
WHERE NOT EXISTS (
  SELECT 1 FROM `system_settings` WHERE `setting_key` = 'finance.pending_overdue_days'
);
```

Apply the same `INSERT ... SELECT ... WHERE NOT EXISTS` to seed `aura_config` `referral` row (`default_amount = 10`, D-22) and `system_settings['referral.max_percent_cap'] = '40'`. New columns on `users` go via `ALTER TABLE ADD COLUMN` in the same file.

**Hard rules (RESEARCH Pitfalls 1/2/3):** number `0176+` after re-verifying master; **zero `;` inside `--` comments**; enum column names + value order must match the schema `mysqlEnum` first-arg byte-for-byte. Do NOT backfill ~2000 codes here (D-25).

---

### `el-templo-api/src/modules/referrals/service.ts` (NEW — service)

**Analog A — config read-with-fallback:** `modules/settings/service.ts:37-45` `getFlag()`:

```typescript
// settings/service.ts:37 [VERIFIED]
private async getFlag(key: string): Promise<boolean> {
  const [row] = await this.db
    .select({ settingValue: systemSettings.settingValue })
    .from(systemSettings)
    .where(eq(systemSettings.settingKey, key))
    .limit(1);
  return row?.settingValue === ON;  // fallback default when absent
}
```

Clone this reader for `referral.max_percent_cap` (from `system_settings`) and read `defaultAmount` from `aura_config` where `sourceType = 'referral'`, each with a hardcoded fallback (10 / 40) if the row is missing. Constructor DI shape (`db`, `log`) also from `settings/service.ts:26-30`.

**Analog B — "activo" via coverage:** `deriveCoveredUntil` standalone fn at `subscriptions/service.ts:176-194`:

```typescript
// subscriptions/service.ts:176 [VERIFIED] — MAX(endDate) over active|scheduled subs
export async function deriveCoveredUntil(db, userId): Promise<string | null> { ... }
// Usage (D-09/D-24): const cov = await deriveCoveredUntil(db, counterpartyId);
//                     const active = cov !== null && cov >= todayStr();
```

Use exactly this helper for the counterparty-active check (Don't-Hand-Roll: never re-query `users.status`).

**Analog C — code generation uniqueness:** unicity by DB `UNIQUE` + retry, not entropy (Security V6). No crypto RNG. `promo-plans.ts` is the reference for "unique code column" but NOT reused directly.

**Discount computation** — the `[ASSUMED]` `computeReferralDiscountPercent` from RESEARCH §Code Examples: bidirectional `or(eq(referrerId,X), eq(referredId,X))` + `status='qualified'`, count active counterparties, `Math.min(active * percentPerLink, maxPercent)` (DESC-04).

---

### `el-templo-api/src/modules/subscriptions/service.ts` (MODIFY — 4 charge-paths + preview)

**Analog:** the existing `input.auraSpend` discount block **in this same file**, `:1252-1274`. This is the exact shape the referral discount must mirror (reduce `pricePaid`, persist discount columns):

```typescript
// subscriptions/service.ts:1252 [VERIFIED]
if (input.auraSpend && input.auraSpend > 0) {
  const tier = AURA_DISCOUNT_TIERS.find((t) => t.spend === input.auraSpend);
  ...
  await this.auraService.spend({ userId, amount: tier.spend, ... });  // <-- do NOT copy: infla/decrementa balance
  auraDiscount = tier.spend;
  auraDiscountPercent = tier.percent;
  const discountAmount = Math.floor(basePrice * (tier.percent / 100));
  pricePaid = basePrice - discountAmount;
}
```

**Copy the price-math (`Math.floor(basePrice * pct/100)`, `pricePaid = basePrice - discountAmount`) but NOT the `auraService.spend()` call** (RESEARCH Anti-Patterns). Referral discount is server-computed (no `input.*`), writes to **NEW columns** `referralDiscountPercent`/`referralDiscountAmount` (D-23 — do NOT reuse `auraDiscount*` at `:1206-1207`/`:1389-1390`), and composes independently on top of any `auraSpend`.

**The 4 charge-paths converge on `recordAssignmentCharge(:387)`** which uses `chargeBase = pricePaid` and enforces `amountReceived <= chargeBase` (`:450`). Insert the discount into each path's `pricePaid` calc (or a shared `computePriceWithReferralDiscount` helper called by all 4):

- `assignPlan:1058` (aura block at `:1252`)
- `changePlanNow:2906`
- `changePlanAfterCurrent:3332` (aura block at `:3484`)
- `renewSubscription:3652`

**Qualification flip** — in the charge-path, after resolving `pricePaid` and only when `pricePaid > 0` (D-20, kills the free-month ghost, Pitfall 5), UPDATE the payer's `pending` link to `qualified` BEFORE computing the discount (D-21). Query the payer's `referredBy` first.

**Preview parity (Pitfall 4)** — `getPricingPreview:4195` currently only computes `auraSpend` discount (`:4236-4244`). It MUST call the same referral helper so the PoS shows the price that will actually be charged. Mirror the `discountAmount`/`finalPrice` shape at `:4231-4244`.

---

### `el-templo-api/src/modules/auth/routes.ts` (MODIFY — resolve `?ref` in `/register`)

**Analog:** the `promoCode` flow **in this same file**, `:193-273`, plus the user insert at `:171-189` and dedup at `:59-89`.

- Add `ref?: string` to `RegisterBody` (`:24-34`) and to `registerSchema` (AJV, `additionalProperties:false` already strips unknowns — Security V5).
- After the user insert (`:191`, `userId` known), resolve `ref` → `referrerId` server-side (never trust client), reject `referrerId === newUserId` (D-13), then `UPDATE users SET referred_by` + `INSERT referrals(status='pending', attributionChannel='self_service')`. The `referredId UNIQUE` constraint enforces D-14 (2nd claim fails).
- Wrap in graceful-degradation try/catch exactly like the promo block (`:263-272`): registration succeeds even if attribution fails.
- Dedup by DNI/email/phone already runs at `:59-127` (D-15 — reuse, don't rebuild).

---

### `el-templo-api/src/modules/members/service.ts` (MODIFY — `createMember` writes `referredBy`)

**Analog:** `members/service.ts:815` `createdBy: input.createdBy` inside the `tx.insert(schema.users).values({...})` (fase 114 pattern). `createMember` is at `:669`; its insert is `:685-713`.

Add `referredBy: input.referredBy ?? null` to the insert values (same server-sourced pattern as `createdBy` — **never read from the client body**, Security V4: the route resolves/validates the picked referrer id). After insert, `INSERT referrals(status='pending', attributionChannel='assisted', createdBy=<admin id>)`. The route handler supplies the validated referrer id, mirroring how `createdBy` is sourced from the JWT (`:748-754` docblock).

---

### `el-templo-app/src/pages/RegisterPage.vue` (MODIFY — capture `?ref`)

**Analog:** `RegisterPage.vue:213-216` `promoCode` computed + `:258` body wiring (same file):

```typescript
// RegisterPage.vue:213 [VERIFIED]
const promoCode = computed(() => {
  const code = route.query.promo;
  return typeof code === "string" ? code : null;
});
// :258 — passed in authStore.register({ ..., promoCode: promoCode.value ?? undefined })
```

Clone as `refCode = computed(() => typeof route.query.ref === 'string' ? route.query.ref : null)` and add `ref: refCode.value ?? undefined` to the `authStore.register({...})` payload at `:249-259`.

---

### `el-templo-admin/src/components/MemberFormDialog.vue` (MODIFY — "¿Quién lo trajo?")

**Analog:** `scheduling/SlotDetailDialog.vue` member-search q-select (`:366-399`) + its `onMemberSearch` handler (`:898-924`):

```vue
<!-- SlotDetailDialog.vue:366 [VERIFIED] -->
<q-select
  v-model="slotAddMember"
  :options="memberSearchResults"
  option-value="id"
  option-label="displayLabel"
  use-input
  clearable
  input-debounce="300"
  :loading="searchingMembers"
  @filter="onMemberSearch"
/>
```

```typescript
// SlotDetailDialog.vue:898 [VERIFIED]
function onMemberSearch(val, update, _abort) {
  if (!val || val.length < 2) { update(() => { memberSearchResults.value = []; }); return; }
  searchingMembers.value = true;
  membersApi.searchMembers(val, 10).then((members) => {
    update(() => { memberSearchResults.value = members.map((m) => ({
      id: m.id, displayLabel: `${m.firstName} ${m.lastName}${m.dni ? ` (${m.dni})` : ''}` })); });
  }) ... .finally(...)
}
```

Copy this q-select + debounced `@filter` + `membersApi.searchMembers(val, 10)` pattern into MemberFormDialog for the referrer picker. MemberFormDialog's existing `q-select`s (`:17`, `:79`) are static-option selects, NOT search-as-you-type — do not use those as the analog. The picked `id` is submitted as the (server-validated) referrer.

---

### `el-templo-api/test/referrals/*.test.ts` (5 NEW — integration)

**Analog:** `test/subscriptions/renewal.test.ts:1-34` (harness) + `test/subscriptions/_helpers.ts` (fixtures).

**Harness boilerplate** — copy verbatim from `renewal.test.ts:1-34`:

```typescript
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
beforeAll(async () => {
  app = await createTestApp();
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await cleanAllTestData(app);
});
```

**Fixtures** — reuse `test/subscriptions/_helpers.ts`: `createPlan`, `createMember` (register), `assignPlan`, `seedAuraBalance`, `todayStr`/`dateOffsetStr`. Wave-0 files: `code-generation`, `anti-fraud`, `qualification`, `discount-computation`, `aura-annotation` (RESEARCH §Wave 0 Gaps). Extend `test/auth/register.test.ts` (REF-02), `test/members/*.test.ts` (REF-03), `test/subscriptions/member-plans.test.ts` (preview parity) rather than duplicating.

---

## Shared Patterns

### Self-referencing / user FK on new tables

**Source:** `db/schema/users.ts:11` (`AnyMySqlColumn` import) + `:163` (`createdBy`)
**Apply to:** `referrals.referrerId/referredId/createdBy`, `users.referredBy`

```typescript
createdBy: int("created_by").references((): AnyMySqlColumn => users.id, { onDelete: "set null" }),
```

Same-table self-refs need the `AnyMySqlColumn` callback; refs to `users` from another table can use `() => users.id`.

### Idempotent DB seed in migration

**Source:** `0157_seed_finance_overdue_threshold.sql`
**Apply to:** `aura_config` `referral` row + `system_settings['referral.max_percent_cap']`
`INSERT ... SELECT ... WHERE NOT EXISTS (...)` — never clobbers a value already set by a later PUT. Zero `;` in `--` comments.

### Config read-with-fallback

**Source:** `modules/settings/service.ts:37-45`
**Apply to:** referrals service (percent-per-link from `aura_config`, cap from `system_settings`)
Single `select().where(eq(key)).limit(1)` reader, hardcoded default when the row is absent (D-12: ajustable sin deploy).

### "Activo" = cobertura vigente (never `users.status`)

**Source:** `subscriptions/service.ts:176` `deriveCoveredUntil`
**Apply to:** referral discount computation (counterparty check, D-09/D-24)

### Server-sourced attribution (never client body)

**Source:** `members/service.ts:748-754` docblock + `:815` (`createdBy`); `auth/routes.ts` dedup+resolve
**Apply to:** `referredBy` / referrer resolution in both channels (Security V4/V5). AJV `additionalProperties:false` strips stray fields; the server resolves the code / validates the picked id.

### Discount price-math (reduce `pricePaid`)

**Source:** `subscriptions/service.ts:1252-1274` (auraSpend block)
**Apply to:** all 4 charge-paths + `getPricingPreview:4236-4244`. Copy `Math.floor(basePrice * pct/100)` + `pricePaid = basePrice - discountAmount`; do NOT copy `auraService.spend()`.

## No Analog Found

None. Every new/modified surface maps to a verified in-repo analog. The only genuinely-new logic (bidirectional `qualified` link query + symmetric discount accumulation with cap) has no exact analog but is fully specified in RESEARCH §Code Examples (`[ASSUMED]`, planner-validated) and composes the shared patterns above.

## Metadata

**Analog search scope:** `el-templo-api/src/db/schema`, `.../src/db/migrations`, `.../src/modules/{auth,members,subscriptions,settings,aura}`, `el-templo-app/src/pages`, `el-templo-admin/src/components/scheduling`, `el-templo-api/test/subscriptions`
**Files scanned:** ~18 (12 read in full/targeted ranges)
**Pattern extraction date:** 2026-07-10
