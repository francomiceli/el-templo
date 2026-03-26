---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: WhatsApp AI Chatbot
status: executing
stopped_at: Completed 73-01-PLAN.md
last_updated: "2026-03-19T18:24:45.000Z"
last_activity: 2026-03-19 -- Completed Plan 01 of Phase 73
progress:
  total_phases: 7
  completed_phases: 5
  total_plans: 9
  completed_plans: 14
  percent: 87
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-17)

**Core value:** Prospective and current members get instant, accurate answers about El Templo via WhatsApp -- and can book classes and register for trials without human intervention.
**Current focus:** Phase 73 -- Admin Panel Human Takeover

## Current Position

Phase: 73 of 73 (Admin Panel Human Takeover)
Plan: 1 of 2
Status: Executing
Last activity: 2026-03-26 - Completed quick task 5: Audit env-related files in PR for security

Progress: [▓▓▓▓▓▓▓▓▓░] 87%

## Performance Metrics

**Velocity:**

- Total plans completed: 14 (v5.0)

**By Phase:**

| Phase | Plans | Total  | Avg/Plan |
| ----- | ----- | ------ | -------- |
| 67    | 2/2   | 12 min | 6 min    |
| 68    | 3/3   | 14 min | 5 min    |
| 69    | 2/2   | 16 min | 8 min    |
| 70    | 2/2   | 8 min  | 4 min    |
| 71    | 2/2   | 7 min  | 4 min    |
| 72    | 2/2   | 7 min  | 4 min    |
| 73    | 1/2   | 10 min | 10 min   |

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
- [70-02] Interactive button confirmation for bookings and trials (not text parsing) per user decision
- [70-02] pendingActions module-level Map keyed by phone for button reply state
- [70-02] [BUTTONS_SENT] marker returned by tools to suppress AI text response
- [70-02] Button replies dispatched directly in handler before AI processing
- [71-01] TemplateComponent type uses union 'body' | 'header' | 'button' for Meta API template components
- [71-01] Reminder hours configurable via CLASS_REMINDER_HOURS env var (default 2)
- [71-01] Reminder dedup via Redis key wa:reminder:class:{bookingId} with 24h TTL
- [71-02] Business hours check (10-20 Argentina) before lock acquisition to avoid unnecessary Redis calls
- [71-02] Trial detection via pricePaid=0 AND priceTypeApplied='zero' (per 70-01 convention)
- [71-02] NOT EXISTS subquery to exclude converted members (any subscription with pricePaid > 0)
- [71-02] Follow-up dedup via Redis key wa:followup:trial:{userId} with 7d TTL
- [72-01] ClientState enum updated to match DB schema: inactive_member/expired_member instead of lapsed/returning
- [72-01] listConversations returns page and limit in response for frontend pagination
- [72-01] SQL subqueries for lastMessagePreview and messageCount to avoid N+1
- [72-02] useWhatsappApi follows useMembersApi pattern with loading/error refs and cleanup method
- [72-02] Chat bubbles use CSS flexbox with direction-based alignment and color coding (grey/green/blue)
- [72-02] Active conversation count badge polls every 60s via setInterval in AdminLayout
- [73-01] Best-effort WhatsApp delivery: message saved to DB first, Cloud API failure logged but not thrown
- [73-01] Private sendWhatsAppMessage helper in API service (not reusing bot client.ts) for self-containment
- [73-01] Re-fetch conversation with full shape after mutations for consistent API responses

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

### Quick Tasks Completed

| #   | Description                                                         | Date       | Commit   | Directory                                                                                         |
| --- | ------------------------------------------------------------------- | ---------- | -------- | ------------------------------------------------------------------------------------------------- |
| 3   | Analyze env setup across monorepo and document recommended approach | 2026-03-26 | 2f1f09e2 | [3-analyze-env-setup-across-monorepo-and-do](./quick/3-analyze-env-setup-across-monorepo-and-do/) |
| 4   | Update ENV-ANALYSIS.md with GitHub Actions deployment details       | 2026-03-26 | 6621e263 | [4-update-env-analysis-with-github-actions-](./quick/4-update-env-analysis-with-github-actions-/) |
| 5   | Audit env-related files in PR for security                          | 2026-03-26 | 16c778de | [5-audit-env-related-files-in-pr-for-securi](./quick/5-audit-env-related-files-in-pr-for-securi/) |

## Session Continuity

Last session: 2026-03-26
Stopped at: Completed quick task 5
Resume file: .planning/phases/73-admin-panel-human-takeover/73-01-SUMMARY.md
