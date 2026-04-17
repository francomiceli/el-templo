# Onboarding — Narrative Redesign Spec

**Date:** 2026-04-16
**Status:** Spec — copy + structure approval required before implementation
**Scope:** Full rewrite of onboarding visual + narrative direction
**Supersedes:** `ONBOARDING_CTA_PROPOSAL.md` (CTA redesign already implemented; this spec subsumes + extends it)

---

## 1. Problem

The current onboarding reads as a clinical form: 5 quiz questions with zero context on who El Templo is, what the brand believes, or how the user's answers map to the ecosystem. It is the highest-intent moment in the app — a first-time user with guided attention — and it wastes it.

## 2. Design principle: Mutual introduction

The user answers; El Templo answers back.

Each question is followed by a short reactive lore screen (1 line + glyph) that reflects the **specific** answer chosen and embeds a brand belief. No monologue, no preamble dump. Brand voice appears _in response_, not _before_.

Reference patterns (from research):

- **Hinge** — prompts embed voice, user is the protagonist
- **Headspace** — philosophy embodied in a practice, reflection after
- **Aesop (retail ritual)** — restraint, whitespace, literary tone, no gamification

Explicit rejections:

- Long opening monologue (Calm/Freeletics) — users skip
- Stat-based interstitials (BetterMe) — feels cheesy for a temple aesthetic
- Lore above every question on same screen — splits cognition, dilutes both

## 3. Flow overview

```
[open] Opening ritual
[q1]   Age              → [r1] reflect
[q2]   Background       → [r2] reflect
[lvl]  Level picker     (only if background = el_templo — IS its own reflect)
[q3]   Goal             → [r3] reflect
[q4]   Pain point       → [r4] reflect
[q5]   Frequency        → [r5] reflect
[rev]  Closing revelation (program reveal + AURA + CTA)
```

- **Reflect** screens: auto-advance after 7s, tap anywhere to skip forward
- **Transitions:** slide 300ms between questions; fade-to-black 600ms between answer and reflect (ritual pause)
- **Progress indicator:** 5 greek letters fill as questions are answered (replaces dots)
- **Total length:** ~90s for the common path, ~110s with level picker

## 4. Screen-by-screen copy

All copy is **voseo** (Argentine). Confirm in §8.

### [open] Opening ritual

_Replaces `OnboardingWelcome.vue`. Full-bleed hero — no glass card. Single screen with hero → tagline → manifesto → reciprocity → CTA. Dark-wash backdrop is page-level (lives on `OnboardingPage`, not this component) so it persists across every screen in the flow: `charcoal 38% → black 68%` radial + 4px blur above `OnboardingBackground`._

Copy (top to bottom):

- **Hero** (Montserrat ExtraBold uppercase, cream): `Tu cuerpo / es tu templo.`
- **Tagline** (Geologica 300 italic, cream 80%): `Esto no es un gimnasio: es una escuela de calistenia.`
- **Manifesto block** (Geologica 400, cream 72%, 3 lines separated by `<br>`):
  - `Entrenamos con lo esencial.`
  - `Sin máquinas, sin atajos.`
  - `Tu propio cuerpo y un método que transforma.`
- **Origin block** (same style as manifesto — Geologica 400, cream 72%):
  - `Luego de años de práctica y enseñanza en calistenia,`
  - `nuestra experiencia toma forma digital para acompañarte donde estés.`
- **Reciprocity block** (Geologica 400, cream 88%):
  - `Antes de empezar, tomemos un momento.`
  - `Queremos mostrarte quiénes somos,`
  - `y saber quién sos.`
- **CTA** (Montserrat ExtraBold, terracotta bg): `Empezar el camino`

A 1px terracotta rule separates manifesto and reciprocity (ritual pause). Reveal: each block fades up sequentially (150ms stagger).

### [q1] Age range

Above the question (Geologica italic, cream 50%): _"Cada etapa tiene su fuerza. Entrenamos todas."_
Question: **"¿Qué edad tenés?"** (unchanged)

