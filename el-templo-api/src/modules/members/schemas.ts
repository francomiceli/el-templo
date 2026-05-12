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
    documentType: { type: ["string", "null"] },
    photoUrl: { type: ["string", "null"] },
    level: { type: "string" },
    branchId: { type: "integer" },
    branchName: { type: "string" },
    // Phase 103 (R10): first-class status enum (replaces the legacy
    // isActive boolean). Nullable to match the DB column (staff rows are
    // NULL — though staff are filtered out of member list endpoints).
    status: {
      type: ["string", "null"],
      enum: ["freemium", "prueba", "activo", "inactivo", null],
    },
    planName: { type: ["string", "null"] },
    segment: { type: ["string", "null"] },
    avatarType: { type: ["string", "null"] },
    createdAt: { type: "string" },
    // Phase 102 (R7): true iff user has ≥1 is_trial=TRUE booking.
    hasUsedTrial: { type: "boolean" },
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
    // Phase 103 (R10): see memberListItemSchema.status.
    status: {
      type: ["string", "null"],
      enum: ["freemium", "prueba", "activo", "inactivo", null],
    },
    segment: { type: ["string", "null"] },
    segmentUpdatedAt: { type: ["string", "null"] },
    avatarType: { type: ["string", "null"] },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
    onboardingProfile: onboardingProfileSchema,
    // Phase 102 (R7): true iff user has ≥1 is_trial=TRUE booking.
    hasUsedTrial: { type: "boolean" },
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
      // Phase 103 (R8): first-class users.status filter. "todos" = no-op
      // (default). The Phase 102 'alumnos'/'leads' values are no longer
      // accepted — admin-app updated in lockstep (no shim, per SPEC).
      status: {
        type: "string",
        enum: ["todos", "freemium", "prueba", "activo", "inactivo"],
      },
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

/**
 * Soft-register schema for SP (sesión de prueba) lead capture.
 * Receptionist-friendly 4-field create — full data is filled in on conversion.
 */
export const createTrialMemberSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["firstName", "lastName", "phone", "branchId"],
    properties: {
      firstName: { type: "string", minLength: 1, maxLength: 100 },
      lastName: { type: "string", minLength: 1, maxLength: 100 },
      phone: { type: "string", minLength: 1, maxLength: 30 },
      branchId: { type: "integer" },
    },
  },
  response: {
    201: memberProfileSchema,
    409: errorSchema,
  },
};

/**
 * Phase 114 (D-27/D-28): PATCH /api/admin/leads/:userId schema.
 *
 * - leadStatus must be one of the 3 enum values.
 * - leadNotes is string|null (max 2000); the service normalizes '' → null.
 * - additionalProperties:false closes the body — unknown keys are stripped
 *   silently by Fastify's default AJV (removeAdditional=true), mirroring the
 *   spoof guard pattern on createTrialMemberSchema (Plan 02 / SUMMARY 114-02).
 */
export const updateLeadSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer", minimum: 1 },
    },
  },
  body: {
    type: "object",
    additionalProperties: false,
    properties: {
      leadStatus: {
        type: "string",
        enum: ["en_seguimiento", "cerrado", "perdido"],
      },
      leadNotes: {
        anyOf: [{ type: "string", maxLength: 2000 }, { type: "null" }],
      },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        userId: { type: "integer" },
        leadStatus: {
          anyOf: [
            {
              type: "string",
              enum: ["en_seguimiento", "cerrado", "perdido"],
            },
            { type: "null" },
          ],
        },
        leadNotes: {
          anyOf: [{ type: "string" }, { type: "null" }],
        },
        status: {
          anyOf: [
            {
              type: "string",
              enum: ["freemium", "prueba", "activo", "inactivo"],
            },
            { type: "null" },
          ],
        },
        createdBy: {
          anyOf: [
            {
              type: "object",
              properties: {
                userId: { type: "integer" },
                name: { type: "string" },
              },
            },
            { type: "null" },
          ],
        },
      },
    },
    400: errorSchema,
    403: errorSchema,
    404: errorSchema,
    409: errorSchema,
  },
} as const;

export const createMemberSchema = {
  body: {
    type: "object",
    required: ["email", "firstName", "lastName", "phone", "dni", "branchId"],
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
      dateOfBirth: {
        type: ["string", "null"],
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      },
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
    // Phase 105 (D-11): close the schema so legacy admin clients posting
    // `debt`/`isDebtor`/`debtAmount`/`debtCurrency`/`debtNote` get a 400
    // with a clear validation error. The new finance model exposes the
    // dedicated POST /transactions endpoint (Phase 106+) for any
    // debt/payment workflow.
    additionalProperties: false,
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
    },
  },
  response: {
    200: memberProfileSchema,
    403: errorSchema,
    404: errorSchema,
    409: errorSchema,
  },
};

export const resetMemberPasswordSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer" },
    },
  },
  response: {
    204: { type: "null" },
    400: errorSchema,
    403: errorSchema,
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
// Check Duplicates (Phase 111 Plan 04 — REQ-4)
// =============================================================================

// Querystring schema for GET /admin/members/check-duplicates. Both dni and
// phone are optional at the schema level; the route handler enforces that
// at least one is provided (400 MISSING_QUERY) so the structured error body
// can carry the `code` field per Phase 110 D-05.
export const checkDuplicatesSchema = {
  querystring: {
    type: "object",
    properties: {
      dni: { type: "string" },
      phone: { type: "string" },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: "object",
      properties: {
        matches: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "integer" },
              firstName: { type: ["string", "null"] },
              lastName: { type: ["string", "null"] },
              branchId: { type: "integer" },
              branchName: { type: "string" },
              isVirtual: { type: "boolean" },
              status: {
                type: ["string", "null"],
                enum: ["freemium", "prueba", "activo", "inactivo", null],
              },
              deletedAt: { type: ["string", "null"] },
              matchedField: { type: "string", enum: ["dni", "phone"] },
            },
          },
        },
      },
    },
    400: {
      type: "object",
      properties: {
        error: { type: "string" },
        message: { type: "string" },
        code: { type: "string" },
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
      // Phase 103 (R8): export uses the same status enum as the list endpoint.
      status: {
        type: "string",
        enum: ["todos", "freemium", "prueba", "activo", "inactivo"],
      },
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
