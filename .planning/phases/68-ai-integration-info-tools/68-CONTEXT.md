# Phase 68: AI Integration + Info Tools - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

AI-primary message processing for the WhatsApp bot. Every incoming message is processed by AI with El Templo business context. The bot can answer questions about schedules, memberships, locations, and escalate to humans. Model-agnostic provider supports OpenAI and Anthropic via env var. Action tools (booking, trial registration) and memory/state are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Bot personality & tone

- Spanish only — bot always responds in Spanish regardless of user's language
- Casual & friendly tone — uses tú, like texting a friend who works at the gym
- No named persona — bot speaks as "El Templo" itself ("En El Templo tenemos...")
- Light emoji usage — occasional emojis for warmth but not every message

### Response formatting

- Medium-length, structured responses — can be longer when needed (schedules, pricing) but uses formatting to stay scannable
- Use WhatsApp text formatting — _bold_ for emphasis, bullet lists for schedules/options
- When bot doesn't know something: admit + suggest alternatives ("No estoy seguro de eso. ¿Te puedo ayudar con horarios, membresías o ubicación?")
- Split long responses into 2-3 WhatsApp messages — more conversational feel

### Escalation behavior

- Escalates on explicit user request OR when sensitive topics are detected
- Sensitive topics that auto-escalate: complaints/unhappiness, injuries/medical concerns, billing/refunds, cancellations
- Handoff message includes confirmation + ETA: "Te conecto con alguien del equipo. Te van a escribir pronto"
- After escalation: bot goes completely silent until admin returns control — no confusion about who's talking

### Tool data presentation

- **Schedules:** Detailed with availability — show class name, emoji, day, time, and spots remaining (or "lleno" if full)
- **Location:** Address + Google Maps link — clean and actionable, no extra details
- **Membership/pricing:** Detailed breakdown per plan — price, what's included, class limits
- **Class list limit:** Show top 5 classes, then "hay X más" with offer to show more — keeps messages manageable

### Claude's Discretion

- Exact system prompt wording and structure
- AI provider interface design (OpenAI/Anthropic abstraction)
- Tool function signatures and internal implementation
- How to detect sensitive topics (keyword matching, AI classification, or hybrid)
- Message splitting logic (when to split, how to break content)

</decisions>

<specifics>
## Specific Ideas

- Bot should feel like messaging a helpful friend at the gym front desk, not a corporate chatbot
- When suggesting alternatives for unknown questions, list the 3 main capabilities: horarios, membresías, ubicación
- Schedule display should include spots remaining to create urgency and usefulness (like "3 lugares" or "lleno")
- Pricing should be complete enough that the user doesn't need to ask follow-up questions

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 68-ai-integration-info-tools_
_Context gathered: 2026-03-18_
