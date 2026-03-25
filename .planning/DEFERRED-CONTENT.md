# Deferred Content Inventory — Arete Web (Canonical Source)

**Source:** `arete-web/src/constants/` and `arete-web/src/features/`
**Updated:** 2026-03-08 — Replaced arete-app inventory with arete-web (canonical)
**Purpose:** Complete inventory of all Arete Web content for v5.0 lifestyle/AURA economy planning

> **Note:** This replaces the previous DEFERRED-CONTENT.md which was based on the deprecated arete-app. Arete-web has significantly expanded content: 20 levels (was 5), 60 challenges (was 36), 160 factos (was 80), and 7 entirely new systems.

---

## Content Extracted in Phase 46 (Starter Set — L1-2)

_These are extracted and adapted in `el-templo-api/src/modules/lifestyle/seed/`:_

- **Habits L1-2**: ~12-15 habits with full fields (verificationType, dataType, auraScaling, howTo, whyItMatters, tips)
- **Journal questions (simple tier)**: ~24 questions
- **Factos (curated)**: ~40-50 from 160, Greek philosophers focus
- **Areas**: 6 area definitions with Greek names and philosophy text
- **Philosophical tools**: 5 tool frameworks (Las 4 Pruebas, Mapa de Friccion, Tabla de Poder, Tabla del Estratega, Test de Virtud)

---

## Deferred Content by System

### 1. Habits — Higher Levels (L3-L5)

**Source:** `arete-web/src/constants/habits.ts` + `habit-details.ts`
**Count:** ~24 habits (of 39 total) at minLevel 3-5
**Fields per habit:** id, code, name, description, area, moment, minLevel, durationMinutes, verificationType (timer|honor), dataType (duration|boolean|count|pages), auraScaling (per-habit thresholds), imageAsset, linkedQuoteArea, facto, howTo, whyItMatters, tips[]

Notable L3+ habits:
- MEN-05 through MEN-08 (advanced Mente)
- CUE-05 through CUE-07 (advanced Cuerpo)
- COH-03 through COH-06 (advanced Coherencia)
- ACC-03 through ACC-06 (advanced Accion)
- VIN-03 through VIN-05 (advanced Vinculo)
- REF-04 through REF-07 (advanced Reflexion)

### 2. Seasonal Habits (NEW — not in arete-app)

**Source:** `arete-web/src/constants/seasonal-habits.ts`
**Count:** 12 habits (3 per season, Southern Hemisphere)
**MinLevel:** All L3+
**Codes:** SEA-V01 to SEA-V03 (verano), SEA-O01 to SEA-O03 (otono), SEA-I01 to SEA-I03 (invierno), SEA-P01 to SEA-P03 (primavera)
**Structure:** Same as core habits (timer/honor, auraScaling, area-linked)

### 3. Challenges

**Source:** `arete-web/src/constants/challenges.ts`
**Count:** 60 total (was 36 in arete-app)
**All minLevel 3+**

Breakdown:
- 24 universal challenges (4 per area, brand='both')
- 12 Arete-specific (2 per area, brand='arete', Mediterranean wellness tone)
- 8 multi-day (MULTI-01 to MULTI-08, 5-7 consecutive days, some L4)
- 8 area-combo (COMBO-01 to COMBO-08, cross-area, some L4-L5)
- 8 intensity (INTENS-01 to INTENS-08, double/triple effort, some L4)

Rewards: 50-100 AURA per challenge

### 4. Journal Questions — Higher Tiers

**Source:** `arete-web/src/constants/journal-questions.ts`
**Count:** 70 total (was 25 in arete-app)

Breakdown by tier:
- Simple (L1): 24 questions — **extracted in Phase 46**
- Deep (L3): 14 questions — **deferred**
- Philosophical (L5): 8 questions — **deferred**
- Arete-specific simple: 11 additional — partially extracted
- Arete-specific deep: 7 additional — **deferred**
- Arete-specific philosophical: 6 additional — **deferred**

Helper: `getDailyQuestions(level, date, brandId)` returns 1-2 deterministic questions/day

### 5. Factos — Remaining

**Source:** `arete-web/src/constants/factos.ts`
**Count:** 160 total (was 80 in arete-app, and ALL content rewritten for Greek-only philosophy)
**~110-120 not extracted** after Phase 46 curation

