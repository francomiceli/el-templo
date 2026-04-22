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
import { and, desc, eq } from "drizzle-orm";
import argon2 from "argon2";
import * as schema from "../../db/schema";
import { ConflictError, NotFoundError } from "../shared/errors";

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
    //    don't leak a user row on conflict.
    const [priorTrial] = await this.db
      .select({ bookingDate: schema.bookings.bookingDate })
      .from(schema.bookings)
      .innerJoin(schema.users, eq(schema.users.id, schema.bookings.memberId))
      .where(
        and(
          eq(schema.users.phone, input.phone),
          eq(schema.bookings.isTrial, true),
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
}
