/**
 * Finance API JSON schemas (Phase 106).
 *
 * Fastify JSON Schema with `as const` literals — same pattern as
 * reports/schemas.ts. NO Zod (project does not use Zod in API modules).
 */

// -- Shared fragments -------------------------------------------------------

const errorSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
} as const;

const paginationQuerystring = {
  page: { type: "integer", minimum: 1 },
  limit: { type: "integer", minimum: 1, maximum: 200 }, // D-12: max 200
} as const;

const KIND_ENUM = [
  "plan_charge",
  "debt_settlement",
  "refund",
  "adjustment",
  "advance_payment",
] as const;

const DIRECTION_ENUM = ["inflow", "outflow"] as const;

const PAYMENT_METHOD_ENUM = [
  "cash",
  "transfer",
  "card",
  "aura_credit",
  "internal",
] as const;

const TARGET_KIND_ENUM = [
  "subscription",
  "debt_balance",
  "transaction",
] as const;

// -- POST /transactions (create) — D-10 ------------------------------------

export const createTransactionSchema = {
  body: {
    type: "object",
    required: [
      "memberId",
      "kind",
      "direction",
      "amount",
      "currency",
      "paymentMethod",
      "transactionDate",
      "effectiveDate",
      "branchId",
      "links",
    ],
    properties: {
      memberId: { type: "integer", minimum: 1 },
      kind: { type: "string", enum: KIND_ENUM },
      direction: { type: "string", enum: DIRECTION_ENUM },
      amount: { type: "integer", minimum: 0 },
      currency: { type: "string", minLength: 1, maxLength: 8 },
      paymentMethod: { type: "string", enum: PAYMENT_METHOD_ENUM },
      transactionDate: { type: "string", format: "date" },
      effectiveDate: { type: "string", format: "date" },
      branchId: { type: "integer", minimum: 1 },
      notes: { type: ["string", "null"], maxLength: 2000 },
      links: {
        type: "array",
        items: {
          type: "object",
          required: ["targetKind", "targetId", "allocatedAmount"],
          properties: {
            targetKind: { type: "string", enum: TARGET_KIND_ENUM },
            targetId: { type: "integer", minimum: 1 },
            allocatedAmount: { type: "integer", minimum: 0 },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
  response: {
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    404: errorSchema,
    500: errorSchema,
  },
} as const;

// -- POST /transactions/:id/void — D-11 ------------------------------------

export const voidTransactionSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "integer", minimum: 1 } },
  },
  body: {
    type: "object",
    required: ["reason"],
    properties: { reason: { type: "string", minLength: 1, maxLength: 1000 } },
    additionalProperties: false,
  },
  response: {
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    404: errorSchema,
    500: errorSchema,
  },
} as const;

// -- Re-exported helper fragments for Plan 03 (reads) ----------------------

export const SHARED_ERROR_SCHEMA = errorSchema;
export const SHARED_PAGINATION_QUERYSTRING = paginationQuerystring;
export const SHARED_KIND_ENUM = KIND_ENUM;
export const SHARED_PAYMENT_METHOD_ENUM = PAYMENT_METHOD_ENUM;
