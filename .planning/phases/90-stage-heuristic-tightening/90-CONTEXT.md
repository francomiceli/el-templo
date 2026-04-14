# Phase 90: Stage Heuristic Tightening - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Tighten the stage-advancement heuristic for PB1.E1A and PB1.E1B (twin variants) so single-keyword answers no longer trigger advance to E2A. Targets the "primera vez" false-advance observed in the v5.3.1 live test. Covers STAGE-01 and STAGE-02.

Out of scope: replacing `hasStageSpecificContent` with a model-driven detector (v5.4 territory), tightening sibling stages E2A/E2B/E3 (no live evidence yet), playbook structural changes, objection handling (Phase 91), regression lock (Phase 92).

</domain>

<decisions>
## Implementation Decisions

### STAGE-01: Multi-signal content gate via category diversity (NOT length)

- **Reject "keyword + minimum length":** length is a weak proxy. The live-test message "Hola mica soy mati, sería la primera vez" is 47 chars and would pass any reasonable length threshold while still being a single-keyword answer.
- **Approach:** categorize the existing ~25 E1A keywords in `hasStageSpecificContent` into semantic groups, require matches across **at least 2 categories**.
- Suggested category bucketing (planner finalizes during execution):
  - **level**: principiante, primera vez, nunca, arrancar, empezar
  - **experience**: entreno, entrené, entrenaba, hice, hago, vengo de, experiencia, activo, activa, sedentario, sedentaria
  - **duration**: años, meses, semanas
  - **context/discipline**: gym, gimnasio, crossfit, pesas, running, yoga, pilates, deporte
- Discrimination examples (must be observable in tests once Phase 92 locks them):
  - `"primera vez"` → 1 category (level) → does NOT pass content gate
  - `"nunca entrené, quiero arrancar"` → 2 categories (level + experience) → PASSES
  - `"hice crossfit hace 2 años"` → 3 categories (experience + context + duration) → PASSES
- Apply to E1A AND E1B branches of `hasStageSpecificContent` (twin variants share the same intent).
- Other stages (E2A/E2B/E3 and non-PB1) keep their current single-match behavior unchanged.

### STAGE-02: Turn-count gate via AND composition (not hybrid OR)

- **Reject the OR hybrid:** `(content_gate OR turn_count >= 2)` would default to advancing every conversation at exactly 2 turns regardless of richness — neutralizing the gate.
- **Use AND composition:** for E1A and E1B, `discoveryAnswered` requires `turn_count >= 2 AND content_gate`. The lead must have answered at least twice AND the current answer must pass content richness.
- This literally implements the promptSection's "idealmente 2-3 preguntas en total" intent.
- "Turn count" = number of substantive user turns (uses existing `hasMinimumContent` definition — see escape-hatch decision below for the same canonical definition).
- Mechanism for tracking the count: source from existing conversation/Redis state if available; otherwise add a minimal counter field. Planner determines the cleanest hookup (ContextMemory? state machine?).
- Single-turn override for super-rich first answers (3+ categories): **DEFERRED** to a post-Phase-92 quick-task. Only revisit if Phase 92 live test surfaces false negatives where rich first turns get stuck at E1A.

### Sibling stage symmetry — E1A + E1B only

- Tighten only the two stages whose twin behavior was demonstrated faulty in the live test (E1A and E1B share the experience-question intent and identical regex set).
- Leave E2A, E2B, E3 untouched. Their heuristics may be fine; they may not. We have no evidence either way, and tightening blindly risks breaking working flows.
- If Phase 92 live test shows E2A/E2B/E3 problems, attack with data in a follow-up.

### completionCriteria wording update (PB1.E1A and PB1.E1B in definitions.ts)

- Update both stages' completionCriteria text so model and code agree on what "answered" means.
- Replace "Si dijo 'principiante' o 'primera vez' avanzar a PB1.E2A" with wording that reflects the multi-signal intent. Suggested shape (planner finalizes):
  > "El lead respondió con información relevante a través de múltiples categorías (nivel + experiencia, o experiencia + duración, etc.) o ha respondido en al menos 2 turnos. Si la respuesta menciona claramente experiencia previa avanzar a PB1.E2B; si menciona principiante/primera vez/nunca con suficiente contexto avanzar a PB1.E2A."
