---
gsd_state_version: 1.0
milestone: v5.1
milestone_name: Production Readiness & Business Data
status: executing
stopped_at: "Completed 76-01-PLAN.md"
last_updated: "2026-03-26T17:51:35Z"
last_activity: 2026-03-26 -- Completed phase 76 plan 01 (known issues fix)
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 2
  completed_plans: 2
  percent: 10
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-26)

**Core value:** Prospective and current members get instant, accurate answers about El Templo via WhatsApp — and can book classes and register for trials without human intervention.
**Current focus:** v5.1 Production Readiness & Business Data -- ready for phase planning

## Current Position

Milestone: v5.1 Production Readiness & Business Data
Phase: 76-known-issues-fix (1/1 plans complete)
Status: Phase 76 complete
Last activity: 2026-03-26 - Completed 76-01 (known issues fix)

**Progress:** [██████████] 98%

## Performance Metrics

**Velocity:**

- Total plans completed: 16 (v5.0)

**By Phase:**

| Phase        | Plans | Total   | Avg/Plan |
| ------------ | ----- | ------- | -------- |
| 67           | 2/2   | 12 min  | 6 min    |
| 68           | 3/3   | 14 min  | 5 min    |
| 69           | 2/2   | 16 min  | 8 min    |
| 70           | 2/2   | 8 min   | 4 min    |
| 71           | 2/2   | 7 min   | 4 min    |
| 72           | 2/2   | 7 min   | 4 min    |
| 73           | 2/2   | 22 min  | 11 min   |
| Phase 74 P01 | 2min  | 2 tasks | 2 files  |
| Phase 74 P02 | 2min  | 2 tasks | 2 files  |
| Phase 75 P01 | 3min  | 2 tasks | 4 files  |
| Phase 76 P01 | 2min  | 2 tasks | 6 files  |
| Phase 77 P02 | 2min  | 2 tasks | 2 files  |
| Phase 77 P01 | 2min  | 2 tasks | 2 files  |
| Phase 78 P01 | 4min  | 2 tasks | 3 files  |

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
- [73-02] Separate sending ref to avoid loading state conflicts between data fetching and message sending
- [73-02] 5-second polling interval for message updates (responsiveness vs API load balance)
- [73-02] Message input only visible in human_takeover mode to enforce takeover-first workflow
- [Phase 74]: Business data in separate knowledge.ts file (not inline in prompt) for maintainability
- [Phase 74]: Knowledge always present in base prompt (not conditional like state/profile sections)
- [74-02] Exported BRANCH_ADDRESSES and BRANCH_MAPS_LINKS from tools.ts for direct test import
- [74-02] normalizeBranchCode alias map for robust DB code matching (mario_bravo -> mario bravo)
- [74-02] Name-based fallback lookup when normalized branch code not found in address maps
- [Phase 75]: Manual migration file when drizzle-kit generate has interactive prompts
- [Phase 75]: Per-branch schedule config map keyed by branch code for explicit schedule differences
- [Phase 76]: No code changes for FIX-03 (phone normalization) -- already fixed in commit e542036e
- [Phase 77]: Organized secrets into three sections: new bot-specific, missing API, already configured
- [Phase 77]: Bot deploy follows identical CI/CD pattern as api/app/admin/web in GitHub Actions
- [Phase 78]: INSERT IGNORE for timezone migration idempotency (safe with existing mysql_tzinfo_to_sql data)
- [Phase 78]: Minimal timezone data (only Argentina/UTC) rather than full OS timezone dump

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
| 6   | Fix .gitignore for bot .env and planning quick docs                 | 2026-03-26 | 67025c0f | [6-fix-gitignore-for-bot-env-and-planning-q](./quick/6-fix-gitignore-for-bot-env-and-planning-q/) |

## Session Continuity

Last session: 2026-03-26
Stopped at: Completed 76-01-PLAN.md
Resume file: .planning/ROADMAP.md (v5.1 section)
