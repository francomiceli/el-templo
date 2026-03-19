/**
 * WhatsApp Service
 *
 * Business logic for conversation and message management.
 * Used by admin routes for the chat panel in el-templo-admin.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, desc, asc, sql, like, or, and } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { NotFoundError, BadRequestError } from "../shared/errors";
import type {
  ConversationRecord,
  ConversationListParams,
  MessageRecord,
  SendMessageInput,
} from "./types";
import type { ConversationStatus, ClientState } from "./types";

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
  async listConversations(params: ConversationListParams): Promise<{
    conversations: ConversationRecord[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { status, clientState, search, page, limit } = params;
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [];

    if (status !== undefined) {
      conditions.push(eq(schema.whatsappConversations.status, status));
    }

    if (clientState !== undefined) {
      conditions.push(
        eq(schema.whatsappConversations.clientState, clientState),
      );
    }

    if (search !== undefined) {
      conditions.push(
        or(
          like(schema.whatsappConversations.phone, `%${search}%`),
          like(schema.whatsappConversations.contactName, `%${search}%`),
        )!,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count total
    const [countResult] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.whatsappConversations)
      .where(whereClause);

    const total = Number(countResult?.count ?? 0);

    // Subqueries for last message preview and message count
    const lastMessagePreview = sql<string>`(
      SELECT content FROM whatsapp_messages
      WHERE conversation_id = ${schema.whatsappConversations.id}
      ORDER BY created_at DESC LIMIT 1
    )`.as("last_message_preview");

    const messageCount = sql<number>`(
      SELECT COUNT(*) FROM whatsapp_messages
      WHERE conversation_id = ${schema.whatsappConversations.id}
    )`.as("message_count");

    const linkedMemberName =
      sql<string>`CONCAT_WS(' ', ${schema.users.firstName}, ${schema.users.lastName})`.as(
        "linked_member_name",
      );

    // Query conversations
    const rows = await this.db
      .select({
        id: schema.whatsappConversations.id,
        phone: schema.whatsappConversations.phone,
        contactName: schema.whatsappConversations.contactName,
        status: schema.whatsappConversations.status,
        clientState: schema.whatsappConversations.clientState,
        assignedAdminId: schema.whatsappConversations.assignedAdminId,
        linkedMemberId: schema.whatsappConversations.linkedMemberId,
        linkedMemberName,
        lastMessageAt: schema.whatsappConversations.lastMessageAt,
        lastMessagePreview,
        messageCount,
        createdAt: schema.whatsappConversations.createdAt,
        updatedAt: schema.whatsappConversations.updatedAt,
      })
      .from(schema.whatsappConversations)
      .leftJoin(
        schema.users,
        eq(schema.users.id, schema.whatsappConversations.linkedMemberId),
      )
      .where(whereClause)
      .orderBy(desc(schema.whatsappConversations.lastMessageAt))
      .limit(limit)
      .offset(offset);

    return {
      conversations: rows.map((r) => this.mapConversationRow(r)),
      total,
      page,
      limit,
    };
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
    const messageOffset = (messagePage - 1) * messageLimit;

    // Fetch conversation with linked member name
    const linkedMemberName =
      sql<string>`CONCAT_WS(' ', ${schema.users.firstName}, ${schema.users.lastName})`.as(
        "linked_member_name",
      );

    const messageCount = sql<number>`(
      SELECT COUNT(*) FROM whatsapp_messages
      WHERE conversation_id = ${schema.whatsappConversations.id}
    )`.as("message_count");

    const lastMessagePreview = sql<string>`(
      SELECT content FROM whatsapp_messages
      WHERE conversation_id = ${schema.whatsappConversations.id}
      ORDER BY created_at DESC LIMIT 1
    )`.as("last_message_preview");

    const [convRow] = await this.db
      .select({
        id: schema.whatsappConversations.id,
        phone: schema.whatsappConversations.phone,
        contactName: schema.whatsappConversations.contactName,
        status: schema.whatsappConversations.status,
        clientState: schema.whatsappConversations.clientState,
        assignedAdminId: schema.whatsappConversations.assignedAdminId,
        linkedMemberId: schema.whatsappConversations.linkedMemberId,
        linkedMemberName,
        lastMessageAt: schema.whatsappConversations.lastMessageAt,
        lastMessagePreview,
        messageCount,
        createdAt: schema.whatsappConversations.createdAt,
        updatedAt: schema.whatsappConversations.updatedAt,
      })
      .from(schema.whatsappConversations)
      .leftJoin(
        schema.users,
        eq(schema.users.id, schema.whatsappConversations.linkedMemberId),
      )
      .where(eq(schema.whatsappConversations.id, id));

    if (!convRow) {
      throw new NotFoundError("Conversacion no encontrada");
    }

    // Count total messages
    const [msgCountResult] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.whatsappMessages)
      .where(eq(schema.whatsappMessages.conversationId, id));

    const totalMessages = Number(msgCountResult?.count ?? 0);

    // Fetch paginated messages ordered ASC (oldest first for chat display)
    const messageRows = await this.db
      .select({
        id: schema.whatsappMessages.id,
        conversationId: schema.whatsappMessages.conversationId,
        direction: schema.whatsappMessages.direction,
        content: schema.whatsappMessages.content,
        messageType: schema.whatsappMessages.messageType,
        whatsappMessageId: schema.whatsappMessages.whatsappMessageId,
        metadata: schema.whatsappMessages.metadata,
        createdAt: schema.whatsappMessages.createdAt,
      })
      .from(schema.whatsappMessages)
      .where(eq(schema.whatsappMessages.conversationId, id))
      .orderBy(asc(schema.whatsappMessages.createdAt))
      .limit(messageLimit)
      .offset(messageOffset);

    return {
      conversation: this.mapConversationRow(convRow),
      messages: messageRows.map((m) => this.mapMessageRow(m)),
      totalMessages,
    };
  }

  // ─── Admin Actions ───────────────────────────────────────────────────────

  /**
   * Admin sends a message in a conversation.
   *
   * Inserts an outbound_human message, updates lastMessageAt,
   * and calls WhatsApp Cloud API to deliver it. If delivery fails,
   * the message is still saved in DB (logged error, not thrown).
   */
  async sendMessage(
    conversationId: number,
    _adminId: number,
    input: SendMessageInput,
  ): Promise<MessageRecord> {
    // Verify conversation exists
    const conversation = await this.fetchConversationRow(conversationId);

    // Insert message
    const now = new Date();
    const result = await this.db.insert(schema.whatsappMessages).values({
      conversationId,
      direction: "outbound_human",
      content: input.content,
      messageType: input.messageType ?? "text",
      createdAt: now,
    });

    const messageId = Number(result[0].insertId);

    // Update conversation lastMessageAt
    await this.db
      .update(schema.whatsappConversations)
      .set({ lastMessageAt: now, updatedAt: now })
      .where(eq(schema.whatsappConversations.id, conversationId));

    // Send via WhatsApp Cloud API (best-effort)
    const wamid = await this.sendWhatsAppMessage(
      conversation.phone,
      input.content,
    );

    // Update message with WhatsApp ID if delivery succeeded
    if (wamid) {
      await this.db
        .update(schema.whatsappMessages)
        .set({ whatsappMessageId: wamid })
        .where(eq(schema.whatsappMessages.id, messageId));
    }

    // Fetch and return the saved message
    const [messageRow] = await this.db
      .select({
        id: schema.whatsappMessages.id,
        conversationId: schema.whatsappMessages.conversationId,
        direction: schema.whatsappMessages.direction,
        content: schema.whatsappMessages.content,
        messageType: schema.whatsappMessages.messageType,
        whatsappMessageId: schema.whatsappMessages.whatsappMessageId,
        metadata: schema.whatsappMessages.metadata,
        createdAt: schema.whatsappMessages.createdAt,
      })
      .from(schema.whatsappMessages)
      .where(eq(schema.whatsappMessages.id, messageId));

    return this.mapMessageRow(messageRow);
  }

  /**
   * Human takeover -- stop bot for this conversation.
   *
   * Sets status to human_takeover and assigns the admin.
   * The bot already checks conversation status in handler.ts
   * and skips AI processing when status is human_takeover.
   */
  async takeover(
    conversationId: number,
    adminId: number,
  ): Promise<ConversationRecord> {
    const conversation = await this.fetchConversationRow(conversationId);

    if (conversation.status === "human_takeover") {
      throw new BadRequestError("Conversacion ya esta en modo humano");
    }

    const now = new Date();
    await this.db
      .update(schema.whatsappConversations)
      .set({
        status: "human_takeover",
        assignedAdminId: adminId,
        updatedAt: now,
      })
      .where(eq(schema.whatsappConversations.id, conversationId));

    return this.refetchConversation(conversationId);
  }

  /**
   * Resume bot -- hand conversation back to bot.
   *
   * Sets status to active and clears the assigned admin.
   */
  async resumeBot(conversationId: number): Promise<ConversationRecord> {
    const conversation = await this.fetchConversationRow(conversationId);

    if (conversation.status !== "human_takeover") {
      throw new BadRequestError("Conversacion no esta en modo humano");
    }

    const now = new Date();
    await this.db
      .update(schema.whatsappConversations)
      .set({
        status: "active",
        assignedAdminId: null,
        updatedAt: now,
      })
      .where(eq(schema.whatsappConversations.id, conversationId));

    return this.refetchConversation(conversationId);
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Fetch a raw conversation row by ID. Throws NotFoundError if missing.
   */
  private async fetchConversationRow(id: number) {
    const [row] = await this.db
      .select()
      .from(schema.whatsappConversations)
      .where(eq(schema.whatsappConversations.id, id));

    if (!row) {
      throw new NotFoundError("Conversacion no encontrada");
    }

    return row;
  }

  /**
   * Re-fetch a conversation with full ConversationRecord shape
   * (including linked member name, message count, last message preview).
   */
  private async refetchConversation(id: number): Promise<ConversationRecord> {
    const linkedMemberName =
      sql<string>`CONCAT_WS(' ', ${schema.users.firstName}, ${schema.users.lastName})`.as(
        "linked_member_name",
      );

    const messageCount = sql<number>`(
      SELECT COUNT(*) FROM whatsapp_messages
      WHERE conversation_id = ${schema.whatsappConversations.id}
    )`.as("message_count");

    const lastMessagePreview = sql<string>`(
      SELECT content FROM whatsapp_messages
      WHERE conversation_id = ${schema.whatsappConversations.id}
      ORDER BY created_at DESC LIMIT 1
    )`.as("last_message_preview");

    const [convRow] = await this.db
      .select({
        id: schema.whatsappConversations.id,
        phone: schema.whatsappConversations.phone,
        contactName: schema.whatsappConversations.contactName,
        status: schema.whatsappConversations.status,
        clientState: schema.whatsappConversations.clientState,
        assignedAdminId: schema.whatsappConversations.assignedAdminId,
        linkedMemberId: schema.whatsappConversations.linkedMemberId,
        linkedMemberName,
        lastMessageAt: schema.whatsappConversations.lastMessageAt,
        lastMessagePreview,
        messageCount,
        createdAt: schema.whatsappConversations.createdAt,
        updatedAt: schema.whatsappConversations.updatedAt,
      })
      .from(schema.whatsappConversations)
      .leftJoin(
        schema.users,
        eq(schema.users.id, schema.whatsappConversations.linkedMemberId),
      )
      .where(eq(schema.whatsappConversations.id, id));

    if (!convRow) {
      throw new NotFoundError("Conversacion no encontrada");
    }

    return this.mapConversationRow(convRow);
  }

  /**
   * Send a text message via WhatsApp Cloud API.
   * Returns the wamid on success, null on failure (best-effort delivery).
   */
  private async sendWhatsAppMessage(
    phone: string,
    text: string,
  ): Promise<string | null> {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;

    if (!token || !phoneId) {
      this.log.error(
        "Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_ID environment variables",
      );
      return null;
    }

    try {
      const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { body: text },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.log.error(
          { status: response.status, body: errorBody, phone },
          "WhatsApp API error sending admin message",
        );
        return null;
      }

      const data = (await response.json()) as {
        messages: Array<{ id: string }>;
      };
      const wamid = data.messages[0]?.id ?? null;

      if (wamid) {
        this.log.info({ phone, wamid }, "Admin message sent via WhatsApp");
      }

      return wamid;
    } catch (err: unknown) {
      this.log.error(
        { err: err instanceof Error ? err.message : String(err), phone },
        "Failed to send admin message via WhatsApp",
      );
      return null;
    }
  }

  /**
   * Map a raw conversation query row to ConversationRecord.
   */
  private mapConversationRow(row: {
    id: number;
    phone: string;
    contactName: string | null;
    status: string;
    clientState: string;
    assignedAdminId: number | null;
    linkedMemberId: number | null;
    linkedMemberName: string | null;
    lastMessageAt: Date | null;
    lastMessagePreview: string | null;
    messageCount: number;
    createdAt: Date;
    updatedAt: Date;
  }): ConversationRecord {
    return {
      id: row.id,
      phone: row.phone,
      contactName: row.contactName,
      status: row.status as ConversationStatus,
      clientState: row.clientState as ClientState,
      assignedAdminId: row.assignedAdminId,
      linkedMemberId: row.linkedMemberId,
      linkedMemberName: row.linkedMemberName || null,
      lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
      lastMessagePreview: row.lastMessagePreview,
      messageCount: Number(row.messageCount),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Map a raw message query row to MessageRecord.
   */
  private mapMessageRow(row: {
    id: number;
    conversationId: number;
    direction: string;
    content: string;
    messageType: string;
    whatsappMessageId: string | null;
    metadata: unknown;
    createdAt: Date;
  }): MessageRecord {
    return {
      id: row.id,
      conversationId: row.conversationId,
      direction: row.direction as MessageRecord["direction"],
      content: row.content,
      messageType: row.messageType as MessageRecord["messageType"],
      whatsappMessageId: row.whatsappMessageId,
      metadata: (row.metadata as Record<string, unknown>) ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
