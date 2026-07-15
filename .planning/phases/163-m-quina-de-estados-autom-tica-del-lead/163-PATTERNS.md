# Phase 163: Máquina de estados automática del lead - Pattern Map

**Mapped:** 2026-07-15
**Files analyzed:** 11 (2 new source, 2 new migrations, 6 modified source, 1 new test)
**Analogs found:** 11 / 11 (all have strong in-repo analogs)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `el-templo-api/src/jobs/expire-lost-leads.ts` (NEW) | job (cron) | batch / event-driven | `el-templo-api/src/jobs/mark-no-shows.ts` | exact (cron sweep with `run*` + `start*`) |
| `el-templo-api/src/index.ts` (MODIFY) | bootstrap | request-response | itself, lines 17-39 (job wiring) | exact |
| `el-templo-api/src/db/schema/users.ts` (MODIFY) | model (schema) | — | itself (existing `mysqlEnum` columns) | exact |
| `0182_lead_status_source.sql` (NEW migration) | migration | batch | `0166_seed_pricing_card_surcharge.sql` (idempotent seed) + column-ALTER blocks in `0170` | exact |
| `0183_backfill_lost_leads.sql` (NEW migration) | migration | batch | `0170_lead_purchased_plan_ganado.sql` (backup + retroactive reclassify) | exact |
| settings reader for X (`settings/service.ts` + `settings/keys.ts`, MODIFY) | service (config read) | request-response / read | `SettingsService.getFlag` + `PRICING_SETTINGS_KEYS` | role-match (boolean→int adaptation) |
| `el-templo-api/src/modules/scheduling/trials-service.ts` (MODIFY) | service | CRUD | itself: `reserveTrialSelfService` (line 298 already sets `en_seguimiento`), `bookTrial` (line 696) | exact |
| `el-templo-api/src/modules/subscriptions/service.ts` (MODIFY) | service | CRUD | itself: `recomputeUserStatus` (5607-5732) | exact |
| `el-templo-api/src/modules/members/service.ts` `updateLead` (MODIFY) | service | CRUD | itself, lines 1099-1178 | exact |
| `el-templo-api/src/modules/members/service.ts` lead creation (MODIFY) | service | CRUD | itself (~869/1061) + trials-service line 298 | exact |
| `el-templo-api/test/expire-lost-leads.test.ts` (NEW) | test | — | `test/reports-trial-sessions.test.ts` + `test/helpers.ts` | exact |

## Pattern Assignments

### `el-templo-api/src/jobs/expire-lost-leads.ts` (NEW — job, batch)

**Analog:** `el-templo-api/src/jobs/mark-no-shows.ts` (structure) + `notification-cron.ts` (single AR-anchored internal batch schedule).

This is an **internal batch** job (not user-facing), so it takes ONE cron anchored to `America/Argentina/Buenos_Aires` like the segment-recalc job in `notification-cron.ts:299-503` (`{ timezone: "America/Argentina/Buenos_Aires" }`), NOT one-per-branch-tz. Discretion in CONTEXT allows madrugada AR (e.g. `"0 3 * * *"` or `"0 4 * * *"`).

**Imports + module logger pattern** (`mark-no-shows.ts:10-26`):
```typescript
import cron from "node-cron";
import pino from "pino";
import { sql, eq, and, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../db/schema";
import { bookings } from "../db/schema/bookings";
import { todayInTz } from "../modules/shared/date-utils";

const log = pino({ name: "expire-lost-leads" });
```

**Invocable `run*` + tallied result — the exact shape to copy** (`mark-no-shows.ts:177-189`):
```typescript
// Exposed so tests invoke the full sweep without the cron schedule.
export async function runExpireLostLeads(
  db: MySql2Database<typeof schema>,
): Promise<{ expired: number; skippedManual: number }> {
  // ... query + update ...
}
```

