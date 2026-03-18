# Phase 69: Redis Memory Layer + Client State Machine - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Bot maintains conversation context across messages using Redis-backed session storage, persists customer profile data long-term, and automatically classifies clients into states based on database records. The AI adapts its behavior based on client state.

</domain>

<decisions>
## Implementation Decisions

### Session boundaries

- Sessions stay alive as long as messages keep coming; expire after **6 hours of inactivity** (per architecture doc)
- AI sees the **last 20 messages** within an active session
- When a session expires, the new session sees only the customer's **persistent profile** (no old messages, no session summaries)

### Profile memory

- Profiles store **structured facts** (name, injuries, preferred class types, membership plan, language) and **free-form notes** (AI-generated text summaries of key learnings)
- Storage: **Redis with long TTL** (e.g., 90 days). If evicted, rebuild from DB data on next interaction
- AI **auto-extracts** notable facts from conversations and updates the profile automatically after each exchange
- Profile notes are **capped at ~500 tokens**. When limit is reached, oldest/least relevant notes are summarized or dropped

### Client states & transitions

- Five states: **LEAD**, **ACTIVE_MEMBER**, **TRIAL**, **INACTIVE_MEMBER**, **EXPIRED_MEMBER**
- State determined by **DB lookup at session start** (check members table by phone number)
- EXPIRED_MEMBER = membership end date has passed
- INACTIVE_MEMBER = active membership but no check-ins in 30+ days
- LEAD = phone number not found in members table
- TRIAL and ACTIVE_MEMBER derived from membership status field
- Client state is injected into the **AI system prompt** so the bot adapts tone and focus per state (e.g., "This is an active member named Maria" vs "This is a new lead")

### Graceful degradation

- Redis unavailable: bot responds **without memory** (no session history, no profile). Each message treated independently
- **Silent degradation** — customer is not told about limited memory
- Redis failures logged via Pino and sent to **Sentry** for alerting
- On Redis recovery: **no rebuild** — next message starts a fresh session. Messages are already saved in MySQL for admin panel

### Claude's Discretion

- Redis key structure and naming conventions
- Exact profile extraction prompting strategy
- How to handle edge cases in state detection (e.g., multiple memberships)
- Session message serialization format in Redis

</decisions>

<specifics>
## Specific Ideas

- 6-hour session timeout comes from existing architecture document — maintain consistency
- Profile should feel lightweight: structured facts for tool context, free-form notes for AI personality context
- State-specific system prompts should be additive (base prompt + state-specific section), not completely separate prompts per state

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 69-redis-memory-layer-client-state-machine_
_Context gathered: 2026-03-18_
