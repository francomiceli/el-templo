/**
 * Holiday Service
 *
 * CRUD operations for holidays and holiday-date queries.
 * Extracted from SchedulingService for single-responsibility.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, sql, inArray } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { ConflictError, NotFoundError } from "../shared/errors";
import { addDays } from "../shared/date-utils";
import { isDuplicateKeyError } from "../shared/sql-errors";
import type { HolidayRecord } from "./types";

export class HolidayService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * Add a holiday. Auto-cancels all confirmed+waitlist bookings for
   * branches in that country on that date.
   */
  async addHoliday(
    country: string,
    date: string,
    name: string,
  ): Promise<HolidayRecord> {
    let holidayId: number;
    try {
      const result = await this.db.insert(schema.holidays).values({
        country,
        date,
        name,
      });
      holidayId = Number(result[0].insertId);
    } catch (err: unknown) {
      const { isDuplicate } = isDuplicateKeyError(err);
      if (isDuplicate) {
        throw new ConflictError(
          "Ya existe un feriado registrado para esa fecha y pais",
        );
      }
      throw err;
    }

    // Auto-cancel bookings at branches in this country on this date
    // Find all branches in this country
    const countryBranches = await this.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.country, country));

    if (countryBranches.length > 0) {
      const branchIds = countryBranches.map((b) => b.id);

      // Find schedules at these branches
      const countrySchedules = await this.db
        .select({ id: schema.schedules.id })
        .from(schema.schedules)
        .where(inArray(schema.schedules.branchId, branchIds));

      if (countrySchedules.length > 0) {
        const scheduleIds = countrySchedules.map((s) => s.id);

        // Cancel all active bookings for these schedules on this date
        // TODO: Consider injecting BookingService for clean dependency once booking cancellation logic grows
        await this.db
          .update(schema.bookings)
          .set({
            status: "cancelado",
            cancelledAt: new Date(),
            waitlistPosition: null,
          })
          .where(
            and(
              inArray(schema.bookings.scheduleId, scheduleIds),
              eq(schema.bookings.bookingDate, date),
              sql`${schema.bookings.status} IN ('reservado', 'qr_escaneado', 'confirmado', 'lista_espera')`,
            ),
          );
      }
    }

    this.log.info({ country, date, name, holidayId }, "Holiday added");

    return {
      id: holidayId,
      country,
      date,
      name,
    };
  }

  /**
   * Remove a holiday (does NOT restore cancelled bookings).
   */
  async removeHoliday(id: number): Promise<void> {
    const [existing] = await this.db
      .select({ id: schema.holidays.id })
      .from(schema.holidays)
      .where(eq(schema.holidays.id, id));

    if (!existing) throw new NotFoundError("Feriado no encontrado");

    await this.db.delete(schema.holidays).where(eq(schema.holidays.id, id));

    this.log.info({ holidayId: id }, "Holiday removed");
  }

  /**
   * List holidays filtered by country and/or year.
   */
  async listHolidays(
    country?: string,
    year?: number,
  ): Promise<HolidayRecord[]> {
    const conditions: ReturnType<typeof eq>[] = [];

    if (country) {
      conditions.push(eq(schema.holidays.country, country));
    }
    if (year) {
      conditions.push(sql`YEAR(${schema.holidays.date}) = ${year}`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await this.db
      .select({
        id: schema.holidays.id,
        country: schema.holidays.country,
        date: schema.holidays.date,
        name: schema.holidays.name,
      })
      .from(schema.holidays)
      .where(whereClause)
      .orderBy(schema.holidays.date);

    return rows;
  }

  /**
   * Get holidays for a week (Mon-Sat) for a given country.
   */
  async getHolidaysForWeek(
    country: string,
    weekStartDate: string,
  ): Promise<HolidayRecord[]> {
    const weekEnd = addDays(weekStartDate, 5);

    const rows = await this.db
      .select({
        id: schema.holidays.id,
        country: schema.holidays.country,
        date: schema.holidays.date,
        name: schema.holidays.name,
      })
      .from(schema.holidays)
      .where(
        and(
          eq(schema.holidays.country, country),
          sql`${schema.holidays.date} >= ${weekStartDate}`,
          sql`${schema.holidays.date} <= ${weekEnd}`,
        ),
      )
      .orderBy(schema.holidays.date);

    return rows;
  }
}
