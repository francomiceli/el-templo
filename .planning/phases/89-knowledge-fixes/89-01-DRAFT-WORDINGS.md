# Phase 89-01 — Draft Wordings Scratchpad (Task 1 output)

**Status:** Awaiting user review (Task 2 checkpoint)
**Source files to edit:** none yet (Task 3 applies edits after approval)

---

## Budget Projection — post-application rendered PB1.E1A lead prompt

Baseline (from 88-02 SUMMARY): **18,858 chars** rendered, **KGATE-05 threshold 18,916** (headroom 58).

| Change                                                          | Δ chars (lead render) |
| --------------------------------------------------------------- | --------------------- |
| KFIX-01: remove `'discovery'` tag from Planes y Precios section | **~ -1,700**          |
| KFIX-03 part 1: swap SECTIONS[0] ↔ [1] (ordering only)          | 0                     |
| KFIX-03 part 2: restore ELEVATOR_TEXT 95 → 136 chars            | +41                   |
| KFIX-04: ZERO_RULES BP canonical rewrite (first numbered item)  | ~ +55 (see Draft B)   |
| New price-deferral framing rule in system-prompt.ts (universal) | +271                  |
| **Projected net**                                               | **~ -1,333**          |

**Projected post-application rendered PB1.E1A lead:** ~17,525 chars
**New headroom vs KGATE-05 (18,916):** ~1,391 chars banked for Phases 90-92.

