# Phase 46: Lifestyle Content Extraction - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract a curated Level 1-2 starter set of lifestyle content from the Arete codebase, adapt it to El Templo's brand voice with light editing, and output as typed TypeScript seed files ready for v5.0 database seeding. Catalog all deferred content (Level 3-5) as a future inventory.

</domain>

<decisions>
## Implementation Decisions

### Content Scope — Starter Set (Level 1-2)

- **Habits:** ~15 habits (minLevel 1-2) with full details (howTo, whyItMatters, tips)
- **Journal questions:** ~14 simple-tier questions, including Arete-specific ones adapted to neutral voice
- **Factos:** ~40 curated from the 60 universal ones, prioritized by brand fit (stoic warriors: Marcus Aurelius, Seneca, Epictetus, Leonidas, Diogenes, Cato — Claude curates the best ~40)
- **Philosophical tool definitions:** Names, descriptions, and question frameworks for all 5 tools (no UI logic). Reference only.

### Content Scope — Excluded from Starter Set

- Challenges (36, all Level 3+) — deferred
- Revelations (23, all Level 3+) — deferred
- Monthly badges (12, Level 3+) — skipped entirely (El Templo will design its own)
- Gamification config (AURUM earn rates, ranks, quests, variable rewards) — deferred to v5.0 AURA economy
- Level naming (Arete's Tierra/Agua/Aire/Fuego) — skipped (El Templo uses Alfa→Spartan)

### Deferred Content Catalog

- Include a summary inventory of all deferred content: counts, content types, level requirements, Arete source file locations
- Raw Arete content (no adaptation) — just the inventory for v5.0's shopping list
- Catalog goes alongside seed files as a reference document

### Brand Consolidation

- El Templo unifies Arete's dual brands (Aurea Virtus stoic/masc + Arete wellness/fem) into one brand
- Respect the distinct voices — stoic stays stoic, contemplative stays contemplative. Don't flatten into one flat tone
- 6 life areas carry over as-is: Mente, Cuerpo, Coherencia, Accion, Vinculo, Reflexion
- Light edit: remove brand references, keep the tone

### Brand Term Mappings

- 'Arete' → 'El Templo'
- 'Aurea Virtus' → 'El Templo'
- 'AURUM' → 'AURA'
- Alchemical references (alquimia, alquímico, Nigredo/Albedo/etc.) → remove
- Gendered terms → neutral
- Level names (Iniciado, Adepto, Semilla, Raiz, etc.) → remove (El Templo levels TBD in v5.0)

### Adaptation Depth

- Light edit — remove brand references, keep original tone and style
- Claude adapts autonomously, user spot-checks final output
- Argentine Spanish (rioplatense) preserved — 'vos', informal conjugations, Mar del Plata authenticity
- Brand-specific journal questions reframed: 'feminine power' → 'inner strength', 'self-care' → 'recovery discipline'

### Output Format

- TypeScript typed arrays: `habits.seed.ts` exports `HabitSeed[]`, `factos.seed.ts` exports `FactoSeed[]`, etc.
- Location: `el-templo-api/src/modules/lifestyle/seed/`
- Data files only — no DB tables, no migrations, no seeding scripts. Tables created in v5.0 when the lifestyle module is built
- Each content type gets its own file
- Type interfaces defined alongside data (e.g., `HabitSeed`, `JournalQuestionSeed`, `FactoSeed`)

### Claude's Discretion

- Exact selection of ~40 factos from the 60 universal ones (curate by brand fit)
- Specific wording of adapted content (within the term mappings above)
- TypeScript type interface design for seed types
- File organization within the seed/ directory
- Deferred content catalog format and detail level

</decisions>

<specifics>
## Specific Ideas

- Respect voice diversity: stoic content stays stoic, contemplative stays contemplative — El Templo can have range within its brand
- "Start with what new members see first" — Level 1-2 is the foundation, expand later
- Philosophical tools: extract the frameworks (questions, criteria, dimensions) but not the interactive UI logic
- Factos should lean into stoic warriors and classical philosophy figures most aligned with El Templo's temple/warrior identity

</specifics>

<code_context>

## Existing Code Insights

### Source Content (Arete App)

- `arete-app/constants/habits.ts` — 39 habits with id, name, description, area, moment, minLevel, duration
- `arete-app/constants/habit-details.ts` — 39 habit detail records with howTo, whyItMatters, tips[]
- `arete-app/constants/journal-questions.ts` — 25 questions with id, text, minLevel, category, brand
- `arete-app/constants/challenges.ts` — 36 challenges with id, name, description, category, aurumReward, minLevel, brand
- `arete-app/constants/factos.ts` — 80 factos with id, text, source, figure, era, category, brand
- `arete-app/constants/revelations.ts` — 23 revelations with id, lines[], minLevel, category, isSpecial, brand
- `arete-app/features/tools/tools-index.tsx` — 5 philosophical tool definitions
- `arete-app/constants/badges.ts` — 12 monthly badges (skipped)
- `arete-app/constants/aurum.ts` — AURUM economy config (deferred)
- `arete-app/constants/gamification.ts` — Quests, variable rewards (deferred)
- `arete-app/constants/levels.ts` — Level definitions (skipped)

### Target Location

- `el-templo-api/src/modules/lifestyle/seed/` — new directory within the module structure established in Phase 45
- Module barrel export pattern: lifestyle/index.ts re-exports seed types

### Established Patterns

- Phase 45 formalized module boundaries with barrel exports (index.ts per module)
- TypeScript strict mode, no `any` types
- Module-prefix naming for new files (lifestyle-\*)

### Integration Points

- `el-templo-api/src/modules/` — new lifestyle module directory (seed data only, no routes/services yet)
- Future v5.0 phases will add routes, services, DB tables, and seed scripts that consume these data files

</code_context>

<deferred>
## Deferred Ideas

- Full content catalog extraction (Level 3-5): 24 habits, 36 challenges, 23 revelations — future lifestyle phases
- Gamification tuning (AURA amounts, rank thresholds, quests) — v5.0 AURA economy phase
- Badge/achievement system for El Templo — design from scratch, don't port Arete's Greek deity system
- Interactive philosophical tool UI/logic — v5.0 lifestyle module
- DB tables + seeding — v5.0 when lifestyle module is built and there's a consumer

</deferred>

---

_Phase: 46-lifestyle-content-extraction_
_Context gathered: 2026-03-08_
