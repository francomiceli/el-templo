# Phase 87: Boarding Pass + Method Description - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning (pending team-provided verbatim method text — to be pasted into this file before execution)

<domain>
## Phase Boundary

Two linked content changes to `el-templo-bot/src/ai/knowledge.ts`:

1. **Boarding Pass consolidation** (BPASS-01/02/03) — single canonical definition in "Reglas Zero"; other mentions become short reference pointers; zero contradictory framings.
2. **Method description** (METHOD-01/02/03/04) — add two new sections ("Metodo (elevator)" + "Metodo (detalle)"), tag elevator as discovery-relevant, add a methodology-internals deflection rule in `system-prompt.ts`.

Out of scope: rewriting existing sections, new knowledge topics beyond method, playbook changes, prompt framing changes unrelated to the deflection rule.

</domain>

<decisions>
## Implementation Decisions

### Boarding Pass canonicalization (BPASS-01, 02, 03)

- Canonical definition stays in section 4 "Reglas Zero" (`knowledge.ts:156`). No move, no new section.
- All other 7 mentions (`knowledge.ts:242, 243, 250, 341, 342, 357, 372`) convert to the form `Boarding Pass (ver *Reglas Zero*)` — name + short pointer, no inline recap.
- No changes to which sections contain BP references; only the wording at each site changes.
- No tagging changes: Reglas Zero remains `discovery`, other sites keep their current tags.

### Method section structure

- **Split into two sections** (not one):
  - `Metodo (elevator)` — new section, 2-sentence compressed pitch. Tagged `['discovery']`. **Budget: ≤200 chars** (content only, excluding title).
  - `Metodo (detalle)` — new section, team-provided verbatim long-form. Tagged `[]` (untagged / full-set only).
- Placement: positions 2 and 3 in the SECTIONS array, immediately after "Que es El Templo". ROM shifts to position 4 and all subsequent sections shift by 2.
- Rationale for split: the verbatim long-form is estimated ~300–400 chars. Tagging it `discovery` would consume all ~300 chars of KGATE-05 headroom and fail 86-03's regression test. Elevator + detalle are two distinct artifacts authored for different purposes (conversational use vs reference); drift risk is low.

### METHOD-04 interpretation

- Requirement satisfied by tagging `Metodo (elevator)` as `discovery` — the method section IS included in the PB1 lead knowledge gate. METHOD-04 does not mandate that all method content reaches leads, only that method content is present.

### Deflection rule (METHOD-03)

