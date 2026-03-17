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

  const body = {
    messaging_product: "whatsapp",
    to: phone,
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

  if (message.type !== "text" || !message.text?.body) {
    // Non-text message — ignore silently
    log.debug(
      { type: message.type, from: message.from },
      "Ignoring non-text message",
    );
    return null;
  }

  const contact = value.contacts?.[0];

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
