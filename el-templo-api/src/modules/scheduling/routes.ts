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
import { TrialService } from "./trials-service";
import { attachCountryScope } from "../shared/country-scope";
import { requireBranchAccess } from "../shared/branch-access";
import type { TrialShift } from "./trials-service";
import { SubscriptionService } from "../subscriptions/service";
import { AuraService } from "../aura/service";
import { EnrollmentService } from "../programs/enrollment-service";
import { NotificationService } from "../notifications/service";
import { handleServiceError } from "../shared/error-handler";
import {
  createActivitySchema,
  listActivitiesSchema,
  updateActivitySchema,
  createScheduleSchema,
  weeklyGridSchema,
  slotDetailSchema,
  toggleScheduleSchema,
  updateScheduleActivitySchema,
  seedSchedulesSchema,
  adminAddBookingSchema,
  adminRemoveBookingSchema,
  bookTrialSchema,
  listEligibleTrialsSchema,
  listTrialsSchema,
  addHolidaySchema,
  removeHolidaySchema,
  listHolidaysSchema,
  memberWeeklyGridSchema,
  reserveSchema,
  cancelBookingSchema,
  myBookingsSchema,
} from "./schemas";
import type { DayOfWeek } from "./types";

import { ALL_STAFF_ROLES } from "../shared/permissions";

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

  const auraService = new AuraService(fastify.db);
  const enrollmentService = new EnrollmentService(fastify.db, fastify.log);
  const subscriptionService = new SubscriptionService(
    fastify.db,
    fastify.log,
    auraService,
    undefined,
    enrollmentService,
  );
  const notificationService = new NotificationService(fastify.db, fastify.log);
  const bookingService = new BookingService(
    fastify.db,
    fastify.log,
    subscriptionService,
    notificationService,
  );
  // Wire circular dependency: SubscriptionService needs BookingService for fixed-plan booking generation
  subscriptionService.setBookingService(bookingService);
  // Phase 102: TrialService — atomic lead+booking creation.
  const trialService = new TrialService(fastify.db, fastify.log);

  /**
   * Guard: require admin/coach role on all routes in this plugin.
   *
   * Phase 110 (Rule 3 — Plan 06 blocker): attach country scope here so
   * requireBranchAccess preHandlers downstream can read request.scope.
   * Previously the trials endpoint attached it per-route; the new
   * preHandler pattern needs scope on every gated route. The module-level
   * attach is idempotent and consistent with reports/finance/analytics.
   */
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(ALL_STAFF_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Acceso de administrador requerido",
      });
    }
    await attachCountryScope(request, fastify.db);
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
  }>(
    "/schedules",
    {
      schema: createScheduleSchema,
      preHandler: [requireBranchAccess({ from: "body.branchId" })],
    },
    async (request, reply) => {
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
    },
  );

  // GET /schedules/weekly — weekly grid with occupancy
  fastify.get<{
    Querystring: { branchId: number; weekStart: string };
  }>(
    "/schedules/weekly",
    {
      schema: weeklyGridSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        // Admin grid includes deactivated slots so the cancelled cells stay
        // clickable and admins can reactivate from the same modal.
        const result = await schedulingService.getWeeklyGrid(
          request.query.branchId,
          request.query.weekStart,
          true,
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

  // PUT /schedules/:scheduleId/toggle — enable/disable slot.
  // Deactivate: cancels every future booking for the slot
  // (status='reservado' or 'lista_espera') so members don't show up to a
  // class that won't run. Already-checked-in bookings are left intact.
  // Reactivate: restores bookings cancelled during the deactivation window
  // so admins don't have to ask members to re-book after a transient
  // closure (e.g. branch flooded for a day).
  fastify.put<{
    Params: { scheduleId: number };
    Body: { isActive: boolean; inactiveReason?: string | null };
  }>(
    "/schedules/:scheduleId/toggle",
    { schema: toggleScheduleSchema },
    async (request, reply) => {
      try {
        // Reactivation must read deactivatedAt BEFORE the toggle clears it.
        const previousDeactivatedAt = request.body.isActive
          ? await schedulingService.getDeactivatedAt(request.params.scheduleId)
          : null;

        const slot = await schedulingService.toggleSchedule(
          request.params.scheduleId,
          request.body.isActive,
          request.body.inactiveReason ?? null,
        );

        let cancelledBookings = 0;
        let restoredBookings = 0;
        if (!request.body.isActive) {
          cancelledBookings =
            await bookingService.cancelAllFutureBookingsForSchedule(
              request.params.scheduleId,
            );
        } else if (previousDeactivatedAt) {
          restoredBookings =
            await bookingService.restoreCancelledBookingsForSchedule(
              request.params.scheduleId,
              previousDeactivatedAt,
            );
        }
        return { ...slot, cancelledBookings, restoredBookings };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "toggle schedule");
      }
    },
  );

  // PATCH /schedules/:scheduleId/activity — swap activity on a slot (bookings retained)
  fastify.patch<{
    Params: { scheduleId: number };
    Body: { activityId: number };
  }>(
    "/schedules/:scheduleId/activity",
    { schema: updateScheduleActivitySchema },
    async (request, reply) => {
      try {
        const slot = await schedulingService.updateScheduleActivity(
          request.params.scheduleId,
          request.body.activityId,
        );
        return slot;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "update schedule activity");
      }
    },
  );

  // POST /schedules/seed — seed default slots for a branch
  fastify.post<{ Body: { branchId: number } }>(
    "/schedules/seed",
    {
      schema: seedSchedulesSchema,
      preHandler: [requireBranchAccess({ from: "body.branchId" })],
    },
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
      const result = await bookingService.adminAddBooking(
        request.body.scheduleId,
        request.body.memberId,
        request.body.date,
      );
      return reply.code(201).send(result);
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

  // ─── Trials (Phase 102 + 103) ───────────────────────────────────────────

  // POST /trials — book an existing prueba user into a slot (Phase 103).
  // Full path: /api/admin/scheduling/trials (inherits plugin prefix + guard).
  // The user must be created beforehand via /admin/members (defaults to
  // status='prueba'). Rejects with 409 if the user is not in 'prueba' state,
  // belongs to another branch, or already has a non-cancelled trial booking.
  fastify.post<{
    Body: {
      userId: number;
      scheduleId: number;
      bookingDate: string;
    };
  }>("/trials", { schema: bookTrialSchema }, async (request, reply) => {
    try {
      const result = await trialService.bookTrial(request.body);
      return reply.code(201).send(result);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "book trial");
    }
  });

  // GET /trials/eligible?branchId=X — list prueba users without a trial
  // booking yet for the given branch (Phase 103). Powers the inline trial
  // picker in SlotDetailDialog.
  fastify.get<{
    Querystring: { branchId: number };
  }>(
    "/trials/eligible",
    {
      schema: listEligibleTrialsSchema,
      preHandler: [requireBranchAccess({ from: "query.branchId" })],
    },
    async (request, reply) => {
      try {
        const result = await trialService.listEligibleTrials(
          request.query.branchId,
        );
        return result;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "list eligible trials");
      }
    },
  );

  // GET /trials — list active trials for a date, grouped by branch (102-06).
  // Used by the coach-facing "Sesiones de Prueba" page to replace the
  // pre-shift WhatsApp. Country-scoped; owners may pass ?country=.
  fastify.get<{
    Querystring: { date: string; shift?: TrialShift; branchId?: number };
  }>(
    "/trials",
    {
      schema: listTrialsSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        // Phase 110: scope.country is nullable to support fail-closed
        // default-deny (admin/gestion with NULL users.country). Trials
        // listing requires a non-null country — short-circuit to empty
        // result rather than leak unscoped trials.
        if (request.scope.country === null) {
          return {
            date: request.query.date,
            shift: request.query.shift ?? "all",
            groups: [],
          };
        }
        const result = await trialService.listTrials({
          date: request.query.date,
          shift: request.query.shift ?? "all",
          country: request.scope.country,
          branchId: request.query.branchId,
        });
        return result;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "list trials");
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

  const auraService = new AuraService(fastify.db);
  const enrollmentService = new EnrollmentService(fastify.db, fastify.log);
  const subscriptionService = new SubscriptionService(
    fastify.db,
    fastify.log,
    auraService,
    undefined,
    enrollmentService,
  );
  const notificationService = new NotificationService(fastify.db, fastify.log);
  const bookingService = new BookingService(
    fastify.db,
    fastify.log,
    subscriptionService,
    notificationService,
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
            error: "Solicitud invalida",
            message: "Miembro no encontrado",
          });
        }
        branchId = member.branchId;
      }

      // Three independent queries — run in parallel so total latency is
      // max(q1,q2,q3) instead of the sum. Mitigates rare 504s under load.
      const [result, myBookings, myAttendance] = await Promise.all([
        schedulingService.getWeeklyGrid(branchId, request.query.weekStart),
        bookingService.getMyBookings(
          request.user.userId,
          request.query.weekStart,
        ),
        bookingService.getMyWeeklyAttendance(
          request.user.userId,
          request.query.weekStart,
        ),
      ]);

      return {
        slots: result.slots,
        holidays: result.holidays,
        myBookings,
        myAttendance,
        branchTimezone: result.branchTimezone,
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

  // GET /bonus-usage — fixed-plan members' bonus-class counter
  fastify.get("/bonus-usage", async (request, reply) => {
    try {
      const usage = await bookingService.getBonusUsage(request.user.userId);
      return usage;
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "get bonus usage");
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

  // GET /branches — list active non-virtual branches for multi-branch selector,
  // scoped to the caller's country. The cross-country guard in
  // BookingService.reserve also rejects cross-country reservations server-side,
  // but filtering here keeps the selector free of sedes the member couldn't
  // book anyway (no UX dead ends).
  fastify.get("/branches", async (request) => {
    const [memberRow] = await fastify.db
      .select({ branchCountry: schema.branches.country })
      .from(schema.users)
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(eq(schema.users.id, request.user.userId))
      .limit(1);

    const where = memberRow
      ? and(
          eq(schema.branches.isActive, true),
          eq(schema.branches.isVirtual, false),
          eq(schema.branches.country, memberRow.branchCountry),
        )
      : and(
          eq(schema.branches.isActive, true),
          eq(schema.branches.isVirtual, false),
        );

    const rows = await fastify.db
      .select({
        id: schema.branches.id,
        name: schema.branches.name,
      })
      .from(schema.branches)
      .where(where)
      .orderBy(schema.branches.name);
    return { branches: rows };
  });
};
