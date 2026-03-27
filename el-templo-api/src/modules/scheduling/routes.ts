/**
 * Scheduling API Routes
 *
 * Two route plugins:
 * - schedulingAdminRoutes: Admin/coach endpoints for activities, schedules,
 *   bookings, and holiday management.
 * - schedulingMemberRoutes: Member-facing endpoints for viewing slots,
 *   reserving, cancelling, and viewing own bookings.
 *
 * Each domain is served by a focused service:
 * - ActivityService: activity CRUD
 * - SchedulingService: schedule CRUD + weekly grid
 * - BookingService: reserve, cancel, waitlist, admin add/remove
 * - HolidayService: holiday CRUD + date queries
 */

import { FastifyPluginAsync } from "fastify";
import { eq, and } from "drizzle-orm";
import * as schema from "../../db/schema";
import { SchedulingService } from "./service";
import { ActivityService } from "./activity-service";
import { BookingService } from "./booking-service";
import { HolidayService } from "./holiday-service";
import { PaymentService } from "../payments/service";
import { SubscriptionService } from "../subscriptions/service";
import { AuraService } from "../aura/service";
import { handleServiceError } from "../shared/error-handler";
import {
  createActivitySchema,
  listActivitiesSchema,
  updateActivitySchema,
  createScheduleSchema,
  weeklyGridSchema,
  slotDetailSchema,
  toggleScheduleSchema,
  seedSchedulesSchema,
  adminAddBookingSchema,
  adminRemoveBookingSchema,
  addHolidaySchema,
  removeHolidaySchema,
  listHolidaysSchema,
  memberWeeklyGridSchema,
  reserveSchema,
  cancelBookingSchema,
  myBookingsSchema,
} from "./schemas";
import type { DayOfWeek } from "./types";

import { TRAINING_ROLES, ALL_STAFF_ROLES } from "../shared/permissions";

// =============================================================================
// Admin Routes (registered at /api/admin/scheduling)
// =============================================================================

