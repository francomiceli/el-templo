/**
 * Fastify JSON schemas for Analytics API request/response validation.
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

const analyticsQuerystring = {
  type: "object",
  properties: {
    branchId: { type: "integer" },
    dateFrom: { type: "string", format: "date" },
    dateTo: { type: "string", format: "date" },
  },
} as const;

const trendSchema = {
  type: "object",
  properties: {
    direction: { type: "string", enum: ["up", "down", "flat"] },
    percentage: { type: "number" },
  },
} as const;

const kpiValueSchema = {
  type: "object",
  properties: {
    value: { type: "number" },
    trend: trendSchema,
  },
} as const;

// Phase 117 D-05: monetary KPI split per currency (ARS/EUR never summed).
const monetaryKpiByCurrencySchema = {
  type: "object",
  properties: {
    ARS: kpiValueSchema,
    EUR: kpiValueSchema,
  },
} as const;

// Phase 117 D-05: a pair of revenue totals keyed by currency.
const revenueByCurrencySchema = {
  type: "object",
  properties: {
    ARS: { type: "number" },
    EUR: { type: "number" },
  },
} as const;

// =============================================================================
// KPI Schema
// =============================================================================

export const kpiSchema = {
  querystring: analyticsQuerystring,
  response: {
    200: {
      type: "object",
      properties: {
        activeMembers: kpiValueSchema,
        monthlyRevenue: monetaryKpiByCurrencySchema,
        dailyAttendanceAvg: kpiValueSchema,
      },
    },
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

// =============================================================================
// Member Analytics Schema
// =============================================================================

export const memberAnalyticsSchema = {
  querystring: analyticsQuerystring,
  response: {
    200: {
      type: "object",
      properties: {
        newMembers: { type: "integer" },
        churnedMembers: { type: "integer" },
        retentionRate: { type: "number" },
        planDistribution: {
          type: "array",
          items: {
            type: "object",
            properties: {
              planName: { type: "string" },
              country: { type: "string" },
              count: { type: "integer" },
            },
          },
        },
        attentionList: {
          type: "array",
          items: {
            type: "object",
            properties: {
              userId: { type: "integer" },
              firstName: { type: ["string", "null"] },
              lastName: { type: ["string", "null"] },
              planName: { type: "string" },
              phone: { type: ["string", "null"] },
              // Phase 117 D-14: 'overdue' added alongside 'expiring'.
              type: { type: "string", enum: ["expiring", "overdue"] },
              daysUntilExpiry: { type: ["integer", "null"] },
              daysOverdue: { type: ["integer", "null"] },
              // Phase 117 D-16/D-17: fast-json-stringify STRIPS undeclared
              // fields — these MUST be declared or yaPago/segment vanish from
              // the wire (lesson Phase 106-04/109-02).
              yaPago: { type: "boolean" },
              segment: {
                type: ["string", "null"],
                enum: [
                  "nuevo",
                  "espartano",
                  "intermitente",
                  "en_riesgo",
                  "digital_warrior",
                  "ghost",
                  null,
                ],
              },
            },
          },
        },
        // Phase 117 D-15: operational renewal rate 7/14/30.
        renewalRate: {
          type: "object",
          properties: {
            last7: { type: "integer" },
            last14: { type: "integer" },
            last30: { type: "integer" },
          },
        },
      },
    },
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

// =============================================================================
// Attendance Analytics Schema
// =============================================================================

export const attendanceAnalyticsSchema = {
  querystring: analyticsQuerystring,
  response: {
    200: {
      type: "object",
      properties: {
        dailyCheckins: {
          type: "array",
          items: {
            type: "object",
            properties: {
              date: { type: "string" },
              count: { type: "integer" },
            },
          },
        },
        peakHoursHeatmap: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dayOfWeek: { type: "integer" },
              hour: { type: "integer" },
              averageOccupancy: { type: "number" },
            },
          },
        },
        slotOccupancy: {
          type: "array",
          items: {
            type: "object",
            properties: {
              scheduleId: { type: "integer" },
              activityName: { type: "string" },
              dayOfWeek: { type: "integer" },
              startTime: { type: "string" },
              averageOccupancy: { type: "number" },
            },
          },
        },
        noShowRate: { type: "number" },
      },
    },
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

// =============================================================================
// Attendance Metrics Schemas (Phase 117 D-11 / D-13)
// =============================================================================

// GET /attendance/unique-members — { last7, last14, last30 }
export const uniqueMembersSchema = {
  querystring: analyticsQuerystring,
  response: {
    200: {
      type: "object",
      properties: {
        last7: { type: "integer" },
        last14: { type: "integer" },
        last30: { type: "integer" },
      },
    },
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

// GET /attendance/checkin-adoption — array of per-branch rows
export const checkInAdoptionSchema = {
  querystring: analyticsQuerystring,
  response: {
    200: {
      type: "array",
      items: {
        type: "object",
        properties: {
          branchId: { type: "integer" },
          branchName: { type: "string" },
          confirmados: { type: "integer" },
          conCheckin: { type: "integer" },
          ratio: { type: "number" },
        },
      },
    },
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

// =============================================================================
// Engagement Schema (Phase 117 D-12)
// =============================================================================

// GET /engagement — { counts: SegmentCounts, nominalList: EngagementMember[] }
export const engagementSchema = {
  querystring: analyticsQuerystring,
  response: {
    200: {
      type: "object",
      properties: {
        counts: {
          type: "object",
          properties: {
            nuevo: { type: "integer" },
            espartano: { type: "integer" },
            intermitente: { type: "integer" },
            en_riesgo: { type: "integer" },
            digital_warrior: { type: "integer" },
            ghost: { type: "integer" },
            sinSegmento: { type: "integer" },
          },
        },
        nominalList: {
          type: "array",
          items: {
            type: "object",
            properties: {
              userId: { type: "integer" },
              firstName: { type: ["string", "null"] },
              lastName: { type: ["string", "null"] },
              planName: { type: ["string", "null"] },
              phone: { type: ["string", "null"] },
              segment: { type: "string", enum: ["en_riesgo", "ghost"] },
            },
          },
        },
      },
    },
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

// =============================================================================
// Financial Analytics Schema
// =============================================================================

export const financialAnalyticsSchema = {
  querystring: analyticsQuerystring,
  response: {
    200: {
      type: "object",
      properties: {
        revenueTrend: {
          type: "array",
          items: {
            type: "object",
            properties: {
              month: { type: "string" },
              ARS: { type: "number" },
              EUR: { type: "number" },
            },
          },
        },
        revenueByMethod: {
          type: "object",
          properties: {
            cash: revenueByCurrencySchema,
            transfer: revenueByCurrencySchema,
            card: revenueByCurrencySchema,
          },
        },
        revenueByBranch: {
          type: "array",
          items: {
            type: "object",
            properties: {
              branchId: { type: "integer" },
              branchName: { type: "string" },
              ARS: { type: "number" },
              EUR: { type: "number" },
            },
          },
        },
        outstandingByCurrency: {
          type: "object",
          properties: {
            ARS: { type: "number" },
            EUR: { type: "number" },
          },
        },
      },
    },
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;
