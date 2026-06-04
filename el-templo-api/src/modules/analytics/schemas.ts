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
// Retention Schema (Phase 118 D-04/D-05/D-06)
// =============================================================================

// Querystring extends the shared analytics querystring with an optional plan
// filter (follow-up): exact match on subscriptions.plan_id. Absent → no filter.
const retentionQuerystring = {
  type: "object",
  properties: {
    branchId: { type: "integer" },
    dateFrom: { type: "string", format: "date" },
    dateTo: { type: "string", format: "date" },
    planId: { type: "integer" },
  },
} as const;

// GET /retention — cohorts of plan cycles + cycle distribution.
export const retentionSchema = {
  querystring: retentionQuerystring,
  response: {
    200: {
      type: "object",
      properties: {
        cohorts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              cohort: { type: "string" },
              size: { type: "integer" },
              cycleRetention: {
                type: "array",
                items: { type: "number" },
              },
            },
          },
        },
        maxCycle: { type: "integer" },
        cycleDistribution: {
          type: "object",
          properties: {
            ciclo1: { type: "integer" },
            ciclo2: { type: "integer" },
            ciclo3plus: { type: "integer" },
          },
        },
        invalidWindowSubs: { type: "integer" },
        availablePlans: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "integer" },
              name: { type: "string" },
              durationDays: { type: ["integer", "null"] },
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
// Funnel Schema (Phase 118 D-01/D-03)
// =============================================================================

// Querystring extends the shared analytics querystring with an optional
// entry-origin segment (funnel follow-up). `all` (or absent) = classic 3-stage
// funnel; `directo`/`freemium` = 2-stage prueba → activo by trial origin.
const funnelQuerystring = {
  type: "object",
  properties: {
    branchId: { type: "integer" },
    dateFrom: { type: "string", format: "date" },
    dateTo: { type: "string", format: "date" },
    entryOrigin: {
      type: "string",
      enum: ["all", "directo", "freemium"],
    },
  },
} as const;

