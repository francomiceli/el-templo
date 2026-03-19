# Phase 70: Action Tools - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can book classes and register for trial sessions entirely through WhatsApp conversation. Both actions call el-templo-api via localhost HTTP (no duplicated business logic). This phase adds `book_class` and `register_trial` AI tools with confirmation steps before executing.

</domain>

<decisions>
## Implementation Decisions

### Confirmation flow

- Summary + confirm pattern: bot shows class name, date, time, instructor in a formatted summary, then asks "Shall I book this for you?"
- Use WhatsApp interactive buttons for confirmation ("Confirm" / "Cancel") — no plain text parsing needed
- Cancel dismisses gracefully ("No problem, booking cancelled") with no timeout — pending confirmation stays in conversation context until user responds or changes topic
- After successful booking: confirmation message with full details (class, date, time, location) and friendly closing

### Class selection UX

- Natural language input — user says "book yoga tomorrow" and AI resolves which class they mean
- When multiple classes match: show matching options as WhatsApp interactive buttons, user picks one
- Booking window: current week only (Mon-Sun). For classes beyond this week, inform user to ask closer to that date
- Bot language matches user's language (Spanish primary)

### Error & edge cases

- Class full: inform user + suggest alternative sessions of the same class type or similar classes this week (as buttons)
- Already booked: friendly reminder they're already in ("You're already booked for X!") — don't treat as error
- API failure: apologize + suggest retrying in a moment. No technical details exposed to user
- Eligibility: only ACTIVE_MEMBER state can book classes. Non-members get directed to membership info or trial registration

### Trial registration flow

- Collect: name + class preference only (phone already known from WhatsApp). Minimal friction
- Combined flow: register as trial user AND book them into a specific class session in one conversation. User leaves with a concrete date/time
- Eligibility: LEAD state only. Expired/inactive members get directed to membership reactivation instead
- One trial per person. Second attempt gets reminded of prior trial + offered membership info

### Claude's Discretion

- Booking cutoff time (how close to class start is booking allowed)
- Exact message formatting and emoji usage
- How to handle edge cases not covered above (e.g., class cancelled, schedule changes)
- API retry logic (how many retries, backoff)
- How class type buttons are generated for trial flow (from schedule data vs hardcoded)

</decisions>

<specifics>
## Specific Ideas

- Confirmation summaries should feel clean and structured (formatted with emoji headers and dividers, like the mockups discussed)
- Interactive buttons preferred over text parsing wherever WhatsApp API supports them
- Bot should feel helpful, not robotic — "See you there!" after booking, "No problem!" on cancel
- Expired members trying trial should be warmly redirected, not blocked ("Hola de nuevo! Veo que ya fuiste miembro...")

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 70-action-tools_
_Context gathered: 2026-03-18_
