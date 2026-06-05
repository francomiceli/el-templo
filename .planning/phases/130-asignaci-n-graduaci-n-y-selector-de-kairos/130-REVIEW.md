---
phase: 130-asignaci-n-graduaci-n-y-selector-de-kairos
reviewed: 2026-06-05T06:11:21Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - el-templo-api/src/db/migrations/0141_kairos_default_and_level_override.sql
  - el-templo-api/src/db/schema/users.ts
  - el-templo-api/src/modules/auth/routes.ts
  - el-templo-api/src/modules/members/service.ts
  - el-templo-api/src/modules/members/graduation-service.ts
  - el-templo-api/src/modules/shared/training-constants.ts
  - el-templo-api/src/modules/sessions/routes.ts
  - el-templo-api/src/modules/goal-plans/routes.ts
  - el-templo-api/src/modules/attendance/service.ts
  - el-templo-admin/src/components/MemberFormDialog.vue
  - el-templo-app/src/modules/onboarding/types.ts
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: clean
fix_applied: 2026-06-05
fix_notes: >-
  CR-01 (level_override gated on actual level change) and WR-02 (graduation
  counts COUNT(DISTINCT date)) fixed and committed atomically on staging.
  WR-01 was subsumed by the CR-01 regression test (real-client full-payload
  shape). IN-01 (per-call GraduationService instantiation) and IN-02
  (kairos/alfa adjacent self-pick) left as noted — cosmetic/non-defect.
---

# Phase 130: Code Review Report

**Reviewed:** 2026-06-05T06:11:21Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Reviewed the Phase 130 backend (migration 0141, default-flip, `GraduationService` + its 3 wire-in sites, the `level_override` sticky-flag path) and the two selectors (admin `MemberFormDialog` / alumnos pages, app onboarding types).

The migration is correctly additive (DEFAULT flip + new column only, no row mutation, enum order byte-identical to schema/0140, no `;` in comments). Auto-graduation is genuinely one-way, override-aware, idempotent, and race-safe: the level-scoped `UPDATE ... WHERE id=? AND level='kairos'` means two concurrent completions crossing the threshold cannot double-promote or land on a wrong level. All three completion paths are wired and each is `try/catch`-guarded so a graduation failure can never roll back the completion. The graduation tests assert real DB outcomes (not vacuous). New-member paths are flipped to `kairos` with no surviving `level: "alfa"` creation site (legacy CSV import is the documented exemption). Selectors render Kairos via glyph/name maps with a warm `amber` palette, no raw `"kairos"` leak, no `any`, no `console.log`.

One blocker, however, defeats the feature's headline behavior in production: the sticky-override flag is set on *presence* of `input.level`, but the real admin edit form always sends the member's current level — so any routine profile edit silently sets `level_override=true` and permanently disables auto-graduation. The "invariant" regression test passes only because it tests a payload (level omitted) that the real client never sends.

## Critical Issues

### CR-01: Sticky override set on level *presence*, not on level *change* — any admin profile edit permanently disables auto-graduation

**File:** `el-templo-api/src/modules/members/service.ts:1051-1064` (and client `el-templo-admin/src/components/MemberFormDialog.vue:910-920`)

**Issue:** `updateMember` sets `updateData.levelOverride = true` whenever `input.level !== undefined`, regardless of whether the level actually changed:

```ts
if (input.level !== undefined) {
  updateData.level = input.level as ...;
  // comment claims: "Only set on a level change"
  updateData.levelOverride = true;   // ← fires even when level is unchanged
}
```

The code comment asserts "Only set on a level change — a non-level edit leaves the flag untouched (D-05 invariant)." That is false: it keys off `input.level !== undefined`, not off a value change. The real admin edit form (`MemberFormDialog.vue` submit) **always** includes `level: form.value.level` in the edit payload (populated from `props.member.level` at line 780), so editing a phone number / DNI / name on a member sends the member's *current* level and the backend flips `level_override=true`.

Consequence: a brand-new `kairos` member is set to override the first time an admin touches their profile (adding DNI, fixing a name during trial→alumno onboarding — extremely common). From that point `maybeGraduateKairos` early-returns on `member.levelOverride` and the member **never auto-graduates to alfa**. The phase's headline KAIROS-05 behavior is silently dead for essentially every member in practice. This is a correctness/data-integrity defect, not a style issue: the `level_override` column gets poisoned by edits that were never a coach level decision, and there is no path to clear it.

