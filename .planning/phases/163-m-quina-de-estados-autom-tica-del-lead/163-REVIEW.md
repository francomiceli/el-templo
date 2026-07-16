---
phase: 163-m-quina-de-estados-autom-tica-del-lead
reviewed: 2026-07-15T18:23:46Z
depth: deep
files_reviewed: 12
files_reviewed_list:
  - el-templo-api/src/db/schema/users.ts
  - el-templo-api/src/db/migrations/0182_lead_status_source.sql
  - el-templo-api/src/db/migrations/0183_backfill_lost_leads.sql
  - el-templo-api/src/db/scripts/0183_backfill_lost_leads_dryrun.sql
  - el-templo-api/src/jobs/expire-lost-leads.ts
  - el-templo-api/src/index.ts
  - el-templo-api/src/modules/settings/keys.ts
  - el-templo-api/src/modules/settings/service.ts
  - el-templo-api/src/modules/scheduling/trials-service.ts
  - el-templo-api/src/modules/subscriptions/service.ts
  - el-templo-api/src/modules/members/service.ts
  - el-templo-api/test/expire-lost-leads.test.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: resolved
---

# Phase 163: Code Review Report

**Reviewed:** 2026-07-15T18:23:46Z
**Depth:** deep
**Files Reviewed:** 12 (source) + 4 test files
**Status:** issues_found

## Summary

Phase 163 implements the automatic lead state machine: a daily cron
(`expire-lost-leads.ts`) that flips stale "En seguimiento" leads to "Perdido",
a `lead_status_source` audit column (auto/manual), a configurable window seeded
from the p90 (migration 0182), and a retroactive backfill (0183) with a
count-only dry-run script.

The core correctness axes the phase flags as risky all check out:

- **Predicate coherence (cron ⇄ backfill ⇄ dry-run ⇄ 0182 seed ⇄ report).** All
  five use the identical "last non-cancelled trial" derivation
  (`MAX(id) WHERE is_trial=1 AND booking_status <> 'cancelado' GROUP BY member_id`),
  verified byte-for-byte against `ReportsService.getTrialSessionsReport`
  (reports/service.ts:1498-1508). `booking_status` is `NOT NULL DEFAULT 'reservado'`
  and `'cancelado'` is the only cancel state, so `<> 'cancelado'` is null-safe.
- **Mass-UPDATE guards.** Both cron flip and 0183 gate on `lead_status IN
  (en_seguimiento, NULL)`, `converted_at IS NULL`, `purchased_plan_id IS NULL`,
  `deleted_at IS NULL`, and `(source <> 'manual' OR source IS NULL)`. Manual
  states are never overwritten; converted/planned/deleted rows are untouched.
- **Enum byte-identity.** `mysqlEnum("lead_status_source", ["auto","manual"])`
  matches `enum('auto','manual')` in 0182 — column name and value list identical.
- **LEFT-TO-RIGHT ordering in `recomputeUserStatus`.** The new
  `lead_status_source` assignment sits BEFORE `purchased_plan_id` and
  `converted_at`, gates on `converted_at IS NULL`, and references neither
  `lead_status` nor `purchased_plan_id`. The conversion gate still reads the
  pre-write `converted_at`; no regression to the D-32 first-conversion semantics.
- **Seed idempotency.** 0182 uses `INSERT ... SELECT ... WHERE NOT EXISTS`, so a
  re-run never clobbers an operator-set value; the `ALTER ... ADD COLUMN` is
  covered by the runner's duplicate-column skip.
- **Semicolon-in-comment trap.** Neither 0182 nor 0183 has a `;` inside a `--`
  comment (only the two statement terminators each). Safe for the split-first
  parser.
- **One-trial-per-life.** The bookTrial / reserveTrialSelfService resets are
  additive updates inside the existing tx; the lifetime guard is untouched.

Two WARNINGs and four INFO items below.

## Warnings

### WR-01: `status IN ('prueba','freemium')` deviates from LOCKED D-02 and risks the "NULL for freemium" invariant

**File:** `el-templo-api/src/jobs/expire-lost-leads.ts:63`, `el-templo-api/src/db/migrations/0183_backfill_lost_leads.sql:54`, `el-templo-api/src/db/scripts/0183_backfill_lost_leads_dryrun.sql:31`

