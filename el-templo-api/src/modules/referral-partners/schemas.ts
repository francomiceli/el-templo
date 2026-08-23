// Module: referral-partners — JSON Schemas de Fastify (fase 179, plan 03).
//
// Calcado del estilo de `improvement-proposals/schemas.ts`. Security V5:
// TODOS los schemas de body/querystring llevan `additionalProperties: false`
// — el punto de esta capa es rechazar mass-assignment antes de que el
// request llegue al service (T-179-11 vive acá, no solo en `tenantValues`).
//
// `code`/`currency` NO forman parte de `updatePartnerBodySchema`: el código
// no es editable (tarjetas impresas circulando, T-179-13) y la moneda se
// deriva siempre de `branches.country` (D-13) — ninguno de los dos es un
// campo que el cliente pueda tocar en un PATCH.

export const createPartnerBodySchema = {
  body: {
    type: "object",
    required: [
      "name",
      "code",
      "branchId",
      "benefitType",
      "benefitValue",
      "commissionType",
      "commissionValue",
    ],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      code: {
        type: "string",
        minLength: 3,
        maxLength: 24,
        pattern: "^[A-Za-z0-9 -]+$",
      },
      branchId: { type: "integer", minimum: 1 },
      benefitType: {
        type: "string",
        enum: ["discount_percent", "free_pass"],
      },
      benefitValue: { type: "integer", minimum: 0, maximum: 100 },
      commissionType: { type: "string", enum: ["none", "fixed"] },
      commissionValue: { type: "integer", minimum: 0 },
      contactName: { type: "string", maxLength: 120 },
      contactPhone: { type: "string", maxLength: 40 },
      notes: { type: "string", maxLength: 1000 },
    },
    additionalProperties: false,
  },
};

export const updatePartnerBodySchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "integer", minimum: 1 } },
  },
  body: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      benefitType: {
        type: "string",
        enum: ["discount_percent", "free_pass"],
      },
      benefitValue: { type: "integer", minimum: 0, maximum: 100 },
      commissionType: { type: "string", enum: ["none", "fixed"] },
      commissionValue: { type: "integer", minimum: 0 },
      contactName: { type: ["string", "null"], maxLength: 120 },
      contactPhone: { type: ["string", "null"], maxLength: 40 },
      notes: { type: ["string", "null"], maxLength: 1000 },
      isActive: { type: "boolean" },
    },
    additionalProperties: false,
  },
};

export const getPartnerParamsSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "integer", minimum: 1 } },
  },
};

export const listPartnersQuerySchema = {
  querystring: {
    type: "object",
    properties: {
      branchId: { type: "integer", minimum: 1 },
      isActive: { type: "boolean" },
    },
    additionalProperties: false,
  },
};

// Fase 179 plan 09 (D-15): asignación retroactiva de partner desde la ficha
// del alumno. Espejo de `assignReferrerSchema` (members/schemas.ts) —
// `additionalProperties: false` rechaza mass-assignment antes de llegar al
// service (mismo motivo que el resto de este archivo).
export const assignPartnerToMemberBodySchema = {
  body: {
    type: "object",
    required: ["partnerId"],
    properties: {
      partnerId: { type: "integer", minimum: 1 },
    },
    additionalProperties: false,
  },
};
