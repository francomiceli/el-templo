# Phase 96: Context Awareness - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Closes BUG-04 (CTXT-01/02) from the post-v5.3.2 live test backlog. Empirically validated via three independent data points (Phase 91 live test, BUG-04 backlog narrative, live UAT repro 2026-06-09) that all share the same failure-mode signature: **conversation history was visible to the model, but the model chose to re-ask data the user had already provided**. Phase 96 is the canonical snapshot-regeneration point for the v5.3.3 milestone (per ROADMAP.md Phase 96 Notes), so it also closes a deferred fix from Plan 95-01's audit and absorbs a defensive extraction-layer hardening surfaced during the live UAT repro.

**Four deliverables:**

1. **CTXT-01/02 (BUG-04 fix)** — Single prompt-level rule in `*Reglas de conversacion*` (universal — all clientStates, all playbooks) instructing the model never to re-ask data already in `session.messages` history or `Datos del perfil del cliente:` profileContext. Apellido nuance is mandatory: rule explicitly distinguishes partial-data ("if you have nombre 'Mati' but need nombre completo, ask for apellido specifically") from umbrella-field re-ask ("¿cuál es tu nombre?"). Empirical anchor from live repro 2026-06-09.

2. **(iii) Sunday=0 directive (carry-forward from Plan 95-01 audit)** — Single-line `*Convención:*` binding `0=domingo, 1=lunes, ..., 6=sábado` placed before `*Reglas de uso de herramientas*`. Audit-verbatim text. Transitions the RED test at `el-templo-bot/test/v5-3-3-booking-reliability.test.ts:55-72` to GREEN automatically (no new test authored for this dimension — the test's regex matches the audit-proposed string as-is).

3. **Snapshot regen** — Regenerates `el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt` to absorb both new prompt strings; bumps `POST_RLOK_04_BYTES` at `el-templo-bot/test/v5-3-2-regression.test.ts:57` from `18370` to the new byte count (~18,827 expected; verified against KGATE-05 cap of `Math.floor(BASELINE_CHARS * 0.8) = 18916`). Phase 96 is the SOLE phase in v5.3.3 that touches `system-prompt.ts`; Phase 97 RGUARD-01 then asserts the new constant without further regen.

4. **Profile extraction markdown-fence hardening (Finding #4)** — New module-local helper `parseExtractionResponse(rawContent: string): Record<string, unknown> | null` replaces the inline `JSON.parse` at `el-templo-bot/src/webhook/handler.ts:1607-1615`. Strips ` ```json ... ``` ` / ` ``` ... ``` ` markdown fences before parsing; returns `null` on truly malformed content (preserves existing "skip update" semantics). Defensive hardening — empirical evidence from live repro 2026-06-09 showed gpt-4o-mini wrapping extraction output in fences, silently dropping `branchPreference: "Constitución"` and `notes: "Primera vez, soy principiante"`.

**NOT in scope (each enumerated to prevent scope drift in plan-phase):**

- **Finding #2 (model hallucinates today's date, e.g., "Lunes 2023-11-06")** → Phase 96.5 (NEW phase to be inserted after Phase 96 closes; HARD BLOCKER pre-v5.4.0 deploy because production users will receive past dates and bookings will fail on confirmation). Confirmed pure-prompt fix (~30 LOC including snapshot date-stub infrastructure) — not data/seed/API. Scoping deferred to dedicated discuss session after Phase 96 ships.
- **Finding #3 (`fetch failed` on Confirmar)** → dev-env verification. Confirmed not Phase 96 scope; Node `fetch failed` is a network-rejection class (DNS / connection refused / abort), not an HTTP 4xx, so the cause is most likely `el-templo-api` not running at `localhost:3000` during the dev test. Verify against staging during v5.4.0 deploy; if it persists with API connected, escalate to its own debug session.
- **Finding #5 (`discovery_escape_fired` at PB1.E1A turnCount:3)** → working as designed per Phase 90 STAGE-01/02 ("infinite-loop escape hatch (N=3 force-advance)" per PROJECT.md key decisions). No action.
- **Case B (synchronous extraction refactor)** and **Case C (hybrid prompt + extraction-layer refactor)** → v5.4+ if empirical evidence later proves Case A insufficient. The three-point empirical chain (Phase 91 live, BUG-04 backlog, live repro 2026-06-09) all classify the failure as "history visible, model chose to re-ask" — exactly the failure mode Case A targets. Architectural extraction-layer redesign is v5.4+ territory per REQUIREMENTS.md Out of Scope spirit.
- **`handler.ts` changes beyond `extractAndUpdateProfile` / `parseExtractionResponse`** → no touches to concurrency entry guard (Phase 93), OpenAI client / interim UX (Phase 94), tool loop / retry counter (Phase 95), or any other handler region. Phase 96 modifies exactly two surfaces: `handler.ts:1607-1615` (markdown-fence helper) and `system-prompt.ts:217+` and `:241+` (CTXT rule + Sunday=0 directive).
- **`system-prompt.ts` sections outside the two insertion points** → SOFT_REJECTION_WHY_RULE / SOFT_REJECTION_BACKOFF_RULE at `:70-86` UNCHANGED (Phase 91 ownership; SC#3 invariant). AVATAR_TONE_GUIDES at `:107+` UNCHANGED. STATE_SECTIONS at `:162+` UNCHANGED. profileContext injection at `:286-291` UNCHANGED. `*Detección de perfil*` at `:339` UNCHANGED.
- **KGATE-05 baseline change** — `BASELINE_CHARS = 23646` at `el-templo-bot/test/fixtures/pb1-e1a-baseline.ts:9` remains FROZEN. Only `POST_RLOK_04_BYTES` (the rendered-prompt current-state constant) advances.

</domain>

<decisions>
## Implementation Decisions

### Cross-Phase Invariant (Phase 93 ↔ 94 ↔ 95 ↔ 97) — CANONICAL BLOCK

**This block MUST remain textually identical** to `93-CONTEXT.md`, `94-CONTEXT.md`, `95-CONTEXT.md`, `ROADMAP.md` Phase 93 Notes / Phase 94 SC#1, and `MACRO-ROADMAP.md` constraint #6:

```
DEBOUNCE_TTL_SECONDS >= (OPENAI_TIMEOUT_MS / 1000) × MAX_TOOL_ITERATIONS
                     + (executeTool_timeout_seconds × MAX_TOOL_ITERATIONS)
                     + safety_buffer

Concrete values (post-Phase-94+97 target):
  OPENAI_TIMEOUT_MS = 45000             (Phase 94 LAT-01)
  MAX_TOOL_ITERATIONS = 5               (existing handler config)
  executeTool_timeout_seconds = 30      (Phase 95 BOOK-01 + Phase 97 RGUARD-03)
  safety_buffer = 20
  Minimum TTL = 45 × 5 + 30 × 5 + 20 = 395s → round up to 600s (10 min)
```

Phase 96 does NOT modify any term in this invariant. The 6-pair sha256 invariant hash (`67670b1e1099bf7c8a5285414736f16e8a010a010348bf6566790d0db3163344`) MUST remain unchanged across all 6 anchors; planner/executor verifies via `shasum -a 256` before each Phase 96 plan commit per Phase 95 D-23 discipline.

### BUG-04 Case Verdict (Empirical)

- **D-01: Case A locks** (prompt-only fix, no extraction-layer refactor). Three independent empirical data points converge on the same failure-mode signature:
  - **Phase 91 live test** (2026-04-16, `contexto/post-phase-91-live-test-findings.md:43-44`): "Mica re-asked 'contame si ya entrenaste calistenia antes' after user had already said 'primera vez'. **The conversation history was in context but the model chose to re-ask.**"
  - **BUG-04 backlog narrative** (`contexto/backlog-post-v532` BUG-04): "Nacho dijo 'Ignacio Bordon' como nombre completo y Mica volvió a preguntar '¿Cuál es tu nombre completo?'. **El dato está en el historial de conversación pero el modelo no lo utiliza.**"
  - **Live UAT repro** (2026-06-09, this discuss session): Fresh Redis state, dev bot + ngrok + Meta test number, real OpenAI gpt-4o-mini. User said "me llamo Mati" at turn 1; profile extraction succeeded (`extractedFields: ["name"]` logged); turns 2-4 bot did NOT re-ask name; at turn 5 (trial-registration finalization) bot asked "Solo necesito tu nombre completo para finalizar el registro. ¿Cuál es tu nombre?" — confirming the failure mode with `"Mati"` visible in `session.messages` AND in `profileContext` (`Nombre: Mati` rendered).

- **D-02: Apellido nuance is mandatory.** The live repro showed the model wasn't ignoring "Mati" out of pure inattention — it was acting on a real constraint (`register_trial` requires full name for backend registration). A naive "don't re-ask known data" rule would backfire: bot would refuse to ever ask for last name when first name is captured, and trial bookings would fail by design. The rule MUST be specific: "if you already have part of the data (nombre 'Mati'), ask for the SPECIFIC missing piece (apellido) — NOT the umbrella category ('¿cuál es tu nombre?')."

### CTXT Rule Authoring (Plan 96-01)

- **D-03: Wording = Option C (hybrid + explicit apellido example).** Locked verbatim Spanish text:

  ```
  *Datos ya provistos:* nunca re-preguntes datos que el usuario ya dio en esta conversación o que aparecen en `Datos del perfil del cliente:`. Si solo tenés parte del dato (ej: tenés nombre "Mati" pero necesitás nombre completo), pedí específicamente lo que falta ("¿cuál es tu apellido?"), NO la categoría completa ("¿cuál es tu nombre?").
  ```

  ~365 chars. Decision rationale: matches PROJECT.md "Explicit carve-out enumeration in rules" precedent ($80k SALES_TECHNIQUES rewrite, Phase 92-02); empirical anchor ("Mati" verbatim) ties the rule to the observed failure; explicit anti-pattern ("NO la categoría completa") most directly prevents the live-repro regression. Tested via D-14 regex assertion.

- **D-04: Placement = `*Reglas de conversacion*` section** at `el-templo-bot/src/ai/system-prompt.ts:241+`. Inserted after existing conversation rules in that section, BEFORE `*Detección de perfil*` (which is appended conditionally for PB1 leads at `:339`). NOT inside SOFT_REJECTION conditional rules at `:70-86` — those are clientState-conditional and would miss the cross-state CTXT failure surfaces. The rule is universal: applies to all clientStates and all playbooks.

- **D-05: SC#3 invariant guardrail.** The new CTXT rule shares NO state and NO conditional with the Phase 91 SOFT_REJECTION_WHY_RULE / SOFT_REJECTION_BACKOFF_RULE. The CTXT rule fires on EVERY turn (universal section); the SOFT_REJECTION rules fire on `softRejectionState === "why" | "backoff"` (conditional at `getSystemPrompt` `:353-355`). Phase 97 RGUARD-02 will assert: a soft-rejection inbound produces both rules visible in the rendered prompt without conflict.

### (iii) Sunday=0 Directive (Carry-forward from Plan 95-01 Audit)

- **D-06: Wording = audit-verbatim, single-line `*Convención:*`.** Locked text:

  ```
  *Convención:* el día de la semana se codifica como 0=domingo, 1=lunes, ..., 6=sábado.
  ```

  ~92 chars. Matches `v5.3.3-codebase-audit.md` §E candidate (iii) Concrete fix shape verbatim. Decision rationale: for Sunday=0 there is NO empirical reason to deviate from the audit (no live repro evidence demanding nuance), so audit-verbatim discipline applies — deviation is reserved for cases where empirical observation demands it (CTXT rule Option C is one such case).

- **D-07: Placement = single line BEFORE `*Reglas de uso de herramientas*` at `system-prompt.ts:217`.** NOT a new `*Convenciones*` block heading. Decision rationale: YAGNI on future structure — Phase 96.5's "Hoy es ${TODAY_ISO}" directive can land as a second `*Convención:*` line, or a future refactor PR can introduce the plural section heading when 3+ convention facts accumulate. Phase 96 stays mechanical: encode the locked decision without inventing structure. Budget impact: ~92 chars (vs ~120 chars for the section-heading variant), saves ~30 chars headroom.

- **D-08: (iii) RED test transitions GREEN automatically.** No new test authored for the Sunday=0 dimension. The pre-existing RED at `el-templo-bot/test/v5-3-3-booking-reliability.test.ts:55-72` asserts `prompt` matches `/0\s*=\s*domingo|domingo\s*=\s*0|domingo\s+es\s+el\s+d[íi]a\s+0/i`; the locked D-06 text satisfies the first alternative (`0=domingo`) byte-equally. Plan 96-01 verifies via `pnpm test el-templo-bot/test/v5-3-3-booking-reliability.test.ts -t "RED: system prompt explicitly binds Sunday=0"` showing PASS post-fix; this becomes a regression-protector going forward.

### Snapshot Regen Mechanics

- **D-09: Regenerate `el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt`** in the same commit that lands the D-03 + D-06 strings. Discipline mirrors Phase 88 / RLOK-04 / Phase 92-02 surgical-tripwire pattern: regenerate fixture explicitly, do NOT rely on automated snapshot updates. Regeneration script is `node -e "require('./src/ai/system-prompt').getSystemPrompt(...)` rendered with the canonical PB1.E1A options (or equivalent existing renderer harness in `test/v5-3-2-regression.test.ts:renderE1ALead()`). The new bytes get written to the fixture file via `pnpm exec tsx` or similar — exact command shape is Claude's Discretion at plan-phase.

- **D-10: Bump `POST_RLOK_04_BYTES` at `el-templo-bot/test/v5-3-2-regression.test.ts:57`** from `18370` to the new measured byte count. Expected delta:
  - CTXT rule (D-03) = ~365 chars
  - Sunday=0 directive (D-06) = ~92 chars
  - Section-injection separators (`\n\n`) per `getSystemPrompt` template = ~4 chars
  - **Expected new value: ~18,831 chars** (verify exact value during plan execution; the constant lands the measured value, not the estimate)

- **D-11: KGATE-05 dual-threshold budget verification.** Rendered cap = `Math.floor(BASELINE_CHARS * 0.8) = Math.floor(23646 * 0.8) = 18916`. Expected post-Phase-96 rendered bytes ~18,831. Margin ~85 chars. Phase 96.5's "Hoy es ${TODAY_ISO}" directive (~25 chars) fits within remaining margin. If actual measured bytes exceed budget at plan-phase byte-audit, fallback trim path: D-03 parenthetical clarifications ("ej: tenés nombre 'Mati' pero necesitás nombre completo" and 'NO la categoría completa') reduce to a single shorter example. The "Mati → apellido" empirical anchor is the IRREDUCIBLE element preserved under any trim.

### Profile Extraction Markdown-Fence Hardening (Finding #4)

- **D-12: Module-local helper `parseExtractionResponse(rawContent: string): Record<string, unknown> | null`** in `el-templo-bot/src/webhook/handler.ts` (file-private; `export` only for tests). Strips ` ```json ` / ` ``` ` markdown fences before `JSON.parse`. Returns `null` on truly malformed content (preserves the existing `extractAndUpdateProfile` "skip update on parse failure" semantics at `handler.ts:1614`). Caller at `handler.ts:1607-1615` replaces the inline `try { extracted = JSON.parse(rawContent) ... } catch { log.warn(...) return; }` with `const extracted = parseExtractionResponse(rawContent); if (!extracted) { log.warn(...); return; }`.

- **D-13: Fence shapes covered.** Helper handles:
  - Bare JSON (current happy path) — pass-through
  - ` ```json\n{...}\n``` ` (live-repro shape from 2026-06-09) — strip outer fence
  - ` ```\n{...}\n``` ` (fence without language tag) — strip outer fence
  - Leading / trailing whitespace around fence — tolerant
  - Truly malformed (no JSON object inside fence or after stripping) — return `null`
    Reference regex shape (final implementation Claude's Discretion at execution time): `^\s*```(?:json)?\s*\n?([\s\S]*?)\n?\s*```\s*$` capture group 1, OR a two-pass strip (leading fence, then trailing fence) for clarity. Plan 96-01 picks the cleaner of the two.

- **D-14: File location = `handler.ts` (module-local, NOT new file).** Matches Phase 95 D-16 precedent (`withTimeout` helper co-located with single-consumer file before being externalized). New file `extract-json.ts` is over-engineering for a single consumer; Phase 95's discipline applies. If Phase 96.5 OR v5.4+ surfaces additional consumers, externalization is a future refactor — Phase 96 ships the helper in `handler.ts`.

### Test Strategy (Plan 96-01) — Defensive (6 tests)

- **D-15: New test file = `el-templo-bot/test/v5-3-3-context-awareness.test.ts`** containing 6 tests covering the four deliverables. Per `el-templo-bot/CLAUDE.md` lines 36-39 convention: unit tests for bot-specific logic live in `el-templo-bot/test/`. No integration tests authored in `el-templo-api/test/whatsapp/` for Phase 96 — Phase 96 changes only `system-prompt.ts` text and `handler.ts` extraction helper; neither requires real-DB integration coverage. Phase 95 D-03 split-test-surface discipline carries forward.

- **D-16: Test list (locked):**
  1. **CTXT rule present in rendered prompt.** Import `getSystemPrompt` from `../src/ai/system-prompt.ts`, render with `{ clientState: "lead", activePlaybook: "pb1", currentStage: "PB1.E1A" }`. Assert prompt matches regex `/Datos ya provistos:\*?\s+nunca re-preguntes/i`. Locks D-03 wording presence + section placement.

  2. **CTXT rule does NOT collide with SOFT_REJECTION fixtures.** Render prompt with `softRejectionState: "why"` AND `softRejectionState: "backoff"`. Assert BOTH the CTXT rule AND the SOFT_REJECTION rule appear in the prompt, on separate non-overlapping lines, with both `*Datos ya provistos:*` and `*REGLA — el lead expresó rechazo:*` distinguishable. Locks D-05 SC#3 guardrail.

  3. **`parseExtractionResponse` handles bare + fenced + malformed.** Unit test the exported helper with four fixtures: (a) bare `{"name":"Mati"}` → returns `{name: "Mati"}`; (b) ` ```json\n{"name":"Mati"}\n``` ` → returns `{name: "Mati"}`; (c) ` ```\n{"name":"Mati"}\n``` ` → returns `{name: "Mati"}`; (d) `"not json"` → returns `null`. Locks D-12 / D-13 helper semantics.

  4. **`parseExtractionResponse` regression-protector for current skip semantics.** Pass three pre-fix malformed shapes that the current inline `JSON.parse` would have skipped (e.g., empty string `""`, single brace `"{"`, JSON array instead of object `"[1,2,3]"`). Assert helper returns `null` for all three so the fix does NOT over-correct into silent acceptance of garbage. Locks the conservative behavioral boundary of D-12.

  5. **(iii) Sunday=0 directive locked in rendered prompt** (regression-protector). Render `getSystemPrompt()`. Assert prompt matches `/\*Convención:\*.*0=domingo.*1=lunes.*6=sábado/`. Complements the pre-existing RED test at `v5-3-3-booking-reliability.test.ts:55` (which only asserts the alternation `/0\s*=\s*domingo|domingo\s*=\s*0|domingo\s+es\s+el\s+d[íi]a\s+0/i`) by locking the FULL directive shape — guards against future PR that mutates the directive text (e.g., shortens it to just `0=domingo`) and breaks the audit's full encoding reference.

  6. **BUG-04 forensic-fixture replay** (empirical anchor). Construct a `session.messages` array fixture replicating the live-repro turn-1 sequence: user message "me llamo Mati", bot reply with name acknowledgment. Render full system prompt with profileContext = "Nombre: Mati" (mirroring post-extraction Redis state). Assert the rendered prompt text contains both (a) the user's "Mati" string visible in the conversation-history embedding the handler would build (NOTE: this asserts prompt assembly, NOT model behavior — model behavior is Phase 97 RGUARD-01's RLOK-03 live-test territory), and (b) the CTXT rule itself (cross-reference with test #1). Empirical anchor that ties the rule's presence to the specific failure scenario it was authored to close.

- **D-17: Modified test file = `el-templo-bot/test/v5-3-2-regression.test.ts`.** Single constant bump: `POST_RLOK_04_BYTES = 18370` → measured new value (D-10). The existing RLOK-02 byte-equal test (`:332-335`) continues to pass against the regenerated fixture without further modification.

- **D-18: Modified fixture file = `el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt`.** Wholly regenerated; the new file replaces the old byte-for-byte. Commit message must explicitly call out the regen ("regen pb1-e1a-lead-rendered.snap.txt for Phase 96 CTXT rule + Sunday=0 directive") so PR review surfaces the snapshot change deliberately, mirroring Phase 92-02 surgical-tripwire discipline.

### Plan Task Discipline (Carry-forward from Phase 93/94/95)

- **D-19: TDD fail-in-main discipline.** Every test in `v5-3-3-context-awareness.test.ts` MUST be authored against current master (HEAD `beb2282b` at discuss-start) and observed to FAIL before the fix lands. Plan 96-01 ships TWO commits: (a) RED — author all 6 tests + verify failures + verify (iii) RED at `v5-3-3-booking-reliability.test.ts:55` still RED; (b) GREEN — apply system-prompt.ts CTXT rule + Sunday=0 directive + handler.ts parseExtractionResponse helper + snapshot regen + POST_RLOK_04_BYTES bump + verify all 6 new tests + (iii) RED transitioned to GREEN. Atomic commit cadence mirrors Phase 93/94/95 RED→GREEN→SUMMARY pattern.

- **D-20: Atomic commit cadence per plan.** Plan 96-01 has TWO atomic commits (RED, GREEN). Plus SUMMARY.md commit per plan-close. NO multi-task atomic commits. Plus a STATE.md update commit at phase close per `/gsd-progress` cadence.

- **D-21: Plan-checker mode = NORMAL.** Phase 96 has zero investigative branching (Case verdict locked empirically at D-01; wording locked at D-03; placement locked at D-04 / D-07; helper signature locked at D-12). All decisions land mechanically. NORMAL framing per Phase 94 / Phase 95-02 / 95-03 precedent. Structural integrity check (XML/markup tag balance) MUST be in plan-checker framing per the locked feedback rule.

- **D-22: F-1 / F-2 verify gates NOT regenerated.** Per locked Engineering Learning (`STATE.md` Carry-forward planning constraints): DO NOT add `<automated>` gates for (F-1) `pnpm test | grep -qE "Tests +[1-9][0-9]* +failed"` RED self-certification, or (F-2) `cd <pkg> && pnpm lint`. Both proven theatre. Substantive verify surfaces that SHOULD appear in Plan 96-01: (a) sha256 6-pair drift sentry against `67670b1e...3163344`, (b) `pnpm tsc --noEmit` raw exit for both packages, (c) exact-file-count assertion (`git show --stat HEAD | grep -cE 'pattern' -eq N`), (d) commit subject regex (`git log -1 --format=%s | grep -qE '^prefix\\(96-XX\\): '`), (e) negative-assertion `git diff` guards for out-of-scope files (no touch to soft-rejection-rules region, no touch to AVATAR_TONE_GUIDES, no touch to KGATE-05 BASELINE_CHARS), (f) console/any code-discipline grep on new file `parseExtractionResponse` helper, (g) explicit `<human-check>` checklist for snapshot fixture regen review.

- **D-23: 6-pair canonical-invariant hash discipline.** Phase 96 does NOT modify the cross-phase invariant block. The hash `67670b1e1099bf7c8a5285414736f16e8a010a010348bf6566790d0db3163344` MUST verify byte-equal across all 6 anchors (93-CONTEXT.md, 94-CONTEXT.md, 95-CONTEXT.md, 96-CONTEXT.md as a passive reproduction above, ROADMAP.md, MACRO-ROADMAP.md) before each Phase 96 commit. Per Phase 95 D-23.

### Claude's Discretion (Plan 96-01)

- **Exact section-injection delimiter shape** — whether D-03 CTXT rule is appended with `\n\n*Datos ya provistos:*...` (two leading newlines, matching `getSystemPrompt` template precedent at `:282` and `:289`) or `\n*Datos ya provistos:*...` (single leading newline). Plan-author picks the one that round-trips through the existing renderer without introducing whitespace drift in the snapshot.

- **Snapshot regen invocation shape** — whether the regen happens via a standalone `pnpm exec tsx scripts/regen-snapshot.ts` script, an existing `renderE1ALead()` harness in `test/v5-3-2-regression.test.ts`, or an inline `pnpm vitest --update` flow. Plan-author picks the simplest path that yields a deterministic byte-equal output across runs.

- **`parseExtractionResponse` regex shape** — single-pass regex with capture group OR two-pass `replace(/^.*?```json?\s*\n?/, '').replace(/\n?\s*```\s*$/, '')`. Plan-author picks the more readable form; both satisfy D-13 fixture coverage.

- **Whether (iii) Sunday=0 RED test name updates to remove "RED" prefix** post-fix — purely cosmetic; test now PASSES. Plan-author may rename `"RED: system prompt explicitly binds Sunday=0"` to `"system prompt explicitly binds Sunday=0 (regression-protector)"` in the GREEN commit, matching Phase 93/94/95 test-naming pattern.

- **Plan 96-01 commit message format** — exact subject for the GREEN commit. Convention candidates: `feat(96-01): CTXT rule + Sunday=0 binding + extraction fence helper` OR `feat(96-01): close BUG-04 CTXT rule + Sunday=0 carry-forward`. Plan-author picks; both pass D-22's commit subject regex.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents (planner, plan-checker, executor) MUST read these before authoring or implementing.**

### Empirical Source-of-Truth (BUG-04 Repro Evidence)

- `contexto/backlog-post-v532` (lines 71-86) — original BUG-04 narrative from post-v5.3.2 live test. Repro: "Ignacio Bordon" re-asked; data was in conversation history.
- `contexto/post-phase-91-live-test-findings.md` (lines 43-44) — independent prior observation of same failure-mode signature ("conversation history was in context but the model chose to re-ask").
- **Live UAT repro 2026-06-09** (captured in 96-DISCUSSION-LOG.md) — fresh Redis state, dev bot + ngrok + Meta test number. User said "me llamo Mati" turn 1; profile extracted (`extractedFields: ["name"]` logged); bot re-asked "¿Cuál es tu nombre?" at turn 5 (trial-registration finalization). Three-point empirical chain locks Case A verdict.

### Audit Source-of-Truth (Carry-forward Carrier)

- `.planning/v5.3.3-codebase-audit.md` (lines 263-318, "Phase 96 — Context Awareness" section) — full analysis of `extractAndUpdateProfile` flow timing + Case A/B/C tradeoff space. **Audit's line refs DRIFTED from current master** — see Code Surface section below for verified positions.
- `.planning/v5.3.3-codebase-audit.md` (Section B candidate (iii) Sunday=0 lines ~111-148, Section E candidate (iii) lines ~290-300) — (iii) Sunday=0 carry-forward source-of-truth + locked verbatim text for D-06.
- `.planning/phases/95-booking-reliability-graceful-degradation/95-AUDIT.md` (Section E candidate (iii) "Phase 96 snapshot coordination required") — Plan 95-01's explicit deferral of (iii) Sunday=0 to Phase 96.

### Cross-Phase Invariant Source-of-Truth

- `.planning/phases/93-handler-concurrency/93-CONTEXT.md` (lines ~77-102) — original canonical invariant block.
- `.planning/phases/94-openai-latency-graceful-failure/94-CONTEXT.md` (lines ~29-46) — Phase 94 invariant block (textually identical).
- `.planning/phases/95-booking-reliability-graceful-degradation/95-CONTEXT.md` (lines ~32-49) — Phase 95 invariant block (textually identical).
- `.planning/ROADMAP.md` (Phase 93 Notes, Phase 94 SC#1, Phase 95 / 96 entries).
- `.planning/MACRO-ROADMAP.md` — milestone-wide constraint #6.

### Code Surface (Verified Against Master HEAD `beb2282b` — 2026-06-09)

**Handler `extractAndUpdateProfile` flow (line refs drifted from audit — verified positions below):**

- `el-templo-bot/src/webhook/handler.ts:1033-1048` — fire-and-forget invocation `extractAndUpdateProfile(...).catch((err) => log.error(...))`. (Audit cited `:822-837`.)
- `el-templo-bot/src/webhook/handler.ts:1580-1677` — function body of `extractAndUpdateProfile`. (Audit cited `:1369-1466`.)
- `el-templo-bot/src/webhook/handler.ts:1594` — extraction prompt content ("Sos un extractor de datos. ..."). (Audit cited `:1383`.)
- `el-templo-bot/src/webhook/handler.ts:1602` — `provider.chat(extractionPrompt)` call.
- `el-templo-bot/src/webhook/handler.ts:1603` — `rawContent = extractionResponse.content ?? "{}"`.
- `el-templo-bot/src/webhook/handler.ts:1606-1615` — inline `try { extracted = JSON.parse(rawContent) } catch { log.warn(..., "Profile extraction returned malformed JSON, skipping update"); return; }` — **D-12 replacement site** for `parseExtractionResponse` helper call.

**Session-history visibility (Case A verification):**

- `el-templo-bot/src/webhook/handler.ts:403` — `session.messages` re-read.
- `el-templo-bot/src/webhook/handler.ts:536-580` — `messages[]` assembly for `provider.chat`. (Phase 95 95-CONTEXT.md cited these.)
- These confirm session history IS visible to the model on every turn — supporting the D-01 Case A empirical reading.

**System prompt insertion points:**

- `el-templo-bot/src/ai/system-prompt.ts:217` — `*Reglas de uso de herramientas (CRITICO):*` section start. **D-06 / D-07 Sunday=0 directive inserts on the line BEFORE this heading.**
- `el-templo-bot/src/ai/system-prompt.ts:241` — `*Reglas de conversacion*` section start. **D-03 / D-04 CTXT rule inserts INSIDE this section, after existing rules, BEFORE `*Detección de perfil*` at `:339`.**
- `el-templo-bot/src/ai/system-prompt.ts:70-86` — SOFT_REJECTION_WHY_RULE / SOFT_REJECTION_BACKOFF_RULE. **UNCHANGED by Phase 96; SC#3 guardrail.**
- `el-templo-bot/src/ai/system-prompt.ts:107-156` — AVATAR_TONE_GUIDES. **UNCHANGED by Phase 96.**
- `el-templo-bot/src/ai/system-prompt.ts:162-176` — STATE_SECTIONS. **UNCHANGED by Phase 96.**
- `el-templo-bot/src/ai/system-prompt.ts:286-291` — profileContext injection (`if (options?.profileContext) sections.push(...)`). **UNCHANGED by Phase 96.**
- `el-templo-bot/src/ai/system-prompt.ts:339` — `*Detección de perfil*` conditional append. **UNCHANGED by Phase 96.**

### Test Surface

- `el-templo-bot/test/v5-3-3-booking-reliability.test.ts:55-72` — pre-existing RED test for (iii) Sunday=0; transitions to GREEN via D-06. **Phase 96 must rename the test (Claude's Discretion D-21 carry-forward) and verify byte-equal regex match.**
- `el-templo-bot/test/v5-3-2-regression.test.ts:33` — `SNAP_PATH` = `fixtures/pb1-e1a-lead-rendered.snap.txt`.
- `el-templo-bot/test/v5-3-2-regression.test.ts:57` — `POST_RLOK_04_BYTES = 18370`. **D-10 bump destination.**
- `el-templo-bot/test/v5-3-2-regression.test.ts:326-336` — RLOK-02 snapshot byte-equal test. **Passes against regenerated fixture without modification beyond the constant bump.**
- `el-templo-bot/test/fixtures/pb1-e1a-baseline.ts:9` — `BASELINE_CHARS = 23646`. **UNCHANGED by Phase 96; KGATE-05 baseline frozen.**
- `el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt` — current rendered fixture. **D-09 regeneration target.**
- `el-templo-bot/test/ai/prompt-size.test.ts:26` — `maxAllowed = Math.floor(BASELINE_CHARS * 0.8) = 18916`. **Passes post-regen at ~18,831 with ~85 chars margin.**

### Discipline Anchors (Phase 93/94/95 Patterns to Mirror)

- `.planning/phases/93-handler-concurrency/93-01-PLAN.md` — atomic-commit cadence, verification block style, adversarial-mode framing baseline.
- `.planning/phases/94-openai-latency-graceful-failure/94-01-PLAN.md` — single-plan mechanical task structure reference.
- `.planning/phases/95-booking-reliability-graceful-degradation/95-02-PLAN.md` and `/95-03-PLAN.md` — TDD RED→GREEN→SUMMARY discipline + non-investigative NORMAL plan-checker mode + D-XX numbering pattern.
- `el-templo-bot/CLAUDE.md` (lines 36-39) — test-file location convention (`el-templo-bot/test/` for unit, `el-templo-api/test/whatsapp/` for integration).
- `el-templo-bot/test/v5-3-2-regression.test.ts:326-336` — RLOK-02 surgical-tripwire byte-equal pattern; Phase 92-02 precedent for explicit fixture regen + constant bump in the same PR.

### Phase 96.5 Scoping Pointer (Out-of-Scope for Phase 96)

- `el-templo-bot/src/ai/system-prompt.ts` (no current date binding) — empty `grep "date|fecha|Hoy|today"`. **Phase 96.5 owner** for adding `*Convención:* Hoy es ${TODAY_ISO} (${DAY_NAME}).` or equivalent + snapshot date-stub infrastructure for byte-equal lock. NOT a Phase 96 deliverable.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`getSystemPrompt({ clientState, activePlaybook, currentStage, profileContext, softRejectionState })`** at `system-prompt.ts:180+` — single entry point for prompt rendering. D-03 CTXT rule and D-06 Sunday=0 directive both land in the universal-section path (no clientState gating). The renderer's `sections.push(...)` template at `:282-294` is the precedent for injection-style additions.

- **Inline `try { JSON.parse(rawContent) } catch { log.warn(...); return; }` at `handler.ts:1606-1615`** — current extraction-layer parse logic. D-12 replaces this exact block with a `parseExtractionResponse` call. The surrounding `log.warn({phone, rawContent}, "Profile extraction returned malformed JSON, skipping update")` log stays — helper's `null` return triggers the same skip path so observability is preserved.

- **`extractAndUpdateProfile` fire-and-forget pattern at `handler.ts:1033-1048`** — `.catch()` chain. D-12 helper change does NOT alter the fire-and-forget semantics; helper only affects the parse layer inside the async function.

- **`renderE1ALead()` harness in `test/v5-3-2-regression.test.ts`** (if present) — canonical PB1.E1A render shape for the snapshot fixture. D-09 regen target invocation. If `renderE1ALead()` doesn't exist as exported, Plan 96-01 can call `getSystemPrompt({ clientState: "lead", activePlaybook: "pb1", currentStage: "PB1.E1A" })` directly — the rendered output is the fixture.

### Established Patterns

- **`*Section heading:*` markdown style** — system-prompt.ts sections use single-line `*Heading:*` or `*Heading*` bold-emphasis markers, with content on subsequent lines or trailing. D-03 (`*Datos ya provistos:*`) and D-06 (`*Convención:*`) match this convention exactly.

- **No `console.log`** — `el-templo-bot/CLAUDE.md` line 6 Standards: use Pino logger. Phase 96 changes inherit this — `parseExtractionResponse` helper does NOT log internally; logging happens at the caller (existing `log.warn` at `handler.ts:1611-1613`). Helper is pure: input string → parsed object or null.

- **`unknown` not `any`** — `el-templo-bot/CLAUDE.md` line 5. Helper returns `Record<string, unknown> | null`, not `any`. Caller narrows fields with the existing per-field `typeof extracted.X === "string"` discipline at `handler.ts:1627-1660`.

- **`catch (err: unknown)` with `instanceof Error`** — `el-templo-bot/CLAUDE.md` line 7. Helper does NOT throw; it returns `null` on failure. Caller does NOT need an additional try/catch around the helper call.

- **Phase 92-02 surgical-tripwire snapshot regen** — explicit `pb1-e1a-lead-rendered.snap.txt` regen committed alongside the prompt change + `POST_RLOK_XX_BYTES` constant bump in same PR. Phase 96 follows this exact discipline.

### Integration Points

- **Plan 96-01 ↔ Plan 95-01 deferred (iii) Sunday=0:** Plan 95-01 explicitly deferred (iii) to Phase 96 to avoid Phase 95 touching `system-prompt.ts` and triggering snapshot regen mid-milestone. Plan 96-01's D-06 closes that carry-forward. The (iii) RED test at `v5-3-3-booking-reliability.test.ts:55` transitions to GREEN automatically; no rebuild of the test surface needed.

- **Plan 96-01 ↔ Phase 97 RGUARD-01:** Phase 97 RGUARD-01 will mirror Phase 92's RLOK pattern with `v5-3-3-regression.test.ts` (milestone-scoped suite). Plan 96-01's 6 tests in `v5-3-3-context-awareness.test.ts` become regression-protectors that RGUARD-01 either (a) absorbs entirely into the v5-3-3-regression suite, or (b) leaves in place and asserts at the file-existence level. D-15 keeps the file in `el-templo-bot/test/` so Phase 97's choice is unconstrained.

- **Plan 96-01 ↔ Phase 97 RGUARD-02 (SC#3 invariant assertion):** Plan 96-01's test #2 (D-16) asserts CTXT rule + SOFT_REJECTION rules visible non-conflicting in the SAME rendered prompt. Phase 97 RGUARD-02 extends this with a behavioral / structural assertion at the milestone-suite level. Plan 96-01's test scope is the foundation Phase 97 RGUARD-02 stands on.

- **Plan 96-01 ↔ Phase 96.5 (NEW):** Phase 96.5 to be discussed + planned + executed after Phase 96 closes (per user-locked Pending Decisions). Plan 96-01 closes the snapshot-regen surface; Phase 96.5 then ADDS a second prompt change (`*Convención:* Hoy es ${TODAY_ISO}`) which triggers a SECOND snapshot regen and `POST_RLOK_04_BYTES` bump. Phase 96.5 inherits all Phase 96 discipline (NORMAL plan-checker, no F-1/F-2 gates, 6-pair sha256 invariant, KGATE-05 budget verification).

</code_context>

<specifics>
## Specific Ideas

- **The "Mati → apellido" example in the CTXT rule is the IRREDUCIBLE empirical anchor.** Live-repro 2026-06-09 captured the exact failure mode the rule closes; the example ties the rule to the observation. Under any budget-pressure trim path (D-11), the parenthetical clarifications drop FIRST; the "Mati → apellido" surname-vs-firstname distinction stays UNTIL LAST.

- **Audit-verbatim discipline for Sunday=0 (D-06), empirical-driven deviation for CTXT (D-03).** The rule of thumb: audit text is the default; deviation requires empirical justification. For Sunday=0, no live evidence demands deviation — audit text passes the RED test as-is. For CTXT, live evidence (Mati → apellido) explicitly demands the deviation; audit's general framing would still ship a working rule but would miss the empirically-observed regression risk.

- **`parseExtractionResponse` returns `null` (not throws) for backward-compatibility.** Existing extraction caller at `handler.ts:1614` expects the parse to either succeed (returning an object) or skip silently (current `JSON.parse` catch → `return`). The helper preserves both behaviors by returning `null` for skip, narrowing the caller's interface to a single `if (!extracted) { log.warn(...); return; }` form. No throw semantics added.

- **Snapshot regen + (iii) Sunday=0 RED transition happen in the SAME atomic GREEN commit.** Plan 96-01 RED commit lands ONLY the 6 new tests in `v5-3-3-context-awareness.test.ts` plus the (iii) RED at `v5-3-3-booking-reliability.test.ts:55` confirmed-still-RED via a pre-commit `pnpm test` capture. Plan 96-01 GREEN commit lands ALL of: D-03 CTXT rule string, D-06 Sunday=0 directive string, D-09 regenerated fixture, D-10 `POST_RLOK_04_BYTES` bump, D-12 `parseExtractionResponse` helper, D-12 caller refactor at `handler.ts:1607-1615`. Single atomic GREEN commit makes review surface coherent — reviewer sees the entire Phase 96 delta as one unit.

- **No test for Case A behavioral validation in Phase 96.** Empirical model behavior (does the CTXT rule ACTUALLY change re-ask frequency?) is Phase 97 RGUARD-01's territory via the RLOK-03 live-test gate pattern. Plan 96-01 ships structural assertions (rule presence, fixture byte-equal, helper unit tests) — the empirical validation comes later. This mirrors Phase 91 OBJN-01/02 discipline: ship the rule structure, validate behavior in the milestone live-test gate.

- **Out-of-scope guards are enforced via `git diff` negative assertions in plan verify blocks** — Plan 96-01's `<automated>` verify gates include: `git diff HEAD~ HEAD -- el-templo-bot/src/ai/system-prompt.ts | grep -qvE 'SOFT_REJECTION|AVATAR_TONE_GUIDES|STATE_SECTIONS|Detección de perfil'` to assert no out-of-scope `system-prompt.ts` lines are touched. Pattern: enumerate FORBIDDEN regions, fail commit if diff includes them.

- **Live-repro transcript fragments belong in `96-DISCUSSION-LOG.md`, not `96-CONTEXT.md`.** CONTEXT.md is consumed by downstream agents (researcher / planner / executor) and stays decision-focused. DISCUSSION-LOG.md is the human-audit record and captures the turn-by-turn repro evidence for retrospective traceability.

- **The "Hoy es" Phase 96.5 directive will be a SECOND `*Convención:*` line in the same insertion-point region.** Phase 96.5 does NOT need to refactor Phase 96's single-line `*Convención:*` into a `*Convenciones*` section heading — it appends a second line:

  ```
  *Convención:* el día de la semana se codifica como 0=domingo, 1=lunes, ..., 6=sábado.
  *Convención:* Hoy es ${TODAY_ISO} (${DAY_NAME_TODAY}).
  ```

  Two lines, two `*Convención:*` markers, no structural change to Phase 96's diff. Phase 96.5's only structural change is in the snapshot test infrastructure (date stub for byte-equal lock).

- **Finding #2 verdict locked at "pure model hallucination."** During this discuss session, the date-hallucination root cause was definitively identified as Hypothesis A — verified via reading `tools.ts:279-288` (ScheduleRow has no date column, only `day_of_week`), `tools.ts:415` and `:426` (output formatters emit only `${dayName} ${start_time}-${end_time}`, never a date string), and `tools.ts:691, :869` (book_class and register_trial accept `date` from MODEL args verbatim). System prompt `grep "date|fecha|Hoy|today"` returned empty. Phase 96.5 scope is pure-prompt; data/seed/API layers are clean. This finding is captured here as supporting context for Phase 96.5 scoping.

</specifics>

<deferred>
## Deferred Ideas

- **Phase 96.5 (NEW) — Date Grounding Fix (HARD BLOCKER pre-v5.4.0).** Adds `*Convención:* Hoy es ${TODAY_ISO} (${DAY_NAME_TODAY}).` (or equivalent) to `system-prompt.ts` + snapshot test infrastructure to stub `Date.now()` for byte-equal lock + tests covering date hallucination prevention. ~30 LOC total. **MUST close before v5.4.0 staging deploy**: production users will receive past dates ("¿lunes de 2023?"), bookings will fail on confirmation (backend rejects schedule_id + invalid date combination), net result = zero successful trial bookings until fixed. Confirmed pure-prompt fix via this discuss's Finding #2 investigation. Phase number `96.5` reflects user-locked fractional-phase insertion between Phase 96 and Phase 97. To be discussed + planned + executed as its own focused phase after Phase 96 closes.

- **Finding #3: `register_trial` fetch failed on Confirmar** — Verify against staging during v5.4.0 deploy. Most likely cause: `el-templo-api` not running at `localhost:3000` during the 2026-06-09 dev test (user noted dev bot is not connected to API for real schedule data). Node `fetch failed` is a network-layer rejection (DNS / connection refused / abort), not an HTTP 4xx — confirming dev-env, not production code. Escalates to its own debug session ONLY if it persists with API connected in staging.

- **Finding #5: `discovery_escape_fired` at PB1.E1A turnCount:3** — Confirmed working as designed per Phase 90 STAGE-01/02 ("infinite-loop escape hatch (N=3 force-advance)" — PROJECT.md Key Decisions). No action needed; documented for traceability.

- **Case B (synchronous extraction refactor)** — Make `extractAndUpdateProfile` block the reply send so extraction completes BEFORE the next turn's prompt is rendered. Architectural surface change (adds an OpenAI call to the critical reply path), increases worst-case handler latency, conflicts with Phase 94's interim-UX assumptions. Deferred to v5.4+ if empirical evidence (post-Phase-96 live testing) proves Case A's prompt rule insufficient.

- **Case C (hybrid)** — Both Case A (Phase 96 deliverable) AND Case B refactor. Deferred to v5.4+ for the same reason as Case B alone — pulling the extraction-layer refactor in adds blast radius without empirical justification under current evidence.

- **Externalizing `parseExtractionResponse` to a shared `extract-json.ts` module** — Phase 95 D-16 precedent: co-located helpers stay co-located until a SECOND consumer materializes. If Phase 96.5 or v5.4+ adds a second site that needs markdown-fence-aware JSON parsing, externalization is a clean refactor PR then. Phase 96 ships the helper file-private to `handler.ts`.

- **Behavioral live-test for CTXT rule (RLOK-03 pattern)** — Empirical validation that the CTXT rule actually shifts model behavior (does Mica re-ask names less frequently? Does she correctly ask for apellido when she has nombre?). Phase 97 RGUARD-01 territory. Plan 96-01 ships structural assertions only.

- **`extractAndUpdateProfile` reliability improvements for short messages** — Audit Unknown #2 (`v5.3.3-codebase-audit.md:317`) flagged that the extraction model may legitimately return `{}` for very short messages (e.g., "Ignacio Bordon" 2 tokens, no context). Multi-run sampling or prompt-engineering improvements to the extraction prompt are deferred to v5.4+. The live-repro showed "Mati" extracted successfully — the failure mode that Phase 96 closes is downstream of extraction reliability.

- **Reviewing whether `extracted.name` field merge at `handler.ts:1627-1629` should consolidate first+last name handling** — current merge overrides `merged.name` with any non-empty `extracted.name`. If the extraction model returns just "Mati" on turn 1 and just "Bordon" on turn 5, the second extraction would OVERWRITE the first. Edge case; not observed empirically; deferred to v5.4+ data-modeling work.

- **Potential Phase 92-style multi-run sampling test for CTXT-01/02** — if Phase 97 ELEV-01 / VOSEO-01 lands the milestone-wide non-deterministic regression strategy via multi-run sampling, the CTXT rule's empirical validation could migrate to that strategy. Deferred to Phase 97 plan-time decision (per STATE.md Carry-forward: "Phase 97 non-deterministic regression strategy").

</deferred>

---

_Phase: 96-context-awareness_
_Context gathered: 2026-06-09 — discussion with 4 areas (BUG-04 case verdict + Case A lock, CTXT rule wording + placement, (iii) Sunday=0 directive integration, test strategy + snapshot regen + Finding #4 extraction hardening). Live-repro evidence captured 2026-06-09. Findings #2 / #3 / #5 triaged out of scope (Phase 96.5 / dev-env / working-as-designed)._