**Issue:** D-02 (LOCKED, 163-CONTEXT.md:20) specifies the candidate set as
`users.status='prueba'`. The cron, the backfill, and the dry-run all widen this
to `status IN ('prueba','freemium')`. Two concerns:

1. `users.ts:66` documents the Phase 114 invariant: `lead_status` is
   "NULL for staff/freemium/activo/inactivo". The candidate predicate treats
   `lead_status IS NULL` as eligible, so any `freemium` user with a *non-cancelled*
   `is_trial` booking would be flipped from `lead_status = NULL` to `'perdido'`
   (source `'auto'`), directly contradicting that documented invariant.
2. It changes the retroactive scope: the backfill's ~112-row reference count
   (D-08) was reasoned over "En seguimiento" `prueba` leads; including `freemium`
   moves the target and must be reconciled against the dry-run number before
   0183 runs on prod (the deploy does not back up the DB).

In practice the only `prueba→freemium` path (trials-service.ts:564) cancels the
trial booking, so a `freemium` user with a non-cancelled trial should not
normally exist — which is likely why no test exercises it. But relying on that
implicit coupling to keep a LOCKED decision satisfied is fragile: any future
path that lands a `freemium` user on a live trial booking silently violates the
invariant, against prod data.

**Fix:** Either (a) tighten to `status = 'prueba'` to match LOCKED D-02 across all
three predicates, or (b) if `freemium` inclusion is intentional, amend D-02 with
the rationale and add an integration test proving a `freemium` lead with a live
trial is (or is not) expired. Confirm the dry-run count on prod reflects the
widened scope before applying 0183.

### WR-02: Window-value coercion diverges between the cron (TS) and the backfill/dry-run (SQL)

**File:** `el-templo-api/src/modules/settings/service.ts:104`, `el-templo-api/src/db/migrations/0183_backfill_lost_leads.sql:59`, `el-templo-api/src/db/scripts/0183_backfill_lost_leads_dryrun.sql:36`

**Issue:** The phase requires cron, backfill and dry-run to compute the same
window X. They coerce the stored `setting_value` differently:

- Cron: `getPerdidoWindowDays()` → `Number(...)`, then
  `Number.isFinite(n) && n > 0 ? Math.trunc(n) : 14`.
- Backfill/dry-run: `GREATEST(CAST(ss.setting_value AS SIGNED), 1)`.

Divergences for degenerate values (0182 always seeds a clean integer, so these
only arise from a manual PUT / operator edit):

- `setting_value = '0'` or negative → cron returns **14**, but the SQL returns
  **1**. The cron and the backfill would then classify a different set of leads
  as Perdido.
- Fractional value (e.g. `'18.9'`) → cron truncates to `18` (asserted in
  `leads-perdido-window.test.ts:71`), while MySQL `CAST('18.9' AS SIGNED)`
  rounds to `19`.
- Key absent → cron defaults to `14`; the SQL scalar subquery returns `NULL`,
  making `DATE_ADD(..., INTERVAL NULL DAY) < CURDATE()` NULL, so the backfill
  silently flips **nothing** (safe, but silently inconsistent with the cron).

**Fix:** Make the SQL match the reader's contract — e.g. wrap the subquery so a
non-positive/non-numeric/absent value falls back to 14 (not 1, not NULL):
`COALESCE(NULLIF(GREATEST(CAST(ss.setting_value AS SIGNED), 0), 0), 14)` with a
default of 14 when the row is missing — or, cleaner, have the backfill read X
through the same TS reader before executing the UPDATE. At minimum document that
0182 guarantees an integer ≥ 1 and treat any manual edit outside that as
operator error.

## Info

### IN-01: bookTrial / reserveTrialSelfService reset is unconditional, not Perdido-scoped

**File:** `el-templo-api/src/modules/scheduling/trials-service.ts:676-682`, `:294-303`

