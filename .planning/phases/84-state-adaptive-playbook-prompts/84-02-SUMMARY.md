---
phase: 84-state-adaptive-playbook-prompts
plan: 02
subsystem: el-templo-bot / playbooks
tags: [playbook, PB4, PB5, prompt-engineering, sales, escalation, TEAM-CORR-04]
requires:
  - phase 84-01 (PB2/PB3 enrichment pattern + unchanged PB1)
  - v5.2 request_human tool in el-templo-bot/src/ai/system-prompt.ts (reused, NOT modified)
  - v5.2 humanTakeoverTriggered handler at el-templo-bot/src/webhook/handler.ts:397-399 (reused, NOT modified)
provides:
  - "PB4 stages PB4.E1A/E1B/E2 enriched: empathy A/B → listen → plan-conditional solution, explicit escalation triggers invoking request_human"
  - "PB5 stages PB5.E1/E2/E3 enriched: listen-without-resistance → 4 motivo branches → escalation-aware baja flow with visible human handoff safety net"
  - "Plan-conditional pause copy (TEAM-CORR-04) present in BOTH PB4.E2 and PB5.E2 so Flex members never get offered pause"
affects:
  - el-templo-bot/src/playbooks/definitions.ts (PB4 + PB5 promptSections only)
tech-stack:
  added: []
  patterns:
    - "Escalation-via-tool-invocation: playbook copy instructs Mica to invoke the existing request_human tool; the handoff phrase stays owned by the tool description in system-prompt.ts:94 (single source of truth)"
    - "Plan-name-in-copy pattern for TEAM-CORR-04: Foundation/Foundation+/Performance/Flex appear verbatim in both PB4.E2 and PB5.E2 so the v5.3 dual-guard regression test (84-03) can grep for plan names in the rendered active-playbook prompt"
    - "Visible human handoff safety net: PB5.E3 invokes request_human even without an explicit trigger when no alternative works — last-contact attempt before processing baja"
key-files:
  created: []
  modified:
    - el-templo-bot/src/playbooks/definitions.ts
decisions:
  - "Escalation phrase (`Te paso con alguien del equipo, te escriben enseguida 🙌`) intentionally NOT duplicated into the playbook promptSections. It lives in system-prompt.ts:94 inside the request_human tool description and stays the single source of truth. Playbook copy only instructs Mica to invoke the tool; the tool owns the phrase."
  - "PB4.E2 keeps 4 objection branches (tiempo, salud/lesión, emocional, económica). The económica branch was added explicitly to close a gap where an inactive member saying 'no tengo plata' would fall through — PB4 routes them to 'when you can come back, write me, door is open' with NO downgrade push (downgrade is PB5's territory)."
  - "PB5.E2 tiempo branch duplicates the PB4 plan-conditional pause rule rather than cross-referencing it. This is intentional: each active-playbook prompt is rendered in isolation (PBENG-05), so PB5 cannot rely on PB4 copy being present in the same turn. Duplication is required for the rule to reach Mica."
  - "PB5.E3 contains TWO request_human invocation paths: (1) explicit trigger list (service complaints, delicate personal situations, injury caused in gym, discrimination/harassment) and (2) 'visible human handoff' safety net when no alternative works. Path 2 implements the v5.3 success criterion that every unresolved cancellation gets a human last-contact attempt."
  - "Pause-conditional rule (TEAM-CORR-04) was encoded as INLINE script text ('Si tu plan lo permite (Foundation, Foundation+ o Performance)...') rather than as a separate meta-rule paragraph. Reason: the sales team's verbatim script already contains the conditional, so transcribing it verbatim both satisfies source fidelity and makes the rule survive any future prompt rewrite."
  - "PB1, PB2, PB3, PLAYBOOKS export, and the module self-check loop are byte-identical to the post-84-01 state (empty diff against 075b4fe3 for everything except the PB4 + PB5 const blocks)."
metrics:
  tasks_completed: 2
  files_modified: 1
  duration: ~8min
  completed_date: 2026-04-08
