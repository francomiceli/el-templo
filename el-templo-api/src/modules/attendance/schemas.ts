/**
 * Fastify JSON schemas for Attendance API request/response validation.
 */

// =============================================================================
// Shared response fragments
// =============================================================================

const errorSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
} as const;

const attendanceRecordSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    memberId: { type: "integer" },
    memberName: { type: "string" },
    branchId: { type: "integer" },
    branchName: { type: "string" },
    checkedInAt: { type: "string" },
    status: { type: "string", enum: ["confirmado"] },
    source: { type: "string", enum: ["qr", "manual"] },
  },
} as const;

// =============================================================================
// Admin Endpoints
// =============================================================================

export const memberAttendanceHistorySchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer" },
    },
  },
  querystring: {
    type: "object",
    properties: {
      page: { type: "integer", minimum: 1, default: 1 },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        records: { type: "array", items: attendanceRecordSchema },
        total: { type: "integer" },
        page: { type: "integer" },
        limit: { type: "integer" },
      },
    },
  },
};

// =============================================================================
// Member Endpoints
// =============================================================================

export const memberCheckInSchema = {
  body: {
    type: "object",
    required: ["qrToken"],
    properties: {
      qrToken: { type: "string", minLength: 1 },
    },
  },
  response: {
    201: attendanceRecordSchema,
    400: errorSchema,
  },
};

// =============================================================================
// Force Check-in (Admin)
// =============================================================================

export const forceCheckInSchema = {
  body: {
    type: "object",
    required: ["memberId", "branchId", "reason"],
    properties: {
      memberId: { type: "integer" },
      branchId: { type: "integer" },
      reason: { type: "string", minLength: 1 },
    },
  },
  response: {
    201: attendanceRecordSchema,
    400: errorSchema,
  },
};

// =============================================================================
// Slot Attendance Endpoints (Admin)
// =============================================================================

const slotAttendanceItemSchema = {
  type: "object",
  properties: {
    memberId: { type: "integer" },
    memberName: { type: "string" },
    bookingId: { type: ["integer", "null"] },
    bookingStatus: { type: ["string", "null"] },
    attendanceId: { type: ["integer", "null"] },
    checkedInAt: { type: ["string", "null"] },
    source: { type: ["string", "null"] },
    segment: { type: ["string", "null"] },
    // Phase 136 D-06/D-12: tenure label (Antigüedad) replaces avatarType
    // in the slot roster. Computed on the fly from users.createdAt.
    seniority: { type: ["string", "null"] },
    // Vencimiento countdown source: active/paused subscription end date
    // (YYYY-MM-DD) or null. The pill label is derived client-side.
    endDate: { type: ["string", "null"] },
    // Aniversario de permanencia: frase lista ("Cumple 1 año en El Templo") o
    // null. Aparece el día del hito o en la próxima clase si cayó en falta.
    anniversaryLabel: { type: ["string", "null"] },
  },
} as const;

export const slotAttendanceSchema = {
  params: {
    type: "object",
    required: ["scheduleId", "date"],
    properties: {
      scheduleId: { type: "integer" },
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        members: { type: "array", items: slotAttendanceItemSchema },
      },
    },
  },
};

export const slotCheckInSchema = {
  params: {
    type: "object",
    required: ["scheduleId", "date"],
    properties: {
      scheduleId: { type: "integer" },
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    },
  },
  body: {
    type: "object",
    required: ["memberId"],
    properties: {
      memberId: { type: "integer" },
      reason: { type: "string" },
    },
  },
  response: {
    201: {
      type: "object",
      properties: {
        attendance: attendanceRecordSchema,
        warnings: { type: "array", items: { type: "string" } },
      },
    },
    400: errorSchema,
  },
};

export const removeCheckInSchema = {
  params: {
    type: "object",
    required: ["attendanceId"],
    properties: {
      attendanceId: { type: "integer" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        removed: { type: "boolean" },
      },
    },
    400: errorSchema,
  },
};

// =============================================================================
// Member Endpoints
// =============================================================================

export const memberHistorySchema = {
  querystring: {
    type: "object",
    properties: {
      page: { type: "integer", minimum: 1, default: 1 },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        records: { type: "array", items: attendanceRecordSchema },
        total: { type: "integer" },
        page: { type: "integer" },
        limit: { type: "integer" },
      },
    },
  },
};
