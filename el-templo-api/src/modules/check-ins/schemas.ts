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
