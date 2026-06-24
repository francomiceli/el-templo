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
import OpenAI from "openai";
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
import { shouldDisclosePrices } from "../playbooks/constants.js";
import {
  getSession,
  updateSession,
  tryAcquireDebounce,
  releaseDebounce,
} from "../memory/session.js";
import {
  advanceStageIfComplete,
  type AdvanceSignals,
} from "../playbooks/advance.js";
import {
  extractProfileTag,
  stripProfileTag,
} from "../playbooks/profile-tag.js";
import { resolvePlaybook } from "../playbooks/resolver.js";
import type { AvatarProfile, PlaybookId, StageId } from "../playbooks/types.js";
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

/**
 * Determines whether a returning-conversation system note should be injected.
 * Returns true when MySQL history contains at least one assistant (outbound) message,
 * indicating this is a conversation that already had bot/human interaction.
 */
export function shouldInjectReturningNote(
  historyRows: { message_direction: string }[],
): boolean {
  return historyRows.some(
    (row) =>
      row.message_direction === "outbound_bot" ||
      row.message_direction === "outbound_human",
  );
}

const MAX_TOOL_ITERATIONS = 5;
const MAX_MESSAGE_LENGTH = 800;

/**
 * Phase 95 Plan 95-03 — DEGR-01 retry-counter escalation safety net.
 *
 * When `processWithAiInner`'s tool-loop accumulates 2 failing tool calls
 * (per the FAILURE_ALLOWLIST classifier below), the handler synthesizes:
 *   1. Pino `log.warn(..., 'DEGR-01 escalation triggered')`  per D-09.
 *   2. `sendTextMessage(phone, HANDOFF_ESCALATION_PHRASE)`   per D-05.
 *   3. `executeTool('request_human', { reason: 'auto_escalation_after_2_failures' }, ...)`
 *      per D-07 — synthetic invocation NOT triggered by the model.
 *   4. `humanTakeoverTriggered = true` + early `return` — preempts the
 *      post-loop `splitMessage(replyText) -> segments[0]` emission so the
 *      user sees EXACTLY ONE outbound message for that turn per D-08.
 *
 * The locked phrase is byte-exact per CONTEXT.md D-06 (handler-facing, NOT
 * model-facing — deliberately NOT in `system-prompt.ts` so Phase 96 owns
 * the `pb1-e1a-lead-rendered.snap.txt` regen on its own schedule).
 */
const HANDOFF_ESCALATION_PHRASE =
  "Te paso con alguien del equipo, te escriben enseguida 🙌";

/**
 * Static byte-exact return strings that count as a tool-call failure per
 * CONTEXT.md D-11. The dynamic 4th entry — the executeTool default-case
 * `Herramienta "${name}" no disponible.` at tools.ts:264 — is NOT placed
 * in this Set because the tool name is interpolated; it is classified by
 * the `startsWith`/`endsWith` discriminator inside `isFailureToolResult`.
 *
 * Entries are source-of-truth for the counter — adding a future allowlist
 * fail-string requires a one-line edit here AND a paired SC-C sub-test in
 * `el-templo-bot/test/v5-3-3-degr-01-escalation.test.ts`. Degraded-UX
 * strings (e.g., "Esa clase esta llena…" at tools.ts:803) are EXPLICITLY
 * out per D-11 boundary (degraded ≠ failed); SC-F empirically pins this.
 */
const FAILURE_ALLOWLIST: ReadonlySet<string> = new Set([
  // tools.ts:806 — bookClass catch-all fail return.
  "No pude completar la reserva. Intenta de nuevo en un momento.",
  // tools.ts:968 — registerTrial catch-all fail return.
  "No pude completar el registro. Intenta de nuevo en un momento.",
  // tools.ts:271 — executeTool ToolTimeoutError catch return (95-02 e213ee80).
  "Herramienta agotada por tiempo de espera.",
]);

/**
 * Single classifier for the (b) return-string branch of the DEGR-01 retry
 * counter. Returns true if the tool result is either a byte-exact match in
 * the static `FAILURE_ALLOWLIST` set OR a member of the dynamic
 * `Herramienta "${name}" no disponible.` family (tools.ts:264 default
 * case). The throw branch is handled separately inside the handler-side
 * try/catch wrapping `executeTool` in the tool loop.
 */
function isFailureToolResult(result: string): boolean {
  return (
    FAILURE_ALLOWLIST.has(result) ||
    (result.startsWith('Herramienta "') && result.endsWith('" no disponible.'))
  );
}

/** quick-16 fix 2: debounce delay to absorb consecutive messages. */
const DEBOUNCE_DELAY_MS = 3000;
/**
 * Safety-net TTL for the debounce lock if a handler crashes mid-turn.
 *
 * Phase 93 ↔ 94 ↔ 97 Cross-Phase Invariant:
 *   DEBOUNCE_TTL_SECONDS >= (OPENAI_TIMEOUT_MS/1000) * MAX_TOOL_ITERATIONS
 *                         + (executeTool_timeout * MAX_TOOL_ITERATIONS)
 *                         + safety_buffer
 *
 * Worst-case post-Phase-94+97: 45*5 + 30*5 + 20 = 395s → round up to 600s.
 * Lower values re-introduce BUG-01 as a side effect of fixing BUG-02
 * (a dead-man switch firing mid-handler-runtime allows parallel handlers).
 * Env-overridable for staging/test tuning; production default is 600.
 */
const DEBOUNCE_TTL_SECONDS = Number(process.env.DEBOUNCE_TTL_SECONDS ?? 600);

/**
 * quick-16 fix 3: friendly fallback when the user sends a non-text message
 * (audio, image, video, document, location, sticker, …). WhatsApp users
 * expect *some* reply; silently ignoring looks like the bot is broken.
 */
