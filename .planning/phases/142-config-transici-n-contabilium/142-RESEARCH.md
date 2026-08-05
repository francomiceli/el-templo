# Phase 142: Config + transición Contabilium - Research

**Researched:** 2026-06-24
**Domain:** Backend config (key-value reuse) + finance seam wiring + a written transition deliverable
**Confidence:** HIGH (everything verified in-repo; no external deps)

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Única perilla configurable = **umbral de pendientes** (días para disparar la alerta de la bandeja). Default **3** (heredado de 141). Validación/activación NO se construyen.
- **D-02:** Validación queda **"validar todos"** (137, sin switch). No se construye.
- **D-03:** Activación queda **instantánea** (137, sin switch). No se construye.
- **D-04:** **Reusar `system_settings`** (NO tabla nueva). Setting `finance.pending_overdue_days`. Migración **0157** lo seedea (default 3). Lectura con fallback (espejo de `getStreakMilestoneConfig`).
- **D-05:** El seam de 141 (`OVERDUE_DAYS` en `finance/constants.ts`) pasa a **leer de `system_settings`** con 3 como fallback. `/pending-tray` ya devuelve `thresholdDays`; ahora dinámico — sin tocar la UI de 141.
- **D-06:** **Mini pantalla "Configuración de Caja"** dedicada (owner/admin gated), reusa `system_settings`. Un solo campo hoy. NO inline en el hub de Caja. Config global (no por sucursal).
- **D-07:** MIG-02 = **documento escrito** de la regla de transición (corte limpio + qué dato manda + criterio + mecanismo de apertura).
- **D-08:** La **fecha/estrategia de corte la define Franco al go-live** — 142 NO la fija. Recomendación documentada: corte limpio único.
- **D-09:** **Saldos de apertura por migración, no por UI.** 142 deja el template/mecanismo listo; cajas siguen en 0/placeholder.

### Claude's Discretion

- Estructura exacta del setting (`finance.pending_overdue_days` como int en text) + helper de lectura con fallback.
- Si el doc MIG-02 vive en `.docs/modulo-contable/` o `.planning/`.
- REST shape del endpoint de config (get/set) + el composable/pantalla Quasar (reusa componentes existentes).
- Si la mini pantalla necesita UI-SPEC formal o alcanza con el patrón de formularios existente (un solo campo numérico — probablemente mínimo).
- Forma del template de migración de aperturas (script comentado / migración placeholder).

### Deferred Ideas (OUT OF SCOPE)

- Perilla de validación (todos/dudosos) + reglas automáticas de "dudosos" → futuro, fuera de v5.2.
- Perilla de activación (instant/diferida) → descartada.
- Pantalla de edición de aperturas → no (migración al go-live).
- Scoping por sucursal de la config → no (global).
- Facturación AFIP/ARCA → último escalón, fuera del milestone.
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID     | Description (REQUIREMENTS.md)                                                                                                                                      | Research Support                                                                                                                                                                                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MIG-01 | Las perillas de configuración tienen una casa de configuración definida y funcional. (En 142: solo el **umbral**; validación/activación descartadas — D-01/02/03.) | `system_settings` reuse pattern (`getStreakMilestoneConfig`), the `OVERDUE_DAYS` seam in `transaction-service.ts:1162/1166`, config GET/PUT in the finance plugin (no settings module resurrection), mini "Configuración de Caja" page mirroring `PuntuacionesPage` (owner/admin route + nav). |
| MIG-02 | Documentada la regla de "qué dato manda" durante la convivencia con Contabilium por etapa (ingresos primero; AFIP último, fuera de scope).                         | Written doc in `.docs/modulo-contable/` sourced from BRIEF §6 + 138 D-05/D-06 (clean cutoff, no backfill). Opening-balance migration **template** targeting `cash_registers.opening_balance`/`cutoff_date`.                                                                                    |

</phase_requirements>

## Summary

This is a small, low-risk closing phase with **zero external dependencies** — everything is in-repo. Two deliverables:

1. **MIG-01 (config house):** Reuse the existing `system_settings` key-value table (D-04 — `136-07` deleted the `src/modules/settings/` _module_, not the table; streaks + segmentation + finance still read it). Add one setting `finance.pending_overdue_days`. Mirror the exact read-with-fallback shape of `streaks/service.ts::getStreakMilestoneConfig` (read key, `parseInt`, fall back to default on absent/NaN). Replace the hard-coded `OVERDUE_DAYS` literal at two sites in `transaction-service.ts::listPendingTray` (`isOverdue` and the echoed `thresholdDays`) with an awaited config read. The 141 frontend (`BandejaPendientesTab.vue`) already reads `thresholdDays` from the response and never hard-codes it — so the dynamic value flows to the bandeja + counter **without touching any 141 UI**. Add owner/admin-gated GET + PUT for the threshold, folded into the existing finance plugin (do NOT resurrect a settings subsystem). Add a minimal "Configuración de Caja" admin page mirroring the just-built `PuntuacionesPage` (owner/admin route + nav item).

