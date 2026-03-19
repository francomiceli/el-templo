/**
 * WhatsApp types for admin panel.
 * Mirrors API types from el-templo-api/src/modules/whatsapp/types.ts.
 */

// ─── Enum Union Types ────────────────────────────────────────────────────────

export type ConversationStatus = 'active' | 'human_takeover' | 'closed';

export type ClientState = 'lead' | 'trial' | 'active_member' | 'inactive_member' | 'expired_member';

export type MessageDirection = 'inbound' | 'outbound_bot' | 'outbound_human';

export type MessageType = 'text' | 'image' | 'audio' | 'document' | 'template';

// ─── Record Types ────────────────────────────────────────────────────────────

export interface ConversationRecord {
  id: number;
  phone: string;
  contactName: string | null;
  status: ConversationStatus;
  clientState: ClientState;
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