Options (rebucketed 2026-04-17, full migration applied across frontend + API + DB + avatar rules):

- `18_24` · "18 a 24 años"
- `25_34` · "25 a 34 años"
- `35_50` · "35 a 50 años"
- `50_plus` · "Más de 50"

Reflect per answer:

| Answer    | Reflect copy                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------ |
| `18_24`   | "Acá empieza el cuerpo que vas a usar toda la vida."                                             |
| `25_34`   | "Trabajo, vida, disciplina propia. En el medio, tu entrenamiento."                               |
| `35_50`   | "Lo que entrenás hoy es el cuerpo que te va a acompañar mañana."                                 |
| `50_plus` | "Lo que entrenás hoy es el cuerpo que te va a acompañar mañana." _(shared with 35_50 by design)_ |

### [q2] Training background

Frame: _"Nada es al azar. Todo es metodología."_
Question: **"¿Cuál es tu historia con el entrenamiento?"**

Options (labels polished 2026-04-17; enum values unchanged):

- `el_templo` · "Ya entreno en El Templo"
- `nunca` · "Nunca entrené en serio"
- `gym` · "Gimnasio con pesas"
- `cardio` · "Running, natación o ciclismo"
- `yoga_pilates` · "Yoga o pilates"
- `calistenia` · "Calistenia"
- `deje` · "Entrenaba pero dejé"

Reflect per answer:

| Answer         | Reflect copy                                                    |
| -------------- | --------------------------------------------------------------- |
| `el_templo`    | (skipped — advances directly to level picker)                   |
| `nunca`        | "Cada día es una decisión. Hoy ya la tomaste."                  |
| `gym`          | "Vas a descubrir lo que tu cuerpo puede hacer sin máquinas."    |
| `cardio`       | "Moverte es el primer paso. Ahora viene la fuerza."             |
| `yoga_pilates` | "Ya entrenaste conciencia. Ahora entrenamos fuerza consciente." |
| `calistenia`   | "Entrenás sin máquinas. Ahora entrenás con método."             |
| `deje`         | "El que volvió sabe cuánto vale seguir."                        |

### [lvl] Level picker (conditional)

_Replaces current list-style level question when `trainingBackground = el_templo`. Simple identity-pick: glyph + name, no essence copy, dynamic confirm CTA._

Question: **"¿En qué nivel entrenás?"**

4 greek-letter glyphs on one screen, glyph + name per option:

- α Alfa
- Δ Delta
- Σ Sigma
- Ω Omega

**Interaction:** tap a glyph → it becomes selected (terracotta border/glow). The confirm CTA at the bottom reads **"Entro como {levelName}"** (e.g. "Entro como Delta") and activates. Tap → advance to Q3.

No expand-to-card, no essence lines — the ritual is in the glyph grid + the dynamic CTA naming what they chose.

**Spartan is intentionally excluded from the self-pick picker.** It's earned/assigned, not claimed. `TemploLevel` type in `types.ts` retains `'spartan'` for DB/API/admin parity; only `LEVEL_SELECTOR_QUESTION.options` drops it.

### [q3] Goal

Frame: _"Cada meta tiene un camino. Vos elegís el destino."_
Question: **"¿Qué te mueve a entrenar?"** (motivation-framed; gender-filtered as today)

Option labels (enum values unchanged; all rewritten to motivation-style 2026-04-17):

- `habito` · "Crear el hábito de entrenar"
- `fuerza_general` · "Fuerza y cuerpo completo"
- `comunidad` · "Entrenar en comunidad"
- `piernas_gluteos` · "Tener piernas y glúteos fuertes" (♀)
- `cuerpo_firme` · "Cuerpo firme y funcional" (♀)
- `cero_atleta` · "De cero a atleta" (♂)
- `skill` · "Lograr un movimiento icónico de calistenia" (♂)
- `longevidad` · "Moverme sin dolor, longevidad" (35+)

Reflect per answer:

