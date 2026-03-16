/**
 * Client State Machine
 *
 * Tracks the lifecycle of a WhatsApp contact:
 *   LEAD → TRIAL → ACTIVE_MEMBER → LAPSED → RETURNING
 *
 * TODO: Implement. See digital-initiatives/whatsapp-agent-renovafacil/client_state.py
 *
 * State transitions:
 * - LEAD: First contact, asking questions. Default for new conversations.
 * - TRIAL: Booked or attended a trial class (check bookings table).
 * - ACTIVE_MEMBER: Phone matches a user with active subscription.
 * - LAPSED: Phone matches a user with expired subscription.
 * - RETURNING: Was lapsed, now re-engaging (messaged after lapse).
 *
 * State is determined by:
 * 1. DB lookup: does this phone match a user? Check subscription status.
 * 2. Booking lookup: has this person booked a trial?
 * 3. Conversation history: was there a previous conversation?
 *
 * Stored in whatsapp_conversations.clientState (DB) for persistence.
 */

export type ClientState =
  | "lead"
  | "trial"
  | "active_member"
  | "lapsed"
  | "returning";

// TODO: export function determineClientState(phone: string, db: ...): Promise<ClientState>
// TODO: export function updateClientState(conversationId: number, newState: ClientState, db: ...): Promise<void>
