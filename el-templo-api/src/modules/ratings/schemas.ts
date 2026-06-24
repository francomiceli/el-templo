/**
 * Ratings module — Fastify JSON schemas (request/response validation).
 *
 * Tampering guard (T-143-09): stars must be an integer 1–5 and comment is
 * capped at 500 chars at the transport layer, before the service runs.
 */

export const coachesForBranchQuerySchema = {
  querystring: {
    type: "object",
    required: ["branchId"],
    properties: {
      branchId: { type: "integer" },
    },
  },
};

export const rosterWeekQuerySchema = {
  querystring: {
    type: "object",
    required: ["branchId", "weekStart"],
    properties: {
      branchId: { type: "integer" },
      weekStart: { type: "string" },
    },
  },
};

export const assignCoachBodySchema = {
  body: {
    type: "object",
    required: ["branchId", "weekStartDate", "dayOfWeek", "slot", "coachId"],
    properties: {
      branchId: { type: "integer" },
      weekStartDate: { type: "string" },
      dayOfWeek: { type: "integer", minimum: 1, maximum: 7 },
      slot: { type: "string", enum: ["morning", "afternoon"] },
      coachId: { type: "integer" },
    },
  },
};

export const submitRatingBodySchema = {
  body: {
    type: "object",
    required: ["sessionDate", "scheduleId", "stars"],
    properties: {
      sessionDate: { type: "string" },
      scheduleId: { type: "integer" },
      stars: { type: "integer", minimum: 1, maximum: 5 },
      comment: { type: "string", maxLength: 500 },
    },
  },
};

export const pendingRatingSchema = {
  response: {
    200: {
      type: ["object", "null"],
      properties: {
        sessionDate: { type: "string" },
        branchId: { type: "integer" },
        scheduleId: { type: "integer" },
        activityName: { type: "string" },
        dayOfWeek: { type: "integer" },
      },
    },
  },
};