| Answer            | Reflect copy                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `habito`          | "Somos lo que hacemos repetidamente. La excelencia, entonces, no es un acto, sino un hábito." |
| `fuerza_general`  | "**Sthenos.** Fuerza real es control absoluto."                                               |
| `comunidad`       | "Nadie se hace fuerte solo. Ese es el secreto."                                               |
| `piernas_gluteos` | "Tallar el cuerpo con intención. Eso es entrenar piernas y glúteos."                          |
| `cuerpo_firme`    | "Firmeza no es tono. Es fuerza visible."                                                      |
| `cero_atleta`     | "Cada etapa te entrena para la siguiente. Eso es ser atleta."                                 |
| `skill`           | "Para lograr el movimiento, tenés que construir el cuerpo. Ese es el camino."                 |
| `longevidad`      | "Moverte sin dolor es un entrenamiento, no una suerte."                                       |

### [q4] Pain point

Frame: _"No es solo voluntad. A veces falta estructura."_
Question: **"¿Qué no te funcionó hasta ahora?"**

Reflect per answer:

| Answer            | Reflect copy                                                             |
| ----------------- | ------------------------------------------------------------------------ |
| `tiempo`          | "No necesitás más tiempo. Necesitás un método que respete el que tenés." |
| `constancia`      | "La constancia no se fuerza. Se construye con estructura."               |
| `no_se_por_donde` | "Empezás donde estás. El método te lleva el resto."                      |
| `ambiente`        | "Entrar a entrenar debería sentirse bien. Pronto lo vas a sentir."       |
| `resultados`      | "Si no vas en una dirección, no hay cómo llegar."                        |
| `nada`            | "Perfecto. Empezamos."                                                   |

### [q5] Frequency

Frame: _"Donde hay ritmo, hay progreso."_
Question: **"¿Cuántos días por semana podés entrenar?"** (unchanged)

**No reflect screen for Q5.** Frequency answers advance directly to the closing revelation — a final 7s reflect before the program reveal would dilute the ceremony.

### [rev] Closing revelation

_Updates `OnboardingRecommendation.vue`. Copy locked 2026-04-17. Three-beat ceremony still prospective — current UI renders everything in one glass card with the new copy in place._

**Beat 1 — Reading (prospective)**
Small label above the 3-row summary (goal · pain point · frequency): _"Nos contaste esto."_

**Beat 2 — Reveal (implemented)**
Heading: **"Por eso, este es tu programa."**
Program label: **"Tu programa"**
Program name (dynamic, engraved effect, terracotta).
Program description (dynamic).

**Beat 3 — Reward + CTA (implemented)**
AURA orb pulse + "+50 AURA" + subtitle **"Ganaste tu primera recompensa"**.

**CTA pattern — unified across all users (scenarios 1–4 collapsed).**
Branches only on program type (Foundation vs specialized/paid), not on subscription state. Never more than one WhatsApp CTA per screen.

- Intro copy above the WhatsApp button:
  - Foundation: _"Podés pedir nuevos programas especializados o entrenamiento personalizado."_
  - Paid: _"Podés pedir este programa, otros especializados o entrenamiento personalizado."_
- WhatsApp button label:
  - Foundation: **"Quiero saber más"**
  - Paid: **"Quiero este programa"**
- Secondary intro: _"Explorá primero la app"_
- Secondary button (ghost/outlined): **"Entrar al Templo"**

WhatsApp message bodies:

- Foundation: `Hola! Hice el quiz en la app y quiero saber más sobre los programas especializados y el entrenamiento personalizado.`
- Paid: `Hola! Hice el quiz en la app y me recomendaron el programa: {programName}. Quiero saber más.`

## 5. Component architecture

```
OnboardingPage.vue           orchestrator — state machine
├── OnboardingBackground.vue unchanged
├── OnboardingProgress.vue   NEW — 5 greek letters fill, replaces dots
├── OnboardingOpen.vue       NEW — replaces Welcome
├── OnboardingQuestion.vue   minor: add optional `frame` prop for italic line above question
├── OnboardingReflect.vue    NEW — 1-line reactive lore card, 7s auto-advance
├── OnboardingLevelPicker.vue NEW — greek glyph ritual, replaces list-style level question
└── OnboardingRevelation.vue NEW — replaces Recommendation, 3-beat ceremony
```

