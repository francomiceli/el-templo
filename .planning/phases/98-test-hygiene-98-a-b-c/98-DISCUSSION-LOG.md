# Phase 98: Test Hygiene (98-A/B/C) — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `98-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-06-17
**Phase:** 98-test-hygiene-98-a-b-c
**Areas discussed:** 98-A date strategy, 98-B cleanup strategy, 98-C webhook mock, Plan structure

---

## 98-A — subscriptions date strategy

| Option                                | Description                                                                                                                                                                   | Selected |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| A. Helper in `test/helpers.ts`        | `futureDateISO(daysFromToday)` added to `test/helpers.ts`; reuse `addDays()` from `src/modules/shared/date-utils.ts` for endDate math; assertions compare to computed values. | ✓        |
| B. File-local helper                  | Same function, scoped to `subscriptions.test.ts` only. Contains 98-A but duplicates if 98-B/C or future tests need it.                                                        |          |
| C. `vi.useFakeTimers + setSystemTime` | Freeze time at beforeAll so `'2026-03-01'` literals stay valid.                                                                                                               |          |
| D. Inline `new Date()` per call site  | No helper, 7+ duplicated expressions, tortured assertions. Violates DRY.                                                                                                      |          |

**User's choice:** Option A — helper in `test/helpers.ts`.

**Notes (verbatim from user):**

- "Add `futureDateISO(daysFromToday)` and reuse `addDays()` from `src/modules/shared/date-utils.ts` for the endDate math; assertions compare against the computed start/end values, not literals."
- "`test/helpers.ts` is the canonical home for cross-test utilities (this is not the production co-location case), and Phase 97's upcoming test work is a likely second consumer."
- "**Do NOT use `vi.useFakeTimers` (option C)** — it's the exact Date/timer landmine behind Phase 96's 5.5h timeout and the DEGR-01/LAT-03 flake family."
- "**One refinement:** keep the lifecycle assertions focused on lifecycle state (active→expired, assign/pause/cancel), and for dates assert 'endDate is in the future' (or start+30) rather than an exact string echoed back through the same `addDays` — that keeps the test from being tautological about date math (date-utils has its own unit tests for that)."

Captured in CONTEXT.md as D-01 (helper choice + Phase 97 second-consumer rationale), D-02 (`addDays` reuse), D-03 (non-tautological assertion shape).

---

## 98-B — ai-tools cleanup + wording

### Sub-question A — Cleanup fix

| Option                          | Description                                                                                                                                      | Selected |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| A1. Rename `alem` → `TSTA`      | Change seed to `code='TSTA'`, existing `WHERE code LIKE 'TST%'` cleanup works. Test asserts name 'Test Alem' not code. Cleanest single-line fix. | ✓        |
| A2. Extend LIKE filter          | `WHERE code LIKE 'TST%' OR code = 'alem'`. Minimal diff but semantically odd; risk if prod seed ever uses 'alem' code.                           |          |
| A3. Seed-registry by-ID pattern | Track inserted branch IDs, `DELETE WHERE id IN (...)`. Most robust but over-engineered for 1-line bug.                                           |          |

**User's choice:** A1 (rename `alem` → `TSTA`).

### Sub-question B — Wording assertion

| Option                          | Description                                                                                         | Selected |
| ------------------------------- | --------------------------------------------------------------------------------------------------- | -------- |
| B1. Exact `'cupos disponibles'` | ROADMAP SC#3 specifies this exact value. Locks intentional prod wording; future regressions caught. | ✓        |
| B2. Looser `'cupos'` substring  | Tolerates future wording tweaks but weaker signal.                                                  |          |

**User's choice:** B1 (exact `'cupos disponibles'`).

Captured in CONTEXT.md as D-05 (rename) and D-06 (wording).

---

## 98-C — webhook OpenAI mock + image assertion

### Sub-question A — AI mock approach

