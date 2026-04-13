/**
 * WhatsApp Cloud API Client
 *
 * Functions for sending messages and verifying webhooks via Meta's Cloud API.
 * Uses Node.js native fetch (Node 22+).
 *
 * Meta Graph API docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

import pino from "pino";
import type {
  MetaWebhookPayload,
  ParsedInboundMessage,
  SendMessageResponse,
  InteractiveButton,
  TemplateComponent,
} from "./types.js";

const log = pino({ name: "whatsapp-client" });

const GRAPH_API_VERSION = "v21.0";

/**
 * Verify Meta's webhook subscription challenge.
 *
 * If mode is "subscribe" and the token matches WHATSAPP_VERIFY_TOKEN,
 * returns the challenge string. Otherwise returns null.
 */
export function verifyWebhook(
  mode: string,
  token: string,
  challenge: string,
): string | null {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!verifyToken) {
    log.error("WHATSAPP_VERIFY_TOKEN environment variable is not set");
    return null;
  }

  if (mode === "subscribe" && token === verifyToken) {
    log.info("Webhook verification successful");
    return challenge;
  }

  log.warn(
    { mode, tokenMatch: token === verifyToken },
    "Webhook verification failed",
  );
  return null;
}

/**
 * Send a text message via WhatsApp Cloud API.
 *
 * @returns The wamid of the sent message
 * @throws On API error or missing configuration
 */
