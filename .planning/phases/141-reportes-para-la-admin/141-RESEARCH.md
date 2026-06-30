# Phase 141: Reportes para la admin - Research

**Researched:** 2026-06-24
**Domain:** Admin finance UI (cash-control hub) — read endpoints + Quasar tabs reorganization, reusing v4.8/137/138/139 backend primitives
**Confidence:** HIGH (entire surface verified by reading the actual code; no external dependencies, no training-data guessing)

## Summary

Phase 141 is a **reads + UI phase** that turns `el-templo-admin/src/pages/CajaPage.vue` into a tabbed cash-control hub and adds **three new GET endpoints** on the existing `financeRoutes` plugin (`/api/admin/finance`): a **bandeja de pendientes**, a **saldos por caja**, and a **historial de movimientos/egresos**. The action endpoints the bandeja needs (validate/observe/correct/void) **already exist** from Phase 137 — 141 only wires the frontend to them. The summary/table/Excel export from v4.8/109 **already exist** — 141 reorganizes them into a "Movimientos" tab. No migration, no schema change, no new dependency.

The single load-bearing backend subtlety is the **139 LEFT JOIN flag**, confirmed real by reading the code: `TransactionService.list()` (transaction-service.ts:872-932) and `exportRowsForExcel()` (:1421-1460) both **INNER JOIN `users` and `branches`**. A `cash_transfer`/`expense` row has `member_id = NULL` and (for central/banco cajas) `branch_id = NULL`, so the existing `list()` **silently drops them**. The historial tab therefore needs **its own query with LEFT JOINs** — do NOT mutate the shared `list()`/`exportRowsForExcel()` (they are the member-keyed paths and an INNER→LEFT swap there would also leak orphan rows into the Movimientos tab and break 109's tested export shape).

The export reuse (REP-04) is **exceljs server-side only**. Both `finance/routes.ts:/transactions/export` and every `reports/routes.ts:/*\/export` build an exceljs `Workbook` in the route layer over a `service.exportRowsFor…()` method. pdfmake exists in the repo (`el-templo-admin/src/utils/pdf/`) but is **frontend-only and session-PDF specific** — not part of this export family; ignore it for these reports.

**Primary recommendation:** Add three GET endpoints + three service read methods (each with its own query — the historial/bandeja ones LEFT JOIN), extend `useTransactionsApi.ts` with the matching calls plus the four already-existing action calls (validate/observe/correct/void), and split `CajaPage.vue` into `q-tabs` + `q-tab-panels`. Reuse the exceljs route pattern verbatim — one `…/export` endpoint per new report, each over a `service.exportRowsFor…()` method, NO parallel mechanism, NO pdfmake.

## Architectural Responsibility Map

| Capability                                          | Primary Tier                                                                              | Secondary Tier                   | Rationale                                                                                                                                                                                           |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bandeja list (validation_status + aging + recorder) | API / Backend (`TransactionService`)                                                      | Admin frontend (render)          | Filtering by `validation_status`, ordering by aging, recorder JOIN are SQL/business concerns; the firm-money/aging semantics must match 137/138                                                     |
| Aging ("hace N días") computation                   | API (compute in TS over rows)                                                             | —                                | Mirror 138/108 precedent (`getOutstandingConcepts` computes `ageInDays` in TS, not SQL, to clamp ≥0 and avoid TZ drift). Server returns `ageInDays` so the umbral threshold is applied consistently |
| Umbral 3-días threshold + "vencido" flag            | Shared constant + Frontend (visual)                                                       | —                                | D-08: threshold is a **constant** for now; 142 will persist it. Keep it where 142 can swap to config without touching UI logic. Visual badge/counter is pure frontend                               |
| Saldos por caja (iterate active cajas + getBalance) | API / Backend (`CashRegisterService`)                                                     | Admin frontend (cards)           | `getBalance` is already a service method (138); 141 adds the REST endpoint that lists active cajas + calls it per caja                                                                              |
| Currency isolation (no cross-currency total)        | API (per-caja currency) + Frontend (subtotal per moneda)                                  | —                                | 137/138 invariant; subtotals computed per `currency` group, never summed across                                                                                                                     |
| Historial mov/egresos (LEFT JOIN users/branches)    | API / Backend (NEW query)                                                                 | Admin frontend (table)           | The NULL-member/NULL-branch rows require LEFT JOIN; this is the 139 flag                                                                                                                            |
| Validar/Observar/Corregir/Anular actions            | API (already exists, 137)                                                                 | Admin frontend (buttons + popup) | Endpoints exist; 141 only wires the UI + the `keepMembershipActive` popup                                                                                                                           |
| Export (Excel)                                      | API / Backend (exceljs in route)                                                          | Admin frontend (Blob download)   | Reuse the 109/64 exceljs route pattern; NO pdfmake, NO client-side generation                                                                                                                       |
| Route gating (`isCajaRole`, coach excluded)         | API (`FINANCE_READ_ROLES` + per-handler `FINANCE_VOID_ROLES`) + Frontend (`allowedRoles`) | —                                | `/caja` already gated `['gestion','admin','owner']` both layers; coach excluded for privacy                                                                                                         |

## Standard Stack

No new dependencies. Everything below is already installed and in use.

### Core

| Library                           | Version   | Purpose                                                     | Why Standard                                                                                                                                    |
| --------------------------------- | --------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Fastify                           | (in repo) | API routes (`financeRoutes` plugin)                         | Existing finance module home `[VERIFIED: el-templo-api/src/modules/finance/routes.ts]`                                                          |
| Drizzle ORM (mysql2)              | (in repo) | Queries (`leftJoin`, `inArray`, `and`, `alias`)             | Existing `TransactionService`/`CashRegisterService` pattern `[VERIFIED: transaction-service.ts imports]`                                        |
| exceljs                           | (in repo) | Server-side `.xlsx` export                                  | The ONLY export mechanism for these reports — used by finance + reports modules `[VERIFIED: routes.ts:17 `import { Workbook } from "exceljs"`]` |
| Quasar (Vue 3)                    | (in repo) | `q-tabs` / `q-tab-panels` / `q-table` / `q-card` / `q-menu` | Existing CajaPage components; D-decision: no new UI kit `[VERIFIED: CajaPage.vue]`                                                              |
| Pinia (composition) + composables | (in repo) | `useTransactionsApi` (extend), `authStore` for `isOwner`    | Project pattern, composable exposes `cleanup()` `[VERIFIED: useTransactionsApi.ts:228]`                                                         |

### Supporting

| Library                                      | Version   | Purpose                                            | When to Use                                                                                                                |
| -------------------------------------------- | --------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `drizzle-orm` `alias()`                      | (in repo) | Self-join `users` for `recordedBy` (recorder name) | Bandeja + historial need "cargado por" — reuse the `recorder` alias from `list()` `[VERIFIED: transaction-service.ts:867]` |
| `firmMoneyConditions()`                      | (in repo) | Canonical firm-money filter                        | Already reused by `getBalance`; do NOT inline `validado`/`voided_at IS NULL` `[VERIFIED: cash-register-service.ts:18,165]` |
| `attachCountryScope` / `requireBranchAccess` | (in repo) | Country/branch scoping on the new GET endpoints    | Mirror the owner-aware resolution in `GET /transactions` (routes.ts:709-722) `[VERIFIED]`                                  |

### Alternatives Considered

| Instead of                 | Could Use                                           | Tradeoff                                                                                                                                                                                  |
| -------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Own query per new endpoint | Mutating shared `list()` to LEFT JOIN               | REJECTED — breaks 109's tested export shape + leaks orphan rows into Movimientos tab; the shared path is member-keyed by design                                                           |
| exceljs (server)           | pdfmake (frontend)                                  | REJECTED — D-10/REP-04 say reuse the existing server-side Excel/PDF pattern; the existing pattern is exceljs server-side. pdfmake in repo is session-PDF only, not a report export family |
| New `cajaReportsService`   | Extend `TransactionService` + `CashRegisterService` | RECOMMEND extending existing services (facade pattern per CLAUDE.md): bandeja/historial → `TransactionService`; saldos → `CashRegisterService`                                            |

**Installation:** None. `[VERIFIED: REQUIREMENTS.md "Cero dependencias nuevas"]`

## Package Legitimacy Audit

Not applicable — Phase 141 installs **no external packages** (reads + UI over existing code; REQUIREMENTS.md line 8: "Cero dependencias nuevas"). slopcheck gate skipped (nothing to audit).

## Architecture Patterns

### System Architecture Diagram

```
                          ADMIN BROWSER (/caja hub)
   ┌──────────────────────────────────────────────────────────────────┐
   │  CajaPage.vue  →  q-tabs: [Pendientes] [Saldos] [Movimientos] [Mov-Egresos] │
   │        │              │          │           │ (existing)    │       │
   │        ▼              ▼          ▼           ▼               ▼       │
   │   useTransactionsApi.ts  (extend: getBandeja, getSaldosPorCaja,     │
   │                           getHistorialMovEgresos, validate,         │
   │                           observe, correct, void + 3 export calls)  │
   └───────────────────────────────┬──────────────────────────────────┘
                                    │ axios → /api/admin/finance/*
                                    ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  financeRoutes (Fastify)   onRequest hook: authenticate +          │
   │                            FINANCE_READ_ROLES + attachCountryScope │
   │                                                                    │
   │  NEW reads:                          EXISTING actions (137):       │
   │   GET /pending-tray ───┐             POST /transactions/:id/validate│
   │   GET /cash-registers/balances ─┐    POST /transactions/:id/observe │
   │   GET /movements-history ──┐    │    POST /transactions/:id/correct │
   │   GET .../export (×3)      │    │    POST /transactions/:id/void    │
   └───────────┬───────────────┼────┼──────────────────────┬──────────┘
               ▼               ▼    ▼                       ▼
   ┌───────────────────────┐ ┌─────────────────┐  ┌──────────────────────┐
   │ TransactionService    │ │ CashRegister    │  │ TransactionService    │
   │  .listPendingTray()   │ │  Service        │  │  .validate/observe/   │
   │   (LEFT JOIN users +  │ │  .listActive    │  │   correct/void        │
   │    branches)          │ │     Cajas()     │  │   (already built)     │
   │  .listMovEgresos()    │ │  .getBalance()  │  └──────────────────────┘
   │   (LEFT JOIN users +  │ │   (per caja)    │
   │    branches, kind IN) │ └─────────────────┘
   └───────────────────────┘
                                    │
                                    ▼
                          MySQL: financial_transactions,
                          cash_registers, users, branches
```

### Recommended Project Structure (files touched)

```
el-templo-api/src/modules/finance/
├── routes.ts                 # ADD 3 GET reads + 3 GET …/export (exceljs)
├── transaction-service.ts    # ADD listPendingTray(), listMovEgresos(), + exportRowsFor… variants
├── cash-register-service.ts  # ADD listActiveCajasWithBalance()
├── schemas.ts                # ADD querystring schemas for the 3 reads + exports
└── types.ts                  # ADD PendingTrayItem, MovEgresoItem, CajaSaldoRow, *Filters
el-templo-api/test/finance/
├── pending-tray.test.ts      # NEW — ordering + aging + recorder + coach 403
├── cash-balances.test.ts     # NEW — per-caja firme/pendiente + grouping
└── mov-egresos-history.test.ts # NEW — LEFT JOIN includes NULL-member rows
el-templo-admin/src/
├── pages/CajaPage.vue        # REORGANIZE into q-tabs hub
├── composables/useTransactionsApi.ts  # EXTEND
├── components/                # NEW tab components (PendientesTab, SaldosTab, MovEgresosTab)
├── constants/                 # NEW shared umbral constant (PENDING_THRESHOLD_DAYS = 3)
└── types/transaction.ts       # ADD matching FE types
```

### Pattern 1: New read endpoint mirrors `GET /transactions`

**What:** Each new GET endpoint copies the owner-aware country resolution + `requireBranchAccess` preHandler from `GET /transactions` (routes.ts:686-747).
**When to use:** All three new reads.
**Example (shape only):**

```typescript
// Source: el-templo-api/src/modules/finance/routes.ts:709-736 (existing GET /transactions)
let country: string | undefined;
if (request.scope.isOwner) {
  country = request.query.country
    ? request.query.country.toUpperCase()
    : undefined;
} else {
  country = request.scope.country ?? undefined;
}
// build filters, call transactionService.listPendingTray(filters), return result
```

### Pattern 2: exceljs export in the route layer

**What:** Service returns a flat row array (`exportRowsFor…`); the route builds the `Workbook`, sets columns, styles the header, streams the `.xlsx`.
**Example:**

```typescript
// Source: el-templo-api/src/modules/finance/routes.ts:853-912 (existing /transactions/export)
const rows = await transactionService.exportRowsForExcel(filters);
const workbook = new Workbook();
const sheet = workbook.addWorksheet("Bandeja");
sheet.columns = [
  /* per-report columns */
];
const headerRow = sheet.getRow(1);
headerRow.font = { bold: true };
headerRow.fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE0E0E0" },
};
for (const row of rows)
  sheet.addRow({
    /* ... */
  });
const buffer = await workbook.xlsx.writeBuffer();
reply
  .header(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  )
  .header("Content-Disposition", `attachment; filename="bandeja-${today}.xlsx"`)
  .send(Buffer.from(buffer as ArrayBuffer));
```

### Pattern 3: Frontend composable call mirrors `exportToExcel`

**What:** Each export call uses `api.get(url, { params, responseType: 'blob' })` and returns a `Blob`. List calls return JSON.

```typescript
// Source: el-templo-admin/src/composables/useTransactionsApi.ts:144-161 (existing exportToExcel)
async function exportBandejaToExcel(params): Promise<Blob> {
  const { data } = await api.get("/admin/finance/pending-tray/export", {
    params,
    responseType: "blob",
  });
  return data as Blob;
}
```

### Anti-Patterns to Avoid

- **Mutating shared `list()` / `exportRowsForExcel()` to LEFT JOIN:** breaks 109's tested export column shape and leaks orphan (NULL-member) rows into the Movimientos tab. Give the historial/bandeja their **own** query methods.
- **Inlining `validation_status='validado' AND voided_at IS NULL`:** use `firmMoneyConditions()` (the canonical helper) — drift here would diverge from 137/138.
- **Summing across currencies:** subtotals must be per-`currency` group only (D-06). Never render a total mixing ARS + EUR.
- **Computing aging in SQL:** mirror 108's TS computation (`getOutstandingConcepts`, transaction-service.ts:1226-1229) — clamp ≥0, avoid TZ drift.
- **pdfmake / client-side export:** the export family for reports is exceljs server-side. pdfmake in the repo is the session-PDF builder, unrelated.
- **`onUnmounted` inside the composable:** project rule — composables expose `cleanup()`, the page calls it.

## Don't Hand-Roll

| Problem                          | Don't Build                           | Use Instead                                             | Why                                                                                                                                 |
| -------------------------------- | ------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Per-caja firme + pendiente       | New balance SQL                       | `CashRegisterService.getBalance(id)` (138)              | Already handles opening_balance, cutoff gate, signed in/out flows, firm-money filter `[VERIFIED: cash-register-service.ts:139-217]` |
| Firm-money filter                | Inline `validado`/`voided_at IS NULL` | `firmMoneyConditions()`                                 | Canonical, reused by getBalance/getSummary `[VERIFIED]`                                                                             |
| Validar/Observar/Corregir/Anular | New endpoints                         | Existing 137 POST endpoints (routes.ts:321,390,426,470) | Already built + tested                                                                                                              |
| Member-name search               | New LIKE builder                      | `buildMemberNameSearchCondition`                        | Reused in `buildListConditions` `[VERIFIED: transaction-service.ts:1027]`                                                           |
| Excel workbook                   | New format                            | exceljs route pattern (109/64)                          | Tested, consistent column styling                                                                                                   |
| Recorder ("cargado por") name    | New join helper                       | `alias(schema.users, "recorder")` + `recordedBy` join   | Already in `list()` `[VERIFIED: transaction-service.ts:867,883-886]`                                                                |

**Key insight:** The bandeja, saldos, and historial are all **thin read assemblies over primitives that 137/138/139 already shipped**. The only genuinely new SQL is the LEFT-JOIN variant of the list query (and an `inArray(kind, [...])` filter for the historial). Everything else is composition.

## Runtime State Inventory

Phase 141 is **NOT** a rename/refactor/migration phase — it adds reads + UI over existing tables.

- **Stored data:** None — verified by reading the phase boundary (REQUIREMENTS.md "141 es reads + UI"); no key/collection/ID is renamed.
- **Live service config:** None — no external service touched.
- **OS-registered state:** None.
- **Secrets/env vars:** None — no new env var (no `.env.example` change).
- **Build artifacts:** None — no package rename.

**Migration check:** NO migration expected and **none found needed**. The three reads use existing columns (`validation_status`, `cash_register_id`, `kind`, `member_id`, `recorded_by`); `getBalance` exists; `cash_registers` table exists (138). If the planner discovers a missing index causing a slow bandeja query, that would be the only migration candidate — but `idx_cash_registers_type_currency`/`idx_cash_registers_branch` already exist (cash-registers.ts:50-53) and `financial_transactions` is the existing hot table. **No migration in scope.**

## The Three New Endpoints (most valuable — design precisely)

### (a) Bandeja de pendientes — REP-01

**Endpoint:** `GET /api/admin/finance/pending-tray`
**Service:** `TransactionService.listPendingTray(filters)` — NEW method, **own query, LEFT JOIN users + branches** (a pendiente cobro always has a member today, but use LEFT JOIN defensively + to share the historial query shape; INNER would be acceptable for member-charges-only but LEFT is safer and consistent).
**Filter:** `validation_status IN ('pendiente','observado')` + the `Pendientes/Observados/Todos` toggle (D-04) maps to: `Pendientes` → `=pendiente`; `Observados` → `=observado`; `Todos` → `IN(pendiente,observado)`. Plus country/branch scope + optional `dateFrom/dateTo`.
**Order:** by **antigüedad oldest-first** (D-02). Use `asc(transactionDate), asc(createdAt)` (oldest on top). NOTE: the existing `list()` orders `desc` — the bandeja is the **opposite**.
**Row shape (`PendingTrayItem`):** `id, transactionDate, memberId, memberName, amount, currency, paymentMethod, cashRegisterId, cashRegisterName, recordedBy, recorderName, validationStatus, ageInDays, isOverdue` where:

- `cashRegisterName` — JOIN `cash_registers` on `cash_register_id` (the row's caja). `[ASSUMED]` the list needs the caja **name** per D-02 ("caja" column) — confirm whether the column should show caja name vs. branch name; D-02 says "caja".
- `recorderName` — `alias(users,'recorder')` on `recorded_by` (the "cargado por", D-02).
- `ageInDays` — computed **in TS** over `transactionDate` (mirror 108): `max(0, floor((today - txDate)/MS_PER_DAY))`.
- `isOverdue` — `ageInDays > PENDING_THRESHOLD_DAYS` (D-08, threshold = 3). RECOMMEND computing `isOverdue` **server-side** from the shared constant so the overdue counter is authoritative; the frontend still renders the badge/color (D-09).
  **RBAC:** module-level `FINANCE_READ_ROLES` (coach excluded). Reading the tray is read-only → `FINANCE_READ_ROLES` is correct; the **actions** (validate/observe/correct/void) are already `FINANCE_VOID_ROLES`.
  **Pagination:** RECOMMEND paginate (`PaginatedResult<PendingTrayItem>`) like `list()` for consistency; the tray could grow. `[ASSUMED]` — confirm whether the bandeja should page or return all pendientes (a daily control list is usually small but unbounded historically).

### (b) Saldos por caja — REP-02

**Endpoint:** `GET /api/admin/finance/cash-registers/balances`
**Service:** `CashRegisterService.listActiveCajasWithBalance(scope)` — NEW method. Query `cash_registers WHERE is_active = true` (+ country scope via `branch_id → branches.country`, mirroring `resolveCajaCountry` in routes.ts:104-122; branch-less central/banco cajas are country-agnostic → owner-only, per the existing 139 scope precedent). For each caja, call existing `getBalance(id)` and attach `name`, `type`, `branchId`, `currency`.
**Row shape (`CajaSaldoRow`):** `cashRegisterId, name, type ('efectivo'|'banco'), branchId, currency, firmeBalance, pendienteAmount`. (firme/pendiente come straight from `getBalance` — `CashRegisterBalance`, types.ts:362-367.)
**Grouping (D-06):** the **frontend** groups into "Efectivo sucursales" (type=efectivo, branchId≠null) / "Efectivo central" (type=efectivo, branchId=null) / "Banco" (type=banco), and computes **subtotal per currency** within each group. RECOMMEND the endpoint returns a flat array and the frontend groups (keeps the endpoint simple, grouping is a display concern). `[ASSUMED]` — alternatively group server-side; flat is simpler and matches D-06's "subtotal solo por moneda" being a render rule.
**Performance note:** `getBalance` runs ~3 SUM queries per caja. With a handful of cajas this is fine (no N+1 concern at this scale). If caja count grows materially, a single grouped SUM query could replace the loop — flag only if perf evidence appears (138 deliberately kept saldo derived, "materialize only with perf evidence").
**RBAC:** `FINANCE_READ_ROLES` module guard + country scope (non-owner sees only their country's branch cajas; branch-less central/banco are owner-only per 139's `enforceCajaScope` precedent). `[ASSUMED]` confirm whether gestion/admin (non-owner) should see central/banco saldos at all — 139 made branch-less cajas owner-only for movements; saldos read may want the same rule.

### (c) Historial mov/egresos — REP-03 (the LEFT JOIN fix)

**Endpoint:** `GET /api/admin/finance/movements-history`
**Service:** `TransactionService.listMovEgresos(filters)` — NEW method, **own query, LEFT JOIN users + LEFT JOIN branches** (the 139 flag).
**Filter:** `kind IN ('cash_transfer','expense','adjustment')` (D: adjustment = reconciliation rows from 139; include them so the trail is complete — confirm whether `adjustment` belongs in this view or only cash_transfer+expense; CONTEXT says "cash_transfer + expense"; the additional_context says "kind IN (cash_transfer, expense, adjustment)"). RECOMMEND include all three so reconciliation adjustments are visible alongside their movement. `[ASSUMED]` — resolve cash_transfer+expense vs. +adjustment in discuss/plan. Plus filter by caja (`cash_register_id`) / período (`dateFrom/dateTo`) + country scope.
**Row shape (`MovEgresoItem`):** `id, transactionDate, kind, direction, amount, currency, cashRegisterId, cashRegisterName, branchId, branchName (nullable), recordedBy, recorderName, voidedAt, voidReason, notes`. memberName omitted/empty (these rows have `member_id = NULL`).

**The fix, scoped precisely:**

- `TransactionService.list()` (transaction-service.ts:872-932) and `exportRowsForExcel()` (:1421-1460) **INNER JOIN** `users` (`eq(users.id, financialTransactions.memberId)`) AND `branches` (`eq(branches.id, financialTransactions.branchId)`). `[VERIFIED: read transaction-service.ts lines 875-925 and 1444-1455]`
- A `cash_transfer`/`expense`/`adjustment` row has `member_id = NULL` (types.ts:62, create() skips member probe when null) and frequently `branch_id = NULL` (central/banco cajas). The INNER JOINs therefore **drop these rows entirely**.
- **Decision: own query, NOT a shared mutation.** Reasons: (1) the Movimientos tab keeps using the existing member-keyed `list()` (correct as-is); (2) swapping `list()` to LEFT JOIN would let NULL-member rows leak into Movimientos and would change 109's tested export shape (`export-transactions.test.ts`); (3) the historial query also needs a different `kind IN (...)` filter and LEFT-joined caja name. Build `listMovEgresos()` as a sibling that LEFT JOINs `users`, `branches`, and `cash_registers`.
- **Country scope under LEFT JOIN branches:** `filters.country` currently does `eq(branches.country, country)` (transaction-service.ts:996-998). Under a LEFT JOIN, a NULL-branch (central/banco) row has `branches.country = NULL`, so `= country` excludes it — meaning **non-owner country filtering would hide central/banco rows**. This is the same owner-only semantics 139 applied to branch-less cajas. RECOMMEND: for non-owner, scope by the **caja's** country (via `cash_register.branch_id → branches.country`), and branch-less cajas are owner-only — mirror `enforceCajaScope`. `[ASSUMED]` confirm the exact scope rule for central/banco rows in the historial.

**Pagination:** `PaginatedResult<MovEgresoItem>` like `list()`.

## Reusing the 137 action endpoints (confirmed shapes)

All four **already exist** on `financeRoutes` and are RBAC-gated `FINANCE_VOID_ROLES` (owner/admin/gestion). `[VERIFIED: routes.ts]`

| Action   | Method + path                     | Body                                                                    | Response                                                         |
| -------- | --------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Validar  | `POST /transactions/:id/validate` | none                                                                    | `{ transaction: TransactionDetail }` (routes.ts:402-406)         |
| Observar | `POST /transactions/:id/observe`  | `{ reason: string }` (mandatory)                                        | `{ transaction }` (routes.ts:438-443)                            |
| Corregir | `POST /transactions/:id/correct`  | `{ correctedFields: { amount?, memberId?, paymentMethod? } }`           | **201** `{ transaction }` — NEW validado row (routes.ts:482-487) |
| Anular   | `POST /transactions/:id/void`     | `{ reason: string, keepMembershipActive?: boolean }` (**default true**) | `{ transaction }` (routes.ts:370-378)                            |

**Anular membership popup (D-05 / 137 D-10):** the void endpoint **accepts `keepMembershipActive`** (verified routes.ts:319,375 and `VoidTransactionInput`, types.ts:122-133). Default `true` (sub untouched); `false` cancels the linked subscription atomically. The 1-a-1 popup in the bandeja must send this boolean.

**Composable gap:** `useTransactionsApi.ts` today has `voidTransaction(id, reason)` **but it does NOT send `keepMembershipActive`** (line 46-64 sends only `{ reason }`). It also has **no** validate/observe/correct calls. 141 must: (1) extend `voidTransaction` to pass `keepMembershipActive`; (2) add `validateTransaction`, `observeTransaction`, `correctTransaction`. `[VERIFIED: useTransactionsApi.ts:46-64, 233-248]`

## Export reuse (REP-04 — parameterization decision)

**Existing mechanism:** exceljs `Workbook` built **in the route layer** over a `service.exportRowsFor…()` method that returns a flat row array. One export endpoint per report. `[VERIFIED: finance/routes.ts:811-922; reports/routes.ts:/*\/export pattern]`

**Decision — sibling endpoints, NOT a `?type=` param:** add `GET /pending-tray/export`, `GET /cash-registers/balances/export`, `GET /movements-history/export`, each over its own `exportRowsFor…()` method. Rationale:

- Each report has **different columns** (bandeja: aging/recorder/status; saldos: firme/pendiente/currency grouping; historial: kind/caja/void) — a single parameterized endpoint would branch on `type` internally and become a god-handler.
- The existing pattern is **already one endpoint per report** (`/transactions/export`, `/outstanding-balances/export`, `/charges/export`, `/expiring/export`…). Sibling endpoints match the established convention exactly — that IS "the same pattern, no parallel mechanism."
- The frontend `useTransactionsApi` already has **one `export…ToExcel` function per report** (`exportToExcel`, `exportOutstandingBalancesToExcel`) — add three more, each `responseType: 'blob'`.

**Reuse the filter shape:** each export endpoint takes the same querystring as its list endpoint **minus `page`/`limit`** (server returns all matching rows), mirroring `exportTransactionsSchema` (schemas.ts:502-525). The export service method reuses the list method's WHERE-builder (mirror `exportRowsForExcel` reusing `buildListConditions`, transaction-service.ts:1419).

**No pdfmake.** The repo's pdfmake is session-PDF (frontend) only. If a PDF variant is ever wanted, it would be a **separate** decision; D-10 says reuse the existing Excel/PDF export, and the existing **report** export is exceljs. `[ASSUMED: "Excel and/or PDF"]` — Claude's Discretion (D-decision) leaves format open; RECOMMEND **Excel only** for v1 (matches every existing report export; PDF would need a new server-side renderer, which is not "reuse").

## Frontend reorganization (CajaPage → hub)

**Current state:** `CajaPage.vue` (834 lines) = summary cards (revenueByMethod/monthlyRevenue/revenueByKind) + filters + `q-table` of transactions (with acciones column + `q-menu`) + egresos section + detail dialog + Excel export button. Script uses `useTransactionsApi`, `authStore` (`isOwner`), `displayCurrency`, `onMounted` (no `onUnmounted`). `[VERIFIED: CajaPage.vue, grep]`

**Reorganization:**

- Wrap content in `q-tabs` + `q-tab-panels` with 4 panels: **Pendientes** (landing/default model-value), **Saldos**, **Movimientos** (the existing summary+table+export, moved verbatim), **Mov-Egresos**.
- RECOMMEND extracting each panel into a child component (`PendientesTab.vue`, `SaldosTab.vue`, `MovEgresosTab.vue`) to keep CajaPage from ballooning; the existing summary/table can stay inline in a `MovimientosTab.vue` or remain in CajaPage. (Component split is a UI-SPEC detail per Claude's Discretion D-decision.)
- Extend `useTransactionsApi` with: `getPendingTray`, `getCashRegisterBalances`, `getMovEgresosHistory`, `validateTransaction`, `observeTransaction`, `correctTransaction`, updated `voidTransaction(id, reason, keepMembershipActive)`, + three `export…ToExcel`. Keep `cleanup()` (no `onUnmounted` inside).
- **Umbral constant:** create a shared `PENDING_THRESHOLD_DAYS = 3` constant. RECOMMEND putting it **server-side** (so `isOverdue` + the overdue counter are authoritative and 142 can swap the constant read to a config read without touching the UI). The frontend reads `isOverdue`/`ageInDays` from the row and renders the badge/color/counter (D-09). `[ASSUMED]` — D-08 leaves "front or back" open (Claude's Discretion); server-side is the safer seam for 142.
- **Route:** `/caja` stays gated `['gestion','admin','owner']` (both router meta and backend `FINANCE_READ_ROLES`). No change. `[VERIFIED: routes.ts:71-73, AdminLayout.vue:96,230]`

## Common Pitfalls

### Pitfall 1: INNER JOIN drops the historial rows (the 139 flag)

**What goes wrong:** Reusing `list()` for the historial returns zero (or partial) rows — every `member_id = NULL` movimiento/egreso vanishes.
**Why:** `list()`/`exportRowsForExcel()` INNER JOIN `users` and `branches`.
**How to avoid:** Build a separate `listMovEgresos()` with LEFT JOINs. Test must assert a NULL-member egreso **appears**.
**Warning signs:** Historial tab empty despite egresos existing; export missing rows.

### Pitfall 2: Country filter hides central/banco rows under LEFT JOIN

**What goes wrong:** `eq(branches.country, country)` excludes NULL-branch (central/banco) rows for non-owners.
**Why:** LEFT-joined NULL `branches.country` ≠ `country`.
**How to avoid:** Scope non-owner by the **caja's** country (via `cash_register.branch_id`), branch-less cajas owner-only (mirror `enforceCajaScope`, routes.ts:128-143).
**Warning signs:** gestion sees movimientos but not banco/central history.

### Pitfall 3: Cross-currency subtotal in saldos

**What goes wrong:** A group total mixes ARS + EUR cajas.
**Why:** Naive sum across a type group.
**How to avoid:** Subtotal **per currency** within each group (D-06); never a single cross-currency total. Currency badge always beside the figure.
**Warning signs:** A "total banco" number that isn't tied to a currency.

### Pitfall 4: Bandeja ordered newest-first

**What goes wrong:** Most-urgent (oldest) pendientes sink to the bottom; overdue counter looks wrong relative to row order.
**Why:** Copying `list()`'s `desc(transactionDate)`.
**How to avoid:** `asc(transactionDate), asc(createdAt)` (oldest on top, D-02/D-09).
**Warning signs:** "hace 12 días" rows below "hace 1 día".

### Pitfall 5: Forgetting `keepMembershipActive` in the void call

**What goes wrong:** The membership popup decision is silently dropped; sub always stays active.
**Why:** Existing `voidTransaction` composable sends only `{ reason }`.
**How to avoid:** Extend the composable + wire the popup boolean to the body.
**Warning signs:** Anular-with-cancel-membership has no effect.

### Pitfall 6: aging computed in SQL drifts with timezone

**What goes wrong:** `ageInDays` off by one near midnight / future dates negative.
**Why:** SQL `DATEDIFF` vs. server-local midnight.
**How to avoid:** Compute in TS, `max(0, …)` clamp — mirror `getOutstandingConcepts` (transaction-service.ts:1197-1229).

## Code Examples

### LEFT JOIN historial query (the new sibling method)

```typescript
// Source: pattern derived from transaction-service.ts list() (:872-932), swapping INNER→LEFT
// and adding kind IN + caja name. recorder alias reused from :867.
const recorder = alias(schema.users, "recorder");
const raw = await this.db
  .select({
    id: schema.financialTransactions.id,
    transactionDate: schema.financialTransactions.transactionDate,
    kind: schema.financialTransactions.kind,
    direction: schema.financialTransactions.direction,
    amount: schema.financialTransactions.amount,
    currency: schema.financialTransactions.currency,
    cashRegisterId: schema.financialTransactions.cashRegisterId,
    cashRegisterName: schema.cashRegisters.name,
    branchId: schema.financialTransactions.branchId,
    branchName: schema.branches.name,
    recordedBy: schema.financialTransactions.recordedBy,
    recorderFirstName: recorder.firstName,
    recorderLastName: recorder.lastName,
    voidedAt: schema.financialTransactions.voidedAt,
    voidReason: schema.financialTransactions.voidReason,
    notes: schema.financialTransactions.notes,
  })
  .from(schema.financialTransactions)
  .leftJoin(
    schema.users,
    eq(schema.users.id, schema.financialTransactions.memberId),
  )
  .leftJoin(
    schema.branches,
    eq(schema.branches.id, schema.financialTransactions.branchId),
  )
  .leftJoin(
    schema.cashRegisters,
    eq(schema.cashRegisters.id, schema.financialTransactions.cashRegisterId),
  )
  .leftJoin(recorder, eq(recorder.id, schema.financialTransactions.recordedBy))
  .where(
    and(
      inArray(schema.financialTransactions.kind, [
        "cash_transfer",
        "expense",
        "adjustment",
      ]),
      /* + caja / período / country-scope conditions */
    ),
  )
  .orderBy(
    desc(schema.financialTransactions.transactionDate),
    desc(schema.financialTransactions.createdAt),
  );
```

### Saldos por caja (iterate active cajas + getBalance)

```typescript
// Source: composes existing getBalance (cash-register-service.ts:139) over active cajas.
async listActiveCajasWithBalance(): Promise<CajaSaldoRow[]> {
  const cajas = await this.db
    .select({ id: schema.cashRegisters.id, name: schema.cashRegisters.name,
              type: schema.cashRegisters.type, branchId: schema.cashRegisters.branchId,
              currency: schema.cashRegisters.currency })
    .from(schema.cashRegisters)
    .where(eq(schema.cashRegisters.isActive, true));
  const out: CajaSaldoRow[] = [];
  for (const c of cajas) {
    const bal = await this.getBalance(c.id); // firmeBalance + pendienteAmount
    out.push({ cashRegisterId: c.id, name: c.name, type: c.type, branchId: c.branchId,
               currency: c.currency, firmeBalance: bal.firmeBalance, pendienteAmount: bal.pendienteAmount });
  }
  return out;
}
```

## State of the Art

| Old Approach            | Current Approach                                | When Changed   | Impact                                           |
| ----------------------- | ----------------------------------------------- | -------------- | ------------------------------------------------ |
| Cierre de caja diario   | Validación de pendientes como control cotidiano | v5.2 (137-141) | The bandeja IS the daily control; no daily close |
| `member_id` NOT NULL    | nullable (movimientos/egresos)                  | 139            | LEFT JOIN required to see those rows             |
| `branch_id` NOT NULL    | nullable (central/banco cajas)                  | 139            | LEFT JOIN + country scope via caja               |
| Saldo cerrado por turno | Saldo derivado (firme + pendiente aparte)       | 138            | `getBalance` returns both; never summed          |

**Deprecated/outdated:** None relevant. (No external library version concerns — zero new deps.)

## Assumptions Log

| #   | Claim                                                                                               | Section           | Risk if Wrong                                                                           |
| --- | --------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------- |
| A1  | Bandeja "caja" column shows caja **name** (not branch name)                                         | Endpoint (a)      | Wrong column label/data; cheap to flip                                                  |
| A2  | Bandeja should **paginate** (`PaginatedResult`)                                                     | Endpoint (a)      | If unpaged expected, minor reshape                                                      |
| A3  | Saldos endpoint returns **flat array**, frontend groups by type + subtotals per currency            | Endpoint (b)      | If server-side grouping wanted, move logic; low risk                                    |
| A4  | Non-owner (gestion/admin) sees central/banco saldos as **owner-only** (mirror 139 branch-less rule) | Endpoints (b),(c) | If non-owners should see them, relax scope; security-sensitive — confirm                |
| A5  | Historial filters `kind IN (cash_transfer, expense, adjustment)` (includes adjustment)              | Endpoint (c)      | CONTEXT says cash_transfer+expense; additional_context adds adjustment. Resolve in plan |
| A6  | Export format = **Excel only** for v1 (no PDF)                                                      | Export            | D leaves "Excel and/or PDF" open; PDF would need new server renderer (not "reuse")      |
| A7  | Umbral constant lives **server-side** (`isOverdue`/counter authoritative)                           | Frontend / Umbral | D-08 leaves front/back open; server-side is the cleaner 142 seam                        |
| A8  | Bandeja uses LEFT JOIN users (defensive/consistency) even though pendientes have members            | Endpoint (a)      | INNER would also work for member-only; LEFT is safe                                     |

**Resolve A1–A7 in discuss/plan before locking the endpoint contracts.** A4 (scope of central/banco visibility) is the most security-sensitive.

## Open Questions

**ALL RESOLVED (2026-06-24) — locked into the 141 plans.**

1. **adjustment in historial? → RESOLVED: INCLUDED.** The historial filters `kind IN ('cash_transfer','expense','adjustment')` so the reconciliation adjustment rows from 139 are visible alongside their movement. (Plan 141-02 `listMovEgresos`.)
2. **Central/banco caja visibility for non-owners? → RESOLVED: OWNER-ONLY for reads** (Franco-confirmed 2026-06-24). gestion/admin see only their country's sucursal efectivo cajas; branch-less central/banco saldos AND historial are owner-only — mirroring 139's branch-less write rule via the caja-country scope (`enforceCajaScope` semantics). (Plans 141-01 `listActiveCajasWithBalance`, 141-02 `listMovEgresos`.)
3. **Bandeja pagination vs. full list? → RESOLVED: PAGINATE** like the existing `list()` (`PaginatedResult` + defense-in-depth max 200). (Plan 141-01 `listPendingTray`.)

## Environment Availability

Skipped — Phase 141 has no external dependencies (reads + UI over existing code/DB; no tool, service, or runtime beyond the already-running API + admin app + existing MySQL).

## Validation Architecture

`workflow.nyquist_validation` not found disabled — including section. (Config not present at `.planning/config.json` in standard location; treat as enabled.)

### Test Framework

| Property           | Value                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Framework          | Vitest (integration, real MySQL `eltemplo_test_<POOL_ID>`)                                                                         |
| Config file        | existing (`el-templo-api` vitest setup; helpers at `test/helpers.ts`)                                                              |
| Quick run command  | `cd el-templo-api && npx tsc --noEmit` (typecheck only — per MEMORY: do NOT run full suite locally; CI runs it on push to staging) |
| Full suite command | runs in **CI** on push to staging (not local)                                                                                      |

### Phase Requirements → Test Map

| Req ID       | Behavior                                                                      | Test Type   | Automated Command                                      | File Exists? |
| ------------ | ----------------------------------------------------------------------------- | ----------- | ------------------------------------------------------ | ------------ |
| REP-01       | Bandeja lists pendiente+observado, oldest-first, with aging + recorder + caja | integration | (CI) `vitest test/finance/pending-tray.test.ts`        | ❌ Wave 0    |
| REP-01       | overdue flag uses 3-day threshold                                             | integration | (CI) same file                                         | ❌ Wave 0    |
| REP-02       | Saldos returns firme+pendiente per active caja, grouped data correct          | integration | (CI) `vitest test/finance/cash-balances.test.ts`       | ❌ Wave 0    |
| REP-03       | Historial **includes NULL-member** egreso/movimiento rows (LEFT JOIN)         | integration | (CI) `vitest test/finance/mov-egresos-history.test.ts` | ❌ Wave 0    |
| REP-03       | Historial filters by caja + período                                           | integration | (CI) same file                                         | ❌ Wave 0    |
| REP-01/02/03 | coach → **403** on all three reads (`FINANCE_READ_ROLES`)                     | integration | (CI) per file                                          | ❌ Wave 0    |
| REP-04       | each export returns `.xlsx` with correct columns                              | integration | (CI) per file or shared export test                    | ❌ Wave 0    |

### Sampling Rate

- **Per task commit:** `npx tsc --noEmit` in the touched app (typecheck; no full local suite per MEMORY).
- **Per wave merge:** push to staging → CI runs the full integration suite.
- **Phase gate:** CI green on staging before `/gsd:verify-work`.

### Wave 0 Gaps

- [ ] `test/finance/pending-tray.test.ts` — covers REP-01 (ordering, aging, recorder, overdue, coach 403)
- [ ] `test/finance/cash-balances.test.ts` — covers REP-02 (per-caja firme/pendiente, grouping data, coach 403, central/banco scope)
- [ ] `test/finance/mov-egresos-history.test.ts` — covers REP-03 (**LEFT JOIN includes NULL-member rows**, caja/período filter, coach 403)
- [ ] Export assertions (REP-04) — extend the above or a shared export test (`.xlsx` columns per report)
- [ ] Frontend: no API test infra for Quasar pages here; UI verified via HUMAN-UAT (tab landing, validar one-tap, overdue badge/counter, saldos currency isolation, historial shows egresos)
- [ ] Seed helpers: `ensureEfectivoCaja` exists (`test/helpers.ts:274`); may need an `ensureBancoCaja`/movimiento+egreso seed for REP-03 — confirm in Wave 0.

## Security Domain

`security_enforcement` not explicitly false — including.

### Applicable ASVS Categories

| ASVS Category         | Applies | Standard Control                                                                                                                                                                                                       |
| --------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | yes     | `fastify.authenticate` onRequest hook (existing)                                                                                                                                                                       |
| V3 Session Management | no      | JWT handled upstream; unchanged                                                                                                                                                                                        |
| V4 Access Control     | **yes** | `FINANCE_READ_ROLES` (reads) + `FINANCE_VOID_ROLES` (actions) + country scope (`attachCountryScope`/`requireBranchAccess`/`enforceCajaScope`). coach **excluded** from reads (privacy). Frontend `allowedRoles` mirror |
| V5 Input Validation   | yes     | Fastify JSON Schema querystrings (`additionalProperties:false`, enum/format) — mirror `listTransactionsSchema`/`exportTransactionsSchema`                                                                              |
| V6 Cryptography       | no      | No crypto in scope                                                                                                                                                                                                     |

### Known Threat Patterns for this stack

| Pattern                                                                    | STRIDE                 | Standard Mitigation                                                                                                                                           |
| -------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-country data leak (non-owner reads other country's caja/movimientos) | Information Disclosure | Owner-aware country resolution (routes.ts:709-722); branch-less caja owner-only (`enforceCajaScope`); **404 not 403** to avoid existence leak (139 precedent) |
| Coach reaching caja saldos/reports                                         | Elevation / Disclosure | `FINANCE_READ_ROLES` excludes coach (module guard); router `allowedRoles` excludes coach from `/caja`                                                         |
| Mass-export of all rows ignoring scope                                     | Information Disclosure | Export endpoints reuse the **same** filter + country scope as the list (no unscoped path)                                                                     |
| SQL injection                                                              | Tampering              | Drizzle parameterized queries only (no string SQL); member search via `buildMemberNameSearchCondition`                                                        |
| Action without authorization (validate/void via API)                       | Tampering              | Per-handler `FINANCE_VOID_ROLES` check (already enforced, 137)                                                                                                |

## Sources

### Primary (HIGH confidence)

- `el-templo-api/src/modules/finance/routes.ts` — existing endpoints (create:197, void:321, validate:390, observe:426, correct:470, movements:505, expenses:557, list:686, summary:761, export:823), onRequest guard (181), country-scope helpers (104-175)
- `el-templo-api/src/modules/finance/transaction-service.ts` — `list()` INNER JOINs (872-932), `exportRowsForExcel()` INNER JOINs (1421-1518), aging-in-TS precedent (1197-1229), `buildListConditions` (991-1032)
- `el-templo-api/src/modules/finance/cash-register-service.ts` — `getBalance` (139-217), `resolveCashRegister` (48-110)
- `el-templo-api/src/modules/finance/types.ts` — `CashRegisterBalance` (362-367), `TransactionListFilters` (146-166), `VoidTransactionInput` (122-133)
- `el-templo-api/src/db/schema/cash-registers.ts` — table + indexes (29-54)
- `el-templo-api/src/modules/shared/permissions.ts` — `FINANCE_READ_ROLES` (126-131), `FINANCE_VOID_ROLES` (123)
- `el-templo-admin/src/composables/useTransactionsApi.ts` — existing calls + `exportToExcel` (144-161), missing validate/observe/correct, void without keepMembershipActive (46-64)
- `el-templo-admin/src/pages/CajaPage.vue` — current structure (q-table, summary, export, onMounted)
- `el-templo-admin/src/router/routes.ts` — `/caja` gating (71-73)
- `el-templo-admin/src/layouts/AdminLayout.vue` — `isCajaRole` (230)
- `el-templo-api/test/finance/` — test files inventory + `validation-state.test.ts` (RBAC-over-HTTP pattern), `helpers.ts:ensureEfectivoCaja`
- `.planning/phases/141-.../141-CONTEXT.md` (D-01..D-10) + `.planning/REQUIREMENTS.md` (REP-01..04)

### Secondary (MEDIUM confidence)

- None — all claims verified directly in source.

### Tertiary (LOW confidence)

- None.

## Project Constraints (from CLAUDE.md)

- **API:** Pino logger only (`request.log`/`app.log`/`this.log`); never `console.log`. Frontend: `createLogger()`.
- **TypeScript:** no `any`; `catch (err: unknown)` with `instanceof Error`. (The finance module already follows this; the loose-response casts use `as TransactionListFilters["country"]` etc. — mirror existing style.)
- **API tests:** new routes need integration tests in `el-templo-api/test/` against real MySQL (`eltemplo_test`). Use `test/helpers.ts` (`createTestApp`, `getAuthToken`, `createStaffUser`, `ensureEfectivoCaja`).
- **No migration** in 141 (reads + UI). If any SQL migration were needed (it isn't), **no `;` inside SQL comments** (runner splits on `;`).
- **Patterns:** facade pattern for services (extend `TransactionService`/`CashRegisterService`); Pinia composition stores; composables expose `cleanup()`, NO `onUnmounted` inside.
- **Do NOT install/update dependencies** (zero new deps here — none needed).
- **Local typecheck only** (`npx tsc --noEmit`); full test suite runs in CI on push to staging. Stage files by path (no `git add -A`).
- **Brand palette:** cálida, sin azul (`quasar.variables.scss`) — for the badge/overdue colors use warm palette (terracotta/clay/aged-gold), not blue.

<phase_requirements>

## Phase Requirements

| ID     | Description                                                                          | Research Support                                                                                                                                                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REP-01 | Bandeja de pendientes ordenada por antigüedad + alerta de umbral, junto a observados | NEW `GET /pending-tray` + `listPendingTray()` (own LEFT-JOIN query, `validation_status IN`, asc order, TS aging, overdue via shared 3-day constant) + frontend Pendientes tab (filter Pendientes/Observados/Todos, badge, overdue counter). Actions reuse 137 endpoints |
| REP-02 | Saldo firme y pendiente por caja (efectivo sucursal/central, banco por moneda)       | NEW `GET /cash-registers/balances` + `listActiveCajasWithBalance()` iterating active cajas over existing `getBalance` (138); frontend Saldos tab cards grouped by type, subtotal per currency, never cross-currency                                                     |
| REP-03 | Historial de movimientos inter-caja y egresos por caja/período                       | NEW `GET /movements-history` + `listMovEgresos()` — **the LEFT JOIN fix** (`list()` INNER-JOINs drop NULL-member rows; new sibling query LEFT JOINs users+branches+cash_registers, `kind IN`), caja/período filters                                                     |
| REP-04 | Reportes nuevos exportan reusando el export Excel/PDF existente                      | Sibling `…/export` endpoints per report over `exportRowsFor…()` methods using the exceljs route pattern (finance/reports modules); frontend `export…ToExcel` (`responseType:'blob'`). NO parallel mechanism, NO pdfmake (Excel-only recommended for v1)                 |

</phase_requirements>

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — zero new deps; every library confirmed in-repo and in active use.
- Architecture (3 endpoints + LEFT JOIN scoping + export reuse): HIGH — derived from reading the exact source lines; the INNER-JOIN-drops-NULL flag is verified, not assumed.
- Pitfalls: HIGH — each maps to a concrete code line.
- Open assumptions (A1–A8): MEDIUM — these are product/contract choices left to discuss/plan, not technical unknowns.

**Research date:** 2026-06-24
**Valid until:** ~30 days (stable internal codebase; no fast-moving external surface).