The 130-01 regression test that claims to protect this invariant (`kairos-default-and-override.test.ts` test 5) only passes because it sends `payload: { phone: ... }` with `level` **omitted** — a payload shape the production client never emits. It therefore does not exercise the actual production path and gives false confidence.

**Fix:** Gate the flag on an actual value change, comparing against the already-loaded `existing` row:

```ts
if (input.level !== undefined) {
  const newLevel = input.level as
    | "kairos" | "alfa" | "delta" | "sigma" | "omega" | "spartan";
  updateData.level = newLevel;
  // Only a real change is a sticky coach decision (D-03/D-05).
  if (newLevel !== existing.level) {
    updateData.levelOverride = true;
  }
}
```

(`existing` is already fetched at line 1015 and exposes `.level`.) Add a regression test that mirrors the real client: send the **full** edit payload including the unchanged `level` plus a changed phone, and assert `level_override` stays `false`; and a second test sending a *different* level and asserting it becomes `true`.

## Warnings

### WR-01: Invariant regression test does not exercise the production payload shape

**File:** `el-templo-api/test/kairos/kairos-default-and-override.test.ts:202-239`

**Issue:** Test 5 ("...without a level change leaves level + override untouched") sends `payload: { phone: "+5491188889999" }` with `level` omitted. The production admin form always sends `level`, so this test passes while the real flow is broken (see CR-01). The test name promises an invariant it does not actually verify.

**Fix:** Change the PUT payload to include `level` equal to the member's current level alongside the phone change, and assert `levelOverride` stays `false`. After CR-01's fix this will pass for the right reason; today it would fail and correctly flag the bug.

### WR-02: Attendance presencial mirror can insert duplicate completed-session rows, inflating the graduation count

**File:** `el-templo-api/src/modules/attendance/service.ts:732-741`

**Issue:** `recordPresencialSession` does an unconditional `INSERT` of a `completedSessions` row with `dayId: presencial-${dateStr}` (no upsert, no unique guard visible at this site, unlike the sessions/goal-plans paths which check for an existing row). If a member is checked in more than once for the same day (coach re-check-in, force check-in, waitlist promotion + manual check-in — all flows flagged in the attendance audit), multiple identical `presencial-<date>` rows are inserted. Because `maybeGraduateKairos` counts `COUNT(*)` of total `completed_sessions`, duplicate mirror rows inflate the count and can graduate a member before they have actually completed `THRESHOLD` distinct sessions. The sessions-completion path mitigates this by counting `COUNT(DISTINCT date)` for its "days trained" stat, but graduation uses raw `COUNT(*)`. Phase 130 introduced the count-based promotion that makes this pre-existing duplicate-insert behavior newly consequential.

**Fix:** Either (a) make the graduation count dedupe per training-day (`COUNT(DISTINCT date)`), matching how "days trained" is already computed in `sessions/routes.ts`, which also better matches the "12 sessions ≈ 1 month at 3×/week" intent; or (b) make the presencial mirror upsert / dedupe on `(userId, dayId)` so a same-day re-check-in cannot create a second row. Option (a) is the more robust single-point fix since it also covers any other duplicate-row source.

## Info

### IN-01: Graduation service instantiated per-call inside attendance, inconsistent with the plugin-scope pattern elsewhere

**File:** `el-templo-api/src/modules/attendance/service.ts:746`

**Issue:** `recordPresencialSession` does `new GraduationService(this.db, this.log)` on every call, whereas `sessions/routes.ts` and `goal-plans/routes.ts` instantiate once at plugin scope. The service is stateless so this is harmless, but it is a minor inconsistency. Documented as intentional in 130-02 (AttendanceService has no class-level service field). Acceptable; noting for consistency only — a class-level field would align it.

### IN-02: Onboarding self-pick shows "α Kairos" and "α Alfa" as visually adjacent near-identical options

**File:** `el-templo-app/src/modules/onboarding/types.ts:353-354`

**Issue:** The level self-pick now lists `{ value: 'kairos', label: 'α Kairos' }` immediately above `{ value: 'alfa', label: 'α Alfa' }`. Both share the α glyph (by design — kairos inherits alfa content), so a beginner self-identifying may not perceive a meaningful distinction between the first two boxes. Not a defect (level is server-reassignable and auto-graduation handles the lifecycle), but the two warmest-tier options are hard to differentiate at a glance. Consider a sub-label ("nivel inicial") on Kairos if UAT surfaces confusion.

---

_Reviewed: 2026-06-05T06:11:21Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
