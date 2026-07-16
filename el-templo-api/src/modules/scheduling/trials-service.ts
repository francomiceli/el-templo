/**
 * Phase 102 + 103: TrialService
 *
 * Trial creation is split across two responsibilities:
 *
 *   1. Creating the user (status='prueba') is the job of the standard
 *      member-creation flow (members/service.ts createMember). This keeps
 *      DNI/dateOfBirth/gender validation in one place and avoids a second
 *      "lite create" code path that would drift over time.
 *
 *   2. Booking that user into a specific class slot is the job of this
 *      service: bookTrial({userId, scheduleId, bookingDate}).
 *
 * Eligibility for booking a trial:
 *   - users.status = 'prueba'
 *   - user.branch_id matches the slot's branch
 *   - user has no non-cancelled is_trial=true booking yet (one trial per
 *     lifetime — "0/1" badge becomes "1/1")
 *
 * Capacity: trials INTENTIONALLY bypass schedule capacity checks — the
 * schedule-capacity queries filter is_trial=false (see booking-service.ts
 * countActiveBookings and service.ts getWeeklyGrid).
 */

import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../shared/errors";
import type { CountryCode } from "../shared/country-scope";
import { buildClassDateTime, todayInTz } from "../shared/date-utils";
import type { BookingService } from "./booking-service";

/**
 * Phase 119 (D-03 revised): a self-service trial can be cancelled or changed up
 * to this many hours before the class starts. Inside the window it's locked
 * (mirrors a same-day reservation, which is always inside 24h).
 */
const TRIAL_CANCEL_CUTOFF_HOURS = 24;

/**
 * Subscription statuses that disqualify a user from booking a trial: an
 * active/paused/scheduled sub means they are (or are about to be) a member,
 * not a freemium lead. Mirrors the campaign-audience predicate (D-08/D-20).
 */
const BLOCKING_SUBSCRIPTION_STATUSES = [
  "active",
  "paused",
  "scheduled",
] as const;

/**
 * Booking statuses that count as a trial still "in flight" — neither cancelled
 * nor closed as a no-show. A trial booking in any of these states, dated today
 * or later, blocks re-booking and hides the alumno from the eligible-trials
 * picker. Past-dated bookings in these states are stale (the class already
 * happened) and get closed as no_show on re-book.
 */
const ACTIVE_TRIAL_STATUSES = [
  "reservado",
  "qr_escaneado",
  "confirmado",
  "lista_espera",
] as const;

export interface ReserveTrialSelfServiceInput {
  scheduleId: number;
  date: string; // YYYY-MM-DD
  branchId: number;
}

export interface ReserveTrialSelfServiceResult {
  bookingId: number;
}

export interface TrialEligibility {
  eligible: boolean;
  alreadyBooked: boolean;
  booking?: {
    bookingId: number;
    date: string;
    startTime: string;
    branchId: number;
    branchName: string;
    branchAddress: string | null;
    // True while the class is still >24h away — the app shows cancel/change.
    canModify: boolean;
  };
}

export interface BookTrialInput {
  userId: number;
  scheduleId: number;
  bookingDate: string; // YYYY-MM-DD
}

export interface BookTrialResult {
  bookingId: number;
}

/**
 * Phase 164 (REPRO-01, D-01): input for the admin "Reprogramar" action. The old
 * trial booking is identified by `bookingId`; the new session is `{scheduleId,
 * date, branchId}` (same shape as ReserveTrialSelfServiceInput — field `date`,
 * NOT `bookingDate`).
 */
export interface RescheduleTrialInput {
  bookingId: number;
  scheduleId: number;
  date: string; // YYYY-MM-DD
  branchId: number;
}

export interface EligibleTrialUser {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  dni: string | null;
}

export interface ListEligibleTrialsResult {
  users: EligibleTrialUser[];
}

/**
 * Phase 102-06: shift buckets for the coach-facing trial list.
 *   TM (turno mañana) — class start_time < 13:00
 *   TT (turno tarde)  — class start_time >= 13:00
 *   all               — no time filter
 */
export type TrialShift = "TM" | "TT" | "all";

export interface ListTrialsInput {
  date: string; // YYYY-MM-DD
  shift: TrialShift;
  country: CountryCode;
  branchId?: number;
}

