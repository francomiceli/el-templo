# Phase 152: Reorganización de Caja + egresos configurables - Pattern Map

**Mapped:** 2026-07-04
**Files analyzed:** 19 (create + modify)
**Analogs found:** 19 / 19 (all surfaces have an in-repo analog — this phase extends the v5.2/v5.3/150 finance stack, no greenfield roles)

This is a **brownfield extension**: nearly every "analog" is a sibling in the same module (Caja tabs, finance service/routes/schemas, finance migrations, finance tests). The dominant instruction to the planner is **copy the immediately-adjacent sibling pattern byte-for-byte**, not invent.

---

## File Classification

| New/Modified File                                                                              | Role                     | Data Flow        | Closest Analog                                                 | Match Quality     |
| ---------------------------------------------------------------------------------------------- | ------------------------ | ---------------- | -------------------------------------------------------------- | ----------------- |
| `el-templo-admin/src/pages/CajaPage.vue`                                                       | page/hub                 | request-response | self (reorder `q-tab` order + labels)                          | exact (self-edit) |
| `el-templo-admin/src/constants/caja.ts`                                                        | config                   | —                | self (`CAJA_TABS` order + `CAJA_DEFAULT_TAB`)                  | exact (self-edit) |
| `el-templo-admin/src/components/caja/MovimientosTab.vue`                                       | component (table+detail) | CRUD/read        | `MovEgresosTab.vue` (state chip + dateRange)                   | exact             |
| `el-templo-admin/src/components/caja/MovEgresosTab.vue`                                        | component (table)        | read             | self + shared date control                                     | exact (self-edit) |
| `el-templo-admin/src/components/caja/SaldosPorCajaTab.vue`                                     | component                | read             | q-banner note (new block)                                      | role-match        |
| `el-templo-admin/src/components/caja/CuentasTab.vue`                                           | component (ABM host)     | CRUD             | self (bank-accounts ABM section)                               | exact (self-edit) |
| `el-templo-admin/src/components/caja/CategoriaEgresoFormDialog.vue` **(new)**                  | component (form dialog)  | CRUD             | `CuentaBancariaFormDialog.vue`                                 | exact             |
| `el-templo-admin/src/components/caja/DateRangeFilter.vue` **(new, discretion)**                | component/composable     | transform        | `dateRange` computed in both tabs                              | role-match        |
| `el-templo-admin/src/composables/useTransactionsApi.ts`                                        | composable (api client)  | request-response | self (bank-account CRUD methods)                               | exact (self-edit) |
| `el-templo-admin/src/types/transaction.ts`                                                     | model (FE types)         | —                | self (`BankAccount`, `TransactionListItem`)                    | exact (self-edit) |
| `el-templo-api/src/db/schema/financial-transactions.ts`                                        | model (schema)           | —                | self (`cashRegisterId`/`costCenterId` nullable FK)             | exact (self-edit) |
| `el-templo-api/src/db/schema/cost-centers.ts`                                                  | model (schema)           | —                | self (add uniqueIndex `(name,country)`)                        | exact (self-edit) |
| `el-templo-api/src/modules/finance/transaction-service.ts`                                     | service                  | CRUD             | self (`validate()`, `listTransactions()`)                      | exact (self-edit) |
| `el-templo-api/src/modules/finance/cash-register-service.ts`                                   | service                  | CRUD             | self (`createBankAccount`/`close`/`reactivate`)                | exact             |
| `el-templo-api/src/modules/finance/routes.ts`                                                  | route                    | request-response | self (bank-accounts ABM routes ~1198-1303)                     | exact (self-edit) |
| `el-templo-api/src/modules/finance/schemas.ts`                                                 | config (validation)      | —                | self (`createBankAccountSchema` etc.)                          | exact (self-edit) |
| `el-templo-api/src/modules/finance/types.ts`                                                   | model (API types)        | —                | self (`TransactionListItem`)                                   | exact (self-edit) |
| `el-templo-api/src/db/migrations/0165_*.sql` **(new)**                                         | migration                | batch/DDL        | `0161_cost_centers.sql` + `0163_bank_accounts_and_retiros.sql` | exact             |
| `el-templo-api/test/finance/cost-centers-abm.test.ts` **(new)** + `validate-columns` additions | test                     | —                | `bank-accounts.test.ts` + `validate-caja.test.ts`              | exact             |

