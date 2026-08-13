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
import { tenantWhere, tenantValues, type TenantContext } from "../shared/tenant";
import type { HolidayRecord } from "./types";

export class HolidayService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * Add a holiday. Auto-cancels all confirmed+waitlist bookings for
   * branches in that country on that date.
   *
   * Fase 174 (D-02, plan 174-04): `ctx` PRIMERO, estampa `tenantId` en el
   * insert y filtra las lecturas de `branches`/`schedules` que resuelven qué
   * reservas auto-cancelar.
   */
  async addHoliday(
    ctx: TenantContext,
    country: string,
    date: string,
    name: string,
  ): Promise<HolidayRecord> {
    let holidayId: number;
    try {
      const result = await this.db.insert(schema.holidays).values(
        tenantValues(ctx, {
          country,
          date,
          name,
        }),
      );
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
      .where(
        and(tenantWhere(schema.branches, ctx), eq(schema.branches.country, country)),
      );

    if (countryBranches.length > 0) {
      const branchIds = countryBranches.map((b) => b.id);

      // Find schedules at these branches
      const countrySchedules = await this.db
        .select({ id: schema.schedules.id })
        .from(schema.schedules)
        .where(
          and(
            tenantWhere(schema.schedules, ctx),
            inArray(schema.schedules.branchId, branchIds),
          ),
        );

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
              tenantWhere(schema.bookings, ctx),
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
   *
   * Fase 174 (D-02, plan 174-04): `ctx` PRIMERO, filtra lectura y delete.
   */
  async removeHoliday(ctx: TenantContext, id: number): Promise<void> {
    const [existing] = await this.db
      .select({ id: schema.holidays.id })
      .from(schema.holidays)
      .where(and(tenantWhere(schema.holidays, ctx), eq(schema.holidays.id, id)));

    if (!existing) throw new NotFoundError("Feriado no encontrado");

    await this.db
      .delete(schema.holidays)
      .where(and(tenantWhere(schema.holidays, ctx), eq(schema.holidays.id, id)));

    this.log.info({ holidayId: id }, "Holiday removed");
  }

  /**
   * List holidays filtered by country and/or year.
   *
   * Fase 174 (D-02, plan 174-04, D-02 del PATTERNS): `ctx` PRIMERO;
   * `tenantWhere(holidays, ctx)` se agrega como PRIMER término junto al
   * filtro de country/year existente (`holidays` es tenant-scoped desde la
   * fase 167).
   */
  async listHolidays(
    ctx: TenantContext,
    country?: string,
    year?: number,
  ): Promise<HolidayRecord[]> {
    // Fase 174.1-05b: TODO el filtro INLINE en este único statement (nada de
    // `conditions.push(...)` en statements separados) — el lint juzga por
    // statement (PATTERNS §2.6) y cada `.push()` era su propio statement sin
    // el marcador `tenantWhere(` en su propio texto.
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
          tenantWhere(schema.holidays, ctx),
          country ? eq(schema.holidays.country, country) : undefined,
          year ? sql`YEAR(${schema.holidays.date}) = ${year}` : undefined,
        ),
      )
      .orderBy(schema.holidays.date);

    return rows;
  }

  /**
   * Get holidays for a week (Mon-Sat) for a given country.
   *
   * Fase 174 (D-02, plan 174-04, D-02 del PATTERNS): `ctx` PRIMERO;
   * `tenantWhere(holidays, ctx)` PRIMER término junto al filtro de
   * country/fecha existente.
   */
  async getHolidaysForWeek(
    ctx: TenantContext,
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
          tenantWhere(schema.holidays, ctx),
          eq(schema.holidays.country, country),
          sql`${schema.holidays.date} >= ${weekStartDate}`,
          sql`${schema.holidays.date} <= ${weekEnd}`,
        ),
      )
      .orderBy(schema.holidays.date);

    return rows;
  }
}
