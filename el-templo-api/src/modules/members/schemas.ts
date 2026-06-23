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
    // Phase 114 (D-38): lead-lifecycle fields. Fastify's response
    // serializer strips unlisted fields (see Plan 106-04), so these must
    // be declared explicitly. `createdBy` allows additionalProperties:true
    // because the object shape is small + closed in practice but the
    // serializer escape hatch matches the Plan 106-04 precedent for
    // optional denormalized JOIN payloads.
    leadStatus: {
      type: ["string", "null"],
      enum: ["en_seguimiento", "cerrado", "perdido", null],
    },
    leadNotes: { type: ["string", "null"] },
    createdBy: {
      type: ["object", "null"],
      additionalProperties: true,
      properties: {
        userId: { type: "integer" },
        name: { type: "string" },
      },
    },
    // Latest non-cancelled trial booking (see types.ts MemberProfile.latestTrial).
    // Same Fastify-strips-unlisted-fields gotcha applies — must be declared.
    latestTrial: {
      type: ["object", "null"],
      additionalProperties: true,
      properties: {
        bookingId: { type: "integer" },
        bookingDate: { type: "string" },
        startTime: { type: "string" },
        branchName: { type: "string" },
        attended: {
          type: ["string", "null"],
          enum: ["si", "no", null],
        },
      },
    },
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
        enum: ["kairos", "alfa", "delta", "sigma", "omega", "spartan"],
      },
      planId: { type: "integer" },
      // Phase 136 (D-01): Attendance label replaces the legacy 6-value
      // behavioral segment. Fastify rejects values outside this enum with a
      // 400 before the handler — keep it aligned with the admin filter (plan
      // 05) so legitimate `?segment=alerta` requests are not rejected.
      segment: {
        type: "string",
        enum: ["optima", "regular", "alerta", "ausente"],
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

/**
 * Lightweight member typeahead for scheduling dialogs. Returns only the fields
 * needed to render an autocomplete option (id/name/dni); see listMembers for
 * the heavyweight, filterable listing.
 */
export const searchMembersSchema = {
  querystring: {
    type: "object",
    required: ["search"],
    properties: {
      search: { type: "string", minLength: 1 },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        members: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "integer" },
              firstName: { type: ["string", "null"] },
              lastName: { type: ["string", "null"] },
              dni: { type: ["string", "null"] },
              planName: { type: ["string", "null"] },
              status: { type: ["string", "null"] },
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
 * POST /api/admin/members/:userId/convert-to-trial schema.
 *
 * Converts a freemium member into a sesión-de-prueba lead. branchId is the
 * physical sede where the trial will happen (validated as non-virtual in the
 * service). createdBy is NOT accepted from the client — it's sourced from the
 * JWT (additionalProperties:false strips any spoof attempt, same guard as
 * createTrialMemberSchema).
 */
export const convertToTrialSchema = {
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
    required: ["branchId"],
    properties: {
      branchId: { type: "integer" },
    },
  },
  response: {
    200: memberProfileSchema,
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
    // 403 carries an extra `code` field (BRANCH_OUT_OF_SCOPE) so the admin
    // frontend can disambiguate scope denial from generic 403s.
    403: {
      type: "object",
      properties: {
        error: { type: "string" },
        message: { type: "string" },
        code: { type: "string" },
      },
    },
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
        enum: ["kairos", "alfa", "delta", "sigma", "omega", "spartan"],
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
      // Email is only honored when the member has no email on file yet
      // (trial → alumno conversion). The service ignores it once one is set,
      // since it's the member's app login identity. See updateMember.
      email: { type: "string", format: "email" },
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
        enum: ["kairos", "alfa", "delta", "sigma", "omega", "spartan"],
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
        enum: ["kairos", "alfa", "delta", "sigma", "omega", "spartan"],
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
                // WR-03: kairos must be accepted in this RESPONSE enum. Once a
                // member is kairos, the level-counts aggregation yields a
                // {level:"kairos"} row; without this, Fastify response
                // serialization would strip or 500 that row.
                enum: ["kairos", "alfa", "delta", "sigma", "omega", "spartan"],
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
