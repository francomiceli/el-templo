/**
 * User Management JSON Schemas
 *
 * Fastify JSON schema definitions for user management CRUD endpoints.
 */

export const listStaffSchema = {
  querystring: {
    type: "object",
    properties: {
      branchId: { type: "integer" },
    },
  },
  response: {
    200: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          email: { type: "string" },
          firstName: { type: "string", nullable: true },
          lastName: { type: "string", nullable: true },
          role: { type: "string" },
          branchId: { type: "integer" },
          branchName: { type: "string", nullable: true },
          // Phase 103-06 (R11): replaces legacy `isActive`. Semantic
          // inversion: `staffDisabled=true` means the staff member is
          // deactivated and cannot log in (gated by Plan 07 in /login).
          staffDisabled: { type: "boolean" },
          // Phase 110 REQ-1 / REQ-2: country (admin/gestion) and
          // branchIds (coach/recepción) projected for the UI.
          country: { type: "string", nullable: true },
          branchIds: { type: "array", items: { type: "integer" } },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
};

export const createStaffSchema = {
  body: {
    type: "object",
    required: [
      "firstName",
      "lastName",
      "email",
      "password",
      "role",
      "branchId",
    ],
    properties: {
      firstName: { type: "string", minLength: 1 },
      lastName: { type: "string", minLength: 1 },
      email: { type: "string", format: "email" },
      password: { type: "string", minLength: 6 },
      role: {
        type: "string",
        enum: ["coach", "admin", "owner", "gestion", "recepcion"],
      },
      branchId: { type: "integer" },
      // Phase 110 REQ-1: country of management for admin/gestion (validated
      // by validateStaffCardinality in service). Owner / coach / recepción
      // must NOT carry country (REQ-9 rule 3 for owner; ignored for the rest).
      country: { type: "string", enum: ["AR", "ES"], nullable: true },
      // Phase 110 REQ-2: operational branches for coach/recepción (validated
      // by validateStaffCardinality). Empty/absent for other roles.
      branchIds: {
        type: "array",
        items: { type: "integer" },
        default: [],
      },
    },
    additionalProperties: false,
    // Phase 110 REQ-9 (4th rule): members must NOT carry branchIds. AJV-level
    // rejection prevents malformed payloads from reaching the service. The
    // service keeps its own validateStaffCardinality check as belt-and-
    // suspenders. Note: the staff CRUD route is also OWNER_ROLES-only, so
    // this is defense-in-depth.
    if: {
      properties: { role: { const: "member" } },
      required: ["role"],
    },
    then: {
      properties: {
        branchIds: { type: "array", maxItems: 0 },
      },
    },
  },
  response: {
    201: {
      type: "object",
      properties: {
        id: { type: "integer" },
        email: { type: "string" },
        firstName: { type: "string" },
        lastName: { type: "string" },
        role: { type: "string" },
        branchId: { type: "integer" },
        country: { type: "string", nullable: true },
        branchIds: { type: "array", items: { type: "integer" } },
      },
    },
  },
};

export const updateStaffSchema = {
  params: {
    type: "object",
    properties: {
      userId: { type: "integer" },
    },
    required: ["userId"],
  },
  body: {
    type: "object",
    properties: {
      firstName: { type: "string", minLength: 1 },
      lastName: { type: "string", minLength: 1 },
      email: { type: "string", format: "email" },
      password: { type: "string", minLength: 6 },
      role: {
        type: "string",
        enum: ["coach", "admin", "owner", "gestion", "recepcion"],
      },
      branchId: { type: "integer" },
      // Phase 110 REQ-1 / REQ-2: same additive shape as create.
      country: { type: "string", enum: ["AR", "ES"], nullable: true },
      // Phase 110: NO `default: []` here (unlike createStaffSchema). For
      // partial UPDATEs where the caller does not touch branchIds (e.g. PUT
      // { password }), the service must distinguish "field absent" (inherit
      // current user_branches) from "explicitly empty" (clear branches). An
      // AJV default would collapse both cases and falsely trip the
      // coach/recepción cardinality rule on every untouched UPDATE.
      branchIds: {
        type: "array",
        items: { type: "integer" },
      },
    },
    additionalProperties: false,
    // Phase 110 REQ-9 (4th rule): mirror of createStaffSchema.
    if: {
      properties: { role: { const: "member" } },
      required: ["role"],
    },
    then: {
      properties: {
        branchIds: { type: "array", maxItems: 0 },
      },
    },
  },
};

// Phase 103-06 (R11, T-103-09): payload field renamed from `isActive`
// (boolean, true=enabled) to `disabled` (boolean, true=deactivated).
// `additionalProperties: false` makes the AJV validator reject the legacy
// `{ isActive: ... }` payload with 400, mitigating semantic-confusion
// attacks during admin-app/api version skew.
export const toggleStatusSchema = {
  params: {
    type: "object",
    properties: {
      userId: { type: "integer" },
    },
    required: ["userId"],
  },
  body: {
    type: "object",
    required: ["disabled"],
    properties: {
      disabled: { type: "boolean" },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: "object",
      properties: {
        staffDisabled: { type: "boolean" },
      },
    },
  },
};
