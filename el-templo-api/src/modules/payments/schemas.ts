/**
 * Fastify JSON schemas for Payments API request/response validation.
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

const paymentDetailSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    memberId: { type: "integer" },
    memberName: { type: "string" },
    subscriptionId: { type: "integer" },
    planName: { type: ["string", "null"] },
    amount: { type: "integer" },
    paymentMethod: { type: "string" },
    paymentDate: { type: "string" },
    reference: { type: ["string", "null"] },
    notes: { type: ["string", "null"] },
    recordedBy: { type: "integer" },
    recorderName: { type: "string" },
    voidedAt: { type: ["string", "null"] },
    voidedBy: { type: ["integer", "null"] },
    voidReason: { type: ["string", "null"] },
    createdAt: { type: "string" },
  },
} as const;

const financialSummaryResponseSchema = {
  type: "object",
  properties: {
    monthlyRevenue: { type: "integer" },
    revenueByMethod: {
      type: "object",
      properties: {
        cash: { type: "integer" },
        transfer: { type: "integer" },
        card: { type: "integer" },
      },
    },
    revenueByBranch: {
      type: "array",
      items: {
        type: "object",
        properties: {
          branchId: { type: "integer" },
          branchName: { type: "string" },
          revenue: { type: "integer" },
        },
      },
    },
  },
} as const;

// =============================================================================
// Payment Endpoints
// =============================================================================

export const recordPaymentSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    required: ["amount", "paymentMethod", "paymentDate", "subscriptionId"],
    properties: {
      amount: { type: "integer", minimum: 1 },
      paymentMethod: {
        type: "string",
        enum: ["cash", "transfer", "card"],
      },
      paymentDate: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      },
      subscriptionId: { type: "integer" },
      reference: { type: "string" },
      notes: { type: "string" },
    },
  },
  response: {
    201: paymentDetailSchema,
    400: errorSchema,
    404: errorSchema,
  },
};

export const voidPaymentSchema = {
  params: {
    type: "object",
    required: ["paymentId"],
    properties: {
      paymentId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    required: ["reason"],
    properties: {
      reason: { type: "string", minLength: 1 },
    },
  },
  response: {
    200: paymentDetailSchema,
    400: errorSchema,
    404: errorSchema,
  },
};

export const memberPaymentsSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        payments: { type: "array", items: paymentDetailSchema },
      },
    },
  },
};

export const globalPaymentsSchema = {
  querystring: {
    type: "object",
    properties: {
      branchId: { type: "integer" },
      paymentMethod: {
        type: "string",
        enum: ["cash", "transfer", "card"],
      },
      dateFrom: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      },
      dateTo: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
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
        payments: { type: "array", items: paymentDetailSchema },
        total: { type: "integer" },
        page: { type: "integer" },
        limit: { type: "integer" },
      },
    },
  },
};

export const financialSummarySchema = {
  querystring: {
    type: "object",
    properties: {
      branchId: { type: "integer" },
      dateFrom: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      },
      dateTo: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      },
    },
  },
  response: {
    200: financialSummaryResponseSchema,
  },
};
