/**
 * Fastify JSON schemas + tipos de request del módulo de Renovaciones
 * (2026-09-24). Mismo patrón que `reports/schemas.ts`: el schema de
 * validación y la interfaz que lo describe viven juntos.
 */

const errorSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
} as const;

/**
 * fast-json-stringify solo serializa las propiedades DECLARADAS (ver
 * docblock de `staff-attendance/schemas.ts`) — el `code` que `routes.ts`
 * agrega a mano para `REASON_REQUIRED` necesita su propio schema de error,
 * o se lo comería la serialización.
 */
const errorSchemaWithCode = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
    code: { type: "string" },
  },
} as const;

const renewalRowSchema = {
  type: "object",
  properties: {
    subscriptionId: { type: "integer" },
    userId: { type: "integer" },
    memberName: { type: "string" },
    phone: { type: ["string", "null"] },
    phoneE164: { type: ["string", "null"] },
    branchId: { type: "integer" },
    branchName: { type: "string" },
    planId: { type: "integer" },
    planName: { type: "string" },
    endDate: { type: "string" },
    daysRemaining: { type: "integer" },
    status: {
      type: "string",
      enum: ["renovo", "volvio_tarde", "pausada", "no_renovo", "en_proceso"],
    },
    pauseEndDate: { type: ["string", "null"] },
    newPlanId: { type: ["integer", "null"] },
    newPlanName: { type: ["string", "null"] },
    renewedAt: { type: ["string", "null"] },
    nextStartDate: { type: ["string", "null"] },
    messageCount: { type: "integer" },
    lastMessageAt: { type: ["string", "null"] },
    reasonId: { type: ["integer", "null"] },
    reasonLabel: { type: ["string", "null"] },
    reasonNote: { type: ["string", "null"] },
    manualStatus: { type: "string", enum: ["en_proceso", "no_renovo"] },
    manualOverridden: { type: "boolean" },
    paraCerrar: { type: "boolean" },
    lastNote: {
      type: ["object", "null"],
      properties: {
        content: { type: "string" },
        createdAt: { type: "string" },
      },
    },
  },
} as const;

const renewalKpisSchema = {
  type: "object",
  properties: {
    total: { type: "integer" },
    renovo: { type: "integer" },
    volvioTarde: { type: "integer" },
    noRenovo: { type: "integer" },
    enProceso: { type: "integer" },
    sinContactar: { type: "integer" },
    pausadas: { type: "integer" },
    paraCerrar: { type: "integer" },
    renewalRate: { type: ["number", "null"] },
    newPlanDistribution: {
      type: "array",
      items: {
        type: "object",
        properties: {
          planId: { type: "integer" },
          planName: { type: "string" },
          count: { type: "integer" },
          percentage: { type: "number" },
        },
      },
    },
  },
} as const;

export const renewalListSchema = {
  querystring: {
    type: "object",
    required: ["dateFrom", "dateTo"],
    properties: {
      dateFrom: { type: "string", format: "date" },
      dateTo: { type: "string", format: "date" },
      branchId: { type: "integer" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        rows: { type: "array", items: renewalRowSchema },
        kpis: renewalKpisSchema,
        windowDays: { type: "integer" },
      },
    },
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

export const renewalFollowupUpdateSchema = {
  params: {
    type: "object",
    required: ["subscriptionId"],
    properties: {
      subscriptionId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    properties: {
      messageCount: { type: "integer", minimum: 0, maximum: 4 },
      manualStatus: { type: "string", enum: ["en_proceso", "no_renovo"] },
      reasonId: { type: ["integer", "null"] },
      reasonNote: { type: ["string", "null"], maxLength: 500 },
    },
  },
  response: {
    200: renewalRowSchema,
    // REASON_REQUIRED (routes.ts) viaja acá con `code` — ver errorSchemaWithCode.
    400: errorSchemaWithCode,
    401: errorSchema,
    403: errorSchema,
    404: errorSchema,
    500: errorSchema,
  },
} as const;

export const renewalNoteCreateSchema = {
  params: {
    type: "object",
    required: ["subscriptionId"],
    properties: {
      subscriptionId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    required: ["content"],
    properties: {
      content: { type: "string", minLength: 1, maxLength: 2000 },
    },
  },
  response: {
    201: {
      type: "object",
      properties: {
        id: { type: "integer" },
        userId: { type: "integer" },
        authorId: { type: "integer" },
        authorName: { type: "string" },
        content: { type: "string" },
        createdAt: { type: "string" },
        updatedAt: { type: "string" },
      },
    },
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    404: errorSchema,
    500: errorSchema,
  },
} as const;

const renewalReasonSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    label: { type: "string" },
    sortOrder: { type: "integer" },
    isActive: { type: "boolean" },
  },
} as const;

export const renewalReasonListSchema = {
  querystring: {
    type: "object",
    properties: {
      includeInactive: { type: "boolean" },
    },
  },
  response: {
    200: { type: "array", items: renewalReasonSchema },
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;

export const renewalReasonCreateSchema = {
  body: {
    type: "object",
    required: ["label"],
    properties: {
      label: { type: "string", minLength: 1, maxLength: 80 },
    },
  },
  response: {
    201: renewalReasonSchema,
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    409: errorSchema,
    500: errorSchema,
  },
} as const;

export const renewalReasonUpdateSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "integer" },
    },
  },
  body: {
    type: "object",
    properties: {
      label: { type: "string", minLength: 1, maxLength: 80 },
      sortOrder: { type: "integer" },
      isActive: { type: "boolean" },
    },
  },
  response: {
    200: renewalReasonSchema,
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    404: errorSchema,
    409: errorSchema,
    500: errorSchema,
  },
} as const;

// ─── Tipos de request ───────────────────────────────────────────────────────

export interface RenewalListQuery {
  dateFrom: string;
  dateTo: string;
  branchId?: number;
}

export interface RenewalFollowupParams {
  subscriptionId: number;
}

export interface RenewalFollowupBody {
  messageCount?: number;
  manualStatus?: "en_proceso" | "no_renovo";
  reasonId?: number | null;
  reasonNote?: string | null;
}

export interface RenewalNoteBody {
  content: string;
}

export interface RenewalReasonQuery {
  includeInactive?: boolean;
}

export interface RenewalReasonCreateBody {
  label: string;
}

export interface RenewalReasonParams {
  id: number;
}

export interface RenewalReasonUpdateBody {
  label?: string;
  sortOrder?: number;
  isActive?: boolean;
}