export function getNonTextFallback(messageType: string): string {
  switch (messageType) {
    case "audio":
      return "Escuché que me mandaste un audio, pero por ahora no puedo escucharlos. ¿Me lo podés escribir? 🙌";
    case "image":
      return "Recibí tu imagen, pero por ahora solo puedo responder a mensajes de texto. ¿Me contás por acá qué necesitás?";
    case "video":
      return "Recibí tu video, pero por ahora solo puedo responder a mensajes de texto. ¿Me contás por acá qué necesitás?";
    case "document":
      return "Recibí tu archivo, pero por ahora solo puedo responder a mensajes de texto. ¿Me escribís lo que necesitás?";
    case "location":
      return "Recibí tu ubicación, gracias 🙌 ¿Me contás qué necesitás saber?";
    default:
      return "Por ahora solo puedo leer mensajes de texto. ¿Me lo escribís por acá? 🙌";
  }
}

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

  // Non-text fallback (quick-16 fix 3). Respond with a friendly prompt
  // instead of silently ignoring audio/image/video/document/location.
  if (message.messageType !== "text") {
    const fallback = getNonTextFallback(message.messageType);
    try {
      const sentWamid = await sendTextMessage(message.phone, fallback);
      await db.execute(
        sql`INSERT INTO whatsapp_messages (conversation_id, message_direction, content, wa_message_type, whatsapp_message_id, raw_payload, created_at)
            VALUES (${conversationId}, 'inbound', ${message.text}, ${message.messageType}, ${message.whatsappMessageId}, ${JSON.stringify(message.rawPayload)}, NOW())`,
      );
      await db.execute(
        sql`INSERT INTO whatsapp_messages (conversation_id, message_direction, content, wa_message_type, whatsapp_message_id, created_at)
            VALUES (${conversationId}, 'outbound_bot', ${fallback}, 'text', ${sentWamid}, NOW())`,
      );
      await updateSession(message.phone, "user", message.text);
      await updateSession(message.phone, "assistant", fallback);
      log.info(
        { conversationId, messageType: message.messageType },
        "Sent non-text fallback",
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (isDuplicateEntryError(err)) {
        log.warn(
          { wamid: message.whatsappMessageId },
          "Duplicate non-text message detected, skipping",
        );
        return;
      }
      log.error(
        { err: errorMessage, conversationId, phone: message.phone },
        "Failed to send non-text fallback",
      );
    }
    return;
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
    // Phase 94 LAT-03: graceful fallback — surface a user-visible
    // message before returning instead of leaving the user staring at
    // an unanswered chat after a multi-minute upstream stall.
    // Inner try/catch ensures a failed send (WhatsApp 5xx, network
    // hiccup) does NOT crash handleInboundMessage. Worst case: the
    // user retries on their own; no cascading failure.
    try {
      await sendTextMessage(
        message.phone,
        "Tuve un problemita técnico, ¿me lo escribís de nuevo?",
      );
    } catch (sendErr: unknown) {
      const sendErrorMessage =
        sendErr instanceof Error ? sendErr.message : String(sendErr);
      log.error(
        { err: sendErrorMessage, conversationId, phone: message.phone },
        "Failed to send graceful fallback message",
      );
    }
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

  // ── Debounce (Phase 93 Branch 1 — atomic SETNX with token-aware release) ──
  // Atomic acquisition collapses the previous non-atomic get-then-set pair
  // (session.ts isDebounceActive + setDebounce) into a single SET NX PX
  // round-trip. Concurrent webhook invocations for the same phone now
  // serialize on Redis: exactly one acquires the token; all others get
  // null and bail. The in-flight handler picks up the bailed inbounds when
  // it re-reads the session after its 3s delay.
  const debounceKey = `wa:debounce:${phone}`;
  const debounceToken = await tryAcquireDebounce(
    debounceKey,
    DEBOUNCE_TTL_SECONDS,
  );
  if (debounceToken === null) {
    log.info({ phone }, "Debounce: in-flight handler exists, skipping AI call");
    return;
  }
  try {
    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_DELAY_MS));
    await processWithAiInner(
      db,
      log,
      conversationId,
      phone,
      inboundText,
      clientState,
      currentProfile,
    );
  } finally {
    await releaseDebounce(debounceKey, debounceToken);
  }
}

/**
 * Inner implementation of the AI pipeline. Extracted from `processWithAi`
 * so the outer function can wrap it in a Redis-backed debounce (quick-16
 * fix 2) without indenting the entire body.
 */
