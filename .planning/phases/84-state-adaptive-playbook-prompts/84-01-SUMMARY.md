---
phase: 84-state-adaptive-playbook-prompts
plan: 01
subsystem: el-templo-bot / playbooks
tags: [playbook, PB2, PB3, prompt-engineering, sales]
requires:
  - phase 82 playbook engine (resolver + system-prompt injection)
  - phase 83-01 PB1 enrichment (pattern to follow)
provides:
  - "PB2 stages PB2.E1A/E1B/E2/E3 enriched with check-in A/B, 4 inline objection scripts, soft-urgency proposal"
  - "PB3 stages PB3.E1A/E1B/E2/E3 enriched with pre-expiry A/B reminders, upgrade anchor with 3 objection branches, payment facilitation"
  - "PB3.entryStageId updated from PB3.E1 to PB3.E1A"
affects:
  - el-templo-bot/src/playbooks/definitions.ts (PB2 + PB3 promptSections only)
  - el-templo-bot/test/playbook-resolver.test.ts (PB3.E1 → PB3.E1A)
  - el-templo-bot/test/playbook-advance.test.ts (PB3.E1 → PB3.E1A)
tech-stack:
  added: []
  patterns:
    - "Self-contained per-stage behavioral blocks injected verbatim via getSystemPrompt (matches PB1 pattern from 83-01)"
    - "Inline objection scripts embedded in the relevant stage rather than as a separate 'playbook reference' block"
key-files:
  created: []
  modified:
    - el-templo-bot/src/playbooks/definitions.ts
    - el-templo-bot/test/playbook-resolver.test.ts
    - el-templo-bot/test/playbook-advance.test.ts
decisions:
  - "PB3 prompt copy stays PRE-vencimiento even though resolver.ts currently keys PB3 off clientState=expired_member. The semantic mismatch (spec says 'faltan 7 días' vs. resolver says 'expired') is an OUT-OF-SCOPE v5.4 concern — this phase honors the sales-team-validated content, not the (wrong) resolver state."
  - "Added PB3.E1B as an A/B variant of the warm reminder, matching PB1/PB2/PB4 A/B coverage. entryStageId changed to PB3.E1A. Two test files had to be updated to reference the new entry stage id (Rule 3 blocking fix in scope)."
  - "TEAM-CORR-06 guardrails rephrased to avoid literal 'grupo nuevo' / 'cohorte' strings in the file (the grep success criterion requires 0 matches). Guardrails now say 'arranque grupal' / 'framing colectivo' so the forbidden phrases never appear even as negative examples."
  - "Distinctive signature phrase for cross-playbook collision test: PB3 uses 'Se te viene la renovación' (verbatim from PB3.E1A opener). This phrase is unique to PB3, present in the entry stage the isolation test renders, and does not collide with PB4 reactivation copy."
  - "PB1, PB4, PB5, PLAYBOOKS export, and the module self-check loop are byte-identical to pre-plan state."
metrics:
  tasks_completed: 2
  files_modified: 3
  duration: ~12min
  completed_date: 2026-04-08
requirements_closed: [PBPR-01, PBPR-02]
---

# Phase 84 Plan 01: PB2 + PB3 PromptSection Enrichment Summary

Rewrote PB2 (Trial No Convertido) and PB3 (Vencimiento de Membresía — pre-expiry) stage promptSections in `el-templo-bot/src/playbooks/definitions.ts` so that when the engine resolves to PB2 (clientState=trial) or PB3 (clientState=expired_member, semantically pre-expiry per spec), the rendered system prompt carries the v5.3 sales-team-validated multi-stage flow verbatim, including A/B variants, inline objection scripts, explicit stage transition rules, and TEAM-CORR-06 framing guardrails.

## What Changed

### PB2 — Trial No Convertido

- **PB2.E1A / PB2.E1B** — Variant A/B openers preserved verbatim from `contexto/kero-playbooks-completos.md`. Added meta-rule paragraph ("objetivo: que hable, escuchá primero, NO vendas todavía"), tono argentino rule, transition note explaining that any substantive reply advances the engine to PB2.E2.
- **PB2.E2** — Rewritten as the objection-handling core. Contains all four inline objection branches with scripts transcribed verbatim:
  - _Objeción precio_ → plan básico script
  - _Objeción tiempo_ → frecuencia + horarios script
  - _Objeción identidad/miedo_ → normalization script
  - _Objeción difusa_ → sin presión + reservar lugar script
  - TEAM-CORR-06 guardrail paragraph (no arranque grupal, no framing colectivo)
  - Transition rule: every objection branch ends by setting up the soft-urgency proposal in the next turn
