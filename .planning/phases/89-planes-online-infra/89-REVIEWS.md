---
phase: 89
reviewers: [claude]
reviewed_at: 2026-04-04T15:00:00Z
plans_reviewed:
  [
    89-01-PLAN.md,
    89-02-PLAN.md,
    89-03-PLAN.md,
    89-04-PLAN.md,
    89-05-PLAN.md,
    89-06-PLAN.md,
    89-07-PLAN.md,
  ]
---

# Cross-AI Plan Review — Phase 89

## Claude Review (Separate Session)

### Overall Assessment

The 7 plans are well-structured, clearly scoped, and correctly decomposed into a logical wave sequence. D-07 REVISED is consistently enforced throughout — every plan explicitly excludes `goalPlanType` from `subscription_plans` and plan-level types. The plans demonstrate deep familiarity with the codebase and production concerns.

### Per-Plan Findings

#### Plan 01 — DB Migration + Schema TS Files (Risk: LOW)

**Strengths:**

- Correct 3-phase pattern for `plan_category`: ADD nullable → UPDATE → MODIFY NOT NULL (avoids data loss)
- Explicit instruction to read existing AURA enum values before MODIFY COLUMN — critical for MySQL
- DayId prefix update (P- → GP-) covers both `sessions` and `completed_sessions`
- D-07 REVISED correctly applied: `personalizada_type` DROPPED from `subscription_plans`, not renamed

**Concerns:**

- **HIGH** — Section 7 AURA enum MODIFY: Hardcoded example enum values could mislead executor into copy-pasting without reading actual schema. If executor misses even one existing value, MySQL silently drops rows.
- **MEDIUM** — Section 6 dayId UPDATE: `CONCAT('GP', SUBSTRING(day_id, 2))` converts `P-` prefix but doesn't verify no other non-personalizada dayIds start with `P-`. `WHERE day_id LIKE 'P-%'` guard is good but should be validated against production data.
- **MEDIUM** — No DOWN migration or rollback SQL documented. Failed migration could leave DB in partial state.
- **LOW** — Index rename behavior on `RENAME TABLE` is MySQL engine-dependent — not explicitly handled.

**Suggestions:**

- Add a Section 0 that queries and logs existing AURA enum values as safety check
- Add `IF EXISTS` guards on DROP COLUMN for idempotency
- Document rollback SQL at minimum

#### Plan 02 — API Module Rename (Risk: MEDIUM)

**Strengths:**

- Comprehensive scope: covers all 3 consuming modules (subscriptions, sessions, aura)
- `isOnlinePlan()` and `isGoalPlan()` helper functions prevent scattered enum comparisons
- DayId prefix change propagated to service-level code
- Spanish error message updates included

**Concerns:**

- **HIGH** — Plan says "Delete old module, create new" but doesn't instruct `git mv` for preserving file history
- **HIGH** — `member-routes.ts` changes underspecified — multiple endpoints may use `isPersonalizada` differently. Executor needs to trace ALL usages, not just listed ones
- **MEDIUM** — Verification grep covers only `src/modules/subscriptions/ sessions/ aura/` but misses other modules (admin, booking, programs, attendance). Need repo-wide grep
- **MEDIUM** — Route path change `/personalizadas` → `/goal-plans` is breaking API change. No backward compatibility or deployment coordination noted
- **LOW** — `assignPlan()` existing logic around `selectPersonalizada()` may have downstream effects beyond the TODO placeholder

**Suggestions:**

- Add explicit instruction to use `git mv` for module rename
- Expand verification grep to ALL of `src/modules/`
- Add note about breaking API change and deployment coordination

#### Plan 03 — Test Updates (Risk: LOW)

**Strengths:**

- Separate tasks for helpers+main-test vs consuming-tests
- FK ordering concern called out for `cleanAllTestData`
- Full `pnpm test` as acceptance criterion
- D-07 REVISED correctly applied in test fixtures

**Concerns:**

- **MEDIUM** — `files_modified` has 7 files but there could be more test files referencing personalizada
- **MEDIUM** — Delete old directory without verifying contents first
- **LOW** — MON-09 behavioral test deferred to Plan 06

#### Plan 04 — Admin UI Restructure (Risk: MEDIUM)

**Strengths:**

- `PLAN_CATEGORY_LABELS`, `PLAN_CATEGORY_COLORS` centralized (DRY)
- Weekly price as computed, not stored
- ProgramEnrollmentSection.vue deletion per D-36
- AssignPlanDialog reuses existing `confirmStep` pattern

**Concerns:**

- **HIGH** — Task 1 touches ~15 files with both renames and structural changes. Hard to verify incrementally.
- **MEDIUM** — Weekly price formula `priceRegular / 4.33` assumes monthly billing. For non-30-day plans (60, 90 days), this gives wrong values. Should be `priceRegular / (durationDays / 7)` or clarify that priceRegular is always monthly.
- **MEDIUM** — `goalPlanType` badge colors hardcoded instead of centralized as constant
- **LOW** — PlanFormDialog program selector has no empty-state for when no programs exist

**Suggestions:**

- Fix weekly price formula to account for variable durations
- Centralize goalPlanType badge colors
- Add empty-state for program selector

#### Plan 05 — Member App Rename (Risk: MEDIUM)

**Strengths:**

- DurationPicker.vue deletion explicitly specified
- WhatsApp CTA template with `encodeURIComponent`
- Progression module files included
- Boot/modules.ts import path update included

**Concerns:**