**Issue:** D-03 phrases the reset as "Perdido → En seguimiento", but the update
sets `lead_status='en_seguimiento'` + `source='auto'` for `input.userId`
unconditionally on every re-booking. For an already-`en_seguimiento` lead whose
source was `'manual'`, this silently flips the source back to `'auto'`. Benign
(re-booking is a legitimate automatism, and a `prueba` user cannot be `ganado`),
but broader than the decision's wording. Worth a one-line comment or a
`WHERE lead_status = 'perdido'`-style narrowing if manual `en_seguimiento`
should survive a re-book.

**Fix:** Either narrow the reset to `lead_status <> 'en_seguimiento'` rows, or
document that any trial re-booking is defined to reassert the automatism.

### IN-02: Test coverage gaps around the widened scope and the conversion stamp

**File:** `el-templo-api/test/expire-lost-leads.test.ts`, `el-templo-api/test/lead-status-transitions.test.ts`

**Issue:** No test covers (a) a `freemium`-status lead being expired (the very
scope-widening in WR-01), (b) a lead with `lead_status = NULL` (not
`en_seguimiento`) being flipped — only `en_seguimiento` seeds are used, (c) the
purchase hook (`recomputeUserStatus`) stamping `source='auto'` on conversion —
transitions cover alta/PATCH/reset but not the compra path, and (d) the WR-02
coercion divergence (cron vs SQL for `'0'` / fractional). Per CLAUDE.md ("err on
the side of too many tests"), these edge/failure paths should be asserted.

**Fix:** Add cases for freemium expiry, NULL-lead_status flip, the compra→auto
stamp, and a divergence guard once WR-02 is resolved.

### IN-03: Misleading comment — `INTERVAL ${windowDays} DAY` is parameter binding, not string interpolation

**File:** `el-templo-api/src/jobs/expire-lost-leads.ts:54-56, 64`

**Issue:** The comment states "su interpolación en `INTERVAL ... DAY` es segura".
Drizzle's `sql\`...\`` renders `${windowDays}` as a bound `?` placeholder (passed
as a value to mysql2), not a literal interpolation. The behavior is safe either
way (validated integer), but the comment mischaracterizes the mechanism, which
could mislead a future reader reasoning about injection or about whether
`INTERVAL ?` is even legal.

**Fix:** Reword to "bound as a query parameter" and note `windowDays` is a
validated positive integer from `getPerdidoWindowDays`.

### IN-04: 0183 backup table `CREATE TABLE ... AS` is not guarded for re-run

**File:** `el-templo-api/src/db/migrations/0183_backfill_lost_leads.sql:34-38`

**Issue:** `CREATE TABLE users_lead_backup_0183 AS SELECT ...` (following the 0170
precedent) has no `IF NOT EXISTS`. On a partial-failure re-run the runner
tolerates the "already exists" error and, per its skip-all-subsequent-errors
heuristic, proceeds to re-run the UPDATE — which is fine because the UPDATE is
idempotent (converted rows and already-`perdido` rows fall out of the predicate).
The residual risk is only that the backup then reflects the *pre-first-run*
snapshot, which is the desired audit state anyway. No change required; noting for
the record so a future editor does not "fix" it into a genuinely destructive
re-run.

**Fix:** None required. Optionally document the re-run semantics in the header
comment.

---

_Reviewed: 2026-07-15T18:23:46Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_

## Resolución post-review (2026-07-15)

- **WR-01 — CORREGIDO** (`26211449`): candidato restringido a `status='prueba'` en cron, migración 0183 y dry-run (predicados consistentes). Test nuevo: freemium vencido queda intacto (cron caso 6, backfill caso e).
- **WR-02 — CORREGIDO** (`26211449`): coerción unificada — ausente/inválido/≤0/fraccional → default 14 en ambos dominios (SQL ahora usa COALESCE + CASE/FLOOR espejando getPerdidoWindowDays). Test nuevo: setting '0' → ventana efectiva 14 (cron caso 7, backfill caso f).
- **Extra** (`13b04f08`): bug latente de timezone en `dateDaysAgo` de los tests (calculaba en UTC; CURDATE() del server es ART) — corregido a fecha local. Los 13 tests de los 2 archivos verdes.
- IN-01..IN-04 quedan como info (sin acción, documentados).
- Nota: 0183 se re-editó después de aplicada en dev local (runner trackea por archivo); staging/prod correrán la versión corregida — anotado en el header de la migración.
