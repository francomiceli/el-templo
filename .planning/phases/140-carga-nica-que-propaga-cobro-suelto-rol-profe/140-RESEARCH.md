# Phase 140: Carga única que propaga + cobro suelto + rol profe — Research

**Researched:** 2026-06-24
**Domain:** Fastify + Drizzle (MySQL) finance API + Quasar/Vue 3 admin PoS UI
**Confidence:** HIGH (all claims verified against live code in this session)

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Pantalla dedicada del coach "Cargar pago", **mobile-web estilo PoS** (botones grandes, ejecutar desde el celular en el mostrador). Restricción de diseño dominante para el UI-SPEC.
- **D-02:** **Renovar plan = autocompletar.** Buscar socio (typeahead nombre/DNI) → sistema pre-carga plan vigente + monto (editable) → medio de pago (caja se resuelve sola) → Confirmar. El coach NO elige plan a mano. Monto editable. Cambiar de plan = admin.
- **D-03:** **Cobro suelto = socio conocido + monto libre + concepto libre (texto) + medio de pago.** Entra a la caja (resuelta por medio de pago), **NO** renueva membresía, nace **PENDIENTE**, queda a nombre del socio con su concepto en el historial. **Sin schema de tabla nuevo.**
- **D-06:** "Profe" = rol **`coach`** existente. 140 agrega un permiso de CARGA acotado nuevo (`FINANCE_LOAD_ROLES = [...FINANCE_WRITE_ROLES, 'coach']`) que habilita SOLO el/los endpoint(s) de carga. **NO** se agrega coach a VOID/ADJUSTMENT/READ-completo.
- **D-07:** El coach **ve solo los pagos que él cargó** (hoy/recientes, historial de tickets PoS) + el dato del socio para autocompletar. **NO** ve: saldos de caja, cargas de otros coaches, la cola de validación, ni el resto del admin de finanzas. Puede requerir un read scoped.
- **D-08:** Todo lo que carga el coach nace **PENDIENTE** (derivado server-side del rol, nunca del cliente). El coach **no puede** validar/observar/anular (test de autorización CARGA-04 lo confirma).
- **D-09:** **Ticket único por confirmación** (idempotency key generado por el cliente). Mismo key repetido = no-op que devuelve el resultado existente; key nuevo = pasa. Persistir el key de forma única (migración **0156**). Toda la propagación en **una `db.transaction`** (CARGA-02).
- **D-10:** La "carga única" atómica **ya existe** (`subscriptions/service.ts` → `db.transaction` → activa sub → recompute → `recordAssignmentCharge(tx,...)` → `transactionService.create(input, adminId, tx)`). 140 reusa esto para "renovar plan"; el cobro suelto llama `transactionService.create` directo (sin sub). Activar membresía ≠ validar pago.

### Claude's Discretion

- `kind` exacto del cobro suelto (D-05) — **resuelto abajo: `advance_payment` reutilizado.**
- Almacenamiento del idempotency key (columna única vs tabla) — **resuelto abajo: columna única en `financial_transactions`.**
- Forma del autocompletar (endpoint socio → plan vigente + monto).
- REST shape de los endpoints de carga del coach + el read scoped de "mis cargas".
- Estructura de la pantalla PoS (componentes Quasar existentes, sin UI kit nuevo) — se fija en UI-SPEC.
- Cómo el coach selecciona caja en el ~1% de casos donde el default no aplica (probablemente: no lo hace, queda el default).

### Deferred Ideas (OUT OF SCOPE)

- Venta de producto / clase suelta / cobro anónimo (sin socio) → DESCARTADO.
- Modelado formal de deuda arrastrada → cubierto flojo por concepto libre.
- Cambio de plan desde la pantalla del coach → admin / fase futura.
- Reportes / bandeja de pendientes / saldos visibles → fase 141.
- Config / perillas → fase 142.
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID       | Description                                                                                                        | Research Support                                                                                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CARGA-01 | Profe registra pago desde UI dead-simple (socio, monto, medio, caja) sin re-tipear                                 | Reuses `/admin/members/search` (coach-accessible today) for typeahead + new autocompletar read endpoint + new thin load endpoints. Caja resuelta server-side (138).                                               |
| CARGA-02 | Un solo registro propaga atómicamente en una db.transaction (idempotente): activa/renueva membresía + impacta caja | "Renovar plan" reuses the EXISTING `renewSubscription` db.transaction → `recordAssignmentCharge` → `transactionService.create(...,tx)`. Idempotency key dedupes the WHOLE tx via unique column + catch-duplicate. |
| CARGA-03 | Cobros sueltos (pago no atado a membresía) desde la misma UI                                                       | `transactionService.create` with `kind='advance_payment'`, `links: []` (already in `KINDS_ALLOWED_WITHOUT_LINKS`), concepto en `notes`. No schema-table change.                                                   |
| CARGA-04 | Rol profe con permisos acotados: carga (→ PENDIENTE), NO valida ni anula                                           | New `FINANCE_LOAD_ROLES = [...FINANCE_WRITE_ROLES, 'coach']` gating ONLY the new load endpoints. Coach stays OUT of FINANCE_VOID/ADJUSTMENT/READ. Auth test proves 403 on validate/void/list/summary.             |

