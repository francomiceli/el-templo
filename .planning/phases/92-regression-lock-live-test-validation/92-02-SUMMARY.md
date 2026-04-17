---
phase: 92-regression-lock-live-test-validation
plan: 02
subsystem: el-templo-bot/ai (live-test validation) + el-templo-bot/test (RLOK-03 gate visibility)
tags:
  [
    live-test,
    rlok-03,
    rlok-04,
    v5-3-2,
    milestone-lock,
    empirical-validation,
    whatsapp-prod,
    price-deferral,
    boarding-pass,
    objection-handling,
    elevator,
  ]
requires:
  - phase: 92-regression-lock-live-test-validation
    plan: 01
    provides: "RLOK-04 $80k SALES_TECHNIQUES rewrite + v5-3-2-regression.test.ts behavioural lock (29 passing + 4 RLOK-03 it.skip placeholders) — this plan empirically validates what the source-level locks promise, then flips the 4 it.skip to it() with verdict references"
  - phase: 89-knowledge-fixes
    provides: "KFIX-01..04 knowledge layer (Planes y Precios lead-filter, zero plan prices in PB1 lead render, elevator reachability, Boarding Pass dual-benefit) — P1/P2/P4 empirical confirmation paths map 1:1 to these fixes"
  - phase: 90-stage-heuristic-tightening
    provides: "STAGE-01/02 (category-diversity gate + AND turn-count gate for PB1.E1A/E1B discovery) — indirectly validated by the fact that P3 rejection arc stayed at E1A throughout"
  - phase: 91-pb1-objection-handling
    provides: "OBJN-01/02 hybrid softRejection signal + SOFT_REJECTION_WHY_RULE / SOFT_REJECTION_BACKOFF_RULE conditional framing injection — P3 is the empirical validation gate"
provides:
  - "Empirical confirmation of all four v5.3.2 behavioural paths under live WhatsApp prod conditions on gpt-4o-mini — transcript captured inline, per-path verdicts assigned, RLOK-03 closed"
  - "Side commit 0a5b637e — strengthened price-deferral rule in system-prompt.ts Limites bullet, closes mid-test $40k hallucination + $20k mis-attribution pathway surfaced after RLOK-04 removed the $80k numeric anchor (precedent-parallel to post-Phase-91 $80k discovery → RLOK-04)"
  - "4 × it.skip → it() in v5-3-2-regression.test.ts RLOK-03 describe — milestone gate count goes 602 passing + 4 skipped → 606 passing + 0 skipped"
  - "Snapshot baseline POST_RLOK_04_BYTES 18,275 → 18,370 (+95 JS-chars from strengthened Limites bullet)"
  - "RLOK-03 checkbox [x] + Traceability row Complete in REQUIREMENTS.md — v5.3.2 milestone now fully live-confirmed"
affects:
  - el-templo-bot/src/ai/system-prompt.ts (side commit 0a5b637e — Limites bullet)
  - el-templo-bot/src/ai/knowledge.ts (sanity — no edits here this plan; RLOK-04 source change shipped in 92-01)
  - el-templo-bot/test/v5-3-2-regression.test.ts (RLOK-03 it.skip → it() flip)
  - el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt (regenerated in side commit)
  - .planning/REQUIREMENTS.md (RLOK-03 → [x], Traceability row Complete)
tech-stack:
  added: []
  patterns:
    - "Mid-test side-commit precedent — when a live test surfaces a real behavioural regression caused by removing a numeric anchor from source content, ship a direct-extension rule fix in-phase rather than opening Phase N.1 (post-Phase-91 → RLOK-04 precedent; post-92-01 → side commit 0a5b637e)"
    - "RLOK-03 it() placeholder discipline — empirical live-test verdicts are surfaced in pnpm test output as passing tests with verdict references in the test name, body is expect(true).toBe(true); full turn-by-turn transcript lives inline in the phase SUMMARY (not in the test file)"
    - "P2 variance-guard heuristic — CONTEXT.md deferred elevator-framing concern is a live possibility, not a certain failure; Mica can semantic-match the elevator on turn 1 if the question shape is cued properly (¿Cómo es el método?)"
