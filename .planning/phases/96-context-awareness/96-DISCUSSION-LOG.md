# Phase 96: Context Awareness — Discussion Log

**Date:** 2026-06-09 (with pause for live-repro 2026-05-20 → 2026-06-09)
**Phase:** 96-context-awareness
**Status:** Context captured — ready for plan-phase

This log is a human-audit record. The canonical decisions are in `96-CONTEXT.md`. The narrative below preserves the _journey_ — what was asked, what evidence was surfaced, what was rejected and why, what the user pushed back on.

---

## Session Provenance

- **Authorization:** User explicitly authorized `/gsd-discuss-phase 96` after `/gsd-progress` confirmed all 6 pre-discuss gates green at HEAD `beb2282b`.
- **Pre-discuss carry-forward constraints honored** (from user-injected context):
  1. Implementation-choice question treated as empirical (Case A/B/C) — not preference.
  2. Phase 96 = canonical snapshot regeneration point for v5.3.3.
  3. SC#3 invariant (RLOK-03) preservation — CTXT work does NOT conflate with Phase 91 SOFT_REJECTION rules.
  4. Disciplines maintained: F-1/F-2 verify gates NOT regenerated; D-XX numbering; 6-pair sha256 hash unchanged; NORMAL plan-checker mode for eventual plan.
  5. Carry-forward NOT in scope for Phase 96: 94-01 SC#3 flake, 95-03 DEGR-01 flake, Phase 94 live BUG-02 smoke (v5.4.0).

- **Autonomous flag:** FALSE — STOP after CONTEXT.md + DISCUSSION-LOG.md commit. Surface state for review before authorizing plan-phase.

- **Filesystem Fallback §9a:** If discuss executor hangs, verify what landed on disk first, do NOT auto-recover.

---

## Pre-Analysis (Before AskUserQuestion)

Loaded:

- `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`
- `.planning/phases/95-booking-reliability-graceful-degradation/95-CONTEXT.md` (most recent prior CONTEXT)
- `.planning/v5.3.3-codebase-audit.md` (Phase 96 section, lines 263-318)
- `contexto/backlog-post-v532` (BUG-04 lines 71-86)
- `contexto/post-phase-91-live-test-findings.md` (second data point)

**Line-ref drift verification (audit vs current master):**
| Reference (in audit) | Current master HEAD `beb2282b` |
|---|---|
| `handler.ts:822-837` (fire-and-forget catch) | `handler.ts:1033-1048` |
| `handler.ts:1369-1466` (extractAndUpdateProfile fn) | `handler.ts:1580-1677` |
| `handler.ts:1383` (extraction prompt) | `handler.ts:1594` |

Drift surfaced and CONTEXT.md captures the CURRENT positions (canonical_refs section).

**Pre-existing empirical evidence (before live repro):**

| Failure                   | Date       | Field re-asked      | History visibility    | Classification                    |
| ------------------------- | ---------- | ------------------- | --------------------- | --------------------------------- |
| Phase 91 live test        | 2026-04-16 | training experience | ✓ in session.messages | "model chose to re-ask"           |
| BUG-04 (post-v5.3.2 live) | 2026-04-16 | full name           | ✓ per backlog         | data in history, model didn't use |

Two-point empirical chain supported Case A. User opted to add a third point via fresh live repro.

---

## Area Selection

User selected ALL 4 candidate areas:

1. BUG-04 case verdict (A/B/C)
2. CTXT rule wording + placement
3. (iii) Sunday=0 directive integration
4. Test strategy + snapshot regen

---

## Area 1 — BUG-04 Case Verdict

### Round 1: Initial framing

I presented Case A (recommended) with the two-point empirical evidence chain. Offered Case B (extraction-only), Case C (hybrid), and "reproduce live before deciding."

User chose: **"Reproduce BUG-04 live before deciding."**

### Round 1.5: Forensic repro from existing transcripts

I attempted forensic repro from `post-phase-91-live-test-findings.md` — surfaced the second data point ("Mica re-asked 'contame si ya entrenaste calistenia antes' after user had already said 'primera vez'. The conversation history was in context but the model chose to re-ask").

