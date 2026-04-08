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
          isActive: { type: "boolean" },
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
        enum: ["coach", "admin", "owner", "gestion"],
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
        enum: ["coach", "admin", "owner", "gestion"],
      },
      branchId: { type: "integer" },
    },
    additionalProperties: false,
  },
};

export const toggleStatusSchema = {
  params: {
    type: "object",
    properties: {
      userId: { type: "integer" },
    },
    required: ["userId"],
  },
  response: {
    200: {
      type: "object",
      properties: {
        isActive: { type: "boolean" },
      },
    },
  },
};