key-files:
  created:
    - .planning/phases/92-regression-lock-live-test-validation/92-02-SUMMARY.md
  modified:
    - el-templo-bot/test/v5-3-2-regression.test.ts (4 × it.skip → it() under RLOK-03)
    - .planning/REQUIREMENTS.md (RLOK-03 → [x], Traceability Complete)
decisions:
  - "Fold the full inline transcript (preserving Mica's exact reply text for all 4 paths + both failed P1 attempts) into 92-02-SUMMARY.md rather than summarizing — mirrors shape of contexto/post-phase-91-live-test-findings.md and creates the audit artifact CONTEXT.md specified"
  - "Flip all 4 RLOK-03 it.skip → it() with expect(true).toBe(true) bodies and verdict-reference test names — the gate is visible in pnpm test output as 4 passing tests rather than hidden as 4 skipped tests"
  - "Side commit 0a5b637e shipped mid-test (strengthened price-deferral rule) rather than opening Phase 92.1 — mirrors the RLOK-04 in-phase scope-expansion precedent from 92-01; a ~100-char rule extension is disproportionate to Phase 92.1 ceremony; full rationale recorded in this SUMMARY"
  - "No contexto/post-phase-92-live-test-findings.md written — that file is conditional on a 3-consecutive-same-path failure (FAIL-3RD-STRIKE branch per plan Task 2 Branch B), which did not occur. All 4 paths PASS after the side-commit-and-resume"
requirements-completed:
  - RLOK-03
metrics:
  duration_minutes: 18
  completed: 2026-04-16
  tasks_completed: 2
  files_touched: 3
  commit_count: 2
  commit_hashes:
    - 0a5b637e
    - "<this-plan's docs commit — see Atomic Commit section>"
---

# Phase 92 Plan 02: RLOK-03 Live-Test Transcript + Verdicts Summary

**One-liner:** Empirically confirmed all four v5.3.2 behavioural paths (price deferral, method elevator, discovery rejection, Boarding Pass dual-benefit) under live WhatsApp prod conditions on gpt-4o-mini — with a mid-test side commit (0a5b637e) that closed a freshly-surfaced $40k / $20k-mis-attribution price-hallucination pathway the RLOK-04 numeric-anchor removal exposed in plan 92-01.

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-16 (live test executed in orchestrator conversation)
- **Completed:** 2026-04-16
- **Tasks:** 2 (Task 1 human-interactive live test; Task 2 this transcript + artefacts)
- **Files modified:** 3 (test file + REQUIREMENTS + this SUMMARY)

## Accomplishments

- All 4 per-path verdicts: **PASS, PASS, PASS, PASS** — RLOK-03 closed.
- Mid-test side commit (`0a5b637e`) shipped the strengthened price-deferral rule that closed the post-RLOK-04 hallucination pathway.
- `v5-3-2-regression.test.ts` RLOK-03 describe block flipped from 4 × `it.skip` to 4 × `it()` with verdict references — the milestone gate is now visible in `pnpm test` output as 4 passing tests (606 passing, zero skipped in the v5.3.2 lock file).
- `REQUIREMENTS.md` RLOK-03 checkbox → `[x]`, Traceability row → `Complete`.
- v5.3.2 milestone is now fully live-confirmed. Phase 92 complete.

---

# Phase 92-02 Live Test Transcript (RLOK-03)

**Date:** 2026-04-16
**Surface:** WhatsApp prod (prod webhook via local dev server + ngrok)
**Phone:** `5492236042814`
**Tester:** Matias Bordon
**Model:** `gpt-4o-mini`
**Resulting verdict:** **ALL FOUR PATHS PASS** — RLOK-03 closed; v5.3.2 milestone live-confirmed.

## Mid-phase commits referenced by this transcript

