---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: WhatsApp AI Chatbot
status: executing
stopped_at: Completed 70-01-PLAN.md
last_updated: "2026-03-19T00:52:04.000Z"
last_activity: 2026-03-19 -- Completed Plan 01 of Phase 70
progress:
  total_phases: 7
  completed_phases: 2
  total_plans: 9
  completed_plans: 8
  percent: 47
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-17)

**Core value:** Prospective and current members get instant, accurate answers about El Templo via WhatsApp -- and can book classes and register for trials without human intervention.
**Current focus:** Phase 70 -- Action Tools

## Current Position

Phase: 70 of 73 (Action Tools)
Plan: 1 of 2
Status: Executing
Last activity: 2026-03-19 -- Completed Plan 01 of Phase 70

Progress: [▓▓▓▓▓░░░░░] 47%

## Performance Metrics

**Velocity:**

- Total plans completed: 8 (v5.0)

**By Phase:**

| Phase | Plans | Total  | Avg/Plan |
| ----- | ----- | ------ | -------- |
| 67    | 2/2   | 12 min | 6 min    |
| 68    | 3/3   | 14 min | 5 min    |
| 69    | 2/2   | 16 min | 8 min    |
| 70    | 1/2   | 3 min  | 3 min    |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Separate bot process for crash isolation (el-templo-bot alongside el-templo-api)
- WhatsApp Cloud API (official Meta) over Baileys
- AI-primary: every message goes to AI with function calling tools
- Model-agnostic AI abstraction (OpenAI GPT-4o mini or Anthropic Haiku)
- Redis for ephemeral state, MySQL for permanent records
- RenovaFacil (Python) as architecture pattern reference
- [67-01] Adjusted tsconfig rootDir to '..' for cross-project schema imports
- [67-01] Native fetch for WhatsApp API calls (Node 22 built-in)
- [67-01] MySQL pool exported from db.ts for graceful shutdown
- [67-02] Raw SQL via drizzle sql template literals to avoid cross-package type conflicts
- [67-02] Fire-and-forget POST handler with onMessageHandled callback for testability
- [68-01] Both providers use SDK-native error types for structured error handling
- [68-01] System prompt uses voseo/tuteo for casual Argentine Spanish tone
- [68-02] Hardcoded branch address map for Google Maps (pending DB address columns)
- [68-02] Max 5 tool loop iterations with fallback message
- [68-02] Message splitting at 800 chars on paragraph then line boundaries
- [68-02] Last 10 messages for AI conversation context
- [68-03] Bot unit tests in el-templo-bot/test/ with vitest (pure mocks, no DB)
- [68-03] Anthropic tool_use blocks reconstructed in provider mapMessages (provider-agnostic handler)
- [69-01] Redis session updated before AI call (inbound) and after response (assistant) for full continuity
- [69-01] Redis session primary context source, MySQL fallback (was primary)
- [69-01] MySQL fallback query limit updated from 10 to 20 messages to match session window
- [69-02] State machine returns {state, userId} tuple for conversation-member linking
- [69-02] Profile extraction fire-and-forget with explicit inner JSON.parse try/catch
- [69-02] Paused subscriptions map to inactive_member state
- [69-02] Notes cap truncates from beginning (oldest notes dropped first)
- [70-01] Placeholder email/password for bot-created trial users (DB requires notNull email+passwordHash)
- [70-01] Bot routes registered before JWT-guarded routes in app.ts for independent API key auth
- [70-01] Interactive replies set text to button title for seamless AI pipeline flow
- [70-01] Trial subscription uses pricePaid: 0, priceTypeApplied: 'zero' for free trials

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-03-19
Stopped at: Completed 70-01-PLAN.md
Resume file: .planning/phases/70-action-tools/70-01-SUMMARY.md