export const schedulingAdminRoutes: FastifyPluginAsync = async (fastify) => {
  // Service instantiation with dependency injection
  const activityService = new ActivityService(fastify.db, fastify.log);
  const holidayService = new HolidayService(fastify.db, fastify.log);
  const schedulingService = new SchedulingService(
    fastify.db,
    fastify.log,
    holidayService,
  );

  const paymentService = new PaymentService(fastify.db, fastify.log);
  const auraService = new AuraService(fastify.db);
  const subscriptionService = new SubscriptionService(
    fastify.db,
    fastify.log,
    auraService,
  );
  const bookingService = new BookingService(
    fastify.db,
    fastify.log,
    paymentService,
    subscriptionService,
  );
  // Wire circular dependency: SubscriptionService needs BookingService for fixed-plan booking generation
  subscriptionService.setBookingService(bookingService);

  /**
   * Guard: require admin/coach role on all routes in this plugin.
   */
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(ALL_STAFF_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Forbidden",
        message: "Acceso de administrador requerido",
      });
    }
  });

  // ─── Activities ─────────────────────────────────────────────────────────

  // POST /activities — create activity
  fastify.post<{ Body: { name: string; description?: string } }>(
    "/activities",
    { schema: createActivitySchema },
    async (request, reply) => {
      try {
        const activity = await activityService.createActivity(
          request.body.name,
          request.body.description,
        );
        return reply.code(201).send(activity);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "create activity");
      }
    },
  );

  // GET /activities — list activities
  fastify.get("/activities", { schema: listActivitiesSchema }, async () => {
    const activities = await activityService.listActivities();
    return { activities };
  });

  // PUT /activities/:activityId — update activity
  fastify.put<{
    Params: { activityId: number };
    Body: { name?: string; description?: string; isActive?: boolean };
  }>(
    "/activities/:activityId",
    { schema: updateActivitySchema },
    async (request, reply) => {
      try {
        const activity = await activityService.updateActivity(
          request.params.activityId,
          request.body,
        );
        return activity;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "update activity");
      }
    },
  );

  // ─── Schedules ──────────────────────────────────────────────────────────

  // POST /schedules — create schedule slot
  fastify.post<{
    Body: {
      branchId: number;
      activityId: number;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
    };
  }>("/schedules", { schema: createScheduleSchema }, async (request, reply) => {
    try {
      const slot = await schedulingService.createSchedule(
        request.body.branchId,
        request.body.activityId,
        request.body.dayOfWeek as DayOfWeek,
        request.body.startTime,
        request.body.endTime,
      );
      return reply.code(201).send(slot);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "create schedule");
    }
  });

  // GET /schedules/weekly — weekly grid with occupancy
  fastify.get<{
    Querystring: { branchId: number; weekStart: string };
  }>(
    "/schedules/weekly",
    { schema: weeklyGridSchema },
    async (request, reply) => {
      try {
        const result = await schedulingService.getWeeklyGrid(
          request.query.branchId,
          request.query.weekStart,
        );
        return result;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "weekly grid");
      }
    },
  );

  // GET /schedules/:scheduleId/detail — slot detail with member list
  fastify.get<{
    Params: { scheduleId: number };
    Querystring: { date: string };
  }>(
    "/schedules/:scheduleId/detail",
    { schema: slotDetailSchema },
    async (request, reply) => {
      try {
        const detail = await schedulingService.getSlotDetail(
          request.params.scheduleId,
          request.query.date,
        );
        return detail;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "slot detail");
      }
    },
  );

  // PUT /schedules/:scheduleId/toggle — enable/disable slot
  fastify.put<{
    Params: { scheduleId: number };
    Body: { isActive: boolean };
  }>(
    "/schedules/:scheduleId/toggle",
    { schema: toggleScheduleSchema },
    async (request, reply) => {
      try {
        const slot = await schedulingService.toggleSchedule(
          request.params.scheduleId,
          request.body.isActive,
        );
        return slot;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "toggle schedule");
      }
    },
  );

  // POST /schedules/seed — seed default slots for a branch
  fastify.post<{ Body: { branchId: number } }>(
    "/schedules/seed",
    { schema: seedSchedulesSchema },
    async (request, reply) => {
      try {
        const created = await schedulingService.seedDefaultSchedules(
          request.body.branchId,
        );
        return reply.code(201).send({ created });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "seed schedules");
      }
    },
  );

  // ─── Admin Bookings ─────────────────────────────────────────────────────

  // POST /bookings — admin add booking to slot
  fastify.post<{
    Body: { scheduleId: number; memberId: number; date: string };
  }>("/bookings", { schema: adminAddBookingSchema }, async (request, reply) => {
    try {
      const booking = await bookingService.adminAddBooking(
        request.body.scheduleId,
        request.body.memberId,
        request.body.date,
      );
      return reply.code(201).send(booking);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "admin add booking");
    }
  });

  // DELETE /bookings/:bookingId — admin remove booking
  fastify.delete<{ Params: { bookingId: number } }>(
    "/bookings/:bookingId",
    { schema: adminRemoveBookingSchema },
    async (request, reply) => {
      try {
        await bookingService.adminRemoveBooking(request.params.bookingId);
        return { cancelled: true };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "admin remove booking");
      }
    },
  );

  // ─── Holidays ───────────────────────────────────────────────────────────

  // POST /holidays — add holiday
  fastify.post<{
    Body: { country: string; date: string; name: string };
  }>("/holidays", { schema: addHolidaySchema }, async (request, reply) => {
    try {
      const holiday = await holidayService.addHoliday(
        request.body.country,
        request.body.date,
        request.body.name,
      );
      return reply.code(201).send(holiday);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "add holiday");
    }
  });

  // DELETE /holidays/:holidayId — remove holiday
  fastify.delete<{ Params: { holidayId: number } }>(
    "/holidays/:holidayId",
    { schema: removeHolidaySchema },
    async (request, reply) => {
      try {
        await holidayService.removeHoliday(request.params.holidayId);
        return { deleted: true };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "remove holiday");
      }
    },
  );

  // GET /holidays — list holidays
  fastify.get<{
    Querystring: { country?: string; year?: number };
  }>("/holidays", { schema: listHolidaysSchema }, async (request) => {
    const holidays = await holidayService.listHolidays(
      request.query.country,
      request.query.year,
    );
    return { holidays };
  });
};