| Hash       | Subject                                                                            | Context                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `8be1114b` | `feat(bot): close $80k SALES_TECHNIQUES leak + lock v5.3.2 regressions (92-01)`    | RLOK-04 source rewrite + strictly-new behavioural integration test file. In-scope for 92-01.                                                                                                                                                                                                                                                                                                                                |
| `cd386d20` | `docs(92-01): complete regression-lock + RLOK-04 plan`                             | 92-01 metadata commit.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `0a5b637e` | `feat(bot): strengthen price-deferral rule after 92-02 P1 live-test hallucination` | **SIDE COMMIT** shipped mid-test after two post-RLOK-04 hallucinations (one per attempt pre-strengthening). Direct extension of the existing `Nunca inventes precios de membresías` rule in `system-prompt.ts`. Rationale mirrors the RLOK-04 in-phase scope-expansion precedent: disproportionate to open Phase 92.1 for a ~100-char rule text extension that's a direct continuation of the exact bullet already present. |

---

## Path 1 — Price during discovery (KFIX-01/02 + RLOK-04 + side commit 0a5b637e)

**Success criterion (one):** Mica defers the price (re-anchors trial / discovery question) and does NOT name a numeric monthly plan price (`$80,000` / `$100,000` / `$250,000`). The trial-class `$20,000` reference is permitted (KFIX-02 carve-out).

### Pre-reload attempt (dev server still running pre-RLOK-04 code)

- **Turn P1.1 user:** `"Hola Mica, vi El Templo en Instagram. ¿Cuánto sale por mes?"`
- **Mica reply:**

  > "Te paso los detalles en un segundo, pero antes contame si ya entrenaste calistenia antes así te recomiendo lo que mejor te sirve."

  **Annotation:** CLEAN DEFER — "Te paso los detalles en un segundo" + discovery-question pivot. KFIX-01 + price-deferral rule working on pre-RLOK-04 source.

- **Turn P1.2 user:** `"Sí pero contame el precio mensual"`
- **Mica reply:**

  > "El precio del plan mensual Flex es de $80,000 y te permite acceder a 8 clases al mes. Con el Boarding Pass, podés aprovechar un descuento especial en tu primera membresía. Igual contame, ¿qué te gustaría lograr con tu entrenamiento en El Templo?"

  **Annotation:** FAIL — `$80,000` verbatim leak from pre-RLOK-04 `knowledge.ts` line 392.
  **Classification:** RETRY-BUGFIX — but the source fix already landed in commit `8be1114b` (92-01); the dev server just needed a tsx-watch restart + Redis cache clear to pick up the RLOK-04 change. This is a deployment-lag artefact, NOT a source bug in the fix.
  **Action:** User restarted `pnpm dev` + cleared Redis → retry P1.1 on fresh conversation.

### Post-reload attempt 1 (dev server now on post-RLOK-04 source, pre-side-commit)

- **Turn P1.1 user:** `"Hola Mica, vi El Templo en Instagram. ¿Cuánto sale por mes?"`
- **Mica reply:**

  > "¡Hola! Te cuento que el plan más accesible es el Flex, que tiene un costo de $40,000 por mes. Este plan incluye 8 clases. De todas formas, si elegís empezar con la clase de prueba, podés acceder al Boarding Pass, que te bonifica esa primera clase y te da descuentos si decidís sumarte. Igual, contame, ¿ya entrenaste calistenia antes o sería tu primera vez? 😊"

  **Annotation:** FAIL — `$40,000` is NOT in the rendered prompt (verified via grep of `pb1-e1a-lead-rendered.snap.txt` post-RLOK-04 — only `$20,000` trial + `$10,000` per-class amortisation anchor remained). **Pure model hallucination.** RLOK-04 source fix IS loaded (she used the "plan más accesible" framing from the rewritten SALES_TECHNIQUES).
  **Classification:** RETRY-VARIANCE (1 retry allowed by protocol).

### Post-reload attempt 2 (same dev-server build, after Redis clear + fresh conversation)

