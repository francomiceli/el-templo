/**
 * Fastify JSON schemas for Reports API request/response validation.
 */

// =============================================================================
// Shared fragments
// =============================================================================

const errorSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
} as const;

const paginationQuerystring = {
  page: { type: "integer", minimum: 1 },
  limit: { type: "integer", minimum: 1, maximum: 100 },
} as const;

// =============================================================================
// Access Report Schema
// =============================================================================

export const accessReportSchema = {
  querystring: {
    type: "object",
    properties: {
      branchId: { type: "integer" },
      dateFrom: { type: "string", format: "date" },
      dateTo: { type: "string", format: "date" },
      search: { type: "string" },
      source: { type: "string", enum: ["qr", "manual"] },
      ...paginationQuerystring,
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        rows: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "integer" },
              checkedInAt: { type: "string" },
              memberName: { type: "string" },
              memberId: { type: "integer" },
              branchName: { type: "string" },
              source: { type: "string", enum: ["qr", "manual"] },
              scheduleSlot: { type: ["string", "null"] },
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
    500: errorSchema,
  },
} as const;

// =============================================================================
// Charge Report Schema
// =============================================================================

export const chargeReportSchema = {
  querystring: {
    type: "object",
    properties: {
      branchId: { type: "integer" },
      dateFrom: { type: "string", format: "date" },
      dateTo: { type: "string", format: "date" },
      search: { type: "string" },
      paymentMethod: { type: "string", enum: ["cash", "transfer", "card"] },
      ...paginationQuerystring,
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        rows: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "integer" },
              paymentDate: { type: "string" },
              memberName: { type: "string" },
              memberId: { type: "integer" },
              planName: { type: "string" },
              amount: { type: "number" },
              currency: { type: "string" },
              paymentMethod: {
                type: "string",
                enum: ["cash", "transfer", "card"],
              },
              recorderName: { type: "string" },
              voidedAt: { type: ["string", "null"] },
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
    500: errorSchema,
  },
} as const;

// =============================================================================
// Expiring Report Schema
// =============================================================================

