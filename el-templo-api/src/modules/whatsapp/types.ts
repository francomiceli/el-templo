/**
 * WhatsApp Module Types
 *
 * Interfaces for conversations, messages, and admin operations.
 */

// ─── Enum Union Types ────────────────────────────────────────────────────────

export type ConversationStatus = "active" | "human_takeover" | "closed";

export type ClientState =
  | "lead"
  | "trial"
  | "active_member"
  | "lapsed"
  | "returning";

export type MessageDirection = "inbound" | "outbound_bot" | "outbound_human";

export type MessageType = "text" | "image" | "audio" | "document" | "template";

// ─── Record Types ────────────────────────────────────────────────────────────

export interface ConversationRecord {
  id: number;
  phone: string;
  contactName: string | null;
  status: ConversationStatus;
  clientState: ClientState;
  assignedAdminId: number | null;
  linkedMemberId: number | null;
  linkedMemberName: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MessageRecord {
  id: number;
  conversationId: number;
  direction: MessageDirection;
  content: string;
  messageType: MessageType;
  whatsappMessageId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// ─── Query Params ────────────────────────────────────────────────────────────

export interface ConversationListParams {
  status?: ConversationStatus;
  clientState?: ClientState;
  search?: string;
  page: number;
  limit: number;
}

export interface SendMessageInput {
  content: string;
  messageType?: MessageType;
}