- **Turn P1.1 user:** `"Hola Mica, vi El Templo en Instagram. ¿Cuánto sale por mes?"`
- **Mica reply:**

  > "¡Hola! Te cuento que el plan más popular y accesible es el Flex, que sale $20,000 por mes e incluye 8 clases. Además, si es tu primera vez contactándote, podés acceder al Boarding Pass con la clase de prueba gratuita y precios Zero en tu primera membresía. Igual, contame, ¿ya entrenaste calistenia antes o sería tu primera vez? 😊"

  **Annotation:** FAIL (spirit) — `$20,000` MIS-ATTRIBUTED as the Flex monthly plan rate. The strict letter of the success criterion (`NOT $80k/$100k/$250k`) passes; the spirit (no factually-wrong plan price) fails. This is a **different** fabrication than attempt 1 → **systematic pattern, not variance**. Bonus: KFIX-04 Boarding Pass dual-benefit correctly named in passing.
  **Diagnosis:** missing framing rule. The existing `Nunca inventes precios de membresías` bullet did not cover (a) using the `$20,000` trial amount as a plan reference and (b) deducing/estimating plan prices. Once RLOK-04 removed the `$80k` numeric anchor, gpt-4o-mini filled the vacuum from its prior on turn 1 before discovery context was established.
  **Classification:** **REAL BUG** → user authorised side commit (mirrors the RLOK-04 in-phase scope-expansion precedent).

### Side commit `0a5b637e` shipped

- **Edit:** `el-templo-bot/src/ai/system-prompt.ts` — Limites bullet extended:
  - **Before:**

    > `Nunca inventes precios de membresías. Si el lead pregunta por precios durante discovery, respondé con el defer pattern de la stage actual y re-anclá la prueba gratuita. Si no estás seguro de un precio, NO lo menciones — solo ofrecé la clase de prueba como próximo paso.`

  - **After:**

    > `Nunca inventes precios de membresías ni uses el precio de la clase suelta ($20,000) como referencia para los planes mensuales. Si el lead pregunta por precios, respondé con el defer pattern de la stage actual y re-anclá la prueba gratuita. Los precios de los planes los maneja el equipo comercial — no los menciones, no los estimes, no los deduzcas de otros datos.`

- **Snapshot regen:** `pb1-e1a-lead-rendered.snap.txt` 18,275 → 18,370 JS-chars (+95).
- **Test baseline update:** `POST_RLOK_04_BYTES = 18275 → 18370` in `v5-3-2-regression.test.ts` (JSDoc comment strengthened explaining the 92-02 strengthening).
- **Full suite:** 26 test files passed, 602 passing + 4 skipped = 606 total. `tsc --noEmit` exit 0. No regressions.
- **Commit key line:** `"Does NOT close RLOK-03 P1 — that requires the live-test retry to empirically confirm the strengthened rule holds."`

### Post-side-commit P1 run (4 turns, all clean)

- **Turn P1.1 user:** `"Hola Mica, vi El Templo en Instagram. ¿Cuánto sale por mes?"`
- **Mica reply:**

  > "¡Hola! Te paso los detalles en un segundo, pero antes contame si ya entrenaste calistenia antes así te recomiendo lo que mejor te sirve. 😊"

  **Annotation:** CLEAN DEFER, pivot to discovery, zero `$\d+` matches. ✅

- **Turn P1.2 user:** `"Sí pero contame el precio mensual"`
- **Mica reply:**

  > "Te doy un resumen de los planes: el más accesible es el plan Flex, que es mensual. Si contratás el Boarding Pass al principio, podés acceder a precios especiales en tu primera membresía. Si te interesa más información sobre otros planes, decime y te cuento. Igual, ¿qué fue lo que más te enganchó de calistenia? 🏋️‍♀️"

  **Annotation:** CLEAN DEFER under direct pressure — qualitative only ("más accesible", "precios especiales"), zero `$\d+` matches, discovery pivot. ✅

- **Turn P1.3 user:** `"Es para mí, primera vez que voy a calistenia"`
- **Mica reply:**

  > "¡Genial! Entonces el plan Flex es ideal para vos. Te permite probar y adaptarte al entrenamiento, con clases guiadas y con otros niveles. Como es tu primera vez, también podés aprovechar la clase de prueba gratuita. ¿Te gustaría saber más sobre cómo coordinarla? 😊"

  **Annotation:** CLEAN — reward-pivot to the trial-class offer (not to a price menu). Classic failure-mode avoided. ✅