// =============================================================================
// Member Routes (registered at /api/members/scheduling)
// =============================================================================

export const schedulingMemberRoutes: FastifyPluginAsync = async (fastify) => {
  // Service instantiation with dependency injection
  const holidayService = new HolidayService(fastify.db, fastify.log);
  const schedulingService = new SchedulingService(
    fastify.db,
    fastify.log,
    holidayService,
  );

  const paymentService = new PaymentService(fastify.db, fastify.log);
  const auraService = new AuraService(fastify.db);
  const subscriptionService = new SubscriptionService(
    fastify.db,
    fastify.log,
    auraService,
  );
  const bookingService = new BookingService(
    fastify.db,
    fastify.log,
    paymentService,
    subscriptionService,
  );
  subscriptionService.setBookingService(bookingService);

  /**
   * Guard: require authentication (any role) on all routes in this plugin.
   */
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
  });

  // GET /weekly — member weekly grid with own bookings overlay
  fastify.get<{
    Querystring: { weekStart: string; branchId?: number };
  }>("/weekly", { schema: memberWeeklyGridSchema }, async (request, reply) => {
    try {
      // Get member's branchId from their user record
      let branchId = request.query.branchId;

      if (!branchId) {
        const [member] = await fastify.db
          .select({ branchId: schema.users.branchId })
          .from(schema.users)
          .where(eq(schema.users.id, request.user.userId));

        if (!member) {
          return reply.code(400).send({
            error: "Bad Request",
            message: "Miembro no encontrado",
          });
        }
        branchId = member.branchId;
      }

      const result = await schedulingService.getWeeklyGrid(
        branchId,
        request.query.weekStart,
      );

      const myBookings = await bookingService.getMyBookings(
        request.user.userId,
        request.query.weekStart,
      );

      const myAttendance = await bookingService.getMyWeeklyAttendance(
        request.user.userId,
        request.query.weekStart,
      );

      return {
        slots: result.slots,
        holidays: result.holidays,
        myBookings,
        myAttendance,
      };
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "member weekly grid");
    }
  });

  // POST /reserve — reserve a spot
  fastify.post<{
    Body: { scheduleId: number; date: string };
  }>("/reserve", { schema: reserveSchema }, async (request, reply) => {
    try {
      const booking = await bookingService.reserve(
        request.user.userId,
        request.body.scheduleId,
        request.body.date,
      );
      return reply.code(201).send(booking);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "member reserve");
    }
  });

  // DELETE /bookings/:bookingId — cancel own booking
  fastify.delete<{ Params: { bookingId: number } }>(
    "/bookings/:bookingId",
    { schema: cancelBookingSchema },
    async (request, reply) => {
      try {
        const booking = await bookingService.cancel(
          request.user.userId,
          request.params.bookingId,
        );
        return booking;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "member cancel booking");
      }
    },
  );

  // GET /my-bookings — get own bookings for a week
  fastify.get<{
    Querystring: { weekStart: string };
  }>("/my-bookings", { schema: myBookingsSchema }, async (request) => {
    const bookings = await bookingService.getMyBookings(
      request.user.userId,
      request.query.weekStart,
    );
    return { bookings };
  });

  // GET /branches — list active non-virtual branches for multi-branch selector
  fastify.get("/branches", async () => {
    const rows = await fastify.db
      .select({
        id: schema.branches.id,
        name: schema.branches.name,
      })
      .from(schema.branches)
      .where(
        and(
          eq(schema.branches.isActive, true),
          eq(schema.branches.isVirtual, false),
        ),
      )
      .orderBy(schema.branches.name);
    return { branches: rows };
  });
};
