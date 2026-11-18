// Module: aura
//
// JSON Schemas de la celebración de Aura (fase 215, #33):
//   GET  /api/members/aura/celebration       qué se sumó desde la última vez
//   POST /api/members/aura/celebration/ack   marca lo celebrado
// La respuesta se declara completa: fast-json-stringify descarta lo que no está
// en el schema, y eso también garantiza que nunca salgan `description` ni las
// referencias crudas del ledger. Ninguna ruta acepta un id de usuario.

export interface CelebrationAckBody {
  upToId: number;
}

export const celebrationSchema = {
  response: {
    200: {
      type: "object",
      additionalProperties: false,
      required: ["movements", "count", "sum", "total", "maxId"],
      properties: {
        movements: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "amount", "label", "gift"],
            properties: {
              id: { type: "integer" },
              amount: { type: "integer" },
              label: { type: "string" },
              gift: {
                type: ["object", "null"],
                additionalProperties: false,
                required: ["kind", "anonymous", "name", "reason"],
                properties: {
                  kind: { type: "string", enum: ["alumno", "profe"] },
                  anonymous: { type: "boolean" },
                  name: { type: ["string", "null"] },
                  reason: { type: "string" },
                },
              },
            },
          },
        },
        count: { type: "integer" },
        sum: { type: "integer" },
        total: { type: "integer" },
        maxId: { type: "integer" },
      },
    },
  },
} as const;

export const celebrationAckSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["upToId"],
    properties: {
      // Tope = máximo de un INT de MySQL.
      upToId: { type: "integer", minimum: 0, maximum: 2147483647 },
    },
  },
  response: {
    204: { type: "null" },
  },
} as const;
