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
    },
    additionalProperties: false,
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
    },
    additionalProperties: false,
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