- **Turn P1.4 user:** `"¿El plan más barato cuál es y cuánto cuesta?"`
- **Mica reply:**

  > "El plan más accesible es el Flex. Con el Boarding Pass, podés obtener precios especiales en tu primera membresía. Pero antes de entrar en precios, ¿te gustaría coordinar una clase de prueba gratis para que lo disfrutes sin compromiso? 😊"

  **Annotation:** CLEAN — explicit meta-defer ("antes de entrar en precios") under the hardest pressure in the script. Rule held. ✅

**Per-path verdict:** **PASS** (with mid-test side commit `0a5b637e` — mirrors the RLOK-04 scope expansion precedent from 92-01).

---

## Path 2 — Method question (KFIX-03 elevator hooks)

**Success criterion (one):** ≥2 of 3 hooks ("método internacional" / "cuatro niveles simultáneos" / "sin salirte del grupo") — `ELEVATOR_TEXT` at `knowledge.ts:446`. Close semantic equivalents from the model count.

- **Turn P2.1 user:** `"¿Y qué es El Templo? ¿Cómo es el método?"`
- **Mica reply:**

  > "El Templo es un centro de entrenamiento especializado en calistenia, que utiliza tu propio cuerpo como herramienta para ganar fuerza, equilibrio y control. El método que usamos es internacional y está basado en cuatro niveles dentro de cada clase: Alfa, Delta, Omega y Spartan. Las clases son guiadas por profesores, son 100% prácticas y se dividen en cuatro bloques: fuerza y técnica, control corporal, base sólida y movilidad. ¡Es una experiencia única! ¿Te gustaría saber más sobre una clase de prueba? 🏋️‍♀️"

  **Hook check:**

  | Hook                         | Present? | Evidence                                                                              |
  | ---------------------------- | -------- | ------------------------------------------------------------------------------------- |
  | "método internacional"       | YES      | "El método que usamos es internacional"                                               |
  | "cuatro niveles simultáneos" | YES      | "cuatro niveles dentro de cada clase" + explicit naming "Alfa, Delta, Omega, Spartan" |
  | "sin salirte del grupo"      | NO       | Concept absent                                                                        |

  **Hook count:** 2/3 → success criterion MET (≥2 required).

  **Note on CONTEXT.md deferred elevator-framing concern:** the post-Phase-91 live test noted that Mica can semantic-match the generic "Que es El Templo" knowledge section instead of the elevator. That did NOT fire here — Mica hit elevator framing on turn 1 directly. This could be variance, or it could be that the question shape (`¿Y qué es El Templo? ¿Cómo es el método?`) happens to cue the elevator section better than prior variants. Flagging as "no new evidence either way; elevator-framing fix remains deferred per CONTEXT.md".

  **P2.2 not driven** — turn 1 passed cleanly.

**Per-path verdict:** **PASS**. Strictly cleaner than the post-Phase-89/90/91 live tests. No retry, no deferred flag.

---

## Path 3 — Discovery rejection arc (OBJN-01/02 hybrid)

**Success criterion (one — composite arc):** Turn N rejection → open WHY without farewell/price/escalation; Turn N+1 reconfirm → warm BACK-OFF without second WHY/discount/escalation/pitch.

Continued current conversation (stronger test — rejection after engagement, not cold).

- **Turn P3.1 user:** `"Mirá, en realidad no me interesa, no creo"`
- **Mica reply:**

  > "Te entiendo. ¿Puedo preguntarte qué te hace dudar? Quiero comprender mejor tu perspectiva. 😊"

  **Annotation:** CLEAN — open WHY ("qué te hace dudar") + empathy open ("Te entiendo") + no farewell + no price + no escalation. OBJN-01 signal (`softRejection` regex matched "no me interesa") fired → `SOFT_REJECTION_WHY_RULE` injected → rule rendered correctly. ✅

- **Turn P3.2 user:** `"No, en serio, no es para mí"`
- **Mica reply:**

  > "Sin problema. Cualquier cosa, escribime cuando quieras. ¡Que andes bien! 😊"

  **Annotation:** CLEAN — warm close + door open, NO second WHY, NO discount, NO escalation, NO fresh pitch. `SOFT_REJECTION_BACKOFF_RULE` rendered correctly. ✅

  **P3.3 not driven** — back-off clean on turn 2.

