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
    confirmedAt: { type: ["string", "null"] },
    status: { type: "string", enum: ["registrado", "confirmado"] },
    source: { type: "string", enum: ["qr", "manual"] },
  },
} as const;

// =============================================================================
// Admin Endpoints
// =============================================================================

export const generateQrSchema = {
  params: {
    type: "object",
    required: ["branchId"],
    properties: {
      branchId: { type: "integer" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        token: { type: "string" },
        branchId: { type: "integer" },
        branchName: { type: "string" },
      },
    },
    400: errorSchema,
    404: errorSchema,
  },
};

export const todayAttendanceSchema = {
  querystring: {
    type: "object",
    required: ["branchId"],
    properties: {
      branchId: { type: "integer" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        records: { type: "array", items: attendanceRecordSchema },
      },
    },
  },
};

export const batchConfirmSchema = {
  body: {
    type: "object",
    required: ["attendanceIds"],
    properties: {
      attendanceIds: {
        type: "array",
        items: { type: "integer" },
      },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        confirmed: { type: "integer" },
      },
    },
  },
};

export const manualCheckInSchema = {
  body: {
    type: "object",
    required: ["memberId", "branchId"],
    properties: {
      memberId: { type: "integer" },
      branchId: { type: "integer" },
    },
  },
  response: {
    201: attendanceRecordSchema,
    400: errorSchema,
  },
};

export const listAttendanceSchema = {
  querystring: {
    type: "object",
    properties: {
      branchId: { type: "integer" },
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      dateFrom: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      dateTo: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      status: { type: "string", enum: ["registrado", "confirmado"] },
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
