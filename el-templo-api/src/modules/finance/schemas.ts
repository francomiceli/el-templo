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

// -- GET /transactions (list) — D-12 ---------------------------------------

const transactionListItemProperties = {
  id: { type: "integer" },
  transactionDate: { type: "string", format: "date" },
  effectiveDate: { type: "string", format: "date" },
  memberId: { type: "integer" },
  memberName: { type: "string" },
  kind: { type: "string", enum: KIND_ENUM },
  direction: { type: "string", enum: DIRECTION_ENUM },
  amount: { type: "integer" },
  currency: { type: "string" },
  paymentMethod: { type: "string", enum: PAYMENT_METHOD_ENUM },
  branchId: { type: "integer" },
  branchName: { type: "string" },
  recordedBy: { type: "integer" },
  recorderName: { type: "string" },
  voidedAt: { type: ["string", "null"] },
  notes: { type: ["string", "null"] },
  linkSummary: {
    type: "array",
    items: {
      type: "object",
      properties: {
        targetKind: { type: "string", enum: TARGET_KIND_ENUM },
        targetId: { type: "integer" },
        allocatedAmount: { type: "integer" },
      },
    },
  },
} as const;

export const listTransactionsSchema = {
  querystring: {
    type: "object",
    properties: {
      branchId: { type: "integer", minimum: 1 },
      // Owner-only override: non-owners' country querystring is silently
      // ignored (still validated, but the handler pins to scope.country).
      // CajaPage.vue:521-530 passes this when owner toggles AR/ES.
      country: { type: "string", minLength: 2, maxLength: 2 },
      kind: { type: "string", enum: KIND_ENUM },
      dateFrom: { type: "string", format: "date" },
      dateTo: { type: "string", format: "date" },
      memberId: { type: "integer", minimum: 1 },
      paymentMethod: { type: "string", enum: PAYMENT_METHOD_ENUM },
      search: { type: "string", maxLength: 200 },
      ...paginationQuerystring,
    },
    additionalProperties: false,
  },
  response: {
    // Loose response — properties listed for documentation/type-inference but
    // additionalProperties intentionally omitted (Fastify defaults to
    // passthrough for response serialization). Service-produced shapes
    // (TransactionListItem from transaction-service.ts) are trusted; no
    // sensitive fields are at risk of leaking. Matches reports/schemas.ts
    // loose-response convention. If a Phase 109 audit requires strict
    // response shapes, this comment is the gate to flip.
    200: {
      type: "object",
      properties: {
        rows: {
          type: "array",
          items: {
            type: "object",
            properties: transactionListItemProperties,
          },
        },
        total: { type: "integer" },
        page: { type: "integer" },
        limit: { type: "integer" },
      },
    },
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

// -- GET /transactions/summary — D-16 (CajaPage legacy summary) -----------

export const transactionsSummarySchema = {
  querystring: {
    type: "object",
    properties: {
      branchId: { type: "integer", minimum: 1 },
      // Owner-only override: same semantics as listTransactionsSchema above.
      country: { type: "string", minLength: 2, maxLength: 2 },
      dateFrom: { type: "string", format: "date" },
      dateTo: { type: "string", format: "date" },
    },
    additionalProperties: false,
  },
  response: {
    // Loose response — same passthrough rationale as listTransactionsSchema.
    // Service produces trusted FinanceSummary shape (5-key revenueByMethod
    // per Phase 106 widening; legacy CajaPage shape preserved for Plan 05).
    200: {
      type: "object",
      properties: {
        monthlyRevenue: { type: "integer" },
        revenueByMethod: {
          type: "object",
          properties: {
            cash: { type: "integer" },
            transfer: { type: "integer" },
            card: { type: "integer" },
            aura_credit: { type: "integer" },
            internal: { type: "integer" },
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
    },
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

// -- GET /members/:userId/financial-history — D-13 -------------------------

export const financialHistorySchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: { userId: { type: "integer", minimum: 1 } },
  },
  querystring: {
    type: "object",
    properties: {
      ...paginationQuerystring,
    },
    additionalProperties: false,
  },
  response: {
    // Loose response — properties listed for documentation/type-inference but
    // additionalProperties intentionally omitted on response objects. Service
    // produces trusted shape (FinancialHistoryItem from
    // TransactionService.getFinancialHistory). Matches the loose-response
    // pattern in listTransactionsSchema (see Plan 03 comment). If Phase 109
    // audit requires strict response shapes, this comment is the gate to flip.
    200: {
      type: "object",
      properties: {
        rows: {
          type: "array",
          items: {
            type: "object",
            properties: {
              // Loose passthrough — trusted shape from
              // TransactionService.getFinancialHistory(). Matches the
              // loose-response pattern in listTransactionsSchema (see Plan 03
              // comment). If Phase 109 audit requires strict response shapes,
              // this comment is the gate to flip.
              transaction: { type: "object" },
              links: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    targetKind: { type: "string", enum: TARGET_KIND_ENUM },
                    targetId: { type: "integer" },
                    allocatedAmount: { type: "integer" },
                    conceptLabel: { type: "string" },
                  },
                },
              },
              voidInfo: {
                type: "object",
                properties: {
                  voidedAt: { type: "string" },
                  voidedBy: { type: "integer" },
                  voidReason: { type: "string" },
                },
              },
            },
          },
        },
        total: { type: "integer" },
        page: { type: "integer" },
        limit: { type: "integer" },
      },
    },
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