Content ranges:
- f01-f60: Greek philosophers, warriors, scientists (brand='both')
- f61-f80: Arete wellness traditions (brand='arete')
- f81-f100: Mediterranean wellness & neuroscience (brand='both')
- f101-f115: Greek philosophical concepts (brand='both')
- f116-f130: Modern psychology/neuroscience findings (brand='both')
- f131-f145: Historical warriors/leaders lessons (brand='both')
- f146-f160: Arete wellness traditions (brand='arete')

**CRITICAL:** All Roman stoic content (Marcus Aurelius, Seneca, Epictetus) has been removed from arete-web. Content is now exclusively Greek (Aristoteles, Platon, Socrates, Heraclito, Safo, Pitagoras, etc.).

### 6. Wisdom Quotes (NEW — not in arete-app)

**Source:** `arete-web/src/constants/wisdom-quotes.ts`
**Count:** ~149 quotes
**All Greek philosophers only** (Aristoteles, Platon, Socrates, Heraclito, Safo, Pitagoras, Democrito, Hesiodo, Tales, Diogenes, Hipocrates)

Distribution: ~14 quotes per area (mente, cuerpo, coherencia, accion, vinculo, reflexion) + 7 general
Each quote: id (wq-XXX), text, author, source, area, era
Helpers: getQuotesByArea(), getDailyQuote(deterministic), getRandomQuote()

Linked to habits via `linkedQuoteArea` and `facto` fields.

### 7. Achievements (NEW — not in arete-app)

**Source:** `arete-web/src/constants/achievements.ts`
**Count:** 25 achievements across 4 categories

- **Streak (7):** first_step (1d), week_sacred (7d), fortnight (14d), unstoppable (30d), iron_will (60d), centurion (100d), year_one (365d)
- **Ritual (7):** water_master, mind_master, full_day, all_areas, early_bird, night_owl, timer_master
- **Content (7):** philosopher (30 factos), writer (10 journal), challenger (5 challenges), deep_thinker (20 journal), level_5, level_10, level_20
- **Special (4):** lucky_day, big_spender (1000 aura), comeback (streak repair), consistent (25 days/month)

### 8. Levels & Progression (EXPANDED — 20 levels, was 5)

**Source:** `arete-web/src/constants/levels.ts`
**Count:** 20 levels across 4 tiers (was 5 in arete-app)

| Tier | Levels | minDaily | Level-Up Criteria Range |
|------|--------|----------|------------------------|
| Foundation | L1-L5 | 5-8 | 7-90 days, 5-60 streak |
| Growth | L6-L10 | 8-10 | 120-240 days, 60-100 streak |
| Mastery | L11-L15 | 10 | 270-365 days, 110-150 streak |
| Wisdom | L16-L20 | 10 | 400-600 days, 155-180 streak |

Level names: Tierra I/II → Agua I → Aire I → Fuego I → Tierra III → ... → Arete (L20)
All 39 habits available by L5. Content gating: challenges L3+, deep journal L3+, philosophical journal L5+, seasonal habits L3+, badges L3+.

### 9. AURA Economy (REDESIGNED — not flat rates anymore)

**Source:** `arete-web/src/constants/aura.ts`

Key changes from arete-app:
- **Per-habit AURA scaling** (timer-based thresholds, not flat 2-3): e.g., 5-min meditation = 3/5/8/12 AURA depending on duration
- **Daily cap: 80 AURA/day** (new, arete-app had no cap)
- **Honor cap: 8 AURA/day** from honor habits (new)
- **Honor earn: 1 AURA** per honor habit (was 2)
- **Day close bonus: 10 AURA** (was 12)
- **Streak milestones:** 7→20, 14→50, 21→(new), 30→200, 60→500, 90→1000, 108→2500
- **Challenge rewards:** 50-100 AURA

Spend costs: streak freeze (100), weekend amulet (50), streak repair (200), premium month (500)

7 Ranks (Semilla→Raiz→Brote→Arbol→Olivo→Vina→Jardin) at thresholds [0, 500, 2000, 5000, 10000, 25000, 50000]

### 10. Axis XP (NEW — not in arete-app)

**Source:** `arete-web/src/constants/axis-xp.ts`
**Purpose:** Per-area progression independent of global level