export interface TrialListBranchGroup {
  branchId: number;
  branchName: string;
  trials: Array<{
    bookingId: number;
    userId: number;
    firstName: string;
    lastName: string;
    phone: string | null;
    scheduleId: number;
    startTime: string;
    endTime: string;
    activityName: string;
    status: string;
  }>;
}

export interface ListTrialsResult {
  date: string;
  shift: TrialShift;
  groups: TrialListBranchGroup[];
}

export class TrialService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
    // Phase 119: optional so the admin trial flows (bookTrial / listTrials)
    // keep their 2-arg construction. The self-service trial path injects it to
    // reuse the 30-day window + dayOfWeek/holiday validation (D-05).
    private bookingService?: BookingService,
  ) {}

  /**
   * Phase 119 (D-01/D-02/D-05/D-06/D-20/D-21/D-26): self-service trial.
   *
   * A freemium user reserves their own single trial session. This atomically
   * promotes them freemium→prueba (replicating members/service.ts
   * convertFreemiumToTrial) AND inserts the trial booking, all in ONE
   * db.transaction so a failure rolls both back (D-26).
   *
   * Authorization is PURELY server-side state (D-21): the campaign email token
   * is never read here — the caller is identified by their member JWT and the
   * guards below revalidate eligibility from the database every time.
   *
   * Guards (all run BEFORE the tx so we never leave dangling state):
   *   - 404 if the user or chosen branch doesn't exist.
   *   - 409 if user.status !== 'freemium' (never clobber an existing lifecycle).
   *   - 409 if the chosen branch is virtual (a trial must be presencial, D-06).
   *   - 409 if the user already has a non-cancelled is_trial booking (one per
   *     lifetime, D-03).
   *   - 409 if the user has an active/paused/scheduled subscription (they are
   *     already a member, not a lead).
   *   - the date is validated against the 30-day window + dayOfWeek/holiday/
   *     not-past checks via BookingService (D-05), but NOT the subscription
   *     check (a freemium has none).
   */
  async reserveTrialSelfService(
    userId: number,
    input: ReserveTrialSelfServiceInput,
  ): Promise<ReserveTrialSelfServiceResult> {
    if (!this.bookingService) {
      // Defensive: this method requires the BookingService dependency. The
      // member plugin always injects it; this guard turns a misconfiguration
      // into a clear 500 instead of a confusing undefined call.
      throw new Error("reserveTrialSelfService requires a BookingService");
    }

    // 1. Validate user exists and is freemium (status is the authorization).
    const [user] = await this.db
      .select({
        id: schema.users.id,
        status: schema.users.status,
        deletedAt: schema.users.deletedAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!user || user.deletedAt)
      throw new NotFoundError("Alumno no encontrado");
    if (user.status !== "freemium") {
      throw new ConflictError(
        "Solo un alumno freemium puede reservar una sesión de prueba",
      );
    }

    // 2. Validate the chosen branch exists and is physical (D-06).
    const [branch] = await this.db
      .select({
        id: schema.branches.id,
        isVirtual: schema.branches.isVirtual,
      })
      .from(schema.branches)
      .where(eq(schema.branches.id, input.branchId))
      .limit(1);
    if (!branch) throw new NotFoundError("Sede no encontrada");
    if (branch.isVirtual) {
      throw new ConflictError(
        "La sesión de prueba debe asignarse a una sede física",
      );
    }

    // 3. One-trial-per-lifetime guard (cancelled trials don't count).
    const [priorTrial] = await this.db
      .select({ bookingDate: schema.bookings.bookingDate })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.memberId, userId),
          eq(schema.bookings.isTrial, true),
          ne(schema.bookings.status, "cancelado"),
        ),
      )
      .limit(1);
    if (priorTrial) {
      const [y, m, d] = priorTrial.bookingDate.split("-");
      throw new ConflictError(
        `Ya tenés una sesión de prueba reservada para el ${d}/${m}/${y}`,
      );
    }

    // 4. No active/paused/scheduled subscription (already a member, not a lead).
    const [activeSub] = await this.db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.userId, userId),
          inArray(schema.subscriptions.status, [
            ...BLOCKING_SUBSCRIPTION_STATUSES,
          ]),
        ),
      )
      .limit(1);
    if (activeSub) {
      throw new ConflictError(
        "Ya tenés una suscripción — no podés reservar una sesión de prueba",
      );
    }

    // 5. Validate the booking date (30-day window + dayOfWeek/holiday/not-past).
    //    Skips the subscription check (freemium has none) by going through the
    //    dedicated trial validator instead of BookingService.reserve.
    const scheduleBranchId = await this.bookingService.validateTrialBookingDate(
      input.scheduleId,
      input.date,
    );

    // CR-01: branch coherence. Both branchId and scheduleId are independent,
    // attacker-controllable body fields. Without this guard a freemium could be
    // promoted into Sede A (users.branchId = A) while their trial booking lands
    // on a Sede B slot, corrupting the coach briefing and the confirmation card.
    // Mirrors the admin bookTrial guard (user.branchId vs schedule.branchId).
    if (scheduleBranchId !== input.branchId) {
      throw new ConflictError(
        "El horario elegido no pertenece a la sede seleccionada",
      );
    }

    // 6. Promote freemium→prueba AND insert the trial booking atomically.
    const statusBefore = user.status; // 'freemium'
    const bookingId = await this.db.transaction(async (tx) => {
      await tx
        .update(schema.users)
        .set({
          status: "prueba" as const,
          leadStatus: "en_seguimiento" as const,
          leadStatusSource: "auto" as const, // Phase 163 (D-03/D-07): re-entry is an automatism
          createdBy: null, // D-02: self-service has no admin author
          branchId: input.branchId, // D-06: chosen physical branch
        })
        .where(eq(schema.users.id, userId));

      await tx.insert(schema.userStatusHistory).values({
        userId,
        fromStatus: statusBefore,
        toStatus: "prueba",
        source: "self_service", // D-02 (varchar(16), fits)
      });

      // Reactivate a previously-cancelled exact slot+date row if present to
      // avoid a unique-constraint 500 on (member_id, schedule_id, booking_date).
      const [existing] = await tx
        .select({ id: schema.bookings.id })
        .from(schema.bookings)
        .where(
          and(
            eq(schema.bookings.memberId, userId),
            eq(schema.bookings.scheduleId, input.scheduleId),
            eq(schema.bookings.bookingDate, input.date),
          ),
        )
        .limit(1);

      if (existing) {
        await tx
          .update(schema.bookings)
          .set({
            status: "reservado",
            isTrial: true,
            source: "self_service",
            cancelledAt: null,
            waitlistPosition: null,
          })
          .where(eq(schema.bookings.id, existing.id));
        return existing.id;
      }

      const inserted = await tx.insert(schema.bookings).values({
        memberId: userId,
        scheduleId: input.scheduleId,
        bookingDate: input.date,
        status: "reservado",
        isTrial: true,
        source: "self_service", // D-18 attribution
      });
      return Number(inserted[0].insertId);
    });

    this.log.info(
      { userId, bookingId, scheduleId: input.scheduleId, date: input.date },
      "Self-service trial reserved (freemium→prueba)",
    );

    return { bookingId };
  }

  /**
   * Phase 119 (D-20): trial eligibility for the member app's ReservasPage.
   *
   * `/me` does NOT expose users.status, so the app cannot tell whether the
   * caller can reserve a trial. This drives the 3 ReservasPage states:
   *   - eligible=true, alreadyBooked=false  → show the trial booking UI
   *   - alreadyBooked=true (+ booking)      → show the confirmation card
   *   - eligible=false, alreadyBooked=false → show the existing muro
   *
   * Eligibility = same predicate as reserveTrialSelfService's guards:
   *   status==='freemium' + no active/paused/scheduled sub + no non-cancelled
   *   is_trial booking. The token never participates (D-21).
   */
  async getTrialEligibility(userId: number): Promise<TrialEligibility> {
    const [user] = await this.db
      .select({
        status: schema.users.status,
        deletedAt: schema.users.deletedAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user || user.deletedAt) {
      return { eligible: false, alreadyBooked: false };
    }

    // A member (or soon-to-be member: a scheduled/future sub) NEVER sees the
    // trial UI — even if a legacy is_trial booking from their freemium days
    // still exists. This gate runs BEFORE the booking-precedence lookup below,
    // so an active alumno who once did a trial isn't stuck on the "prueba
    // reservada" card and can reserve normally (reported bug: active member
    // seeing "tu sesión de prueba está reservada").
    const [blockingSub] = await this.db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.userId, userId),
          inArray(schema.subscriptions.status, [
            ...BLOCKING_SUBSCRIPTION_STATUSES,
          ]),
        ),
      )
      .limit(1);
    if (blockingSub) {
      return { eligible: false, alreadyBooked: false };
    }

    // Existing trial booking (any non-cancelled is_trial) takes precedence so
    // the app shows the confirmation card even after promotion to 'prueba'.
    const [booking] = await this.db
      .select({
        bookingId: schema.bookings.id,
        date: schema.bookings.bookingDate,
        startTime: schema.schedules.startTime,
        branchTimezone: schema.branches.timezone,
        branchId: schema.branches.id,
        branchName: schema.branches.name,
        branchAddress: schema.branches.address,
      })
      .from(schema.bookings)
      .innerJoin(
        schema.schedules,
        eq(schema.schedules.id, schema.bookings.scheduleId),
      )
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.schedules.branchId),
      )
      .where(
        and(
          eq(schema.bookings.memberId, userId),
          eq(schema.bookings.isTrial, true),
          ne(schema.bookings.status, "cancelado"),
        ),
      )
      .orderBy(desc(schema.bookings.bookingDate))
      .limit(1);

    if (booking) {
      return {
        eligible: false,
        alreadyBooked: true,
        booking: {
          bookingId: booking.bookingId,
          date: booking.date,
          startTime: booking.startTime,
          branchId: booking.branchId,
          branchName: booking.branchName,
          branchAddress: booking.branchAddress,
          canModify: this.isOutsideCancelWindow(
            booking.date,
            booking.startTime,
            booking.branchTimezone,
          ),
        },
      };
    }

    // Only a still-freemium lead (no blocking sub, no trial booking yet) can
    // book a new trial. 'prueba' users already have a booking (caught above).
    if (user.status !== "freemium") {
      return { eligible: false, alreadyBooked: false };
    }

    return { eligible: true, alreadyBooked: false };
  }

  /**
   * True when the class is still more than TRIAL_CANCEL_CUTOFF_HOURS away — i.e.
   * the trial can still be cancelled/changed. Branch-timezone + DST aware via
   * buildClassDateTime, matching booking-service's window helpers so a BCN trial
   * and an AR trial each use their own local clock.
   */
  private isOutsideCancelWindow(
    date: string,
    startTime: string,
    tz: string,
  ): boolean {
    const classTime = buildClassDateTime(date, startTime, tz);
    const cutoff = new Date(
      classTime.getTime() - TRIAL_CANCEL_CUTOFF_HOURS * 60 * 60 * 1000,
    );
    return new Date() <= cutoff;
  }

  /**
   * Phase 119 (D-03 revised): a freemium cancels their own self-service trial.
   *
   * Cancels the non-cancelled is_trial booking AND reverts the user prueba→
   * freemium (so they re-enter the lead funnel and can book another trial — the
   * one-per-lifetime guard ignores cancelled trials). The "change" flow in the
   * app is cancel-then-rebook, so this is the single mutation behind both.
   *
   * Guards:
   *   - 409 if the user has no non-cancelled trial booking.
   *   - 400 if the class starts within TRIAL_CANCEL_CUTOFF_HOURS (same-day /
   *     <24h reservations are locked — mirrors the reserve-time copy).
   */
  async cancelTrialSelfService(userId: number): Promise<{ cancelled: true }> {
    const [row] = await this.db
      .select({
        bookingId: schema.bookings.id,
        date: schema.bookings.bookingDate,
        startTime: schema.schedules.startTime,
        tz: schema.branches.timezone,
      })
      .from(schema.bookings)
      .innerJoin(
        schema.schedules,
        eq(schema.schedules.id, schema.bookings.scheduleId),
      )
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.schedules.branchId),
      )
      .where(
        and(
          eq(schema.bookings.memberId, userId),
          eq(schema.bookings.isTrial, true),
          ne(schema.bookings.status, "cancelado"),
        ),
      )
      .orderBy(desc(schema.bookings.bookingDate))
      .limit(1);

    if (!row) {
      throw new ConflictError("No tenés una sesión de prueba reservada");
    }

    if (!this.isOutsideCancelWindow(row.date, row.startTime, row.tz)) {
      throw new BadRequestError(
        "Tu sesión de prueba empieza dentro de las próximas 24 horas y ya no se puede cancelar ni cambiar. Si necesitás algo, escribinos por WhatsApp.",
      );
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.bookings)
        .set({ status: "cancelado", cancelledAt: new Date() })
        .where(eq(schema.bookings.id, row.bookingId));

      // Only revert if still 'prueba' (defensive: never clobber a user who
      // became a member out-of-band). Record the history row only when we win.
      const upd = await tx
        .update(schema.users)
        .set({ status: "freemium" as const })
        .where(
          and(eq(schema.users.id, userId), eq(schema.users.status, "prueba")),
        );
      const flipped = (upd as unknown as [{ affectedRows?: number }])[0]
        ?.affectedRows;
      if (flipped === 1) {
        await tx.insert(schema.userStatusHistory).values({
          userId,
          fromStatus: "prueba",
          toStatus: "freemium",
          source: "self_service",
        });
      }
    });

    this.log.info(
      { userId, bookingId: row.bookingId },
      "Self-service trial cancelled (prueba→freemium)",
    );
    return { cancelled: true };
  }

  /**
   * Phase 103: Book an existing prueba user into a specific class slot.
   *
   * Replaces Phase 102's createTrial (user+booking in one shot). Now the
   * user must be created first via the standard /admin/members flow
   * (which defaults status='prueba'); this method only attaches a
   * trial booking.
   *
   * Validations (all run BEFORE the INSERT so we never leave dangling state):
   *   - schedule exists
   *   - user exists with status='prueba'
   *   - user.branch_id matches schedule.branch_id (prevents booking a
   *     prueba into another sede's class)
   *   - user has no non-cancelled is_trial=true booking yet (one per
   *     lifetime — admin can cancel an existing trial booking to free up
   *     the slot, mirroring the Phase 102-06 cancellation contract)
   */
  async bookTrial(input: BookTrialInput): Promise<BookTrialResult> {
    // 1. Validate schedule exists. Pull the branch timezone too so "today" is
    //    computed in the sede's wall-clock (not the DB server's), matching how
    //    booking dates are chosen and keeping the past/future split correct.
    const [scheduleRow] = await this.db
      .select({
        id: schema.schedules.id,
        branchId: schema.schedules.branchId,
        branchTz: schema.branches.timezone,
      })
      .from(schema.schedules)
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.schedules.branchId),
      )
      .where(eq(schema.schedules.id, input.scheduleId));
    if (!scheduleRow) throw new NotFoundError("Horario no encontrado");

    // 2. Validate user exists and is in 'prueba' state.
    const [userRow] = await this.db
      .select({
        id: schema.users.id,
        status: schema.users.status,
        branchId: schema.users.branchId,
      })
      .from(schema.users)
      .where(eq(schema.users.id, input.userId));
    if (!userRow) throw new NotFoundError("Alumno no encontrado");
    if (userRow.status !== "prueba") {
      throw new ConflictError(
        "El alumno no está en estado 'prueba' — no se puede reservar una sesión de prueba",
      );
    }

    // 3. Branch coherence: user's home branch must match the slot's branch.
    if (userRow.branchId !== scheduleRow.branchId) {
      throw new ConflictError(
        "El alumno pertenece a otra sede — solo puede reservar pruebas en su sede",
      );
    }

    // 4. One-PENDING-trial guard. Only a trial dated today or later (in an
    //    active status) blocks re-booking — that's a real upcoming session, so
    //    the admin must cancel it first. A trial whose date has already passed
    //    is stale (no-show or lapsed) and is closed below rather than blocking.
    const today = todayInTz(scheduleRow.branchTz);
    const [pendingTrial] = await this.db
      .select({ bookingDate: schema.bookings.bookingDate })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.memberId, input.userId),
          eq(schema.bookings.isTrial, true),
          inArray(schema.bookings.status, [...ACTIVE_TRIAL_STATUSES]),
          sql`${schema.bookings.bookingDate} >= ${today}`,
        ),
      )
      .orderBy(desc(schema.bookings.bookingDate))
      .limit(1);

    if (pendingTrial) {
      const [y, m, d] = pendingTrial.bookingDate.split("-");
      throw new ConflictError(
        `El alumno ya tiene una sesión de prueba reservada para el ${d}/${m}/${y}`,
      );
    }

    // 5. Close any stale (past-dated) pending trials as no_show, then insert
    //    the new booking — atomically, so the alumno never ends up with two
    //    open trials or a closed-but-not-rebooked state. There's a UNIQUE
    //    constraint on (member_id, schedule_id, booking_date) regardless of
    //    status, so a plain INSERT would 500 if a booking already exists on
    //    this exact slot+date; we reactivate that row instead.
    const bookingId = await this.db.transaction(async (tx) => {
      await tx
        .update(schema.bookings)
        .set({ status: "no_show" })
        .where(
          and(
            eq(schema.bookings.memberId, input.userId),
            eq(schema.bookings.isTrial, true),
            inArray(schema.bookings.status, [...ACTIVE_TRIAL_STATUSES]),
            sql`${schema.bookings.bookingDate} < ${today}`,
          ),
        );

      // Phase 163 (D-03/D-07): re-booking a trial resets a Perdido lead back to
      // en_seguimiento with source 'auto'. The expire-lost-leads cron measures
      // the window from the last non-cancelled trial booking, so it restarts
      // from this new session. The one-trial-per-life guard above is untouched.
      await tx
        .update(schema.users)
        .set({
          leadStatus: "en_seguimiento" as const,
          leadStatusSource: "auto" as const,
        })
        .where(eq(schema.users.id, input.userId));

      const [existing] = await tx
        .select({ id: schema.bookings.id })
        .from(schema.bookings)
        .where(
          and(
            eq(schema.bookings.memberId, input.userId),
            eq(schema.bookings.scheduleId, input.scheduleId),
            eq(schema.bookings.bookingDate, input.bookingDate),
          ),
        )
        .limit(1);

      if (existing) {
        await tx
          .update(schema.bookings)
          .set({
            status: "reservado",
            isTrial: true,
            cancelledAt: null,
            waitlistPosition: null,
          })
          .where(eq(schema.bookings.id, existing.id));
        return existing.id;
      }

      const bookingInsert = await tx.insert(schema.bookings).values({
        memberId: input.userId,
        scheduleId: input.scheduleId,
        bookingDate: input.bookingDate,
        status: "reservado",
        isTrial: true,
      });
      return Number(bookingInsert[0].insertId);
    });

    this.log.info(
      {
        userId: input.userId,
        bookingId,
        scheduleId: input.scheduleId,
        bookingDate: input.bookingDate,
      },
      "Trial booked",
    );

    return { bookingId };
  }

  /**
   * Phase 164 (REPRO-01, D-01/D-02): reschedule an existing trial booking.
   *
   * Turns "quitar turno + volver a cargar" into a single atomic operation: in
   * ONE db.transaction we (1) soft-cancel the old trial booking (same effect as
   * adminRemoveBooking — status='cancelado', cancelledAt, waitlistPosition null),
   * (2) reset the lead Perdido→en_seguimiento with source 'auto' (the SAME
   * Phase 163 snippet as bookTrial, D-02 — not duplicated logic), and (3) create
   * the new booking with the reactivate-or-insert branch that respects the
   * UNIQUE (member_id, schedule_id, booking_date).
   *
   * The one-trial-per-lifetime guard does NOT block a reschedule: the old
   * booking is cancelled inside the same tx, and we run no pending-check here
   * (D-01). Validations mirror bookTrial: the new schedule must exist (404) and
   * branch coherence must hold — the passed branchId must match the schedule's
   * branch, and the schedule's branch must match the alumno's home branch (409).
   *
   * Waitlist promotion is intentionally omitted: trials bypass capacity
   * (is_trial=1, see header) so a cancelled trial never occupied a slot, making
   * promotion a no-op — this keeps the whole operation in a single tx (PATTERNS
   * §trials-service option (a)).
   */
  async rescheduleTrial(
    input: RescheduleTrialInput,
  ): Promise<{ bookingId: number }> {
    // 1. Load the old trial booking → member. 404 if it doesn't exist; 409 if
    //    it isn't a trial booking (reschedule is a trial-only action).
    const [oldBooking] = await this.db
      .select({
        id: schema.bookings.id,
        memberId: schema.bookings.memberId,
        isTrial: schema.bookings.isTrial,
      })
      .from(schema.bookings)
      .where(eq(schema.bookings.id, input.bookingId));
    if (!oldBooking) throw new NotFoundError("Reserva no encontrada");
    if (!oldBooking.isTrial) {
      throw new ConflictError("La reserva no es una sesión de prueba");
    }
    const userId = oldBooking.memberId;

    // 2. Validate the NEW schedule exists (same as bookTrial step 1).
    const [scheduleRow] = await this.db
      .select({
        id: schema.schedules.id,
        branchId: schema.schedules.branchId,
      })
      .from(schema.schedules)
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.schedules.branchId),
      )
      .where(eq(schema.schedules.id, input.scheduleId));
    if (!scheduleRow) throw new NotFoundError("Horario no encontrado");

    // 3. Validate the alumno still exists and pull its home branch.
    const [userRow] = await this.db
      .select({
        id: schema.users.id,
        branchId: schema.users.branchId,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    if (!userRow) throw new NotFoundError("Alumno no encontrado");

    // 4. Branch coherence (bookTrial + reserveTrialSelfService CR-01): the
    //    passed branchId must match the slot's branch, and the slot's branch
    //    must match the alumno's home branch.
    if (scheduleRow.branchId !== input.branchId) {
      throw new ConflictError(
        "El horario elegido no pertenece a la sede seleccionada",
      );
    }
    if (userRow.branchId !== scheduleRow.branchId) {
      throw new ConflictError(
        "El alumno pertenece a otra sede — solo puede reservar pruebas en su sede",
      );
    }

    // 5. Cancel-old + reset-lead + create-new, all in ONE tx (D-01/D-04).
    const bookingId = await this.db.transaction(async (tx) => {
      // (a) Soft-cancel the old trial booking (adminRemoveBooking semantics).
      await tx
        .update(schema.bookings)
        .set({
          status: "cancelado",
          cancelledAt: new Date(),
          waitlistPosition: null,
        })
        .where(eq(schema.bookings.id, input.bookingId));

      // (b) Phase 163 (D-03/D-07) reset — reused verbatim from bookTrial (D-02).
      await tx
        .update(schema.users)
        .set({
          leadStatus: "en_seguimiento" as const,
          leadStatusSource: "auto" as const,
        })
        .where(eq(schema.users.id, userId));

      // (c) Create the new booking. Reactivate an existing exact slot+date row
      //     if present to avoid a UNIQUE (member_id, schedule_id, booking_date)
      //     500 — mirrors bookTrial's reactivate-or-insert branch.
      const [existing] = await tx
        .select({ id: schema.bookings.id })
        .from(schema.bookings)
        .where(
          and(
            eq(schema.bookings.memberId, userId),
            eq(schema.bookings.scheduleId, input.scheduleId),
            eq(schema.bookings.bookingDate, input.date),
          ),
        )
        .limit(1);

      if (existing) {
        await tx
          .update(schema.bookings)
          .set({
            status: "reservado",
            isTrial: true,
            cancelledAt: null,
            waitlistPosition: null,
          })
          .where(eq(schema.bookings.id, existing.id));
        return existing.id;
      }

      const inserted = await tx.insert(schema.bookings).values({
        memberId: userId,
        scheduleId: input.scheduleId,
        bookingDate: input.date,
        status: "reservado",
        isTrial: true,
      });
      return Number(inserted[0].insertId);
    });

    this.log.info(
      {
        userId,
        oldBookingId: input.bookingId,
        bookingId,
        scheduleId: input.scheduleId,
        date: input.date,
      },
      "Trial rescheduled",
    );

    return { bookingId };
  }

  /**
   * Phase 103: List users eligible to book a trial in the given branch.
   *
   * "Eligible" means:
   *   - users.status = 'prueba'
   *   - user.branch_id = branchId
   *   - no non-cancelled is_trial=true booking
   *
   * Used by the SlotDetailDialog inline trial picker so coaches can attach
   * a trial booking to an existing prueba alumno without re-creating one.
   * Sorted by created_at DESC so the most recently-created alumno (the
   * common case — admin just created them via /alumnos) appears first.
   */
  async listEligibleTrials(
    branchId: number,
  ): Promise<ListEligibleTrialsResult> {
    // "Today" in the sede's wall-clock so the past/future split matches how
    // booking dates are chosen (and isn't skewed by the DB server's clock).
    const [branchRow] = await this.db
      .select({ tz: schema.branches.timezone })
      .from(schema.branches)
      .where(eq(schema.branches.id, branchId))
      .limit(1);
    const today = todayInTz(branchRow?.tz ?? "America/Argentina/Buenos_Aires");

    const rows = await this.db
      .select({
        id: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        phone: schema.users.phone,
        dni: schema.users.dni,
      })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.status, "prueba"),
          eq(schema.users.branchId, branchId),
          // Exclude only alumnos with a still-PENDING trial (an active-status
          // booking dated today or later). A trial whose date has already
          // passed no longer hides the alumno — they simply didn't attend (or
          // their slot lapsed), so the admin can re-book them. Without the date
          // guard a one-time no-show vanished from the picker forever, forcing
          // admins to create duplicate alumno records as a workaround.
          sql`NOT EXISTS (
            SELECT 1 FROM bookings b
            WHERE b.member_id = users.id
              AND b.is_trial = 1
              AND b.booking_status IN ('reservado','qr_escaneado','confirmado','lista_espera')
              AND b.booking_date >= ${today}
          )`,
        ),
      )
      .orderBy(desc(schema.users.createdAt));

    const users: EligibleTrialUser[] = rows.map((r) => ({
      id: r.id,
      firstName: r.firstName ?? "",
      lastName: r.lastName ?? "",
      phone: r.phone,
      dni: r.dni,
    }));

    return { users };
  }

  /**
   * Phase 102-06: list active trial bookings for a date, optionally
   * filtered to a single branch or shift (TM/TT), grouped by branch.
   *
   * Country scope: mirrors the members-list pattern — physical branches
   * in the caller's country plus virtual branches (which are cross-country).
   * Excludes cancelled trials so the coach shift-briefing matches reality.
   */
  async listTrials(input: ListTrialsInput): Promise<ListTrialsResult> {
    const conditions = [
      eq(schema.bookings.isTrial, true),
      eq(schema.bookings.bookingDate, input.date),
      ne(schema.bookings.status, "cancelado"),
    ];

    if (input.branchId !== undefined) {
      conditions.push(eq(schema.schedules.branchId, input.branchId));
    } else {
      // No explicit branch: apply country scope. Virtual branches are
      // cross-country and stay visible to staff of any country.
      const countryOrVirtual = or(
        eq(schema.branches.country, input.country),
        eq(schema.branches.isVirtual, true),
      );
      if (countryOrVirtual) conditions.push(countryOrVirtual);
    }

    // Shift: split at 13:00 local. The schedules.start_time is stored as
    // "HH:MM" / "HH:MM:SS" so a lexicographic compare works.
    if (input.shift === "TM") {
      conditions.push(sql`${schema.schedules.startTime} < '13:00'`);
    } else if (input.shift === "TT") {
      conditions.push(sql`${schema.schedules.startTime} >= '13:00'`);
    }

    const rows = await this.db
      .select({
        bookingId: schema.bookings.id,
        userId: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        phone: schema.users.phone,
        scheduleId: schema.schedules.id,
        startTime: schema.schedules.startTime,
        endTime: schema.schedules.endTime,
        activityName: schema.activities.name,
        status: schema.bookings.status,
        branchId: schema.branches.id,
        branchName: schema.branches.name,
      })
      .from(schema.bookings)
      .innerJoin(schema.users, eq(schema.users.id, schema.bookings.memberId))
      .innerJoin(
        schema.schedules,
        eq(schema.schedules.id, schema.bookings.scheduleId),
      )
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.schedules.branchId),
      )
      .innerJoin(
        schema.activities,
        eq(schema.activities.id, schema.schedules.activityId),
      )
      .where(and(...conditions))
      .orderBy(
        asc(schema.branches.name),
        asc(schema.schedules.startTime),
        asc(schema.users.firstName),
      );

    // Group by branch, preserving the already-sorted order.
    const groupsByBranch = new Map<number, TrialListBranchGroup>();
    for (const r of rows) {
      let group = groupsByBranch.get(r.branchId);
      if (!group) {
        group = { branchId: r.branchId, branchName: r.branchName, trials: [] };
        groupsByBranch.set(r.branchId, group);
      }
      group.trials.push({
        bookingId: r.bookingId,
        userId: r.userId,
        firstName: r.firstName ?? "",
        lastName: r.lastName ?? "",
        phone: r.phone,
        scheduleId: r.scheduleId,
        startTime: r.startTime,
        endTime: r.endTime,
        activityName: r.activityName,
        status: r.status,
      });
    }

    return {
      date: input.date,
      shift: input.shift,
      groups: Array.from(groupsByBranch.values()),
    };
  }
}
