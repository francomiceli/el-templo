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
      // Expiration date range (YYYY-MM-DD). When both are present the report
      // lists subscriptions whose end_date falls within [dateFrom, dateTo] and
      // daysWindow/includeExpired are ignored.
      dateFrom: { type: "string", format: "date" },
      dateTo: { type: "string", format: "date" },
      daysWindow: { type: "integer", minimum: 1 },
      includeExpired: { type: "boolean" },
      // When false/omitted, members who already have future coverage of the
      // same category (an active/paused/scheduled subscription ending after
      // the expiring one) are hidden — they already renewed, so they are not
      // a renewal target. Set true to surface them flagged.
      includeRenewed: { type: "boolean" },
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
          branchId: { type: "integer" },
          branchName: { type: "string" },
          planName: { type: "string" },
          endDate: { type: "string" },
          daysRemaining: { type: "integer" },
          phone: { type: ["string", "null"] },
          currency: { type: "string" },
          hasFutureCoverage: { type: "boolean" },
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
              memberPhone: { type: ["string", "null"] },
              branchId: { type: ["integer", "null"] },
              branchName: { type: ["string", "null"] },
              targetKind: {
                type: "string",
                enum: ["subscription", "debt_balance"],
              },
              targetId: { type: "integer" },
              conceptLabel: { type: "string" },
              // Phase 153 (DEUDA-01/02/03) — enriched fields for "Por deuda".
              reasonLabel: { type: "string" },
              periodStart: { type: ["string", "null"] },
              periodEnd: { type: ["string", "null"] },
              registeredAt: { type: "string" },
              notes: { type: ["string", "null"] },
              amount: { type: "integer" },
              currency: { type: "string" },
              effectiveDate: { type: "string" },
              ageInDays: { type: "integer" },
              bucket: {
                type: "string",
                enum: ["0-5", "6-10", "11-15", "15+"],
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

// =============================================================================
// Expired Members Schema (DEUDA-04 — "Vencidos" tab, Phase 153-02)
// =============================================================================
//
// Members whose plan expired within the last 60 days without renewing (D-05).
// Renewal leads, NOT debts — the row carries NO amount/currency (D-06). Mirrors
// outstandingBalancesSchema's querystring (minus currency) and paginated shape.

export const expiredMembersSchema = {
  querystring: {
    type: "object",
    properties: {
      branchId: { type: "integer", minimum: 1 },
      // Owner-only override consumed by attachCountryScope; non-owners' value
      // is ignored by the hook (defense in depth per country-scope.ts).
      country: { type: "string", enum: ["AR", "ES"] },
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
              userId: { type: "integer" },
              memberName: { type: "string" },
              memberPhone: { type: ["string", "null"] },
              planName: { type: "string" },
              expiryDate: { type: "string" },
              daysOverdue: { type: "integer" },
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
// Trial Sessions Report Schema (Phase 114-05)
// =============================================================================
//
// One row per lead (D-03 / D-42 / D-43). Listing endpoint is paginated;
// export endpoint shares the same filters minus pagination and returns
// binary CSV (response schema omitted on purpose).
//
// `leadStatus` is multi-value: accepted as a single string OR an array of
// strings via JSON Schema `anyOf` (the existing reports module uses Fastify's
// default AJV configuration; AJV's array coercion via `coerceTypes: 'array'`
// is not enabled here, so we accept both shapes explicitly).
//
// `gestionaUserId` (D-44): the schema accepts the value. The route handler
// silently strips it when the caller is not owner — schema-level rejection
// would leak the existence of an owner-only filter to non-owners.
//
// Row sub-objects use `additionalProperties: true` on `createdBy` so
// fast-json-stringify does not silently strip the `userId` / `name` fields
// (mirrors the Plan 106-04 SUMMARY note).

const trialSessionsQuerystringProps = {
  branchId: { type: "integer", minimum: 1 },
  country: { type: "string", enum: ["AR", "ES"] },
  dateFrom: { type: "string", format: "date" },
  dateTo: { type: "string", format: "date" },
  leadStatus: {
    anyOf: [
      { type: "string", enum: ["en_seguimiento", "ganado", "perdido"] },
      {
        type: "array",
        items: {
          type: "string",
          enum: ["en_seguimiento", "ganado", "perdido"],
        },
      },
    ],
  },
  attended: { type: "string", enum: ["true", "false", "pending"] },
  shift: { type: "string", enum: ["TM", "TT"] },
  gestionaUserId: { type: "integer", minimum: 1 },
  daysWithoutConvertingMin: { type: "integer", minimum: 0 },
  search: { type: "string", maxLength: 100 },
  leadStatusSource: { type: "string", enum: ["auto", "manual"] },
} as const;

const trialSessionsRowSchema = {
  type: "object",
  properties: {
    bookingId: { type: "integer" },
    userId: { type: "integer" },
    lead: { type: "string" },
    bookingDate: { type: "string" },
    bookingCreatedAt: { type: "string" },
    startTime: { type: "string" },
    branchId: { type: "integer" },
    branchName: { type: "string" },
    attended: {
      anyOf: [{ type: "string", enum: ["si", "no"] }, { type: "null" }],
    },
    leadStatus: {
      anyOf: [
        {
          type: "string",
          enum: ["en_seguimiento", "ganado", "perdido"],
        },
        { type: "null" },
      ],
    },
    leadStatusEffective: {
      type: "string",
      enum: ["en_seguimiento", "ganado", "perdido"],
    },
    createdBy: {
      anyOf: [
        {
          type: "object",
          properties: {
            userId: { type: "integer" },
            name: { type: "string" },
          },
          additionalProperties: true,
        },
        { type: "null" },
      ],
    },
    leadNotes: { type: ["string", "null"] },
    purchasedPlanId: { type: ["integer", "null"] },
    purchasedPlanName: { type: ["string", "null"] },
    shift: { type: "string", enum: ["TM", "TT"] },
    period: { type: "string" },
    weekRange: { type: "string" },
    daysSinceTrial: { type: "integer" },
    converted: { type: "boolean" },
    reschedules: { type: "integer" },
    leadStatusSource: {
      anyOf: [{ type: "string", enum: ["auto", "manual"] }, { type: "null" }],
    },
    phone: { type: ["string", "null"] },
  },
} as const;

export const trialSessionsReportSchema = {
  querystring: {
    type: "object",
    properties: {
      ...trialSessionsQuerystringProps,
      page: { type: "integer", minimum: 1 },
      limit: { type: "integer", minimum: 1, maximum: 200 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        rows: {
          type: "array",
          items: trialSessionsRowSchema,
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

export const trialSessionsExportSchema = {
  querystring: {
    type: "object",
    properties: trialSessionsQuerystringProps,
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