| Option                              | Description                                                                                                                                                                                | Selected |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| A1. `vi.mock` provider factory      | `vi.mock '../ai/provider'` to stub `createAiProvider` with canned `.chat()` response. Mirrors existing `sendTextMessage` `vi.mock` in same file. Zero prod source touches; preserves SC#5. | ✓        |
| A2. `vi.mock` openai module         | Mock the OpenAI SDK shape. Brittle to SDK version; tighter coupling.                                                                                                                       |          |
| A3. Real `OPENAI_API_KEY` in CI     | Real API calls in tests. Cost, flakiness, non-determinism. Bad practice.                                                                                                                   |          |
| A4. MockAiProvider class in bot src | Add to `el-templo-bot/src/ai/` with env routing. VIOLATES SC#5.                                                                                                                            |          |

**User's choice:** A1 (vi.mock provider factory).

### Sub-question B — Image-test assertion

| Option                          | Description                                                                                                                                                       | Selected |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| B1. Count + substring           | `messages.toHaveLength(2)` + `sendTextMessage.toHaveBeenCalledOnce()` + outbound contains `"imagen"`. Behavior shape + semantic intent; robust to wording polish. | ✓        |
| B2. Count only                  | Behavior shape only; doesn't verify semantic intent.                                                                                                              |          |
| B3. Count + exact fallback text | Outbound content === full `getNonTextFallback("image")` string. Brittle to wording polish.                                                                        |          |

**User's choice:** B1 (count + substring).

Captured in CONTEXT.md as D-07 (provider-factory mock), D-08 (text-test assertion update), D-09 (image-test assertion shape), D-10 (`waitForHandler` integration).

---

## Plan structure

| Option                                | Description                                                                                                                                                          | Selected |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| B. 1 plan, 3 atomic sub-commit chains | RED-A → GREEN-A → RED-B → GREEN-B → RED-C → GREEN-C → SUMMARY. Per-zone atomicity preserved; single PR cycle. Matches Phase 96.5 cadence. Order: 98-A → 98-B → 98-C. | ✓        |
| A. 3 separate plans                   | 98-01 subscriptions, 98-02 ai-tools, 98-03 webhook. Max isolation but 3× planning overhead.                                                                          |          |
| C. 1 plan, 1 combined commit          | Single RED + single GREEN. Loses per-zone revert; harder to honor STOP-and-split guard.                                                                              |          |

**User's choice:** B (1 plan, atomic sub-commit chain; execution order 98-A → 98-B → 98-C).

Captured in CONTEXT.md as D-11.

---

## Claude's Discretion

Delegated to plan-phase (locked in CONTEXT.md `<decisions>` → "Claude's Discretion"):

