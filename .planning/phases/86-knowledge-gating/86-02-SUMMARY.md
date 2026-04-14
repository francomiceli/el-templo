---
phase: 86-knowledge-gating
plan: 02
subsystem: whatsapp-bot/ai
tags: [knowledge, gating, refactor, state-machine, prompt-architecture]
requires:
  - el-templo-bot/src/state/machine.ts::ClientState
  - el-templo-bot/src/ai/knowledge.ts (pre-refactor, 12-section inline array)
  - el-templo-bot/src/ai/system-prompt.ts (pre-refactor call site)
provides:
  - el-templo-bot/src/ai/knowledge.ts::getBusinessKnowledge(clientState?)
  - el-templo-bot/src/ai/knowledge.ts::SECTIONS (module-private tagged array)
affects:
  - el-templo-bot/src/ai/system-prompt.ts (one-line call site change)
  - el-templo-bot/test/conversation-flows.test.ts (AVAT-03 baseline re-aligned)
tech-stack:
  added: []
  patterns:
    - "Module-level ReadonlyArray<T> with explicit tag field for audience gating"
    - "Filter-in-place (not reorder) to preserve original section flow"
    - "Tag vocabulary starts narrow ('discovery'); extensible without renaming"
key-files:
  created: []
  modified:
    - el-templo-bot/src/ai/knowledge.ts
    - el-templo-bot/src/ai/system-prompt.ts
    - el-templo-bot/test/conversation-flows.test.ts
decisions:
  - "SECTIONS is module-private (not exported). Tests go through getBusinessKnowledge only. If future introspection is needed, export then — YAGNI now."
  - "OBJECTION_HANDLING split at the source: two new constants OBJECTIONS_SALES (items 1-7) and OBJECTIONS_RETENTION (item 8) rather than inline slicing inside SECTIONS. Preserves verbatim wording and keeps the section body template clean."
  - "Retention objection keeps numbering '8.' to minimize content diff from the pre-refactor wording (CONTEXT preference: preserve Mica's original text)."
  - "Section titles in the SECTIONS array match the planned split titles (e.g. 'Objeciones de venta', 'Mejora de plan'); the rendered *bold* heading inside each body uses descriptive wording ('*Manejo de objeciones comunes:*' for sales, '*Manejo de objeciones (retencion):*' for retention, '*Mejora de plan*' for upgrade paths) so Mica reads a natural heading, not a taxonomy label."
  - "Deviation: AVAT-03 test (conversation-flows.test.ts) asserted Q4 and Q14 tokens against a lead-state rendered prompt. Those tokens live in member-only sections. Split the assertion into a lead path (9 discovery tokens) and a new trial path (adds Q4 + Q14) so both KGATE-02 and KGATE-03 are covered."
metrics:
  duration: "5min"
  tasks: 2
  files_changed: 3
  commits: 3
  completed: 2026-04-14
requirements:
  - KGATE-01 (signature accepts ClientState)
  - KGATE-02 (leads get discovery-only)
  - KGATE-03 (trial/active/inactive/expired get full)
  - KGATE-04 (no-arg backward compat)
  - KGATE-06 (system-prompt minimal change)
---

# Phase 86 Plan 02: Refactor knowledge.ts with state gating Summary

State-gated knowledge injection for the WhatsApp bot: `getBusinessKnowledge` now accepts an optional `ClientState` and, for `'lead'`, returns only the 8 discovery-tagged sections (37% smaller than the full 14-section set); every other state, and the no-arg call, return the full set unchanged.

## Artifacts

- **Tagged section table:** `el-templo-bot/src/ai/knowledge.ts`
  - `interface KnowledgeSection { title, body, tags: ReadonlyArray<'discovery'> }`
  - Module-level `SECTIONS: ReadonlyArray<KnowledgeSection>` — **14 entries** post-split
  - `SectionTag` type alias (narrow vocabulary: `'discovery'` only for v5.3.1)
- **Gated API:** `getBusinessKnowledge(clientState?: ClientState): string`
  - `clientState === 'lead'` → `SECTIONS.filter((s) => s.tags.includes('discovery'))`
  - Any other value (including `undefined`) → full `SECTIONS`
- **Call-site wiring:** `el-templo-bot/src/ai/system-prompt.ts` line 215 — `${getBusinessKnowledge(options?.clientState)}` (1-char diff inside the template literal)
- **Test alignment:** `el-templo-bot/test/conversation-flows.test.ts` — AVAT-03 updated to assert both lead discovery set and non-lead full set

## Section Inventory

**Total sections:** 14 (post-split)
**Discovery-tagged:** 8
**Full-only:** 6

| #   | Title                    | Tags            | Source                                                                                        |
| --- | ------------------------ | --------------- | --------------------------------------------------------------------------------------------- |
| 1   | Que es El Templo         | `['discovery']` | Unchanged                                                                                     |
| 2   | ROM                      | `[]`            | Unchanged                                                                                     |
| 3   | Planes y Precios         | `['discovery']` | Split: removed `*Mejora de plan:*` + UPGRADE_PATHS lines                                      |
| 4   | Mejora de plan           | `[]`            | **NEW** — split body: `*Mejora de plan*\n\n${UPGRADE_PATHS}`                                  |
| 5   | Reglas Zero              | `['discovery']` | Unchanged                                                                                     |
| 6   | Horarios por Sede        | `['discovery']` | Unchanged                                                                                     |
| 7   | Clase de Prueba          | `['discovery']` | Unchanged                                                                                     |
| 8   | App (DeportNet)          | `[]`            | Unchanged                                                                                     |
| 9   | Politicas                | `[]`            | Unchanged                                                                                     |
| 10  | Tecnicas de Venta        | `['discovery']` | Unchanged                                                                                     |
| 11  | Objeciones de venta      | `['discovery']` | **NEW** — split: items 1-7 (caro, tiempo, miedo, pensarlo, otro lado, lejos, pagar por clase) |
| 12  | Objeciones de retención  | `[]`            | **NEW** — split: item 8 (no me convencio), number preserved                                   |
| 13  | Estrategias de Retencion | `[]`            | Unchanged                                                                                     |
| 14  | Reglas de Oro            | `['discovery']` | Unchanged (universal, tagged so leads still see it)                                           |

