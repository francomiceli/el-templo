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
    inactiveReason: { type: ["string", "null"] },
    deactivatedAt: { type: ["string", "null"] },
  },
} as const;

const weeklySlotViewSchema = {
  type: "object",
  properties: {
    ...scheduleSlotSchema.properties,
    bookedCount: { type: "integer" },
    trialCount: { type: "integer" },
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
    // Phase 102: isTrial is part of the public BookingRecord shape so the
    // admin UI can split the slot roster into Reservados vs Sesiones de
    // Prueba without a second fetch.
    isTrial: { type: "boolean" },
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
    // Phase 113 (D-16): name-uniqueness collision against active activities.
    409: errorSchema,
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
    // Phase 113 (D-13/D-16): conflict body carries optional affectedSchedules
    // when deactivation is blocked by referencing schedules. Fastify
    // fast-json-stringify strips properties not declared here, so the list
    // must be in the schema or it would arrive empty on the client.
    409: {
      type: "object",
      properties: {
        error: { type: "string" },
        message: { type: "string" },
        affectedSchedules: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "integer" },
              dayOfWeek: { type: "integer" },
              startTime: { type: "string" },
              endTime: { type: "string" },
              branchName: { type: "string" },
            },
          },
        },
      },
    },
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
        branchTimezone: { type: "string" },
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
      // Optional: shown to members in the booking error toast when they try
      // to reserve a deactivated slot. Ignored when isActive=true (the
      // service clears the stored reason on reactivation).
      inactiveReason: { type: ["string", "null"], maxLength: 255 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        ...scheduleSlotSchema.properties,
        // Number of upcoming bookings cancelled as part of deactivation.
        // Always 0 when reactivating.
        cancelledBookings: { type: "integer" },
        // Number of bookings (cancelled during the deactivation window)
        // that were restored as part of reactivation. Always 0 when
        // deactivating.
        restoredBookings: { type: "integer" },
      },
    },
    404: errorSchema,
  },
};

export const previewScheduleDeletionSchema = {
  params: {
    type: "object",
    required: ["scheduleId"],
    properties: {
      scheduleId: { type: "integer" },
    },
  },
  querystring: {
    type: "object",
    required: ["fromDate"],
    properties: {
      fromDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        cancelledBookings: { type: "integer" },
        affectedFixedMembers: { type: "integer" },
        affectedFlexibleMembers: { type: "integer" },
        creditsToGrant: { type: "integer" },
        sampleMembers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              memberName: { type: "string" },
              planType: { type: "string", enum: ["fixed", "flexible"] },
            },
          },
        },
      },
    },
    404: errorSchema,
  },
};

export const deleteScheduleFromDateSchema = {
  params: {
    type: "object",
    required: ["scheduleId"],
    properties: {
      scheduleId: { type: "integer" },
    },
  },
  body: {
    type: "object",
    required: ["fromDate"],
    properties: {
      fromDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        cancelledBookings: { type: "integer" },
        affectedFixedMembers: { type: "integer" },
        creditsGranted: { type: "integer" },
      },
    },
    400: errorSchema,
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

/**
 * Phase 103: bookTrialSchema
 *
 * POST /api/admin/scheduling/trials
 * Books an existing prueba user into a class slot. The user must be created
 * via /admin/members first (which defaults status='prueba'); this endpoint
 * only attaches the booking. Validation/conflict logic lives in TrialService.
 */
export const bookTrialSchema = {
  body: {
    type: "object",
    required: ["userId", "scheduleId", "bookingDate"],
    properties: {
      userId: { type: "integer", minimum: 1 },
      scheduleId: { type: "integer", minimum: 1 },
      bookingDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    },
    additionalProperties: false,
  },
  response: {
    201: {
      type: "object",
      required: ["bookingId"],
      properties: {
        bookingId: { type: "integer" },
      },
    },
    400: errorSchema,
    404: errorSchema,
    409: errorSchema,
  },
} as const;

/**
 * Phase 103: listEligibleTrialsSchema
 *
 * GET /api/admin/scheduling/trials/eligible?branchId=X
 * Returns prueba users in the given branch who have not yet booked a trial.
 * Used by the SlotDetailDialog inline trial picker.
 */
export const listEligibleTrialsSchema = {
  querystring: {
    type: "object",
    required: ["branchId"],
    properties: {
      branchId: { type: "integer", minimum: 1 },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["users"],
      properties: {
        users: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "firstName", "lastName", "phone", "dni"],
            properties: {
              id: { type: "integer" },
              firstName: { type: "string" },
              lastName: { type: "string" },
              phone: { type: ["string", "null"] },
              dni: { type: ["string", "null"] },
            },
          },
        },
      },
    },
  },
} as const;

/**
 * Phase 102-06: listTrialsSchema
 *
 * GET /api/admin/scheduling/trials?date=YYYY-MM-DD&shift=TM|TT|all&branchId?
 * Returns trials grouped by branch for a coach-facing shift briefing.
 */
export const listTrialsSchema = {
  querystring: {
    type: "object",
    required: ["date"],
    properties: {
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      shift: { type: "string", enum: ["TM", "TT", "all"] },
      branchId: { type: "integer", minimum: 1 },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["date", "shift", "groups"],
      properties: {
        date: { type: "string" },
        shift: { type: "string", enum: ["TM", "TT", "all"] },
        groups: {
          type: "array",
          items: {
            type: "object",
            required: ["branchId", "branchName", "trials"],
            properties: {
              branchId: { type: "integer" },
              branchName: { type: "string" },
              trials: {
                type: "array",
                items: {
                  type: "object",
                  required: [
                    "bookingId",
                    "userId",
                    "firstName",
                    "lastName",
                    "phone",
                    "scheduleId",
                    "startTime",
                    "endTime",
                    "activityName",
                    "status",
                  ],
                  properties: {
                    bookingId: { type: "integer" },
                    userId: { type: "integer" },
                    firstName: { type: "string" },
                    lastName: { type: "string" },
                    phone: { type: ["string", "null"] },
                    scheduleId: { type: "integer" },
                    startTime: { type: "string" },
                    endTime: { type: "string" },
                    activityName: { type: "string" },
                    status: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    400: errorSchema,
  },
} as const;

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
    409: errorSchema,
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
        branchTimezone: { type: "string" },
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