// GET /funnel — conversion funnel freemium → prueba → activo by cohort. Medians
// are nullable integers (null when a cohort had no converters — never NaN).
export const funnelSchema = {
  querystring: funnelQuerystring,
  response: {
    200: {
      type: "object",
      properties: {
        cohorts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              cohortMonth: { type: "string" },
              size: { type: "integer" },
              toPruebaPct: { type: "number" },
              toActivoPct: { type: "number" },
              medianDaysFreemiumToPrueba: { type: ["number", "null"] },
              medianDaysPruebaToActivo: { type: ["number", "null"] },
            },
          },
        },
        entryOrigin: {
          type: "string",
          enum: ["all", "directo", "freemium"],
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
// Advanced Finance Schema (Phase 118 D-07/D-08)
// =============================================================================

// A per-month series item carrying both currencies (never summed).
const monthlyByCurrencyItem = {
  type: "object",
  properties: {
    month: { type: "string" },
    ARS: { type: "number" },
    EUR: { type: "number" },
  },
} as const;

// GET /advanced-finance — caja + devengado prorrateado + ARPU, por moneda.
export const advancedFinanceSchema = {
  querystring: analyticsQuerystring,
  response: {
    200: {
      type: "object",
      properties: {
        cashTrend: { type: "array", items: monthlyByCurrencyItem },
        accruedTrend: { type: "array", items: monthlyByCurrencyItem },
        arpu: { type: "array", items: monthlyByCurrencyItem },
        excludedInvalidWindow: { type: "integer" },
      },
    },
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

// =============================================================================
// Ticket promedio Schema (Phase 120 Block 6 — TICKET-01..04)
// =============================================================================

// CRITICAL (lesson 106-04/109-02, schemas.ts:119-121): fast-json-stringify STRIPS
// any field not declared here — every ticket field below (incl. the cohort split,
// nullable discount/average fields, and excludedNoLink) MUST be declared or it
// vanishes from the wire.

// A `{ average, n }` cohort figure; `average` is nullable (null when empty cohort).
const ticketCohortAverageSchema = {
  type: "object",
  properties: {
    average: { type: ["number", "null"] },
    n: { type: "integer" },
  },
} as const;

// The list-price vs discounted/customized split.
const ticketCohortSplitSchema = {
  type: "object",
  properties: {
    listPrice: ticketCohortAverageSchema,
    discounted: ticketCohortAverageSchema,
  },
} as const;

// The `{ nominal, percentage, n }` envelope (FUND-02) used for every ticket figure.
const ticketMetricShapeSchema = {
  type: "object",
  properties: {
    nominal: { type: "number" },
    percentage: { type: "number" },
    n: { type: "integer" },
  },
} as const;

// One per-currency block: global + cohorts + zero + discount + breakdowns.
const ticketCurrencyBlockSchema = {
  type: "object",
  properties: {
    global: ticketMetricShapeSchema,
    globalCohorts: ticketCohortSplitSchema,
    zeroCount: { type: "integer" },
    zeroPct: { type: "number" },
    discountMean: { type: ["number", "null"] },
    discountMedian: { type: ["number", "null"] },
    perPlan: {
      type: "array",
      items: {
        type: "object",
        properties: {
          planName: { type: "string" },
          country: { type: "string" },
          durationTier: {
            type: ["string", "null"],
            enum: ["monthly", "long_term", null],
          },
          ticket: ticketMetricShapeSchema,
          discountMean: { type: ["number", "null"] },
          discountMedian: { type: ["number", "null"] },
          zeroCount: { type: "integer" },
          zeroPct: { type: "number" },
          cohorts: ticketCohortSplitSchema,
        },
      },
    },
    byBranch: {
      type: "array",
      items: {
        type: "object",
        properties: {
          branchName: { type: "string" },
          ticket: ticketMetricShapeSchema,
          discountMean: { type: ["number", "null"] },
          discountMedian: { type: ["number", "null"] },
        },
      },
    },
    byDuration: {
      type: "array",
      items: {
        type: "object",
        properties: {
          durationTier: { type: "string", enum: ["monthly", "long_term"] },
          ticket: ticketMetricShapeSchema,
        },
      },
    },
  },
} as const;

// GET /ticket — per-currency ticket from linked price_paid, cohort split,
// excludedNoLink. ADMIN_ROLES-only (gestion gets 403). errorSchema covers
// 400/401/403/500.
export const ticketSchema = {
  querystring: analyticsQuerystring,
  response: {
    200: {
      type: "object",
      properties: {
        byCurrency: {
          type: "object",
          properties: {
            ARS: ticketCurrencyBlockSchema,
            EUR: ticketCurrencyBlockSchema,
          },
        },
        historicalFallbackCount: { type: "integer" },
        excludedNoLink: { type: "integer" },
      },
    },
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

// =============================================================================
// Churn de no renovación Schema (Phase 121 Block 1 — CHURN-01..06)
// =============================================================================

// Local querystring extension (T-121-04): adds the `window` param to the shared
// analytics querystring WITHOUT mutating the shared const. `window` is an integer
// bounded 1..365 so a malformed / oversized N is rejected before it reaches the
// service. branchId/dateFrom/dateTo carry over from analyticsQuerystring.
const churnQuerystring = {
  type: "object",
  properties: {
    branchId: { type: "integer" },
    dateFrom: { type: "string", format: "date" },
    dateTo: { type: "string", format: "date" },
    window: { type: "integer", minimum: 1, maximum: 365 },
  },
} as const;

// The canonical `{ nominal, percentage, n }` envelope (FUND-02 / metric-shape.ts).
// Declared here so every churn MetricShape on the wire is fully described
// (fast-json-stringify STRIPS undeclared fields).
const churnMetricShapeSchema = {
  type: "object",
  properties: {
    nominal: { type: "integer" },
    percentage: { type: "number" },
    n: { type: "integer" },
  },
} as const;

// One multi-N comparative column / the official window result.
const churnWindowResultSchema = {
  type: "object",
  properties: {
    windowDays: { type: "integer" },
    churn: churnMetricShapeSchema,
  },
} as const;

// GET /churn — person-based churn (CHURN-01) with the official window, multi-N
// comparison (5/10/15), enGracia, monthly provisional series, and 4-axis
// breakdowns. ADMIN_ROLES-only (gestion gets 403). errorSchema covers
// 400/401/403/500.
export const churnSchema = {
  querystring: churnQuerystring,
  response: {
    200: {
      type: "object",
      properties: {
        window: churnWindowResultSchema,
        comparison: {
          type: "array",
          items: churnWindowResultSchema,
        },
        enGracia: { type: "integer" },
        series: {
          type: "array",
          items: {
            type: "object",
            properties: {
              bucket: { type: "string" },
              churn: churnMetricShapeSchema,
              provisional: { type: "boolean" },
            },
          },
        },
        breakdowns: {
          type: "array",
          items: {
            type: "object",
            properties: {
              axis: {
                type: "string",
                enum: ["branch", "country", "duration", "plan"],
              },
              key: { type: "string" },
              churn: churnMetricShapeSchema,
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
