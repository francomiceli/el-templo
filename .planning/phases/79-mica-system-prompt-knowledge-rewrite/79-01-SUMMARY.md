---
phase: 79-mica-system-prompt-knowledge-rewrite
plan: 01
subsystem: ai
tags: [whatsapp-bot, system-prompt, knowledge-base, persona, sales]

# Dependency graph
requires:
  - phase: 74-whatsapp-bot-core
    provides: "Bot AI system with getSystemPrompt and getBusinessKnowledge"
provides:
  - "Mica persona system prompt with Argentine tuteo and state-adaptive behavior"
  - "Complete 12-section business knowledge base with sales, objections, retention"
affects: [79-02, bot-testing, whatsapp-bot-behavior]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      "WhatsApp-compatible formatting (no markdown headers)",
      "State-adaptive sales objectives",
      "12-section knowledge architecture",
    ]

key-files:
  created: []
  modified:
    - el-templo-bot/src/ai/knowledge.ts
    - el-templo-bot/src/ai/system-prompt.ts

key-decisions:
  - "Used WhatsApp *bold* formatting instead of markdown headers throughout knowledge and prompt"
  - "Mica persona based on real team member name from business conversations"
  - "State sections now include sales-specific objectives (not just tone adjustments)"

patterns-established:
  - "Knowledge sections use constant strings composed into single getBusinessKnowledge() return"
  - "System prompt uses WhatsApp formatting only - no ### headers"

requirements-completed:
  [
    MICA-01,
    MICA-02,
    MICA-03,
    KNOW-01,
    KNOW-02,
    KNOW-03,
    KNOW-04,
    KNOW-05,
    KNOW-06,
    KNOW-07,
  ]

# Metrics
duration: 16min
completed: 2026-03-27
---

# Phase 79 Plan 01: Mica System Prompt & Knowledge Rewrite Summary

**Mica persona with Argentine tuteo, 12-section knowledge base (pricing, sales techniques, objection handling, retention strategies, golden rules), and state-adaptive sales objectives for all 5 client states**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-27T16:20:35Z
- **Completed:** 2026-03-27T16:36:35Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Rewrote knowledge.ts with 12 complete sections including 5 new ones: Que es El Templo, Politicas, Tecnicas de Venta, Manejo de Objeciones, Estrategias de Retencion, and 12 Reglas de Oro
- Rewrote system-prompt.ts with Mica persona identity, Argentine tuteo tone, detailed tool usage rules, and sales-aware state-adaptive objectives
- All pricing, schedules, ROM, trial, app help data preserved from existing file
- Single class price ($20,000) and Mario Bravo/Mogotes note added

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite knowledge.ts with 12 business knowledge sections** - `fc72689e` (feat)
2. **Task 2: Rewrite system-prompt.ts with Mica persona and state-adaptive objectives** - `ad96936f` (feat)

## Files Created/Modified

- `el-templo-bot/src/ai/knowledge.ts` - Complete 12-section business knowledge with sales, objections, retention, golden rules
- `el-templo-bot/src/ai/system-prompt.ts` - Mica persona prompt with Argentine tuteo, tool rules, state-adaptive sales objectives

## Decisions Made

- Used WhatsApp _bold_ formatting throughout (no markdown ### headers) to match WhatsApp rendering
- Mica identity derived from real team member name "Micaela" seen in actual business conversations
- State sections now include explicit sales objectives per client state (lead -> trial conversion, trial -> membership, etc.)
- Exact escalation phrase specified: "Te paso con alguien del equipo, te escriben enseguida"

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Mica persona and knowledge base are ready for testing in Phase 79 Plan 02
- Both files compile without errors (pre-existing drizzle-orm dependency type issues unrelated)
- Export signatures unchanged, no breaking changes to consumers

---

_Phase: 79-mica-system-prompt-knowledge-rewrite_
_Completed: 2026-03-27_
