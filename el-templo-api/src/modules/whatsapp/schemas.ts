/**
 * Fastify JSON schemas for WhatsApp API request/response validation.
 */

// =============================================================================
// Shared response fragments
// =============================================================================

const errorSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
} as const;

const conversationSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    phone: { type: "string" },
    contactName: { type: ["string", "null"] },
    status: {
      type: "string",
      enum: ["active", "human_takeover", "closed"],
    },
    clientState: {
      type: "string",
      enum: ["lead", "trial", "active_member", "lapsed", "returning"],
    },
    assignedAdminId: { type: ["integer", "null"] },
    linkedMemberId: { type: ["integer", "null"] },
    linkedMemberName: { type: ["string", "null"] },
    lastMessageAt: { type: ["string", "null"] },
    lastMessagePreview: { type: ["string", "null"] },
    messageCount: { type: "integer" },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
} as const;

const messageSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    conversationId: { type: "integer" },
    direction: {
      type: "string",
      enum: ["inbound", "outbound_bot", "outbound_human"],
    },
    content: { type: "string" },
    messageType: {
      type: "string",
      enum: ["text", "image", "audio", "document", "template"],
    },
    whatsappMessageId: { type: ["string", "null"] },
    metadata: {},
    createdAt: { type: "string" },
  },
} as const;

// =============================================================================
// Admin Endpoints
// =============================================================================

export const listConversationsSchema = {
  querystring: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["active", "human_takeover", "closed"],
      },
      clientState: {
        type: "string",
        enum: ["lead", "trial", "active_member", "lapsed", "returning"],
      },
      search: { type: "string" },
      page: { type: "integer", minimum: 1, default: 1 },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        conversations: { type: "array", items: conversationSchema },
        total: { type: "integer" },
        page: { type: "integer" },
        limit: { type: "integer" },
      },
    },
    403: errorSchema,
  },
} as const;

export const getConversationSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "integer" },
    },
  },
  querystring: {
    type: "object",
    properties: {
      messagePage: { type: "integer", minimum: 1, default: 1 },
      messageLimit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        conversation: conversationSchema,
        messages: { type: "array", items: messageSchema },
        totalMessages: { type: "integer" },
      },
    },
    404: errorSchema,
  },
} as const;

export const sendMessageSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "integer" },
    },
  },
  body: {
    type: "object",
    required: ["content"],
    properties: {
      content: { type: "string", minLength: 1 },
      messageType: {
        type: "string",
        enum: ["text", "image", "audio", "document", "template"],
        default: "text",
      },
    },
  },
  response: {
    201: messageSchema,
    400: errorSchema,
    404: errorSchema,
  },
} as const;

export const takeoverSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "integer" },
    },
  },
  response: {
    200: conversationSchema,
    404: errorSchema,
  },
} as const;

export const resumeBotSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "integer" },
    },
  },
  response: {
    200: conversationSchema,
    404: errorSchema,
  },
} as const;
