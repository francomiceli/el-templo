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
