/**
 * Fastify JSON schemas for Members API request/response validation.
 */

// =============================================================================
// Shared response fragments
// =============================================================================

// Phase 101: shape of an active debt as exposed on member list/profile responses.
const activeDebtSchema = {
  type: ["object", "null"],
  properties: {
    amount: { type: "integer" },
    currency: { type: "string" },
    note: { type: ["string", "null"] },
  },
} as const;

const memberListItemSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    email: { type: "string" },
    firstName: { type: ["string", "null"] },
    lastName: { type: ["string", "null"] },
    phone: { type: ["string", "null"] },
    dni: { type: ["string", "null"] },
    documentType: { type: ["string", "null"] },
    photoUrl: { type: ["string", "null"] },
    level: { type: "string" },
    branchId: { type: "integer" },
    branchName: { type: "string" },
    isActive: { type: "boolean" },
    planName: { type: ["string", "null"] },
    segment: { type: ["string", "null"] },
    avatarType: { type: ["string", "null"] },
    createdAt: { type: "string" },
    debt: activeDebtSchema,
  },
} as const;

const onboardingProfileSchema = {
  type: ["object", "null"],
  properties: {
    goalType: { type: "string" },
    goalLabel: { type: "string" },
    experienceLevel: { type: "string" },
    experienceLabel: { type: "string" },
    trainingFocus: { type: "string" },
    focusLabel: { type: "string" },
    motivationStyle: { type: "string" },
    motivationLabel: { type: "string" },
    completedAt: { type: ["string", "null"] },
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
    documentType: { type: ["string", "null"] },
    photoUrl: { type: ["string", "null"] },
    address: { type: ["string", "null"] },
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
    segment: { type: ["string", "null"] },
    segmentUpdatedAt: { type: ["string", "null"] },
    avatarType: { type: ["string", "null"] },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
    onboardingProfile: onboardingProfileSchema,
    // Phase 101: active debt (null when user has no active debt).
    debt: activeDebtSchema,
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
      multiBranch: { type: "boolean" },
      level: {
        type: "string",
        enum: ["alfa", "delta", "sigma", "omega", "spartan"],
      },
      isActive: { type: "boolean" },
      planId: { type: "integer" },
      segment: {
        type: "string",
        enum: [
          "nuevo",
          "espartano",
          "intermitente",
          "en_riesgo",
          "digital_warrior",
          "ghost",
        ],
      },
      avatarType: { type: "string" },
      country: { type: "string", enum: ["AR", "ES"] },
      debtorOnly: { type: "boolean" },
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
        // Phase 101: sum of active debt amounts across the filtered set,
        // grouped by currency. Empty array when no debts match.
        totalDebtByCurrency: {
          type: "array",
          items: {
            type: "object",
            properties: {
              currency: { type: "string" },
              amount: { type: "integer" },
            },
          },
        },
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
      documentType: {
        type: "string",
        enum: ["DNI", "Pasaporte", "NIE", "NIF", "Otro"],
      },
      address: { type: "string", maxLength: 500 },
      branchId: { type: "integer" },
      planId: { type: "integer" },
      level: {
        type: "string",
        enum: ["alfa", "delta", "sigma", "omega", "spartan"],
      },
      dateOfBirth: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      gender: {
        type: "string",
        enum: ["male", "female", "other", "unspecified"],
      },
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
      documentType: {
        type: ["string", "null"],
        enum: ["DNI", "Pasaporte", "NIE", "NIF", "Otro", null],
      },
      photoUrl: { type: ["string", "null"] },
      address: { type: ["string", "null"], maxLength: 500 },
      dateOfBirth: { type: ["string", "null"] },
      gender: {
        type: ["string", "null"],
        enum: ["male", "female", "other", "unspecified", null],
      },
      emergencyContactName: { type: ["string", "null"] },
      emergencyContactPhone: { type: ["string", "null"] },
      emergencyContactRelationship: { type: ["string", "null"] },
      branchId: { type: "integer" },
      level: {
        type: "string",
        enum: ["alfa", "delta", "sigma", "omega", "spartan"],
      },
      // Phase 101: optional debt payload.
      //   omitted  → no debt change
      //   null     → soft-cancel active debt
      //   object   → upsert active debt (RBAC: ADMIN_ROLES only)
      debt: {
        type: ["object", "null"],
        properties: {
          amount: { type: "integer", exclusiveMinimum: 0 },
          currency: { type: "string", enum: ["ARS", "EUR", "USD"] },
          note: { type: ["string", "null"], maxLength: 500 },
        },
        required: ["amount", "currency"],
      },
    },
  },
  response: {
    200: memberProfileSchema,
    403: errorSchema,
    404: errorSchema,
    409: errorSchema,
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
// Export Endpoint
// =============================================================================

export const exportMembersSchema = {
  querystring: {
    type: "object",
    properties: {
      search: { type: "string" },
      branchId: { type: "integer" },
      multiBranch: { type: "boolean" },
      level: {
        type: "string",
        enum: ["alfa", "delta", "sigma", "omega", "spartan"],
      },
      isActive: { type: "boolean" },
      planId: { type: "integer" },
      avatarType: { type: "string" },
      country: { type: "string", enum: ["AR", "ES"] },
    },
  },
  // No response schema -- binary file response
};

// =============================================================================
// Photo Upload Endpoint
// =============================================================================

export const uploadPhotoUrlSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    required: ["filename"],
    properties: {
      filename: { type: "string", minLength: 1 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        uploadUrl: { type: "string" },
        publicUrl: { type: "string" },
      },
    },
    503: errorSchema,
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

// =============================================================================
// Session Level Counts (Phase 99 R11)
// =============================================================================

export const getMemberSessionLevelsSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer", minimum: 1 },
    },
  },
  querystring: {
    type: "object",
    properties: {
      days: { type: "integer", minimum: 1, maximum: 365, default: 30 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        counts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              level: {
                type: "string",
                enum: ["alfa", "delta", "sigma", "omega", "spartan"],
              },
              count: { type: "integer", minimum: 0 },
            },
            required: ["level", "count"],
            additionalProperties: false,
          },
        },
      },
      required: ["counts"],
    },
    401: errorSchema,
    403: errorSchema,
  },
};
