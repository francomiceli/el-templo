export const registerSchema = {
  body: {
    type: "object",
    required: ["email", "password", "firstName", "lastName", "gender"],
    properties: {
      email: { type: "string", format: "email" },
      password: { type: "string", minLength: 8 },
      branchId: { type: "integer" },
      firstName: { type: "string", minLength: 1 },
      lastName: { type: "string", minLength: 1 },
      dni: { type: "string" },
      phone: { type: "string" },
      gender: {
        type: "string",
        enum: ["male", "female", "other", "unspecified"],
      },
      promoCode: { type: "string", maxLength: 50 },
      // Phase 157-03 (REF-02, D-08): self-service referral code. The referrer
      // is resolved server-side from this code — never taken raw from the body
      // (Security V4/T-157-08). Unknown/invalid codes are ignored gracefully.
      ref: { type: "string", maxLength: 32 },
      // Phase 179-04 (D-02/D-03): campo MANUAL unificado del registro (el
      // usuario tipea "¿Tenés un código?"). Acepta código de partner, promo o
      // socio — resuelto server-side (`resolveSignupCode`). Convive con
      // `ref`/`promoCode`, que las builds nativas viejas van a seguir
      // mandando por meses (Pitfall 9).
      code: { type: "string", maxLength: 24 },
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