requirements_closed: [PBPR-03, PBPR-04, PBPR-06]
---

# Phase 84 Plan 02: PB4 + PB5 PromptSection Enrichment Summary

Rewrote PB4 (Miembro Inactivo) and PB5 (Cancelación) stage promptSections in `el-templo-bot/src/playbooks/definitions.ts` so that when the engine resolves `clientState=inactive_member → PB4` or `cancellationIntent → PB5`, the rendered system prompt carries the v5.3 sales-team-validated multi-stage flow with A/B variants, plan-conditional pause logic (TEAM-CORR-04), and explicit human-handoff triggers that re-use the v5.2 `request_human` tool without touching `handler.ts` or `system-prompt.ts`.

## What Changed

### PB4 — Miembro Inactivo (30+ días)

- **PB4.E1A / PB4.E1B** — Variant A/B empathetic openers preserved verbatim from `contexto/kero-playbooks-completos.md`. Added meta-rule paragraphs: empathetic tone (no guilt, no urgency), single question per turn, tuteo argentino, and the **anti-pressure rule** ("NUNCA sugieras un plan, una clase, ni un horario en este turno — la solución viene en la Etapa 2"). The only job of E1 is to open the door with warmth and get the member talking.
- **PB4.E2** — Rewritten as the listening + solution stage. Contains:
  - **TEAM-CORR-04 rule** as a full paragraph at the top of the stage: "la pausa SOLO está disponible para los planes Foundation, Foundation+ y Performance. Flex NO tiene pausa... NUNCA le ofrezcas pausa a un miembro Flex."
  - **4 objection branches** with verbatim sales-team scripts:
    - _Objeción tiempo_ → "Re entendible. ¿Sabías que con venir 2 veces por semana ya mantenés lo que lograste?..."
    - _Objeción salud / lesión_ (CRITICAL — plan-conditional pause inline) → "Uh, qué bajón. ¿Cómo estás ahora? Si tu plan lo permite (Foundation, Foundation+ o Performance), podemos pausarlo... Si estás en Flex... los créditos no vencen de un día para otro."
    - _Objeción emocional_ → "Nos pasa a todos. ¿Sabés qué funciona? Volver una sola vez. Sin presión..."
    - _Objeción económica_ → "Entiendo. Cuando puedas retomar, escribime y vemos opciones. La puerta está abierta. Sin drama." (explicit no-downgrade-in-PB4 rule — that lives in PB5)
  - **Explicit escalation trigger list** instructing Mica to invoke the `request_human` tool when the member mentions serious personal problems, severe injury, or dissatisfaction with service/teachers/venue. The handoff phrase is explicitly owned by the tool description, not written in the playbook.
  - **2-contact cap rule** (this turn + one follow-up) with a suggested door-open closing line.

### PB5 — Cancelación

- **PB5.E1 — Escuchar Sin Resistencia** — Rewritten with the verbatim opener plus a full meta-rule block: "NO argumentes, NO retengas con urgencia, NO hagas sentir culpa, NO ofrezcas alternativas todavía". Single question, empathetic tone, and the explicit framing "Tu trabajo NO es retener a toda costa — es entender qué pasó". Cancellation is treated as a valid member decision.
- **PB5.E2 — Resolver Según Motivo Real** — Rewritten with 4 verbatim motivo branches:
  - _Motivo plata_ → basic plan downgrade script
  - _Motivo tiempo_ → pause proposal with the **duplicated TEAM-CORR-04 aviso** (plan-conditional pause) so Flex members get 'los créditos no vencen' instead
  - _Motivo no le gusta / no es para mí_ → honest feedback + "te proceso la baja sin problema"
  - _Motivo se muda / viaja_ → freeze membership with no re-inscription cost
  - Mandatory rule: always ask '¿te sirve eso?' after the alternative and respect the answer. If the member says no, do NOT insist — transition to E3.
