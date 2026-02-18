export const getSessionsSchema = {
  querystring: {
    type: "object",
    properties: {
      week: { type: "integer" },
      day: { type: "string" },
      levelGroup: { type: "string" },
      status: { type: "string", enum: ["pending_review", "approved"] },
      page: { type: "integer", minimum: 1, default: 1 },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      sortBy: { type: "string", enum: ["day", "week", "status"] },
      descending: { type: "boolean" },
    },
  },
};

export const sessionIdSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "integer" },
    },
  },
};

export const bulkApproveSchema = {
  body: {
    type: "object",
    required: ["ids"],
    properties: {
      ids: { type: "array", items: { type: "integer" }, minItems: 1 },
    },
  },
};

export const getWeekSummarySchema = {
  params: {
    type: "object",
    required: ["week"],
    properties: {
      week: { type: "integer" },
    },
  },
};

export const generateWeekSchema = {
  body: {
    type: "object",
    required: ["week"],
    properties: {
      week: { type: "integer", minimum: 1, maximum: 52 },
      days: {
        type: "array",
        items: {
          type: "string",
          enum: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado"],
        },
      },
      levelGroups: {
        type: "array",
        items: { type: "string", enum: ["alfa_delta", "sigma", "omega"] },
      },
      regenerate: { type: "boolean", default: false },
    },
  },
};

export const getBlockPoolSchema = {
  querystring: {
    type: "object",
    required: ["route", "memberLevel"],
    properties: {
      route: { type: "string" },
      memberLevel: { type: "string" },
      excludeSessionId: { type: "integer" },
      excludeBlockId: { type: "integer" },
    },
  },
};

export const swapBlockSchema = {
  params: {
    type: "object",
    required: ["sessionId", "blockId"],
    properties: {
      sessionId: { type: "integer" },
      blockId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    required: ["sourceBlockId"],
    properties: {
      sourceBlockId: { type: "integer" },
    },
  },
};

// ---------------------------------------------------------------------------
// Session Editing Schemas (Phase 15-03)
// ---------------------------------------------------------------------------

export const getExercisePoolSchema = {
  querystring: {
    type: "object",
    required: ["route", "blockId"],
    properties: {
      route: { type: "string" },
      contraction: { type: "string", enum: ["CON", "EXC", "ISO"] },
      blockId: { type: "integer" },
      pattern: { type: "string" },
    },
  },
};

export const searchExercisesSchema = {
  querystring: {
    type: "object",
    required: ["q"],
    properties: {
      q: { type: "string", minLength: 2, maxLength: 100 },
      contraction: { type: "string", enum: ["CON", "EXC", "ISO"] },
      blockId: { type: "integer" },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
    },
  },
};

export const swapExerciseSchema = {
  params: {
    type: "object",
    required: ["sessionId", "blockId", "prescriptionId"],
    properties: {
      sessionId: { type: "integer" },
      blockId: { type: "integer" },
      prescriptionId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    required: ["newExerciseId"],
    properties: {
      newExerciseId: { type: "integer" },
    },
  },
};

export const updatePrescriptionSchema = {
  params: {
    type: "object",
    required: ["sessionId", "blockId", "prescriptionId"],
    properties: {
      sessionId: { type: "integer" },
      blockId: { type: "integer" },
      prescriptionId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    properties: {
      reps: { type: "integer", minimum: 0 },
      repsMax: { type: ["integer", "null"], minimum: 0 },
      seconds: { type: "integer", minimum: 0 },
      secondsMax: { type: ["integer", "null"], minimum: 0 },
      increment: { type: ["integer", "null"], minimum: 0 },
      rest: { type: "integer", minimum: 0 },
      notes: { type: ["string", "null"] },
    },
    additionalProperties: false,
  },
};

export const changeFormatSchema = {
  params: {
    type: "object",
    required: ["sessionId", "blockId"],
    properties: {
      sessionId: { type: "integer" },
      blockId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    required: ["formatId", "formatName"],
    properties: {
      formatId: { type: "integer" },
      formatName: { type: "string" },
    },
  },
};

export const addExerciseSchema = {
  params: {
    type: "object",
    required: ["sessionId", "blockId"],
    properties: {
      sessionId: { type: "integer" },
      blockId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    required: ["exerciseId"],
    properties: {
      exerciseId: { type: "integer" },
    },
  },
};

export const removeExerciseSchema = {
  params: {
    type: "object",
    required: ["sessionId", "blockId", "prescriptionId"],
    properties: {
      sessionId: { type: "integer" },
      blockId: { type: "integer" },
      prescriptionId: { type: "integer" },
    },
  },
};

export const reorderExerciseSchema = {
  params: {
    type: "object",
    required: ["sessionId", "blockId", "prescriptionId"],
    properties: {
      sessionId: { type: "integer" },
      blockId: { type: "integer" },
      prescriptionId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    required: ["direction"],
    properties: {
      direction: { type: "string", enum: ["up", "down"] },
    },
  },
};

export const resetSessionSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "integer" },
    },
  },
};

export const getCompatibleFormatsSchema = {
  querystring: {
    type: "object",
    required: ["blockRole", "level", "intensity"],
    properties: {
      blockRole: { type: "string" },
      level: { type: "string" },
      intensity: { type: "integer", minimum: 0, maximum: 100 },
    },
  },
};

export const getPreviewSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "integer" },
    },
  },
  querystring: {
    type: "object",
    properties: {
      memberLevel: { type: "string" },
    },
  },
};