`OnboardingResult.vue` (currently unused based on imports in `OnboardingPage.vue`) — delete after migration if confirmed orphan.

## 6. State machine

Expand from `step: 0..6` to named states:

```
'open' | 'q1' | 'r1' | 'q2' | 'r2' | 'lvl' | 'q3' | 'r3'
      | 'q4' | 'r4' | 'q5' | 'r5' | 'rev'
```

Rules:

- Reflect state derives copy from the answer just stored in `answers`
- Back navigation **skips reflect**: back from `q2` → `q1` (selection preserved), never to `r1`
- Forward from reflect: auto-advance after 7s, or tap-anywhere to skip
- Q2 → `el_templo` skips `r2` and goes straight to `lvl`
- From `lvl`, forward goes to `q3` (no separate reflect — level picker IS the reflect)
- Submit API call fires on leaving `q5` (before `r5`) so reflect + revelation can show warm while request runs in background
- Revelation beats 1+2 timed with CSS animation keyframes, not setTimeout chains

## 7. Visual direction

**Palette:** unchanged — charcoal `#2e2a26`, terracotta `$brand-terracotta`, cream `#f2ede5`, amber `#d4a843`, bronze `#d4b896`.

**Typography:** Montserrat + Geologica as today. Greek letters render in Montserrat ExtraBold at 4rem+ for ritual screens.

**New motifs:**

- Greek-letter glyphs at large size on level picker + progress indicator
- "Engraved" text effect for the revelation program name (inset shadow, tight letterspacing `0.15em`, cream with terracotta subsurface glow)
- Fade-to-black 600ms between answer and reflect (ritual pause)
- Slide 300ms between reflect and next question (forward momentum)
- Progress: 5 greek letters `α Δ Σ Ω α` (or similar) fill from cream 20% → terracotta as each question answers

**Removed:**

- Progress dots (replaced with filling greek letters)
- Celebration particles on recommendation (kept only the AURA orb pulse — restraint)

## 8. Open questions — RESOLVED 2026-04-17

1. **Voseo confirmed?** ✅ Yes — voseo everywhere (vos/contanos/querés).
2. **Auto-advance on reflect?** ✅ 7s auto-advance + tap-to-skip.
3. **Level picker layout?** ✅ 4 glyphs spread on one screen (ritual).
4. **Alfa vs Spartan glyph conflict?** ✅ Resolved by excluding Spartan from the self-pick picker (see §4 [lvl]). Spartan is earned/assigned, not claimed. `TemploLevel` type unchanged.
5. **Old `ONBOARDING_CTA_PROPOSAL.md`?** ✅ Deleted.
6. **Visual mockup first?** ✅ Yes — static HTML/CSS mockup of a full question→reflect pair + closing revelation before Vue components (validates the reactive-lore pattern, which is the brand-voice core).

## 9. Implementation sequence (page-by-page)

1. **Approve this spec** (copy + structure)
2. Build `OnboardingOpen.vue` — new opening ritual screen
3. Build `OnboardingReflect.vue` + wire Q1 + r1 pair (proves the pattern end-to-end)
4. Apply pattern to Q2/r2, Q3/r3, Q4/r4, Q5/r5 (add `frame` prop to `OnboardingQuestion.vue`)
5. Build `OnboardingLevelPicker.vue` — greek-glyph ritual (biggest aesthetic lift)
6. Build `OnboardingRevelation.vue` — 3-beat ceremony
7. Rewrite state machine in `OnboardingPage.vue`
8. Build `OnboardingProgress.vue` — greek-letter progress indicator
9. QA pass + analytics events (`reflect_shown`, `reflect_skipped`, `level_selected`, `revelation_shown`)

Each step is atomic, visually testable in isolation, and committable.
