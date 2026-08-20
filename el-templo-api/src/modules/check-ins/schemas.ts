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
 * Registros del día de los alumnos que asisten a una sede (card de Horarios,
 * coach + admin/dueño). Espeja la querystring de la cartelera de aniversarios.
 */
const dayCheckInSchema = {
  type: "object",
  properties: {
    date: { type: "string" },
    daysAgo: { type: "integer" },
    energy: { type: ["string", "null"] },
    soreness: { type: ["string", "null"] },
    sorenessBodyArea: { type: ["string", "null"] },
    sleep: { type: ["string", "null"] },
  },
} as const;

const checkInRosterEntrySchema = {
  type: "object",
  properties: {
    memberId: { type: "integer" },
    memberName: { type: "string" },
    checkIn: dayCheckInSchema,
  },
} as const;

export const checkInRosterSchema = {
  querystring: {
    type: "object",
    required: ["branchId"],
    properties: {
      branchId: { type: "integer", minimum: 1 },
      // Fecha "hoy" en la zona de la sede (YYYY-MM-DD). Opcional: el front la
      // manda para no depender de la zona del server. Default: hoy en AR.
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: "object",
      properties: {
        entries: { type: "array", items: checkInRosterEntrySchema },
        attendeeCount: { type: "integer" },
      },
    },
  },
} as const;

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