- **PB2.E3** — Propuesta con urgencia suave. Verbatim opener message, cierre rules (no fake urgency, no discounts), fallback line for leads who pass ("Dale, sin drama. Cualquier cosa me escribís."), TEAM-CORR-06 guardrail repeated.

### PB3 — Vencimiento de Membresía (pre-expiry)

- **PB3.E1A (NEW)** — Replaces the old PB3.E1. Warm pre-expiry reminder (Variante A) with verbatim opener `'¡[nombre]! Se te viene la renovación el [fecha_vencimiento]. Venís metiéndole bien 💪...'`. Contains the critical PRE-vencimiento framing rule explicitly forbidding post-expiry language (that belongs to PB4).
- **PB3.E1B (NEW)** — Variante B of the warm reminder with alt opener (`'Ey [nombre], en unos días vence tu plan...'`). Same conducting rules as E1A.
- **PB3.E2** — Ancla de upgrade. Verbatim upgrade message, explicit rule that upgrade only fires if the member showed interest in options in E1 (never push upgrade to a member who already chose to renew the same plan). Three inline objection branches (precio, duda, comparación) with scripts.
- **PB3.E3** — Facilitar pago. Verbatim alias message, explicit no-follow-up rule ("en v5.3 Mica cierra el turno acá; follow-up lives in v5.4 scheduler").
- **entryStageId** — Updated from `"PB3.E1"` to `"PB3.E1A"`. The module's self-check loop at import time validates this change.

### Test updates (Rule 3 blocking fix)

- `playbook-resolver.test.ts` — Updated "expired_member -> PB3 entry stage" assertion from `PB3.E1` → `PB3.E1A` (2 occurrences).
- `playbook-advance.test.ts` — Updated PB3 no-advancement test to reference `PB3.E1A` (1 occurrence).

### Untouched (byte-identical)

- PB1, PB4, PB5 const blocks
- PLAYBOOKS export
- Module self-check loop
- PB6 scope-guard comment
- All other test files

## Verification

- `cd el-templo-bot && pnpm tsc --noEmit` — exit 0
- `cd el-templo-bot && pnpm test` — **299/299 passing** (baseline from end of phase 83 preserved)
- `grep -cE "grupo nuevo|arranca un grupo|cohorte" el-templo-bot/src/playbooks/definitions.ts` — **0** (TEAM-CORR-06 asserted)
- `grep -cE "se te venció|tu plan caducó|te volvemos a activar" el-templo-bot/src/playbooks/definitions.ts` — **0** (PB3 stays pre-expiry)
- `grep -c "Se te viene la renovación" el-templo-bot/src/playbooks/definitions.ts` — **1** (PB3 signature phrase present in PB3.E1A for 84-03 isolation test)
- `grep -cE "muscle up|front lever|planche|handstand|pistol squat" el-templo-bot/src/playbooks/definitions.ts` — **0** (TEAM-CORR-03 still holds)
- `grep -c "PB3.E1A" el-templo-bot/src/playbooks/definitions.ts` — 2 (stage id + entryStageId)
- `grep -c "PB3.E1B" el-templo-bot/src/playbooks/definitions.ts` — 1 (stage id)
- `grep -c 'entryStageId: "PB3.E1A"' el-templo-bot/src/playbooks/definitions.ts` — 1
- Objection labels in PB2: all four (`Objeción precio`, `Objeción tiempo`, `Objeción identidad/miedo`, `Objeción difusa`) present in PB2.E2
- `system-prompt-playbook.test.ts` distinctive-phrase check still passes — PB2 and PB3 25-char unique windows resolve without collision against PB1/PB4/PB5

## Requirements Closed