export const expiringReportSchema = {
  querystring: {
    type: "object",
    properties: {
      branchId: { type: "integer" },
      daysWindow: { type: "integer", minimum: 1 },
      includeExpired: { type: "boolean" },
    },
  },
  response: {
    200: {
      type: "array",
      items: {
        type: "object",
        properties: {
          userId: { type: "integer" },
          memberName: { type: "string" },
          planName: { type: "string" },
          endDate: { type: "string" },
          daysRemaining: { type: "integer" },
          phone: { type: ["string", "null"] },
          currency: { type: "string" },
        },
      },
    },
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

// =============================================================================
// Inactive Report Schema
// =============================================================================

export const inactiveReportSchema = {
  querystring: {
    type: "object",
    properties: {
      branchId: { type: "integer" },
      daysThreshold: { type: "integer", minimum: 1 },
    },
  },
  response: {
    200: {
      type: "array",
      items: {
        type: "object",
        properties: {
          userId: { type: "integer" },
          memberName: { type: "string" },
          planName: { type: "string" },
          lastCheckIn: { type: ["string", "null"] },
          daysSinceCheckIn: { type: "integer" },
          phone: { type: ["string", "null"] },
        },
      },
    },
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

// =============================================================================
// Trial Conversion Report Schema (Phase 102-07)
// =============================================================================

export const trialConversionReportSchema = {
  querystring: {
    type: "object",
    properties: {
      branchId: { type: "integer" },
      dateFrom: { type: "string", format: "date" },
      dateTo: { type: "string", format: "date" },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["totals", "byBranch", "byHourSlot", "byShift", "pendingLeads"],
      properties: {
        totals: {
          type: "object",
          properties: {
            trialsCount: { type: "integer" },
            convertedCount: { type: "integer" },
            conversionRatePct: { type: "number" },
            medianDaysToConvert: { type: ["number", "null"] },
            revenueFromConverted: { type: "number" },
            revenuePerTrial: { type: "number" },
          },
        },
        byBranch: {
          type: "array",
          items: {
            type: "object",
            properties: {
              branchId: { type: "integer" },
              branchName: { type: "string" },
              trialsCount: { type: "integer" },
              convertedCount: { type: "integer" },
              conversionRatePct: { type: "number" },
            },
          },
        },
        byHourSlot: {
          type: "array",
          items: {
            type: "object",
            properties: {
              hour: { type: "string" },
              trialsCount: { type: "integer" },
              convertedCount: { type: "integer" },
              conversionRatePct: { type: "number" },
            },
          },
        },
        byShift: {
          type: "array",
          items: {
            type: "object",
            properties: {
              shift: { type: "string", enum: ["TM", "TT"] },
              trialsCount: { type: "integer" },
              convertedCount: { type: "integer" },
              conversionRatePct: { type: "number" },
            },
          },
        },
        pendingLeads: {
          type: "array",
          items: {
            type: "object",
            properties: {
              userId: { type: "integer" },
              firstName: { type: "string" },
              lastName: { type: "string" },
              phone: { type: ["string", "null"] },
              branchId: { type: "integer" },
              branchName: { type: "string" },
              trialDate: { type: "string" },
              daysSinceTrial: { type: "integer" },
            },
          },
        },
      },
    },
    400: errorSchema,
  },
} as const;

// =============================================================================
// Export Schemas (same querystrings, binary response)
// =============================================================================

// =============================================================================
// Outstanding Balances Schema (CAJA-03 — Deudas / aging report)
// =============================================================================
//
// Phase 109-02. Querystring matches OutstandingBalancesFilters; response
// matches OutstandingBalancesResult. bucketTotals is intentionally typed as
// `object` (not a strict shape) because the value flips between flat
// BucketTotals (non-owner) and a per-currency keyed map (owner) per D-06.
// fast-json-stringify won't strip nested fields under `additionalProperties`
// by default for type:"object" with no `properties`, but to be safe we set
// additionalProperties:true so the per-currency keyed shape passes through.

export const outstandingBalancesSchema = {
  querystring: {
    type: "object",
    properties: {
      branchId: { type: "integer", minimum: 1 },
      // Owner-only override consumed by attachCountryScope; non-owners' value
      // is ignored by the hook (defense in depth per country-scope.ts).
      country: { type: "string", enum: ["AR", "ES"] },
      // balances.currency is varchar(3) ('ARS'|'EUR'). Schema permissive on
      // length (2-4) so future ISO 4217 additions don't require a migration
      // here.
      currency: { type: "string", minLength: 2, maxLength: 4 },
      search: { type: "string", maxLength: 100 },
      page: { type: "integer", minimum: 1 },
      limit: { type: "integer", minimum: 1, maximum: 200 },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: "object",
      properties: {
        rows: {
          type: "array",
          items: {
            type: "object",
            properties: {
              memberId: { type: "integer" },
              memberName: { type: "string" },
              branchId: { type: ["integer", "null"] },
              branchName: { type: ["string", "null"] },
              targetKind: {
                type: "string",
                enum: ["subscription", "debt_balance"],
              },
              targetId: { type: "integer" },
              conceptLabel: { type: "string" },
              amount: { type: "integer" },
              currency: { type: "string" },
              effectiveDate: { type: "string" },
              ageInDays: { type: "integer" },
              bucket: {
                type: "string",
                enum: ["0-30", "31-60", "61-90", "90+"],
              },
            },
          },
        },
        total: { type: "integer" },
        page: { type: "integer" },
        limit: { type: "integer" },
        // Owner: keyed by currency. Non-owner: flat per-bucket. Allow both.
        bucketTotals: { type: "object", additionalProperties: true },
      },
    },
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

/**
 * Phase 109-04 — Export schema for outstanding-balances. Mirrors the
 * listing querystring minus pagination (server returns full filtered
 * set in one .xlsx). Response is binary, so no `response: 200` schema.
 */
export const outstandingBalancesExportSchema = {
  querystring: {
    type: "object",
    properties: {
      branchId: { type: "integer", minimum: 1 },
      country: { type: "string", enum: ["AR", "ES"] },
      currency: { type: "string", minLength: 2, maxLength: 4 },
      search: { type: "string", maxLength: 100 },
    },
    additionalProperties: false,
  },
  response: {
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

export const accessExportSchema = {
  querystring: accessReportSchema.querystring,
} as const;

export const chargeExportSchema = {
  querystring: chargeReportSchema.querystring,
} as const;

export const expiringExportSchema = {
  querystring: expiringReportSchema.querystring,
} as const;

export const inactiveExportSchema = {
  querystring: inactiveReportSchema.querystring,
} as const;