- **HIGH** — Same weekly price formula issue (`priceRegular / 4.33` for variable-duration plans)
- **MEDIUM** — Task 1 is enormous: 9-file module rename + progression module + training module + user store
- **MEDIUM** — `hasActivePersonalizada` → `hasActiveGoalPlan` rename: consuming components not all listed
- **LOW** — PlanesPage filtering logic may need updating beyond label changes

#### Plan 06 — Auto-Enrollment + Dual Subscription (Risk: MEDIUM)

**Strengths:**

- Enrollment lifecycle for all 3 flows: assign, change, renew
- Cancel existing enrollment before creating new (prevents duplicates)
- Dual constraint query correctly uses `isOnlinePlan()` helper
- Price override verification included (MON-10)

**Concerns:**

- **HIGH** — `changePlan()` enrollment logic: how does service know OLD plan's `linkedProgramId`? Query needs specification.
- **HIGH** — Race condition on dual constraint: concurrent requests could bypass application-level check. Consider DB unique constraint or SELECT FOR UPDATE.
- **MEDIUM** — `renewPlan()`: detection of completed vs active enrollment not specified (check `status` + `currentWeek` vs `program.durationWeeks`)
- **LOW** — MON-09 test is semi-optional ("may already be verified")

**Suggestions:**

- Specify query for old plan's linkedProgramId in changePlan()
- Consider DB-level constraint for category group
- Make MON-09 test non-optional

#### Plan 07 — Pipeline Calibration (Risk: LOW)

**Strengths:**

- Non-autonomous: appropriate for human-judgment work
- Decision checkpoint with 3 clear options
- Cross-references known bugs in REP_COUNT_DIAGNOSIS.md
- Acceptance criteria require numeric values

**Concerns:**

- **MEDIUM** — No DB connection setup instructions
- **MEDIUM** — Report structure not specified
- **LOW** — Code changes completely unspecified (by design — depends on findings)

### Cross-Plan Concerns

#### 1. Weekly Price Formula (HIGH — Plans 04, 05)

Both use `Math.round(priceRegular / 4.33)` which assumes 30-day plans. For 60/90-day plans, gives wrong weekly price. Should be `priceRegular / (durationDays / 7)` or confirm `priceRegular` is always monthly regardless of duration.

#### 2. Repo-wide Grep Coverage (MEDIUM — Plans 02-05)

Each plan greps its own directory but no plan does a monorepo-wide sweep for orphan references. Need final `grep -r "personalizada|isPersonalizada|isOnline" --include="*.ts" --include="*.vue"` across entire repo.

#### 3. Deployment Coordination (MEDIUM — Plans 02, 05)

API route change `/personalizadas/` → `/goal-plans/` is breaking. Plans 02 (API, Wave 2) and 05 (member app, Wave 3) deploy at different times. Needs coordinated deployment or temporary dual-route support.

#### 4. D-07 REVISED Compliance (PASS)

Verified across all 7 plans: `goalPlanType` consistently on `micro_programs` only. No plan adds it to subscription_plans or plan-level types.

#### 5. Missing Admin Module References (MEDIUM — Plan 02)

Admin module (`src/modules/admin/`) likely references `personalizadaType` for session editing/generation/approval. Not mentioned in Plan 02.

### Summary Scorecard

| Plan | Risk   | Completeness | D-07 | Key Concern                            |
| ---- | ------ | ------------ | ---- | -------------------------------------- |
| 01   | LOW    | 95%          | PASS | AURA enum safety                       |
| 02   | MEDIUM | 85%          | PASS | Grep scope narrow, admin module missed |
| 03   | LOW    | 90%          | PASS | Test file discovery                    |
| 04   | MEDIUM | 85%          | PASS | Task size, weekly price formula        |
| 05   | MEDIUM | 85%          | PASS | Weekly price formula, task size        |
| 06   | MEDIUM | 80%          | PASS | changePlan enrollment lifecycle        |
| 07   | LOW    | 90%          | N/A  | Appropriately scoped                   |

**Overall Phase Risk: MEDIUM**

---

## Consensus Summary

_Single reviewer — consensus analysis not applicable. Key findings below._

### Top Concerns (by severity)

1. **Weekly price formula wrong for non-monthly plans** (HIGH, Plans 04+05) — `priceRegular / 4.33` assumes 30-day duration
2. **Verification grep scope too narrow** (MEDIUM, Plans 02-05) — each plan greps its own dir, no monorepo sweep
3. **Breaking API route change uncoordinated** (MEDIUM, Plans 02+05) — `/personalizadas/` → `/goal-plans/` with different deploy waves
4. **changePlan() enrollment lifecycle underspecified** (HIGH, Plan 06) — old plan's linkedProgramId query missing
5. **Task size in Plans 04, 05** (MEDIUM) — 15+ files per task, hard to verify incrementally

### Strengths Confirmed

- D-07 REVISED compliance is perfect across all 7 plans
- Wave structure with dependency ordering is sound
- Decision checkpoint on Plan 07 (pipeline calibration) is well-designed
- Helper functions (`isOnlinePlan()`, `isGoalPlan()`) prevent scattered comparisons

### Items Worth Investigating

- Whether `priceRegular` is always monthly or total plan price (determines if formula needs fixing)
- Whether any admin module routes reference `personalizadaType` (gap in Plan 02)
- Race condition on dual subscription constraint (application vs DB-level enforcement)

---

_Review conducted: 2026-04-04_
_Reviewer: Claude (separate session via `claude -p`)_
