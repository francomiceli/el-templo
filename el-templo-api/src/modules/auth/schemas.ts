export const registerSchema = {
  body: {
    type: "object",
    required: [
      "email",
      "password",
      "firstName",
      "lastName",
      "dni",
      "phone",
      "gender",
    ],
    properties: {
      email: { type: "string", format: "email" },
      password: { type: "string", minLength: 8 },
      branchId: { type: "integer" },
      firstName: { type: "string", minLength: 1 },
      lastName: { type: "string", minLength: 1 },
      dni: { type: "string", minLength: 1 },
      phone: { type: "string", minLength: 1 },
      gender: {
        type: "string",
        enum: ["male", "female", "other", "unspecified"],
      },
      promoCode: { type: "string", maxLength: 50 },
    },
  },
};

export const loginSchema = {
  body: {
    type: "object",
    required: ["email", "password"],
    properties: {
      email: { type: "string", format: "email" },
      password: { type: "string" },
    },
  },
};