async function processWithAiInner(
  db: DB,
  log: FastifyBaseLogger,
  conversationId: number,
  phone: string,
  inboundText: string,
  clientState: ClientState,
  currentProfile: CustomerProfile | null,
): Promise<void> {
  // Phase 94 LAT-02: shared single-fire guard for the interim UX message
  // ("Dame un segundo 🙌") sent when provider.chat throws
  // OpenAI.APIError. The two provider.chat await sites below (outside +
  // inside the tool loop) both delegate to `sendInterimUx`, which flips
  // the guard so a follow-up tool-loop iteration's failure does not
  // re-send. Errors on the send itself are logged but NOT propagated —
  // a failed interim send must not block the main flow or shadow the
  // upstream OpenAI error.
  let interimSent = false;
  const sendInterimUx = async (): Promise<void> => {
    if (interimSent) return;
    interimSent = true;
    try {
      await sendTextMessage(phone, "Dame un segundo 🙌");
    } catch (sendErr: unknown) {
      const sendErrorMessage =
        sendErr instanceof Error ? sendErr.message : String(sendErr);
      log.error(
        { err: sendErrorMessage, phone, conversationId },
        "Failed to send interim UX message",
      );
    }
  };

  // Build message history -- Redis session is primary, MySQL is fallback.
  // Re-read AFTER the debounce delay so we pick up any messages that
  // arrived during the wait window.
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

  log.info(
    {
      phone,
      clientState,
      playbook: resolved.playbookId,
      stage: resolved.stageId,
      reusedFromSession: priorPbState !== null,
    },
    "Playbook resolved for incoming message",
  );

  // Avatar detected on a prior turn (if any). Read it once so the three
  // potential setPlaybookState writes below never clobber it with undefined.
  const priorAvatar: AvatarProfile | null = priorPbState?.avatar ?? null;

  // ── OBJN-01 (v5.3.2 Phase 91): soft-rejection arc state machine ────────
  //
  // Computed BEFORE the AI call so the rule selector can flow into
  // getSystemPrompt() — Mica's reply to a rejection turn must carry the
  // WHY/BACK-OFF framing rule (otherwise the model improvises "tomá tu
  // tiempo, saludos" and closes the conversation).
  //
  // In-scope set MUST mirror the allowlist in advance.ts (E1A/E1B/E2A/E2B/E3).
  // The signal is INERT outside that set — E4 honors REGLA FUERTE, E5–E7
  // are post-booking and "rejection" means something else.
  const inScopeForRejectionPre =
    resolved.stageId === "PB1.E1A" ||
    resolved.stageId === "PB1.E1B" ||
    resolved.stageId === "PB1.E2A" ||
    resolved.stageId === "PB1.E2B" ||
    resolved.stageId === "PB1.E3";
  const rejectionHotPre =
    inScopeForRejectionPre && detectSoftRejection(inboundText);
  const priorWhyAskedPre = priorPbState?.whyAsked ?? false;
  const softRejectionRule: "why" | "backoff" | undefined = rejectionHotPre
    ? priorWhyAskedPre
      ? "backoff"
      : "why"
    : undefined;
  // newWhyAsked: persist `true` while rejection arc is hot, reset to `false`
  // on any non-rejection turn (re-engagement clears the arc — a future
  // rejection re-opens with a fresh WHY question per CONTEXT.md semantics).
  const newWhyAsked = rejectionHotPre;

  // ── PRICE-01 (v5.3.3 Phase 99): price-insistence counter, computed pre-AI ─
  //
  // Reuses the single-source-of-truth `detectPriceObjection` helper (same
  // regex as computeAdvanceSignals' post-AI `signals.priceObjection`); no
  // parallel regex. The boolean is per-inbound, so the counter increments
  // AT MOST ONCE per inbound message even if the user spams multiple price
  // tokens in a single message (CONTEXT.md threat T-99-05 mitigation).
  //
  // Phase 93 concurrency: the SETNX / dead-man-switch handler-entry guard
  // ensures only one handler runs per phone at a time, so the
  // read-modify-write of priceInsistenceCount inherits handler concurrency
  // safety (CONTEXT.md threat T-99-07 mitigation — no new locking needed).
  //
  // Gated on `resolved.playbookId === "PB1"` so the counter is scoped
  // per-conversation per-PB1-session; transitions out of PB1 reset to 0
  // at the post-AI stage-advance write below.
  const priceObjectionPre = detectPriceObjection(inboundText.toLowerCase());
  const priorPriceInsistenceCount = priorPbState?.priceInsistenceCount ?? 0;
  const newPriceInsistenceCount =
    priceObjectionPre && resolved.playbookId === "PB1"
      ? priorPriceInsistenceCount + 1
      : priorPriceInsistenceCount;
  if (
    priceObjectionPre &&
    resolved.playbookId === "PB1" &&
    newPriceInsistenceCount !== priorPriceInsistenceCount
  ) {
    log.info(
      {
        event: "price_insistence_incremented",
        phone,
        stageId: resolved.stageId,
        priorCount: priorPriceInsistenceCount,
        newCount: newPriceInsistenceCount,
      },
      "price_insistence_incremented",
    );
  }

  // Telemetry — log.info (NOT log.warn). softRejection is expected behavior
  // we want to track statistically (rejection rates per stage, WHY→re-engage
  // conversion). Contrast: Phase 90's "discovery escape fired" uses warn
  // because that hatch is an anomalous escape from a stuck stage.
  // Logged BEFORE the pre-AI setPlaybookState write so the event is
  // observable even if the Redis write fails.
  if (rejectionHotPre) {
    log.info(
      {
        event: "soft_rejection_detected",
        stageId: resolved.stageId,
        phone,
        whyAsked: priorWhyAskedPre, // pre-mutation value per CONTEXT.md
        inboundExcerpt: inboundText.slice(0, 120),
      },
      "soft_rejection_detected",
    );
  }

  if (resolved.playbookId !== null && resolved.stageId !== null) {
    await setPlaybookState(phone, {
      activePlaybook: resolved.playbookId,
      currentStage: resolved.stageId,
      avatar: priorAvatar ?? undefined,
      // Preserve discoveryTurnCount across the pre-AI persistence write
      // so STAGE-02's counter survives a crash-between-writes.
      discoveryTurnCount: priorPbState?.discoveryTurnCount,
      // OBJN-01 (Phase 91): persist the arc flag pre-AI so it survives a
      // crash between AI call and post-AI write.
      whyAsked: newWhyAsked,
      // PRICE-01 (Phase 99): persist the counter pre-AI so it survives a
      // crash between AI call and post-AI write.
      priceInsistenceCount: newPriceInsistenceCount,
      updatedAt: Date.now(),
    });
  }

  // Build state-adaptive system prompt with profile context
  const profileContext = currentProfile
    ? buildProfileContext(currentProfile)
    : undefined;

  // PRICE-02 (v5.3.3 Phase 99): compute disclosure unlock flag using the
  // single-source-of-truth helper from playbooks/constants.ts. Defensive
  // PB1 gate at both layers — handler computes it conditional on
  // playbookId === "PB1" AND the prompt rebuilds the same check.
  const disclosureUnlocked =
    shouldDisclosePrices(newPriceInsistenceCount) &&
    resolved.playbookId === "PB1";

  const renderedSystemPrompt = getSystemPrompt({
    clientState,
    profileContext: profileContext || undefined,
    // Pass playbook fields through; plan 82-03 will consume them in
    // getSystemPrompt to inject the active playbook's promptSection.
    activePlaybook: resolved.playbookId ?? undefined,
    currentStage: resolved.stageId ?? undefined,
    // Phase 83-02: let Mica know the lead's avatar (if previously
    // detected) so she does NOT re-run PB1 discovery questions.
    currentAvatar: priorAvatar,
    // OBJN-01 (v5.3.2 Phase 91): conditional WHY/BACK-OFF framing rule.
    // No-op until Task 2 wires the actual injection inside getSystemPrompt.
    softRejectionRule,
    // PRICE-02 (v5.3.3 Phase 99): disclosure-unlocked addendum trigger.
    disclosureUnlocked,
  });

  // Diagnostic: confirm playbook bytes actually land in the rendered prompt.
  log.info(
    {
      phone,
      activePlaybook: resolved.playbookId,
      activeStage: resolved.stageId,
      promptLength: renderedSystemPrompt.length,
      containsPlaybookHeader:
        renderedSystemPrompt.includes("*Playbook activo:"),
      containsReglaFuerte: renderedSystemPrompt.includes("REGLA FUERTE"),
      // PRICE-02 (Phase 99): observability for the disclosure-unlock injection
      // (handler-side flag + prompt-side gate; addendum present iff true).
      disclosureUnlocked,
      priceInsistenceCount: newPriceInsistenceCount,
    },
    "System prompt rendered for AI call",
  );

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: renderedSystemPrompt,
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

    // Returning-conversation guard: if MySQL history shows prior bot/human
    // interaction, inject a system note so Mica doesn't re-introduce herself.
    if (shouldInjectReturningNote(historyRows)) {
      messages.push({
        role: "system",
        content:
          "[Sistema: esta es una conversación existente que se reanuda después de una pausa. NO te presentes de nuevo — el lead ya sabe quién sos. Continuá la conversación desde donde quedó, respondiendo directamente a lo que el usuario acaba de decir.]",
      });
    }
  }

  // Call AI with tool loop
  const provider = createAiProvider();
  // Phase 94 LAT-02: wrap the initial provider.chat so an upstream
  // OpenAI.APIError (including APIConnectionTimeoutError raised when
  // the SDK timeout expires) triggers the interim UX message before the
  // error propagates to the outer try/catch (which then dispatches the
  // LAT-03 graceful fallback).
  let response: Awaited<ReturnType<typeof provider.chat>>;
  try {
    response = await provider.chat(messages, BOT_TOOLS);
  } catch (err: unknown) {
    if (err instanceof OpenAI.APIError) {
      await sendInterimUx();
    }
    throw err;
  }
  let iterations = 0;
  let humanTakeoverTriggered = false;
  // Phase 95 Plan 95-03 — DEGR-01 retry counter (per CONTEXT.md D-10).
  // Local-scoped to processWithAiInner: each new inbound creates a fresh
  // closure; no Redis state, no cross-inbound persistence, no module-level
  // declaration. failedToolCalls increments on EVERY failing tool call in
  // the loop (D-12: successful tool calls do NOT reset). When the counter
  // reaches 2 the threshold-check block synthesizes the escalation flow
  // (HANDOFF_ESCALATION_PHRASE + request_human + early return) per D-13.
  // lastToolName / lastToolError capture the most recent failure for the
  // D-09 Pino observability shape.
  let failedToolCalls = 0;
  let lastToolName = "";
  let lastToolError = "";
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

      // Phase 95 Plan 95-03 — DEGR-01 (a) THROW branch increment.
      // Wrap executeTool() so an uncaught throw still increments the
      // failure counter before re-throwing. The 95-02-shipped catch
      // inside executeTool already converts ToolTimeoutError to the
      // allowlist return string (see tools.ts:266-273), so this branch
      // fires only for OTHER error types (per CONTEXT.md D-11(a)). The
      // re-throw preserves the existing error-propagation semantics —
      // the outer processWithAi → handleInboundMessage try/catch
      // (handler.ts:345-369) still surfaces the LAT-03 graceful fallback.
      let toolResult: string;
      try {
        toolResult = await executeTool(
          toolCall.name,
          toolCall.arguments,
          db,
          conversationId,
          { phone, clientState },
        );
      } catch (err: unknown) {
        failedToolCalls++;
        lastToolName = toolCall.name;
        lastToolError = err instanceof Error ? err.message : String(err);
        throw err;
      }

      lastToolResult = toolResult;

      // Phase 95 Plan 95-03 — DEGR-01 (b) RETURN-STRING branch increment.
      // Classify the tool result via FAILURE_ALLOWLIST + dynamic
      // `Herramienta "X" no disponible.` discriminator (per CONTEXT.md
      // D-11). Successful tool results do NOT reset the counter — D-12.
      if (isFailureToolResult(toolResult)) {
        failedToolCalls++;
        lastToolName = toolCall.name;
        lastToolError = toolResult;
      }

      if (toolCall.name === "request_human") {
        humanTakeoverTriggered = true;
      }

      messages.push({
        role: "tool",
        content: toolResult,
        toolCallId: toolCall.id,
        name: toolCall.name,
      });

      // Phase 95 Plan 95-03 — DEGR-01 (c) THRESHOLD CHECK.
      // When the per-handler-invocation counter reaches 2 (per CONTEXT.md
      // D-13 — no fuzzy thresholds, no hysteresis), synthesize the
      // handoff flow and exit processWithAiInner via early return so the
      // user sees EXACTLY ONE outbound message for this turn (D-08).
      // The existing model-emitted-`request_human` path at line 761-763 +
      // 996-1018 is preserved unchanged for the case where the model
      // itself emits request_human in a non-failure scenario.
      if (failedToolCalls >= 2) {
        log.warn(
          {
            phone,
            conversationId,
            failureCount: failedToolCalls,
            lastToolName,
            lastToolError,
          },
          "DEGR-01 escalation triggered",
        );
        await sendTextMessage(phone, HANDOFF_ESCALATION_PHRASE);
        await executeTool(
          "request_human",
          { reason: "auto_escalation_after_2_failures" },
          db,
          conversationId,
          { phone, clientState },
        );
        humanTakeoverTriggered = true;
        return;
      }
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
    // Phase 94 LAT-02: same wrap-with-interim-UX shape as the initial
    // provider.chat above. `sendInterimUx` is idempotent (single-fire
    // guard), so iteration N+1's failure does NOT re-send the interim
    // message — the user sees exactly one "Dame un segundo" per inbound.
    try {
      response = await provider.chat(messages, BOT_TOOLS);
    } catch (err: unknown) {
      if (err instanceof OpenAI.APIError) {
        await sendInterimUx();
      }
      throw err;
    }
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
  // Post-process: convert `**bold**` → `*bold*` (quick-16 fix 1)
  replyText = normalizeWhatsAppFormatting(replyText);

  // ── Phase 83-02: profile tag extraction + strip ────────────────────────
  // Detect the `<profile>VALUE</profile>` tag Mica may have emitted during
  // PB1 discovery and remove it from the outbound text. Runs BEFORE
  // updateSession (so session history stores the clean text) and BEFORE
  // sendTextMessage (so the user never sees the tag).
  const detectedAvatar = extractProfileTag(replyText);
  replyText = stripProfileTag(replyText);

  // Persist the avatar alongside the playbook state when a NEW, different
  // avatar was detected. Guarded on an active playbook + stage so the
  // Redis write shape stays consistent. Avoids a redundant write when the
  // model re-emits the same tag on subsequent turns.
  if (
    detectedAvatar !== null &&
    resolved.playbookId !== null &&
    resolved.stageId !== null &&
    detectedAvatar !== priorAvatar
  ) {
    await setPlaybookState(phone, {
      activePlaybook: resolved.playbookId,
      currentStage: resolved.stageId,
      avatar: detectedAvatar,
      // Preserve discoveryTurnCount through avatar-only writes.
      discoveryTurnCount: priorPbState?.discoveryTurnCount,
      // OBJN-01 (Phase 91): preserve the arc flag — use the pre-AI value
      // since rejection state can't change between pre-AI and post-AI
      // within a single inbound turn.
      whyAsked: newWhyAsked,
      // PRICE-01 (Phase 99): preserve the counter through avatar-only
      // writes — avatar detection doesn't change PB1 membership in a
      // single turn, so we keep the pre-AI value (discoveryTurnCount and
      // whyAsked precedent).
      priceInsistenceCount: newPriceInsistenceCount,
      updatedAt: Date.now(),
    });
    log.info(
      { phone, detectedAvatar },
      "Profile avatar detected and persisted",
    );
  }

  // Store assistant reply in Redis session
  await updateSession(phone, "assistant", replyText);

  // ── Playbook engine (Phase 82): post-AI stage advancement ──────────────
  // Compute coarse signals from the inbound + outbound text and decide
  // whether to advance the stage for the NEXT turn. Overwrites Redis only
  // if the helper returns a non-null next stage.
  if (resolved.playbookId !== null && resolved.stageId !== null) {
    // STAGE-02 (v5.3.2 Phase 90): track substantive user turns inside
    // PB1.E1A/E1B. Increment only while the stage is E1A or E1B and the
    // current inbound is a substantive user turn (same definition as the
    // pieces of `discoveryAnswered` minus the stage-content gate, so the
    // counter advances even on monosyllabic-but-substantive replies that
    // don't pass the category gate — those are exactly the leads the
    // escape hatch must catch).
    const isSubstantiveTurn =
      !isQuestion(inboundText) &&
      !isMetaIdentityQuery(inboundText) &&
      !isBareGreeting(inboundText) &&
      hasMinimumContent(inboundText);
    const inDiscoveryE1 =
      resolved.stageId === "PB1.E1A" || resolved.stageId === "PB1.E1B";
    const priorTurnCount = priorPbState?.discoveryTurnCount ?? 0;
    // OBJN-01 (Phase 91): rejection turns are NOT discovery answers — gating
    // the increment on `!rejectionHotPre` preserves Phase 90 STAGE-02
    // semantics. Worked example from CONTEXT.md: lead replies "primera vez"
    // (turn 1, count=1), then "no me interesa" (turn 2, count STAYS 1),
    // then "no, en serio" (turn 3, count STAYS 1). Counting a rejection
    // would let it satisfy STAGE-02's turn-count gate, defeating Phase 90.
    const newTurnCount =
      inDiscoveryE1 && isSubstantiveTurn && !rejectionHotPre
        ? priorTurnCount + 1
        : priorTurnCount;

    const signals = computeAdvanceSignals(
      inboundText,
      replyText,
      detectedAvatar ?? priorAvatar ?? null,
      resolved.stageId,
      newTurnCount,
    );
    let nextStage = advanceStageIfComplete(
      { playbookId: resolved.playbookId, stageId: resolved.stageId },
      signals,
    );

    // Escape hatch (STAGE-02, Phase 90): if the lead has produced N=3
    // substantive turns inside E1A/E1B without ever passing the content
    // gate, force-advance to PB1.E2A so the conversation does not loop
    // indefinitely on monosyllabic / regex-miss replies. Pino warn is the
    // observability surface — no admin alert, no test failure.
    const escapeFired =
      inDiscoveryE1 &&
      isSubstantiveTurn &&
      newTurnCount >= 3 &&
      !hasStageSpecificContent(inboundText, resolved.stageId);
    if (escapeFired) {
      const recentUserMessages = session
        ? session.messages
            .filter((m) => m.role === "user")
            .slice(-3)
            .map((m) => m.content)
        : [];
      log.warn(
        {
          event: "discovery_escape_fired",
          stageId: resolved.stageId,
          phone,
          turnCount: newTurnCount,
          recentUserMessages,
        },
        "discovery escape fired",
      );
      // Force-advance to canonical next stage if the heuristic didn't already.
      if (nextStage === null) {
        nextStage = "PB1.E2A";
      }
    }

    if (nextStage !== null) {
      await setPlaybookState(phone, {
        activePlaybook: resolved.playbookId,
        currentStage: nextStage,
        // Preserve the freshly-detected avatar (if any) or the one we
        // already had — never clobber avatar to undefined on advance.
        avatar: detectedAvatar ?? priorAvatar ?? undefined,
        // Preserve the turn count (do NOT reset on advance) — Phase 92 may
        // want to assert on it in escape-fired paths.
        discoveryTurnCount: newTurnCount,
        // OBJN-01 (Phase 91): same pre-AI value — rejection state can't
        // change between pre-AI and post-AI within a single inbound turn.
        whyAsked: newWhyAsked,
        // PRICE-01 (Phase 99): reset counter to 0 when nextStage leaves
        // PB1 (per CONTEXT.md: "It should reset cleanly when the
        // conversation transitions to PB2 (post-trial) so the PB2
        // disclosure flow is not gated by PB1 state"). Preserve within PB1.
        priceInsistenceCount: nextStage.startsWith("PB1.")
          ? newPriceInsistenceCount
          : 0,
        updatedAt: Date.now(),
      });
      log.info(
        {
          phone,
          playbook: resolved.playbookId,
          from: resolved.stageId,
          to: nextStage,
          escapeFired,
        },
        "Playbook stage advanced",
      );
    } else if (
      newTurnCount !== priorTurnCount ||
      newWhyAsked !== priorWhyAskedPre ||
      newPriceInsistenceCount !== priorPriceInsistenceCount
    ) {
      // No stage advance, but the turn counter OR the rejection-arc flag
      // OR the PRICE-01 counter changed — persist so the next turn sees the
      // up-to-date state for the AND gate / escape hatch / rejection arc
      // rule selector / disclosure-unlock gate.
      await setPlaybookState(phone, {
        activePlaybook: resolved.playbookId,
        currentStage: resolved.stageId,
        avatar: detectedAvatar ?? priorAvatar ?? undefined,
        discoveryTurnCount: newTurnCount,
        // OBJN-01 (Phase 91): persist arc flag through turn-count-only updates.
        whyAsked: newWhyAsked,
        // PRICE-01 (Phase 99): persist the unchanged-within-PB1 counter so
        // a price-insistence-without-stage-advance is durably persisted.
        priceInsistenceCount: newPriceInsistenceCount,
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
 * Returns true if the inbound user message is itself a question.
 *
 * Two conditions count as "question":
 *   1. Ends with `?`.
 *   2. Starts (case-insensitive, after trim) with a Spanish interrogative
 *      lead word — "qué", "cómo", "sos", "eres", "hay", "tienen", "para"...
 *
 * Extracted from `computeAdvanceSignals` so P0-1's discovery heuristic
 * remains unit-testable without spinning up a full handler test.
 */
export function isQuestion(inbound: string): boolean {
  const trimmed = inbound.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.endsWith("?")) return true;
  const lower = trimmed.toLowerCase();
  const starters = [
    "qué",
    "que",
    "quién",
    "quien",
    "cuándo",
    "cuando",
    "dónde",
    "donde",
    "cuánto",
    "cuanto",
    "cómo",
    "como",
    "sos",
    "eres",
    "hay",
    "tienen",
    "cuales",
    "cuáles",
    "para",
  ];
  for (const starter of starters) {
    if (lower === starter) return true;
    if (lower.startsWith(starter + " ")) return true;
    if (lower.startsWith(starter + ",")) return true;
    if (lower.startsWith(starter + "?")) return true;
  }
  return false;
}

/**
 * Returns true if the inbound is a meta-identity query ("sos una IA?",
 * "eres un bot?", "qué modelo sos?", etc.). These must never count as a
 * valid discovery answer — they break persona, not complete it.
 */
export function isMetaIdentityQuery(inbound: string): boolean {
  return /\b(sos una? ia|eres una? ia|sos un bot|bot\?|modelo sos|qué modelo|que modelo|sos real|eres real|humana|humano|inteligencia artificial|chatgpt|gpt|claude|openai|anthropic)\b/i.test(
    inbound,
  );
}

/**
 * Returns true if the inbound is a bare greeting ("hola", "buenas",
 * "hey"). A greeting is not an answer to a discovery question — it is
 * the opening of the conversation.
 */
export function isBareGreeting(inbound: string): boolean {
  return /^(hola|buenas|hey|holis|buen[oa]s? (día|dia|tarde|noche)s?)[\s\.\!¡]*$/i.test(
    inbound.trim(),
  );
}

/**
 * Returns true if the inbound has enough substance to plausibly be a
 * discovery answer: at least 3 words OR ≥ 20 characters. This lets
 * short-but-meaningful replies like "vengo de crossfit" through while
 * still filtering monosyllables like "sí" / "ok".
 */
export function hasMinimumContent(inbound: string): boolean {
  const trimmed = inbound.trim();
  if (trimmed.length >= 20) return true;
  const wordCount = trimmed.split(/\s+/).filter((w) => w.length > 0).length;
  return wordCount >= 3;
}

/**
 * v5.3.2 Phase 91 (OBJN-01): soft-rejection detector.
 *
 * Single source of truth for the rejection regex — called both pre-AI
 * (handler computes `softRejectionRule` to pass to getSystemPrompt) and
 * inside `computeAdvanceSignals` (signal flows into AdvanceSignals).
 *
 * Style matches the existing `(^|[^a-záéíóúñ])(...)([^a-záéíóúñ]|$)`
 * non-word-boundary convention from `E1A_E1B_CATEGORIES` because JS `\b`
 * is ASCII-only — `\bno me interesa\b` would fail on accented neighbors.
 *
 * MUST match (per CONTEXT.md, includes the live-test 2026-04-16 variants):
 *   - "no me interesa"
 *   - "no es para mí" / "no es para mi"
 *   - "no gracias" / "no, gracias"
 *   - "paso" (standalone — excludes "paso por", "paso a paso")
 *   - "mejor no"
 *   - "no voy a" (covers no voy a hacer/ir/inscribirme/anotarme)
 *   - "no creo" (anchored — standalone utterance only)
 *   - "creo que no" (anchored end-of-utterance)
 *   - "me parece que no" (live-test variant)
 *
 * MUST NOT match (hesitation / scheduling — handled elsewhere):
 *   - "no sé" / "no se", "tal vez", "capaz"
 *   - "lo pienso" / "lo voy a pensar" / "dejame pensarlo" (PB2 retention)
 *   - "no creo que pueda hoy", "no puedo el martes" (logistics)
 */
export function detectSoftRejection(inbound: string): boolean {
  const lower = inbound.toLowerCase().trim();
  if (lower.length === 0) return false;

  // 1. "no me interesa" — substring match with non-word-boundary class.
  //    Also covers "creo que no me interesa" etc.
  if (/(^|[^a-záéíóúñ])(no me interesa)([^a-záéíóúñ]|$)/i.test(lower)) {
    return true;
  }

  // 2. "no es para mí" / "no es para mi"
  if (/(^|[^a-záéíóúñ])(no es para m[íi])([^a-záéíóúñ]|$)/i.test(lower)) {
    return true;
  }

  // 3. "no gracias" / "no, gracias"
  if (/(^|[^a-záéíóúñ])(no,?\s+gracias)([^a-záéíóúñ]|$)/i.test(lower)) {
    return true;
  }

  // 4. "mejor no" — substring match
  if (/(^|[^a-záéíóúñ])(mejor no)([^a-záéíóúñ]|$)/i.test(lower)) {
    return true;
  }

  // 5. "no voy a [hacer|ir|inscribirme|anotarme|...]" — broad rejection of
  //    intent. Excludes "no voy a poder hoy" (logistics) by requiring the
  //    next word to NOT be a logistics verb (poder/llegar) — keep narrow.
  if (/(^|[^a-záéíóúñ])(no voy a)\s+(?!poder|llegar)/i.test(lower)) {
    return true;
  }

  // 6. "me parece que no" (live-test variant) — must be present.
  if (/(^|[^a-záéíóúñ])(me parece que no)([^a-záéíóúñ]|$)/i.test(lower)) {
    return true;
  }

  // 7. "no creo" — STANDALONE only ("no creo." / "no creo"). Anchored so
  //    "no creo que pueda hoy" (logistics) and "no creo que me interese"
  //    (the no-me-interesa branch handles its variants) don't double-trip.
  if (/^\s*no creo\s*\.?\s*$/i.test(lower)) {
    return true;
  }

  // 8. "creo que no" — STANDALONE end-of-utterance ("creo que no." or just
  //    "creo que no"). Anchored to avoid "creo que no me interesa" matching
  //    twice (the no-me-interesa branch already owns that).
  if (/^\s*creo que no\s*\.?\s*$/i.test(lower)) {
    return true;
  }

  // 9. "paso" — STANDALONE single word ("paso" / "paso." / "paso!"), excludes
  //    "paso por la sede mañana" and "paso a paso lo voy logrando".
  if (/^\s*paso\s*[\.\!¡]*\s*$/i.test(lower)) {
    return true;
  }

  return false;
}

/**
 * Compute coarse advancement signals from this turn's inbound + outbound text.
 *
 * v5.3 uses simple keyword/regex matching — phase 83 may upgrade to a
 * model-driven detector. Kept intentionally narrow to avoid false advances.
 */
/**
 * Category map for the PB1.E1A / PB1.E1B content gate (STAGE-01, v5.3.2 Phase 90).
 *
 * The pre-90 gate matched a single union regex of ~25 keywords and accepted
 * any single match as "answered". Post-90 we partition the same keyword set
 * into four semantic categories and require matches across ≥ 2 categories
 * to count as a substantive discovery answer.
 *
 * Examples:
 *   "primera vez"                  → 1 category (level)                → false
 *   "nunca entrené, quiero arrancar" → 2 categories (level + experience) → true
 *   "hice crossfit hace 2 años"     → 3 categories (experience + context + duration) → true
 *
 * Each regex uses the same `(^|[^a-záéíóúñ])(...)([^a-záéíóúñ]|$)` non-word-boundary
 * style as the pre-90 single regex because JS `\b` is ASCII-only — `\bentrené\b`
 * would never match. Every keyword from the pre-90 union is preserved; none
 * was dropped during the partition. "experiencia" is grouped with `experience`
 * (it is the prototypical exemplar). "empezar"/"arrancar"/"arranco" are grouped
 * with `level` because they mark a starting-point for an inexperienced lead.
 * "deporte" is grouped with `context` (discipline / training context).
 */
const E1A_E1B_CATEGORIES: Record<string, RegExp> = {
  level:
    /(^|[^a-záéíóúñ])(principiante|primera vez|nunca|arrancar|arranco|empezar)([^a-záéíóúñ]|$)/i,
  experience:
    /(^|[^a-záéíóúñ])(entren[oaé]|entrené|entrenaba|hice|hago|vengo de|experiencia|activ[oa]|sedentari[oa])([^a-záéíóúñ]|$)/i,
  duration: /(^|[^a-záéíóúñ])(a[ñn]os?|meses?|semanas?)([^a-záéíóúñ]|$)/i,
  context:
    /(^|[^a-záéíóúñ])(gym|gimnasio|crossfit|pesas|running|yoga|pilates|deporte)([^a-záéíóúñ]|$)/i,
};

/**
 * v5.3.3 Phase 99 (PRICE-01): single source of truth for price-objection
 * detection. Lower-cased input expected (mirrors the original inline
 * `inbound = inboundText.toLowerCase()` pattern in `computeAdvanceSignals`).
 *
 * Single regex literal — referenced by both:
 *   - `computeAdvanceSignals` (post-AI, sets `signals.priceObjection`)
 *   - The pre-AI counter-increment site at handler.ts (drives
 *     `newPriceInsistenceCount` flowing into `setPlaybookState` and the
 *     `disclosureUnlocked` flag passed to `getSystemPrompt`)
 *
 * Keeping the regex co-located here (and NOT inlined in two places)
 * satisfies the CONTEXT.md "do NOT introduce a parallel regex" constraint.
 */
export function detectPriceObjection(inboundLower: string): boolean {
  return /\b(caro|carisimo|car[ií]simo|precio|no me alcanza|no puedo pagar|muy caro|barato|descuento)\b/i.test(
    inboundLower,
  );
}

/**
 * Stage-aware content gate for `discoveryAnswered`.
 *
 * Returns true if the inbound contains keywords that plausibly answer the
 * discovery question for the given stage. When `stageId` is null OR the
 * stage is outside the PB1 discovery range (E1A/E1B/E2A/E2B/E3), returns
 * true so callers fall back to the existing 4-gate check.
 *
 * STAGE-01 (v5.3.2 Phase 90) — for PB1.E1A and PB1.E1B specifically the gate
 * requires matches across ≥ 2 distinct semantic categories from
 * `E1A_E1B_CATEGORIES` (level / experience / duration / context). This closes
 * the false-advance observed in the live test where a single keyword like
 * "primera vez" was enough to advance E1A → E2A after a single user turn.
 * Sibling stages (E2A/E2B/E3) keep their pre-90 single-match semantics.
 *
 * Quick 15 (P0-3): closes the gap where "Hola buenas, quería consultar por
 * calistenia" passed `hasMinimumContent` but did NOT actually answer an
 * experience question.
 */
export function hasStageSpecificContent(
  inbound: string,
  stageId: StageId | null,
): boolean {
  if (stageId === null) return true; // no stage info → don't add extra gate

  const lower = inbound.toLowerCase();

  // STAGE-01 (v5.3.2 Phase 90): category-diversity gate — E1A+E1B only
  if (stageId === "PB1.E1A" || stageId === "PB1.E1B") {
    const matchedCategories = Object.values(E1A_E1B_CATEGORIES).filter((rx) =>
      rx.test(lower),
    ).length;
    return matchedCategories >= 2;
  }

  // PB1.E2A / E2B — motivation/goals question
  if (stageId === "PB1.E2A" || stageId === "PB1.E2B") {
    return /\b(quiero|busco|me gustar[íi]a|necesito|objetivo|meta|bajar|tonificar|fuerza|salud|aprender|mejorar|cambiar|sentirme|verme|forma|figura|peso|m[úu]sculo|cuerpo|disfrutar|divertirme|desaf[íi]o|skills?|destrabar|superar)\b/i.test(
      lower,
    );
  }

  // PB1.E3 — zone/schedule question
  if (stageId === "PB1.E3") {
    return (
      /\b(centro|puerto|mogotes|constituci[óo]n|jujuy|moreno|alem|mario bravo|ma[ñn]ana|tarde|noche|lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado|domingo|temprano|despu[ée]s|antes|cerca|lejos|zona|queda)\b/i.test(
        lower,
      ) ||
      /\d+\s?(hs|h|am|pm)/i.test(lower) ||
      /\d+:\d+/.test(lower)
    );
  }

  // Other stages (E4, E5, non-PB1) — no stage-specific check, pass through
  return true;
}

export function computeAdvanceSignals(
  inboundText: string,
  replyText: string,
  detectedAvatar: AvatarProfile | null,
  currentStage: StageId | null,
  /**
   * STAGE-02 (v5.3.2 Phase 90): turn count INCLUDING the current turn for
   * E1A/E1B. Defaults to 1 so callers that don't track the count get the
   * pre-90 effective semantics for non-E1A/E1B stages (where the AND gate
   * does not apply). For E1A/E1B the AND gate requires this value to be
   * ≥ 2 — i.e. the lead has answered substantively at least twice — which
   * implements the playbook's "idealmente 2-3 preguntas en total" intent.
   */
  turnCountIncludingThis: number = 1,
): AdvanceSignals {
  const inbound = inboundText.toLowerCase();

  // A turn counts as a real discovery answer ONLY when the user's inbound
  // is not itself a question, not a meta-identity query, not a bare
  // greeting, has enough substance to plausibly carry an answer, AND
  // contains keywords that plausibly answer the CURRENT stage's question.
  //
  // Historically this was `reply.includes("?") && inbound.trim().length > 0`
  // which advanced the stage on ANY non-empty reply — including the user's
  // own questions. P0-1 (quick 14) replaced that with content-based rules.
  // Quick 15 (P0-3) adds the stage-specific content gate.
  //
  // STAGE-02 (v5.3.2 Phase 90): for PB1.E1A and PB1.E1B specifically,
  // `discoveryAnswered` additionally requires `turnCountIncludingThis >= 2`
  // — AND composition (not OR) so a rich first turn still does not advance.
  // Sibling stages keep pre-90 semantics (no turn-count gate, single match).
  const inDiscoveryE1 =
    currentStage === "PB1.E1A" || currentStage === "PB1.E1B";
  const turnCountGate = inDiscoveryE1 ? turnCountIncludingThis >= 2 : true;
  const discoveryAnswered =
    !isQuestion(inboundText) &&
    !isMetaIdentityQuery(inboundText) &&
    !isBareGreeting(inboundText) &&
    hasMinimumContent(inboundText) &&
    hasStageSpecificContent(inboundText, currentStage) &&
    turnCountGate;

  // Mica proposed the trial in her last reply
  const trialProposed = /\b(prueba|probar|clase de prueba|gratis)\b/i.test(
    replyText,
  );

  // User explicitly accepted (Spanish affirmative phrases).
  //
  // P1-5 (quick 14) removed `perfecto` and `genial` from this list: both
  // are extremely common in follow-up framings like "genial, cuándo hay
  // clases?" where the user is NOT accepting but adding a new question.
  // Kept tokens are unambiguous acceptance markers.
  const userAccepted =
    /\b(dale|anotame|anótame|me anoto|listo|obvio|claro|ok|okey|va)\b/i.test(
      inbound,
    ) ||
    /^s[ií][\s\.\!¡]*$/i.test(inboundText.trim()) ||
    /\bs[ií]\b(?!\s+no\b)/i.test(inbound);

  // User raised a price-shaped objection.
  // v5.3.3 Phase 99 (PRICE-01): single source of truth lives in
  // `detectPriceObjection` so the handler's pre-AI counter increment and this
  // post-AI signal use the same regex (no parallel regex per CONTEXT.md).
  const priceObjection = detectPriceObjection(inbound);

  // [OBJN-01, v5.3.2 Phase 91] Soft-rejection signal — single source of
  // truth lives in `detectSoftRejection` so the handler's pre-AI rule
  // selector and this signal use the same regex. Stage-scope (5-stage
  // discovery allowlist) is enforced by `advanceStageIfComplete`, not here.
  const softRejection = detectSoftRejection(inboundText);

  // Phase 83-03: direct logistical question before discovery is complete.
  // Regex matches Spanish phrasings for "¿cuánto sale?", "¿qué horarios?",
  // "¿dónde está?", "¿dónde queda?", "precio", "plan". Intentionally narrow.
  const directQuestionAsked =
    /\b(cu[aá]nto sale|qu[eé] precio|cu[aá]nto (cuesta|vale)|qu[eé] horarios?|qu[eé] d[ií]as|d[oó]nde (est[aá]n?|queda|quedan)|direcci[oó]n|sede|qu[eé] planes?)\b/i.test(
      inbound,
    );

  // Phase 83-03 + P1-6 (quick 14): user insists on direct answers /
  // refuses discovery. In addition to the original narrow phrases, we
  // also flag bare price queries ("precio?", "cuánto sale", "mandame los
  // precios") because those should short-circuit discovery defer.
  const userInsistedDirect =
    /\b(solo (quiero|necesito)|pasame (el|los) (precio|horarios?)|no tengo tiempo|respondeme directo|sin vueltas|al grano|dec[ií]me directo)\b/i.test(
      inbound,
    ) ||
    /^precios?\s*\??$/i.test(inboundText.trim()) ||
    /cu[aá]nto sale/i.test(inbound) ||
    /mandame (los )?precios?/i.test(inbound) ||
    /pasame (los )?precios?/i.test(inbound) ||
    /decime (el |los )?precios?/i.test(inbound) ||
    /quiero saber (el |los )?precios?/i.test(inbound);

  return {
    discoveryAnswered,
    trialProposed,
    userAccepted,
    priceObjection,
    detectedAvatar,
    directQuestionAsked,
    userInsistedDirect,
    softRejection,
  };
}

/**
 * Strip markdown headers (###, ##, #) from AI output.
 * WhatsApp doesn't render them — they look broken to users.
 * The system prompt instructs the AI not to use them, but this
 * is defense-in-depth for when the AI ignores the instruction.
 */
export function stripMarkdownHeaders(text: string): string {
  // Replace lines starting with # (1-3 hashes) followed by space and text
  // with just the text in *bold* (WhatsApp formatting)
  return text.replace(/^#{1,3}\s+(.+)$/gm, "*$1*");
}

/**
 * Normalize WhatsApp formatting (quick-16, fix 1).
 *
 * Converts GitHub-flavoured markdown `**bold**` to WhatsApp's `*bold*`.
 * WhatsApp uses single asterisks for bold; a double asterisk renders as a
 * literal `**` to the user which looks broken. Runs after
 * `stripMarkdownHeaders` as defense-in-depth for when the AI emits
 * markdown bold despite the system prompt telling it not to.
 *
 * Non-greedy pattern `\*\*([^\n*]+?)\*\*` matches paired `**` on a single
 * line with no intervening `*`. Legitimate single-asterisk bold
 * (`*already bold*`) is left untouched.
 */
export function normalizeWhatsAppFormatting(text: string): string {
  return text.replace(/\*\*([^\n*]+?)\*\*/g, "*$1*");
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
 * Parses an extraction response from the AI provider, tolerating markdown
 * fences (```json ... ``` or ``` ... ```) that gpt-4o-mini may wrap JSON in.
 *
 * Returns `null` on truly malformed content — preserves the existing
 * "skip update on parse failure" semantics at extractAndUpdateProfile.
 *
 * Defensive hardening of CTXT-02 / Finding #4: empirical evidence from
 * 2026-06-09 live UAT repro showed gpt-4o-mini wrapping extraction output
 * in fences, silently dropping branchPreference and notes fields.
 *
 * Exported for unit tests (`test/v5-3-3-context-awareness.test.ts` T3/T4)
 * per CONTEXT.md D-12 Claude's Discretion (D-14: file-private OR exported
 * for tests — chose exported because the test file imports it directly).
 */
export function parseExtractionResponse(
  rawContent: string,
): Record<string, unknown> | null {
  const trimmed = rawContent.trim();

  // Two-pass strip (Claude's Discretion shape per D-13):
  //   pass 1: leading ``` or ```json
  //   pass 2: trailing ```
  const stripped = trimmed
    .replace(/^```(?:json)?\s*\n?/, "")
    .replace(/\n?\s*```$/, "")
    .trim();

  if (stripped.length === 0) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(stripped);
    // Narrow to object-shape per D-12 return type; arrays and primitives
    // are NOT valid extraction outputs (the AI is instructed to emit a
    // JSON object with named fields).
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
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

    // Parse extraction response — tolerates markdown fences per D-12/D-13.
    // Helper returns `null` on malformed content; the existing skip-on-failure
    // semantics are preserved via the `if (!extracted)` guard below.
    const extracted = parseExtractionResponse(rawContent);
    if (!extracted) {
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
