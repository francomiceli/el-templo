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
import type { AiProvider, ChatMessage } from "../ai/provider.js";
import { getSystemPrompt } from "../ai/system-prompt.js";
import { BOT_TOOLS, executeTool, resolvePendingAction } from "../ai/tools.js";
import {
  getProfile,
  updateProfile,
  buildProfileContext,
} from "../memory/profile.js";
import type { CustomerProfile } from "../memory/profile.js";
import {
  getPlaybookState,
  setPlaybookState,
} from "../memory/playbook-state.js";
import { getSession, updateSession } from "../memory/session.js";
import {
  advanceStageIfComplete,
  type AdvanceSignals,
} from "../playbooks/advance.js";
import { resolvePlaybook } from "../playbooks/resolver.js";
import type { PlaybookId, StageId } from "../playbooks/types.js";
import {
  determineClientState,
  updateConversationState,
} from "../state/machine.js";
import type { ClientState } from "../state/machine.js";
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

  let isNewConversation = false;

  if (rows.length === 0) {
    const result = await db.execute(
      sql`INSERT INTO whatsapp_conversations (phone, contact_name, conversation_status, client_state, last_message_at, created_at, updated_at)
          VALUES (${message.phone}, ${message.contactName}, 'active', 'lead', NOW(), NOW(), NOW())`,
    );
    const insertResult = result[0] as unknown as { insertId: number };
    conversationId = insertResult.insertId;
    conversationStatus = "active";
    isNewConversation = true;
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

  // Determine client state from DB and update conversation
  const { state: clientState, userId: matchedUserId } =
    await determineClientState(message.phone, db);
  await updateConversationState(conversationId, clientState, db);

  log.info(
    { conversationId, clientState, matchedUserId },
    "Client state determined",
  );

  // Link member if this is a new conversation and we found a matching user
  if (isNewConversation && matchedUserId) {
    await db.execute(
      sql`UPDATE whatsapp_conversations
          SET linked_member_id = ${matchedUserId}
          WHERE id = ${conversationId}`,
    );
    log.info(
      { conversationId, matchedUserId },
      "Linked conversation to member",
    );
  }

  // Load customer profile from Redis
  const profile = await getProfile(message.phone);

  // Interactive button reply dispatch -- handle confirm/cancel/schedule buttons
  // directly without going through AI processing
  if (message.interactiveReplyId) {
    const replyId = message.interactiveReplyId;

    // Confirmation buttons
    if (replyId === "confirm_booking" || replyId === "confirm_trial") {
      const pending = resolvePendingAction(message.phone);
      if (pending) {
        const result = await executeTool(
          pending.tool,
          pending.args,
          db,
          conversationId,
          { phone: message.phone, clientState },
        );
        if (result !== "[BUTTONS_SENT]") {
          await sendTextMessage(message.phone, result);
        }
        return;
      }
    }

    // Cancel buttons
    if (replyId === "cancel_booking" || replyId === "cancel_trial") {
      resolvePendingAction(message.phone); // Clear pending action
      await sendTextMessage(
        message.phone,
        "No hay problema, si cambias de idea aca estoy!",
      );
      return;
    }

    // Class selection buttons (schedule_XX_YYYY-MM-DD format from alternatives)
    if (replyId.startsWith("schedule_")) {
      const parts = replyId.split("_");
      const selectedScheduleId = parseInt(parts[1], 10);
      const selectedDate = parts.slice(2).join("_");
      // Re-invoke book_class with the selected schedule (unconfirmed, so it will show confirmation buttons)
      const result = await executeTool(
        "book_class",
        { scheduleId: selectedScheduleId, date: selectedDate },
        db,
        conversationId,
        { phone: message.phone, clientState },
      );
      if (result !== "[BUTTONS_SENT]") {
        await sendTextMessage(message.phone, result);
      }
      return;
    }
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
    await processWithAi(
      db,
      log,
      conversationId,
      message.phone,
      message.text,
      clientState,
      profile,
    );
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
 * build history from Redis session (primary) or MySQL (fallback),
 * call AI with tool loop, send split response, update session.
 */
async function processWithAi(
  db: DB,
  log: FastifyBaseLogger,
  conversationId: number,
  phone: string,
  inboundText: string,
  clientState: ClientState,
  currentProfile: CustomerProfile | null,
): Promise<void> {
  // Store inbound message in Redis session (before AI call so future lookups include it)
  await updateSession(phone, "user", inboundText);

  // Build message history -- Redis session is primary, MySQL is fallback
  const session = await getSession(phone);

  // ── Playbook engine (Phase 82) ─────────────────────────────────────────
  // Read prior state, run the pure resolver, persist BEFORE the AI call so
  // a crash mid-turn does not leave a hole in the engine state.
  const priorPbState = await getPlaybookState(phone);
  const resolved = resolvePlaybook(
    {
      clientState,
      cancellationIntent: detectCancellationIntent(inboundText),
    },
    priorPbState,
  );

  if (resolved.playbookId !== null && resolved.stageId !== null) {
    await setPlaybookState(phone, {
      activePlaybook: resolved.playbookId,
      currentStage: resolved.stageId,
      updatedAt: Date.now(),
    });
  }

  // Build state-adaptive system prompt with profile context
  const profileContext = currentProfile
    ? buildProfileContext(currentProfile)
    : undefined;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: getSystemPrompt({
        clientState,
        profileContext: profileContext || undefined,
        // Pass playbook fields through; plan 82-03 will consume them in
        // getSystemPrompt to inject the active playbook's promptSection.
        activePlaybook: resolved.playbookId ?? undefined,
        currentStage: resolved.stageId ?? undefined,
      }),
    },
  ];

  if (session && session.messages.length > 0) {
    // Primary: use Redis session context (includes the inbound we just added)
    log.info(
      { phone, sessionMessages: session.messages.length },
      "Using Redis session context for AI",
    );
    for (const msg of session.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }
  } else {
    // Fallback: load from MySQL (Redis unavailable or new session)
    log.info(
      { phone, conversationId },
      "Redis session unavailable, falling back to MySQL history",
    );
    const historyResult = await db.execute<MessageRow[]>(
      sql`SELECT content, message_direction
          FROM whatsapp_messages
          WHERE conversation_id = ${conversationId}
          ORDER BY created_at DESC
          LIMIT 20`,
    );
    const historyRows = (historyResult[0] as unknown as MessageRow[]).reverse();

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
  }

  // Call AI with tool loop
  const provider = createAiProvider();
  let response = await provider.chat(messages, BOT_TOOLS);
  let iterations = 0;
  let humanTakeoverTriggered = false;
  let lastToolResult = "";

  while (response.toolCalls.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    // Append assistant message with tool calls info to context
    const toolCallSummary = response.toolCalls
      .map((tc) => `[tool_call: ${tc.name}(${JSON.stringify(tc.arguments)})]`)
      .join("\n");
    messages.push({
      role: "assistant",
      content: response.content ?? toolCallSummary,
      toolCalls: response.toolCalls,
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
        { phone, clientState },
      );

      lastToolResult = toolResult;

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

    // If buttons were sent by the tool, don't call AI again -- the interactive message IS the reply
    if (lastToolResult === "[BUTTONS_SENT]") {
      log.info(
        { conversationId },
        "Interactive buttons sent by tool, suppressing AI text response",
      );
      return;
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

  // Post-process: strip markdown headers (defense-in-depth for QUAL-01)
  replyText = stripMarkdownHeaders(replyText);

  // Store assistant reply in Redis session
  await updateSession(phone, "assistant", replyText);

  // ── Playbook engine (Phase 82): post-AI stage advancement ──────────────
  // Compute coarse signals from the inbound + outbound text and decide
  // whether to advance the stage for the NEXT turn. Overwrites Redis only
  // if the helper returns a non-null next stage.
  if (resolved.playbookId !== null && resolved.stageId !== null) {
    const signals = computeAdvanceSignals(inboundText, replyText);
    const nextStage = advanceStageIfComplete(
      { playbookId: resolved.playbookId, stageId: resolved.stageId },
      signals,
    );
    if (nextStage !== null) {
      await setPlaybookState(phone, {
        activePlaybook: resolved.playbookId,
        currentStage: nextStage,
        updatedAt: Date.now(),
      });
    }
  }

  // Fire-and-forget profile extraction -- never blocks the main response
  extractAndUpdateProfile(
    provider,
    log,
    phone,
    inboundText,
    replyText,
    currentProfile,
    clientState,
  ).catch((err: unknown) => {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error(
      { err: errorMessage, phone },
      "Profile extraction outer error (should not happen)",
    );
  });

  // Split response into multiple messages for conversational feel
  const segments = splitMessage(replyText);

  // If human takeover was triggered, only send the first segment (handoff message)
  // and suppress any additional segments to avoid confusing the user after escalation.
  if (humanTakeoverTriggered) {
    const handoffSegment = segments[0];
    try {
      const sentWamid = await sendTextMessage(phone, handoffSegment);

      await db.execute(
        sql`INSERT INTO whatsapp_messages (conversation_id, message_direction, content, wa_message_type, whatsapp_message_id, created_at)
            VALUES (${conversationId}, 'outbound_bot', ${handoffSegment}, 'text', ${sentWamid}, NOW())`,
      );

      log.info(
        { conversationId, sentWamid, suppressedSegments: segments.length - 1 },
        "Handoff message sent, extra segments suppressed",
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error(
        { err: errorMessage, conversationId, phone },
        "Failed to send handoff message",
      );
    }
    return;
  }

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
 * Detect cancellation intent in an inbound user message.
 *
 * Narrow Spanish keyword regex covering the explicit phrases that should
 * route the conversation into PB5 (Cancelación). Plan 84 will expand this;
 * for v5.3 the resolver only needs a deterministic boolean and the false
 * positives of a broader detector would be more harmful than missed cases.
 */
function detectCancellationIntent(text: string): boolean {
  return /\b(cancelar|dar de baja|quiero irme|quiero salir|darme de baja)\b/i.test(
    text,
  );
}

/**
 * Compute coarse advancement signals from this turn's inbound + outbound text.
 *
 * v5.3 uses simple keyword/regex matching — phase 83 may upgrade to a
 * model-driven detector. Kept intentionally narrow to avoid false advances.
 */
function computeAdvanceSignals(
  inboundText: string,
  replyText: string,
): AdvanceSignals {
  const reply = replyText.toLowerCase();
  const inbound = inboundText.toLowerCase();

  // Mica asked a question this turn (any "?" in the reply) AND the user
  // sent a non-trivial reply. The combination is treated as "discovery turn
  // happened" for engine progression purposes.
  const discoveryAnswered = reply.includes("?") && inbound.trim().length > 0;

  // Mica proposed the trial in her last reply
  const trialProposed = /\b(prueba|probar|clase de prueba|gratis)\b/i.test(
    replyText,
  );

  // User explicitly accepted (Spanish affirmative phrases)
  const userAccepted =
    /\b(s[ií]|dale|anotame|anótame|anotame|me anoto|me sumo|listo|perfecto|genial)\b/i.test(
      inbound,
    );

  // User raised a price-shaped objection
  const priceObjection =
    /\b(caro|carisimo|car[ií]simo|precio|no me alcanza|no puedo pagar|muy caro|barato|descuento)\b/i.test(
      inbound,
    );

  return {
    discoveryAnswered,
    trialProposed,
    userAccepted,
    priceObjection,
  };
}

/**
 * Strip markdown headers (###, ##, #) from AI output.
 * WhatsApp doesn't render them — they look broken to users.
 * The system prompt instructs the AI not to use them, but this
 * is defense-in-depth for when the AI ignores the instruction.
 */
function stripMarkdownHeaders(text: string): string {
  // Replace lines starting with # (1-3 hashes) followed by space and text
  // with just the text in *bold* (WhatsApp formatting)
  return text.replace(/^#{1,3}\s+(.+)$/gm, "*$1*");
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

/**
 * Extract profile updates from a conversation exchange using a lightweight AI call.
 *
 * This is fire-and-forget: errors are logged but never propagated.
 * Malformed JSON from the AI is explicitly caught and logged.
 */
async function extractAndUpdateProfile(
  provider: AiProvider,
  log: FastifyBaseLogger,
  phone: string,
  userMessage: string,
  replyText: string,
  currentProfile: CustomerProfile | null,
  clientState: ClientState,
): Promise<void> {
  try {
    const extractionPrompt: ChatMessage[] = [
      {
        role: "system",
        content:
          "Sos un extractor de datos. Dado este intercambio, extraes datos nuevos del perfil del cliente en formato JSON. Solo responde con JSON valido o '{}' si no hay nada nuevo. Campos posibles: name (string), injuries (string[]), classPreferences (string[]), branchPreference (string), notes (string - observaciones breves).",
      },
      {
        role: "user",
        content: `Mensaje del usuario: ${userMessage}\nRespuesta del bot: ${replyText}\nPerfil actual: ${JSON.stringify(currentProfile)}`,
      },
    ];

    const extractionResponse = await provider.chat(extractionPrompt);
    const rawContent = extractionResponse.content ?? "{}";

    // Explicit inner try/catch for JSON.parse -- malformed AI output must not propagate
    let extracted: Record<string, unknown>;
    try {
      extracted = JSON.parse(rawContent) as Record<string, unknown>;
    } catch {
      log.warn(
        { phone, rawContent },
        "Profile extraction returned malformed JSON, skipping update",
      );
      return;
    }

    // Skip if empty extraction
    if (Object.keys(extracted).length === 0) {
      return;
    }

    // Merge into existing profile
    const merged: CustomerProfile = currentProfile
      ? { ...currentProfile }
      : { clientState, notes: "", updatedAt: Date.now() };

    if (typeof extracted.name === "string" && extracted.name.length > 0) {
      merged.name = extracted.name;
    }
    if (
      typeof extracted.branchPreference === "string" &&
      extracted.branchPreference.length > 0
    ) {
      merged.branchPreference = extracted.branchPreference;
    }
    if (Array.isArray(extracted.injuries) && extracted.injuries.length > 0) {
      merged.injuries = [
        ...new Set([
          ...(merged.injuries ?? []),
          ...(extracted.injuries as string[]),
        ]),
      ];
    }
    if (
      Array.isArray(extracted.classPreferences) &&
      extracted.classPreferences.length > 0
    ) {
      merged.classPreferences = [
        ...new Set([
          ...(merged.classPreferences ?? []),
          ...(extracted.classPreferences as string[]),
        ]),
      ];
    }
    if (typeof extracted.notes === "string" && extracted.notes.length > 0) {
      merged.notes = merged.notes
        ? `${merged.notes}\n${extracted.notes}`
        : extracted.notes;
    }

    // Ensure client state is current
    merged.clientState = clientState;

    await updateProfile(phone, merged);

    log.info(
      { phone, extractedFields: Object.keys(extracted) },
      "Profile updated from extraction",
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error(
      { err: errorMessage, phone },
      "Profile extraction failed (fire-and-forget)",
    );
  }
}
