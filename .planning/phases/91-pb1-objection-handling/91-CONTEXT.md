# Phase 91: PB1 Objection Handling - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning
**Requirements:** OBJN-01, OBJN-02

<domain>
## Phase Boundary

When a PB1 lead signals **soft rejection during discovery** ("no me interesa", "no creo", "no voy a hacerlo", "me parece que no"), Mica asks an open WHY question (curious, non-defensive) before any close. PB1 carries explicit instruction for this case so the conversation does NOT default to "tomá tu tiempo, saludos" the moment the lead pushes back.

**In scope:** discovery stages (PB1.E1A, E1B, E2A, E2B, E3) only. Detection signal + conditional framing rules + state flag for the WHY → back-off two-turn arc.

**Out of scope:** PB1.E4–E7 (REGLA FUERTE has its own rules), full PB2-style objection handling (price/time/identity/diffuse — that's PB2.E2's job), human escalation for soft objections (SC#3 forbids), elevator pitch fix (Problem 3 from live-test, deferred to post-Phase-92 QT).

</domain>

<decisions>
## Implementation Decisions

### Mechanism — Hybrid (signal + conditional framing rule)

- **Defense-in-depth pattern**, mirroring Phase 89's KFIX-01 + price-deferral approach: structural gate + behavioural prompt rule, both active.
- **Signal layer:** new `softRejection` boolean returned from `computeAdvanceSignals` in `el-templo-bot/src/webhook/handler.ts`, alongside existing `priceObjection` / `directQuestionAsked` / `userInsistedDirect`.
- **Effect when signal fires AND `stageId ∈ {PB1.E1A, E1B, E2A, E2B, E3}`:**
  1. Block stage advancement this turn.
  2. Inject a conditional framing rule into the prompt **for this turn only** instructing Mica what shape this reply must take (WHY rule or back-off rule, depending on `whyAsked` state).
- **Why hybrid, not signal-only:** pure signal blocks advance but lets the model improvise "tomá tu tiempo, saludos" because nothing told it to change reply shape.
- **Why hybrid, not framing-rule-only:** Phase 90 live-test (Problem 3) confirmed the model can ignore prompt rules when other content competes semantically. Need the deterministic gate.
- **Conditional injection (not always-on):** the framing rule appears in the prompt only when the signal is hot. Keeps baseline prompt unchanged, avoids rule fatigue, preserves snapshot delta = 0.

### Detection — `softRejection` regex

- **Style:** non-word-boundary class-based pattern matching the existing `E1A_E1B_CATEGORIES` and `priceObjection` conventions in `handler.ts`. Use `(^|[^a-záéíóúñ])...([^a-záéíóúñ]|$)` style or equivalent so accented Spanish doesn't break matching.
- **MUST match (explicit rejection, including the live-test variants from 2026-04-16):**
  - `no me interesa`
  - `no es para mí` / `no es para mi`
  - `no gracias` / `no, gracias`
  - `paso` (with negative lookahead for `paso por`, `paso a paso`)
  - `mejor no`
  - `no voy a` (also `no voy a hacer(lo)`, `no voy a ir`, `no voy a inscribirme`, `no voy a anotarme`)
  - `no creo` (standalone — `^\s*no creo\s*\.?\s*$` — and inside `creo que no me interesa` via the `no me interesa` branch)
  - `creo que no` (standalone)
  - `me parece que no` (live-test variant, MUST be included)
- **MUST NOT match (hesitation / scheduling, not rejection — handled elsewhere):**
  - `no sé`, `no se`
  - `tal vez`, `capaz`
  - `lo pienso`, `lo voy a pensar`, `dejame pensarlo` (PB2 retention vocabulary)
  - `no creo que pueda hoy`, `no puedo el martes` (logistics, not rejection)

### Stage scope — discovery only

- Active stages: **PB1.E1A, PB1.E1B, PB1.E2A, PB1.E2B, PB1.E3**.
- **Never active:** PB1.E4 (REGLA FUERTE — única CTA es la prueba gratis; a WHY here risks the model exploring objections or surfacing plan-talk), PB1.E5–E7 (post-booking semantics, "rejection" means something else).
- Evidence-based scoping: live-test failure surfaced at E1A, but all five discovery stages share the same structural vulnerability — scope the fix uniformly to the discovery block, no further.

### WHY-reply shape — single fixed framing rule + 2–3 examples

- **Style:** matches existing PB1 `*Regla de defer*` / `*REGLA — precios*` conditional clauses — a tonal anchor + 2–3 example phrasings the model can paraphrase, NOT a literal hard-coded reply.
- **Required ingredients of the rule:**
  - Tone: **curious, non-defensive, no presión, no justificarse, no vender**.
  - 2–3 example WHYs (parafraseable). Working draft:
    - "Te entiendo. ¿Puedo preguntarte qué te hace dudar?"
    - "Dale, sin problema. ¿Qué es lo que no te termina de cerrar?"
    - "Buenísimo que me lo digas. ¿Qué te frena?"
  - Explicit prohibitions: NO offering alternatives, NO counter-offering (PB2 territory), NO closing/farewell in this same turn (this turn's job is to _open_, not close), NO "tomá tu tiempo, saludos".
- **Why not hard-coded reply:** breaks Mica's tone, robotic, no context adaptation, inconsistent with the rest of the bot.
- **Why not variant pool:** complexity without benefit — Option 1 already lets the model paraphrase.

### Turn cap — exactly 1 WHY turn, then back-off

- After the WHY, if user re-confirms rejection → next turn is back-off, not a second WHY and not a PB2-style objection-handler.
- **Why:** PB1 is discovery + trial CTA; PB2.E2 already owns the four authored objection branches (precio / tiempo / identidad / diffuse). Phase 91 must NOT duplicate that logic in PB1 — keeps the playbook boundary clean.
- Persistent rejection signal would violate the playbook's explicit "no presión" tone.

### Back-off behaviour — graceful close + door-open phrase, no state mutation

- **Trigger:** `softRejection` fires AND `whyAsked === true`.
- **Effect:** inject a second conditional framing rule for the back-off turn — warm acknowledgement + door-open phrase, **no follow-up question, no discount, no alternative, no sale**.
  - Example phrasings (parafraseable):
    - "Dale, te entiendo. Si en algún momento te dan ganas de probar, acá estamos. Un abrazo."
    - "Sin problema. Cualquier cosa, escribime cuando quieras."
    - "Perfecto. Que andes bien, cualquier duda estoy acá."
- **No terminal state:** PB1 stays in current discovery stage (no advancement, no completion, no closed flag). Lead returning later picks up via existing Redis state — no DB/state mutation needed beyond the `whyAsked` flag.
- **Why not request_human:** SC#3 explicitly forbids escalation for soft objections; routine rejection during discovery is not coach-worthy.

### Re-detection — `whyAsked?: boolean` on PlaybookSessionState

- **New optional field** `whyAsked?: boolean` added to `PlaybookSessionState`. Same backward-compat pattern as `discoveryTurnCount` from Phase 90 (optional, defaulted on read, persisted via existing `setPlaybookState` call sites).
- **State transitions:**
  - Turn N: `softRejection && !whyAsked` → inject WHY rule, persist `whyAsked=true`, block advance.
  - Turn N+1, `softRejection && whyAsked` → inject BACK-OFF rule, keep stage, block advance, do NOT reset `whyAsked` yet (the conversation may end here).
  - Turn N+1 alt, `!softRejection` (user re-engages, gives a reason, changes topic) → reset `whyAsked=false`, normal flow resumes.
- **Critical reset rule:** `whyAsked` is active **only while `softRejection` is continuously hot**. Any non-rejection turn clears it — otherwise a lead who rejects, re-engages, and later rejects again for a different reason would skip the WHY on the second rejection.
- **All four `setPlaybookState` call sites** must include `whyAsked` to preserve the flag (lesson learned from Phase 90's `discoveryTurnCount` rollout).

### Interaction with `discoveryTurnCount` (from Phase 90)

- **Decision:** `softRejection` turns do **NOT** increment `discoveryTurnCount`.
- **Rationale:** `discoveryTurnCount` represents _substantive discovery answers_ (the gate from STAGE-02 says "lead has answered in at least 2 turns"). A rejection is the opposite of a discovery answer — counting it would let a `no me interesa` turn satisfy the turn-count gate alongside any single-category content match, defeating Phase 90's intent.
- **`whyAsked` is independent** of `discoveryTurnCount` and does not reset it. When the user re-engages after a back-off (or after a single WHY that converted), `discoveryTurnCount` resumes counting from where it left off.
- **Worked example:** lead replies "primera vez" (turn 1, `discoveryTurnCount=1`, no rejection), then "no me interesa" (turn 2, softRejection fires, `discoveryTurnCount` stays at 1, WHY rule injected, `whyAsked=true`, advance blocked), then "no, en serio" (turn 3, softRejection still fires, `discoveryTurnCount` stays at 1, BACK-OFF rule injected). If the lead later writes "che, contame más" (turn 4, no rejection, substantive), `whyAsked` resets to false and `discoveryTurnCount` increments to 2.

### Snapshot delta budget — must stay at 0 vs. Phase 90 baseline

- **Lock:** the conditional framing rule MUST NOT appear in any baseline render. Conditional injection only — when `softRejection` is hot.
- **Verification:** the existing `pb1-e1a-lead-rendered.snap.txt` fixture (18,291 bytes after Phase 90) MUST be byte-identical after Phase 91. Delta = 0.
- **Why:** Phase 89 + Phase 90 banked +625 chars of KGATE-05 headroom. If the planner accidentally injects the rule into `system-prompt.ts` baseline or makes it always-on inside a `promptSection`, that headroom gets eaten. **Preserve it.**
- The injection mechanism is the planner's call (e.g., decorating the prompt assembly path inside `handler.ts` based on `softRejection` + `whyAsked`), but the contract is fixed: zero impact on baseline render.

### Telemetry — Pino `log.info` (not warn)

- **Event tag:** `soft_rejection_detected`.
- **Level:** `log.info` — `softRejection` is **expected behavior we want to track statistically**, not an anomaly. (Contrast: Phase 90's `discovery escape fired` uses `log.warn` because it's an anomalous escape hatch.)
- **Payload:** `{ stageId, phone, whyAsked (the value at decision time, before mutation), inboundExcerpt }`.
- **Value:** post-hoc analytics on rejection rates per stage, WHY-question conversion rate (re-engaged vs. backed-off), and which keywords trigger most often.

### Test fixture strategy — minimal Phase-91 tests, Phase-92 owns the lock

- **Phase 92 (RLOK-01)** owns the authoritative regression locks for OBJN-01 — Phase 91 ships only minimal source-state tests sufficient to keep CI green and prove the mechanism works end-to-end at the source level.
- **The flow is multi-turn** (reject → WHY → re-confirm → back-off, with reset-on-re-engagement variant), which is more complex than the single-turn cases in `el-templo-bot/test/playbook-advance.test.ts`. The planner picks the appropriate test file (`playbook-advance.test.ts` for signal + state, `playbook-flow-coverage.test.ts` for the reject→WHY→backoff arc) and may add a small multi-turn helper if it tightens the assertions.
- **Snapshot fixture:** confirm zero delta on `pb1-e1a-lead-rendered.snap.txt`; if a new "softRejection-hot" rendered fixture is added, it lives alongside the existing one and is the only file that should change shape.

### Claude's Discretion

- Exact prompt-assembly entrypoint where the conditional framing rule is injected (modify `system-prompt.ts` to accept a hot-rule list, decorate inside `handler.ts`, or a small helper module — planner picks based on cleanest diff).
- Final wording of the WHY rule and the back-off rule (tone + ingredients are locked above; exact Spanish wording is the planner's call within those constraints).
- Whether to extract the regex into a shared `signals.ts` or keep it inline in `computeAdvanceSignals` (follow existing convention).

</decisions>

<specifics>
## Specific Ideas

- **Live-test evidence (2026-04-16, `contexto/post-phase-90-live-test-findings.md`):** "no me interesa" and "creo que no me interesa" both closed the conversation without a WHY. Mica recovered well _without intervention_ whenever the user kept the conversation alive (asking about trial class, Boarding Pass) — the failure mode is **specifically at the moment of explicit rejection**. The WHY-question must trigger BEFORE the "tomá tu tiempo, saludos" reply, not after.
- **Pattern reference:** the implementation should feel like Phase 89's KFIX-01 + price-deferral pairing — structural detection + behavioural prompt rule, conditionally active, observable via logs.
- **Prompt-rule style reference:** existing PB1 `*Regla de defer (pregunta directa antes de terminar discovery):*` and `*REGLA — precios durante discovery:*` blocks in `definitions.ts` are the tonal model — declarative rule + 1–2 _Ejemplo:_ lines, not a script.

</specifics>

<deferred>
## Deferred Ideas

- **Recording the user's WHY response for analytics or PB4/PB5 routing** — valuable signal (why leads reject, common rejection categories), but data recording + downstream routing belongs in a separate phase. Phase 91 only resolves the immediate conversational loop.
- **Elevator pitch framing fix (Problem 3 from live-test):** "qué es el templo?" still returns generic calistenia description because the model semantic-matches the "Que es El Templo" section instead of the team-hooks elevator. Hypothesis: framing rule in `system-prompt.ts`. **Deferred to post-Phase-92 QT** — explicit non-goal for Phase 91 to keep scope tight to OBJN-01/02.
- **Wider rejection / hesitation tier (`hardRejection` + `hesitation` two-signal split):** rejected during discuss — no live-test evidence for hesitation-as-distinct-failure-mode; hesitation already handled by the existing tone rules. Revisit only if a future live-test surfaces a hesitation-specific failure.
- **Terminal "closed-without-converting" PB1 stage:** rejected during discuss — Redis state already persists naturally; lead returning continues from current stage; no state mutation needed for Phase 91. Revisit only if analytics needs an explicit end-state marker.

</deferred>

---

_Phase: 91-pb1-objection-handling_
_Context gathered: 2026-04-16_
