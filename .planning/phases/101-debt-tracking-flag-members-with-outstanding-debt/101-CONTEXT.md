# Phase 101: Debt Tracking — Context

**Gathered:** 2026-04-21
**Status:** Ready for planning
**Source:** Direct design conversation (discuss-phase skipped per user request)

<domain>
## Phase Boundary

**IN SCOPE (v1):**

- New `debts` table (separate from `users` and `subscriptions`)
- Admin can flag a member as "debtor" with amount + currency + free-form note
- One active (non-cancelled) debt per user, enforced at service layer
- Soft-cancel (history preserved for future accounting work)
- Admin AlumnosPage: split filter bar into 2 rows + "Solo deudores" toggle
- When toggle on: "Deuda total: ARS $X · USD $Y" banner + "Deuda" column per alumno
- MemberFormDialog: Deudor toggle + amount input + currency select + note textarea
- API: `GET /members` extended with `debtorOnly` filter + `totalDebtByCurrency` response field
- API: upsert active debt + cancel active debt endpoints (or wire through existing member edit endpoint)

**OUT OF SCOPE (explicitly deferred to future accounting phase):**

- Integration with `payments` table — admin manages debt manually, payments do NOT auto-decrement
- Audit log for who/when cancelled a debt
- Multiple simultaneous debts per user
- Reports/analytics integration (CajaPage, ReportesPage, AnaliticasPage)
- Partial payments / amount-paid tracking on debt
- Excel export column for debt
- Member app visibility (admin-only feature in v1)

</domain>

<decisions>
## Implementation Decisions (Locked)

### D-01: Schema — separate `debts` table

Deuda va en tabla nueva `debts`, NO en `users` ni en `subscriptions`. Rationale: tabla separada permite crecer (historial, múltiples deudas, campos contables) sin romper schema; el usuario explicitly rejected the "en users" option after initial consideration.

### D-02: Table shape

```
debts (
  id INT PK AUTO_INCREMENT,
  user_id INT NOT NULL FK → users(id),
  amount INT NOT NULL,                  -- whole units (same pattern as subscriptions.pricePaid)
  currency VARCHAR(3) NOT NULL DEFAULT 'ARS',
  note TEXT NULL,                       -- free-form: "debe $20000 de la mensualidad de abril"
  is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  INDEX idx_debts_user_id (user_id),
  INDEX idx_debts_user_active (user_id, is_cancelled)
)
```

### D-03: One active debt per user — service-layer invariant