2. **MIG-02 (transition doc):** A written markdown deliverable in `.docs/modulo-contable/` documenting clean-cutoff rules, "qué dato manda" during Contabilium coexistence (Admin = ingresos/caja from cutoff; Contabilium = AFIP only, out of scope), and the opening-balance loading mechanism. Plus an opening-balance migration **template** (a commented SQL placeholder to be filled with Franco's real physical counts at go-live; cajas stay at 0 in 142).

**Primary recommendation:** Add a `getOverdueThreshold(): Promise<number>` helper that reads `system_settings['finance.pending_overdue_days']` with fallback to `OVERDUE_DAYS` (keep the constant as the canonical default). Wire it into `listPendingTray`. Add GET/PUT config endpoints in the finance plugin gated by `ADMIN_ROLES` (owner/admin — stricter than the module's `FINANCE_READ_ROLES`). Build the mini page off the `PuntuacionesPage` template. **Lazy-default the setting (no seed needed) — but the user's D-04 explicitly chose migration 0157 to seed it; honor D-04 and write the seed.** Write the MIG-02 doc + opening-balance migration template as a placeholder file with go-live instructions.

## Architectural Responsibility Map

| Capability                                         | Primary Tier                      | Secondary Tier                | Rationale                                                                                                            |
| -------------------------------------------------- | --------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Read/write the overdue threshold setting           | API / Backend                     | Database (`system_settings`)  | Config value is global, server-authoritative; the same value drives server-side `isOverdue`.                         |
| Apply the threshold to `isOverdue`/`thresholdDays` | API / Backend (`listPendingTray`) | —                             | Already computed server-side in 141 so the counter is authoritative; 142 only changes _where the number comes from_. |
| Config endpoint RBAC                               | API / Backend (`ADMIN_ROLES`)     | —                             | Owner/admin (D-06), stricter than the finance module's `FINANCE_READ_ROLES`.                                         |
| "Configuración de Caja" form UI                    | Frontend Server (Quasar admin)    | —                             | Pure presentation + one PUT; mirrors `PuntuacionesPage`.                                                             |
| Seed the default setting                           | Database (migration 0157)         | —                             | D-04 chose a seed migration; additive, idempotent.                                                                   |
| Transition rule / opening-balance mechanism        | Documentation (`.docs/`)          | Database (migration template) | MIG-02 is a written deliverable + a placeholder migration filled at go-live.                                         |

## Standard Stack

No new packages. Everything reuses existing in-repo infrastructure.

### Core (existing, reused)

| Asset                              | Location                                               | Purpose                                      | Why Standard                                                                                                             |
| ---------------------------------- | ------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `system_settings` table            | `el-templo-api/src/db/schema/system-settings.ts`       | Global key-value config store                | D-04: reuse, no new table. Already used by streaks + segmentation + finance. `setting_key` unique, `setting_value` text. |
| `getStreakMilestoneConfig` pattern | `el-templo-api/src/modules/streaks/service.ts:273`     | Read-with-fallback exemplar                  | The exact pattern to mirror: `select` keys → `Map` → `parseInt` → default on `undefined`/`NaN`.                          |
| `OVERDUE_DAYS = 3`                 | `el-templo-api/src/modules/finance/constants.ts:16`    | Canonical default                            | Keep as the fallback default; the seam comment already names 142 as the consumer.                                        |
| `financeRoutes` plugin             | `el-templo-api/src/modules/finance/routes.ts:72`       | Where config endpoints live                  | Fold config GET/PUT here — no settings module resurrection.                                                              |
| `ADMIN_ROLES = ['admin','owner']`  | `el-templo-api/src/modules/shared/permissions.ts:23`   | Config RBAC                                  | D-06 owner/admin gating. Stricter than module guard `FINANCE_READ_ROLES`.                                                |
| `PuntuacionesPage.vue`             | `el-templo-admin/src/pages/PuntuacionesPage.vue`       | Fresh owner-only page template (built today) | Newest example of a minimal gated admin page + route + nav item.                                                         |
| `useFinanceLoadApi` composable     | `el-templo-admin/src/composables/useFinanceLoadApi.ts` | Composable template                          | `loading`/`error` refs, `api` from `boot/axios`, `extractError`, `cleanup()`, no `onUnmounted`.                          |

**Installation:** None. No dependencies added or updated (memory rule: never install/update deps without asking — N/A here).

## Package Legitimacy Audit

Not applicable — this phase installs **no external packages**. All work reuses existing in-repo modules, tables, and patterns.

## Architecture Patterns

### System Architecture Diagram

```
                          ┌─────────────────────────────────────────┐
  Admin user (owner/admin) │   "Configuración de Caja" page (NEW)     │
        │                  │   - reads current threshold (GET)        │
        │  GET/PUT         │   - q-input number + Guardar (PUT)       │
        ▼                  └─────────────────────────────────────────┘
  ┌──────────────────────────────────────────────────────────────────┐
  │  finance plugin (routes.ts) — module guard FINANCE_READ_ROLES     │
  │  ┌────────────────────────────────────────────────────────────┐  │
  │  │ GET  /config/overdue-threshold   → ADMIN_ROLES per-handler  │  │
  │  │ PUT  /config/overdue-threshold   → ADMIN_ROLES per-handler  │  │
  │  └────────────────────┬───────────────────────────────────────┘  │
  │                       │ read/write                                │
  │              ┌────────▼─────────────────────────────┐            │
  │              │ FinanceConfigService (NEW, small)     │            │
  │              │  getOverdueThreshold(): Promise<number>│            │
  │              │  setOverdueThreshold(n): Promise<void> │            │
  │              │  (mirror getStreakMilestoneConfig)     │            │
  │              └────────┬─────────────────────────────┘            │
  └───────────────────────┼──────────────────────────────────────────┘
                          │ read/upsert
                  ┌───────▼────────────────┐
                  │ system_settings        │  key: finance.pending_overdue_days
                  │ (existing table)       │  value: "3" (text), fallback OVERDUE_DAYS
                  └───────┬────────────────┘
                          │ read (await)
            ┌─────────────▼───────────────────────────────────┐
            │ transaction-service.ts::listPendingTray          │
            │   threshold = await config.getOverdueThreshold() │
            │   isOverdue   = ageInDays > threshold            │  ← was OVERDUE_DAYS
            │   thresholdDays = threshold                       │  ← was OVERDUE_DAYS
            └─────────────┬───────────────────────────────────┘
                          │ response { ..., thresholdDays }
            ┌─────────────▼───────────────────────────────────┐
            │ BandejaPendientesTab.vue (141 — UNCHANGED)       │
            │   thresholdDays = ref(3) ← overwritten from resp │
            │   "{{ vencidoCount }} superan los {{ thresholdDays }} días" │
            └──────────────────────────────────────────────────┘
```

### Recommended Structure (deltas only)

```
el-templo-api/
├── src/modules/finance/
│   ├── config-service.ts        # NEW: FinanceConfigService (get/set threshold)
│   ├── constants.ts             # ADD: FINANCE_SETTINGS_KEYS + keep OVERDUE_DAYS as default
│   ├── transaction-service.ts   # EDIT: listPendingTray awaits config.getOverdueThreshold()
│   ├── routes.ts                # ADD: GET/PUT /config/overdue-threshold (ADMIN_ROLES)
│   ├── schemas.ts               # ADD: get/put config schemas
│   ├── index.ts                 # EXPORT FinanceConfigService
│   └── types.ts                 # ADD: config response/body types
├── src/db/migrations/
│   └── 0157_seed_finance_overdue_threshold.sql   # NEW (D-04): seed default 3
└── test/finance-config.test.ts  # NEW: get/set + RBAC + dynamic threshold → /pending-tray

el-templo-admin/
├── src/pages/ConfiguracionCajaPage.vue           # NEW: mini page (mirror PuntuacionesPage)
├── src/composables/useFinanceConfigApi.ts        # NEW: get/set composable
├── src/router/routes.ts                          # ADD: /configuracion-caja, ADMIN_ROLES
└── src/layouts/AdminLayout.vue                    # ADD: nav item v-if="isAdminRole"

.docs/modulo-contable/                            # NEW dir (recommended over .planning/)
├── TRANSICION-CONTABILIUM.md                      # NEW (MIG-02 doc, D-07/D-08)
└── opening-balance-migration-template.sql         # NEW (MIG-02 template, D-09)
```

### Pattern 1: Read-with-fallback config helper (mirror streaks)

**What:** A service method that reads a `system_settings` key and falls back to a default constant.
**When to use:** Every config read in this phase.
**Example:**

```typescript
// Source: el-templo-api/src/modules/streaks/service.ts:273 (in-repo exemplar)
// New: el-templo-api/src/modules/finance/config-service.ts
import { eq } from "drizzle-orm";
import { systemSettings } from "../../db/schema";
import { OVERDUE_DAYS } from "./constants";

export const FINANCE_SETTINGS_KEYS = {
  PENDING_OVERDUE_DAYS: "finance.pending_overdue_days",
} as const;

export class FinanceConfigService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
  ) {}

  async getOverdueThreshold(): Promise<number> {
    const [row] = await this.db
      .select({ value: systemSettings.settingValue })
      .from(systemSettings)
      .where(
        eq(
          systemSettings.settingKey,
          FINANCE_SETTINGS_KEYS.PENDING_OVERDUE_DAYS,
        ),
      )
      .limit(1);
    if (!row) return OVERDUE_DAYS;
    const parsed = parseInt(row.value, 10);
    return isNaN(parsed) ? OVERDUE_DAYS : parsed;
  }

  async setOverdueThreshold(days: number): Promise<void> {
    // Upsert: system_settings.setting_key is unique → ON DUPLICATE KEY UPDATE.
    await this.db
      .insert(systemSettings)
      .values({
        settingKey: FINANCE_SETTINGS_KEYS.PENDING_OVERDUE_DAYS,
        settingValue: String(days),
      })
      .onDuplicateKeyUpdate({ set: { settingValue: String(days) } });
  }
}
```

**Note:** `parseOrDefault` in `getStreakMilestoneConfig` handles `undefined` (absent) AND `NaN` — replicate both guards. Validate `days` server-side in the route (positive integer, sane max e.g. ≤ 365) before calling `setOverdueThreshold`.

### Pattern 2: Wire the 141 seam (the only edit to existing logic)

**What:** Replace the two `OVERDUE_DAYS` literals in `listPendingTray` with an awaited config read.
**Where (exact, verified):** `transaction-service.ts:1162` (`isOverdue: ageInDays > OVERDUE_DAYS`) and `:1166` (`thresholdDays: OVERDUE_DAYS`).
**Example:**

```typescript
// el-templo-api/src/modules/finance/transaction-service.ts::listPendingTray
// Inject FinanceConfigService into TransactionService (constructor) OR construct
// it inline from this.db/this.log. Read ONCE per call, before the .map():
const threshold = await this.financeConfig.getOverdueThreshold();
// ...
isOverdue: ageInDays > threshold,   // was: > OVERDUE_DAYS
// ...
return { rows, total, page, limit, thresholdDays: threshold }; // was: OVERDUE_DAYS
```

**DI note:** `TransactionService` constructor (`transaction-service.ts:33`) takes `(db, log, balanceService, cashRegisterService)`. Cleanest option: add `financeConfig: FinanceConfigService` as a 5th constructor param, instantiated in `routes.ts:75` where `transactionService` is built. Alternative (lower blast radius): construct `new FinanceConfigService(this.db, this.log)` once inside `listPendingTray`. **Recommend the constructor param** — DI is the module's established style (see how `balanceService`/`cashRegisterService` are injected) and it keeps the service testable.

### Pattern 3: Per-handler stricter RBAC inside the finance plugin

**What:** The finance plugin's module guard is `FINANCE_READ_ROLES` (`routes.ts:189`). Config is more sensitive → re-check `ADMIN_ROLES` per-handler (the same belt-and-suspenders pattern the plugin already uses for write/void/adjustment).
**Example:**

```typescript
// el-templo-api/src/modules/finance/routes.ts (mirror the existing per-handler guards)
import { ADMIN_ROLES } from "../shared/permissions";

fastify.get(
  "/config/overdue-threshold",
  { schema: getConfigSchema },
  async (request, reply) => {
    if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
      return reply
        .code(403)
        .send({ error: "Acceso denegado", message: "Solo owner/admin" });
    }
    return { thresholdDays: await financeConfigService.getOverdueThreshold() };
  },
);

fastify.put<{ Body: { thresholdDays: number } }>(
  "/config/overdue-threshold",
  { schema: putConfigSchema },
  async (request, reply) => {
    if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
      return reply
        .code(403)
        .send({ error: "Acceso denegado", message: "Solo owner/admin" });
    }
    await financeConfigService.setOverdueThreshold(request.body.thresholdDays);
    return { thresholdDays: request.body.thresholdDays };
  },
);
```

**Note:** the module-level `onRequest` guard already 403s coach/recepcion (not in `FINANCE_READ_ROLES`) and `gestion` is in `FINANCE_READ_ROLES` — the per-handler `ADMIN_ROLES` check is what excludes `gestion` from config. Tests must cover: gestion gets 200 on read paths elsewhere but **403 on config** (this is the behavior that distinguishes config sensitivity).

### Pattern 4: Mini admin page (mirror PuntuacionesPage)

**What:** Owner/admin route + nav + a one-field form.
**Route:** `el-templo-admin/src/router/routes.ts` — add an entry mirroring `puntuaciones` (line 167) but with `meta: { allowedRoles: ['admin', 'owner'] as AdminRole[] }`.
**Nav:** `AdminLayout.vue` — add a `<q-item v-if="isAdminRole" ... to="/configuracion-caja">` near the Caja item (line 96). `isAdminRole` already = `['admin','owner']` (line ~227). Use an icon like `settings` or `tune`.
**Composable:** mirror `useFinanceLoadApi.ts` exactly (`loading`/`error` refs, `extractError`, `cleanup()`, no `onUnmounted`, no `console.*`, no `any`).

### Anti-Patterns to Avoid

- **Resurrecting a settings module/subsystem.** 136-07 deleted `src/modules/settings/` deliberately. Fold config into the finance plugin. One key, one page.
- **A new `finance_settings` table.** D-04 forbids it. Reuse `system_settings`.
- **Hard-coding the threshold anywhere on the frontend.** `BandejaPendientesTab.vue:345` (`thresholdDays = ref(3)`) is a placeholder overwritten by the response — leave it; the response now carries the dynamic value.
- **Touching any 141 UI.** The seam is server-side only. The bandeja already consumes `thresholdDays` from the payload.
- **Scoping config by branch/country.** Global only (D-06). Do NOT add country/branch to the config endpoints.
- **`;` inside SQL comments in migration 0157.** The custom runner splits on `;` before stripping `--` (project memory rule).

## Don't Hand-Roll

| Problem             | Don't Build                    | Use Instead                                                 | Why                                                           |
| ------------------- | ------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------- |
| Config persistence  | A new `finance_settings` table | `system_settings` (D-04)                                    | Table exists, has unique key + text value, used by 3 modules. |
| Read-with-fallback  | A bespoke caching/parse layer  | The `getStreakMilestoneConfig` shape                        | Proven in-repo; handles absent + NaN.                         |
| Upsert              | SELECT-then-INSERT/UPDATE      | Drizzle `.onDuplicateKeyUpdate` on the unique `setting_key` | One round-trip, race-safe.                                    |
| RBAC                | A new permission set           | `ADMIN_ROLES`                                               | Already the owner/admin set used across admin features.       |
| Admin page scaffold | A page from scratch            | `PuntuacionesPage.vue` template                             | Freshest gated-page example (built today), same conventions.  |

**Key insight:** This phase is almost entirely _wiring + a doc_. The single behavioral change is two literals in `listPendingTray`. Resist building infrastructure.

## Seed vs. lazy-default (Claude's Discretion within D-04)

**Finding (verified):** `streaks` does **NOT** seed its settings — there is no `streak.milestone*` row in any migration; it relies entirely on `getStreakMilestoneConfig`'s fallback. **Segmentation DOES seed** (migration `0057` inserts `segment.*` rows). So both patterns exist in-repo and both are valid.

**D-04 explicitly chose migration 0157 to seed `finance.pending_overdue_days` default 3.** Honor it. The seed is additive and makes the configured value visible in the table immediately (so the admin page shows "3" rather than an empty/fallback state on first load — slightly better UX than lazy-default). Keep the `getOverdueThreshold` fallback regardless (defense-in-depth if the row is ever deleted).

**Migration 0157 (next free number — verified 0156 is latest):**

```sql
-- 0157_seed_finance_overdue_threshold.sql
-- Phase 142 (MIG-01 / D-04): seed the pending-overdue threshold config (default 3).
-- Reuses system_settings (NO new table). Idempotent: skip if the key already exists.
INSERT INTO `system_settings` (`setting_key`, `setting_value`)
SELECT 'finance.pending_overdue_days', '3'
WHERE NOT EXISTS (
  SELECT 1 FROM `system_settings` WHERE `setting_key` = 'finance.pending_overdue_days'
);
```

**Migration rules (CLAUDE.md + memory):** hand-write this (db:generate doesn't produce data seeds and the `sessions.goal_plan_type` drift can block it); **no `;` inside `--` comments**; **commit the SQL file** alongside any schema change; do NOT use `drizzle-kit migrate` (the `_migrations` DB table is the source of truth). This migration is data-only (no schema change) so `db:generate` isn't needed at all.

## MIG-02 — Transition doc + opening-balance template (D-07/D-08/D-09)

**Location (Claude's Discretion):** Recommend `.docs/modulo-contable/` (not `.planning/`). The `.planning/` tree is GSD process artifacts; `.docs/` is durable product/operations docs that outlive the milestone and where Franco/ops will look at go-live. The brief already lives at repo root (`BRIEF-MODULO-CONTABLE-FRANCO.md`) and references `.docs/`.

**Doc contents (sourced — all verified from BRIEF + 138):**

- **Corte limpio (D-07c):** From go-live, ingresos/caja live ONLY in the Administrador. Pre-cutoff = Contabilium/Excel. Cajas start at `opening_balance` (physical count), **no historical backfill** — this is already implemented (138 D-05/D-06: `cutoff_date` excludes pre-cutoff transactions from the firm balance; `opening_balance` is the seed). Source: BRIEF §6-bis line 216, `cash-registers.ts:41-45`.
- **Qué dato manda (D-07b):** Admin = ingresos + caja (source of truth from cutoff). Contabilium = AFIP/facturación electrónica only (out of scope, last replacement step). Source: BRIEF §6 lines 199-210.
- **Estrategia de corte (D-08):** Franco defines the date at go-live. Documented recommendation: **single clean cutoff** (all branches same day) for clarity, but escalonado is acceptable. 142 does NOT fix a date.
- **Mecanismo de apertura (D-07d/D-09):** Opening balances loaded ONCE by migration at go-live with Franco's real physical counts (project rule: prod data via migration, not UI re-seed). In 142 the template is a placeholder; cajas stay at 0.

**Opening-balance migration template (D-09) — recommended form: a commented placeholder `.sql` file** (not a tracked migration that the runner would execute). Reason: a real migration in `src/db/migrations/` would run on the next deploy with placeholder values and stomp the (currently 0) balances / a wrong cutoff. Keep it as a **template outside the runner's path** (`.docs/modulo-contable/`), to be copied into `src/db/migrations/NNNN_*.sql` and filled at go-live.

```sql
-- opening-balance-migration-template.sql  (TEMPLATE — do NOT place in src/db/migrations until go-live)
-- Phase 142 (MIG-02 / D-09). At go-live: copy to src/db/migrations/NNNN_load_opening_balances.sql,
-- fill <CONTEO> and <YYYY-MM-DD> with Franco's real physical counts + cutoff date, then db:migrate.
-- One UPDATE per caja. cutoff_date is PER-CAJA (138) — may differ if Franco does escalonado.
-- Rules: no ';' inside '--' comments; commit the filled SQL; values are integers (cents/units per app convention).

-- Caja efectivo sucursal <NOMBRE> (id <ID>):
UPDATE `cash_registers` SET `opening_balance` = <CONTEO>, `cutoff_date` = '<YYYY-MM-DD>' WHERE `id` = <ID>;
-- Caja central efectivo (id <ID>):
UPDATE `cash_registers` SET `opening_balance` = <CONTEO>, `cutoff_date` = '<YYYY-MM-DD>' WHERE `id` = <ID>;
-- Caja banco ARS (id <ID>):
UPDATE `cash_registers` SET `opening_balance` = <CONTEO>, `cutoff_date` = '<YYYY-MM-DD>' WHERE `id` = <ID>;
-- Caja banco EUR (id <ID>):
UPDATE `cash_registers` SET `opening_balance` = <CONTEO>, `cutoff_date` = '<YYYY-MM-DD>' WHERE `id` = <ID>;
```

## Common Pitfalls

### Pitfall 1: Editing the wrong seam site

**What goes wrong:** Changing only `thresholdDays` (the echo) but not `isOverdue`, or vice versa → counter and badge disagree.
**How to avoid:** Both literals are in `listPendingTray` (`transaction-service.ts:1162` AND `:1166`). Read the threshold ONCE into a local before the `.map()` and use it in both spots. Verify with a test: set threshold=5, post a 4-day-old pendiente → `isOverdue=false` AND `thresholdDays=5`.

### Pitfall 2: `gestion` accidentally allowed to write config

**What goes wrong:** The module guard is `FINANCE_READ_ROLES` which **includes** `gestion`. Forgetting the per-handler `ADMIN_ROLES` check lets gestion change the threshold.
**How to avoid:** Per-handler `ADMIN_ROLES` check on BOTH config endpoints. Test gestion → 403 on config get AND put.

### Pitfall 3: `;` inside SQL comments in migration 0157

**What goes wrong:** The custom runner splits on `;` before stripping `--`; a `;` inside a comment breaks the migration (project memory rule).
**How to avoid:** No semicolons in any `--` comment line in 0157.

### Pitfall 4: Placing the opening-balance template inside `src/db/migrations/`

**What goes wrong:** The runner executes it on next deploy with placeholder/zero values, overwriting balances or setting a wrong cutoff.
**How to avoid:** Keep it in `.docs/modulo-contable/` as a template; it's copied + filled into a real migration only at go-live.

### Pitfall 5: Invalid threshold values from the PUT

**What goes wrong:** A negative or absurd `thresholdDays` makes everything overdue / nothing overdue.
**How to avoid:** Validate in the PUT schema/handler: positive integer, sane bounds (e.g. `1..365`). 400 on out-of-range.

## Runtime State Inventory

This is a config-add + doc phase, not a rename/migration of existing identifiers. State check:

| Category            | Items Found                                                                                          | Action Required                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Stored data         | New `system_settings` row `finance.pending_overdue_days` (seeded by 0157). No existing data renamed. | Migration 0157 (additive seed).                         |
| Live service config | None — config is the _subject_ of this phase, stored in `system_settings` (in git via migration).    | None.                                                   |
| OS-registered state | None.                                                                                                | None — verified (no scheduler/pm2/systemd involvement). |
| Secrets/env vars    | None — no new env var (config is DB-stored, not env).                                                | None. CLAUDE.md `.env.example` rule N/A.                |
| Build artifacts     | None.                                                                                                | None.                                                   |

**Nothing found** in the OS/secrets/build categories — verified by scope (no new env var, no scheduled job, no package).

## Code Examples

(All examples above in Patterns 1–4 are from verified in-repo sources: `streaks/service.ts:273`, `transaction-service.ts:1012-1167`, `routes.ts:189`, `useFinanceLoadApi.ts`, `PuntuacionesPage` route at `routes.ts:167`, `AdminLayout.vue:78/96`.)

## State of the Art

No external state-of-the-art shift relevant — this is internal wiring. The only "old → new" is internal to the milestone:

| Old Approach                            | Current Approach                                         | When Changed | Impact                                                                |
| --------------------------------------- | -------------------------------------------------------- | ------------ | --------------------------------------------------------------------- |
| `OVERDUE_DAYS` hard-coded literal (141) | Read from `system_settings` with fallback (142)          | This phase   | Bandeja threshold becomes admin-configurable; no 141 UI change.       |
| `src/modules/settings/` module          | Deleted (136-07); reuse `system_settings` table directly | 136-07       | Config endpoints fold into feature plugins, not a settings subsystem. |

## Assumptions Log

| #   | Claim                                               | Section | Risk if Wrong |
| --- | --------------------------------------------------- | ------- | ------------- |
| —   | _(none — all claims verified in-repo this session)_ | —       | —             |

**This table is empty: every factual claim was verified against the repository (file/line references throughout). The only judgment calls are explicit Claude's-Discretion recommendations (doc location, seed-vs-lazy, DI placement, template-outside-runner), each presented with rationale for the planner/user to accept or override.**

## Open Questions

1. **Threshold validation bounds.**
   - What we know: must be a positive integer; global.
   - What's unclear: exact max (30? 90? 365?).
   - Recommendation: accept `1..365`, default 3. Trivial to adjust; planner can pick a bound in the schema.

2. **`.env.example` — N/A confirmation.**
   - What we know: config is DB-stored, no new env var.
   - Recommendation: no `.env.example` change. Stated for the planner to not add a phantom var.

## Environment Availability

Skipped — no external dependencies. This phase is code + DB-seed + a markdown doc, all in-repo. No CLI tools, services, or runtimes beyond the existing stack (Fastify/Drizzle/MySQL, Quasar/Vue) which the running app already requires.

## Validation Architecture

> nyquist_validation assumed enabled (config not checked as false). API tests run in CI against real MySQL (CLAUDE.md), not locally (memory rule).

### Test Framework

| Property           | Value                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| Framework          | Existing API integration tests (`el-templo-api/test/`, real `eltemplo_test` MySQL; see `test/helpers.ts`) |
| Config file        | Existing (project test runner)                                                                            |
| Quick run command  | `cd el-templo-api && pnpm test` (runs in CI on push to staging; **do not run locally** per memory rule)   |
| Full suite command | Same — CI on push                                                                                         |

### Phase Requirements → Test Map

| Req ID | Behavior                                                                                               | Test Type   | Automated Command            | File Exists? |
| ------ | ------------------------------------------------------------------------------------------------------ | ----------- | ---------------------------- | ------------ |
| MIG-01 | GET config returns current threshold (seeded 3)                                                        | integration | `pnpm test` (finance-config) | ❌ Wave 0    |
| MIG-01 | PUT config sets threshold (owner/admin)                                                                | integration | `pnpm test`                  | ❌ Wave 0    |
| MIG-01 | gestion → 403 on config GET and PUT                                                                    | integration | `pnpm test`                  | ❌ Wave 0    |
| MIG-01 | coach/recepcion → 403 (module guard)                                                                   | integration | `pnpm test`                  | ❌ Wave 0    |
| MIG-01 | Dynamic threshold flows: PUT 5 → `/pending-tray` returns `thresholdDays=5` and `isOverdue` reflects it | integration | `pnpm test`                  | ❌ Wave 0    |
| MIG-01 | Absent setting → fallback to 3 (delete row, read returns 3)                                            | integration | `pnpm test`                  | ❌ Wave 0    |
| MIG-01 | PUT invalid (negative / out-of-range) → 400                                                            | integration | `pnpm test`                  | ❌ Wave 0    |
| MIG-02 | Doc + template exist (deliverable; no automated test)                                                  | manual      | review                       | N/A          |

### Sampling Rate

- **Per task commit:** typecheck locally (`pnpm -C el-templo-api typecheck` / build) — memory rule: typecheck local, tests in CI.
- **Per wave merge / phase gate:** full suite green in CI on push to staging.

### Wave 0 Gaps

- [ ] `el-templo-api/test/finance-config.test.ts` — covers MIG-01 (get/set/RBAC/fallback/dynamic-threshold/validation). Reuse `test/helpers.ts` auth utilities and seed a pendiente tx of known age for the `/pending-tray` flow assertion.
- [ ] No new framework install needed — the integration harness exists.

_Frontend (admin) has no established unit-test harness in scope here; the page is a one-field form — verify via typecheck/build + manual UAT._

## Security Domain

> security_enforcement assumed enabled. Lightweight phase; the relevant surface is the config endpoints.

### Applicable ASVS Categories

| ASVS Category         | Applies | Standard Control                                                                                                                                                  |
| --------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | yes     | `fastify.authenticate` (module-level `onRequest` guard, `routes.ts:190`)                                                                                          |
| V3 Session Management | no      | Handled by existing auth/refresh-token infra (phase 116).                                                                                                         |
| V4 Access Control     | yes     | Per-handler `ADMIN_ROLES` check (owner/admin) on config GET+PUT, stricter than the module's `FINANCE_READ_ROLES`. Global config — no branch/country scope needed. |
| V5 Input Validation   | yes     | Fastify JSON schema on PUT body: `thresholdDays` integer, bounded (`1..365`). 400 on violation.                                                                   |
| V6 Cryptography       | no      | No secrets/crypto in scope.                                                                                                                                       |

### Known Threat Patterns for {Fastify + Drizzle + MySQL}

| Pattern                                                  | STRIDE                 | Standard Mitigation                                                                      |
| -------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| Privilege escalation (gestion/coach editing config)      | Elevation of Privilege | Per-handler `ADMIN_ROLES` re-check; tests assert 403 for gestion/coach.                  |
| SQL injection on the setting write                       | Tampering              | Drizzle parameterized insert/`onDuplicateKeyUpdate` — never string-concatenate.          |
| Invalid/negative threshold poisoning the overdue counter | Tampering / DoS-lite   | Server-side bounds validation (1..365) in the PUT schema.                                |
| Idempotency / race on concurrent PUTs                    | Tampering              | `onDuplicateKeyUpdate` on the unique `setting_key` (last-write-wins, no duplicate rows). |

## Sources

### Primary (HIGH confidence — in-repo, verified this session)

- `el-templo-api/src/db/schema/system-settings.ts` — table shape (unique `setting_key`, text `setting_value`).
- `el-templo-api/src/modules/streaks/service.ts:273-317` + `streaks/types.ts:1-19` — read-with-fallback exemplar; confirmed streaks does NOT seed.
- `el-templo-api/src/db/migrations/0057_behavioral_segmentation.sql` — `system_settings` seed precedent (segmentation DOES seed).
- `el-templo-api/src/modules/finance/constants.ts:16` — `OVERDUE_DAYS = 3` + the 142 seam comment.
- `el-templo-api/src/modules/finance/transaction-service.ts:1012-1167` — `listPendingTray`; exact seam sites at `:1162` and `:1166`; constructor at `:33`.
- `el-templo-api/src/modules/finance/routes.ts:189-200` (module guard), per-handler RBAC pattern throughout.
- `el-templo-api/src/modules/shared/permissions.ts:23` (`ADMIN_ROLES`), `:126` (`FINANCE_READ_ROLES`), `:101/120/123` (write/adjustment/void).
- `el-templo-api/src/db/schema/cash-registers.ts:41-45` — `opening_balance`/`cutoff_date` (MIG-02 target).
- `el-templo-admin/src/router/routes.ts:167-169` (PuntuacionesPage owner-only route), `:70-72` (Caja route).
- `el-templo-admin/src/layouts/AdminLayout.vue:78,96,221-243` — nav items + role computeds (`isAdminRole`, `isCajaRole`, `isOwnerRole`).
- `el-templo-admin/src/composables/useFinanceLoadApi.ts` — composable conventions (cleanup, no onUnmounted, no any).
- `el-templo-admin/src/components/caja/BandejaPendientesTab.vue:11,344-345` — already consumes `thresholdDays` from the response (the 141 UI needs no change).
- `BRIEF-MODULO-CONTABLE-FRANCO.md` §6 (lines 199-210, Contabilium progressive replacement) + §6-bis (line 216, no daily cash close / clean cutoff).
- `.planning/REQUIREMENTS.md:81-82,131-132` — MIG-01/MIG-02 wording + Phase 142 mapping.
- Migration numbering: `0156_idempotency_key.sql` is the latest → **0157** is next (verified by `ls src/db/migrations/`).

### Secondary / Tertiary

- None. No web sources needed; the phase is fully internal.

## Metadata

**Confidence breakdown:**

- Standard stack (reuse): HIGH — every asset read and line-referenced.
- Architecture / seam wiring: HIGH — exact seam sites, constructor, and frontend consumer verified.
- RBAC: HIGH — role sets and module-guard interaction verified.
- MIG-02 doc/template: HIGH on sources; the doc _content_ is a deliverable to be written (recommendations given).

**Research date:** 2026-06-24
**Valid until:** ~30 days (stable; the only volatility is migration numbering — re-check the latest migration number at plan time if other phases land first).