Both transcripts independently classify the failure as "history visible, model chose to re-ask." Zero data points for Case B (within-turn race).

### Round 2: Re-ask with second data point added

User chose: **"Pause discuss — you run a live repro out-of-band first."**

Rationale: empirical confidence before locking matters more than the two-point chain alone.

### Live UAT repro (out-of-band, 2026-06-09)

**Setup:**

- Fresh Redis state (`FLUSHALL` pre-test, no prior profile)
- Dev bot on port 3001 + ngrok `https://palingenesian-nonvitally-verona.ngrok-free.dev`
- Live WhatsApp test number, real OpenAI calls (gpt-4o-mini)

**Conversation transcript (5 turns up to BUG-04 trigger):**

```
Turn 1 (user): "Hola, me llamo Mati, quiero información sobre el gimnasio"
Turn 1 (bot):  "¡Hola Mati! Soy Mica del equipo de El Templo 🙋‍♀️.
                Contame, ¿ya entrenaste calistenia antes o sería tu primera vez?"
               → Bot correctly captured and used "Mati" (first name)
               → Log: extractedFields:["name"]

Turns 2-4: Bot continued conversation, did NOT re-ask name

Turn 5 (user): "en Alem, lunes 8 a 9"
Turn 5 (bot):  "Perfecto, reservamos tu clase de prueba en la sede de
                Alem el lunes de 08:00 a 09:00. Solo necesito tu nombre
                completo para finalizar el registro. ¿Cuál es tu nombre?"
               → BUG-04 REPRODUCES. Bot asks for name despite "Mati" in turn 1.
```

**Classification:**

- Data was visible in history (`extractedFields:["name"]` logged turn 1; "Mati" in `session.messages`)
- Profile updated successfully in Redis
- Model chose to re-ask 4 turns later
- Failure mode: **model attention, not data plumbing**

**Three independent data points now confirm Case A:**

1. Phase 91 live test (2026-04-16) — calistenia experience re-ask
2. BUG-04 backlog (post-v5.3.2) — "Ignacio Bordon" re-ask narrative
3. Live manual repro (2026-06-09) — "Mati" re-ask at trial registration

### Round 3: Lock decision

User chose: **"Case A confirmed — apellido nuance documented."**

**Nuance captured:** Bug emerged specifically at trial/booking finalization. Bot's apparent logic: "need FULL NAME for registration; 'Mati' alone insufficient." Prompt fix needs TWO components:

1. Don't re-ask information already in history/profile
2. If full name needed but only first name available, ask for **LAST NAME specifically** ("¿cuál es tu apellido?"), NOT "your name" ("¿cuál es tu nombre?")

This nuance drove the Option C wording selection in Area 2.

### Round 4: Live-repro exploratory findings (4 additional findings surfaced)

User continued testing past BUG-04 trigger and reported 4 additional findings:

**Finding #2 — Date hallucination "2023-11-06":** register_trial called with `date:"2023-11-06"`. Actual date 2026-06-09. Bot computing dates ~2.5 years in past. User hypotheses: A (model hallucination), B (tool/data issue), C (combination).

**Finding #3 — `fetch failed` on Confirmar:** After Confirmar button, `{"level":50,"err":"fetch failed","msg":"Error handling inbound message"}`. Possibly withTimeout firing, backend unreachable, or interactive button payload mishandling.

**Finding #4 — Profile extraction JSON malformed:** Log captured `rawContent:"```json\n{\n  \"branchPreference\":\"Constitución\",\n  \"notes\":\"Primera vez, soy principiante\"\n}\n```"`. LLM wrapped JSON in markdown fences. JSON.parse failed → profile update silently skipped.

**Finding #5 — `discovery_escape_fired`:** Stage advancement event PB1.E1A → PB1.E2A at turnCount:3. User unsure if intended.

**Triage table proposed:**

