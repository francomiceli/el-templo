/**
 * Session Context Memory (Redis, TTL: 6 hours)
 *
 * Short-lived context from the current conversation.
 * Injected into AI context on each message.
 *
 * TODO: Implement. See digital-initiatives/whatsapp-agent-renovafacil/customer_memory.py
 *
 * Stores facts like:
 * - What the person asked about
 * - Their interests (which class, which branch)
 * - Objections or concerns raised
 * - Special needs (injuries, schedule constraints)
 *
 * Updated every few messages via AI extraction.
 */

export {};

// TODO: export getSessionContext(phone: string): Promise<SessionContext | null>
// TODO: export setSessionContext(phone: string, context: SessionContext): Promise<void>
// TODO: export interface SessionContext { ... }
