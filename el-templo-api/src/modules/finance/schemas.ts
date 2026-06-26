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
  // Phase 139: movimiento inter-caja + egreso (filterable for the caja history).
  "cash_transfer",
  "expense",
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
    properties: {
      reason: { type: "string", minLength: 1, maxLength: 1000 },
      // Phase 137 (VAL-06 / D-10): when false, void() cancels the linked
      // subscription atomically. Default true (sub untouched).
      keepMembershipActive: { type: "boolean" },
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

// -- POST /transactions/:id/validate — Phase 137 VAL-03 --------------------

export const validateTransactionSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "integer", minimum: 1 } },
  },
  // Phase 146 (CAJA-02/CAJA-03): body opcional. Gestion puede confirmar o CAMBIAR
  // la caja imputada al validar (incl. elegir entre cuentas banco Galicia/Mercado
  // Pago). Omitido → conserva la caja sugerida (retrocompatible). El tipo incluye
  // "null" para que una validacion SIN body (request.body=null) siga pasando
  // (retrocompat: el endpoint previo no tenia body). La coherencia
  // (existe/activa/moneda) se valida server-side en transactionService.validate.
  body: {
    type: ["object", "null"],
    properties: {
      cashRegisterId: { type: "integer", minimum: 1 },
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

// -- POST /transactions/:id/observe — Phase 137 VAL-04 / D-04 --------------

export const observeTransactionSchema = {
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

// -- POST /transactions/:id/correct — Phase 137 VAL-04 / D-05 --------------

/**
 * D-05: correct() = anular + recrear. `correctedFields` is a subset of
 * amount/memberId/paymentMethod (the typical mis-load errors); the rest is
 * copied from the original. At least one field is required so a correction
 * actually changes something (validated by minProperties: 1).
 */
export const correctTransactionSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "integer", minimum: 1 } },
  },
  body: {
    type: "object",
    required: ["correctedFields"],
    properties: {
      correctedFields: {
        type: "object",
        minProperties: 1,
        properties: {
          amount: { type: "integer", minimum: 0 },
          memberId: { type: "integer", minimum: 1 },
          paymentMethod: { type: "string", enum: PAYMENT_METHOD_ENUM },
        },
        additionalProperties: false,
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

// -- GET /transactions/pending-misc/:memberId — Phase 146 (plan 03) --------

/**
 * GET /transactions/pending-misc/:memberId — cobros sueltos (advance_payment)
 * pendientes no anulados del socio. RBAC: FINANCE_VOID_ROLES per-handler (LOW 2 —
 * devuelve datos financieros del socio, NO abierto a recepcion/coach). Loose
 * response (passthrough) — el shape (PendingMiscItem) viene del service y es de
 * confianza.
 */
export const pendingMiscForMemberSchema = {
  params: {
    type: "object",
    required: ["memberId"],
    properties: { memberId: { type: "integer", minimum: 1 } },
  },
  response: {
    200: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: { type: "object", additionalProperties: true },
        },
      },
    },
    401: errorSchema,
    403: errorSchema,
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
        // Phase 109 D-11 — `revenueByKind` additive field. Same loose-
        // passthrough rationale as the parent response (service produces
        // trusted RevenueByKind shape). All 5 kinds always present;
        // defaults 0. `refund` is 0 by design (outflow-only convention).
        revenueByKind: {
          type: "object",
          properties: {
            plan_charge: { type: "integer" },
            debt_settlement: { type: "integer" },
            refund: { type: "integer" },
            adjustment: { type: "integer" },
            advance_payment: { type: "integer" },
            // Phase 139: the 2 new kinds. Always 0 (getSummary excludes them via
            // MUST-FIX A) but present so the response shape matches RevenueByKind.
            cash_transfer: { type: "integer" },
            expense: { type: "integer" },
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
              // comment). additionalProperties:true is REQUIRED here because
              // Fastify uses fast-json-stringify for response serialization
              // and STRIPS unlisted fields by default — without it the entire
              // FinancialTransactionRow is wiped to {}. If Phase 109 audit
              // requires strict response shapes, this comment is the gate to
              // flip (replace with full property listing à la
              // transactionListItemProperties).
              transaction: { type: "object", additionalProperties: true },
              links: {
                type: "array",
                items: {
                  type: "object",
                  // Same passthrough rationale as `transaction` above.
                  additionalProperties: true,
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
                // Same passthrough rationale as `transaction` above.
                additionalProperties: true,
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

// -- GET /members/:userId/outstanding-concepts — Phase 108 D-01..D-06 ------

/**
 * Phase 108 — GET /api/admin/members/:userId/outstanding-concepts
 *
 * - D-01: response shape array de conceptos con saldo abierto (FIFO).
 * - D-02: NO paginación — un alumno casi nunca tiene >20 saldos abiertos.
 * - D-03: cuando no hay saldos, retornar { concepts: [] } (no 404).
 *
 * Loose response — `additionalProperties: true` mantiene los campos del
 * service intactos a través de fast-json-stringify. Match con el comment
 * en financialHistorySchema (líneas 287-294).
 */
export const outstandingConceptsSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: { userId: { type: "integer", minimum: 1 } },
  },
  response: {
    200: {
      type: "object",
      properties: {
        concepts: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
            properties: {
              targetKind: {
                type: "string",
                enum: ["subscription", "debt_balance"],
              },
              targetId: { type: "integer", minimum: 1 },
              description: { type: "string" },
              currency: { type: "string" },
              balance: { type: "integer", minimum: 1 },
              ageInDays: { type: "integer", minimum: 0 },
              effectiveDate: { type: "string", format: "date" },
            },
          },
        },
      },
    },
    401: errorSchema,
    403: errorSchema,
    404: errorSchema,
    500: errorSchema,
  },
} as const;

// -- GET /transactions/export — Phase 109 D-15 (Excel export) ------------

/**
 * Phase 109 D-15 — Excel export endpoint for CajaPage.
 *
 * Same querystring shape as listTransactionsSchema MINUS `page`/`limit`
 * (server returns ALL matching rows in one shot). Response is a binary
 * .xlsx attachment, so no JSON response schema is registered (Fastify
 * skips response validation when the route returns a Buffer with the
 * correct Content-Type — same pattern as reports/*\/export endpoints).
 */
export const exportTransactionsSchema = {
  querystring: {
    type: "object",
    properties: {
      branchId: { type: "integer", minimum: 1 },
      country: { type: "string", minLength: 2, maxLength: 2 },
      kind: { type: "string", enum: KIND_ENUM },
      dateFrom: { type: "string", format: "date" },
      dateTo: { type: "string", format: "date" },
      memberId: { type: "integer", minimum: 1 },
      paymentMethod: { type: "string", enum: PAYMENT_METHOD_ENUM },
      search: { type: "string", maxLength: 200 },
    },
    additionalProperties: false,
  },
  response: {
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

// -- Phase 139: movimientos inter-caja + egresos ---------------------------

/**
 * POST /movements — registrar un movimiento inter-caja (MOV-01/MOV-02).
 * Body: origenCajaId + destinoCajaId + amount (> 0) + countedAmount opcional
 * (reconciliación física, D-04) + notes opcional. La moneda se deriva de las
 * cajas (guard same-currency en el servicio); NUNCA del body. El rol se valida
 * server-side (FINANCE_VOID_ROLES) — nunca del body (D-03 / T-139-06).
 */
export const registerMovementSchema = {
  body: {
    type: "object",
    required: ["origenCajaId", "destinoCajaId", "amount"],
    properties: {
      origenCajaId: { type: "integer", minimum: 1 },
      destinoCajaId: { type: "integer", minimum: 1 },
      amount: { type: "integer", minimum: 1 },
      // D-04: conteo físico de la caja origen al momento. Cero es válido (caja
      // vacía contada). Omitido = sin ajuste de reconciliación.
      countedAmount: { type: "integer", minimum: 0 },
      notes: { type: ["string", "null"], maxLength: 2000 },
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

/**
 * POST /expenses — registrar un egreso (MOV-03 / D-05). Body: cajaId + amount
 * (> 0) + notes opcional. Sin categoría en v1. RBAC server-side.
 */
export const registerExpenseSchema = {
  body: {
    type: "object",
    required: ["cajaId", "amount"],
    properties: {
      cajaId: { type: "integer", minimum: 1 },
      amount: { type: "integer", minimum: 1 },
      notes: { type: ["string", "null"], maxLength: 2000 },
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

/**
 * POST /movements/:id/void + POST /expenses/:id/void — anular (MOV-04 / D-08).
 * Params: id (cualquier pata del movimiento, o la fila del egreso). Body: reason
 * obligatorio. RBAC server-side (FINANCE_VOID_ROLES). Mirror de
 * voidTransactionSchema sin keepMembershipActive (movimientos/egresos no tienen
 * suscripción).
 */
export const voidMovementSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "integer", minimum: 1 } },
  },
  body: {
    type: "object",
    required: ["reason"],
    properties: {
      reason: { type: "string", minLength: 1, maxLength: 1000 },
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

// -- Phase 141: reportes para la admin (REP-01 / REP-02 / REP-04) ----------

const PENDING_TRAY_STATUS_ENUM = ["pendientes", "observados", "todos"] as const;

/**
 * GET /pending-tray — bandeja de pendientes (REP-01). Querystring: status
 * (Pendientes/Observados/Todos, D-04), owner-override country, branchId,
 * dateFrom/dateTo, page/limit. Loose response (passthrough) like
 * listTransactionsSchema — the service shape (PendingTrayItem) is trusted.
 */
export const pendingTraySchema = {
  querystring: {
    type: "object",
    properties: {
      status: { type: "string", enum: PENDING_TRAY_STATUS_ENUM },
      country: { type: "string", minLength: 2, maxLength: 2 },
      branchId: { type: "integer", minimum: 1 },
      dateFrom: { type: "string", format: "date" },
      dateTo: { type: "string", format: "date" },
      ...paginationQuerystring,
    },
    additionalProperties: false,
  },
  response: {
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

/**
 * GET /pending-tray/export — same querystring as pendingTraySchema MINUS
 * page/limit (server returns ALL matching rows). Binary .xlsx attachment, so
 * no JSON response schema is registered (mirror exportTransactionsSchema).
 */
export const pendingTrayExportSchema = {
  querystring: {
    type: "object",
    properties: {
      status: { type: "string", enum: PENDING_TRAY_STATUS_ENUM },
      country: { type: "string", minLength: 2, maxLength: 2 },
      branchId: { type: "integer", minimum: 1 },
      dateFrom: { type: "string", format: "date" },
      dateTo: { type: "string", format: "date" },
    },
    additionalProperties: false,
  },
  response: {
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

/**
 * GET /cash-registers/balances — saldos por caja (REP-02). Querystring: only
 * `country` (owner override; non-owner scope is pinned server-side). Loose
 * response (flat CajaSaldoRow array).
 */
export const cashBalancesSchema = {
  querystring: {
    type: "object",
    properties: {
      country: { type: "string", minLength: 2, maxLength: 2 },
    },
    additionalProperties: false,
  },
  response: {
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

/**
 * GET /cash-registers/balances/export — same querystring as cashBalancesSchema.
 * Binary .xlsx attachment; no JSON response schema.
 */
export const cashBalancesExportSchema = {
  querystring: {
    type: "object",
    properties: {
      country: { type: "string", minLength: 2, maxLength: 2 },
    },
    additionalProperties: false,
  },
  response: {
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

/**
 * GET /movements-history — historial mov/egresos (REP-03). Querystring:
 * cashRegisterId, owner-override country, dateFrom/dateTo (período),
 * page/limit. Loose response (passthrough) like listTransactionsSchema — the
 * service shape (MovEgresoItem) is trusted.
 */
export const movementsHistorySchema = {
  querystring: {
    type: "object",
    properties: {
      cashRegisterId: { type: "integer", minimum: 1 },
      country: { type: "string", minLength: 2, maxLength: 2 },
      dateFrom: { type: "string", format: "date" },
      dateTo: { type: "string", format: "date" },
      ...paginationQuerystring,
    },
    additionalProperties: false,
  },
  response: {
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

/**
 * GET /movements-history/export — same querystring as movementsHistorySchema
 * MINUS page/limit (server returns ALL matching rows). Binary .xlsx attachment,
 * so no JSON response schema is registered (mirror exportTransactionsSchema).
 */
export const movementsHistoryExportSchema = {
  querystring: {
    type: "object",
    properties: {
      cashRegisterId: { type: "integer", minimum: 1 },
      country: { type: "string", minLength: 2, maxLength: 2 },
      dateFrom: { type: "string", format: "date" },
      dateTo: { type: "string", format: "date" },
    },
    additionalProperties: false,
  },
  response: {
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

// -- Phase 142 (MIG-01 / D-06): config de caja (umbral de pendientes) -------

/**
 * GET /config/overdue-threshold — read the current pending-overdue threshold.
 * Owner/admin only (enforced per-handler with ADMIN_ROLES; the module guard is
 * the more permissive FINANCE_READ_ROLES). No body/querystring.
 */
export const getOverdueThresholdSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        thresholdDays: { type: "integer" },
      },
      required: ["thresholdDays"],
      additionalProperties: false,
    },
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

/**
 * PUT /config/overdue-threshold — set the threshold. Body validation enforces a
 * positive integer in [1, 365] so an absurd/negative value can't poison the
 * global overdue counter (→ 400 on violation, no write). Owner/admin only.
 */
export const putOverdueThresholdSchema = {
  body: {
    type: "object",
    properties: {
      thresholdDays: { type: "integer", minimum: 1, maximum: 365 },
    },
    required: ["thresholdDays"],
    additionalProperties: false,
  },
  response: {
    200: {
      type: "object",
      properties: {
        thresholdDays: { type: "integer" },
      },
      required: ["thresholdDays"],
      additionalProperties: false,
    },
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

// -- Re-exported helper fragments for Plan 03 (reads) ----------------------

export const SHARED_ERROR_SCHEMA = errorSchema;
export const SHARED_PAGINATION_QUERYSTRING = paginationQuerystring;
export const SHARED_KIND_ENUM = KIND_ENUM;
export const SHARED_PAYMENT_METHOD_ENUM = PAYMENT_METHOD_ENUM;
