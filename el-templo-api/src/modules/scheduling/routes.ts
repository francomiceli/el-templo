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
import { assertTenant, tenantWhere } from "../shared/tenant";
import { requireBranchAccess } from "../shared/branch-access";
import type { TrialShift } from "./trials-service";
import { SubscriptionService } from "../subscriptions/service";
import { AuraService } from "../aura/service";
import { EnrollmentService } from "../programs/enrollment-service";
import { NotificationService } from "../notifications/service";
import { handleServiceError } from "../shared/error-handler";
import {
  ConflictError,
  CoverageExpiredError,
  PassRequiredError,
  PhoneRequiredError,
} from "../shared/errors";
import {
  createActivitySchema,
  listActivitiesSchema,
  updateActivitySchema,
  createScheduleSchema,
  weeklyGridSchema,
  slotDetailSchema,
  toggleScheduleSchema,
  cancelScheduleDateSchema,
  restoreScheduleDateSchema,
  previewScheduleDeletionSchema,
  deleteScheduleFromDateSchema,
  updateScheduleActivitySchema,
  seedSchedulesSchema,
  adminAddBookingSchema,
  adminRemoveBookingSchema,
  bookTrialSchema,
  rescheduleTrialSchema,
  listEligibleTrialsSchema,
  listTrialsSchema,
  addHolidaySchema,
  removeHolidaySchema,
  listHolidaysSchema,
  memberWeeklyGridSchema,
  reserveSchema,
  cancelBookingSchema,
  myBookingsSchema,
  reserveTrialSchema,
  cancelTrialSchema,
  trialEligibilitySchema,
} from "./schemas";
import type { DayOfWeek, AffectedScheduleRef } from "./types";

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
  fastify.post<{
    Body: {
      name: string;
      description?: string;
      maxCapacity?: number | null;
      isSpecial?: boolean;
    };
  }>(
    "/activities",
    { schema: createActivitySchema },
    async (request, reply) => {
      try {
        const activity = await activityService.createActivity(
          request.body.name,
          request.body.description,
          request.body.maxCapacity,
          request.body.isSpecial,
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
    Body: {
      name?: string;
      description?: string;
      isActive?: boolean;
      maxCapacity?: number | null;
      isSpecial?: boolean;
    };
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
        // Phase 113 (D-13): when ConflictError carries an affectedSchedules
        // payload, surface the structured list to the admin UI so it can
        // render an actionable "estos horarios usan la actividad" message.
        // handleServiceError only serializes {error, message}, hence the
        // dedicated branch here.
        if (
          err instanceof ConflictError &&
          (err as ConflictError & { affectedSchedules?: unknown })
            .affectedSchedules !== undefined
        ) {
          const affectedSchedules = (
            err as ConflictError & {
              affectedSchedules: AffectedScheduleRef[];
            }
          ).affectedSchedules;
          return reply.code(409).send({
            error: "Conflicto",
            message: err.message,
            affectedSchedules,
          });
        }
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
        const ctx = assertTenant(request.scope, "scheduling.slotDetail");
        const detail = await schedulingService.getSlotDetail(
          ctx,
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

  // POST /schedules/:scheduleId/cancel-date — cancel ONE occurrence (a single
  // date) of a recurring slot. Unlike toggle (all weeks) and delete-from-date
  // (this date onward), only this date stops running: the exception hides the
  // slot-date from members, blocks new reservations, and this handler cancels
  // that date's active bookings granting replacement credits to fixed-plan
  // members. The exception is created FIRST so its createdAt lower-bounds the
  // bookings' cancelledAt (the restore cutoff).
  fastify.post<{
    Params: { scheduleId: number };
    Body: { date: string; reason?: string | null };
  }>(
    "/schedules/:scheduleId/cancel-date",
    { schema: cancelScheduleDateSchema },
    async (request, reply) => {
      try {
        const { scheduleId } = request.params;
        const { date, reason } = request.body;

        const exception = await schedulingService.cancelScheduleDate(
          scheduleId,
          date,
          reason ?? null,
        );

        const cancelResult =
          await bookingService.cancelBookingsFromDateAndGrantCredits(
            scheduleId,
            date,
            date,
          );

        return {
          exceptionDate: exception.exceptionDate,
          cancelledBookings: cancelResult.cancelledBookings,
          affectedFixedMembers: cancelResult.affectedFixedMembers,
          creditsGranted: cancelResult.creditsGranted,
        };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "cancel schedule date");
      }
    },
  );

  // DELETE /schedules/:scheduleId/cancel-date/:date — undo a per-date
  // cancellation: removes the exception and restores the bookings it
  // auto-cancelled (cancelledAt >= exception.createdAt, that date only).
  fastify.delete<{
    Params: { scheduleId: number; date: string };
  }>(
    "/schedules/:scheduleId/cancel-date/:date",
    { schema: restoreScheduleDateSchema },
    async (request, reply) => {
      try {
        const { scheduleId, date } = request.params;

        const exception = await schedulingService.restoreScheduleDate(
          scheduleId,
          date,
        );

        const restoredBookings =
          await bookingService.restoreCancelledBookingsForDate(
            scheduleId,
            date,
            exception.createdAt,
          );

        return { restored: true, restoredBookings };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "restore schedule date");
      }
    },
  );

  // GET /schedules/:scheduleId/deletion-preview — preview impact of deleting a slot from a date forward
  fastify.get<{
    Params: { scheduleId: number };
    Querystring: { fromDate: string };
  }>(
    "/schedules/:scheduleId/deletion-preview",
    { schema: previewScheduleDeletionSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(
          request.scope,
          "scheduling.deletionPreview",
        );
        const preview = await bookingService.previewScheduleDeletion(
          ctx,
          request.params.scheduleId,
          request.query.fromDate,
        );
        return preview;
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "preview schedule deletion",
        );
      }
    },
  );

  // POST /schedules/:scheduleId/delete-from-date — soft-delete schedule from
  // a given date forward. Cancels active future bookings, grants replacement
  // credits to fixed-plan members, and flips isActive=false. History before
  // fromDate (and already-checked-in bookings on/after fromDate) is preserved.
  fastify.post<{
    Params: { scheduleId: number };
    Body: { fromDate: string };
  }>(
    "/schedules/:scheduleId/delete-from-date",
    { schema: deleteScheduleFromDateSchema },
    async (request, reply) => {
      try {
        const { scheduleId } = request.params;
        const { fromDate } = request.body;

        const cancelResult =
          await bookingService.cancelBookingsFromDateAndGrantCredits(
            scheduleId,
            fromDate,
          );

        await schedulingService.toggleSchedule(
          scheduleId,
          false,
          `Eliminado desde ${fromDate}`,
        );

        return cancelResult;
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "delete schedule from date",
        );
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

  // GET /schedules/:scheduleId/next-available — find first date the slot
  // has open capacity. Used by the FixedSchedulePicker to suggest a
  // delayed start date when assigning a fixed-plan member to a slot that
  // is full this week.
  fastify.get<{
    Params: { scheduleId: number };
    Querystring: { from?: string };
  }>(
    "/schedules/:scheduleId/next-available",
    {
      schema: {
        params: {
          type: "object",
          required: ["scheduleId"],
          properties: { scheduleId: { type: "integer" } },
        },
        querystring: {
          type: "object",
          properties: {
            from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              nextAvailableDate: { type: ["string", "null"] },
            },
            required: ["nextAvailableDate"],
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const date = await bookingService.findNextAvailableDate(
          request.params.scheduleId,
          request.query.from,
        );
        return { nextAvailableDate: date };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "find next available");
      }
    },
  );

  // ─── Admin Bookings ─────────────────────────────────────────────────────

  // POST /bookings — admin add booking to slot
  fastify.post<{
    Body: { scheduleId: number; memberId: number; date: string };
  }>("/bookings", { schema: adminAddBookingSchema }, async (request, reply) => {
    try {
      const ctx = assertTenant(request.scope, "scheduling.adminAddBooking");
      const result = await bookingService.adminAddBooking(
        ctx,
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
      const ctx = assertTenant(request.scope, "scheduling.bookTrial");
      const result = await trialService.bookTrial(ctx, request.body);
      return reply.code(201).send(result);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "book trial");
    }
  });

  // POST /trials/:bookingId/reschedule — reprogramar una sesión de prueba
  // (Phase 164, REPRO-01). In one tx: cancel the old trial booking + create the
  // new one + reset the lead (source 'auto'). Guard/country-scope inherited from
  // the module-level onRequest hook (ALL_STAFF_ROLES). Returns 200 (mutation of
  // an existing lead's trial, not a fresh resource).
  fastify.post<{
    Params: { bookingId: number };
    Body: { scheduleId: number; date: string; branchId: number };
  }>(
    "/trials/:bookingId/reschedule",
    {
      schema: rescheduleTrialSchema,
      // WR-01: enforce branch/country scope like the sibling trial-mutation
      // routes (adminAddBooking, schedules/seed). The service checks
      // branchId↔schedule↔user coherence but not that body.branchId is inside
      // the caller's country scope; this closes that defense-in-depth gap.
      // (POST /trials / bookTrial shares the same gap — pre-existing, left as-is.)
      preHandler: [requireBranchAccess({ from: "body.branchId" })],
    },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "scheduling.rescheduleTrial");
        const result = await trialService.rescheduleTrial(ctx, {
          bookingId: request.params.bookingId,
          ...request.body,
        });
        return reply.code(200).send(result);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "reschedule trial");
      }
    },
  );

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
        const ctx = assertTenant(request.scope, "scheduling.listEligibleTrials");
        const result = await trialService.listEligibleTrials(
          ctx,
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
        const ctx = assertTenant(request.scope, "scheduling.listTrials");
        const result = await trialService.listTrials(ctx, {
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

  // Phase 119: self-service trial. BookingService is injected so the trial
  // path reuses the 30-day window + dayOfWeek/holiday validation (D-05).
  const trialService = new TrialService(
    fastify.db,
    fastify.log,
    bookingService,
  );

  /**
   * Guard: require authentication (any role) on all routes in this plugin.
   *
   * Fase 173 (D-02, plan 173-07): `attachCountryScope` resuelve `request.scope`
   * (incluido `tenantId`) para TODA la superficie member-facing de este
   * plugin — sin esto `assertTenant(request.scope, …)` explotaría contra
   * `undefined`. `attachScope` ya soporta cualquier rol autenticado (incluido
   * "member"), así que el agregado es puramente aditivo.
   */
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    await attachCountryScope(request, fastify.db);
  });

  // GET /weekly — member weekly grid with own bookings overlay
  fastify.get<{
    Querystring: { weekStart: string; branchId?: number };
  }>("/weekly", { schema: memberWeeklyGridSchema }, async (request, reply) => {
    try {
      // Fase 173 (D-02, plan 173-07): `ctx` PRIMERO, filtra la resolución del
      // socio (`users`) y se propaga a `getMyBookings`.
      const ctx = assertTenant(request.scope, "scheduling.memberWeekly");

      // Get member's branchId from their user record
      let branchId = request.query.branchId;

      if (!branchId) {
        const [member] = await fastify.db
          .select({ branchId: schema.users.branchId })
          .from(schema.users)
          .where(
            and(
              tenantWhere(schema.users, ctx),
              eq(schema.users.id, request.user.userId),
            ),
          );

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
          ctx,
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
      const ctx = assertTenant(request.scope, "scheduling.reserve");
      const booking = await bookingService.reserve(
        ctx,
        request.user.userId,
        request.body.scheduleId,
        request.body.date,
      );
      return reply.code(201).send(booking);
    } catch (err: unknown) {
      // Phase 144-04 (D-12): surface the distinguishable COVERAGE_EXPIRED code
      // so the app opens the renewal dialog instead of a generic error. The
      // default handleServiceError only emits { error, message }, so the code
      // MUST be added here (mirrors the ConflictError/affectedSchedules branch).
      if (err instanceof CoverageExpiredError) {
        return reply.code(400).send({
          error: "Solicitud invalida",
          message: err.message,
          code: "COVERAGE_EXPIRED",
        });
      }
      // Fase 161 (GATE-01/03): surface del code PASS_REQUIRED (espejo exacto de
      // COVERAGE_EXPIRED) para que la app abra el diálogo de compra del pase.
      // handleServiceError sólo emite { error, message }, así que el code debe
      // agregarse acá. El booking admin (POST /bookings) NO necesita este surface:
      // adminAddBooking sólo agrega warnings (staff bypass), nunca lanza el error.
      if (err instanceof PassRequiredError) {
        return reply.code(400).send({
          error: "Solicitud invalida",
          message: err.message,
          code: "PASS_REQUIRED",
        });
      }
      handleServiceError(err, reply, request.log, "member reserve");
    }
  });

  // POST /reserve-trial — freemium self-service trial reservation (D-01).
  // Atomically promotes freemium→prueba and books the trial. Eligibility is
  // revalidated server-side from user state; the email token never authorizes
  // (D-21).
  fastify.post<{
    Body: { scheduleId: number; date: string; branchId: number; phone?: string };
  }>(
    "/reserve-trial",
    { schema: reserveTrialSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "scheduling.reserveTrial");
        const result = await trialService.reserveTrialSelfService(
          ctx,
          request.user.userId,
          request.body,
        );
        return reply.code(201).send(result);
      } catch (err: unknown) {
        // Fase 165 (D-04): surface del code PHONE_REQUIRED (espejo de PASS_REQUIRED)
        // para que la app abra el input de teléfono en el diálogo de confirmación.
        // handleServiceError sólo emite { error, message }, así que el code va acá.
        if (err instanceof PhoneRequiredError) {
          return reply.code(400).send({
            error: "Solicitud invalida",
            message: err.message,
            code: "PHONE_REQUIRED",
          });
        }
        handleServiceError(err, reply, request.log, "member reserve trial");
      }
    },
  );

  // POST /cancel-trial — freemium cancels their own self-service trial (D-03
  // revised). Reverts prueba→freemium; blocked inside the 24h window.
  fastify.post(
    "/cancel-trial",
    { schema: cancelTrialSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "scheduling.cancelTrial");
        const result = await trialService.cancelTrialSelfService(
          ctx,
          request.user.userId,
        );
        return result;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "member cancel trial");
      }
    },
  );

  // GET /trial-eligibility — drives the 3 ReservasPage states (D-20).
  fastify.get(
    "/trial-eligibility",
    { schema: trialEligibilitySchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "scheduling.trialEligibility");
        const result = await trialService.getTrialEligibility(
          ctx,
          request.user.userId,
        );
        return result;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "member trial eligibility");
      }
    },
  );

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
        const ctx = assertTenant(request.scope, "scheduling.cancelBooking");
        const booking = await bookingService.cancel(
          ctx,
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
    const ctx = assertTenant(request.scope, "scheduling.myBookings");
    const bookings = await bookingService.getMyBookings(
      ctx,
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
    // Fase 173 (D-02, plan 173-07): `ctx` filtra la resolución del socio
    // (`users`); `branches` no se toca (D-02, fase 174).
    const ctx = assertTenant(request.scope, "scheduling.memberBranches");
    const [memberRow] = await fastify.db
      .select({ branchCountry: schema.branches.country })
      .from(schema.users)
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(
        and(tenantWhere(schema.users, ctx), eq(schema.users.id, request.user.userId)),
      )
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