(Actual values will be measured in Task 3 after snapshot regeneration. Projections use the ~1,700 figure quoted by CONTEXT.md; exact freed chars depend on section body length in lead render which we'll confirm.)

---

## Draft A — Restored `ELEVATOR_TEXT`

**File:** `el-templo-bot/src/ai/knowledge.ts` line ~439 (the `const ELEVATOR_TEXT = \`...\`` literal).

**Current (95 chars):**

> Método internacional de calistenia, cuatro niveles por clase — progresás sin salirte del grupo.

### Recommended — Option 1 (136 chars)

> Tenemos un método internacional de calistenia con cuatro niveles simultáneos en cada clase — progresás a tu ritmo sin salirte del grupo.

- **Chars:** 136 (≤150 cap, within ~131 target)
- **Hook 1 — "método internacional":** ✅ present ("un método internacional")
- **Hook 2 — "cuatro niveles" variant:** ✅ "cuatro niveles simultáneos" (matches long-form METHOD_DETAIL wording "cuatro niveles activos simultáneamente" in spirit, tighter phrasing)
- **Hook 3 — "no salirse/salirte del grupo":** ✅ "sin salirte del grupo" (tuteo preserved)
- **Tone:** Opens with team voice ("Tenemos un método…") — confident pitch, not a terse spec line. The "a tu ritmo" restores the warmth missing from the 95-char version (which read like a product bullet).
- **Tuteo:** ✅ progresás, salirte.

### Alternative — Option 2 (137 chars)

> Método internacional de calistenia con cuatro niveles activos simultáneamente en cada clase — cada alumno progresa a su ritmo sin salirse del grupo.

- **Chars:** 137
- Closer byte-for-byte to `METHOD_DETAIL`'s phrasing ("cuatro niveles activos simultáneamente", "sin salirse del grupo"). Reads as a third-person descriptor rather than a team pitch. Loses tuteo in the body ("cada alumno progresa" / "salirse") — less warm.
- Provided as a fallback for the user if they want the elevator to mirror the verbatim long-form more exactly. My recommendation is Option 1 (team voice + tuteo consistency wins over verbatim mirroring for an elevator pitch).

**Placement context:** The surrounding comment at line ~433 will be updated from "≤200 chars" to "restored ~136 chars after KFIX-03 — three team hooks preserved, conversational warmth restored". The `SECTIONS[1]` entry (Metodo (elevator)) will also move to SECTIONS[0], so this body is now the FIRST discovery-tagged content the model encounters for lead prompts (KFIX-03 part 1).

---

## Draft B — ZERO_RULES canonical Boarding Pass rewrite

**File:** `el-templo-bot/src/ai/knowledge.ts` line ~155-166 (the `const ZERO_RULES = \`...\`` literal), specifically the first numbered item (currently starts "1. _Boarding Pass (primer mes en El Templo):_").

### Current (the paragraph being replaced — first numbered item of ZERO_RULES)

```
1. *Boarding Pass (primer mes en El Templo):* Cuando una persona inicia por primera vez y presenta su Boarding Pass, puede acceder a los precios Zero en cualquier membresia. Es un beneficio unico (una sola vez).
```

Body chars (excluding the `1. ` prefix): ~212.

### Recommended replacement (219 chars body, same structure)

```
1. *Boarding Pass (primer contacto con El Templo):* El Boarding Pass es un pase digital único que recibís al contactarte por primera vez con El Templo. Tiene dos beneficios: (1) la clase de prueba 100% bonificada, y (2) precios Zero en la primera membresía que contrates. Es un beneficio único (una sola vez).
```

- **Explicit dual benefit:** ✅ both named in order (1) clase de prueba 100% bonificada, (2) precios Zero en primera membresía.
- **Tuteo:** ✅ recibís, contrates.
- **Kept numbered enumeration `(1)...(2)...`:** unmissable to the model. Two concentric numberings (outer item `1.`, inner benefits `(1)` `(2)`) read fine in practice — the inner parens disambiguate.
- **Kept "es un beneficio unico (una sola vez)"** clause: preserves v5.3.1 BPASS-02 semantics about one-time use.
- **Kept the `*Boarding Pass …:*` bold label** so the rest of ZERO_RULES keeps the same list style.
- **Delta vs current first numbered item:** +~55 chars (well within freed budget).

**Placement note for Draft B:** The rest of ZERO_RULES (second numbered item "Conversion a plan de largo plazo", "Fuera de estos casos…", `*Datos de pago:*` block) stays **byte-for-byte identical**. Only the first numbered item changes.

**Compared to user's suggested shape in 89-CONTEXT.md:** The user's suggested text was "El Boarding Pass es un pase digital único que recibís al contactarte por primera vez con El Templo. Tiene dos beneficios: (1) la clase de prueba 100% bonificada, y (2) precios Zero en la primera membresía que contrates." This draft preserves that shape verbatim and wraps it inside the existing `1. *Boarding Pass (...):* …` list-item skeleton of ZERO_RULES so the surrounding structure stays intact.

---

## Draft C — Price-deferral framing rule for `system-prompt.ts`

**File:** `el-templo-bot/src/ai/system-prompt.ts` inside the `*Reglas de conversacion*` block (line 189-194 currently).

### Recommended rule text (271 chars including leading `- `)

```
- Nunca inventes precios de membresías. Si el lead pregunta por precios durante discovery, respondé con el defer pattern de la stage actual y re-anclá la prueba gratuita. Si no estás seguro de un precio, NO lo menciones — solo ofrecé la clase de prueba como próximo paso.
```

- **Chars:** 269 (body) / 271 (with `- ` prefix).
- **Tuteo:** ✅ respondé, estás, ofrecé.
- **Bullet style:** `- ` matches adjacent rules in the same block (lines 191-194).
- **Universal scope:** ✅ rendered for ALL client states (the framing is in `base`, not inside any state-gated branch), consistent with the v5.3.1 method-internals rule at line 194.
- **Matches user-suggested shape in 89-CONTEXT.md:** byte-for-byte (modulo trailing whitespace).

### Placement decision (recommendation: **APPEND** after the line 194 method-internals rule)

Current `*Reglas de conversacion*` block (system-prompt.ts lines 189-194):

```
*Reglas de conversacion*

- Si alguien dice "lo pienso", ... (line 191)
- Si alguien expresa dudas ...     (line 192)
- Si alguien menciona "Alfa", ...  (line 193)
- Preguntas mecánicas sobre el método ... (line 194 — v5.3.1 deflection)
```

**Proposed — insert as new line 195 (immediately after the method-internals rule):**

```
- Preguntas mecánicas sobre el método ... (existing line 194)
- Nunca inventes precios de membresías. ... (NEW — Draft C text)
```

**Rationale for append-after-194:** The new rule is conceptually sibling to the line-194 deflection ("don't explain mechanical method internals → defer to trial class") — both teach Mica to re-anchor to the prueba gratuita under a specific trigger (method questions / price questions). Putting them adjacent groups the defer-patterns. Newer rule sits beneath the v5.3.1 rule, preserving commit archaeology.

**Alternative considered (rejected):** prepend at top of block (line 191). Rejected because it would displace the "lo pienso" rule which has precedence in the original block order and is the most common discovery objection.

---

## Hook / Benefit Preservation Checklist (quick visual scan)

| Draft | Required element                      | Present?                        |
| ----- | ------------------------------------- | ------------------------------- |
| A     | "método internacional"                | ✅                              |
| A     | "cuatro niveles" variant              | ✅ "cuatro niveles simultáneos" |
| A     | "no salirse/salirte del grupo"        | ✅ "sin salirte del grupo"      |
| A     | Tuteo (progresás)                     | ✅                              |
| A     | Char count ≤ 150                      | ✅ 136                          |
| B     | Dual benefit named                    | ✅                              |
| B     | (1) clase de prueba 100% bonificada   | ✅                              |
| B     | (2) precios Zero en primera membresía | ✅                              |
| B     | Tuteo (recibís, contrates)            | ✅                              |
| B     | One-time-use preserved                | ✅                              |
| C     | "Nunca inventes precios"              | ✅                              |
| C     | Defer + re-anchor trial pattern       | ✅                              |
| C     | Tuteo (respondé, estás, ofrecé)       | ✅                              |
| C     | Bullet style matches (`- `)           | ✅                              |

---

## Questions for reviewer

1. **Draft A:** Option 1 (team voice, recommended) or Option 2 (mirrors long-form more literally)?
2. **Draft B:** OK keeping the outer numbered `1.` list-item wrapper (maintains ZERO_RULES structure), with inner `(1)...(2)...` for benefits?
3. **Draft C placement:** Append after line 194 (recommended) — any objection, or do you want a different position inside `*Reglas de conversacion*`?

Reply with "approved" (picks all recommended defaults) or specific edits per draft.
