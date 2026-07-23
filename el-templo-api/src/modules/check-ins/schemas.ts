export const submitCheckInBodySchema = {
  type: "object",
  required: ["questionType", "value"],
  properties: {
    questionType: {
      type: "string",
      enum: ["energy", "soreness", "sleep"],
    },
    value: { type: "string" },
    bodyArea: { type: "string" },
  },
  additionalProperties: false,
};

export const checkInResponseSchema = {
  type: "object",
  properties: {
    success: { type: "boolean" },
  },
};

const answerSchema = {
  oneOf: [
    {
      type: "object",
      properties: {
        value: { type: "string" },
        bodyArea: { type: ["string", "null"] },
      },
    },
    { type: "null" },
  ],
};

export const todayCheckInResponseSchema = {
  type: "object",
  properties: {
    answers: {
      type: "object",
      properties: {
        energy: answerSchema,
        soreness: answerSchema,
        sleep: answerSchema,
      },
    },
  },
};

export const errorResponseSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
  },
};

/**
 * Querystring de la vista admin (Registro del día). Mismos filtros compartidos
 * que el resto de Feedback (fechas + sucursal) más el tipo de pregunta.
 */
export const adminCheckInsQuerySchema = {
  querystring: {
    type: "object",
    properties: {
      dateFrom: { type: "string", format: "date" },
      dateTo: { type: "string", format: "date" },
      branchId: { type: "integer", minimum: 1 },
      questionType: { type: "string", enum: ["energy", "soreness", "sleep"] },
      page: { type: "integer", minimum: 1 },
      limit: { type: "integer", minimum: 1, maximum: 200 },
    },
    additionalProperties: false,
  },
};