| #   | Finding                     | My read                                              | Reasoning                                                                     |
| --- | --------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| 2   | Date calc "2023-11-06"      | Piggyback option exists for Phase 96, but not 1 line | "Hoy es" directive needs snapshot infra to stub date; real cost ~30 LOC       |
| 3   | `fetch failed` on Confirmar | Out of Phase 96 scope — likely caused by #2          | If date arg invalid, backend 400s → surfaces as fetch failure                 |
| 4   | Markdown-fenced JSON        | Phase 96 scope candidate (recommended)               | 3 LOC; same file as CTXT rule; defensive hardening of CTXT-02 data side       |
| 5   | discovery_escape_fired      | Working as designed — Phase 90 STAGE-02              | "infinite-loop escape hatch (N=3 force-advance)" per PROJECT.md key decisions |

### Round 5: Scope decision for #2 and #4

I offered four scope options for #2 and #4. User chose:

**"Phase 96 absorbs #4; #2 → new Phase 96.5 (date grounding)"**

Reasoning (verbatim from user):

> "Finding #2 is a HARD BLOCKER pre-v5.4.0, not v5.4.0 carry-forward. In production: users will receive past dates, bookings will fail on confirmation, zero successful trial bookings. The repro showed exactly this — bot offered date 2023-11-06, confirmation triggered fetch failed."

Phase 96.5 inserted between Phase 96 and Phase 97 as own focused phase. Precedent for fractioned phases referenced (95-01 / 95-02 / 95-03 plan numbering and v5.3.3 numbering structure).

---

## Area 2 — CTXT Rule Wording + Placement

### Round 1: Three wording options presented

- **Option A (minimal, ~240 chars):** Generic "datos ya provistos" rule with partial-data parenthetical.
- **Option B (enumerated, ~285 chars):** Explicit field list (nombre/apellido/sucursal/lesiones/preferencias/experiencia) + parenthetical example.
- **Option C (hybrid + explicit "Mati → apellido" example, ~365 chars):** Verbatim live-repro anchor + explicit anti-pattern ("NO la categoría completa").

### Round 1.5: User paused mid-question to investigate Finding #2 root cause

User halted to verify whether Phase 96.5's scope was truly "model hallucination" or could be data/API issue.

I read `tools.ts:258-378` (`checkSchedule`) and `tools.ts:691-805` (`bookClass`) and `tools.ts:845-955` (`registerTrial`) and confirmed:

1. **`check_schedule` returns NO date strings.** Schema at `tools.ts:279-288`: `id, activity_name, branch_name, day_of_week, start_time, end_time, max_capacity, booking_count`. Output formatters at `tools.ts:415, :426`: `${dayName} ${row.start_time}-${row.end_time}` — only day name + time, NEVER a date string.

2. **`book_class` and `register_trial` take `date` from MODEL args.** At `tools.ts:691`: `const date = typeof args.date === "string" ? args.date : "";`. Tool passes verbatim into confirmation summary at `tools.ts:905`: `${dayName} ${date}`. Date "2023-11-06" was fabricated by the LLM.

3. **`system-prompt.ts` has zero date anchors.** `grep "date|fecha|Hoy|today"` returned empty.

**Verdict:** Finding #2 confirmed pure model hallucination (Hypothesis A). Phase 96.5 scope is pure-prompt + snapshot date-stub infrastructure. ~30 LOC. No data/seed/API touches needed.

Finding #3 re-triaged: "fetch failed" is Node fetch rejection (DNS/connection refused/abort), not HTTP 4xx — confirms dev-env API not running, unrelated to #2.

### Round 2: Lock CTXT rule wording

User chose: **Option C — hybrid with explicit "Mati → apellido" example.**

Reasoning (verbatim):

> 1. "Mati → apellido" example is verbatim live repro
> 2. Only option with explicit anti-pattern ("NO la categoría completa")
> 3. Generic phrasing + concrete example scales better than B's enumeration
> 4. Matches PROJECT.md precedent: enumerate explicitly when general rule fails empirically

**Budget envelope captured by user:**