- Tone preserved (Spanish, instructional). No mention of "categories" as a technical term — describe by example.

### Infinite-loop escape hatch

The tighter content gate creates a pathological-edge risk: a lead giving repeated monosyllabic responses ("sí", "no sé", "primera vez") could prevent advance indefinitely, causing Mica to ask the same question in a loop.

- **Trigger:** after **N=3 substantive user turns** within E1A or E1B without ever passing the content gate, force-advance to the canonical next stage anyway.
  - N=3 matches the playbook's "3 preguntas máximo" ceiling — code gate and playbook intent align on the same number.
- **"Substantive" definition:** reuse existing `hasMinimumContent`. One canonical definition of "substantive" across the codebase, no semantic drift.
- **On escape fire:** Pino `log.warn` with payload containing:
  - `stageId` (e.g., "PB1.E1A")
  - `conversationId`
  - `turn_count` at escape time
  - last 1–3 user messages (at minimum the current message verbatim — preferably the last 3 substantive ones for context)
  - escape reason / category-match summary if cheaply available
  - The log message text should be greppable (e.g., `"discovery escape fired"`) so post-hoc analysis can categorize escapes (monosyllabic vs. regex-miss).
- **No admin notification, no test failure, no UI surfacing.** Observability-only. Phase 92 may add an assertion that escapes are NOT firing in healthy paths, but no admin alert.
- **Scope:** E1A + E1B only (matches sibling-symmetry decision). E2A/E2B/E3 retain single-match behavior, so no loop risk exists there and an escape hatch would be dead code.

### Claude's Discretion

- Exact category-to-keyword mapping (suggested grouping above; planner finalizes).
- Whether categories are encoded as a `Record<string, RegExp>` lookup, individual regexes per category, or a structured table.
- Mechanism for tracking E1A/E1B turn count (Redis field name, ContextMemory shape, or stateless via existing conversation state).
- Exact wording of the updated completionCriteria text within the constraint above.
- Whether to bundle STAGE-01 + STAGE-02 + escape hatch into one commit or split across atomic commits (planner picks).
- Whether to add JSDoc explaining category-diversity rationale in `hasStageSpecificContent`.

</decisions>

<specifics>
## Specific Ideas

- The category-diversity gate is intentionally explainable: a future reader looking at `hasStageSpecificContent` should be able to read it and predict which messages pass without running them.
- The AND composition for `discoveryAnswered` is a small change with large semantic impact — adds one term to a 5-gate conjunction, but converts the meaning from "answered question" to "engaged in discovery."
- Escape-hatch logging quality matters more than the escape itself. Without rich context in the payload, grepping logs tells you "escape happened" but not "why the gate wasn't passing." With it, you can do post-hoc analysis like "of 12 escapes this week, 10 were monosyllabic leads and 2 were talkative leads where the regex missed — regex needs tuning."
- Phase 92 will need to add assertions for: (a) "primera vez" alone does NOT advance, (b) two-category messages DO advance, (c) escape hatch fires after exactly N=3 substantive turns. Phase 90 only produces the source state; Phase 92 owns the locks.
- Char-budget cost is minimal: completionCriteria wording changes are model-facing prompt content (rendered via STATE_SECTIONS / playbook resolver). New text is roughly the same size as the old text, so net delta on KGATE-05 is near-zero. Confirm with measurement during execution.
- The infinite-loop escape hatch is the kind of feature that should never fire in healthy operation. Logs should be empty. If they aren't, that's a signal to revisit the gate, not the escape.

</specifics>

<deferred>
## Deferred Ideas

- Single-turn override for super-rich first answers (3+ categories bypassing the turn-count gate) — defer to post-Phase-92 evidence.
- Tightening E2A, E2B, E3 — defer until Phase 92 live test produces evidence of false advances there.
- Replacing `hasStageSpecificContent` with a model-driven detector — explicit v5.4 territory per milestone scope.
- Admin-panel surfacing of escape events — out of scope; Pino logs sufficient for post-hoc analysis in v5.3.2.
- Adding a Redis field for per-stage turn count if the existing state machine doesn't already track it cleanly — implementation discretion, defer the schema discussion to planning.

</deferred>

---

_Phase: 90-stage-heuristic-tightening_
_Context gathered: 2026-04-14_
