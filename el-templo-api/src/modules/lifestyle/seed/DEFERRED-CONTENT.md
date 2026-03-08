# Deferred Content Catalog

Inventory of all Arete content NOT included in the El Templo starter set.
This is v5.0's "shopping list" -- raw inventory with source locations, not adapted content.

Last updated: 2026-03-08

---

## 1. Habits (Level 3-5)

**Total deferred:** 24 habits (of 39 total)
**Source:** `arete-app/constants/habits.ts` and `arete-app/constants/habit-details.ts`

The starter set (Plan 01) includes 15 habits at Level 1-2. The remaining 24 are Level 3+:

| Code   | Name                         | Area       | Min Level |
| ------ | ---------------------------- | ---------- | --------- |
| MEN-05 | Lectura filosofica           | mente      | 3         |
| MEN-06 | Ejercicio de memoria         | mente      | 3         |
| MEN-07 | Contemplacion silenciosa     | mente      | 4         |
| MEN-08 | Estudio de retorica          | mente      | 5         |
| CUE-05 | Ayuno consciente             | cuerpo     | 3         |
| CUE-06 | Agua fria                    | cuerpo     | 3         |
| CUE-07 | Rutina de movilidad          | cuerpo     | 4         |
| COH-03 | Evaluacion de coherencia     | coherencia | 3         |
| COH-04 | Practica de puntualidad      | coherencia | 3         |
| COH-05 | Acto de integridad           | coherencia | 4         |
| COH-06 | Auditoria semanal de valores | coherencia | 5         |
| ACC-03 | Acto de coraje pequeno       | accion     | 3         |
| ACC-04 | Proyecto personal            | accion     | 3         |
| ACC-05 | Decision sin postergar       | accion     | 4         |
| ACC-06 | Mentoria activa              | accion     | 5         |
| VIN-03 | Escucha sin interrumpir      | vinculo    | 3         |
| VIN-04 | Gratitud expresada           | vinculo    | 3         |
| VIN-05 | Reconciliacion pendiente     | vinculo    | 4         |
| REF-04 | Escritura libre              | reflexion  | 3         |
| REF-05 | Analisis de error            | reflexion  | 3         |
| REF-06 | Dialogo socratico interno    | reflexion  | 4         |
| REF-07 | Carta a tu yo futuro         | reflexion  | 5         |
| VIN-01 | Conversacion profunda        | vinculo    | 2         |
| VIN-02 | Acto de servicio             | vinculo    | 2         |

**Content shape:** Each habit has `id`, `area`, `code`, `name`, `description`, `moment`, `minLevel`, `durationMinutes`. Each also has a `HabitDetail` record with `howTo`, `whyItMatters`, and `tips[]`.

**Brand distribution:** All 39 habits are brand-neutral (no `brand` field). They were designed for universal use.

**Adaptation needed:** Minimal. Habit names and descriptions are already in rioplatense Spanish and brand-neutral. The main adaptation is integrating with El Templo's AURA system instead of AURUM, and applying El Templo's level naming (Alfa-Spartan) instead of Arete's (Tierra-Fuego).

---

## 2. Journal Questions (Deep + Philosophical)

**Total deferred:** 16 questions
**Source:** `arete-app/constants/journal-questions.ts`

The starter set (Plan 01) includes 14 simple questions (Level 1, brand: 'both'). The remaining are:

### Brand: 'both' (Level 3+)

- 7 deep questions (d01-d07, minLevel 3) -- require self-knowledge
- 4 philosophical questions (p01-p04, minLevel 5) -- existential

### Brand: 'arete' (all levels)

- 5 simple questions (a01-a05, minLevel 1) -- body awareness, self-care, sensory (feminine tone)
- 3 deep questions (a06-a08, minLevel 3) -- self-love, boundaries, feminine power
- 2 philosophical questions (a09-a10, minLevel 5) -- wellness meaning, nature of beauty

**Content shape:** Each question has `id`, `text`, `minLevel`, `category` ('simple' | 'deep' | 'philosophical'), `brand?`.

**Brand distribution:**

- brand: 'both' -- 11 questions (7 deep + 4 philosophical)
- brand: 'arete' -- 10 questions (5 simple + 3 deep + 2 philosophical)

**Adaptation needed:**

- 'both' deep/philosophical questions: Ready to use as-is. Just need level gating in El Templo's system.
- 'arete' questions: Require tone adaptation. The 5 simple questions focus on body awareness and self-care with feminine pronouns ("vos misma"). The deep/philosophical ones center on feminine empowerment. These need rewording for El Templo's warrior/temple identity, or could be skipped entirely.

---

## 3. Challenges

**Total:** 36 challenges (all Level 3+)
**Source:** `arete-app/constants/challenges.ts`

### Brand: 'both' -- 24 universal challenges

4 per area across 6 areas: mente, cuerpo, coherencia, accion, vinculo, reflexion.
AURUM reward range: 50-100 per challenge. All minLevel: 3.

### Brand: 'arete' -- 12 Arete-specific challenges

2 per area. Mediterranean wellness focus, warm tone. AURUM reward range: 50-90. All minLevel: 3.
IDs: ARETE-01 through ARETE-12.

**Content shape:** Each challenge has `id`, `name`, `description`, `category`, `aurumReward`, `minLevel`, `brand?`.

**Brand distribution:**

- brand: 'both' -- 24 challenges
- brand: 'arete' -- 12 challenges

**Adaptation needed:**