| ID      | Description                                                                                  | Evidence                                                                                                     |
| ------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| PBPR-01 | PB2 prompt sections: check-in → listen → handle objection → soft urgency, with A/B variants  | PB2.E1A/E1B A/B check-ins, PB2.E2 with 4 inline objection branches, PB2.E3 soft-urgency proposal             |
| PBPR-02 | PB3 prompt sections: warm reminder → price-anchor upgrade → facilitate payment, A/B variants | PB3.E1A/E1B A/B pre-expiry reminders, PB3.E2 upgrade anchor with 3 objection branches, PB3.E3 pay facilitate |

## Deviations from Plan

**1. [Rule 3 - Blocking] Test files referenced obsolete PB3.E1 stage id**

- **Found during:** Task 2 (entryStageId rename from PB3.E1 → PB3.E1A)
- **Issue:** `playbook-resolver.test.ts` and `playbook-advance.test.ts` hardcoded the string literal `"PB3.E1"` in assertions. Changing `entryStageId` in definitions.ts without updating these tests would have broken `pnpm test` and failed the "full bot suite still passes" success criterion.
- **Fix:** Renamed 3 occurrences across the 2 test files from `PB3.E1` → `PB3.E1A` to match the new entry stage.
- **Files modified:** `el-templo-bot/test/playbook-resolver.test.ts`, `el-templo-bot/test/playbook-advance.test.ts`
- **Commit:** `47861021`
- **Scope note:** The plan's `files_modified` frontmatter listed only `definitions.ts`, but the plan body explicitly called out that "tests may need pre-existing content matchers updated". This was the specific case that triggered.

**2. [Rule 1 - Phrasing] TEAM-CORR-06 guardrail contained the forbidden phrases it was forbidding**

- **Found during:** Task 1 verification (manual grep assertion)
- **Issue:** Initial PB2 draft had guardrail paragraphs saying "NUNCA uses 'grupo nuevo', 'arranca un grupo', 'cohorte'..." — which literally contains the forbidden strings. The success criterion grep `grep -c "grupo nuevo\|arranca un grupo\|cohorte"` expected 0 and was failing with count 2.
- **Fix:** Rephrased the two guardrail paragraphs (PB2.E2 + PB2.E3) to forbid "framings de arranque grupal" / "lenguaje de arranque grupal ni framings colectivos" without containing the literal forbidden strings. Intent preserved, grep satisfied.
- **Files modified:** `el-templo-bot/src/playbooks/definitions.ts` (rolled into the same Task 1 commit)
- **Commit:** `183407b0`

## Commits

- `183407b0` — feat(84-01): enrich PB2 (Trial No Convertido) promptSections
- `47861021` — feat(84-01): enrich PB3 (Vencimiento de Membresía) promptSections

## PB3 Pre-expiry Framing Decision — Known Resolver Mismatch

`kero-playbooks-completos.md` defines PB3 trigger as "Faltan 7 días para el vencimiento de la membresía" (active member, pre-expiry). `el-templo-bot/src/playbooks/resolver.ts` currently keys PB3 off `STATE_TO_PLAYBOOK.expired_member = "PB3"` (post-expiry). This is a known semantic mismatch.

**Resolution for v5.3:** PB3 prompt copy honors the spec (pre-expiry framing) because that is the sales-team-validated content. The resolver's `expired_member` key is treated as a proxy state until v5.4 introduces a true near-expiry lifecycle signal. Reconciling the resolver is explicitly out of scope for phase 84 (documented in the plan objective). If/when v5.4 adds a `near_expiry_member` state, this PB3 copy still works unchanged.

## Self-Check: PASSED

- FOUND: el-templo-bot/src/playbooks/definitions.ts (modified, committed in 183407b0 + 47861021)
- FOUND: el-templo-bot/test/playbook-resolver.test.ts (modified, committed in 47861021)
- FOUND: el-templo-bot/test/playbook-advance.test.ts (modified, committed in 47861021)
- FOUND: commit 183407b0 (PB2 enrichment)
- FOUND: commit 47861021 (PB3 enrichment + test updates)
- FOUND: .planning/phases/84-state-adaptive-playbook-prompts/84-01-SUMMARY.md (this file)
- grep assertions: all pass — 0 grupo nuevo / cohorte / post-expiry / banned skills; 1 "Se te viene la renovación"; 2 PB3.E1A stage id mentions; 1 PB3.E1B; 1 entryStageId="PB3.E1A"
- `pnpm test`: 299/299 green (no regressions vs phase 83 baseline)
