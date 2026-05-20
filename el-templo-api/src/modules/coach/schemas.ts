/**
 * Coach module — Fastify JSON schemas (request/response validation).
 */

export const coachOutstandingBalancesSchema = {
  querystring: {
    type: "object",
    properties: {
      search: { type: "string" },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["rows"],
      properties: {
        rows: {
          type: "array",
          items: {
            type: "object",
            required: [
              "memberId",
              "memberName",
              "memberPhone",
              "totalAmount",
              "currency",
            ],
            properties: {
              memberId: { type: "integer" },
              memberName: { type: "string" },
              memberPhone: { type: ["string", "null"] },
              totalAmount: { type: "number" },
              currency: { type: "string" },
            },
          },
        },
      },
    },
  },
};
