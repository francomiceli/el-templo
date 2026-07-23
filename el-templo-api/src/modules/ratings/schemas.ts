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
    required: ["sessionDate", "scheduleId", "stars", "classStars"],
    properties: {
      sessionDate: { type: "string" },
      scheduleId: { type: "integer" },
      stars: { type: "integer", minimum: 1, maximum: 5 }, // profe
      classStars: { type: "integer", minimum: 1, maximum: 5 }, // clase
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

/**
 * Owner view querystring: rango de fechas sobre sessionDate + sucursal +
 * paginación del listado individual (los promedios per-coach no paginan).
 * withComments y stars filtran SOLO el listado — ver getOwnerRatings.
 *
 * `stars` viaja como CSV ("1,2"). Un `type: "array"` con `?stars=1&stars=2`
 * también habría funcionado — Fastify compila ajv con `coerceTypes: 'array'`,
 * que envuelve el escalar suelto. Se eligió el CSV por ser una sola cadena
 * validable con un pattern (el rango 1-5 queda garantizado en el borde, sin
 * depender de la coerción), y porque deja la URL más corta. El handler lo
 * parsea. Duplicados y orden no importan (termina en un IN).
 */
export const ownerRatingsQuerySchema = {
  querystring: {
    type: "object",
    properties: {
      dateFrom: { type: "string", format: "date" },
      dateTo: { type: "string", format: "date" },
      branchId: { type: "integer", minimum: 1 },
      withComments: { type: "boolean" },
      stars: { type: "string", pattern: "^[1-5](,[1-5])*$" },
      starsDimension: { type: "string", enum: ["coach", "class"] },
      page: { type: "integer", minimum: 1 },
      limit: { type: "integer", minimum: 1, maximum: 200 },
    },
    additionalProperties: false,
  },
};