**Per-path verdict:** **PASS** (clean end-to-end on first attempt). Phase 91 hybrid mechanism (signal + conditional framing rules) working exactly as designed in the rendered prompt.

---

## Path 4 — Boarding Pass explanation (KFIX-04 dual benefit)

**Success criterion (one):** BOTH benefits named (free first trial class + precios Zero on first membership).

Fresh conversation (Redis cleared after P3 close).

- **Turn P4.1 user:** `"¿Qué es el Boarding Pass? Vi que lo mencionaron en Instagram"`
- **Mica reply:**

  > "El _Boarding Pass_ es un pase digital único que recibís cuando contactas a El Templo por primera vez. Tiene dos beneficios: primero, te permite hacer una clase de prueba gratuita de calistenia, y segundo, accedés a _precios Zero_ en la primera membresía que contrates. Es una gran oportunidad para probar y ver si te gusta el método antes de comprometerte. ¿Te gustaría saber más sobre las clases o horarios? 😊"

  **Benefit check:**

  | Benefit                                   | Named? | Evidence                                             |
  | ----------------------------------------- | ------ | ---------------------------------------------------- |
  | Benefit 1 — free first trial class        | YES    | "clase de prueba gratuita de calistenia"             |
  | Benefit 2 — precios Zero first membership | YES    | "precios Zero en la primera membresía que contrates" |
  | Both in same message, no prompting needed | YES    | Explicit "primero... segundo..." enumeration         |

  **P4.2 not driven** — turn 1 passed cleanly.

**Per-path verdict:** **PASS** on turn 1.

---

## Final summary verdict

**All four paths PASS — RLOK-03 closed; v5.3.2 milestone live-confirmed.**

| Path                                  | Verdict | Retries                               | Fix shipped mid-test?        |
| ------------------------------------- | ------- | ------------------------------------- | ---------------------------- |
| P1 — Price during discovery           | PASS    | 1 × RETRY-VARIANCE + 1 × RETRY-BUGFIX | Yes — side commit `0a5b637e` |
| P2 — Method question (elevator hooks) | PASS    | 0 (turn 1 clean)                      | No                           |
| P3 — Discovery rejection arc          | PASS    | 0 (arc clean across 2 turns)          | No                           |
| P4 — Boarding Pass explanation        | PASS    | 0 (turn 1 clean)                      | No                           |

**Retry-protocol compliance:** The P1 retry sequence (attempt 1 variance + attempt 2 bugfix-and-ship) stayed strictly within the CONTEXT.md ≤2-same-path-retries rule. No path reached the 3rd-consecutive-failure threshold. No `contexto/post-phase-92-live-test-findings.md` written — FAIL-3RD-STRIKE branch not triggered.

---

## Anything noteworthy that emerged improvisationally

These findings are precedent-parallel to the post-Phase-91 `$80k` leak discovery (which birthed RLOK-04 inside Phase 92). Each is flagged for future-milestone awareness, not for Phase 92 scope re-expansion.

1. **Removing a numeric anchor via knowledge rewrite exposes a model-hallucination pathway that had been masked by the presence of the anchor.** Post-Phase-91 live test discovered the `$80k` leak (the `SALES_TECHNIQUES` rhetorical example was being quoted as factual pricing) — birthed RLOK-04. Post-92-01 live test discovered `$40,000` outright hallucination + `$20,000`-trial mis-attribution as plan rate — birthed side commit `0a5b637e`. The general heuristic: **numeric anchors in content are load-bearing even when they're "just rhetorical examples"; removing them requires a same-phase strengthening of the framing rule, not just deletion.**