- KGATE-05 headroom: 546 chars
- Phase 96 CTXT rule C: ~365 chars
- Phase 96 Sunday=0 directive: ~92 chars
- Phase 96.5 "Hoy es X" directive: ~25 chars
- Total: ~482 chars, margin: ~64 chars

User: "Tight but technically fits. If plan-phase byte audit shows actual post-templating bytes exceed budget, fallback trims C parenthetical clarifications while preserving 'Mati → apellido' example as the irreducible empirical anchor."

This decision became D-03 (wording) + D-11 (budget fallback path) in CONTEXT.md.

---

## Area 3 — (iii) Sunday=0 Directive Integration

### Round 1: Placement options

- **Option 1 — New `*Convenciones*` block** (Phase 96.5-friendly, adds ~30 chars overhead for section heading)
- **Option 2 — Inline single-line `*Convención:*`** (audit-verbatim, smaller diff)

### Round 2: Lock placement

User chose: **Option 2 — inline single-line `*Convención:*`.**

Reasoning (verbatim):

> 1. Budget headroom: Option 2 + Phase 96.5 ≈ 482 chars (margin 64), vs Option 1 + Phase 96.5 ≈ 512 chars (margin 34). Option 2 leaves ~30 chars more headroom for plan-phase byte audit surprises.
> 2. Audit-verbatim discipline: For CTXT rule we deviated to Option C because empirical repro demanded the apellido nuance. For Sunday=0 there's NO empirical reason to deviate.
> 3. YAGNI on future structure: Option 1's `*Convenciones*` section is optimizing for predicted future complexity. Phase 96.5's "Hoy es X" can land as a second `*Convención:*` line — model treats both as conventions regardless of heading.
> 4. If Phase 96.5 (or later) actually accumulates 3+ convention facts, a future refactor PR can introduce the `*Convenciones:*` section then with full information.

Locked text:

```
*Convención:* el día de la semana se codifica como 0=domingo, 1=lunes, ..., 6=sábado.
```

Insertion point: single line BEFORE `*Reglas de uso de herramientas*` at `system-prompt.ts:217`.

This became D-06 / D-07 in CONTEXT.md.

---

## Area 4 — Test Strategy + Snapshot Regen + Finding #4

### Round 1: Finding #4 implementation choice

Three options:

- Inline regex strip in `extractAndUpdateProfile` (3 LOC, not unit-testable)
- Module-local helper `parseExtractionResponse(rawContent)` in `handler.ts` (~10 LOC, unit-testable, follows Phase 95 D-16 precedent)
- New file `el-templo-bot/src/ai/extract-json.ts` (over-engineering for single consumer)

User chose: **Module-local helper.**

Reasoning (verbatim):

> 1. Phase 95 D-16 precedent: withTimeout helper was co-located in single-consumer file. parseExtractionResponse follows same pattern. Consistency with prior decisions.
> 2. Testability value: Inline (Option 2) blocks unit testing — must exercise full extraction flow with provider.chat mocks.
> 3. Option 3 (new file) is over-engineering for single consumer; violates D-16 explicitly.

Helper API locked:

````
function parseExtractionResponse(rawContent: string): Record<string, unknown> | null
  Strips markdown code fences (```json, ```, etc.) before JSON.parse.
  Returns null on truly malformed content (preserves current "skip update"
  behavior for unparseable cases). Exported for test, remains in handler.ts
  file-private otherwise.
````

### Round 2: Test-suite scope

Three options:

- Minimal (3 tests)
- Defensive (6 tests)
- Behavioral (minimal + live OpenAI smoke test)

User chose: **Defensive — 6 tests.**

Reasoning (verbatim):

> 1. Matches Phase 95 precedent (95-02 ~7 tests, 95-03 9 tests). Minimal scope would deviate from established rigor without justification.
> 2. Each defensive test has concrete value:
>    - Test 4 (CTXT rule NOT in SOFT_REJECTION): prevents future regression if someone moves rule to conditional section
>    - Test 5 (parseExtractionResponse rejects malformed): pins current "skip on truly malformed" behavior so fix doesn't introduce silent acceptance
>    - Test 6 (BUG-04 forensic-fixture replay): empirical anchor from live UAT, catches regression in extraction/messages flow
> 3. Behavioral (live OpenAI) explicitly out of scope — Phase 97 RGUARD-01 territory.

