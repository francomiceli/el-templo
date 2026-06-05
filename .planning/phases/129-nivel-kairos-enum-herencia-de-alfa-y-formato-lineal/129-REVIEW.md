---
phase: 129-nivel-kairos-enum-herencia-de-alfa-y-formato-lineal
reviewed: 2026-06-05T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - el-templo-api/src/db/migrations/0140_add_kairos_level_enum.sql
  - el-templo-api/src/db/schema/users.ts
  - el-templo-api/src/db/schema/completed-sessions.ts
  - el-templo-api/src/modules/sessions/pipeline/utils/kairos.ts
  - el-templo-api/src/modules/sessions/pipeline/stage-3-budget.ts
  - el-templo-api/src/modules/sessions/pipeline/stage-5-format.ts
  - el-templo-api/src/modules/sessions/pipeline/stage-6-exercises.ts
  - el-templo-api/src/modules/sessions/pipeline/initium-pipeline.ts
  - el-templo-api/src/modules/sessions/fallback/format-fallback.ts
  - el-templo-api/src/modules/sessions/pipeline/utils/level-mapping.ts
  - el-templo-api/test/unit/kairos-gate.test.ts
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: clean
fix_applied: 2026-06-05
fix_note: >-
  All 4 warnings fixed (WR-01 generateWeek materializes the kairos variant;
  WR-02 forcedFormat no longer bypasses the kairos linear gate + regression
  test; WR-03 level-counts response enum + typed generate body accept kairos;
  WR-04 ROM-day reads map kairos->alfa). Info items noted, not fixed: IN-01
  (INITIUM format-compatibility whitelist warning noise — cosmetic trace only),
  IN-02 (no code change required — confirm rung-1 content coverage), IN-03
  (subsumed by WR-03 — memberLevel is now a declared, typed body property).
  Remaining input-filter level enums (members/schemas.ts:160,422,485,600;
  sessions/schemas.ts:11,69; onboarding/routes.ts:74; goal-plans/schemas.ts:116;
  admin/video-schemas.ts:15; admin/routes.ts:971) intentionally deferred to
  phase 130 per WR-03's own guidance (admins must not filter/create by kairos
  before the 130 selector/default lands).
---

# Phase 129: Code Review Report

**Reviewed:** 2026-06-05
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Reviewed the Kairos enum widening (KAIROS-01) and the four-point generation gate (KAIROS-02/03). The **D-07 invariant holds at the four inspected injection points** — every kairos behavior is correctly gated behind `isKairos(ctx.memberLevel)`, the gate is a pure additive branch, the `ContentLevel`/`toContentLevel()` chokepoint correctly routes kairos→alfa for all exercise-content reads (kairos never queries `exercises.level='kairos'`), and the enum migration is byte-identical to the TS schema (`users.level` + `completed_sessions.session_level`, kairos first, DEFAULT alfa). No `any`, no `console.*`, no hardcoded secrets. The unit test asserts real forwarded arguments (not vacuous) and includes a genuine D-07 regression block over alfa AND delta.

However, the gate is **plumbed but effectively unreachable through the real generation workflow**, and there is a **format-precedence path that bypasses the linear-format gate**. These are the load-bearing concerns. The narrower request/response level enums that still exclude `kairos` are latent contract gaps that bite the moment a member actually becomes kairos (phase 130). None of these rise to a security/data-loss Critical, but WR-01 and WR-02 mean the feature does not function end-to-end as specced.

## Warnings

### WR-01: Kairos sessions are never produced by the real generation workflow (`generateWeek`)

**File:** `el-templo-api/src/modules/admin/service.ts:649,714-723`
**Issue:** `generateWeek` is the bulk admin generation path that materializes the approved sessions members actually read. Its level enumeration never includes `kairos`: `levelGroups` defaults to `["alfa_delta","sigma","omega"]` and the `memberLevels` map produces `alfa_delta → ["alfa","delta"]`, etc. — no `kairos` anywhere. A kairos member reads dayId `W{week}-{day}-kairos` (routes.ts:389,443), but no such dayId is ever generated/approved, so `getSessionByDayId(dayId, requireApproved=true)` returns null → the member gets a permanent 404 "Sesion no disponible" (routes.ts:447-451). The gate stages (stage-3/5/6/initium) are correct but only fire when an admin manually `POST /sessions/generate` with an explicit `memberLevel:"kairos"` body — which is not the workflow and is not even a declared schema property (see WR-03). Net effect: the kairos generation layer cannot be exercised by the product as built.
**Fix:** Add kairos to the `alfa_delta` branch of `generateWeek`'s `memberLevels` (so a `W{week}-{day}-kairos` session is generated per day), e.g.:

```ts
const memberLevels: ExerciseLevel[] =
  levelGroup === "alfa_delta"
    ? ["kairos", "alfa", "delta"] // generate the kairos dayId too
    : levelGroup === "sigma"
      ? ["sigma"]
      : ["omega", "spartan"];
```

Note this interacts with WR-02 (sharedFormats) — see that fix before shipping. If kairos generation is intentionally deferred to phase 130, document that 129 ships dead generation code and members cannot be kairos yet.

### WR-02: `forcedFormat` (DEUTEROS_2 + cross-level `sharedFormats`) bypasses the kairos linear-format gate

**File:** `el-templo-api/src/modules/sessions/pipeline/index.ts:77-91`
**Issue:** Stage-5 format selection is short-circuited when `options.forcedFormat` is set: the pipeline assigns the forced format and never calls `selectFormat()` (where the kairos `isKairos` linear-format gate lives, stage-5-format.ts:95). Two cases set a forced format: (a) DEUTEROS_2 always reuses DEUTEROS_1's format; (b) cross-level `sharedFormats` reuses the first-generated level's formats (service.ts:185-193, admin/service.ts:710-763). For a standalone kairos session DEUTEROS_1 still goes through the gate (→ Singlet), so DEUTEROS_2 inherits Singlet and is incidentally fine. But the moment kairos joins `generateWeek` (WR-01 fix), `sharedFormats` captured from alfa/delta (non-linear, e.g. AMRAP/Straight Sets) is forced onto every kairos block — silently violating D-04 (linear only) with no trace and no test catching it. The current test never exercises `forcedFormat`, so the leak is invisible.
**Fix:** Re-apply the kairos gate even when a format is forced — either skip `forcedFormat` for kairos blocks, or pull the kairos linear lookup ahead of the `forcedFormat` branch in `runBlockPipeline`:

```ts
if (!isKairos(ctx.memberLevel) && options?.forcedFormat) {
  // existing forced-format branch
} else {
  ctx5 = await selectFormat(ctx4, db, options?.excludeFormatNames);
}
```

Also exclude kairos from `sharedFormats` capture/propagation in service.ts and admin/service.ts. Add a regression test asserting a kairos DEUTEROS_2 block stays linear even when DEUTEROS_1's format is non-linear.

### WR-03: Several request/response level enums still reject `kairos` (latent contract gaps)