> **NOTE:** the member-keyed list endpoint `GET /transactions` (`listTransactions`, used by `MovimientosTab`) does **NOT** currently select `validationStatus` (verified `types.ts:216-242` — no such field). CONTEXT D-04's "the API already returns `validationStatus` (routes.ts:1374)" refers to the **`/movements-history`** endpoint (MovEgresosTab), a different query. So the chip on Historial de cobros requires adding `validationStatus` (+ `validatedBy/At`) to `listTransactions`' select AND to `TransactionListItem`. Do not assume it's already there.

---

## Pattern Assignments

### `el-templo-admin/src/pages/CajaPage.vue` + `constants/caja.ts` (hub reorder/rename — D-01/D-02)

**Analog:** self. Order lives in TWO synced places — keep them consistent.

`constants/caja.ts` — reorder the `CAJA_TAB_NAMES` array and flip the default (D-01 landing = Movimientos de caja):

```typescript
// CAJA_TABS keys stay the same (?tab= URL contract); only ORDER + default change.
export const CAJA_DEFAULT_TAB: CajaTab = CAJA_TABS.movimientosCaja; // was .pendientes
export const CAJA_TAB_NAMES: readonly CajaTab[] = [
  CAJA_TABS.movimientosCaja, // portada (D-01)
  CAJA_TABS.pendientes,
  CAJA_TABS.transacciones, // label → "Historial de cobros" (D-02)
  CAJA_TABS.saldos,
  CAJA_TABS.cuentas,
];
```

`CajaPage.vue` — reorder the `<q-tab>` block (lines 31-37) to match D-01 and rename label (line 35):

```vue
<q-tab
  :name="CAJA_TABS.transacciones"
  label="Historial de cobros"
  icon="receipt_long"
/>
```

Keep the `vencidoCount` floating badge bound to the Pendientes tab wherever it lands (currently lines 31-33). Do NOT rename the `transacciones` **key** — the `?tab=` persistence contract (lines 114-129) depends on it.

---

### `el-templo-admin/src/components/caja/MovimientosTab.vue` (chip + state filter + drill-down + validator detail — D-03/D-04/D-05/D-06)

**Analog:** `MovEgresosTab.vue` (sibling, same folder). Copy four things:

