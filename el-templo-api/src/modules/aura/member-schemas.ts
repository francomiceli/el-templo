// Module: aura
//
// JSON Schemas de `GET /api/members/aura/movements` (fase 214, D-13): el detalle
// privado de la Aura propia. La respuesta se declara completa: fast-json-stringify
// descarta lo que no está en el schema, y eso también garantiza que nunca salgan
// `description` ni las referencias crudas del ledger.

export interface AuraMovementsQuery {
  before?: number;
  limit?: number;
}

export const auraMovementsSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      before: { type: "integer", minimum: 1 },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
    },
  },
  response: {
    200: {
      type: "object",
      additionalProperties: false,
      required: ["earned", "movements", "nextBefore"],
      properties: {
        earned: { type: "integer" },
        movements: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "amount", "label", "createdAt"],
            properties: {
              id: { type: "integer" },
              amount: { type: "integer" },
              label: { type: "string" },
              createdAt: { type: "string" },
            },
          },
        },
        nextBefore: { type: ["integer", "null"] },
      },
    },
  },
} as const;