**File:** `el-templo-api/src/modules/members/schemas.ts:761` (and 158, 420, 483, 598); `el-templo-api/src/modules/sessions/schemas.ts:11,69`; `el-templo-api/src/modules/onboarding/routes.ts:74`; `el-templo-api/src/modules/goal-plans/schemas.ts:116`; `el-templo-api/src/modules/spom/schemas.ts:24`; `el-templo-api/src/modules/admin/video-schemas.ts:15`; `el-templo-api/src/modules/admin/routes.ts:971`
**Issue:** The summary claims kairos was threaded "through every typed level union/Record," but the JSON-schema validators were NOT widened. Most are input filters (admin can't filter/create/update by kairos) and are correctly deferred to phase 130. The load-bearing one is a **response** schema: `members/schemas.ts:761` (the level-counts endpoint) validates each row's `level` against `enum:["alfa",...,"spartan"]`. Once any member is `kairos`, the aggregation yields `{level:"kairos", count:N}` and Fastify response serialization will strip/error that row (depending on `removeAdditional`/coerce config). Similarly `POST /sessions/generate` (sessions/schemas.ts) does not declare `memberLevel` at all, so the only way to invoke the kairos gate is to send an undeclared body property — brittle and untyped. These do not fire in phase 129 (no member is kairos yet) but are real once phase 130 lands the default/selector.
**Fix:** Widen the kairos-bearing schemas in lock-step. At minimum, add `"kairos"` to the level-counts response enum (members/schemas.ts:761) and declare `memberLevel` (with kairos) in `generateSessionSchema.body` so the generate path is typed. Track the remaining input enums explicitly as phase-130 work rather than leaving them as a silent gap.

### WR-04: Member ROM-day read maps kairos→delta, so kairos members get a full delta session on ROM days

**File:** `el-templo-api/src/modules/sessions/routes.ts:433,546-550,574-578`
**Issue:** On ROM days the member-read effectiveLevel is computed as `memberLevel === "alfa" ? "alfa" : "delta"`. For a kairos member this evaluates to `"delta"`, so they read dayId `W{week}-{day}-delta` — a standard delta ROM session with delta difficulty and non-linear formats, completely bypassing the kairos linear/2-per-block constraints. This is the inverse of the D-07 leak (kairos content leaking out), but from the member's perspective it breaks the "kairos always trains ultra-simple" promise on ROM days. `generateRomSession` is typed `memberLevel:"alfa"|"delta"` and has no kairos branch, so there is no kairos ROM session to read even if the mapping were fixed.
**Fix:** Decide the intended ROM behavior for kairos and make it explicit. Either (a) map kairos→alfa on ROM days (`memberLevel === "alfa" || isKairos(memberLevel) ? "alfa" : "delta"`) so kairos gets the simplest ROM variant, or (b) add a kairos branch to `generateRomSession` + the ROM read mapping. Document the choice; the current implicit kairos→delta is almost certainly not intended.

## Info

### IN-01: Kairos INITIUM format (Singlet/For Quality) is not in the INITIUM format-compatibility whitelist → warning noise

**File:** `el-templo-api/src/modules/sessions/validators/block-validator.ts:21,100-113`
**Issue:** `FORMAT_COMPATIBILITY.INITIUM = ["EMOM","Couplet","Buy-in","Straight Sets"]`. Kairos forces INITIUM to `Singlet` (or `For Quality`), neither of which matches, so `validateBlock` emits a "Format ... may not be optimal for INITIUM block" warning for every kairos INITIUM. It is a warning only (not an error), so it does NOT block generation (service.ts:310 throws only on `!valid`), but it pollutes every kairos session's trace.
**Fix:** Add `"Singlet"`/`"For Quality"` to the INITIUM (and other roles') allowed-format lists, or special-case kairos in the validator so its forced linear format does not trip the heuristic.

### IN-02: `KAIROS_DIFICULTAD_LINEAL` comment vs naming — confirm `dificultadLineal=1` is the intended Alfa floor, not Alfa's whole range

**File:** `el-templo-api/src/modules/sessions/pipeline/utils/kairos.ts:51-52`; `stage-6-exercises.ts:176-179`
**Issue:** Kairos forces `min=max dificultadLineal=1`, i.e. the single lowest linear rung. Alfa's normal range is `LEVEL_LINEAR_MIN.alfa=1` to `LEVEL_LINEAR_BASE.alfa + bucket` (up to 4). This is consistent with D-03/D-06 ("Alfa exercises at difficulty=1 / lowest linear rung") and matches the test (min=max=1), so it is correct as specced — flagging only to confirm the product intent is "exactly rung 1," because if rung-1 exercises are sparse the candidate pool can be tiny and fall into the fallback ladder frequently. No code change required; verify content coverage at rung 1 for the Alfa set.

### IN-03: Manual `POST /sessions/generate` kairos path relies on an undeclared body property

**File:** `el-templo-api/src/modules/sessions/routes.ts:632-642`; `el-templo-api/src/modules/sessions/schemas.ts:26-39`
**Issue:** The only way to currently generate a kairos session is to POST `{levelGroup:"alfa_delta", memberLevel:"kairos"}`, but `generateSessionSchema.body` declares only `week/day/levelGroup` and the handler reads `body.memberLevel` via a type cast. This works only because the schema doesn't set `additionalProperties:false`; it is undocumented and untyped. (Subsumed by WR-03's fix to declare `memberLevel`.) Noted separately because it is the de-facto kairos test hook today.
**Fix:** Declare `memberLevel` (enum incl. kairos) in `generateSessionSchema.body` so the kairos generation entry point is a typed contract rather than an accidental passthrough.

---

_Reviewed: 2026-06-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