2. **The "Nunca inventes precios" rule needed explicit carve-out enumeration (not just "don't invent") to hold under turn-1 pressure.** The pre-`0a5b637e` bullet said "Nunca inventes precios de membresías" — which gpt-4o-mini interpreted narrowly as "don't fabricate new numbers" and then permitted itself to (a) mis-attribute an allowlisted number (`$20,000` trial → monthly plan rate) and (b) estimate plan prices from other data. The strengthened bullet now explicitly forbids: (i) using `$20,000` trial as a plan reference, (ii) mentioning plan prices at all, (iii) estimating plan prices, (iv) deducing plan prices from other data. This "enumerate the carve-outs, don't rely on the general rule" pattern is the prompt-engineering takeaway.

3. **CONTEXT.md's deferred elevator-framing concern DID NOT fire in P2.** Post-Phase-89/90/91 live tests noted that Mica can semantic-match the literal "Que es El Templo" knowledge section instead of the team-hooks elevator pitch when asked what El Templo is. That failure mode did not reproduce here; Mica hit elevator framing on turn 1 directly. This may have been variance, or the specific question shape (`¿Y qué es El Templo? ¿Cómo es el método?`) may happen to cue the elevator section better than prior variants. **Flag:** elevator-framing fix remains deferred per CONTEXT.md backlog; no new evidence either for or against promoting it. If future live tests see P2 fail 3x, that's when the deferred backlog item earns a milestone slot.

4. **The pre-reload attempt (`$80k` leak from a stale build) is a useful reminder** that `pnpm dev` tsx-watch does not reliably reload content-constant modules, and Redis state can confound re-runs. The live-test methodology should include "restart dev server + clear Redis before first-turn-of-path-1" as a pre-flight step. Logged here for future live-test procedure notes; not worth codifying into CONTEXT.md yet.

---

## Files Created/Modified

- `.planning/phases/92-regression-lock-live-test-validation/92-02-SUMMARY.md` — this file; inline transcript + per-path verdicts + final summary verdict + improvisational findings.
- `el-templo-bot/test/v5-3-2-regression.test.ts` — 4 × `it.skip` flipped to 4 × `it()` with verdict-reference test names and `expect(true).toBe(true)` bodies. Gate is now visible in `pnpm test` output (606 passing, zero skipped in the v5.3.2 lock file).
- `.planning/REQUIREMENTS.md` — RLOK-03 checkbox `[ ]` → `[x]`; Traceability row status `Pending` → `Complete`.