**1. State chip label/color map** — copy verbatim from `MovEgresosTab.vue:319-335` (the reusable asset called out in CONTEXT). Consider extracting to `src/utils/validation-status.ts` (DRY — Claude's discretion):

```typescript
const VALIDATION_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  observado: "Observado",
  corregido: "Corregido",
  validado: "Validado",
};
function validationColor(status: string): string {
  if (status === "validado") return "positive";
  if (status === "pendiente") return "warning";
  if (status === "observado") return "info";
  return "grey-6";
}
```

Render as a new `#body-cell-estado` column exactly like `MovEgresosTab.vue:130-137`. D-04 asks specifically for validada/pendiente — the existing 4-value map covers it superset-style.

**2. State filter** — mirror the existing `filters.kind` single-select in `MovimientosTab.vue:143-156` + `filters` reactive at 511-517. Add `estado: null as 'validado' | 'pendiente' | null`. Discretion (CONTEXT): client-side over the page OR a query param on `/transactions` — prefer the query param if the list is server-paginated (it is: `tablePagination`), otherwise the filter only covers the current page.

**3. Month→days drill-down** — the `selectedMonth`/`dateRange` block (`MovimientosTab.vue:500-509`) is BYTE-IDENTICAL to `MovEgresosTab.vue:364-403`. This is the shared-component candidate (D-03 + discretion). Pattern to preserve — `dateRange` emits `{ dateFrom, dateTo }` consumed by `loadTransactions`/`loadHistory`:

```typescript
const dateRange = computed(() => {
  if (!selectedMonth.value) return { dateFrom: undefined, dateTo: undefined };
  const [year, month] = selectedMonth.value.split("-").map(Number);
  const dateFrom = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const dateTo = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { dateFrom, dateTo };
});
```

A shared control must expose the same `{ dateFrom, dateTo }` contract in BOTH month and day mode so `loadTransactions`/`loadHistory` stay unchanged.

**4. Validator in detail dialog (D-05/D-06)** — extend the existing detail dialog (`MovimientosTab.vue:294-386`). Add q-item rows in the "Registrado por" block (355-359) following the exact `q-item`/`q-item-section side` pattern. Branch on data:

- If `validatedBy` present → "Validado por {name}" + `formatDate(validatedAt)`.
- Else if born-validated (validado but no `validatedAt`) → literal "Validado al registrar" + `recorderName` + `formatDate(createdAt)` (D-06).

---

### `el-templo-admin/src/components/caja/CuentasTab.vue` + `CategoriaEgresoFormDialog.vue` (Categorías de egreso ABM — D-07/D-08)

**Analog:** the bank-accounts ABM that already lives in `CuentasTab.vue` — replicate the whole pattern as a second stacked section (D-07: same tab, "Categorías de egreso" heading). New form dialog copies `CuentaBancariaFormDialog.vue` but far simpler (name only).

**Table + closed-row dimming** — copy `CuentasTab.vue:19-87`. The "Cerrada" badge + `text-grey-5` on inactive rows is the exact D-08 "cerradas atenuadas" pattern:

```vue
<q-tr :props="tableProps" :class="{ 'text-grey-5': !tableProps.row.isActive }">
  ...
  <q-badge v-if="!tableProps.row.isActive" color="grey-4" text-color="grey-8" label="Cerrada" />
```

Action buttons: edit (rename) + close/reactivate toggle — copy `CuentasTab.vue:39-77` (drop the "Registrar retiro" `payments` button; not applicable to categories).

**Close-with-confirm dialog** — copy `CuentasTab.vue:188-218` (`$q.dialog` confirm → service call → `load()`). For categories the warning is simpler (no balance) but the try/catch + `extractError` + `$q.notify` + reload shape is identical.

**Load/handlers/lifecycle** — copy `CuentasTab.vue:147-259` (`load()` try/catch with `extractError`, `openCreate`/`openEdit`, `onSaved`, `onMounted(load)`, `watch(() => props.selectedCountry, load)`, `onUnmounted(() => transactionsApi.cleanup())`). Categories ARE country-scoped (D-08), so keep the country `watch` (unlike bank accounts which is country-agnostic — this is the ONE deviation from the bank-account analog).

**Form dialog** — copy `CuentaBancariaFormDialog.vue` structure (v-model computed `show`, `isEditMode` computed, `submit()` branching create/update, `extractError`+notify, `onUnmounted` cleanup) but collapse the form to a single `q-input` for `name` with a required-trim rule (`CuentaBancariaFormDialog.vue:18-19`).

---

### `el-templo-admin/src/components/caja/SaldosPorCajaTab.vue` (nota explicativa — D-10)

**Analog:** no in-tab banner exists yet; use a Quasar `q-banner` at the top of the template (before the export row, `SaldosPorCajaTab.vue:2-14`). Single note combining "what this shows" (saldo firme por caja: movimientos validados desde el corte; pendientes aparte) + the avivador warning. Copy is discretion (D-10); form = fixed banner recommended over dismissible (the confusion is recurring). The "saldo firme" vocabulary already exists in `CuentasTab.vue:191-194` warning copy — reuse it for consistency.

---

### `el-templo-api/src/db/schema/financial-transactions.ts` (validated_by/validated_at — D-05)

**Analog:** self — the `voidedBy`/`voidedAt` pair (lines 74-75) and the nullable-FK convention are the exact template:

```typescript
// Phase 152 (D-05): quién/cuándo validó. NULLABLE — solo la transición
// pendiente→validado (transaction-service.validate) las setea; los cobros
// nacidos validados (correct/admin-load) y todo histórico NO backfilleado quedan
// NULL (el dato ya está en recordedBy/createdAt, D-06). Column name byte-for-byte
// con la migración 0165. Mismo patrón que voidedBy/voidedAt.
validatedBy: int("validated_by").references(() => users.id),
validatedAt: timestamp("validated_at"),
```

Add a `validator` relation mirroring `voider` (lines 152-156). Column names MUST match the migration byte-for-byte (reference_drizzle_enum_column_name / CLAUDE.md) — CI "Unknown column" that tsc can't see.

### `el-templo-api/src/db/schema/cost-centers.ts` (uniqueness — D-08)

**Analog:** self. The table exists (phase 147) but only has a plain `index` on `(country, is_active)`. D-08 requires **name unique per country**. Add a `uniqueIndex` (import already present pattern in `financial-transactions.ts:135`):

```typescript
uniqueIndex("uq_cost_centers_name_country").on(table.name, table.country),
```

This requires an `ADD UNIQUE INDEX` in migration 0165 AND must not collide with existing seeds (safe — current seeds are already distinct per country). Decide case-sensitivity: MySQL default collation is case-insensitive, so the DB unique index already dedups case-insensitively — align the service check to match (discretion).

---

### `el-templo-api/src/modules/finance/transaction-service.ts` (validate sets columns + list surfaces them)

**Analog:** self — `validate()` at 634-734.

**`validate()`** — extend the existing `.set(...)` at 690-698 to write the two columns (adminId is already the param):

```typescript
.set({
  validationStatus: "validado",
  validatedBy: adminId,
  validatedAt: new Date(),
  ...(cashRegisterId !== undefined ? { cashRegisterId } : {}),
})
```

The audit_log write (704-717) stays — it remains the forensic source; the columns are the denormalized read path (D-05). `correct()` (819+) and admin-load create rows born `validationStatus: "validado"` (line 891) — do NOT set `validatedBy/At` there (D-06: distinguished as "Validado al registrar" via `recordedBy`/`createdAt`).

**`listTransactions()` select** — add three columns to the raw select (1117-1137) and a `validator` self-join copying the `recorder` alias pattern EXACTLY (`recorder = alias(schema.users, "recorder")` at 1092; join at 1147-1150):

```typescript
const validator = alias(schema.users, "validator"); // beside recorder alias
// in select:
validationStatus: schema.financialTransactions.validationStatus,
validatedAt: schema.financialTransactions.validatedAt,
validatorFirstName: validator.firstName,
validatorLastName: validator.lastName,
// join (LEFT — validatedBy is nullable, unlike the INNER recorder join):
.leftJoin(validator, eq(validator.id, schema.financialTransactions.validatedBy))
```

Map into the row object (1192-1212) mirroring `recorderName` (1206-1207): `validatorName` = concat or `null`. Note recorder uses `.innerJoin` (recordedBy NOT NULL); validator MUST be `.leftJoin` (validatedBy nullable).

### `el-templo-api/src/modules/finance/cash-register-service.ts` (cost-center CRUD methods)

**Analog:** `createBankAccount`/`updateBankAccount`/`closeBankAccount`/`reactivateBankAccount` (478-636) AND the existing `listActiveCostCenters` (360-376). New methods: `createCostCenter` / `renameCostCenter` / `deactivateCostCenter` / `reactivateCostCenter` / `listAllCostCenters(country)` (active + inactive, for the ABM — mirror `listBankAccounts` which drops the `isActive` filter, 625-636).

Uniqueness (D-08) — mirror `assertTransferIdentifier` (414-423) as an `assertUniqueName(name, country, excludeId?)` guard throwing `BadRequestError`/`ConflictError` BEFORE the write (belt-and-suspenders with the DB uniqueIndex). No physical delete (D-08) — deactivate = `set({ isActive: false })` exactly like `closeBankAccount` (593-601).

---

### `el-templo-api/src/modules/finance/routes.ts` (cost-center CRUD routes + state filter)

**Analog:** the bank-accounts ABM routes at 1198-1303 — copy the ADMIN_ROLES in-handler guard verbatim (D-08 "por país" + admin/owner-only, arrastrado 150 D-12 / 149 D-04):

```typescript
if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
  return reply.code(403).send({
    error: "Acceso denegado",
    message: "No tienes permiso para administrar los centros de costo",
  });
}
```

Routes: `POST /cost-centers`, `PATCH /cost-centers/:id` (rename), `POST /cost-centers/:id/deactivate`, `POST /cost-centers/:id/reactivate`, `GET /cost-centers/all` (ABM list incl. inactive — the existing `GET /cost-centers` at 1155 stays active-only for the egreso selector). Country resolution: copy the owner-aware block from `GET /cost-centers` (1169-1176). Wrap every handler in `handleServiceError(err, reply, request.log, "...")`.

**State filter on `/transactions`** (D-04, discretion) — if server-side, add an optional `validationStatus` querystring to the transactions list route + push an `eq(...)` condition into `listTransactions`' `conditions[]` (same shape as the existing `kind`/`paymentMethod` conditions).

### `el-templo-api/src/modules/finance/schemas.ts` (cost-center CRUD schemas)

**Analog:** `createBankAccountSchema` / `updateBankAccountSchema` / `closeBankAccountSchema` / `reactivateBankAccountSchema` (844-922). Copy the `additionalProperties: false` bodies, the shared `errorSchema` response map (400/401/403/404/500), and the `BANK_ACCOUNT_ID_PARAMS` params pattern (832-836) → `COST_CENTER_ID_PARAMS`. Create body = `{ name: {type:string, minLength:1, maxLength:100}, country: {type:string, enum:["AR","ES"]} }`; rename body = `{ name }` only.

### `el-templo-api/src/modules/finance/types.ts` (FE + API `TransactionListItem`)

**Analog:** self (216-242). Add `validationStatus: ValidationStatus;`, `validatedAt: string | null;`, `validatorName: string | null;`. Mirror the same additions in `el-templo-admin/src/types/transaction.ts` `TransactionListItem` and the `useTransactionsApi` client methods for cost-center CRUD (copy the bank-account methods `createBankAccount`/`closeBankAccount`/`reactivateBankAccount`).

---

### `el-templo-api/src/db/migrations/0165_*.sql` (columns + backfill + seed renames + new seed)

**Analog:** `0161_cost_centers.sql` (idempotent seed via `INSERT ... SELECT ... FROM DUAL WHERE NOT EXISTS`) + `0163_bank_accounts_and_retiros.sql` (ALTER ADD COLUMN chain + idempotent seed). **Latest migration on disk = `0164` → new file is `0165`** (verify at execution: `ls src/db/migrations/ | tail`).

Load-bearing rules (CLAUDE.md + reference notes), copy the header boilerplate from 0163:

- Hand-written (`db:generate` broken by pre-existing `sessions.goal_plan_type` drift).
- **Never `;` inside a SQL comment** (runner splits on `;` before stripping `--`).
- Column names byte-for-byte with `financial-transactions.ts`.

Four ordered blocks:

```sql
-- 1. validated_by / validated_at columns (nullable), chained AFTER validation_status
ALTER TABLE `financial_transactions`
  ADD COLUMN `validated_by` int NULL AFTER `validation_status`,
  ADD COLUMN `validated_at` timestamp NULL AFTER `validated_by`;
ALTER TABLE `financial_transactions`
  ADD CONSTRAINT `financial_transactions_validated_by_users_id_fk`
  FOREIGN KEY (`validated_by`) REFERENCES `users`(`id`);

-- 2. Backfill from audit_log (D-05): action='transaction_validated', actor_id → validated_by,
--    created_at → validated_at. UPDATE ... JOIN keyed on target_id = tx id.
UPDATE `financial_transactions` ft
JOIN `audit_log` al
  ON al.`target_kind` = 'transaction'
  AND al.`target_id` = ft.`id`
  AND al.`action` = 'transaction_validated'
SET ft.`validated_by` = al.`actor_id`, ft.`validated_at` = al.`created_at`
WHERE ft.`validated_by` IS NULL;

-- 3. Rename Templo-centric seeds to generic (D-09) — UPDATE by (name, country), NOT delete.
UPDATE `cost_centers` SET `name` = 'Alquiler'
  WHERE `name` = 'Alquiler Constitución' AND `country` = 'AR';
UPDATE `cost_centers` SET `name` = 'Viáticos'
  WHERE `name` = 'Viáticos profes' AND `country` = 'AR';

-- 4. Seed 'Pago a proveedores' (AR), idempotent FROM DUAL WHERE NOT EXISTS (copy 0163 block).
-- + ADD UNIQUE INDEX uq_cost_centers_name_country (name, country) for D-08.
```

**Migration hits prod** (staging/prod share MySQL): the rename mutates Nacho's real caja categories — decided with that impact explicit (D-09, no in-use category lost). If backfill (block 2) risks duplicate `transaction_validated` events per tx, the JOIN could multiply — guard with the newest event only if audit_log can have >1 per tx (verify; validate() writes exactly one, so a plain JOIN is safe today).

---

### Tests (`el-templo-api/test/finance/`)

**Analog for the cost-center ABM:** `bank-accounts.test.ts` (whole harness: `createTestApp` + `createStaffUser` + `getAuthToken`, `createAccount` helper, `createdAccountIds` cleanup, per-endpoint `it()` blocks, RBAC 403/201 matrix for owner/gestion/coach). Copy it to `cost-centers-abm.test.ts` and adapt endpoints. Required cases (CONTEXT / code_context): create/rename/deactivate/reactivate happy paths, **unique name per country → 400**, **egreso con centro desactivado → 400** (assert against `movement-service.registerExpense` which already filters `isActive=true`, 294-304), gestion/coach on write → 403, owner → 2xx.

**Analog for validate-columns:** `validate-caja.test.ts` (harness with `TransactionService` + seeded caja ids). Add assertions that `validate()` sets `validated_by`/`validated_at`, that the list/detail endpoint surfaces `validatorName`, and that a corrected/admin-load row stays NULL on those columns (D-06). `cost-centers.test.ts` already exists for the read path — reuse its harness for the selector-excludes-inactive assertion.

---

## Shared Patterns

### RBAC guard (in-handler, admin/owner-only for the ABM)

**Source:** `routes.ts:1203-1208` (bank-accounts ABM).
**Apply to:** every new `cost_centers` write route. `ADMIN_ROLES` (not `FINANCE_VOID_ROLES` — that includes gestion). The module hook already authenticated + gated `FINANCE_READ_ROLES`; the security lives in the API (149 D-04), UI only hides.

### Idempotent seed / rename in migrations

**Source:** `0161_cost_centers.sql` (`INSERT ... SELECT 'X','AR',true FROM DUAL WHERE NOT EXISTS (...)`) + `0163` seed of 'Retiros'.
**Apply to:** the 'Pago a proveedores' seed and the two renames (renames use `UPDATE ... WHERE name=... AND country=...`).

### Frontend service error handling

**Source:** `CuentasTab.vue:152-158` / `CuentaBancariaFormDialog.vue:244-248`.
**Apply to:** all new admin data ops.

```typescript
} catch (err: unknown) {
  const message = extractError(err, 'Error ...');
  log.error('...', { error: message });
  $q.notify({ type: 'negative', message });
}
```

### API service error surface

**Source:** every finance route — `handleServiceError(err, reply, request.log, "<label>")` after a `try` around the service call; service throws `BadRequestError`/`NotFoundError`/`ConflictError` from `modules/shared/errors`.
**Apply to:** all new cost-center routes.

### Nullable-FK + relation convention (schema)

**Source:** `financial-transactions.ts` `voidedBy`/`voidedAt` (74-75) + `voider` relation (152-156).
**Apply to:** `validatedBy`/`validatedAt` + `validator` relation.

### Composable cleanup (frontend)

**Source:** every caja tab — `onUnmounted(() => transactionsApi.cleanup())` (SFC-level, allowed; the rule forbids `onUnmounted` INSIDE the composable). Apply to the new `CategoriaEgresoFormDialog.vue`.

---

## No Analog Found

None. Every file has a direct in-repo sibling. The only "new role" is `DateRangeFilter.vue` (shared date control) and `CategoriaEgresoFormDialog.vue`, both of which are near-verbatim extractions of existing code (the `dateRange` computed duplicated across the two tabs, and `CuentaBancariaFormDialog.vue` respectively).

---

## Metadata

**Analog search scope:** `el-templo-admin/src/components/caja/`, `el-templo-admin/src/pages/`, `el-templo-admin/src/constants/`, `el-templo-api/src/modules/finance/`, `el-templo-api/src/db/schema/`, `el-templo-api/src/db/migrations/`, `el-templo-api/test/finance/`.
**Files scanned:** ~16 read in full/part + directory listings.
**Pattern extraction date:** 2026-07-04