</phase_requirements>

## Summary

The atomic "carga única" the brief describes **already exists and is battle-tested** in two methods of `subscriptions/service.ts`: `assignPlan` and `renewSubscription`. Both open a single `this.db.transaction(async (tx) => {...})`, insert/activate the subscription, recompute user status, and call the private `recordAssignmentCharge(tx, {...})`, which in turn calls `transactionService.create(input, adminId, tx)` on the SAME tx handle. Phase 137 already wired `recorderRole?: AdminRole` into `recordAssignmentCharge` — when `recorderRole === 'coach'` the charge is born `validation_status='pendiente'`; otherwise `'validado'`. Phase 138 already auto-resolves `cash_register_id` server-side inside `transactionService.create` from `paymentMethod`/`branchId`/`currency`. **So the propagation machinery is complete.** What is missing for 140 is: (1) plumbing `recorderRole` from the HTTP layer down through `renewSubscription`/`assignPlan` into `recordAssignmentCharge` (today neither method accepts or passes it — the only caller path that births a pendiente is the direct `POST /finance/transactions` route, gated to non-coach today); (2) idempotency dedup; (3) the new scoped coach endpoints + permission; (4) the cobro-suelto thin endpoint; (5) the Quasar PoS screen.

For the **cobro-suelto kind (D-05)**, reuse the existing `kind='advance_payment'`: it is already in `KINDS_ALLOWED_WITHOUT_LINKS` (so an empty `links: []` is accepted), it is NOT `adjustment` (so it does not require `FINANCE_ADJUSTMENT_ROLES`), and — critically — `getSummary` (the 6 v5.0 metrics' revenue read) already special-cases revenue by `direction='inflow' + firmMoney + kind NOT IN (cash_transfer, expense)`, so an `advance_payment` PENDIENTE does **not** count toward firm revenue until an admin validates it, exactly like a coach plan charge. A new enum value (`misc_charge`) is unnecessary, would require an enum migration with the byte-for-byte ordering risk, and would force edits to `getSummary`'s fixed `revenueByKind` record. **Recommendation: reuse `advance_payment`, concept goes in `notes`.**

For **idempotency (D-09)**, add a nullable unique column `idempotency_key VARCHAR(64)` to `financial_transactions` (migration 0156, hand-written). The dedup is made atomic by relying on the UNIQUE constraint: the coach load endpoint passes the client key through to `create`; on `ER_DUP_ENTRY` the service catches the duplicate and returns the existing row (a true no-op). Because the key lives on the charge row that is created INSIDE the renewal `db.transaction`, a duplicate key collision rolls back the ENTIRE renewal (sub activation + charge), which is exactly the "dedupe the whole atomic operation" requirement. A separate idempotency table is more moving parts for no benefit here, since every load produces exactly one charge row to key on.

**Primary recommendation:** Build two thin coach-facing API surfaces — a renovar-plan load (reuses `renewSubscription` with `recorderRole='coach'` + idempotency key) and a cobro-suelto load (`transactionService.create` with `kind='advance_payment'`, empty links, `recorderRole='coach'`) — plus a scoped read (member current-plan-for-autocompletar + "mis cargas"), all gated by a new `FINANCE_LOAD_ROLES`. Front: a new `CargarPagoPage.vue` (route `meta.allowedRoles` includes `coach`), Pinia + `useFinanceLoadApi` composable over `boot/axios`.

## Architectural Responsibility Map

| Capability                                     | Primary Tier                                         | Secondary Tier                                  | Rationale                                                   |
| ---------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| Atomic propagation (sub + charge + balance)    | API / Backend (`subscriptions/service.ts` tx)        | Database (tx isolation)                         | Already lives here; must not move to client                 |
| Caja resolution from paymentMethod             | API (`CashRegisterService.resolveCashRegister`, 138) | —                                               | Single choke-point, server-derived, never from body         |
| Role → validation_status derivation            | API (server-side, `recordAssignmentCharge` + route)  | —                                               | Never trust client (137 established)                        |
| Idempotency dedup                              | API + Database (UNIQUE constraint)                   | Client (key generation)                         | Client generates key; server enforces uniqueness atomically |
| Autocompletar (member's current plan + amount) | API (read endpoint over subscriptions)               | Client (typeahead)                              | Coach must not have full FINANCE_READ; needs a scoped read  |
| Coach permission gating                        | API (`FINANCE_LOAD_ROLES` guard)                     | Client (route `allowedRoles` guard for UX only) | Server is the source of truth; client guard is convenience  |
| PoS screen (typeahead, big buttons, confirm)   | Frontend (`el-templo-admin` Quasar/Vue)              | —                                               | Mobile-web, coach-facing                                    |

## Standard Stack

No new dependencies. Everything reuses existing in-repo modules (CLAUDE.md: "Cero dependencias nuevas"; MEMORY: never install deps without asking).

### Core (existing, reused verbatim)

| Module                                                            | Location                              | Purpose                                                                             | Why Standard                                        |
| ----------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| `SubscriptionService.renewSubscription`                           | `subscriptions/service.ts:3189`       | Atomic renew: new period sub + `recordAssignmentCharge(tx,…,flow:'renew')`          | The exact "carga única" for renovar-plan (D-10)     |
| `SubscriptionService.recordAssignmentCharge` (private)            | `subscriptions/service.ts:249`        | Charge inside the caller's tx; already has `recorderRole?` → coach births pendiente | 137 pre-wired the role→status                       |
| `TransactionService.create(input, recordedBy, tx?)`               | `finance/transaction-service.ts:127`  | Single insert site; auto-resolves caja (138), derives status (137)                  | The only place a financial_transaction is born      |
| `CashRegisterService.resolveCashRegister(pm, branchId, currency)` | `finance/cash-register-service.ts:48` | Server-side caja resolution                                                         | 138 choke-point, REUSE — do not reinvent            |
| `GET /admin/members/search`                                       | `members/routes.ts:369`               | Typeahead by name/DNI; `MEMBER_ROLES` includes coach already                        | Coach can already call it — autocompletar typeahead |
| `SubscriptionService.getMemberSubscription(userId)`               | `subscriptions/service.ts:558`        | Current active/paused sub + planName + pricePaid                                    | Source for autocompletar (plan vigente + monto)     |

### Supporting (frontend, existing patterns)

| Asset                               | Location                                                           | Purpose                                            |
| ----------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------- |
| `boot/axios` `api` instance         | `el-templo-admin/src/boot/axios.ts`                                | All composables call `api.get/post`                |
| `extractError`                      | `src/utils/extract-error.ts`                                       | Error message extraction in composables            |
| `useTransactionsApi.ts` (reference) | `src/composables/`                                                 | Composable shape to mirror for `useFinanceLoadApi` |
| Route guard                         | `src/router/index.ts:24` `beforeEach` reads `to.meta.allowedRoles` | Add coach to the new route's `allowedRoles`        |

### Alternatives Considered

| Instead of                                    | Could Use                                                       | Tradeoff                                                                                                                                                                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kind='advance_payment'` for cobro suelto     | New enum value `misc_charge`                                    | Enum migration + byte-for-byte order risk + edits to `getSummary` fixed record. Rejected (no existing kind blocked us).                                                                                                                                |
| Unique column `idempotency_key`               | Separate `idempotency_keys` table                               | More moving parts; every load yields exactly one charge row to key on. Rejected.                                                                                                                                                                       |
| Plumb `recorderRole` through renew/assign     | Coach calls `POST /finance/transactions` directly with sub link | That route is gated to `FINANCE_WRITE_ROLES` (coach excluded) and does NOT do the renewal (new period + budget + bookings). Rejected — the renewal logic must run.                                                                                     |
| New coach endpoints under `finance/routes.ts` | Reuse `subscriptions/routes.ts` renew endpoint with coach role  | The subscriptions module guard is `SUBSCRIPTION_ROLES` (already includes coach!) but exposes assign/cancel/pause too. A dedicated thin coach surface is cleaner and easier to lock down for CARGA-04. Recommend new endpoints (see Open Questions Q1). |

**Installation:** none. `npx tsc --noEmit` for typecheck (no `pnpm typecheck` script). Tests run in CI on push to staging (MEMORY: no local suite run).

## Package Legitimacy Audit

Not applicable — this phase installs **zero** external packages. All work reuses in-repo modules. (Slopcheck gate skipped: no new dependencies to verify.)

## Architecture Patterns

### System Architecture Diagram — renovar-plan load (CARGA-01/02)

```
Coach PoS screen (CargarPagoPage.vue)
  │  typeahead → GET /admin/members/search?search=  (coach already allowed)
  │  on pick → GET <autocompletar endpoint>/:userId  → { planName, amount, currency }
  │  coach edits amount (optional), picks paymentMethod, taps Confirmar
  │  client generates idempotencyKey (crypto.randomUUID) ONCE per confirm
  ▼
POST <coach renovar load endpoint>
  body: { userId, amountReceived, paymentMethod, idempotencyKey }
  guard: FINANCE_LOAD_ROLES (coach ∈)             ← CARGA-04
  ▼
SubscriptionService.renewSubscription(userId, { ...input, recorderRole:'coach', idempotencyKey }, coachId)
  ▼  this.db.transaction(async (tx) => {           ← CARGA-02 atomic
       close old sub (if expired) / schedule new period
       INSERT subscriptions (new period, fresh budget, bookings)
       recomputeUserStatus(tx)
       recordAssignmentCharge(tx, { …, recorderRole:'coach', idempotencyKey })
         └─ transactionService.create(input{validationStatus:'pendiente', idempotencyKey}, coachId, tx)
              ├─ resolveCashRegister(paymentMethod, branchId, currency)   ← 138
              ├─ INSERT financial_transactions  (UNIQUE idempotency_key)  ← dedup point
              ├─ INSERT transaction_links (subscription)
              └─ balanceService.applyDelta(tx, row, links, +1)
     })  ← on ER_DUP_ENTRY: whole tx rolls back; service returns existing charge (no-op)
  ▼
201 { subscription, transaction }   (or the existing one on duplicate key)
```

### System Architecture Diagram — cobro suelto (CARGA-03)

```
Coach PoS screen → "Cobro suelto" mode
  typeahead pick socio → enter monto libre + concepto libre + paymentMethod
  client generates idempotencyKey
  ▼
POST <coach cobro-suelto load endpoint>
  body: { memberId, amount, concepto, paymentMethod, currency, idempotencyKey }
  guard: FINANCE_LOAD_ROLES
  ▼
transactionService.create(
  { memberId, kind:'advance_payment', direction:'inflow', amount, currency,
    paymentMethod, transactionDate:today, effectiveDate:today,
    branchId: <member's branchId>, notes: concepto,
    validationStatus:'pendiente', idempotencyKey, links: [] },   ← empty links OK (advance_payment ∈ KINDS_ALLOWED_WITHOUT_LINKS)
  coachId)                                                       ← opens its own db.transaction
  ├─ resolveCashRegister(...)   → caja
  ├─ INSERT financial_transactions  (UNIQUE idempotency_key)
  └─ applyDelta (no-op for empty links → does not touch member balance)
  ▼
201 { transaction }   (PENDIENTE, no subscription touched)
```

### Recommended Structure (deltas only)

```
el-templo-api/src/
├── db/migrations/0156_idempotency_key.sql           # NEW (hand-written)
├── db/schema/financial-transactions.ts              # +idempotencyKey column + unique index
├── modules/shared/permissions.ts                    # +FINANCE_LOAD_ROLES
├── modules/finance/types.ts                         # +idempotencyKey? on CreateTransactionInput
├── modules/finance/transaction-service.ts           # persist idempotencyKey + catch dup
├── modules/finance/routes.ts                        # +coach load endpoints (or new coach-load/routes.ts)
├── modules/subscriptions/service.ts                 # renewSubscription accepts recorderRole + idempotencyKey
└── test/finance/coach-load.test.ts                  # NEW (auth + idempotency + autocompletar)

el-templo-admin/src/
├── pages/CargarPagoPage.vue                          # NEW PoS screen
├── composables/useFinanceLoadApi.ts                  # NEW
├── stores/ (optional thin store if state shared)
└── router/routes.ts                                  # +route, meta.allowedRoles includes 'coach'
```

### Pattern 1: Server-side role → validation_status (137, reused)

**What:** Never read `validation_status` from the request body. Derive from `request.user.role`.
**Example (existing, finance/routes.ts:283):**

```typescript
const initialStatus = (["coach"] as readonly string[]).includes(
  request.user.role,
)
  ? "pendiente"
  : "validado";
```

For the coach load endpoints, the role IS coach, so always `'pendiente'` — but still derive it from the authenticated role, not a literal, so a future admin-callable variant stays correct.

### Pattern 2: Idempotency via UNIQUE + catch-duplicate (atomic with the tx)

**What:** Client generates a key per Confirmar; server makes it unique; a retry is a no-op.
**Example (sketch — to implement in `transaction-service.ts`):**

```typescript
// inside create(), wrapping the INSERT, when input.idempotencyKey is set:
try {
  // ...existing INSERT financial_transactions with idempotency_key...
} catch (err: unknown) {
  if (
    err instanceof Error &&
    /ER_DUP_ENTRY/.test(err.message) &&
    input.idempotencyKey
  ) {
    // Re-read the existing row by key and return it — true no-op (D-09).
    const [existing] = await this.db
      .select()
      .from(schema.financialTransactions)
      .where(
        eq(schema.financialTransactions.idempotencyKey, input.idempotencyKey),
      )
      .limit(1);
    if (existing) {
      /* re-read links, return TransactionDetail */
    }
  }
  throw err;
}
```

**Note (atomicity subtlety):** The dedup re-read must run OUTSIDE the failed tx (the tx is rolled back on the duplicate). For the renovar-plan path this means: the renewal tx fails on the dup key → whole renewal rolls back (correct, the sub already exists from the first call) → the endpoint catches the dup and returns the existing charge + its already-active subscription. The cleanest seam is to catch `ER_DUP_ENTRY` at the **endpoint level** (where you can re-read both the existing charge AND the existing subscription) rather than swallow it deep inside `recordAssignmentCharge`. Verify the exact error shape MySQL/mysql2 throws (Open Question Q3).

### Pattern 3: Thin endpoint reusing the facade (139 precedent)

The 139 movement/expense routes are pure thin handlers: RBAC check → scope check → `service.method(...)` → 201. Mirror that shape for the coach load endpoints.

### Anti-Patterns to Avoid

- **Re-implementing renewal logic in a new coach endpoint.** Reuse `renewSubscription` — it handles new-period dates, fresh class budget, schedule copy, bookings, status recompute, and price inheritance (caso Pomilio override carry-over). Do not duplicate.
- **Adding coach to `FINANCE_WRITE_ROLES`.** That widens the existing `POST /finance/transactions` and would let coach post arbitrary kinds. Use a NEW `FINANCE_LOAD_ROLES` on NEW endpoints only.
- **Letting the client send `validationStatus` or `cashRegisterId`.** Both are server-derived (137/138). Route schema must NOT accept them.
- **`;` inside SQL comments in 0156** (MEMORY: the runner splits on `;` before stripping `--`). Use periods or em-dashes.
- **`drizzle-kit push/migrate`.** Hand-write 0156; `_migrations` table is the source of truth (CLAUDE.md).

## Don't Hand-Roll

| Problem                        | Don't Build                           | Use Instead                                                      | Why                                                              |
| ------------------------------ | ------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| Atomic sub-activation + charge | A new transaction block               | `renewSubscription` (D-10)                                       | Already atomic, tested, handles budget/bookings/price-carry-over |
| Caja selection                 | Client caja picker / new resolver     | `resolveCashRegister` (138)                                      | Single choke-point; currency guard built in                      |
| Role → pendiente/validado      | Client-sent status / new branch       | `recordAssignmentCharge` `recorderRole` (137) + route derivation | Server-side, already wired                                       |
| Member typeahead               | New search endpoint                   | `GET /admin/members/search`                                      | Coach already authorized (MEMBER_ROLES)                          |
| Empty-links charge             | Schema change / fake link             | `kind='advance_payment'` (∈ KINDS_ALLOWED_WITHOUT_LINKS)         | `create()` already accepts empty links for this kind             |
| Idempotency                    | Heuristic (member+amount+time window) | UNIQUE column + catch-dup                                        | Robust ticket-key per D-09 (no false dedups)                     |

**Key insight:** Phases 137 + 138 deliberately pre-wired the two hardest pieces (`recorderRole` and `cash_register_id` resolution). 140 is mostly **wiring an HTTP surface + a screen + one migration**, not new financial logic.

## Runtime State Inventory

> Phase 140 is **additive** (new columns/endpoints/screen). It renames nothing and migrates no existing rows. Still verified each category:

| Category            | Items Found                                                                                                                              | Action Required                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Stored data         | New nullable `idempotency_key` column on `financial_transactions`; all existing rows get NULL. No existing data is renamed or rewritten. | None (additive migration 0156) |
| Live service config | None — verified: no external service stores any string this phase changes.                                                               | None                           |
| OS-registered state | None — verified: no scheduler/pm2/systemd entries reference anything renamed.                                                            | None                           |
| Secrets/env vars    | None — verified: no new secrets; no `.env` change.                                                                                       | None                           |
| Build artifacts     | None — verified: no package rename; admin/api both rebuild from source on deploy.                                                        | None                           |

**The canonical question (post-merge):** No runtime system caches an old string — the only persistent change is one new nullable column, backfilled NULL by definition.

## Common Pitfalls

### Pitfall 1: `recorderRole` is NOT currently passed by renew/assign

**What goes wrong:** A plan assumes `renewSubscription` already forwards the coach role to the charge. It does not — `renewSubscription` (service.ts:3462) calls `recordAssignmentCharge` with `flow:'renew'` but **no `recorderRole`**, so today it always births `'validado'`.
**Why it happens:** 137 added the `recorderRole?` param to `recordAssignmentCharge` but only the direct `POST /finance/transactions` route exercises the pendiente path; the 4 internal callers intentionally omit it.
**How to avoid:** Plan a task to thread `recorderRole?: AdminRole` through `RenewSubscriptionInput` (or a separate service-arg) → `renewSubscription` → `recordAssignmentCharge(tx, { …, recorderRole })`. Default stays undefined → admin path unchanged.
**Warning signs:** Coach renewal charge comes out `validado` in the idempotency/autocompletar test.

### Pitfall 2: cobro-suelto `advance_payment` polluting v5.0 revenue

**What goes wrong:** Fear that a cobro suelto inflates the 6 management metrics.
**Why it doesn't (verified):** `getSummary` filters `direction='inflow' AND firmMoneyConditions() AND kind NOT IN (cash_transfer, expense)`. `firmMoneyConditions()` requires `validation_status='validado'`. A coach cobro suelto is born `'pendiente'`, so it is excluded until an admin validates it — at which point it IS real revenue and SHOULD count (it's money the member paid). No double-count: there's no subscription link, so `balances`/Reporte Deudas is untouched (`applyDelta` no-ops on empty links). **Confirm in the summary-sanity test that a pendiente advance_payment does not move `monthlyRevenue`.**
**Warning signs:** `revenueByKind.advance_payment` changes while the charge is still pendiente.

### Pitfall 3: Idempotency dedup inside a rolled-back tx

**What goes wrong:** Catching `ER_DUP_ENTRY` and re-reading the existing row using the SAME `tx` handle — but the tx is already aborted, so the read fails.
**How to avoid:** Re-read with `this.db` (a fresh connection) AFTER the tx unwinds, ideally at the endpoint layer. For the renovar path, also re-read the existing subscription so the response shape matches a first-time success.
**Warning signs:** Second identical confirm throws 500 instead of returning the original 201 payload.

### Pitfall 4: branchId for cobro suelto

**What goes wrong:** A cobro suelto needs a `branchId` to resolve a `cash` caja (resolveCashRegister throws on null branch for cash). The coach screen doesn't ask for a branch.
**How to avoid:** Derive `branchId` server-side from the member's `users.branchId` (mirror of `renewSubscription`'s renewBranchId resolution at service.ts:3311, including the "Templo Online" virtual fallback). For transfer/card the caja is by-currency so branch is irrelevant; for cash the member's branch is the right caja.
**Warning signs:** "No se puede resolver la caja efectivo sin sucursal" on a cash cobro suelto.

### Pitfall 5: 0156 migration interactive-prompt trap

**What goes wrong:** Running `pnpm db:generate` to author 0156 hangs on the pre-existing `sessions.goal_plan_type` drift (same reason 0153/0154/0155 were hand-written).
**How to avoid:** Hand-write 0156 following the 0153/0155 header style. Commit the SQL (MEMORY: always commit migration SQL).

## Code Examples

### Idempotency column (schema delta — `financial-transactions.ts`)

```typescript
// after `notes: text("notes"),`
idempotencyKey: varchar("idempotency_key", { length: 64 }),   // nullable; UNIQUE via index below
// in the table-extras array:
uniqueIndex("uq_financial_tx_idempotency_key").on(table.idempotencyKey),
```

> MySQL allows multiple NULLs in a UNIQUE index, so historical/admin rows with NULL key never collide. Import `uniqueIndex` from `drizzle-orm/mysql-core` (already importing `index`).

### Migration 0156 (hand-written, no `;` in comments)

```sql
-- Phase 140-XX — idempotency_key on financial_transactions (CARGA-02, D-09)
-- Hand-written: db:generate hits the pre-existing sessions.goal_plan_type drift
-- (same reason 0153/0154/0155 were hand-written). NEVER drizzle-kit push/migrate.
-- Additive and non-destructive  the column is nullable, every existing row gets NULL.
-- A UNIQUE index on a nullable column permits unlimited NULLs in MySQL, so historical
-- and admin-path rows never collide  only coach loads carrying a real key dedupe.

ALTER TABLE `financial_transactions`
  ADD COLUMN `idempotency_key` varchar(64) NULL AFTER `notes`;

ALTER TABLE `financial_transactions`
  ADD UNIQUE INDEX `uq_financial_tx_idempotency_key` (`idempotency_key`);
```

### New permission (`shared/permissions.ts`)

```typescript
/** Roles that can use the coach PoS load endpoints (carga → PENDIENTE).
 *  = FINANCE_WRITE_ROLES + coach. Gates ONLY the coach load endpoints — NOT
 *  void/adjustment/full-read (coach stays excluded there for privacy, D-06). */
export const FINANCE_LOAD_ROLES = [...FINANCE_WRITE_ROLES, "coach"] as const;
```

### Coach load endpoint skeleton (mirror 139 thin-handler)

```typescript
fastify.post<{ Body: CoachRenewLoadInput }>(
  "/coach-load/renew",
  { schema: coachRenewLoadSchema },
  async (request, reply) => {
    try {
      if (
        !(FINANCE_LOAD_ROLES as readonly string[]).includes(request.user.role)
      ) {
        return reply
          .code(403)
          .send({ error: "Acceso denegado", message: "Sin permiso de carga" });
      }
      // server-derive role→status downstream; pass recorderRole through.
      const result = await subscriptionService.renewSubscription(
        request.body.userId,
        {
          paymentMethod: request.body.paymentMethod,
          amountReceived: request.body.amountReceived,
          recorderRole: request.user.role, // ← coach → pendiente
          idempotencyKey: request.body.idempotencyKey,
        },
        request.user.userId,
      );
      return reply.code(201).send(result);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "coach renew load");
    }
  },
);
```

### Frontend composable (mirror `useTransactionsApi`)

```typescript
// useFinanceLoadApi.ts
import { ref } from "vue";
import { api } from "src/boot/axios";
import { extractError } from "src/utils/extract-error";

export function useFinanceLoadApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function getAutocompletar(userId: number) {
    /* api.get(`/admin/finance/coach-load/autocompletar/${userId}`) */
  }
  async function renewLoad(body: CoachRenewLoadInput) {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post("/admin/finance/coach-load/renew", body);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, "Error al cargar el pago");
      throw err;
    } finally {
      loading.value = false;
    }
  }
  async function miscCharge(body: CoachMiscChargeInput) {
    /* ... */
  }
  function cleanup() {
    loading.value = false;
    error.value = null;
  }
  return { loading, error, getAutocompletar, renewLoad, miscCharge, cleanup };
}
```

> Composables expose `cleanup()`, no `onUnmounted` inside (CLAUDE.md). Client generates `idempotencyKey` with `crypto.randomUUID()` once per Confirmar tap (regenerate only on a new deliberate load).

## State of the Art

| Old Approach                  | Current Approach                                  | When      | Impact                                                 |
| ----------------------------- | ------------------------------------------------- | --------- | ------------------------------------------------------ |
| Charge born `validado` always | `validation_status` axis; role→status server-side | Phase 137 | Coach load can be PENDIENTE without UPDATE             |
| Front picks caja              | `resolveCashRegister` server-side                 | Phase 138 | Coach screen never picks caja (D-02)                   |
| `kind` had 5 values           | +`cash_transfer`, `+expense`                      | Phase 139 | Confirms enum-extension precedent (but 140 needs none) |

**Deprecated/outdated:** none relevant.

## Assumptions Log

| #   | Claim                                                                                                                                                                                                | Section                   | Risk if Wrong                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A1  | mysql2 surfaces a unique-violation as an `Error` whose message/`code` contains `ER_DUP_ENTRY` (1062)                                                                                                 | Pitfall 3 / Code Examples | Dedup catch fails to match; retry 500s instead of no-op. **Verify the exact error shape in the test (Q3).**                    |
| A2  | Reusing `renewSubscription` for the coach renovar path needs only `recorderRole` + `idempotencyKey` added; its existing guards (no scheduled renewal, current sub found) are acceptable coach-facing | Carga chain               | If a coach hits "Ya existe una renovacion programada", the PoS UX must surface it cleanly. Confirm copy in UI-SPEC.            |
| A3  | A nullable UNIQUE column with multiple NULLs is the desired MySQL behavior (only keyed rows dedupe)                                                                                                  | Migration 0156            | If a non-null DEFAULT were required, design changes. Verified MySQL semantics, but confirm against the test DB engine/version. |

## Open Questions

1. **Where do the coach load endpoints live — `finance/routes.ts` or a new `finance/coach-load-routes.ts`?**
   - What we know: `finance/routes.ts` has a module-level `FINANCE_READ_ROLES` guard (coach excluded) — mounting coach endpoints there means they'd be blocked by the module hook before the per-handler `FINANCE_LOAD_ROLES` check ever runs.
   - What's unclear: simplest mounting point that keeps the module guard intact.
   - Recommendation: **new plugin `coach-load-routes.ts`** with its own `onRequest` hook (`authenticate` + `FINANCE_LOAD_ROLES` + `attachCountryScope`), mounted at `/api/admin/finance/coach-load`. Avoids weakening the existing finance module guard. Planner should make this a first task.

2. **Autocompletar read shape.**
   - `getMemberSubscription(userId)` already returns `planName`, `pricePaid`, `currency` for the current active/paused sub. A thin `GET /coach-load/autocompletar/:userId` can return `{ planName, amount: pricePaid, currency, hasRenewable: boolean }`. Recommendation: reuse `getMemberSubscription`; no new service method.

3. **Exact mysql2 duplicate-key error signature** (A1) — resolve empirically in the idempotency test (insert twice with same key, assert second call returns the first row, not a 500). The test is the verification.

4. **"Mis cargas" read scope.**
   - `transactionService.list` filters don't include `recordedBy`. For D-07 ("only the payments the coach loaded"), add a `recordedBy?` filter to `TransactionListFilters` + `buildListConditions`, and a scoped `GET /coach-load/mis-cargas` that forces `recordedBy = request.user.userId` (server-side, never from query). Keep it minimal — only fields the PoS ticket history needs.

## Environment Availability

| Dependency               | Required By                  | Available | Version | Fallback |
| ------------------------ | ---------------------------- | --------- | ------- | -------- |
| MySQL `eltemplo_test`    | Integration tests            | ✓ (CI)    | —       | —        |
| Node/TypeScript `tsc`    | `npx tsc --noEmit` typecheck | ✓         | —       | —        |
| Quasar/Vue 3 admin build | PoS screen                   | ✓         | —       | —        |

No missing dependencies. (Tests + typecheck run in CI on push to staging per MEMORY.)

## Validation Architecture

### Test Framework

| Property           | Value                                                                |
| ------------------ | -------------------------------------------------------------------- |
| Framework          | Vitest (API integration tests against real MySQL `eltemplo_test`)    |
| Config file        | `el-templo-api/vitest.config.*` (existing)                           |
| Quick run command  | `cd el-templo-api && npx vitest run test/finance/coach-load.test.ts` |
| Full suite command | runs in CI on push to staging (MEMORY: no local full-suite run)      |
| Typecheck          | `cd el-templo-api && npx tsc --noEmit` (no `pnpm typecheck` script)  |

### Phase Requirements → Test Map

| Req ID   | Behavior                                                                                                        | Test Type          | Automated Command                                          | File Exists? |
| -------- | --------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------- | ------------ |
| CARGA-04 | coach can load (201); coach 403 on validate/void/observe/list/summary                                           | integration (auth) | `npx vitest run test/finance/coach-load.test.ts -t "auth"` | ❌ Wave 0    |
| CARGA-02 | same idempotencyKey twice → one charge row, second returns existing (no dup)                                    | integration        | `... -t "idempotency"`                                     | ❌ Wave 0    |
| CARGA-02 | coach renew → new sub period active + charge born `pendiente`                                                   | integration        | `... -t "renew"`                                           | ❌ Wave 0    |
| CARGA-01 | autocompletar returns current plan name + amount + currency                                                     | integration        | `... -t "autocompletar"`                                   | ❌ Wave 0    |
| CARGA-03 | cobro suelto → advance_payment pendiente, empty links, balance untouched, NOT in summary revenue until validado | integration        | `... -t "cobro suelto"`                                    | ❌ Wave 0    |

### Sampling Rate

- **Per task commit:** `npx tsc --noEmit` (fast, local).
- **Per wave merge:** the new `coach-load.test.ts` (and `summary-sanity` regression for Pitfall 2).
- **Phase gate:** CI green on push to staging.

### Wave 0 Gaps

- [ ] `el-templo-api/test/finance/coach-load.test.ts` — covers CARGA-01..04 (reuse `createStaffUser({role:'coach'})`, `getAuthToken`, `ensureEfectivoCaja`, `createTestMember`, `assignTestPlan` from `test/helpers.ts`).
- [ ] Extend `summary-sanity.test.ts` (or assert within coach-load test) that a pendiente `advance_payment` does NOT move `monthlyRevenue` (Pitfall 2).
- [ ] No framework install needed (Vitest + helpers already present).

## Security Domain

> `security_enforcement` not explicitly false → included.

### Applicable ASVS Categories

| ASVS Category             | Applies | Standard Control                                                                                                                                               |
| ------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1 Architecture           | yes     | Server-side trust boundary: role→status, caja resolution, branchId, validationStatus all derived server-side (never body)                                      |
| V4 Access Control         | yes     | `FINANCE_LOAD_ROLES` gates load only; coach stays out of VOID/ADJUSTMENT/READ; country scope via `attachCountryScope`; "mis cargas" forces `recordedBy = self` |
| V5 Input Validation       | yes     | Fastify JSON schema on new endpoints; reject `validationStatus`/`cashRegisterId` in body; bound `amount >= 0`                                                  |
| V6 Cryptography           | no      | No new crypto; idempotency key is an opaque client UUID, not a secret                                                                                          |
| V7 Error Handling/Logging | yes     | Pino `request.log` (CLAUDE.md: never console.log); structured logs in service                                                                                  |

### Known Threat Patterns for Fastify + Drizzle + role-based admin

| Pattern                                                       | STRIDE                 | Standard Mitigation                                                                                                    |
| ------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Coach escalates to validate/void by calling finance endpoints | Elevation of Privilege | New endpoints under their own guard; coach NOT added to FINANCE_VOID/ADJUSTMENT; **explicit 403 auth test (CARGA-04)** |
| Coach forges `validation_status='validado'` in body           | Tampering              | Server derives status from `request.user.role`; route schema rejects the field                                         |
| Coach reads other coaches' loads or caja saldos               | Information Disclosure | "mis cargas" forces `recordedBy=self`; no saldos endpoint exposed to coach                                             |
| Replay / double-tap creates duplicate charge                  | Tampering              | Idempotency key UNIQUE + catch-dup (CARGA-02)                                                                          |
| Cross-country load                                            | Elevation/Disclosure   | `attachCountryScope` + member's branch country guard (mirror existing finance routes)                                  |

## Sources

### Primary (HIGH confidence — read in this session)

- `el-templo-api/src/modules/subscriptions/service.ts` — `recordAssignmentCharge` (249), `assignPlan` (823), `renewSubscription` (3189) — the atomic carga chain + recorderRole wiring.
- `el-templo-api/src/modules/finance/transaction-service.ts` — `create(input, recordedBy, tx?)` (127), `KINDS_ALLOWED_WITHOUT_LINKS` (58), `getSummary` firm-money + kind filter (1224).
- `el-templo-api/src/modules/finance/cash-register-service.ts` — `resolveCashRegister` (48).
- `el-templo-api/src/modules/shared/permissions.ts` — FINANCE\_\* role sets; coach exclusion.
- `el-templo-api/src/db/schema/financial-transactions.ts` — kind/validation_status enums, indexes.
- `el-templo-api/src/modules/finance/routes.ts` — thin-handler RBAC pattern; server-side status derivation (283); module guard (181).
- `el-templo-api/src/modules/finance/types.ts` — `CreateTransactionInput` (57) incl. `validationStatus?`, `cashRegisterId?`.
- `el-templo-api/src/modules/subscriptions/routes.ts` — assign (262) / renew (514) endpoints; `SUBSCRIPTION_ROLES` guard.
- `el-templo-api/src/modules/subscriptions/types.ts` — `RenewSubscriptionInput` (260), `AssignPlanInput` (225).
- `el-templo-api/src/modules/members/routes.ts` — `/search` typeahead (369), `MEMBER_ROLES` guard (97).
- `el-templo-api/src/db/migrations/0153/0155*.sql` — hand-written migration precedent.
- `el-templo-api/test/helpers.ts` — `createStaffUser`, `getAuthToken`, `ensureEfectivoCaja`, etc.
- `el-templo-admin/src/router/routes.ts`, `router/index.ts`, `composables/useTransactionsApi.ts` — front route guard + composable pattern.
- `.planning/research/modulo-contable/ARCHITECTURE.md` § Punto 4 + Endpoint de cobro suelto.
- `.planning/REQUIREMENTS.md`, `140-CONTEXT.md`.

### Secondary

- MySQL UNIQUE-on-nullable semantics (multiple NULLs allowed) — standard MySQL behavior (verify against test DB in Wave 0).

## Metadata

**Confidence breakdown:**

- Standard stack (reused modules): HIGH — every reused method read line-by-line.
- Carga-única call chain: HIGH — traced assign + renew + recordAssignmentCharge + create end to end.
- Cobro-suelto kind: HIGH — `advance_payment` ∈ KINDS_ALLOWED_WITHOUT_LINKS confirmed; getSummary exclusion confirmed.
- Idempotency: MEDIUM-HIGH — design is sound; the only unverified detail is mysql2's exact dup-key error shape (A1/Q3, resolved by the test).
- Coach permission: HIGH — FINANCE\_\* sets and module guards read directly.
- Frontend: HIGH — route guard + composable pattern confirmed.

**Research date:** 2026-06-24
**Valid until:** ~2026-07-24 (stable in-repo codebase; re-verify if 141/142 land first or schema shifts).
