/**
 * WhatsApp Cloud API Types
 *
 * Type definitions for Meta's webhook payloads and API responses.
 *
 * TODO: Define interfaces for:
 * - WebhookPayload (incoming POST from Meta)
 * - WebhookMessage (extracted message with phone, text, type, etc.)
 * - SendMessageResponse (API response after sending)
 * - TemplateMessage (for proactive scheduler messages)
 *
 * Meta webhook reference:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
 */

export interface WebhookMessage {
  phone: string;
  contactName: string;
  text: string;
  messageType: "text" | "image" | "audio" | "document";
  whatsappMessageId: string;
  timestamp: number;
}

// TODO: Define full webhook payload types from Meta docs