Test file destinations confirmed:

- NEW: `el-templo-bot/test/v5-3-3-context-awareness.test.ts` (6 tests)
- MODIFIED: `el-templo-bot/test/v5-3-2-regression.test.ts` (`POST_RLOK_04_BYTES` bump from 18370 to ~18827)
- MODIFIED: `el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt` (regenerated)

Snapshot regen confirmed:

- Bytes increment ~457 (CTXT + Sunday=0)
- KGATE-05 dual-threshold (`BASELINE_CHARS * 0.8 = 18916`) passes with ~89 chars margin against new `POST_RLOK_04_BYTES = ~18827`

This became D-12..D-18 in CONTEXT.md.

---

## Deferred Ideas (Captured)

Carried forward into CONTEXT.md `<deferred>` section:

1. **Phase 96.5 (NEW) — Date Grounding Fix** — HARD BLOCKER pre-v5.4.0 deploy. Pure-prompt fix per Finding #2 investigation.
2. **Finding #3 (`register_trial` fetch failed)** — Verify against staging during v5.4.0 deploy. Likely dev-env-only.
3. **Finding #5 (`discovery_escape_fired`)** — Working as designed; no action.
4. **Case B (synchronous extraction refactor)** — Architectural change deferred to v5.4+ pending empirical evidence Case A insufficient.
5. **Case C (hybrid)** — Same reason as Case B.
6. **Externalizing `parseExtractionResponse` to shared module** — Wait for second consumer; Phase 95 D-16 precedent.
7. **Behavioral live-test for CTXT rule** — Phase 97 RGUARD-01 territory.
8. **`extractAndUpdateProfile` reliability improvements for short messages** — Audit Unknown #2 deferred to v5.4+.
9. **First+last name merge consolidation at `handler.ts:1627-1629`** — Edge case; deferred to v5.4+.
10. **Multi-run sampling test for CTXT-01/02** — Phase 97 plan-time decision.

---

## Out-of-Scope Guards (Captured)

Carried forward into CONTEXT.md `<domain>` "NOT in scope":

- Findings #2 / #3 / #5
- Case B / Case C
- `handler.ts` changes beyond `extractAndUpdateProfile` / `parseExtractionResponse`
- `system-prompt.ts` sections outside CTXT rule + Sunday=0 insertion points (SOFT_REJECTION, AVATAR_TONE_GUIDES, STATE_SECTIONS, profileContext injection, `*Detección de perfil*`)
- KGATE-05 baseline change (BASELINE_CHARS frozen)

---

## Session Outcome

- **3 independent empirical data points lock Case A** for BUG-04 implementation lane.
- **D-01..D-23 decisions captured** in CONTEXT.md with full rationale per decision.
- **Phase 96.5 surfaced** as NEW phase requiring own discuss + plan after Phase 96 closes (date hallucination, HARD BLOCKER pre-v5.4.0).
- **Findings #3 / #5 dismissed** with documented rationale.
- **Finding #4 absorbed** into Phase 96 as defensive extraction-layer hardening (module-local helper).
- **(iii) Sunday=0 carry-forward** integrated; RED test transitions GREEN via audit-verbatim directive.
- **Test scope = Defensive (6 tests)**, matching Phase 95 precedent.
- **Snapshot regen** bounded by KGATE-05 dual-threshold with ~89 chars margin.

**Plan-checker mode for Plan 96-01:** NORMAL (mechanical scope; no investigative branching).

**Next step:** User reviews CONTEXT.md + DISCUSSION-LOG.md. After approval, `/gsd-plan-phase 96` to author Plan 96-01 (RED→GREEN→SUMMARY atomic chain covering all four deliverables in a single plan).

---

_Discussion log captured: 2026-06-09_
