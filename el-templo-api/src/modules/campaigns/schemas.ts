/**
 * Fastify JSON schemas for the campaigns module (Phase 119).
 *
 * Public tracking querystrings (token `t`) + admin campaign create/list/send/
 * funnel/eligible-count. `createCampaignSchema` uses additionalProperties:false
 * (T-119-04-09) so unknown body fields are rejected at the trust boundary.
 */

/** Public tracking endpoints share a single querystring: `?t=<token>`. */
export const trackingQuerySchema = {
  querystring: {
    type: "object",
    required: ["t"],
    properties: {
      t: { type: "string", minLength: 1, maxLength: 2048 },
    },
    additionalProperties: false,
  },
} as const;

/** POST /admin — create a draft campaign (D-12). */
export const createCampaignSchema = {
  body: {
    type: "object",
    required: ["name", "subject", "copySlots"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 255 },
      subject: { type: "string", minLength: 1, maxLength: 255 },
      country: { type: "string", enum: ["AR", "ES"], nullable: true },
      heroImageUrl: { type: "string", maxLength: 500 },
      copySlots: {
        type: "object",
        required: ["headline", "subheadline", "body"],
        properties: {
          headline: { type: "string", minLength: 1, maxLength: 255 },
          subheadline: { type: "string", maxLength: 255 },
          body: { type: "string", maxLength: 5000 },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
} as const;

/** GET /admin — optional country filter. */
export const listCampaignsSchema = {
  querystring: {
    type: "object",
    properties: {
      country: { type: "string", enum: ["AR", "ES"] },
    },
    additionalProperties: false,
  },
} as const;

/** :id path param for send/funnel admin routes. */
export const campaignIdSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "integer", minimum: 1 } },
  },
} as const;

/** GET /admin/eligible-count — optional country filter. */
export const eligibleCountSchema = {
  querystring: {
    type: "object",
    properties: {
      country: { type: "string", enum: ["AR", "ES"] },
    },
    additionalProperties: false,
  },
} as const;