- 'both' challenges: Stoic tone, ready for El Templo. Need AURUM->AURA reward mapping.
- 'arete' challenges: Require significant tone adaptation (feminine, wellness-focused). Could be replaced with El Templo-specific warrior challenges. Examples: "Ritual de cuidado corporal", "Camina descalza en naturaleza", "Cocina una receta mediterranea desde cero" -- these don't fit El Templo's temple/warrior brand.

---

## 4. Revelations

**Total:** 23 revelations (all Level 3+)
**Source:** `arete-app/constants/revelations.ts`

### Brand: 'both' -- 10 general revelations

Philosophical fragments, minLevel 3, isSpecial: false.
IDs: r01-r10. Stoic/warrior tone, contemplative.

### Brand: 'aurea' -- 3 special revelations

- r-eplk: Ethos/Pathos/Logos/Kairos (minLevel 4, special)
- r-alch: Alchemical Phases (minLevel 4, special) -- references app color scheme changes
- r-av: Aurea Virtus Naming (minLevel 5, special, hasBookCTA)

### Brand: 'arete' -- 10 revelations

- r-a01 through r-a08: 8 general (minLevel 3) -- feminine wellness tone
- r-a-elem: Arete Elements -- Tierra/Agua/Aire/Fuego (minLevel 4, special)
- r-a-name: Arete Naming (minLevel 5, special, hasBookCTA)

**Content shape:** Each revelation has `id`, `lines[]`, `minLevel`, `category`, `isSpecial`, `hasBookCTA?`, `brand?`.

**Brand distribution:**

- brand: 'both' -- 10 revelations
- brand: 'aurea' -- 3 revelations
- brand: 'arete' -- 10 revelations

**Adaptation needed:**

- 'both' general revelations (r01-r10): Ready to use. Strong stoic/warrior tone, perfect brand fit.
- 'aurea' specials: r-eplk (four forces) could adapt well. r-alch (alchemical phases) references Arete's color scheme mechanic -- needs UI redesign. r-av (naming) is Aurea Virtus-specific -- needs El Templo naming origin story.
- 'arete' revelations: Feminine Mediterranean wellness tone -- need complete rewrite for El Templo or skip.

---

## 5. Gamification Config

**Source:** `arete-app/constants/aurum.ts` and `arete-app/constants/gamification.ts`

### AURUM Economy (aurum.ts)

- **Earn rates:** habitComplete (2-3), dayClose (12), streak milestones (20-2500), challenge (50-100), diagnostic (10)
- **Spend costs:** streakFreeze (100), weekendAmulet (50), streakRepair (200), premiumMonth (500)
- **Ranks (Aurea):** Iniciado -> Adepto -> Alquimista -> Filosofo -> Maestro -> Archon -> Aureus (7 tiers, 0-50000 lifetime)
- **Ranks (Arete):** Semilla -> Raiz -> Flor -> Arbol -> Olivo -> Vina -> Jardin (7 tiers, same thresholds)
- **Level-up criteria:** Level 2 (7 days, 5 streak), Level 3 (21 days, 14 streak), Level 4 (45 days, 30 streak), Level 5 (90 days, 60 streak)

### Gamification (gamification.ts)

- **Quest definitions:** daily (close day), weekly (complete challenge, L3+), monthly (25 days, 500 AURUM reward)
- **Variable reward types:** aurum_boost, bonus_facto, special_journal, early_revelation
- **Variable reward probability:** 30%
- **Double AURUM duration:** 24 hours
- **AURUM boost range:** 10-25

**Adaptation needed:** Deferred to v5.0 AURA economy phase. El Templo uses AURA (not AURUM). Earn rates, spend costs, rank names, and thresholds will need redesign for El Templo's Alfa->Spartan level system. The quest/variable reward mechanics are sound architecture that can be ported directly.

---

## 6. Skipped Content

### Monthly Badges (badges.ts)

**Total:** 12 badges (1 per month)
**Source:** `arete-app/constants/badges.ts`

Greek deity-themed badges: Jano, Atenea, Ares, Afrodita, Hermes, Apolo, Zeus, Poseidon, Demeter, Artemisa, Hefesto, Hestia. Each has a Unicode symbol and stoic one-liner. Level 3+ users earn a badge for completing a full month.

**Why skipped:** El Templo will design its own badge system aligned with the temple/warrior brand. The Greek deity names overlap but the design aesthetic (coin-style) is Arete-specific.

### Level Naming System (levels.ts)

**Source:** `arete-app/constants/levels.ts`

Two naming systems:

- Aurea Virtus: Inicio, Base, Constancia, Profundidad, Dominio (5 levels)
- Arete: Tierra, Agua, Aire, Fuego (4 element names mapped to 5 levels)

Level config: totalHabits per level (8, 15, 27, 37, 39) and minDaily per level (5, 6, 7, 8, 8).

**Why skipped:** El Templo uses its own Alfa->Spartan level naming (decided in ecosystem architecture). The totalHabits/minDaily progression is useful reference for calibrating El Templo's difficulty curve.

---

## Summary

| Category      | Total | Brand: 'both' | Brand: 'arete' | Brand: 'aurea' | Adaptation |
| ------------- | ----- | ------------- | -------------- | -------------- | ---------- |
| Habits (L3+)  | 24    | 24            | 0              | 0              | Minimal    |
| Journal (L3+) | 16    | 11            | 5 (+5 L1)      | 0              | Moderate   |
| Challenges    | 36    | 24            | 12             | 0              | Moderate   |
| Revelations   | 23    | 10            | 10             | 3              | Heavy      |
| Gamification  | --    | --            | --             | --             | Redesign   |
| Badges        | 12    | 0             | 12             | 0              | Replace    |
| Level Names   | 5     | 0             | 5              | 5              | Replace    |