export async function sendTextMessage(
  phone: string,
  text: string,
): Promise<string> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!token || !phoneId) {
    throw new Error(
      "Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_ID environment variables",
    );
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneId}/messages`;

  // Argentine numbers: webhook sends 549xxx, API needs 54xxx
  const normalizedPhone = phone.replace(/^549(\d{10})$/, "54$1");

  const body = {
    messaging_product: "whatsapp",
    to: normalizedPhone,
    type: "text",
    text: { body: text },
  };

  log.info({ phone, textLength: text.length }, "Sending text message");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    log.error(
      { status: response.status, body: errorBody, phone },
      "WhatsApp API error",
    );
    throw new Error(`WhatsApp API error: ${response.status} - ${errorBody}`);
  }

  const data = (await response.json()) as SendMessageResponse;
  const messageId = data.messages[0]?.id;

  if (!messageId) {
    log.error({ data }, "No message ID in API response");
    throw new Error("No message ID returned from WhatsApp API");
  }

  log.info({ phone, messageId }, "Message sent successfully");
  return messageId;
}

/**
 * Send an interactive button message via WhatsApp Cloud API.
 *
 * Max 3 buttons per message (WhatsApp API limit). If more are provided,
 * a warning is logged and the list is truncated to 3.
 *
 * @returns The wamid of the sent message
 * @throws On API error or missing configuration
 */
export async function sendInteractiveMessage(
  phone: string,
  bodyText: string,
  buttons: InteractiveButton[],
): Promise<string> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!token || !phoneId) {
    throw new Error(
      "Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_ID environment variables",
    );
  }

  // WhatsApp API limit: max 3 buttons per interactive message
  let truncatedButtons = buttons;
  if (buttons.length > 3) {
    log.warn(
      { buttonCount: buttons.length },
      "Interactive message has more than 3 buttons, truncating to 3",
    );
    truncatedButtons = buttons.slice(0, 3);
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneId}/messages`;

  // Argentine numbers: webhook sends 549xxx, API needs 54xxx
  const normalizedPhone = phone.replace(/^549(\d{10})$/, "54$1");

  const body = {
    messaging_product: "whatsapp",
    to: normalizedPhone,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: truncatedButtons.map((b) => ({
          type: "reply" as const,
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  };

  log.info(
    {
      phone,
      bodyTextLength: bodyText.length,
      buttonCount: truncatedButtons.length,
    },
    "Sending interactive button message",
  );

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    log.error(
      { status: response.status, body: errorBody, phone },
      "WhatsApp API error (interactive)",
    );
    throw new Error(`WhatsApp API error: ${response.status} - ${errorBody}`);
  }

  const data = (await response.json()) as SendMessageResponse;
  const messageId = data.messages[0]?.id;

  if (!messageId) {
    log.error({ data }, "No message ID in interactive API response");
    throw new Error("No message ID returned from WhatsApp API");
  }

  log.info({ phone, messageId }, "Interactive message sent successfully");
  return messageId;
}

/**
 * Send a template message via WhatsApp Cloud API.
 *
 * Template messages must be pre-approved in Meta Business Manager.
 * The bot sends them by name; the actual template text is configured
 * in Meta's dashboard.
 *
 * @param phone - Recipient phone number
 * @param templateName - Pre-approved template name (e.g. "class_reminder")
 * @param languageCode - Template language code (e.g. "es_AR")
 * @param components - Optional template parameters (body, header, button values)
 * @returns The wamid of the sent message
 * @throws On API error or missing configuration
 */
export async function sendTemplateMessage(
  phone: string,
  templateName: string,
  languageCode: string,
  components?: TemplateComponent[],
): Promise<string> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!token || !phoneId) {
    throw new Error(
      "Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_ID environment variables",
    );
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneId}/messages`;

  const template: Record<string, unknown> = {
    name: templateName,
    language: { code: languageCode },
  };

  if (components && components.length > 0) {
    template.components = components;
  }

  // Argentine numbers: webhook sends 549xxx, API needs 54xxx
  const normalizedPhone = phone.replace(/^549(\d{10})$/, "54$1");

  const body = {
    messaging_product: "whatsapp",
    to: normalizedPhone,
    type: "template",
    template,
  };

  log.info({ phone, templateName, languageCode }, "Sending template message");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    log.error(
      { status: response.status, body: errorBody, phone, templateName },
      "WhatsApp API error (template)",
    );
    throw new Error(`WhatsApp API error: ${response.status} - ${errorBody}`);
  }

  const data = (await response.json()) as SendMessageResponse;
  const messageId = data.messages[0]?.id;

  if (!messageId) {
    log.error({ data }, "No message ID in template API response");
    throw new Error("No message ID returned from WhatsApp API");
  }

  log.info(
    { phone, messageId, templateName },
    "Template message sent successfully",
  );
  return messageId;
}

/**
 * Parse a Meta webhook payload to extract the first text message.
 *
 * Returns null if:
 * - No messages in the payload (e.g., status updates only)
 * - Message type is not "text"
 * - No text body present
 *
 * Non-text messages are ignored silently per design decision.
 */
export function parseWebhookPayload(
  body: MetaWebhookPayload,
): ParsedInboundMessage | null {
  const entry = body.entry?.[0];
  if (!entry) {
    return null;
  }

  const change = entry.changes?.[0];
  if (!change) {
    return null;
  }

  const value = change.value;
  const message = value.messages?.[0];

  if (!message) {
    // Status update or other non-message webhook — ignore
    return null;
  }

  const contact = value.contacts?.[0];

  // Handle interactive replies (button_reply or list_reply)
  if (message.type === "interactive" && message.interactive) {
    const interactive = message.interactive;
    let replyId: string | undefined;
    let replyTitle: string | undefined;

    if (interactive.type === "button_reply" && interactive.button_reply) {
      replyId = interactive.button_reply.id;
      replyTitle = interactive.button_reply.title;
    } else if (interactive.type === "list_reply" && interactive.list_reply) {
      replyId = interactive.list_reply.id;
      replyTitle = interactive.list_reply.title;
    }

    if (replyId && replyTitle) {
      return {
        phone: message.from,
        contactName: contact?.profile?.name || "Unknown",
        text: replyTitle,
        messageType: "text",
        whatsappMessageId: message.id,
        timestamp: parseInt(message.timestamp, 10),
        rawPayload: body,
        interactiveReplyId: replyId,
      };
    }
  }

  if (message.type !== "text" || !message.text?.body) {
    // Non-text, non-interactive message. Return a parsed message with the
    // original type so the handler can reply with a friendly fallback
    // (quick-16 fix 3). We previously returned null and silently ignored
    // these, which made the bot look broken to users.
    //
    // Status/reaction/button/order/unknown still fall through to null —
    // those are genuinely not user-authored content.
    const inboundType = message.type;
    const nonTextTypes: ReadonlyArray<typeof inboundType> = [
      "image",
      "audio",
      "document",
      "sticker",
      "location",
      "contacts",
    ];
    if (nonTextTypes.includes(inboundType)) {
      return {
        phone: message.from,
        contactName: contact?.profile?.name || "Unknown",
        text: `[${inboundType} message]`,
        messageType: inboundType as
          | "image"
          | "audio"
          | "document"
          | "sticker"
          | "location"
          | "contacts",
        whatsappMessageId: message.id,
        timestamp: parseInt(message.timestamp, 10),
        rawPayload: body,
      };
    }

    log.debug(
      { type: message.type, from: message.from },
      "Ignoring non-user-authored message",
    );
    return null;
  }

  return {
    phone: message.from,
    contactName: contact?.profile?.name || "Unknown",
    text: message.text.body,
    messageType: "text",
    whatsappMessageId: message.id,
    timestamp: parseInt(message.timestamp, 10),
    rawPayload: body,
  };
}
