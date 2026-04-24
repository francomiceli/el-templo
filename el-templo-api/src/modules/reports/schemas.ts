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
