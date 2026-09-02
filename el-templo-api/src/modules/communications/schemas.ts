/**
 * JSON Schemas + interfaces tipadas de las rutas admin de `modules/communications`
 * (Fase 193). Mismo patrón del repo que `modules/tv/schemas.ts`: el schema de
 * validación y la interfaz que lo describe viven en el MISMO archivo, así el
 * handler tipa `request.body`/`request.params` contra lo que Fastify
 * realmente validó.
 *
 * T-193-11: el JSON Schema (`enum`, `maxLength`, `additionalProperties: false`)
 * es la PRIMERA línea de defensa — pero NO alcanza para D-05 (rechazar rutas
 * fuera de la lista curada): `destinationSection` es un string libre acá
 * porque solo `destinations.ts#validateDestination` conoce `APP_SECTIONS`. El
 * handler llama `validateDestination` DESPUÉS de que este schema valida la
 * forma.
 */

const DESTINATION_TYPE_ENUM = ["app_section", "whatsapp_sales"] as const;
const FREQUENCY_TYPE_ENUM = ["once", "every_n_days", "every_open"] as const;
const STATUS_ENUM = ["draft", "active", "paused"] as const;
const PLACEMENT_ENUM = ["popup", "tarjeta"] as const;
const SEGMENT_ENUM = ["optima", "regular", "alerta", "ausente"] as const;
/** Formato `YYYY-MM-DD` — mismo criterio que `tv_class_state.class_date` (mode:"string"). */
const DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";

// ── GET /admin/avisos ───────────────────────────────────────────────────────

export const listAvisosQuerySchema = {
  querystring: {
    type: "object",
    properties: {
      placement: { type: "string", enum: PLACEMENT_ENUM },
    },
    additionalProperties: false,
  },
};

// ── POST /admin/avisos ──────────────────────────────────────────────────────

export const createAvisoSchema = {
  body: {
    type: "object",
    required: [
      "placement",
      "title",
      "body",
      "buttonText",
      "destinationType",
      "frequencyType",
    ],
    properties: {
      placement: { type: "string", enum: PLACEMENT_ENUM },
      title: { type: "string", minLength: 1, maxLength: 200 },
      body: { type: "string", minLength: 1 },
      buttonText: { type: "string", minLength: 1, maxLength: 60 },
      destinationType: { type: "string", enum: DESTINATION_TYPE_ENUM },
      destinationSection: { type: ["string", "null"], maxLength: 40 },
      whatsappText: { type: ["string", "null"], maxLength: 300 },
      frequencyType: { type: "string", enum: FREQUENCY_TYPE_ENUM },
      frequencyDays: { type: ["integer", "null"], minimum: 1 },
      status: { type: "string", enum: STATUS_ENUM },
      startsOn: { type: ["string", "null"], pattern: DATE_PATTERN },
      endsOn: { type: ["string", "null"], pattern: DATE_PATTERN },
      scopeBranchIds: {
        type: ["array", "null"],
        items: { type: "integer" },
      },
      scopeCountries: {
        type: ["array", "null"],
        items: { type: "string", enum: ["AR", "ES"] },
      },
      scopeSegments: {
        type: ["array", "null"],
        items: { type: "string", enum: SEGMENT_ENUM },
      },
      sortOrder: { type: "integer" },
    },
    additionalProperties: false,
  },
};

export interface CreateAvisoBody {
  placement: "popup" | "tarjeta";
  title: string;
  body: string;
  buttonText: string;
  destinationType: "app_section" | "whatsapp_sales";
  destinationSection?: string | null;
  whatsappText?: string | null;
  frequencyType: "once" | "every_n_days" | "every_open";
  frequencyDays?: number | null;
  status?: "draft" | "active" | "paused";
  startsOn?: string | null;
  endsOn?: string | null;
  scopeBranchIds?: number[] | null;
  scopeCountries?: string[] | null;
  scopeSegments?: string[] | null;
  sortOrder?: number;
}

// ── PUT /admin/avisos/:id ───────────────────────────────────────────────────

