# Phase 46: Lifestyle Content Extraction (REDO) - Context

**Gathered:** 2026-03-08
**Updated:** 2026-03-09
**Status:** Ready for planning
**Reason for redo:** Original extraction used deprecated arete-app as source. Arete-web (Next.js PWA) is now canonical with significantly expanded and rewritten content.

<domain>
## Phase Boundary

Extract a curated Level 1-2 starter set of lifestyle content from the **Arete Web** codebase (canonical source, replaces arete-app), adapt it to El Templo's brand voice, output as typed TypeScript seed files, and create a comprehensive deferred content inventory of all arete-web systems for v5.0 planning.

**This replaces** the previous Phase 46 extraction which used arete-app. The old seed files (habits.seed.ts, factos.seed.ts, journal-questions.seed.ts, tools.seed.ts) must be **fully replaced from scratch** — not updated incrementally.

</domain>

<decisions>
## Implementation Decisions

### Source Codebase

- **Arete Web** (`arete-web/src/constants/`) — NOT arete-app
- Arete-web is a Next.js 16 PWA with React 19, Zustand, Supabase
- Content is Greek-only philosophy (no Roman stoics — Marcus Aurelius, Seneca, Epictetus removed)
- Single brand (no more dual Aurea Virtus/Arete split)

### Content Scope — Starter Set (Level 1-2)

- **Habits:** L1-2 habits (~12-15) with FULL field set from arete-web:
  - Core fields: id, area, code, name, description, moment, minLevel, durationMinutes, howTo, whyItMatters, tips[]
  - New fields from arete-web: verificationType (timer|honor), dataType (duration|boolean|count|pages), auraScaling (per-habit thresholds or flat number), linkedQuoteArea, facto, imageAsset
  - CUE-04 is now "Respiracion Tummo" (L1) — NOT "Respiracion controlada" (L2) from old source
- **Journal questions:** All simple-tier from 'both' + 'arete' brands (~25 questions) — skip 'aurea' brand
- **Factos:** ~40-50 curated from ~140 eligible ('both' + 'arete' brands, skip 'aurea') — diverse across all 7 categories (filosofia, guerra, politica, ciencia, arte, deporte, bienestar), prioritize Greek/classical sources
- **Areas:** 6 area definitions with Greek names (Nous, Soma, Sophrosyne, Praxis, Philia, Theoria) and philosophy text
- **Philosophical tools:** 5 tool frameworks (same tools, but verify against arete-web source)

### Content Selection Criteria

- **Brand filter:** Include 'both' (universal) and 'arete' (Mediterranean wellness) branded content. Skip 'aurea' (old dual-brand voice, abandoned).
- **Level numbers:** Keep original minLevel numbers (1, 2, etc.) from arete-web as-is. Mapping to El Templo's Alfa→Spartan system happens in v5.0.
- **Facto curation bias:** Diverse spread across all 7 categories, not philosophy-heavy. Prioritize Greek/classical figures but include ciencia, deporte, bienestar for variety.
- **Journal questions:** All simple-tier questions from eligible brands (both + arete). No deep or philosophical tier (L3+).

### Habit Field Mapping

- **All arete-web fields preserved** including verificationType, dataType, auraScaling, linkedQuoteArea, facto, imageAsset
- **auraScaling:** Store as-is — threshold arrays for timer habits, flat number for honor habits (Claude handles type union)
- **facto/linkedQuoteArea:** Preserve wisdom quote links even though quotes themselves are deferred to v5.0. IDs will match when extracted later.
- **imageAsset:** Include Lucide icon name references per habit (e.g. 'Brain', 'Heart', 'Eye')

### Content Scope — Excluded from Starter Set

- Challenges (60 total, all Level 3+) — deferred
- Achievements (25, new system) — deferred
- Wisdom quotes (149) — deferred
- Seasonal habits (12, all L3+) — deferred
- Axis XP system — deferred
- AURA economy details (per-habit scaling, caps, ranks, leagues) — deferred
- Redemption store (8 items) — deferred
- Tummo breathing protocol — deferred
- Celebrations system — deferred
- Monthly badges (12, L3+) — deferred
- Level names (20-level Tierra/Agua/Aire/Fuego tiers) — skipped (El Templo uses Alfa→Spartan)
- Deep and philosophical journal questions (L3+) — deferred
- 'aurea' branded content — skipped (abandoned brand voice)

### Deferred Content Catalog

- DEFERRED-CONTENT.md already rewritten with full arete-web inventory (all 15 systems documented)
- Keep current version — no regeneration needed

### Old Plan Artifacts

- **Delete** old 46-01-PLAN.md, 46-02-PLAN.md and their SUMMARY files before replanning
- **Full replace** all existing seed files from scratch — do NOT use old arete-app data as starting point
- Old seed file structure (TypeScript types, file locations) is NOT reusable — types need new fields

### Brand Adaptation (Updated for arete-web)

