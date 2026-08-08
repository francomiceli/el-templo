// Módulo: anniversaries — schemas de request/response (cartelera admin).

const anniversaryEntrySchema = {
  type: "object",
  properties: {
    memberId: { type: "integer" },
    memberName: { type: "string" },
    months: { type: "integer" },
    label: { type: "string" },
    when: { type: "string", enum: ["today", "tomorrow"] },
  },
} as const;

export const branchAnniversariesSchema = {
  querystring: {
    type: "object",
    required: ["branchId"],
    properties: {
      branchId: { type: "integer" },
      // Fecha "hoy" en la zona de la sede (YYYY-MM-DD). Opcional: el front la
      // manda para no depender de la zona del server. Default: hoy en AR.
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      // Incluir también los aniversarios de mañana (anticipo para recepción).
      includeTomorrow: { type: "boolean", default: false },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        anniversaries: { type: "array", items: anniversaryEntrySchema },
      },
    },
  },
} as const;
