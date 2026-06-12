# Phase 96.5: Date Grounding Fix — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `96-5-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-06-12
**Phase:** 96.5-date-grounding-fix
**Areas discussed:** Directive wording · Date stub mechanism · Snapshot regen approach · Test scope

---

## Pre-discuss alignment (precondition issues surfaced via `/gsd-progress`)

Two issues resolved before Area 1 opened:

1. **Phase 96.5 not in ROADMAP.md** — manual edit inserted Phase 96.5 entry between Phase 96 and Phase 97 (milestone header line, Phases checklist, Phase Details section, Progress table). Shipped via `1d64c268 docs(roadmap): insert Phase 96.5 (date grounding fix) between Phase 96 and Phase 97`. SDK now recognizes `next_phase: "96.5"`, `phase_count: 6`.
2. **Filesystem naming convention** — locked to **hyphen throughout** (`96-5-CONTEXT.md`, `96-5-DISCUSSION-LOG.md`, directory `96-5-date-grounding-fix/`); the period stays only in prose and frontmatter. Audit confirmed zero `96.5-` path-separator references in ROADMAP.md or STATE.md → no fix commit needed.

Two issues deferred to a post-Phase-96.5 milestone hygiene commit:

- Phase 95 retro `SUMMARY.md` files missing (SDK still reports Phase 95 `disk_status: planned`).
- STATE.md `## Current Position` prose stale (still references "Phase 95… awaiting 95-02 planning").

---

## Area 1 — Directive wording

| Option                                        | Description                                                                                              | Selected |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------- |
| A — audit-verbatim minimal (45 chars)         | `*Convención:* Hoy es ${TODAY_ISO} (${DAY_NAME_TODAY}).` — no anti-hallucination clause; KGATE margin 73 |          |
| B — hybrid w/ generic prohibition (79 chars)  | Adds "NUNCA inventes una fecha distinta." Mirrors Phase 96 CTXT rule pattern; margin 39                  |          |
| C — day-name-first ordering (42 chars)        | Reorders "Hoy es miércoles 2026-06-10"; breaks structural parallel with Sunday=0 line; margin 76         |          |
| D — specific past-date prohibition (84 chars) | Adds "Nunca ofrezcas fechas anteriores a hoy." Targets exact Finding #2 failure mode; margin 34          | ✓        |

**User's choice:** Option D.

**Notes:**

- Empirical match: Finding #2's failure was specifically past-date hallucination (`date:"2023-11-06"`), not generic miscalculation. Option D's prohibition targets exactly that.
- Phase 96 deviation pattern reapplied: Sunday=0 D-06 was audit-verbatim minimal (no empirical evidence demanded deviation); CTXT D-03 added explicit anti-pattern because of the "Mati → apellido" empirical anchor. Phase 96.5 follows: past-date hallucination evidence → Option D with specific anti-pattern.
- Margin 34 chars remains positive; KGATE budget not broken.
- Cost-benefit: 39 extra chars vs. recurring production hallucination = trivial trade-off (HARD BLOCKER stakes).
- Fallback trim path documented (Phase 96 D-11 precedent): drop the prohibition clause → reverts to Option A's bare directive. Grounding anchor IRREDUCIBLE.

---

## Area 2 — Date stub mechanism

| Option                                      | Description                                                                                                                                                               | Selected |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| (a) `vi.useFakeTimers`                      | Vitest-native, test-file-only. LANDMINE: `vi` unavailable in `pnpm exec tsx -e` regen → dual implementation drift.                                                        |          |
| (b) `globalThis.Date` override at test boot | Single mechanism (test boot + regen). Downsides: broader blast radius (Phase 93/94/95 timer-heavy tests need audit); cannot do per-test forensic replay.                  |          |
| (c) Render-time prompt args                 | `getSystemPrompt({..., todayISO?, todayDayName?})`. Single mechanism across tests/regen/production; defaults to real Argentine date; forensic replay trivial. ~15-20 LOC. | ✓        |
| (d) `getToday()` + `vi.spyOn`               | Same vi-bound landmine as (a) for regen.                                                                                                                                  |          |

**User's choice:** Option (c).

**Notes:**

- (a) and (d) architecturally disqualified by the snapshot regen requirement. `pnpm exec tsx -e` cannot use vitest-bound APIs → would force dual mechanism → exactly the drift pattern that contributed to Phase 96's 5.5h timeout. Hard NO regardless of other merits.
- (b) has real blast radius risk: Phase 93/94/95 tests heavily use `vi.useFakeTimers + vi.advanceTimersByTimeAsync` (debounce, withTimeout, OpenAI latency, escalation). Adding a global Date override may interact subtly with timer-dependent assertions. 95-03 DEGR-01 already documented flaky in the timer family.
- (c) is architecturally clean: single mechanism, forensic replay trivial, backward compatible. Aligns with Phase 96 D-12 precedent (`parseExtractionResponse` added module-local API surface for testability).

**D-02a flagged for plan-phase:** Argentine timezone resolution. `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })` strongly recommended (native, robust, zero deps; Argentina has not observed DST since 2009 but `Intl` future-proofs anyway).

---

