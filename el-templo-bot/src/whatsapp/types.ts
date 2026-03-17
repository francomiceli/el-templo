/**
 * WhatsApp Cloud API Types
 *
 * Type definitions for Meta's webhook payloads and API responses.
 *
 * Meta webhook reference:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
 */

// ─── Meta Webhook Payload Types ─────────────────────────────────────────────

/** Top-level POST body from Meta's webhook */
export interface MetaWebhookPayload {
  object: "whatsapp_business_account";
  entry: MetaWebhookEntry[];
}

export interface MetaWebhookEntry {
  id: string;
  changes: MetaWebhookChange[];
}

export interface MetaWebhookChange {
  value: MetaWebhookValue;
  field: "messages";
}

export interface MetaWebhookValue {
  messaging_product: "whatsapp";
  metadata: MetaWebhookMetadata;
  contacts?: MetaWebhookContact[];
  messages?: MetaWebhookMessage[];
  statuses?: MetaWebhookStatus[];
}

export interface MetaWebhookMetadata {
  display_phone_number: string;
  phone_number_id: string;
}

export interface MetaWebhookContact {
  profile: {
    name: string;
  };
  wa_id: string;
}

export interface MetaWebhookMessage {
  id: string;
  from: string;
  timestamp: string;
  type:
    | "text"
    | "image"
    | "audio"
    | "document"
    | "sticker"
    | "reaction"
    | "location"
    | "contacts"
    | "interactive"
    | "button"
    | "order"
    | "unknown";
  text?: {
    body: string;
  };
  image?: MetaWebhookMedia;
  audio?: MetaWebhookMedia;
  document?: MetaWebhookMedia;
  sticker?: MetaWebhookMedia;
}

export interface MetaWebhookMedia {
  id: string;
  mime_type: string;
  sha256?: string;
  caption?: string;
}

export interface MetaWebhookStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: MetaWebhookError[];
}

export interface MetaWebhookError {
  code: number;
  title: string;
  message: string;
  error_data?: {
    details: string;
  };
}

// ─── Send Message API Response ──────────────────────────────────────────────

export interface SendMessageResponse {
  messaging_product: "whatsapp";
  contacts: Array<{
    input: string;
    wa_id: string;
  }>;
  messages: Array<{
    id: string;
  }>;
}

// ─── Parsed Inbound Message ─────────────────────────────────────────────────

/** Parsed result used by the bot after extracting from Meta's webhook format */
export interface ParsedInboundMessage {
  phone: string;
  contactName: string;
  text: string;
  messageType: "text" | "image" | "audio" | "document";
  whatsappMessageId: string;
  timestamp: number;
  rawPayload: MetaWebhookPayload;
}