// ---------------------------------------------------------------------------
// Format Params Schema (Phase 16-02)
// ---------------------------------------------------------------------------

export const updateFormatParamsSchema = {
  params: {
    type: "object",
    required: ["sessionId", "blockId"],
    properties: {
      sessionId: { type: "integer" },
      blockId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    required: ["formatParams"],
    properties: {
      formatParams: { type: "object" },
    },
  },
};

// ---------------------------------------------------------------------------
// Mobility Schemas (Phase 17-02)
// ---------------------------------------------------------------------------

export const getMobilityPoolSchema = {
  querystring: {
    type: "object",
    required: ["blockRoute"],
    properties: {
      blockRoute: { type: "string" },
    },
  },
};

export const swapMobilityExerciseSchema = {
  params: {
    type: "object",
    required: ["sessionId", "blockId"],
    properties: {
      sessionId: { type: "integer" },
      blockId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    required: ["newExerciseId"],
    properties: {
      newExerciseId: { type: "integer" },
    },
  },
};

// ---------------------------------------------------------------------------
// Saved Blocks Schemas (Phase 16-07)
// ---------------------------------------------------------------------------

export const saveBlockSchema = {
  body: {
    type: "object",
    required: ["blockId", "name"],
    properties: {
      blockId: { type: "integer" },
      name: { type: "string", minLength: 1, maxLength: 150 },
    },
  },
};

export const updateBlockRoleSchema = {
  params: {
    type: "object",
    required: ["sessionId", "blockId"],
    properties: {
      sessionId: { type: "integer" },
      blockId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    required: ["role"],
    properties: {
      role: { type: "string", enum: ["ATHLOS", "EPIKOS"] },
    },
  },
};

export const deleteSavedBlockSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "integer" },
    },
  },
};

// ---------------------------------------------------------------------------
// Batch endpoints (N+1 fixes)
// ---------------------------------------------------------------------------

export const getDaySessionDetailsSchema = {
  querystring: {
    type: "object",
    required: ["week", "day"],
    properties: {
      week: { type: "integer", minimum: 1, maximum: 52 },
      day: {
        type: "string",
        enum: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado"],
      },
    },
  },
};

export const getCompatibleFormatsBatchSchema = {
  body: {
    type: "object",
    required: ["blocks"],
    properties: {
      blocks: {
        type: "array",
        items: {
          type: "object",
          required: ["blockRole", "level", "intensity"],
          properties: {
            blockRole: { type: "string" },
            level: { type: "string" },
            intensity: { type: "integer", minimum: 0, maximum: 100 },
          },
        },
        minItems: 1,
        maxItems: 10,
      },
    },
  },
};