- **Location:** new rule added to the framing section of `el-templo-bot/src/ai/system-prompt.ts`, NOT inside `knowledge.ts`. The deflection is a behavioral instruction to Mica (how to respond), not factual content about the method.
- **Trigger:** method-internals questions only — progresiones, periodización, bloques de entrenamiento, ejercicios específicos, sets/reps, loading patterns, anything asking HOW the method works mechanically.
- **Response shape:** Mica replies with the team phrase "lo sentís cuando llegás" and re-anchors the trial-class CTA. Exact wording drafted during implementation, reviewed by user for tone (team's voice).
- Does NOT trigger on "what is the method" — the elevator pitch handles that legitimately.

### Authorship

- **User provides:** verbatim long-form method text (METHOD-01 mandates team-authored source). Pasted into this CONTEXT.md in a `## Pending Content` block below before execution.
- **Claude drafts during implementation:** elevator pitch (METHOD-02, ≤200 chars, compressed from verbatim), deflection rule wording (METHOD-03).
- User reviews deflection wording before commit — it carries the team's voice.

### Prompt-size budget management

- KGATE-05 threshold (≥20% reduction on PB1.E1A rendered prompt) has ~299 chars of headroom post-Phase 86.
- **Elevator budget: ≤200 chars** — leaves ~100 chars real headroom plus whatever BP-pointer overhead lands in discovery-tagged sections.
- **BP-pointer overhead is audit-first, not assumed:** of the 7 current BP mention sites, only those in discovery-tagged sections count against the lead prompt. Likely sites that render for leads: Reglas Zero (canonical), Clase de Prueba, Tecnicas de Venta, Objeciones de venta. Sites in Mejora de plan, Objeciones de retención, Estrategias de Retencion cost zero for leads (sections are untagged). Measure actual rendered-for-lead overhead before finalizing the elevator length.
- **If threshold breached during execution: CHECKPOINT.** Executor must halt, report measured sizes, and present options to the user: (a) compress elevator further with user review, (b) trim BP reference form (drop pointer), (c) move an existing discovery-tagged section to full-only, (d) rebaseline KGATE-05 as last resort. Decision is the user's — do NOT auto-trim team-provided content.

### Claude's Discretion

- Exact wording of the elevator pitch (within the ≤200 char budget, preserving core concepts from the verbatim: "método internacional", "cuatro niveles simultáneos", "no salirse del grupo", or whatever the long-form highlights).
- Exact wording of the deflection rule in `system-prompt.ts` framing (subject to user review for tone).
- Exact TypeScript form of the new SECTIONS entries and their ordering mechanics.
- Which of the 7 BP reference sites (if any) are in strings that are concatenated/formatted via helpers — adjust accordingly.
- Test coverage for the new content — add targeted asserts in `knowledge-gating.test.ts` for section presence/absence per state, and confirm the deflection rule appears in rendered prompts for all states.

</decisions>

<specifics>
## Specific Ideas

- The team's voice matters more than word economy for the verbatim long-form — do not paraphrase `Metodo (detalle)` under any circumstance. If that section's length becomes a problem, the fix is NOT to edit team content; it's to confirm `Metodo (detalle)` stays untagged so it doesn't reach leads.
- The deflection phrase "lo sentís cuando llegás" is the team's canonical answer to "how does your method work" — it's a tonal cue that the method is experiential, not explanatory. Preserve the tuteo (sentís/llegás) form.
- Three concepts from the user's phrasing that should likely survive the elevator compression: "método internacional", "cuatro niveles simultáneos", "no salirse del grupo". The verbatim may add more; these three are the hooks.

</specifics>

<pending_content>

## Pending Content (USER TO FILL BEFORE PLANNING EXECUTION)

### Verbatim long-form method description (METHOD-01)

El Templo tiene un método internacional de entrenamiento de calistenia que combina un sistema de
periodización cíclica con experiencias de comunidad únicas en cada clase. Cada alumno entrena con un
programa individual adaptado a su nivel — hay cuatro niveles activos simultáneamente en cada clase,
desde principiantes hasta atletas avanzados. El sistema está diseñado para que cada persona progrese a
su ritmo sin salirse del grupo.

Pero El Templo no es solo entrenamiento. Cada clase tiene momentos distintos que no vas a encontrar en
otro lado. Hay momentos donde el entrenamiento se convierte en juego — movimiento grupal, conexión
desde el primer minuto. Hay momentos donde profundizamos en un solo movimiento con tiempo y guía real
del entrenador. Hay momentos donde conectás todo lo que entrenaste en secuencias fluidas. Hay momentos
donde tu entrenador te lleva a probar los movimientos que más querés lograr. Hay momentos donde
trabajamos verticales. Hay momentos donde entrenamos la cabeza además del cuerpo — respiración, foco,
calma.

No todos los días son iguales — hay distintos tipos de clases a lo largo de la semana, cada una con su
propio foco y experiencia.

La app complementa el presencial. Cada alumno puede seguir su programa individual en la app y seguir
progresando fuera del local.
</pending_content>

<deferred>
## Deferred Ideas

- Refactoring `system-prompt.ts` framing to gate universal behavior per state — explicitly off the table (Phase 86 decision: would regress QT11-18 fixes).
- Phase 88 tests (all 502 existing + new regression locks) — belongs in Phase 88.
- Audience-specific method messaging beyond lead/non-lead (e.g., different method pitch for trial vs active) — out of scope for v5.3.1.
- Method-related CTAs in other sections (e.g., "ask about method" prompts in Clase de Prueba) — not in requirements; can be a separate idea for v5.4.

</deferred>

---

_Phase: 87-boarding-pass-method-description_
_Context gathered: 2026-04-14_
