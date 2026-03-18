/**
 * Webhook Message Handler
 *
 * Processes inbound WhatsApp messages: find/create conversation,
 * deduplicate by wamid, save messages, and generate AI-powered replies.
 *
 * Uses raw SQL via `sql` template literals to avoid type incompatibilities
 * from separate drizzle-orm installations between el-templo-bot and el-templo-api.
 */

import { sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import type * as schema from "../../../el-templo-api/src/db/schema/index.js";
import { createAiProvider } from "../ai/provider.js";
import type { ChatMessage } from "../ai/provider.js";
import { getSystemPrompt } from "../ai/system-prompt.js";
import { BOT_TOOLS, executeTool } from "../ai/tools.js";
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
  conversation_status: string;
}

interface MessageRow {
  content: string;
  message_direction: string;
}

const MAX_TOOL_ITERATIONS = 5;
const MAX_MESSAGE_LENGTH = 800;

const FALLBACK_MESSAGE =
  "Disculpa, no pude procesar tu consulta. Intenta de nuevo o escribi 'hablar con alguien' para que te ayude una persona.";

/**
 * Handle an inbound WhatsApp text message.
 *
 * 1. Find or create a conversation for the sender's phone number.
 * 2. Save the inbound message (with dedup on whatsapp_message_id).
 * 3. Check if conversation is in human_takeover -- if so, stay silent.
 * 4. Build message history, call AI with tool loop, send response.
 */