export const avisoIdParamsSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "integer" },
    },
  },
};

export const updateAvisoSchema = {
  body: {
    type: "object",
    properties: {
      placement: { type: "string", enum: PLACEMENT_ENUM },
      title: { type: "string", minLength: 1, maxLength: 200 },
      body: { type: "string", minLength: 1 },
      buttonText: { type: "string", minLength: 1, maxLength: 60 },
      destinationType: { type: "string", enum: DESTINATION_TYPE_ENUM },
      destinationSection: { type: ["string", "null"], maxLength: 40 },
      whatsappText: { type: ["string", "null"], maxLength: 300 },
      frequencyType: { type: "string", enum: FREQUENCY_TYPE_ENUM },
      frequencyDays: { type: ["integer", "null"], minimum: 1 },
      status: { type: "string", enum: STATUS_ENUM },
      startsOn: { type: ["string", "null"], pattern: DATE_PATTERN },
      endsOn: { type: ["string", "null"], pattern: DATE_PATTERN },
      scopeBranchIds: {
        type: ["array", "null"],
        items: { type: "integer" },
      },
      scopeCountries: {
        type: ["array", "null"],
        items: { type: "string", enum: ["AR", "ES"] },
      },
      scopeSegments: {
        type: ["array", "null"],
        items: { type: "string", enum: SEGMENT_ENUM },
      },
      sortOrder: { type: "integer" },
    },
    additionalProperties: false,
  },
};

export interface UpdateAvisoBody {
  placement?: "popup" | "tarjeta";
  title?: string;
  body?: string;
  buttonText?: string;
  destinationType?: "app_section" | "whatsapp_sales";
  destinationSection?: string | null;
  whatsappText?: string | null;
  frequencyType?: "once" | "every_n_days" | "every_open";
  frequencyDays?: number | null;
  status?: "draft" | "active" | "paused";
  startsOn?: string | null;
  endsOn?: string | null;
  scopeBranchIds?: number[] | null;
  scopeCountries?: string[] | null;
  scopeSegments?: string[] | null;
  sortOrder?: number;
}

// ── GET /admin/avisos/:id/clickers ──────────────────────────────────────────

export const clickersQuerySchema = {
  querystring: {
    type: "object",
    properties: {
      limit: { type: "integer", minimum: 1, maximum: 500 },
    },
    additionalProperties: false,
  },
};

// ── PUT /admin/sales-number ─────────────────────────────────────────────────

export const updateSalesNumberSchema = {
  body: {
    type: "object",
    properties: {
      AR: { type: "string", pattern: "^[0-9]{8,15}$" },
      ES: { type: "string", pattern: "^[0-9]{8,15}$" },
    },
    additionalProperties: false,
  },
};

export interface UpdateSalesNumberBody {
  AR?: string;
  ES?: string;
}

// ── Respuestas ───────────────────────────────────────────────────────────────

const avisoResponseProperties = {
  id: { type: "integer" },
  kind: { type: "string", enum: ["system", "custom"] },
  code: { type: ["string", "null"] },
  placement: { type: "string", enum: PLACEMENT_ENUM },
  title: { type: "string" },
  body: { type: "string" },
  buttonText: { type: "string" },
  destinationType: { type: "string", enum: DESTINATION_TYPE_ENUM },
  destinationSection: { type: ["string", "null"] },
  whatsappText: { type: ["string", "null"] },
  frequencyType: { type: "string", enum: FREQUENCY_TYPE_ENUM },
  frequencyDays: { type: ["integer", "null"] },
  status: { type: "string", enum: STATUS_ENUM },
  startsOn: { type: ["string", "null"] },
  endsOn: { type: ["string", "null"] },
  scopeBranchIds: { type: ["array", "null"], items: { type: "integer" } },
  scopeCountries: { type: ["array", "null"], items: { type: "string" } },
  scopeSegments: { type: ["array", "null"], items: { type: "string" } },
  sortOrder: { type: "integer" },
  reachedCount: { type: "integer" },
  dismissedCount: { type: "integer" },
  clickedCount: { type: "integer" },
};