Pattern: same as subscriptions ("one active sub per member"). Enforced in the debt service, NOT via DB unique index (MySQL doesn't support partial unique indexes). If admin tries to create a second active debt for a user that already has one, the service must return D-17-style error OR update the existing active debt.

**Recommended service behavior:** "upsert" semantics — if user has no active debt, create one; if user has an active debt, update amount/currency/note on the existing row. This matches the UI pattern (form has toggle + fields, not "add another debt" button).

### D-04: Soft-cancel, NOT hard delete

When admin destilda "Deudor" toggle, set `is_cancelled = true` and `cancelled_at = NOW()`. Never `DELETE FROM debts`. Rationale: preserve history for future accounting/analytics phase ("mostrar todas las deudas cerradas este mes").

### D-05: No integration with `payments` table

v1 does NOT wire debt to payments. Admin manually toggles off when paid. Explicit decision by user: "no queremos integración con payments, records y stuff, just the simple flag". A future phase will do the accounting integration properly.

### D-06: Currency stored per-debt

Since debts lives in a separate table (not joined to sub/user), the debt must carry its own currency. `currency VARCHAR(3) DEFAULT 'ARS'`. Prepares for multi-currency (Phase 98 in progress for AR/ES plans).

### D-07: Total debt banner — grouped by currency

API returns `totalDebtByCurrency: [{ currency: 'ARS', amount: 350000 }, { currency: 'USD', amount: 120 }, ...]`. Frontend renders "Deuda total: ARS $X · USD $Y". Groups computed over the SAME filter set applied to the member list (sucursal, plan, search, etc.) — so if admin filters to "Chapadmalal", the total reflects only Chapadmalal debtors.

### D-08: API shape — extend `GET /members` (option A)

Instead of a dedicated `/members/debt-summary` endpoint, extend the existing list endpoint's response with `totalDebtByCurrency` and a new `debtorOnly` query param. Rationale: single source of truth for filters, one query extra (cheap), frontend only displays the total when the "Solo deudores" toggle is on.

**Additive shape (do NOT break existing consumers):**

- New optional query param: `debtorOnly: boolean` (default false)
- New response field: `totalDebtByCurrency: Array<{ currency: string, amount: number }>` (always returned, empty array if no debts match; frontend shows only when toggle on)
- Each member row includes `debt: { amount, currency, note } | null` (only populated when user has an active debt)

### D-09: Debt write path

Option: extend existing member update endpoint (PATCH `/members/:id`) to accept optional debt payload:

```
{ debt: { amount, currency, note } | null }
```

- If `debt` object is provided → upsert active debt row (D-03)
- If `debt: null` → soft-cancel active debt if any

Alternative: dedicated endpoints (POST `/members/:id/debts`, DELETE `/members/:id/debts/active`). Planner can decide based on existing route patterns in `el-templo-api/src/modules/members/routes.ts`, but the simpler "extend PATCH" option aligns with the single-form UX (MemberFormDialog saves everything in one submit).

### D-10: AlumnosPage filter bar layout

Current state: single row with 7 controls + buttons (file `el-templo-admin/src/pages/AlumnosPage.vue:7-121`), cramped. New layout:

**Row 1 (`row q-col-gutter-sm q-mb-sm items-end`):**

- Left: `q-input` search (wider — col-md-8 or col-md-9)
- Right: `q-btn` Export (icon) + `q-btn` Nuevo (primary)
- Use `justify-between` or analogous

**Row 2 (`row q-col-gutter-sm q-mb-md items-end`):**

- `q-select` Plan
- `q-select` Sucursal
- `q-select` Nivel
- `q-select` Estado
- `q-select` Segmento
- `q-select` Avatar
- **NEW**: `q-toggle` or chip "Solo deudores" (user preference: toggle/chip, not q-select — more discoverable)

### D-11: Conditional column + banner

When `filters.debtorOnly === true`:

- Show banner ABOVE the `q-table`: "Deuda total: ARS $X · USD $Y · ..." (one segment per currency returned). Hidden when toggle off.
- Add "Deuda" column to the `q-table` (visible only when toggle on). Column renders `row.debt.amount` formatted with `row.debt.currency`. Non-debtors (when toggle off and column hidden) are unaffected.
- Use the existing `formatPrice` utility being added in Phase 98 if it's merged; otherwise inline formatting (amount + currency code).

### D-12: MemberFormDialog fields (new section at bottom of form)

Add a "Deuda" section with:

- `q-toggle` "Deudor" (`v-model="form.isDebtor"`)
- Conditionally shown when toggle on (`v-if="form.isDebtor"`):
  - `q-input` type="number" "Monto adeudado" (integer, min 0)
  - `q-select` "Moneda" with options from country/currency scope (ARS, EUR, USD — align with Phase 98 currency enum if available)
  - `q-textarea` "Nota" rows=2 with placeholder: `"Aclarar de qué suscripción es la deuda (ej: debe $20000 de la mensualidad de abril)"`
- On submit, the form includes `debt: { amount, currency, note } | null` in the PATCH payload per D-09.

### D-13: Validation

- `amount` must be > 0 if toggle on (cannot flag as debtor with $0)
- `currency` must be a valid 3-char ISO code — reuse existing currency validation from Phase 98 if available
- `note` is optional (free text, reasonable max length, e.g., 500 chars)
- When toggle is off on submit: backend soft-cancels active debt (no amount/currency needed)

### D-14: Migration number

Phase 100 uses migrations 0092 and 0093. Phase 101 migration should be **0094_debts_table.sql**. Follow existing migration conventions in `el-templo-api/src/db/migrations/`. Commit the raw SQL migration alongside the Drizzle schema change (per CLAUDE.md rule).

### D-15: Tests

Per CLAUDE.md, new API routes require integration tests in `el-templo-api/test/`. Required coverage:

- Create debt via PATCH /members/:id (happy path)
- Update existing active debt (upsert semantics — verify only one active row exists after)
- Cancel debt via PATCH with `debt: null` (verify `is_cancelled = true, cancelled_at != null`)
- `GET /members?debtorOnly=true` returns only users with active debt
- `totalDebtByCurrency` sums correctly, grouped by currency, respects other filters (search, branchId, planId)
- Validation: amount <= 0 → 400, invalid currency → 400
- RBAC: only admin/owner roles can set debt (match existing member-edit permissions)

### D-16: Logging

Per CLAUDE.md, use Fastify's built-in Pino logger (`request.log`) in API. Never `console.log`. Frontend uses `createLogger()` from `src/utils/logger.ts`.

### D-17: No backwards-compat shims

The `totalDebtByCurrency` field is additive. Existing admin/app consumers of `GET /members` will simply ignore it. No feature flag, no version shim.

### Claude's Discretion

- Exact route structure (extend PATCH vs dedicated endpoints) — planner picks based on existing patterns
- Whether to create a dedicated `debts` module (`src/modules/debts/`) or put logic in `src/modules/members/` — planner decides based on code organization preferences, but since debt is always scoped to a member in v1, a sub-module under members may be cleaner
- Exact column widths in filter bar Row 1 (search vs. buttons) — tune visually
- Whether to use `q-toggle` vs `q-chip` for "Solo deudores" — planner picks, both are acceptable
- Banner styling (card vs. plain text) — align with existing admin banner patterns

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema and Migrations

- `el-templo-api/src/db/schema/subscriptions.ts` — pattern for service-enforced "one active per user" invariant + currency column
- `el-templo-api/src/db/schema/users.ts` — users table (FK target)
- `el-templo-api/src/db/schema/payments.ts` — reference for multi-currency/voidedAt pattern (do NOT modify in this phase)
- `el-templo-api/src/db/schema/index.ts` — add `export * from "./debts"`
- `el-templo-api/src/db/migrations/0091_multi_currency_and_country_scope.sql` — migration style reference
- `el-templo-api/src/db/run-migrations.ts` — custom migration runner (per CLAUDE.md)

### Members API

- `el-templo-api/src/modules/members/routes.ts` — existing CRUD routes + `listMembersSchema` patterns
- `el-templo-api/src/modules/members/schemas.ts` — request/response JSON schemas (line 102 is `listMembersSchema`)
- `el-templo-api/src/modules/members/service.ts` — `listMembers` at line 40 (main filter logic to extend with debtorOnly + totalDebtByCurrency sum query)
- `el-templo-api/src/modules/members/types.ts` — type definitions

### Admin Frontend

- `el-templo-admin/src/pages/AlumnosPage.vue` — filter bar is at lines 7-121 (Row 1/Row 2 split target); table starts at 124
- `el-templo-admin/src/components/MemberFormDialog.vue` — 775-line form; add "Deuda" section at the bottom
- `el-templo-admin/src/composables/useMembersApi.ts` — API client (extend with debtorOnly param + totalDebtByCurrency in response type)
- `el-templo-admin/src/types/member.ts` — Member type definition (add optional `debt` field)
- `el-templo-admin/src/pages/AlumnoDetailPage.vue` — optional: show red "DEUDOR · $X" chip (non-blocking for v1)

### Project Standards

- `CLAUDE.md` — no `any` types, no `console.log`, Pino for API, `createLogger()` for frontend, integration tests required for new API routes, commit migration SQL alongside schema changes
- `.planning/STATE.md` — project decisions and history

</canonical_refs>

<specifics>
## Specific Ideas

### Currency options for v1

Use AR/ES/US-friendly set: ARS (default), EUR, USD. Align with whatever Phase 98 (multi-currency) exposes — if Phase 98 has a shared enum/constants file for currency codes, reuse it.

### Filter interaction

The "Solo deudores" toggle is a **filter**, not a view mode. When on:

- Query: `WHERE EXISTS (debt active for user)` AND existing filters continue to apply
- Response includes: filtered member rows + `totalDebtByCurrency` aggregated over the filtered set + each row has populated `debt` field
- When off: toggle filter removed, totalDebtByCurrency still computed (over the filtered set, may be non-zero if some rows happen to have debts) but frontend doesn't display the banner/column.

### Upsert vs separate endpoints

Recommend extending PATCH `/members/:id` with optional `debt` payload field (D-09). This keeps the MemberFormDialog UX a single "Guardar" click that atomically saves member fields + debt state. If planner prefers separation, document why in the plan.

</specifics>

<deferred>
## Deferred Ideas

**To future accounting phase (not numbered yet):**

- Integration with `payments` table — payment records auto-decrement active debt
- Debt amount as partial payment tracker (amountPaid vs amountOwed columns)
- Audit log: who cancelled a debt and when (beyond `cancelled_at` timestamp)
- Multiple active debts per user
- "Historial de deudas" tab in AlumnoDetailPage
- Debt appearing in CajaPage, ReportesPage, AnaliticasPage
- Excel export with debt column
- Member-facing debt visibility (push notification, app banner "tenés una deuda pendiente")
- Bulk-cancel action for debts

**Optional (nice-to-have, planner's call if low-cost):**

- Red "DEUDOR · ARS $X" chip/badge on AlumnoDetailPage header when user has an active debt. Purely read-only visibility, no new endpoints needed (data is in member fetch response). If planner decides it's trivial, include it; otherwise defer.

</deferred>

---

_Phase: 101-debt-tracking-flag-members-with-outstanding-debt_
_Context gathered: 2026-04-21 via direct design conversation (discuss-phase skipped per user request)_
