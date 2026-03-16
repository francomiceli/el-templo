/**
 * WhatsApp Service
 *
 * Business logic for conversation and message management.
 * Used by admin routes for the chat panel in el-templo-admin.
 *
 * TODO: Implement each method. See modules/attendance/service.ts for patterns.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, desc, sql, like, or, and } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { NotFoundError, BadRequestError } from "../shared/errors";
import type {
  ConversationRecord,
  ConversationListParams,
  MessageRecord,
  SendMessageInput,
} from "./types";

export class WhatsAppService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  // ─── Conversation Queries ────────────────────────────────────────────────

  /**
   * List conversations with optional filters and pagination.
   *
   * TODO: Implement with:
   * - Filter by status, clientState
   * - Search by phone or contactName
   * - Include last message preview (subquery or join)
   * - Include message count
   * - Order by lastMessageAt DESC
   * - Paginate with page/limit
   */
  async listConversations(
    params: ConversationListParams,
  ): Promise<{ conversations: ConversationRecord[]; total: number }> {
    // TODO: Implement
    throw new Error("Not implemented");
  }

  /**
   * Get a single conversation with its messages.
   *
   * TODO: Implement with:
   * - Conversation record with linked member name
   * - Messages ordered by createdAt ASC (oldest first for chat display)
   * - Paginate messages (for loading older history)
   */
  async getConversation(
    id: number,
    messagePage: number,
    messageLimit: number,
  ): Promise<{
    conversation: ConversationRecord;
    messages: MessageRecord[];
    totalMessages: number;
  }> {
    // TODO: Implement
    throw new Error("Not implemented");
  }

  // ─── Admin Actions ───────────────────────────────────────────────────────

  /**
   * Admin sends a message in a conversation.
   *
   * TODO: Implement with:
   * - Verify conversation exists
   * - Insert message with direction 'outbound_human'
   * - Update conversation.lastMessageAt
   * - Call WhatsApp Cloud API to actually send the message
   *   (bot process handles this — API just writes to DB and the bot
   *    picks it up, OR API calls bot via localhost HTTP)
   */
  async sendMessage(
    conversationId: number,
    adminId: number,
    input: SendMessageInput,
  ): Promise<MessageRecord> {
    // TODO: Implement
    throw new Error("Not implemented");
  }

  /**
   * Human takeover — stop bot for this conversation.
   *
   * TODO: Implement with:
   * - Set conversation.status = 'human_takeover'
   * - Set conversation.assignedAdminId = adminId
   * - Update Redis bot state (or let bot poll DB status)
   */
  async takeover(
    conversationId: number,
    adminId: number,
  ): Promise<ConversationRecord> {
    // TODO: Implement
    throw new Error("Not implemented");
  }

  /**
   * Resume bot — hand conversation back to bot.
   *
   * TODO: Implement with:
   * - Set conversation.status = 'active'
   * - Clear conversation.assignedAdminId
   * - Update Redis bot state
   */
  async resumeBot(conversationId: number): Promise<ConversationRecord> {
    // TODO: Implement
    throw new Error("Not implemented");
  }
}
