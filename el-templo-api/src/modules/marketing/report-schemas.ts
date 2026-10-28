// Módulo: marketing — schemas JSON de los reportes de atribución (fase 195,
// plan 10, D-18/D-20/D-21). Respuesta COMPLETA declarada: fast-json-stringify
// descarta lo que no está en el schema, así que un campo nuevo del servicio
// que no se declara acá desaparece en silencio de la respuesta.

const errorSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
} as const;

/** Importe en una moneda. Nunca se suma entre monedas (Pitfall 13). */
const moneySchema = {
  type: "object",
  properties: {
    currency: { type: "string" },
    amount: { type: "number" },
  },
} as const;

const moneyListSchema = { type: "array", items: moneySchema } as const;

/** Lista de importes o null cuando no hay dato (gasto sin cargar, sin pagos). */
const nullableMoneyListSchema = {
  type: ["array", "null"],
  items: moneySchema,
} as const;

const rowSchema = {
  type: "object",
  properties: {
    channel: { type: "string" },
    utmCampaign: { type: ["string", "null"] },
    branchId: { type: ["integer", "null"] },
    branchName: { type: ["string", "null"] },
    registros: { type: "integer" },
    conPrueba: { type: "integer" },
    pagaron: { type: "integer" },
    facturacion: moneyListSchema,
    gasto: nullableMoneyListSchema,
    costoPorAlumnoPago: nullableMoneyListSchema,
  },
} as const;

const campaignSchema = {
  type: "object",
  properties: {
    utmCampaign: { type: "string" },
    registros: { type: "integer" },
    conPrueba: { type: "integer" },
    pagaron: { type: "integer" },
    facturacion: moneyListSchema,
    gasto: nullableMoneyListSchema,
    costoPorAlumnoPago: nullableMoneyListSchema,
    sedeCodificada: {
      type: ["object", "null"],
      properties: {
        branchId: { type: "integer" },
        branchName: { type: "string" },
      },
    },
    porSede: {
      type: "array",
      items: {
        type: "object",
        properties: {
          branchId: { type: ["integer", "null"] },
          branchName: { type: ["string", "null"] },
          registros: { type: "integer" },
          pagaron: { type: "integer" },
        },
      },
    },
  },
} as const;

export const attributionReportSchema = {
  querystring: {
    type: "object",
    required: ["dateFrom", "dateTo"],
    properties: {
      dateFrom: { type: "string", format: "date" },
      dateTo: { type: "string", format: "date" },
      branchId: { type: "integer", minimum: 1 },
      country: { type: "string", enum: ["AR", "ES"] },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        range: {
          type: "object",
          properties: {
            dateFrom: { type: "string" },
            dateTo: { type: "string" },
          },
        },
        rows: { type: "array", items: rowSchema },
        campaigns: { type: "array", items: campaignSchema },
        totals: {
          type: "object",
          properties: {
            registros: { type: "integer" },
            conPrueba: { type: "integer" },
            pagaron: { type: "integer" },
            facturacion: moneyListSchema,
            gasto: moneyListSchema,
          },
        },
        ia: {
          type: "array",
          items: {
            type: "object",
            properties: {
              referrerHost: { type: ["string", "null"] },
              registros: { type: "integer" },
              pagaron: { type: "integer" },
            },
          },
        },
        gastoSinAtribuir: {
          type: "array",
          items: {
            type: "object",
            properties: {
              campaignName: { type: "string" },
              currency: { type: "string" },
              amount: { type: "number" },
            },
          },
        },
        // Card "Integraciones apagadas": solo booleanos y nombres de secrets.
        integrations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: { type: "string" },
              label: { type: "string" },
              enabled: { type: "boolean" },
              missing: { type: "array", items: { type: "string" } },
              mode: { type: "string" },
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

const searchConsoleMetricProps = {
  clicks: { type: "integer" },
  impressions: { type: "integer" },
  /** Fracción 0..1 (0.1234 = 12,34%). */
  ctr: { type: "number" },
  position: { type: "number" },
} as const;

export const searchConsoleReportSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        period: {
          type: ["object", "null"],
          properties: {
            periodStart: { type: "string" },
            periodEnd: { type: "string" },
          },
        },
        pages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              page: { type: "string" },
              ...searchConsoleMetricProps,
            },
          },
        },
        queries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              page: { type: "string" },
              query: { type: "string" },
              ...searchConsoleMetricProps,
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
