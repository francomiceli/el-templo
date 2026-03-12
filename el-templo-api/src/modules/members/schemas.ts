/**
 * Fastify JSON schemas for Members API request/response validation.
 */

// =============================================================================
// Shared response fragments
// =============================================================================

const memberListItemSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    email: { type: "string" },
    firstName: { type: ["string", "null"] },
    lastName: { type: ["string", "null"] },
    phone: { type: ["string", "null"] },
    dni: { type: ["string", "null"] },
    level: { type: "string" },
    branchId: { type: "integer" },
    branchName: { type: "string" },
    isActive: { type: "boolean" },
    isOverdue: { type: "boolean" },
    planName: { type: ["string", "null"] },
    createdAt: { type: "string" },
  },
} as const;

const memberProfileSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    email: { type: "string" },
    firstName: { type: ["string", "null"] },
    lastName: { type: ["string", "null"] },
    phone: { type: ["string", "null"] },
    dni: { type: ["string", "null"] },
    dateOfBirth: { type: ["string", "null"] },
    gender: { type: ["string", "null"] },
    emergencyContactName: { type: ["string", "null"] },
    emergencyContactPhone: { type: ["string", "null"] },
    emergencyContactRelationship: { type: ["string", "null"] },
    role: { type: "string" },
    level: { type: "string" },
    branchId: { type: "integer" },
    branchName: { type: "string" },
    isActive: { type: "boolean" },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
} as const;

const noteSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    userId: { type: "integer" },
    authorId: { type: "integer" },
    authorName: { type: "string" },
    content: { type: "string" },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
} as const;

const errorSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
} as const;

// =============================================================================
// Member Endpoints
// =============================================================================

export const listMembersSchema = {
  querystring: {
    type: "object",
    properties: {
      search: { type: "string" },
      branchId: { type: "integer" },
      level: {
        type: "string",
        enum: ["alfa", "delta", "sigma", "omega", "spartan"],
      },
      isActive: { type: "boolean" },
      overdue: { type: "boolean" },
      planId: { type: "integer" },
      page: { type: "integer", minimum: 1, default: 1 },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        members: { type: "array", items: memberListItemSchema },
        total: { type: "integer" },
        page: { type: "integer" },
        limit: { type: "integer" },
      },
    },
  },
};

export const getMemberSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer" },
    },
  },
  response: {
    200: memberProfileSchema,
    404: errorSchema,
  },
};

export const createMemberSchema = {
  body: {
    type: "object",
    required: [
      "email",
      "firstName",
      "lastName",
      "phone",
      "dni",
      "branchId",
      "planId",
    ],
    properties: {
      email: { type: "string", format: "email" },
      firstName: { type: "string", minLength: 1 },
      lastName: { type: "string", minLength: 1 },
      phone: { type: "string", minLength: 1 },
      dni: { type: "string", minLength: 1 },
      branchId: { type: "integer" },
      planId: { type: "integer" },
      level: {
        type: "string",
        enum: ["alfa", "delta", "sigma", "omega", "spartan"],
      },
      dateOfBirth: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      gender: { type: "string", enum: ["male", "female", "other"] },
      emergencyContactName: { type: "string" },
      emergencyContactPhone: { type: "string" },
      emergencyContactRelationship: { type: "string" },
    },
  },
  response: {
    201: memberProfileSchema,
    409: errorSchema,
  },
};

export const updateMemberSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    properties: {
      firstName: { type: "string" },
      lastName: { type: "string" },
      phone: { type: "string" },
      dni: { type: "string" },
      dateOfBirth: { type: ["string", "null"] },
      gender: {
        type: ["string", "null"],
        enum: ["male", "female", "other", null],
      },
      emergencyContactName: { type: ["string", "null"] },
      emergencyContactPhone: { type: ["string", "null"] },
      emergencyContactRelationship: { type: ["string", "null"] },
      branchId: { type: "integer" },
      level: {
        type: "string",
        enum: ["alfa", "delta", "sigma", "omega", "spartan"],
      },
    },
  },
  response: {
    200: memberProfileSchema,
    404: errorSchema,
    409: errorSchema,
  },
};

export const toggleStatusSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    required: ["isActive"],
    properties: {
      isActive: { type: "boolean" },
    },
  },
  response: {
    200: memberProfileSchema,
    404: errorSchema,
  },
};

export const checkDniSchema = {
  querystring: {
    type: "object",
    required: ["dni"],
    properties: {
      dni: { type: "string" },
      excludeUserId: { type: "integer" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        available: { type: "boolean" },
        existingMemberName: { type: "string" },
      },
    },
  },
};

// =============================================================================
// Notes Endpoints
// =============================================================================

export const listNotesSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        notes: { type: "array", items: noteSchema },
      },
    },
  },
};

export const createNoteSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    required: ["content"],
    properties: {
      content: { type: "string", minLength: 1 },
    },
  },
  response: {
    201: noteSchema,
  },
};

export const updateNoteSchema = {
  params: {
    type: "object",
    required: ["userId", "noteId"],
    properties: {
      userId: { type: "integer" },
      noteId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    required: ["content"],
    properties: {
      content: { type: "string", minLength: 1 },
    },
  },
  response: {
    200: noteSchema,
    403: errorSchema,
    404: errorSchema,
  },
};

export const deleteNoteSchema = {
  params: {
    type: "object",
    required: ["userId", "noteId"],
    properties: {
      userId: { type: "integer" },
      noteId: { type: "integer" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        success: { type: "boolean" },
      },
    },
    403: errorSchema,
    404: errorSchema,
  },
};
