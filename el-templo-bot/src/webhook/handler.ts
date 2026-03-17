/**
 * Webhook Message Handler
 *
 * Processes inbound WhatsApp messages: find/create conversation,
 * deduplicate by wamid, save messages, and echo reply.
 *
 * Uses Drizzle's relational query API for reads and raw SQL for writes
 * to avoid type incompatibilities from separate drizzle-orm installations
 * between el-templo-bot and el-templo-api.
 */

import { sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import type * as schema from "../../../el-templo-api/src/db/schema/index.js";
import { sendTextMessage } from "../whatsapp/client.js";
import type { ParsedInboundMessage } from "../whatsapp/types.js";

type DB = MySql2Database<typeof schema>;

interface MysqlDuplicateError {
  code?: string;
  errno?: number;
}

function isDuplicateEntryError(err: unknown): boolean {
  const mysqlErr = err as MysqlDuplicateError;
  return mysqlErr.code === "ER_DUP_ENTRY" || mysqlErr.errno === 1062;
}

interface ConversationRow {
  id: number;
}

/**
 * Handle an inbound WhatsApp text message.
 *
 * 1. Find or create a conversation for the sender's phone number.
 * 2. Save the inbound message (with dedup on whatsapp_message_id).
 * 3. Send an echo reply and save the outbound message.
 */
export async function handleInboundMessage(
  db: DB,
  log: FastifyBaseLogger,
  message: ParsedInboundMessage,
): Promise<void> {
  // 1. Find or create conversation
  const existing = await db.execute<ConversationRow[]>(
    sql`SELECT id FROM whatsapp_conversations WHERE phone = ${message.phone} LIMIT 1`,
  );

  const rows = existing[0] as unknown as ConversationRow[];
  let conversationId: number;

  if (rows.length === 0) {
    const result = await db.execute(
      sql`INSERT INTO whatsapp_conversations (phone, contact_name, conversation_status, client_state, last_message_at, created_at, updated_at)
          VALUES (${message.phone}, ${message.contactName}, 'active', 'lead', NOW(), NOW(), NOW())`,
    );
    const insertResult = result[0] as unknown as { insertId: number };
    conversationId = insertResult.insertId;
    log.info(
      { conversationId, phone: message.phone },
      "Created new conversation",
    );
  } else {
    conversationId = rows[0].id;
    await db.execute(
      sql`UPDATE whatsapp_conversations
          SET last_message_at = NOW(), contact_name = ${message.contactName}, updated_at = NOW()
          WHERE id = ${conversationId}`,
    );
    log.info(
      { conversationId, phone: message.phone },
      "Updated existing conversation",
    );
  }

  // 2. Dedup check — insert inbound message
  try {
    await db.execute(
      sql`INSERT INTO whatsapp_messages (conversation_id, message_direction, content, wa_message_type, whatsapp_message_id, raw_payload, created_at)
          VALUES (${conversationId}, 'inbound', ${message.text}, 'text', ${message.whatsappMessageId}, ${JSON.stringify(message.rawPayload)}, NOW())`,
    );
  } catch (err: unknown) {
    if (isDuplicateEntryError(err)) {
      log.warn(
        { wamid: message.whatsappMessageId },
        "Duplicate message detected, skipping",
      );
      return;
    }
    throw err;
  }

  log.info(
    { conversationId, wamid: message.whatsappMessageId },
    "Saved inbound message",
  );

  // 3. Echo reply (best-effort)
  const replyText = "Echo: " + message.text;

  try {
    const sentWamid = await sendTextMessage(message.phone, replyText);

    await db.execute(
      sql`INSERT INTO whatsapp_messages (conversation_id, message_direction, content, wa_message_type, whatsapp_message_id, created_at)
          VALUES (${conversationId}, 'outbound_bot', ${replyText}, 'text', ${sentWamid}, NOW())`,
    );

    log.info({ conversationId, sentWamid }, "Echo reply sent and saved");
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error(
      { err: errorMessage, conversationId, phone: message.phone },
      "Failed to send echo reply",
    );
  }
}