- **PB5.E3 — Si No Hay Vuelta + Escalation Trigger** — Rewritten with:
  - Verbatim closing message ("Dale [nombre], te proceso la baja. Fue un gusto tenerte...")
  - **Explicit escalation trigger list** instructing Mica to invoke `request_human` BEFORE processing the baja: serious complaints about teachers/service/treatment, delicate personal situation (duelo, mental health, family problem), injury caused/aggravated in the gym, discrimination/harassment/interpersonal conflict
  - **Visible human handoff safety net**: if the member rejects every PB5.E2 alternative and there's no explicit escalation trigger, Mica STILL invokes `request_human` for a last-contact human attempt before processing baja. This is the v5.3 success criterion "visible human handoff" implementation.
  - North metric reminder: "cancela pero queda en buen término = 100% objetivo" — a warmly-resolved cancellation is a PB5 success, not a failure.

### Untouched (byte-identical since 84-01)

- PB1, PB2, PB3 const blocks
- PLAYBOOKS export
- Module self-check loop
- PB6 scope-guard comment
- `el-templo-bot/src/webhook/handler.ts` (empty diff)
- `el-templo-bot/src/ai/system-prompt.ts` (empty diff — `request_human` tool description and phrase untouched)
- All test files (no test edits in this plan — test additions happen in 84-03)

## Verification

- `cd el-templo-bot && pnpm tsc --noEmit` — exit 0
- `cd el-templo-bot && pnpm test` — **299/299 passing** (baseline from 84-01 preserved)
- `grep -o "request_human" el-templo-bot/src/playbooks/definitions.ts | wc -l` — **8** (≥2 required: PB4.E2 trigger list + PB5.E3 trigger list + PB5.E3 safety net + closing references)
- `grep -oE "Foundation\+?|Performance|Flex" el-templo-bot/src/playbooks/definitions.ts | sort | uniq -c` — Foundation 3, Foundation+ 3, Performance 3, Flex 5 (plan names appear in BOTH PB4.E2 and PB5.E2 per TEAM-CORR-04 dual-guard requirement)
- `grep -cE "Objeción salud|Objeción tiempo|Objeción emocional|Objeción económica" el-templo-bot/src/playbooks/definitions.ts` — all 4 PB4 objection labels present
- `grep -cE "Sin resistencia|Escuchar Sin Resistencia|Sin drama" el-templo-bot/src/playbooks/definitions.ts` — 3 (PB5 distinctive phrases)
- `grep -c "te proceso la baja" el-templo-bot/src/playbooks/definitions.ts` — 1 (PB5.E3 closing)
- `grep -cE "muscle up|front lever|planche|handstand|pistol squat" el-templo-bot/src/playbooks/definitions.ts` — **0** (TEAM-CORR-03 still holds)
- `grep -cE "^#{1,6} " el-templo-bot/src/playbooks/definitions.ts` — **0** (no markdown headers; `*bold*` only)
- `git diff 075b4fe3 HEAD -- el-templo-bot/src/webhook/handler.ts el-templo-bot/src/ai/system-prompt.ts el-templo-api/drizzle` — **empty** (handler/system-prompt/migrations all untouched since 84-01)

## Requirements Closed

| ID      | Description                                                                                    | Evidence                                                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| PBPR-03 | PB4 prompt: empathy → listen → plan-conditional solution → no-pressure exit, with A/B variants | PB4.E1A/E1B A/B openers + anti-pressure rule, PB4.E2 with 4 objection branches + TEAM-CORR-04 + escalation triggers + 2-contact cap               |
| PBPR-04 | PB5 prompt: listen-without-resistance → real-reason → alternative → escalate                   | PB5.E1 with no-argue/no-retain/no-guilt rule, PB5.E2 with 4 motivo branches + duplicated pause-conditional, PB5.E3 with trigger list + safety net |
| PBPR-06 | Escalation triggers reuse v5.2 request_human tool without new handler code                     | PB4.E2 and PB5.E3 both instruct `request_human` tool invocation; handler.ts and system-prompt.ts diffs empty vs 84-01                             |

## Deviations from Plan

