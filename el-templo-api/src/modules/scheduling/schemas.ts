/**
 * Fastify JSON schemas for Scheduling API request/response validation.
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

const activityRecordSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    description: { type: ["string", "null"] },
    isActive: { type: "boolean" },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
} as const;

const scheduleSlotSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    branchId: { type: "integer" },
    branchName: { type: "string" },
    activityId: { type: "integer" },
    activityName: { type: "string" },
    dayOfWeek: { type: "integer" },
    startTime: { type: "string" },
    endTime: { type: "string" },
    isActive: { type: "boolean" },
  },
} as const;

const weeklySlotViewSchema = {
  type: "object",
  properties: {
    ...scheduleSlotSchema.properties,
    bookedCount: { type: "integer" },
    maxCapacity: { type: "integer" },
    isFull: { type: "boolean" },
    isHoliday: { type: "boolean" },
  },
} as const;

const bookingRecordSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    memberId: { type: "integer" },
    memberName: { type: "string" },
    scheduleId: { type: "integer" },
    activityName: { type: "string" },
    dayOfWeek: { type: "integer" },
    startTime: { type: "string" },
    bookingDate: { type: "string" },
    status: {
      type: "string",
      enum: [
        "reservado",
        "qr_escaneado",
        "confirmado",
        "cancelado",
        "lista_espera",
        "no_show",
      ],
    },
    waitlistPosition: { type: ["integer", "null"] },
    bookedAt: { type: "string" },
    cancelledAt: { type: ["string", "null"] },
  },
} as const;

const holidayRecordSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    country: { type: "string" },
    date: { type: "string" },
    name: { type: "string" },
  },
} as const;

const attendanceWeekRecordSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    scheduleId: { type: "integer" },
    activityName: { type: "string" },
    dayOfWeek: { type: "integer" },
    startTime: { type: "string" },
    checkedInAt: { type: "string" },
    status: { type: "string", enum: ["confirmado"] },
  },
} as const;

// =============================================================================
// Admin Endpoints
// =============================================================================

export const createActivitySchema = {
  body: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1 },
      description: { type: "string" },
    },
  },
  response: {
    201: activityRecordSchema,
    400: errorSchema,
  },
};

export const listActivitiesSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        activities: { type: "array", items: activityRecordSchema },
      },
    },
  },
};

export const updateActivitySchema = {
  params: {
    type: "object",
    required: ["activityId"],
    properties: {
      activityId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1 },
      description: { type: "string" },
      isActive: { type: "boolean" },
    },
  },
  response: {
    200: activityRecordSchema,
    404: errorSchema,
  },
};

export const createScheduleSchema = {
  body: {
    type: "object",
    required: ["branchId", "activityId", "dayOfWeek", "startTime", "endTime"],
    properties: {
      branchId: { type: "integer" },
      activityId: { type: "integer" },
      dayOfWeek: { type: "integer", minimum: 1, maximum: 6 },
      startTime: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
      endTime: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
    },
  },
  response: {
    201: scheduleSlotSchema,
    400: errorSchema,
    404: errorSchema,
    409: errorSchema,
  },
};

export const weeklyGridSchema = {
  querystring: {
    type: "object",
    required: ["branchId", "weekStart"],
    properties: {
      branchId: { type: "integer" },
      weekStart: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        slots: { type: "array", items: weeklySlotViewSchema },
        holidays: { type: "array", items: holidayRecordSchema },
      },
    },
  },
};

export const slotDetailSchema = {
  params: {
    type: "object",
    required: ["scheduleId"],
    properties: {
      scheduleId: { type: "integer" },
    },
  },
  querystring: {
    type: "object",
    required: ["date"],
    properties: {
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        schedule: scheduleSlotSchema,
        date: { type: "string" },
        bookings: { type: "array", items: bookingRecordSchema },
        maxCapacity: { type: "integer" },
      },
    },
    404: errorSchema,
  },
};

export const toggleScheduleSchema = {
  params: {
    type: "object",
    required: ["scheduleId"],
    properties: {
      scheduleId: { type: "integer" },
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
    200: scheduleSlotSchema,
    404: errorSchema,
  },
};

export const updateScheduleActivitySchema = {
  params: {
    type: "object",
    required: ["scheduleId"],
    properties: {
      scheduleId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    required: ["activityId"],
    properties: {
      activityId: { type: "integer" },
    },
  },
  response: {
    200: scheduleSlotSchema,
    400: errorSchema,
    404: errorSchema,
  },
};

export const seedSchedulesSchema = {
  body: {
    type: "object",
    required: ["branchId"],
    properties: {
      branchId: { type: "integer" },
    },
  },
  response: {
    201: {
      type: "object",
      properties: {
        created: { type: "integer" },
      },
    },
    400: errorSchema,
    404: errorSchema,
  },
};

export const adminAddBookingSchema = {
  body: {
    type: "object",
    required: ["scheduleId", "memberId", "date"],
    properties: {
      scheduleId: { type: "integer" },
      memberId: { type: "integer" },
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    },
  },
  response: {
    201: {
      type: "object",
      properties: {
        booking: bookingRecordSchema,
        warnings: { type: "array", items: { type: "string" } },
      },
    },
    400: errorSchema,
    404: errorSchema,
    409: errorSchema,
  },
};

export const adminRemoveBookingSchema = {
  params: {
    type: "object",
    required: ["bookingId"],
    properties: {
      bookingId: { type: "integer" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        cancelled: { type: "boolean" },
      },
    },
    404: errorSchema,
  },
};

export const addHolidaySchema = {
  body: {
    type: "object",
    required: ["country", "date", "name"],
    properties: {
      country: { type: "string", minLength: 2, maxLength: 2 },
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      name: { type: "string", minLength: 1 },
    },
  },
  response: {
    201: holidayRecordSchema,
    400: errorSchema,
  },
};

export const removeHolidaySchema = {
  params: {
    type: "object",
    required: ["holidayId"],
    properties: {
      holidayId: { type: "integer" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        deleted: { type: "boolean" },
      },
    },
    404: errorSchema,
  },
};

export const listHolidaysSchema = {
  querystring: {
    type: "object",
    properties: {
      country: { type: "string", minLength: 2, maxLength: 2 },
      year: { type: "integer" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        holidays: { type: "array", items: holidayRecordSchema },
      },
    },
  },
};

// =============================================================================
// Member Endpoints
// =============================================================================

export const memberWeeklyGridSchema = {
  querystring: {
    type: "object",
    required: ["weekStart"],
    properties: {
      weekStart: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      branchId: { type: "integer" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        slots: { type: "array", items: weeklySlotViewSchema },
        holidays: { type: "array", items: holidayRecordSchema },
        myBookings: { type: "array", items: bookingRecordSchema },
        myAttendance: { type: "array", items: attendanceWeekRecordSchema },
      },
    },
  },
};

export const reserveSchema = {
  body: {
    type: "object",
    required: ["scheduleId", "date"],
    properties: {
      scheduleId: { type: "integer" },
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    },
  },
  response: {
    201: bookingRecordSchema,
    400: errorSchema,
    409: errorSchema,
  },
};

export const cancelBookingSchema = {
  params: {
    type: "object",
    required: ["bookingId"],
    properties: {
      bookingId: { type: "integer" },
    },
  },
  response: {
    200: bookingRecordSchema,
    400: errorSchema,
    404: errorSchema,
  },
};

export const myBookingsSchema = {
  querystring: {
    type: "object",
    required: ["weekStart"],
    properties: {
      weekStart: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        bookings: { type: "array", items: bookingRecordSchema },
      },
    },
  },
};