- Arete-web already dropped dual brand — single brand, Greek-only philosophy
- Less adaptation needed than before: no Roman stoic references to remove (they're already gone)
- Still need: 'Arete' → 'El Templo', AURA references stay as AURA, rioplatense tone preserved
- 6 life areas carry over as-is: Mente, Cuerpo, Coherencia, Accion, Vinculo, Reflexion
- Greek philosophy text preserved — aligns well with El Templo's temple/classical identity

### Brand Term Mappings

- 'Arete' (brand name) → 'El Templo'
- 'AURA' → stays 'AURA' (already unified)
- Greek philosophical references → keep as-is (they fit El Templo's identity)
- Level names (Tierra/Agua/Aire/Fuego) → remove (El Templo levels TBD in v5.0)
- Gendered terms → neutral rioplatense

### Output Format

- TypeScript typed arrays: same pattern as Phase 45 (`as const satisfies readonly Type[]`)
- Location: `el-templo-api/src/modules/lifestyle/seed/` — **replace existing files**
- Types: New `HabitSeed` interface with all arete-web fields (verificationType, dataType, auraScaling, linkedQuoteArea, facto, imageAsset)
- NEW file: `areas.seed.ts` for area definitions
- Module barrel export: update `lifestyle/index.ts` with any new exports

### Claude's Discretion

- Exact selection of ~40-50 factos from ~140 eligible (curate by brand fit and category diversity)
- Specific wording of adapted content
- TypeScript type interface design for new fields (auraScaling union type, etc.)
- Whether to create areas.seed.ts as separate file or merge into existing
- Technical implementation of auraScaling storage (threshold arrays vs flat numbers)

</decisions>

<specifics>
## Specific Ideas

- Greek philosophy aligns perfectly with El Templo — keep it rich and authentic
- arete-web's habit verification types (timer vs honor) are essential for v5.0 implementation
- auraScaling per habit is a major architecture detail — capture it accurately in seed types
- Factos are completely rewritten from arete-app — do NOT reuse old curation, start fresh from arete-web's 160
- Areas with Greek names (Nous, Soma, etc.) add depth — include in seed data
- Include imageAsset (Lucide icon names) per habit for v5.0 UI

</specifics>

<code_context>

## Existing Code Insights

### Source Content (Arete Web — canonical)

- `arete-web/src/constants/habits.ts` — 39 habits with full fields (verificationType, dataType, auraScaling, linkedQuoteArea, facto, imageAsset)
- `arete-web/src/constants/habit-details.ts` — 39 detail records (howTo, whyItMatters, tips[])
- `arete-web/src/constants/areas.ts` — 6 area definitions with greekName, philosophyText, colorVar, icon, habitPrefix
- `arete-web/src/constants/journal-questions.ts` — 70 questions (simple/deep/philosophical × both/arete/aurea brands)
- `arete-web/src/constants/factos.ts` — 160 factos (Greek-only, 7 categories, brand field: both/arete/aurea)
- `arete-web/src/types/habits.ts` — Habit, Area, VerificationType, DataType, AuraScalingThreshold type definitions

### Deferred Source Content (documented in DEFERRED-CONTENT.md)

- `arete-web/src/constants/challenges.ts` — 60 challenges
- `arete-web/src/constants/achievements.ts` — 25 achievements
- `arete-web/src/constants/wisdom-quotes.ts` — ~149 quotes
- `arete-web/src/constants/seasonal-habits.ts` — 12 seasonal habits
- `arete-web/src/constants/axis-xp.ts` — Per-area XP system
- `arete-web/src/constants/aura.ts` — AURA economy
- `arete-web/src/constants/redemption.ts` — 8 store items
- `arete-web/src/constants/tummo.ts` — Breathing protocol
- `arete-web/src/constants/celebrations.ts` — Celebrations system
- `arete-web/src/constants/leagues.ts` — 5 leagues
- `arete-web/src/constants/badges.ts` — 12 monthly badges

### Target Location (full replace)

- `el-templo-api/src/modules/lifestyle/seed/habits.seed.ts` — REPLACE FROM SCRATCH
- `el-templo-api/src/modules/lifestyle/seed/factos.seed.ts` — REPLACE FROM SCRATCH
- `el-templo-api/src/modules/lifestyle/seed/journal-questions.seed.ts` — REPLACE FROM SCRATCH
- `el-templo-api/src/modules/lifestyle/seed/tools.seed.ts` — REPLACE FROM SCRATCH
- `el-templo-api/src/modules/lifestyle/seed/areas.seed.ts` — NEW
- `el-templo-api/src/modules/lifestyle/index.ts` — UPDATE barrel exports

### Established Patterns

- Phase 45 formalized module boundaries with barrel exports
- TypeScript strict mode, no `any` types
- `as const satisfies readonly Type[]` for compile-time validation
- Module-prefix naming for schema files (lifestyle/seed/ for data files)

</code_context>

<deferred>
## Deferred Ideas

- Full content extraction (L3-5): 24 habits, 12 seasonal, 60 challenges, 25 achievements, 149 wisdom quotes
- AURA economy implementation (per-habit scaling, caps, ranks, leagues, redemption store)
- Axis XP system (per-area progression tracking)
- Tummo breathing interactive UI/logic
- Celebrations/notification system
- Level progression (20 levels, 4 tiers)
- Monthly badge earning logic
- Deep + philosophical journal questions (L3+)
- DB tables + seeding — v5.0 when lifestyle module is built

</deferred>

---

_Phase: 46-lifestyle-content-extraction (REDO)_
_Context gathered: 2026-03-08_
_Context updated: 2026-03-09_
_Previous context: replaced (was based on deprecated arete-app)_