export const avisoResponseSchema = {
  type: "object",
  properties: avisoResponseProperties,
};

export const listAvisosResponseSchema = {
  200: {
    type: "object",
    properties: {
      avisos: {
        type: "array",
        items: { type: "object", properties: avisoResponseProperties },
      },
    },
  },
};

export const avisoWriteResponseSchema = {
  200: avisoResponseSchema,
};

export const clickersResponseSchema = {
  200: {
    type: "object",
    properties: {
      clickers: {
        type: "array",
        items: {
          type: "object",
          properties: {
            userId: { type: "integer" },
            fullName: { type: "string" },
            phone: { type: ["string", "null"] },
            lastAt: { type: "string" },
          },
        },
      },
    },
  },
};

export const salesNumberResponseSchema = {
  200: {
    type: "object",
    properties: {
      AR: { type: ["string", "null"] },
      ES: { type: ["string", "null"] },
    },
  },
};

export const successResponseSchema = {
  200: {
    type: "object",
    properties: {
      success: { type: "boolean" },
    },
  },
};

// ── Member-facing (Fase 193, plan 05, D-06/D-07/D-11/D-15b/D-20) ───────────
//
// El `userId` SIEMPRE sale de `request.user` (mitigación IDOR, T-193-16) —
// ninguno de estos 4 schemas declara `userId` en params/body/querystring.

const EVENT_TYPE_ENUM = ["shown", "dismissed", "clicked"] as const;

/** Forma de un aviso proyectado para el socio (`PromptAviso` de `prompt-service.ts`). */
const promptAvisoResponseProperties = {
  id: { type: "integer" },
  title: { type: "string" },
  body: { type: "string" },
  buttonText: { type: "string" },
  destination: {
    type: "object",
    properties: {
      type: { type: "string", enum: DESTINATION_TYPE_ENUM },
      section: { type: ["string", "null"] },
      route: { type: "string" },
      whatsappText: { type: ["string", "null"] },
    },
  },
  whatsappNumber: { type: ["string", "null"] },
};

// ── GET /me/prompt ───────────────────────────────────────────────────────

export const promptResponseSchema = {
  200: {
    type: "object",
    properties: {
      prompt: {
        type: ["object", "null"],
        properties: {
          kind: {
            type: "string",
            enum: ["plan_expiry", "aviso", "rating", "improvement"],
          },
          aviso: {
            type: "object",
            properties: promptAvisoResponseProperties,
          },
          // Solo kind: 'plan_expiry'.
          daysRemaining: { type: "integer" },
          // Solo kind: 'rating' — la clase que el socio va a puntuar (sin coach, D-A3).
          pending: {
            type: "object",
            properties: {
              sessionDate: { type: "string" },
              branchId: { type: "integer" },
              scheduleId: { type: "integer" },
              activityName: { type: "string" },
              dayOfWeek: { type: "integer" },
            },
          },
        },
      },
    },
  },
};

// ── POST /me/avisos/:id/event ───────────────────────────────────────────

export const recordEventSchema = {
  body: {
    type: "object",
    required: ["type"],
    properties: {
      type: { type: "string", enum: EVENT_TYPE_ENUM },
    },
    additionalProperties: false,
  },
};

export interface RecordEventBody {
  type: "shown" | "dismissed" | "clicked";
}

// ── GET /me/tarjetas ─────────────────────────────────────────────────────

export const tarjetasResponseSchema = {
  200: {
    type: "object",
    properties: {
      tarjetas: {
        type: "array",
        items: {
          type: "object",
          properties: promptAvisoResponseProperties,
        },
      },
    },
  },
};

// ── GET /me/config ───────────────────────────────────────────────────────

export const memberConfigResponseSchema = {
  200: {
    type: "object",
    properties: {
      salesWhatsappNumber: { type: ["string", "null"] },
      defaultWhatsappText: { type: "string" },
    },
  },
};