6 sub-levels per area: Neofito (0) → Discipulo (100) → Practicante (500) → Virtuoso (1500) → Maestro (4000) → Sabio (10000)

XP earn rates:
- Honor habit: 5 XP
- Timer (any): 10 XP
- Timer scaled: short 10, medium 15, long 20, extended 25
- Tummo: 20 XP

Level-up AURA bonuses: L1→10, L2→25, L3→50, L4→100, L5→250

### 11. Redemption Store (NEW — not in arete-app)

**Source:** `arete-web/src/constants/redemption.ts`
**Count:** 8 items (3 consumables + 5 rewards)

Consumables (streak protection):
- streak_freeze: 100 AURA, 4/month
- weekend_amulet: 50 AURA, 8/month
- streak_repair: 200 AURA, 2/month

Real-world rewards (generate display codes):
- event_ticket: 500 AURA, 2/month
- online_month: 800 AURA, 1/month
- gym_month: 2000 AURA, 1/month
- merch_kit: 1500 AURA, 1/month
- trimester_pass: 5000 AURA, 1/month

### 12. Tummo Breathing (NEW — not in arete-app)

**Source:** `arete-web/src/constants/tummo.ts`
**Purpose:** Dedicated breathing exercise protocol linked to habit CUE-04

Protocol: 3 rounds × 30 power breaths, 15s recovery hold
Timing: 1.5s inhale, 1.5s exhale per breath

AURA calculation: 0 rounds→0, 1→2, 2→5, 3→8 base (+2 if retention >4min, +4 if >6min, max 12)

### 13. Celebrations (NEW — not in arete-app)

**Source:** `arete-web/src/constants/celebrations.ts`

- Streak toast thresholds: [3, 5, 10]
- Confetti streaks: [7, 10, 14, 30, 60, 90, 108]
- Banner schedule: 18h (gentle), 20h (moderate), 22h (urgent)
- Mini-celebration copy: firstHabit, halfDone, minimumMet, perfectDay
- 10 celebratory messages for day summary (deterministic from date hash)

### 14. Leagues (NEW — not in arete-app)

**Source:** `arete-web/src/constants/leagues.ts`
**Count:** 5 leagues

Bronce (0+) → Plata (50+) → Oro (150+) → Laurel (300+) → Olimpo (500+)
Weekly AURA thresholds. Top/Bottom 5 promote/demote at week end.

### 15. Monthly Badges

**Source:** `arete-web/src/constants/badges.ts`
**Count:** 12 (1 per month, Greek deity themed)
**MinLevel:** L3+

Jano, Atenea, Ares, Afrodita, Hermes, Apolo, Zeus, Poseidon, Demeter, Artemisa, Hefesto, Hestia.
Minor text updates from arete-app version (e.g., "debilidad"→"sombras", "disciplina"→"constancia", "forja"→"oficio").

---

## Brand Rules (Updated for arete-web)

The old arete-app had dual brands (Aurea Virtus stoic/masc + Arete wellness/fem). Arete-web has **dropped this** — single brand, Greek-only philosophy.

**For El Templo adaptation:**
- Currency: AURUM → AURA (already decided)
- 'Arete' brand references → 'El Templo'
- Greek philosophy preserved as-is (aligns with temple identity)
- NO Roman stoics in source (Seneca, Marcus Aurelius, Epictetus removed from arete-web)
- Rioplatense Spanish preserved
- Level names: arete-web uses Tierra/Agua/Aire/Fuego tiers → El Templo may use Alfa→Spartan (TBD in v5.0)

---

## v5.0 Planning Notes

Arete-web's content is ~3x larger than what the original ecosystem discovery estimated from arete-app. Key implications:

1. **Lifestyle module is bigger** — 7 new systems not originally scoped (achievements, axis XP, wisdom quotes, seasonal habits, redemption, tummo, celebrations)
2. **AURA economy is more complex** — per-habit scaling tables, daily caps, honor caps replace flat earn rates
3. **20-level progression** needs more thoughtful implementation than 5 levels
4. **Content gating** is richer — L1 sees very little, L3 unlocks most, L5 unlocks everything
5. **El Templo level system (Alfa→Spartan)** needs mapping to arete-web's 20-level structure

---

_Source: arete-web/src/constants/ (Next.js PWA, canonical version)_
_Previous source (deprecated): arete-app/constants/ (React Native/Expo)_