None — both tasks executed exactly as written. The plan source scripts were transcribed verbatim from `contexto/kero-playbooks-completos.md` §Playbook 4 and §Playbook 5. The only meaningful authorship was the ordering/paragraphing of the surrounding meta-rules and escalation trigger lists, which faithfully mirror the 84-01 PB2/PB3 pattern established in the previous plan.

## How the Plan-Conditional Pause Copy Is Structured

TEAM-CORR-04 says "Flex has NO pause". The v5.3 dual-guard regression test in 84-03 needs to grep the rendered active-playbook system prompt and find the plan names. For that to work, the plan names must appear **verbatim in the stage promptSection** of any playbook that could offer pause. Two playbooks qualify: PB4 (inactive member asks to pause) and PB5 (cancelling member accepts pause as alternative). So both `PB4.E2` and `PB5.E2` contain the literal strings "Foundation", "Foundation+", "Performance", and "Flex".

The structural choice: **inline in the objection script**, not as a separate rule paragraph. The sales team's verbatim script already phrases the rule conditionally ("Si tu plan lo permite (Foundation, Foundation+ o Performance), podemos pausarlo..."), so transcribing it verbatim both preserves source fidelity and makes the rule reach Mica without duplication. PB5.E2's `tiempo` branch adds a meta-aviso line ("_Aviso crítico (mismo que PB4)_") because PB5.E2's verbatim script does NOT contain the conditional — the spec assumes Mica has PB4 context, but PBENG-05 ensures the opposite (only one playbook is rendered per turn). So PB5 duplicates the rule inline.

## How Escalation Reuses the v5.2 request_human Tool Without Touching handler.ts

The v5.2 infrastructure (phase 73) already provides:

1. **Tool definition** in `el-templo-bot/src/ai/system-prompt.ts:84-94`: `request_human` is listed as an available tool, and its description already contains the exact handoff phrase `"Te paso con alguien del equipo, te escriben enseguida 🙌"` plus the "después SILENCIO" instruction.
2. **Handler dispatch** in `el-templo-bot/src/webhook/handler.ts:397-399` (v5.2 `humanTakeoverTriggered` branch): when the LLM calls `request_human`, the handler already flips the conversation into human-takeover mode and suppresses further bot messages.

Plan 84-02 needed to add NEW escalation scenarios (severe injury, delicate personal situation, service complaints, discrimination) without rewriting any of that. The approach:

- PB4.E2 and PB5.E3 promptSections each contain a **trigger list** in plain Spanish ("si el miembro menciona X, Y, o Z")
- The trigger list **instructs Mica to invoke the `request_human` tool** (by name)
- The promptSection **explicitly says not to write the handoff phrase** ("la frase exacta ... la maneja la tool, no la escribas vos")
- The LLM reads the trigger list, decides whether it applies, and calls the tool — reusing the existing tool description's phrase + the existing handler's silence logic

Result: zero lines changed in `handler.ts` or `system-prompt.ts`; the phrase stays owned by a single source (the tool description); the new triggers are layered in via prompt text only.

## Commits

- `24548c46` — feat(84-02): enrich PB4 (Miembro Inactivo) promptSections
- `39ad6f24` — feat(84-02): enrich PB5 (Cancelación) promptSections

## Self-Check: PASSED

- FOUND: el-templo-bot/src/playbooks/definitions.ts (modified, committed in 24548c46 + 39ad6f24)
- FOUND: commit 24548c46 (PB4 enrichment)
- FOUND: commit 39ad6f24 (PB5 enrichment)
- FOUND: .planning/phases/84-state-adaptive-playbook-prompts/84-02-SUMMARY.md (this file)
- grep assertions: all pass — request_human ×8 (≥2), Foundation/Foundation+/Performance/Flex all present in both PB4.E2 and PB5.E2 (14 total occurrences), 4 objection labels in PB4.E2, 3 sin-resistencia/sin-drama signatures in PB5, 1 "te proceso la baja", 0 banned skills, 0 markdown headers
- git diff 075b4fe3 HEAD for handler.ts/system-prompt.ts/drizzle: empty (no untouchable files touched)
- `pnpm test`: 299/299 green (no regressions vs 84-01 baseline)