## Area 3 — Snapshot regen approach (frozen date for fixture)

Area 3 collapsed once D-02 locked: regen invocation shape is determined; only the frozen date value is open.

| Option                                         | Description                                                                                 | Selected |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- | -------- |
| (i) Today's ship date 2026-06-12 (viernes)     | 7-char day name; not worst-case KGATE. Captures "ship moment" but loses stress signal.      |          |
| (ii) Phase 96 ship date 2026-06-10 (miércoles) | 9-char day name; worst-case KGATE baked into fixture. Semantic symmetry with Phase 96 ship. | ✓        |
| (iii) Generic 2026-01-01 (jueves)              | 6-char day name; year-start sentinel; same stress loss as (i).                              |          |
| (iv) Defer to plan-phase                       | Same decision postponed; no benefit.                                                        |          |

**User's choice:** Option (ii) — 2026-06-10 (miércoles).

**Notes:**

- Worst-case KGATE stress baked into byte-equal fixture lock. Production renders with shorter day names always fit; future regen never silently loses worst-case guarantee.
- Defensive engineering — pre-commit budget protection.
- Semantic symmetry with Phase 96 atomic ship (2026-06-10 = `bea9a10a` GREEN + `4598dcea` SUMMARY); readable lineage signal in future audits.
- Regen invocation shape locked (plan-phase verifies exact `clientState`/`activePlaybook`/`currentStage` identifiers against `getSystemPrompt` signature).

---

## Area 4 — Test scope

| Option                    | Description                                                                                      | Selected |
| ------------------------- | ------------------------------------------------------------------------------------------------ | -------- |
| Minimal (2): T1+T2        | Substance lock only; D-03 rationale unenforced; D-02a defaults unguarded.                        |          |
| Standard (4): T1+T2+T3+T4 | Adds KGATE worst-case + default fallback.                                                        |          |
| **Standard+1 (5): +T5**   | Adds forensic Lunes 2023-11-06 replay (Finding #2 anchor).                                       | ✓        |
| Phase 96 parity (6): +T6  | Separate anti-hallucination assertion. Over-precise; T1 regex already covers prohibition string. |          |

**User's choice:** Standard+1 (5 tests).

**Notes:**

- T1, T2, T3 non-negotiable (substance + KGATE enforcement per D-03 rationale).
- T6 ruled out: T1's regex already covers the prohibition string. Maintenance burden without coverage gain.
- T4 assertion shape **refined** during discussion: Claude's initial proposal was a weak length comparison (`getSystemPrompt({}).length === getSystemPrompt({explicit today}).length ± variance`). User overrode: T4 must verify the rendered output **actually contains** today's Argentine ISO date AND today's Spanish day name. Exact regex shape locked at plan-phase per D-02a resolution.
- T5 **disagreement with Claude's recommendation** — Claude proposed Standard (4), arguing T5 was redundant with T2's snapshot. User overrode T5 inclusion on four grounds:
  1. T5 is NOT redundant with T2 — it adds a SECOND parameterization data point. Two data points > one. More importantly, the second point anchors to specific empirical evidence (2023-11-06).
  2. Phase 96 T6 precedent: the `Nombre: Mati` forensic replay was justified by exactly this reasoning — empirical anchor traceability for future audit readers. Consistency with prior decisions.
  3. Audit-trail value: future readers seeing T5 immediately understand "this bug was past-date hallucination, specifically 2023-11-06 hit production, now parameterizable and testable."
  4. Production-criticality (HARD BLOCKER, `fetch failed` evidence) argues for parity rigor with Phase 96. 5 tests for 1 deliverable is comparable density when T3+T4 are counted as structural-requirement tests, not coverage tests.
- T5 cheap to author (~5 LOC). Total Phase 96.5 estimated LOC: ~30 (D-02 mechanism) + ~5 (T5) = ~35 LOC. Still within the "small phase" envelope.
- Test file location: `el-templo-bot/test/v5-3-3-date-grounding.test.ts` (mirrors `v5-3-3-*` naming convention).

---

## Claude's Discretion

- **Exact test names + `describe` block structure** — follow Phase 96 `v5-3-3-context-awareness.test.ts` discipline; plan-phase authors specific identifiers.
- **Whether `DAY_NAMES` const lives module-private or is exported** — defer to plan-phase per Phase 95 D-16 / Phase 96 D-14 precedent (export only if a second consumer materializes; default file-private).

## Deferred Ideas

- **D-02a Argentine timezone resolution** — locked at plan-phase. `Intl.DateTimeFormat` recommended.
- **T4 exact assertion shape** — depends on D-02a resolution.
- **Tool-layer date validation** (`tools.ts` rejecting past dates server-side) — v5.4.0 hardening item if Manual UAT Round 2 reveals residual hallucinations.
- **Timezone deep dive** (DST policy changes, multi-timezone users) — v5.4+ territory.
- **Multi-day-simulation test** (all 7 distinct day names) — v5.4+ if empirically needed; T5 already exercises one non-default day.
- **Behavioral live-test for date grounding** — Phase 97 RGUARD-01 territory; Phase 96.5 ships structural assertions only.