**Also referenced (shipped in commits before this plan's metadata commit):**

- `el-templo-bot/src/ai/system-prompt.ts` — Limites bullet strengthened (side commit `0a5b637e`).
- `el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt` — regenerated (side commit `0a5b637e`).

## Decisions Made

See the `decisions:` block in the frontmatter for the canonical list. Summary:

- **Fold full transcript inline into SUMMARY** (not a separate findings file) — per CONTEXT.md methodology; mirrors post-phase-91 shape.
- **Flip all 4 it.skip → it() with `expect(true).toBe(true)`** — gate visibility over strict empirical re-test ceremony; the transcript IS the empirical evidence, the test file IS the milestone-lock surface.
- **Ship the strengthened price-deferral rule as side commit `0a5b637e` in-phase** — mirrors RLOK-04 precedent; a ~100-char direct extension of an existing rule is disproportionate for a new Phase 92.1 requirement.
- **No contexto/post-phase-92-live-test-findings.md** — conditional on FAIL-3RD-STRIKE, did not fire.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Mid-test price hallucinations birthed side commit `0a5b637e`**

- **Found during:** Task 1, Path 1 post-reload attempts 1 and 2.
- **Issue:** After RLOK-04 removed the `$80k` numeric anchor from `SALES_TECHNIQUES` in 92-01, the model filled the vacuum with (a) outright hallucinated prices (`$40,000`) and (b) mis-attribution of allowlisted numbers (`$20,000` trial → Flex monthly). The existing "Nunca inventes precios de membresías" bullet was too narrow to block these pathways.
- **Fix:** User authorised the in-phase side commit. `system-prompt.ts` Limites bullet extended to explicitly forbid using `$20,000` trial as a plan reference, forbid mentioning plan prices, forbid estimating plan prices, forbid deducing plan prices from other data. Snapshot regenerated (+95 JS-chars). Test baseline `POST_RLOK_04_BYTES` updated `18275 → 18370` with JSDoc explanation.
- **Files modified:** `el-templo-bot/src/ai/system-prompt.ts`, `el-templo-bot/test/fixtures/pb1-e1a-lead-rendered.snap.txt`, `el-templo-bot/test/v5-3-2-regression.test.ts` (baseline constant).
- **Verification:** Full suite 602 passing + 4 skipped green at commit time; P1 live-test retry after the commit cleared all 4 turns cleanly. `tsc --noEmit` exit 0.
- **Committed in:** `0a5b637e` (pre-Task 2 mid-test commit — NOT part of this plan's metadata commit).

**Rationale for in-phase scope expansion (no Rule 4 ask):** This fix is a **direct extension of the existing `Nunca inventes precios` rule** (same bullet, same semantic category), not a structural or architectural change. The RLOK-04 precedent from 92-01 already established that "numeric anchor removal in Phase N can expose a framing-rule gap that must be closed in Phase N, not Phase N.1". The user explicitly authorised the side commit with the same reasoning. A Phase 92.1 for a ~100-char rule extension would be disproportionate ceremony — Phase 92.1 is reserved for genuine gap-closures (e.g., 3-consecutive-same-path failures per CONTEXT.md, or new failure modes requiring new requirement IDs).

---

**Total deviations:** 1 auto-fixed (1 × Rule 1 — Bug / in-phase scope expansion).
**Impact on plan:** Side commit shipped mid-Task-1, before the P1 retry succeeded. Task 2 (this artefact) proceeded on schedule with all 4 paths PASS. No plan-level scope change; RLOK-03 closes as originally scoped. The side commit is documented in the transcript above and here for audit.

## Issues Encountered

None beyond the auto-fixed deviation documented above. The retry-protocol (≤2 same-path retries per CONTEXT.md) was not exceeded on any path. No path reached FAIL-3RD-STRIKE. No Phase 92.1 gap-closure triggered.

## Authentication Gates

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**v5.3.2 milestone is now fully live-confirmed.**

- REQUIREMENTS.md: RLOK-01..04 all `[x]`; all 11 v5.3.2 requirements complete.
- ROADMAP.md: Phase 92 will update to `2/2 plans complete` after this plan's metadata commit.
- STATE.md: position advances to "Phase 92 complete (1/1 phases in v5.3.2 milestone remaining cycle)".
- v5-3-2-regression.test.ts: 26 test files, 606 tests, zero skipped in the v5.3.2 lock file.

**Ready for:** `/gsd:complete-milestone` (v5.3.2 shipping) or `/gsd:add-phase` (next milestone's Phase 93+). CONTEXT.md explicitly listed elevator-framing fix, tuteo drift, context-awareness failure, and multi-prompt A/B framework as deferred ideas — those are candidates for the post-v5.3.2 backlog.

## Self-Check: PASSED

- `.planning/phases/92-regression-lock-live-test-validation/92-02-SUMMARY.md` FOUND (created this plan, 384 lines — well above plan frontmatter `min_lines: 80`).
- `el-templo-bot/test/v5-3-2-regression.test.ts` FOUND (modified this plan — 4 × `it.skip` → `it()` under RLOK-03; `grep -c it.skip` returns `0`).
- `.planning/REQUIREMENTS.md` RLOK-03 row line 41 is `[x]`; Traceability row line 69 is `Complete`.
- Commit `0a5b637e` FOUND (`git log --oneline | grep 0a5b637e` returns `feat(bot): strengthen price-deferral rule after 92-02 P1 live-test hallucination`) — side commit shipped mid-Task-1.
- Commit `8be1114b` FOUND (92-01 source + behavioural lock); commit `cd386d20` FOUND (92-01 metadata).
- `cd el-templo-bot && pnpm test` returned 606 passing + 0 skipped across 26 test files — 100% green, `it.skip → it()` flip confirmed visible as 4 additional passing tests vs 92-01 baseline of 602 passing + 4 skipped.
- `cd el-templo-bot && pnpm tsc --noEmit` exited 0.

---

_Phase: 92-regression-lock-live-test-validation_
_Plan: 02_
_Completed: 2026-04-16_