All 8 current objections are preserved; none lost. Order preserved (filter-in-place). Mica's wording is verbatim for every section except the two splits' structural cuts.

## Measurements (knowledge block only, pre system-prompt wrap)

| Call                                                                                        | Chars  | Δ vs full  | % of full                     |
| ------------------------------------------------------------------------------------------- | ------ | ---------- | ----------------------------- |
| `getBusinessKnowledge()`                                                                    | 13,842 | —          | 100%                          |
| `getBusinessKnowledge('lead')`                                                              | 8,750  | **−5,092** | **63%**                       |
| `getBusinessKnowledge('trial' \| 'active_member' \| 'inactive_member' \| 'expired_member')` | 13,842 | 0          | 100% (string-equal to no-arg) |

**Knowledge-block reduction for leads: 37%.** This is the knowledge _block_ only — the full rendered PB1.E1A prompt savings (KGATE-05 measurement, `pb1-e1a-baseline.txt` = 23,646 chars) will be reported in Phase 88 along with the `renderedLength <= BASELINE_CHARS * 0.65` assertion.

## Behavioral verification (executed)

Via `tsx` one-shot against the real module (the plan's `node -e` verify command doesn't work because the project has no build emit and `require()` can't load `.ts`):

- `getBusinessKnowledge('lead')` contains: `Planes Flex`, `Boarding Pass`, `Reglas de Oro`, `Objeciones de venta`, all 7 sales objections (Es caro, No tengo tiempo, Tengo miedo, Quiero pensarlo, Ya entreno en otro lado, Me queda lejos, Puedo pagar por clase)
- `getBusinessKnowledge('lead')` **excludes**: `Estrategias de Retencion`, `Ayuda con la App`, `Mejora de plan`, `Politicas del Centro`, `Objeciones de retención`
- `getBusinessKnowledge('trial')`, `'active_member'`, `'inactive_member'`, `'expired_member'` are string-equal to the no-arg call (full set preserved)
- `full.includes('No me convencio')` and `full.includes('Mejora de plan')` confirm splits round-trip the full set with zero content loss

## Tests

- **knowledge.test.ts**: 66/66 pass (all go through the no-arg path — backward compat confirmed)
- **conversation-flows.test.ts**: 28/28 pass after AVAT-03 re-alignment
- **Full bot suite**: 502/502 pass (`pnpm test`)
- `pnpm tsc --noEmit` clean (strict mode, no `any`)

## Deviations from Plan

### Rule 1 — Test alignment (not a source bug)

**1. AVAT-03 baseline asserted pre-gating behavior**

- **Found during:** post-Task 2 full-suite run
- **Issue:** `conversation-flows.test.ts` rendered `getSystemPrompt({ clientState: 'lead', ... })` and asserted `*efectivo*` (Q4, Politicas section) and `*Ver membresia*` (Q14, App section) were present. After gating, those sections are correctly filtered out for leads — exactly what KGATE-02 asks us to do.
- **Fix:** Split the assertion into (a) a lead path that covers only the 9 discovery-set Q1-Q14 tokens, and (b) a new trial-state path that renders the same playbook context with `clientState: 'trial'` and asserts Q4 + Q14 are still reached. This covers both KGATE-02 (lead narrows) and KGATE-03 (non-lead full) with one test.
- **Files modified:** `el-templo-bot/test/conversation-flows.test.ts`
- **Commit:** `8b42343d`

### Informational — Task 1 automated verify command

The plan's Task 1 `<automated>` verify ran `node -e "require('./dist/ai/knowledge.js') || require('./src/ai/knowledge.ts')"`, which fails because (a) there is no build emit — the project only runs `tsc --noEmit` — and (b) `require()` cannot load a `.ts` source file without a TS loader. Replaced with an equivalent `npx tsx -e "..."` invocation that executes the same assertion set (plus stronger coverage: explicit checks for all 4 non-lead states, all 7 sales objections, retention objection presence in full set, app/policies exclusion from lead). All assertions pass. Tracked here so Plan 86-03 can encode the real behavioral assertions as vitest tests instead of a shell `-e` one-shot.

## Commits

- `c40a9240` — `refactor(86-02): tag knowledge sections and gate discovery content for leads`
- `d310396f` — `feat(86-02): pass clientState to getBusinessKnowledge in system-prompt`
- `8b42343d` — `test(86-02): align AVAT-03 baseline with knowledge gating`

## Self-Check: PASSED

- FOUND: `el-templo-bot/src/ai/knowledge.ts`
- FOUND: `el-templo-bot/src/ai/system-prompt.ts`
- FOUND: `el-templo-bot/test/conversation-flows.test.ts`
- FOUND commit: `c40a9240`
- FOUND commit: `d310396f`
- FOUND commit: `8b42343d`
- `pnpm tsc --noEmit` → exit 0
- `pnpm test` → 502/502 pass