- Exact canned `.chat()` response text for D-07's mock (single short Spanish string).
- Exact site enumeration in `subscriptions.test.ts` (per-line evaluation of "stale vs intentionally past").
- Test description renames (e.g., D-09's image-test rename).
- Whether `futureDateISO` is named export vs namespace member (default: named export, matches existing shape).
- Exact assertion ordering within each test.

## Deferred Ideas

### To Phase 97 (RGUARD-01)

- `futureDateISO` second-consumer pattern — Phase 97 regression suite will need today-relative anchors.
- Behavioral assertions for non-text fallback (live-test territory).

### To v5.4.0 or later

- `MockAiProvider` class in `el-templo-bot/src/ai/` with env-routed selection. Reusable across bot-test scaffolding. Out of Phase 98 scope (would violate SC#5).
- Seed-registry by-ID pattern as standard test data discipline.
- Tool-layer date validation (already deferred from Phase 96.5).

### Out of scope (HARD GUARDS — confirmed in CONTEXT.md domain + carry-forward)

- Any production source modification (SC#5).
- Modifying `el-templo-bot/src/ai/tools.ts:389` wording.
- Closing BUG-03 (i) at `tools.ts:455` (Phase 95 owns).
- `el-templo-bot/` test suite changes.
- Cross-timezone edge cases for date helper.

---

## Addendum 2026-06-17 (post-97.5 retry alignment)

**Trigger:** Phase 97.5 prod-fix shipped (`56deb8d2` GREEN + `b19a7400` post-merge mock update + `2483b7aa` SHIPPED), unblocking the Phase 98 retry path. The original CONTEXT.md was authored before the halt and was missing items that only live in HALT.md and the preserved artifacts. Operator-authorized addendum to refresh CONTEXT for the retry.

**HALT.md's stated stance:** "No re-discussion of Phase 98 scope needed — the WIP patch + Task 1 branch capture the test-side intent verbatim." Operator overrode this for one specific gap: the check_schedule date-mismatch fix (diagnosed in HALT but never applied to any artifact) would be dropped by the planner without an explicit decision. Other deltas are scope-locking references, not new scope.

**Verifications performed before writing:**

- `git rev-parse phase-98-preserve/task-1-green-baseline` → `95d58f981470bcc5adb95ff63d1c7cda2cdc1a82` ✓
- `shasum -a 256 98-TASK-2-WIP.patch` → `5d452fc7f73e3bc561bc6d7564e8420bbc42f91e7c9ce51f102beea3ccf875f1` (4620 bytes, 12+/12−) ✓
- Production DATE_ADD next-occurrence formula intact at `el-templo-bot/src/ai/tools.ts` ~`:329` ✓
- `el-templo-api/test/whatsapp/ai-tools.test.ts:153-175` and `:178-200` still seed bookings with `today = new Date().toISOString().slice(0, 10)` ✓
- Phase 97.5 prod-fix landed: `grep -n subscription_status` confirms 8 sites renamed in `el-templo-bot/src/ai/tools.ts` (`:454`, `:495`, `:500`, `:539`) and `el-templo-bot/src/state/machine.ts` (`:40`, `:77`, `:90`, `:116`) ✓

### Decisions added

| ID   | Decision                                                                                                                                         | Reason it needed locking                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-12 | 98-B check_schedule date-mismatch fix (test-side only). Replace `today` seed with next-occurrence date matching `dayOfWeek` argument.            | Diagnosed in HALT.md but NOT in any preserved artifact. Without an explicit decision, planner drops it → 2 tests stay RED → SC#1 (511 pass) not reached.   |
| D-13 | 98-B authoritative source: `98-TASK-2-WIP.patch` (10 sites). Plan applies via `git apply`; does NOT re-derive.                                   | Encodes operator-authorized scope expansion from 4 → 10 sites. Re-deriving loses audit trail and risks omissions (e.g., the `get_location` address tests). |
| D-14 | 98-A authoritative source: cherry-pick `95d58f98` from `phase-98-preserve/task-1-green-baseline`. D-02 NO LONGER applies (vestigial under D-03). | Operator-authorized D-02 deviation already audit-trailed in HALT.md; cherry-pick is the deterministic, audit-preserving recovery path.                     |

### Domain section refresh (no new scope — status update only)

Added "Post-97.5 retry status (2026-06-17)" paragraph to `<domain>`:

- 97.5 shipped → `sub.subscription_status` / `s.subscription_status` is canonical
- Phase 98 retry is once again test-side-only as originally scoped
- SC#5 (zero src/ touches) still holds for the retry
- STOP-and-reclassify guard remains armed if a NEW prod bug surfaces

### Canonical refs extension

New "Phase 98 retry preserved artifacts (MUST consume — D-12/D-13/D-14)" subsection added to `<canonical_refs>`, citing:

- `98-HALT.md` (D-12 diagnosis verbatim)
- `98-TASK-2-WIP.patch` (D-13 authoritative for 98-B)
- `phase-98-preserve/task-1-green-baseline` git ref (D-14 authoritative for 98-A)
- `.planning/phases/97.5-prod-fix-raw-sql-column-drift/` (precondition for SC#5 holding)

### Items NOT changed (HALT.md correctly captured these)

- D-01..D-11 substance — locked in original CONTEXT, no re-discussion warranted.
- 6-pair sha256 invariant — unchanged.
- F-1/F-2 deprecation, 90-min execute hard cap, atomic RED→GREEN→SUMMARY cadence — unchanged.
- Deferred ideas list — unchanged.

### Next step

`/clear` then `/gsd-plan-phase 98` to regenerate plan `98-01` consuming the refreshed CONTEXT (D-12 + D-13 + D-14 + updated SC#5 note + new canonical refs). Operator requested optional review of the regenerated plan before execute to confirm D-12 + WIP-patch-apply landed correctly.
