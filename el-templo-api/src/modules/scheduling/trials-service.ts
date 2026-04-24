/**
 * Phase 102: TrialService
 *
 * Creates a minimal lead user + a trial booking in one atomic transaction.
 * A "lead" is inferred later from (is_trial=true booking) + (no active sub)
 * — no users.status column (Option B, see 102-SPEC.md).
 *
 * Atomicity contract:
 *   Pre-transaction validation (schedule existence, branch/schedule
 *   coherence, one-trial-per-phone) runs BEFORE the transaction block.
 *   When any of those fail, no user row is created because we never
 *   reached the INSERT. The transaction block itself wraps BOTH INSERTs
 *   so that if the booking insert fails post-user-insert (e.g. FK
 *   violation), the user insert rolls back.
 *
 * Capacity: trials INTENTIONALLY bypass schedule capacity checks — the
 * schedule-capacity queries filter is_trial=false (see booking-service.ts
 * countActiveBookings and service.ts getWeeklyGrid).
 */

import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import { and, asc, desc, eq, ne, or, sql } from "drizzle-orm";
import argon2 from "argon2";
import * as schema from "../../db/schema";
import { ConflictError, NotFoundError } from "../shared/errors";
import type { CountryCode } from "../shared/country-scope";

export interface CreateTrialInput {
  firstName: string;
  lastName: string;
  phone: string;
  branchId: number;
  scheduleId: number;
  bookingDate: string; // YYYY-MM-DD
}

export interface CreateTrialResult {
  userId: number;
  bookingId: number;
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
  ) {}

  async createTrial(input: CreateTrialInput): Promise<CreateTrialResult> {
    // 1. Validate schedule + branch match (fail-fast before hashing password).
    const [scheduleRow] = await this.db
      .select({
        id: schema.schedules.id,
        branchId: schema.schedules.branchId,
      })
      .from(schema.schedules)
      .where(eq(schema.schedules.id, input.scheduleId));
    if (!scheduleRow) throw new NotFoundError("Horario no encontrado");
    if (scheduleRow.branchId !== input.branchId) {
      throw new NotFoundError("El horario no pertenece a la sede indicada");
    }

    // 2. One-trial-per-phone guard (R4). Must precede the INSERT so we
    //    don't leak a user row on conflict. Cancelled trials don't count —
    //    admin can cancel an existing trial to free the phone for a new one.
    const [priorTrial] = await this.db
      .select({ bookingDate: schema.bookings.bookingDate })
      .from(schema.bookings)
      .innerJoin(schema.users, eq(schema.users.id, schema.bookings.memberId))
      .where(
        and(
          eq(schema.users.phone, input.phone),
          eq(schema.bookings.isTrial, true),
          ne(schema.bookings.status, "cancelado"),
        ),
      )
      .orderBy(desc(schema.bookings.bookingDate))
      .limit(1);

    if (priorTrial) {
      const [y, m, d] = priorTrial.bookingDate.split("-");
      throw new ConflictError(
        `Esta persona ya tuvo una sesión de prueba el ${d}/${m}/${y}`,
      );
    }

    // 3. Hash the shared trial password once (reused for every lead — see
    //    members/service.ts createMember for the fixed-password precedent).
    const passwordHash = await argon2.hash("eltemplo2026");

    // 4. Atomic user + booking. Both INSERTs live inside the transaction
    //    callback so a failure after the user insert rolls it back.
    //    Plan 01 migrated users.email to nullable (0098), so `email: null`
    //    both type-checks and runs.
    const result = await this.db.transaction(async (tx) => {
      const userInsert = await tx.insert(schema.users).values({
        email: null,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        dni: null,
        documentType: null,
        branchId: input.branchId,
        level: "alfa",
        role: "member",
        isActive: true,
      });
      const userId = Number(userInsert[0].insertId);

      const bookingInsert = await tx.insert(schema.bookings).values({
        memberId: userId,
        scheduleId: input.scheduleId,
        bookingDate: input.bookingDate,
        status: "reservado",
        isTrial: true,
      });
      const bookingId = Number(bookingInsert[0].insertId);

      return { userId, bookingId };
    });

    this.log.info(
      {
        userId: result.userId,
        bookingId: result.bookingId,
        scheduleId: input.scheduleId,
        bookingDate: input.bookingDate,
      },
      "Trial created",
    );

    return result;
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