**`start*` wrapper with try/catch + conditional info log** (`mark-no-shows.ts:191-223` and the internal-batch variant in `notification-cron.ts:299-303,498-504`):
```typescript
export function startExpireLostLeadsJob(db: MySql2Database<typeof schema>): void {
  cron.schedule(
    "0 4 * * *",
    async () => {
      log.info("Running expire-lost-leads job");
      try {
        const { expired, skippedManual } = await runExpireLostLeads(db);
        if (expired > 0 || skippedManual > 0) {
          log.info({ expired, skippedManual }, "Expired lost leads");
        }
      } catch (error) {
        log.error({ err: error }, "Expire-lost-leads job failed");
      }
    },
    { timezone: "America/Argentina/Buenos_Aires" },
  );
  log.info("Expire-lost-leads cron scheduled (daily 04:00 AR)");
}
```

**Core query — reuse the EXACT "última booking is_trial no cancelada" derivation** from `0170_lead_purchased_plan_ganado.sql:98-118` (MAX(id) per member, `is_trial=1 AND booking_status <> 'cancelado'`, join back to that booking's `booking_date`). This is the same semantics as `ReportsService.getTrialSessionsReport` so cron and report agree. The cron adds: gate on `lead_status='en_seguimiento' OR lead_status IS NULL`, `converted_at IS NULL`, `purchased_plan_id IS NULL`, `booking_date + X < CURDATE()`, and **skip `lead_status_source='manual'`** (D-04). Read X from settings first (see settings reader below), then interpolate into the SQL DATE math (`DATE_ADD(b.booking_date, INTERVAL ${x} DAY) < CURDATE()`).

**SQL DATE domain, never JS math:** follow `notification-cron.ts:223-234` (`CURDATE()` / `DATE_ADD(..., INTERVAL n DAY)`) — `booking_date` is a DATE column; keep comparisons in AR-local DATE domain. Do not use `todayInTz` string math for the multi-day window unless you compute it in SQL.

**Two counters, logged separately** (specifics line 78): count `expired` and `skippedManual` distinctly. Prefer a single `UPDATE ... WHERE lead_status_source <> 'manual' OR lead_status_source IS NULL` for the flip (NULL treated as auto per D-07), then a second COUNT query for how many manual candidates were skipped, so the log reports both.

---

### `el-templo-api/src/index.ts` (MODIFY — wire the job)

**Analog:** itself, lines 17-39. Add the import next to the other `start*Job` imports and the invocation in the same block. Internal batch jobs here are called **synchronously** (not awaited) like `startAutoApproveJob(app.db)` / `startAutoResumePausesJob(app.db)` — the new job is `startExpireLostLeadsJob(app.db)` (sync, no tz discovery needed).

```typescript
import { startExpireLostLeadsJob } from "./jobs/expire-lost-leads";
// ...
startAutoApproveJob(app.db);
startAutoResumePausesJob(app.db);
startExpireLostLeadsJob(app.db);          // NEW
await startMarkNoShowsJob(app.db);
await startNotificationJobs(app.db);
```

---

### `el-templo-api/src/db/schema/users.ts` (MODIFY — new enum column `lead_status_source`)

**Analog:** the `leadStatusEnum` block at lines 75-79 and its column declaration at line 141. Copy that shape exactly (heavy doc comment explaining Phase, values, and setters — matches house style).

**Enum declaration pattern** (lines 75-79):
```typescript
export const leadStatusSourceEnum = mysqlEnum("lead_status_source", [
  "auto",
  "manual",
]);
```
**CRITICAL (per MEMORY reference):** `mysqlEnum` first arg is the **column name** (`"lead_status_source"`), not a label. The enum value list here MUST stay byte-identical to the ALTER in migration 0182 to avoid enum drift (lesson 125/126, cited in the `levelEnum` comment lines 25-29).

**Column declaration** (nullable, NULL = histórico/desconocido → tratado como auto; place near `leadStatus` line 141):
```typescript
leadStatus: leadStatusEnum,
leadStatusSource: leadStatusSourceEnum, // Phase 163 (D-07): auto|manual, NULL=histórico
```
No new index needed (D-05/CONTEXT: `idx_users_lead_status` already exists; the cron filters on `lead_status` first).

---

### `0182_lead_status_source.sql` (NEW migration — column + p90 seed)

**Number:** last applied is **0180**; `0181_debt_management.sql` exists on an unmerged branch — VERIFY the real max before finalizing (skill `el-templo-db-migrations`). Use 0182/0183 (or next free pair).

**Migration file header + no-semicolon-in-comments discipline:** copy the header block of `0170` (lines 1-27) and `0166` (lines 5-8). Rules restated in every file: hand-written (db:generate hits the `sessions.goal_plan_type` interactive drift), NEVER `drizzle-kit push/migrate`, `_migrations` table is source of truth, **no `;` inside `--` comment lines** (runner splits on `;` BEFORE stripping comments).

**Column ALTER pattern** (from `0170:36-45`):
```sql
ALTER TABLE `users`
  ADD COLUMN `lead_status_source` enum('auto','manual') NULL AFTER `lead_status`;
```

**Idempotent settings seed pattern** (from `0166_seed_pricing_card_surcharge.sql:9-13`) — but the VALUE is computed dynamically (p90). Two options, pick simplest/testable (D-06):
- (a) Compute p90 in pure SQL (MySQL 8 window fn over the days-to-convert distribution: converted leads = `converted_at IS NOT NULL` + a non-cancelled `is_trial=1` booking; days = booking date → `MIN(subscriptions.created_at)`), fall back to 14 when < 20 usable cases.
- (b) Compute in the TS runner and INSERT the literal.

Seed shape mirrors `0166` (idempotent, never clobber a prior PUT value):
```sql
INSERT INTO `system_settings` (`setting_key`, `setting_value`)
SELECT 'leads.perdido_window_days', <computed-p90-or-14>
WHERE NOT EXISTS (
  SELECT 1 FROM `system_settings` WHERE `setting_key` = 'leads.perdido_window_days'
);
```
The days-to-convert distribution query should reuse the report/backfill derivation (`is_trial=1 AND booking_status <> 'cancelado'`, `0170:98-118`).

---

### `0183_backfill_lost_leads.sql` (NEW migration — backup + retroactive reclassify)

**Analog:** `0170_lead_purchased_plan_ganado.sql` — this is the exact precedent.

**Backup table pattern** (`0170:29-34`) — copy verbatim, renaming the table to match the migration number:
```sql
CREATE TABLE users_lead_backup_0183 AS
SELECT id, status, lead_status, lead_status_source, converted_at, updated_at
FROM users
WHERE lead_status IS NOT NULL OR converted_at IS NOT NULL;
```

**Retroactive reclassify** = the cron rule applied once (adapt `0170:95-118`, step 4e). Join to the last non-cancelled trial booking (MAX(id) per member), flip `en_seguimiento`/NULL to `'perdido'` + `lead_status_source='auto'` where `booking_date + X < CURDATE()`, `converted_at IS NULL`, `purchased_plan_id IS NULL`, `deleted_at IS NULL`, status in ('prueba','freemium'), AND respect any existing `lead_status_source='manual'` (skip). Read X from `system_settings.leads.perdido_window_days` inside the UPDATE (subquery on `system_settings`) so the backfill uses the same value the cron will.

**Dry-run script** (AUTONOMOUS-DECISIONS #5 / D-08): commit a COUNT-only query alongside the migration (a `.sql` counting how many rows the UPDATE would touch) — the actual prod dry-run is a pending human item. Reference numbers from brief (15/07): ≈112 En seguimiento vencidos should move to Perdido.

---

### Settings reader for X (MODIFY `settings/keys.ts` + `settings/service.ts`)

**Analog:** `SettingsService.getFlag` (`settings/service.ts:37-45`) and `PRICING_SETTINGS_KEYS` (`settings/keys.ts:9-14`). Reuse this module — do NOT roll a bespoke reader in the job.

**Key registration** (`keys.ts` — add to the existing const or a sibling; keep the "single source of truth" comment discipline):
```typescript
export const LEADS_SETTINGS_KEYS = {
  /** system_settings key: días de ventana antes de vencer En seguimiento → Perdido. */
  perdidoWindowDays: "leads.perdido_window_days",
} as const;
```

**Reader — adapt `getFlag` from boolean to int** (`service.ts:37-45`), with the default-14 fallback (D-06) when the key is absent or unparseable:
```typescript
async getPerdidoWindowDays(): Promise<number> {
  const [row] = await this.db
    .select({ settingValue: systemSettings.settingValue })
    .from(systemSettings)
    .where(eq(systemSettings.settingKey, LEADS_SETTINGS_KEYS.perdidoWindowDays))
    .limit(1);
  const n = Number(row?.settingValue);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 14;
}
```
The cron reads this each run (no persistent cache — D-05). Alternative lighter-weight reader for streaks-style multi-key reads is `streaks/service.ts:270-285` (`inArray` + Map) if you prefer a standalone helper over instantiating `SettingsService`.

---

### `el-templo-api/src/modules/scheduling/trials-service.ts` (MODIFY — reset Perdido→En seguimiento, source auto)

**Analog:** `reserveTrialSelfService` already sets `leadStatus: "en_seguimiento"` at line 298 — **add `leadStatusSource: "auto"` to that same `.set({...})`**. This is the model for both sites.

`reserveTrialSelfService` update block (lines 294-302) — add one field:
```typescript
await tx.update(schema.users)
  .set({
    status: "prueba" as const,
    leadStatus: "en_seguimiento" as const,
    leadStatusSource: "auto" as const,   // NEW (D-03/D-07)
    createdBy: null,
    branchId: input.branchId,
  })
  .where(eq(schema.users.id, userId));
```

`bookTrial` (D-03): currently `bookTrial` (lines 585-717) inserts the booking but does NOT touch `lead_status`. Add — inside the existing `this.db.transaction` (lines 658-704) — a `tx.update(schema.users).set({ leadStatus: "en_seguimiento", leadStatusSource: "auto" }).where(eq(schema.users.id, input.userId))` so re-booking a Perdido lead resets it. Do NOT change the one-trial-per-life guard (lines 626-650) — D-03 is explicit about not touching that rule.

---

### `el-templo-api/src/modules/subscriptions/service.ts` (MODIFY — `recomputeUserStatus`)

**Analog:** itself, lines 5607-5732. The Ganado hook already sets `lead_status='ganado'` in the LEFT-TO-RIGHT `UPDATE users u SET ...` (lines 5649-5664). Add a `u.lead_status_source = 'auto'` assignment inside the SAME `tx.execute(sql...)` UPDATE, gated on the same conversion condition, so the legitimate automatism marks source `auto` (D-07 — auto CAN overwrite a manual Perdido on genuine purchase).

**CRITICAL ordering constraint** (documented lines 5627-5634): assignments are evaluated LEFT-TO-RIGHT and the lead branches gate on `u.converted_at IS NULL`. Put the new `u.lead_status_source` assignment alongside `u.lead_status` (BEFORE `u.converted_at` is written), gated on the same `converted_at IS NULL` + active-sub + `is_trial` EXISTS conditions. Do NOT reorder existing assignments.

---

### `el-templo-api/src/modules/members/service.ts` `updateLead` (MODIFY — source manual)

**Analog:** itself, lines 1099-1178. The manual PATCH must stamp `lead_status_source='manual'` (D-04/D-07). Add to the `updateData` object (built at lines 1135-1147) whenever the caller touches `leadStatus` (or unconditionally when this endpoint is hit — it is the manual path by definition):
```typescript
const updateData: Partial<typeof schema.users.$inferInsert> = {};
if (input.leadStatus !== undefined) {
  updateData.leadStatus = input.leadStatus;
  updateData.leadStatusSource = "manual";   // NEW (D-04)
}
```
Keep the existing `ganado ⇔ purchased_plan_id` invariant (lines 1149-1171) untouched; when the invariant auto-promotes to `'ganado'` (line 1170) also set `leadStatusSource = "manual"` since it originated from a manual PATCH.

---

### `el-templo-api/src/modules/members/service.ts` lead creation (MODIFY — source auto)

**Analog:** the alta-de-lead path (~869/1061, cited in CONTEXT) and the self-service setter at `trials-service.ts:298`. When a lead is born with `leadStatus: "en_seguimiento"`, also set `leadStatusSource: "auto"` in the same insert/update `.values({...})`/`.set({...})`.

---

### `el-templo-api/test/expire-lost-leads.test.ts` (NEW — integration)

**Analog:** `test/reports-trial-sessions.test.ts` (header/coverage-list style, direct Drizzle seeding of users+bookings+schedules+attendance) + `test/helpers.ts` (`createTestApp`, `cleanAllTestData`, `createStaffUser`, `getAuthToken`).

**Import + lifecycle skeleton** (`reports-trial-sessions.test.ts:28-40`):
```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData } from "./helpers";
import * as schema from "../src/db/schema";
import { runExpireLostLeads } from "../src/jobs/expire-lost-leads";
```

**Test the invocable `runExpireLostLeads(app.db)` directly** (mirrors how job sweeps are tested — no cron wait), seeding leads via Drizzle. Required cases (specifics line 79): (1) vence básico, (2) no-vence dentro de ventana, (3) no-pisa `source='manual'`, (4) reset al re-agendar (call bookTrial/reserveTrialSelfService then assert `en_seguimiento`), (5) lee X de `system_settings` (seed a custom `leads.perdido_window_days` and assert boundary), (6) p90/default del seed.

**`cleanAllTestData` registration — VERIFY, do not blindly add:**
- `schema.systemSettings` is **already** in `TABLES_TO_CLEAN` (`helpers.ts:216`) — the settings key will be wiped between tests, so seed it per-test.
- The new `users.lead_status_source` column needs **no** registration (columns aren't listed; only tables).
- The backfill's `users_lead_backup_0183` is a `CREATE TABLE AS` (like `users_lead_backup_0170`) — **not** a Drizzle-schema table, so it is NOT in `TABLES_TO_CLEAN` and needs no registration. (This exact area — missing table registration — bit CI historically; confirmed here that nothing new must be added.)

## Shared Patterns

### SQL DATE domain (never JS Date math for day windows)
**Source:** `notification-cron.ts:223-234`, `mark-no-shows.ts:108` (`bookings.bookingDate < today`), `0170:117` (`b.booking_date < CURDATE()`).
**Apply to:** cron query, backfill migration, seed p90 window. Keep `booking_date` comparisons in `CURDATE()` / `DATE_ADD(..., INTERVAL n DAY)`.

### Cron error handling + conditional info logging
**Source:** `mark-no-shows.ts:203-213`, `notification-cron.ts:498-504`.
**Apply to:** the new job. Wrap the sweep in try/catch, `log.error({ err }, "...failed")`, and only `log.info` counters when work was done.

### Migration file discipline
**Source:** `0170:1-27`, `0166:5-8`, skill `el-templo-db-migrations`.
**Apply to:** both new migrations. Hand-written, numbered by filename (verify max > 0180/0181), no `;` in `--` comments, idempotent seed, backup-before-mutate, SQL committed with the schema change.

### "Última booking is_trial no cancelada" derivation (single source of truth)
**Source:** `0170:98-118` (MAX(id) per member, `is_trial=1 AND booking_status <> 'cancelado'`), same semantics as `ReportsService.getTrialSessionsReport`.
**Apply to:** cron query, backfill, and p90 seed — all three must count the same booking so cron/report/backfill never disagree.

### system_settings read/upsert
**Source:** `settings/service.ts:37-60` (getFlag/setFlag) + `settings/keys.ts` (canonical key literal) + `streaks/service.ts:270-285` (multi-key read).
**Apply to:** X-window reader. Reuse the module; declare the key literal ONCE.

## No Analog Found

None. Every file has a strong in-repo precedent.

## Metadata

**Analog search scope:** `el-templo-api/src/jobs/`, `el-templo-api/src/db/schema/`, `el-templo-api/src/db/migrations/`, `el-templo-api/src/modules/{subscriptions,scheduling,members,settings,streaks,reports}/`, `el-templo-api/test/`
**Files scanned:** ~14 (mark-no-shows, notification-cron, users schema, system-settings schema, settings service+keys, 0170 + 0166 migrations, subscriptions/service recomputeUserStatus, members/service updateLead, trials-service, reports/service, test/helpers, reports-trial-sessions.test)
**Pattern extraction date:** 2026-07-15