export async function handleInboundMessage(
  db: DB,
  log: FastifyBaseLogger,
  message: ParsedInboundMessage,
): Promise<void> {
  // 1. Find or create conversation
  const existing = await db.execute<ConversationRow[]>(
    sql`SELECT id, conversation_status FROM whatsapp_conversations WHERE phone = ${message.phone} LIMIT 1`,
  );

  const rows = existing[0] as unknown as ConversationRow[];
  let conversationId: number;
  let conversationStatus: string;

  if (rows.length === 0) {
    const result = await db.execute(
      sql`INSERT INTO whatsapp_conversations (phone, contact_name, conversation_status, client_state, last_message_at, created_at, updated_at)
          VALUES (${message.phone}, ${message.contactName}, 'active', 'lead', NOW(), NOW(), NOW())`,
    );
    const insertResult = result[0] as unknown as { insertId: number };
    conversationId = insertResult.insertId;
    conversationStatus = "active";
    log.info(
      { conversationId, phone: message.phone },
      "Created new conversation",
    );
  } else {
    conversationId = rows[0].id;
    conversationStatus = rows[0].conversation_status;
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

  // 2. Dedup check -- insert inbound message
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

  // 3. Human takeover check -- bot stays silent
  if (conversationStatus === "human_takeover") {
    log.info(
      { conversationId },
      "Conversation in human_takeover, bot staying silent",
    );
    return;
  }

  // 4. AI-powered reply (best-effort)
  try {
    await processWithAi(db, log, conversationId, message.phone);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error(
      { err: errorMessage, conversationId, phone: message.phone },
      "Failed to process message with AI",
    );
  }
}

/**
 * Process a message through the AI pipeline:
 * build history, call AI with tool loop, send split response.
 */
async function processWithAi(
  db: DB,
  log: FastifyBaseLogger,
  conversationId: number,
  phone: string,
): Promise<void> {
  // Build message history (last 10 messages for context)
  const historyResult = await db.execute<MessageRow[]>(
    sql`SELECT content, message_direction
        FROM whatsapp_messages
        WHERE conversation_id = ${conversationId}
        ORDER BY created_at DESC
        LIMIT 10`,
  );
  const historyRows = (historyResult[0] as unknown as MessageRow[]).reverse();

  const messages: ChatMessage[] = [
    { role: "system", content: getSystemPrompt() },
  ];

  for (const row of historyRows) {
    if (row.message_direction === "inbound") {
      messages.push({ role: "user", content: row.content });
    } else if (
      row.message_direction === "outbound_bot" ||
      row.message_direction === "outbound_human"
    ) {
      messages.push({ role: "assistant", content: row.content });
    }
  }

  // Call AI with tool loop
  const provider = createAiProvider();
  let response = await provider.chat(messages, BOT_TOOLS);
  let iterations = 0;
  let humanTakeoverTriggered = false;

  while (response.toolCalls.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    // Append assistant message with tool calls info to context
    const toolCallSummary = response.toolCalls
      .map((tc) => `[tool_call: ${tc.name}(${JSON.stringify(tc.arguments)})]`)
      .join("\n");
    messages.push({
      role: "assistant",
      content: response.content ?? toolCallSummary,
    });

    // Execute each tool call and append results
    for (const toolCall of response.toolCalls) {
      log.info(
        { tool: toolCall.name, args: toolCall.arguments, conversationId },
        "Executing tool call",
      );

      const toolResult = await executeTool(
        toolCall.name,
        toolCall.arguments,
        db,
        conversationId,
      );

      if (toolCall.name === "request_human") {
        humanTakeoverTriggered = true;
      }

      messages.push({
        role: "tool",
        content: toolResult,
        toolCallId: toolCall.id,
        name: toolCall.name,
      });
    }

    // Call AI again with tool results
    response = await provider.chat(messages, BOT_TOOLS);
  }

  // Determine final text
  let replyText: string;

  if (!response.content && response.toolCalls.length > 0) {
    // Max iterations reached without text response
    log.warn(
      { conversationId, iterations },
      "AI tool loop reached max iterations without text response",
    );
    replyText = FALLBACK_MESSAGE;
  } else {
    replyText = response.content ?? FALLBACK_MESSAGE;
  }

  // If human takeover was triggered, the AI should have already composed
  // a handoff message. Send it and stop.
  // Split response into multiple messages for conversational feel
  const segments = splitMessage(replyText);

  for (const segment of segments) {
    try {
      const sentWamid = await sendTextMessage(phone, segment);

      await db.execute(
        sql`INSERT INTO whatsapp_messages (conversation_id, message_direction, content, wa_message_type, whatsapp_message_id, created_at)
            VALUES (${conversationId}, 'outbound_bot', ${segment}, 'text', ${sentWamid}, NOW())`,
      );

      log.info(
        { conversationId, sentWamid },
        "AI reply segment sent and saved",
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error(
        { err: errorMessage, conversationId, phone },
        "Failed to send AI reply segment",
      );
    }
  }
}

/**
 * Split a long message into multiple segments for WhatsApp delivery.
 *
 * Strategy: split on double newlines first (paragraph breaks), then on
 * single newlines if segments are still too long. This preserves the
 * natural structure of AI responses.
 */
function splitMessage(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) {
    return [text];
  }

  // First pass: split on double newlines (paragraphs)
  const paragraphs = text.split(/\n\n+/);
  const segments: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > MAX_MESSAGE_LENGTH) {
      segments.push(current.trim());
      current = paragraph;
    } else {
      current = current ? current + "\n\n" + paragraph : paragraph;
    }
  }

  if (current.trim()) {
    segments.push(current.trim());
  }

  // Second pass: split any still-too-long segments on single newlines
  const finalSegments: string[] = [];

  for (const segment of segments) {
    if (segment.length <= MAX_MESSAGE_LENGTH) {
      finalSegments.push(segment);
      continue;
    }

    // Split on single newlines
    const lines = segment.split("\n");
    let chunk = "";

    for (const line of lines) {
      if (chunk && chunk.length + line.length + 1 > MAX_MESSAGE_LENGTH) {
        finalSegments.push(chunk.trim());
        chunk = line;
      } else {
        chunk = chunk ? chunk + "\n" + line : line;
      }
    }

    if (chunk.trim()) {
      finalSegments.push(chunk.trim());
    }
  }

  return finalSegments.length > 0 ? finalSegments : [text];
}
