/**
 * Improvement proposals module — Fastify JSON schemas.
 *
 * El texto se capea a 1000 chars en la capa de transporte, antes de que
 * corra el service (mismo criterio que submitRatingBodySchema).
 */

export const submitProposalBodySchema = {
  body: {
    type: "object",
    required: ["proposal"],
    properties: {
      proposal: { type: "string", minLength: 1, maxLength: 1000 },
    },
  },
};

export const promptStatusSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        shouldPrompt: { type: "boolean" },
        campaign: { type: "integer" },
      },
    },
  },
};

export const adminProposalsQuerySchema = {
  querystring: {
    type: "object",
    properties: {
      dateFrom: { type: "string", format: "date" },
      dateTo: { type: "string", format: "date" },
      branchId: { type: "integer", minimum: 1 },
      q: { type: "string", maxLength: 200 },
      page: { type: "integer", minimum: 1 },
      limit: { type: "integer", minimum: 1, maximum: 200 },
    },
    additionalProperties: false,
  },
};

export const adminProposalsExportQuerySchema = {
  querystring: {
    type: "object",
    properties: {
      dateFrom: { type: "string", format: "date" },
      dateTo: { type: "string", format: "date" },
      branchId: { type: "integer", minimum: 1 },
      q: { type: "string", maxLength: 200 },
    },
    additionalProperties: false,
  },
};
