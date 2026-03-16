/**
 * Customer Profile Memory (Redis, TTL: 90 days)
 *
 * Persistent profile that survives across conversations.
 * Injected into AI context on each message.
 *
 * TODO: Implement. See digital-initiatives/whatsapp-agent-renovafacil/customer_memory.py
 *
 * Stores data like:
 * - Member status (linked to DB if matched)
 * - Injury notes
 * - Class preferences
 * - Contact history summary
 * - Branch preference
 *
 * Updated when meaningful new info is learned.
 */

export {};

// TODO: export getProfile(phone: string): Promise<CustomerProfile | null>
// TODO: export setProfile(phone: string, profile: CustomerProfile): Promise<void>
// TODO: export interface CustomerProfile { ... }
