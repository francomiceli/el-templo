/**
 * Wellhub — sincronización de clases, slots y ocupación (Booking API).
 *
 * Pool COMPARTIDO de cupos (decisión 2026-07-21): publicamos la capacidad
 * real de cada clase y mantenemos total_booked al día. El anti-overbooking
 * NO depende de este push — al confirmar una solicitud de reserva se
 * revalida el cupo en transacción (service.ts) — así que un push atrasado
 * solo degrada UX (el usuario ve un lugar viejo y su solicitud rebota).
 *
 * Qué publica syncBranch por sede con wellhub_gym_id:
 *   - Una "class" por actividad activa NO especial con horarios activos en
 *     la sede (las especiales están gateadas por el pase Aura y quedan
 *     fuera de Wellhub por ahora).
 *   - Un "slot" por (schedule activo, fecha) dentro del horizonte
 *     (WELLHUB_SLOT_HORIZON_DAYS, default 7), salteando excepciones de
 *     fecha, feriados del país de la sede y horarios ya pasados. Ventanas
 *     espejo de las reglas de socios: reserva abre 2 días antes y cierra al
 *     inicio; cancelable hasta 20 minutos antes.
 *   - Slots ya publicados cuyo horario se desactivó o ganó una excepción se
 *     borran de Wellhub (Wellhub cancela las reservas de ese slot solo).
 *   - Reconciliación: solicitudes 'pending' con más de 20 minutos (la
 *     confirmación nunca llegó a Wellhub y su ventana de 15 min expiró) se
 *     cancelan localmente y se promueve la lista de espera.
 *
 * El push puntual de ocupación (pushSlotOccupancy) lo dispara el bus de
 * occupancy-events en cada reserva/cancelación; este servicio recuenta con
 * BookingService.countActiveBookings (fuente única) y patchea solo si el
 * número publicado cambió.
 */

import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { addDays, buildClassDateTime, todayInTz } from "../shared/date-utils";
import { resolveEffectiveCapacity } from "../scheduling/capacity";
import type { BookingService } from "../scheduling/booking-service";
import { WellhubApiError } from "./client";
import type { WellhubClient } from "./client";
import type { WellhubSlot, WellhubSlotPayload } from "./types";

/** Días de anticipación con que se publican slots (espejo del member window). */
const BOOKING_OPEN_DAYS = 2;
/** Margen de cancelación en minutos (espejo de isWithinCancelWindow). */
const CANCEL_MARGIN_MINUTES = 20;
/** Solicitudes 'pending' más viejas que esto se consideran muertas. */
const PENDING_EXPIRY_MINUTES = 20;

const DEFAULT_HORIZON_DAYS = 7;

/** Wellhub devuelve fechas estilo Java ("2026-07-22T20:00:00Z[UTC]"). */
function parseWellhubDate(value: string): Date {
  return new Date(value.replace(/\[[^\]]+\]$/, ""));
}

export interface WellhubSyncSummary {
  branches: number;
  classesCreated: number;
  slotsCreated: number;
  slotsPatched: number;
  slotsDeleted: number;
  pendingsExpired: number;
}

interface SyncBranch {
  id: number;
  gymId: number;
  timezone: string;
  country: string;
  maxCapacity: number;
}

export class WellhubSyncService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
    private client: WellhubClient,
    private bookingService: BookingService,
  ) {}

  private horizonDays(): number {
    const parsed = Number(process.env.WELLHUB_SLOT_HORIZON_DAYS);
    return Number.isInteger(parsed) && parsed > 0
      ? parsed
      : DEFAULT_HORIZON_DAYS;
  }

  // ─── Sincronización completa ───────────────────────────────────────────────

  async syncAllBranches(): Promise<WellhubSyncSummary> {
    const summary: WellhubSyncSummary = {
      branches: 0,
      classesCreated: 0,
      slotsCreated: 0,
      slotsPatched: 0,
      slotsDeleted: 0,
      pendingsExpired: 0,
    };

    const branches = await this.db
      .select({
        id: schema.branches.id,
        gymId: schema.branches.wellhubGymId,
        timezone: schema.branches.timezone,
        country: schema.branches.country,
        maxCapacity: schema.branches.maxCapacity,
      })
      .from(schema.branches)
      .where(
        and(
          isNotNull(schema.branches.wellhubGymId),
          eq(schema.branches.isActive, true),
        ),
      );

    summary.pendingsExpired = await this.expireDeadPendings();

    for (const branch of branches) {
      if (branch.gymId === null) continue;
      try {
        const result = await this.syncBranch({
          id: branch.id,
          gymId: branch.gymId,
          timezone: branch.timezone,
          country: branch.country,
          maxCapacity: branch.maxCapacity,
        });
        summary.branches += 1;
        summary.classesCreated += result.classesCreated;
        summary.slotsCreated += result.slotsCreated;
        summary.slotsPatched += result.slotsPatched;
        summary.slotsDeleted += result.slotsDeleted;
      } catch (err: unknown) {
        // Una sede que falla no debe frenar las demás.
        this.log.error(
          { err, branchId: branch.id, gymId: branch.gymId },
          "Sincronización Wellhub falló para la sede",
        );
      }
    }

    return summary;
  }

  async syncBranch(branch: SyncBranch): Promise<{
    classesCreated: number;
    slotsCreated: number;
    slotsPatched: number;
    slotsDeleted: number;
  }> {
    const productId = await this.resolveProductId(branch.gymId);
    const classesCreated = await this.ensureClasses(branch, productId);
    const slotResult = await this.syncSlots(branch, productId);
    return { classesCreated, ...slotResult };
  }

  /**
   * product_id requerido por classes/slots. Override por env
   * (WELLHUB_PRODUCT_ID) o el primer producto que Wellhub tenga asociado al
   * gimnasio.
   */
  private async resolveProductId(gymId: number): Promise<number> {
    const fromEnv = Number(process.env.WELLHUB_PRODUCT_ID);
    if (Number.isInteger(fromEnv) && fromEnv > 0) return fromEnv;

    const products = await this.client.listProducts(gymId);
    if (products.length === 0) {
      throw new Error(
        `El gimnasio Wellhub ${gymId} no tiene productos configurados`,
      );
    }
    return products[0].product_id;
  }

  // ─── Classes ───────────────────────────────────────────────────────────────

  /** Actividades activas no especiales con al menos un horario activo en la sede. */
  private async listPublishableActivities(
    branchId: number,
  ): Promise<Array<{ id: number; name: string; description: string | null }>> {
    return await this.db
      .selectDistinct({
        id: schema.activities.id,
        name: schema.activities.name,
        description: schema.activities.description,
      })
      .from(schema.schedules)
      .innerJoin(
        schema.activities,
        eq(schema.schedules.activityId, schema.activities.id),
      )
      .where(
        and(
          eq(schema.schedules.branchId, branchId),
          eq(schema.schedules.isActive, true),
          eq(schema.activities.isActive, true),
          eq(schema.activities.isSpecial, false),
        ),
      );
  }

  private async ensureClasses(
    branch: SyncBranch,
    productId: number,
  ): Promise<number> {
    const activities = await this.listPublishableActivities(branch.id);
    if (activities.length === 0) return 0;

    const existing = await this.db
      .select({ activityId: schema.wellhubClasses.activityId })
      .from(schema.wellhubClasses)
      .where(eq(schema.wellhubClasses.branchId, branch.id));
    const existingActivityIds = new Set(existing.map((c) => c.activityId));

    let created = 0;
    for (const activity of activities) {
      if (existingActivityIds.has(activity.id)) continue;

      const [wellhubClass] = await this.client.createClasses(branch.gymId, [
        {
          name: activity.name,
          description: activity.description ?? activity.name,
          bookable: true,
          visible: true,
          product_id: productId,
          // reference linkea la class de Wellhub con nuestra actividad.
          reference: `activity:${activity.id}`,
        },
      ]);
      if (!wellhubClass?.id) {
        throw new Error(
          `Wellhub no devolvió id al crear la class de la actividad ${activity.id}`,
        );
      }

      await this.db.insert(schema.wellhubClasses).values({
        branchId: branch.id,
        activityId: activity.id,
        wellhubClassId: wellhubClass.id,
        wellhubProductId: productId,
      });
      created += 1;
      this.log.info(
        {
          branchId: branch.id,
          activityId: activity.id,
          wellhubClassId: wellhubClass.id,
        },
        "Class publicada en Wellhub",
      );
    }
    return created;
  }

  // ─── Slots ─────────────────────────────────────────────────────────────────

  private async syncSlots(
    branch: SyncBranch,
    productId: number,
  ): Promise<{
    slotsCreated: number;
    slotsPatched: number;
    slotsDeleted: number;
  }> {
    const today = todayInTz(branch.timezone);
    const horizon = this.horizonDays();
    const endDate = addDays(today, horizon);
    const now = new Date();

    // Mapeo class por actividad (para armar paths de la API).
    const classes = await this.db
      .select({
        rowId: schema.wellhubClasses.id,
        activityId: schema.wellhubClasses.activityId,
        wellhubClassId: schema.wellhubClasses.wellhubClassId,
      })
      .from(schema.wellhubClasses)
      .where(eq(schema.wellhubClasses.branchId, branch.id));
    const classByActivity = new Map(classes.map((c) => [c.activityId, c]));

    // Horarios activos publicables de la sede.
    const scheduleRows = await this.db
      .select({
        id: schema.schedules.id,
        activityId: schema.schedules.activityId,
        dayOfWeek: schema.schedules.dayOfWeek,
        startTime: schema.schedules.startTime,
        endTime: schema.schedules.endTime,
        activityCapacity: schema.activities.maxCapacity,
        activityActive: schema.activities.isActive,
        activitySpecial: schema.activities.isSpecial,
      })
      .from(schema.schedules)
      .innerJoin(
        schema.activities,
        eq(schema.schedules.activityId, schema.activities.id),
      )
      .where(
        and(
          eq(schema.schedules.branchId, branch.id),
          eq(schema.schedules.isActive, true),
          eq(schema.activities.isActive, true),
          eq(schema.activities.isSpecial, false),
        ),
      );
    const scheduleIds = scheduleRows.map((s) => s.id);

    // Excepciones y feriados del horizonte.
    const exceptions = scheduleIds.length
      ? await this.db
          .select({
            scheduleId: schema.scheduleExceptions.scheduleId,
            exceptionDate: schema.scheduleExceptions.exceptionDate,
          })
          .from(schema.scheduleExceptions)
          .where(
            and(
              inArray(schema.scheduleExceptions.scheduleId, scheduleIds),
              gte(schema.scheduleExceptions.exceptionDate, today),
              lte(schema.scheduleExceptions.exceptionDate, endDate),
            ),
          )
      : [];
    const exceptionKeys = new Set(
      exceptions.map((e) => `${e.scheduleId}:${e.exceptionDate}`),
    );

    const holidays = await this.db
      .select({ date: schema.holidays.date })
      .from(schema.holidays)
      .where(
        and(
          eq(schema.holidays.country, branch.country),
          gte(schema.holidays.date, today),
          lte(schema.holidays.date, endDate),
        ),
      );
    const holidayDates = new Set(holidays.map((h) => h.date));

    // Slots ya publicados del horizonte (para diff y limpieza).
    const publishedSlots = await this.db
      .select({
        id: schema.wellhubSlots.id,
        scheduleId: schema.wellhubSlots.scheduleId,
        sessionDate: schema.wellhubSlots.sessionDate,
        wellhubSlotId: schema.wellhubSlots.wellhubSlotId,
        totalCapacity: schema.wellhubSlots.totalCapacity,
        totalBooked: schema.wellhubSlots.totalBooked,
        classRowId: schema.wellhubSlots.wellhubClassRowId,
        wellhubClassId: schema.wellhubClasses.wellhubClassId,
        classBranchId: schema.wellhubClasses.branchId,
      })
      .from(schema.wellhubSlots)
      .innerJoin(
        schema.wellhubClasses,
        eq(schema.wellhubSlots.wellhubClassRowId, schema.wellhubClasses.id),
      )
      .where(
        and(
          eq(schema.wellhubClasses.branchId, branch.id),
          gte(schema.wellhubSlots.sessionDate, today),
          lte(schema.wellhubSlots.sessionDate, endDate),
        ),
      );
    const publishedByKey = new Map(
      publishedSlots.map((s) => [`${s.scheduleId}:${s.sessionDate}`, s]),
    );

    let slotsCreated = 0;
    let slotsPatched = 0;
    let slotsDeleted = 0;

    // Alta/actualización de slots del horizonte.
    for (let offset = 0; offset <= horizon; offset++) {
      const date = addDays(today, offset);
      const isoDow = this.isoDayOfWeek(date);
      if (holidayDates.has(date)) continue;

      for (const sched of scheduleRows) {
        if (sched.dayOfWeek !== isoDow) continue;
        if (exceptionKeys.has(`${sched.id}:${date}`)) continue;

        const wellhubClass = classByActivity.get(sched.activityId);
        if (!wellhubClass) continue;

        const startsAt = buildClassDateTime(
          date,
          sched.startTime,
          branch.timezone,
        );
        if (startsAt.getTime() <= now.getTime()) continue;

        const capacity = resolveEffectiveCapacity(
          sched.activityCapacity,
          branch.maxCapacity,
        );
        const booked = await this.bookingService.countActiveBookings(
          sched.id,
          date,
        );

        const existing = publishedByKey.get(`${sched.id}:${date}`);
        if (!existing) {
          const created = await this.createOrAdoptSlot(
            branch.gymId,
            wellhubClass.wellhubClassId,
            startsAt,
            {
              occur_date: startsAt.toISOString(),
              status: 1,
              length_in_minutes: this.lengthInMinutes(
                sched.startTime,
                sched.endTime,
              ),
              total_capacity: capacity,
              total_booked: booked,
              product_id: productId,
              booking_window: {
                opens_at: new Date(
                  startsAt.getTime() - BOOKING_OPEN_DAYS * 24 * 60 * 60 * 1000,
                ).toISOString(),
                closes_at: startsAt.toISOString(),
              },
              cancellable_until: new Date(
                startsAt.getTime() - CANCEL_MARGIN_MINUTES * 60 * 1000,
              ).toISOString(),
            },
          );
          if (!created?.id) {
            throw new Error(
              `Wellhub no devolvió id al crear slot (schedule ${sched.id} ${date})`,
            );
          }
          await this.db.insert(schema.wellhubSlots).values({
            wellhubClassRowId: wellhubClass.rowId,
            scheduleId: sched.id,
            sessionDate: date,
            wellhubSlotId: created.id,
            totalCapacity: capacity,
            totalBooked: booked,
          });
          slotsCreated += 1;
        } else if (
          existing.totalCapacity !== capacity ||
          existing.totalBooked !== booked
        ) {
          await this.client.patchSlot(
            branch.gymId,
            existing.wellhubClassId,
            existing.wellhubSlotId,
            { total_capacity: capacity, total_booked: booked },
          );
          await this.db
            .update(schema.wellhubSlots)
            .set({ totalCapacity: capacity, totalBooked: booked })
            .where(eq(schema.wellhubSlots.id, existing.id));
          slotsPatched += 1;
        }
      }
    }

    // Limpieza: slots publicados que dejaron de ser válidos (horario
    // desactivado/borrado del set publicable, excepción nueva o feriado).
    const validScheduleIds = new Set(scheduleRows.map((s) => s.id));
    for (const published of publishedSlots) {
      const key = `${published.scheduleId}:${published.sessionDate}`;
      const stillValid =
        validScheduleIds.has(published.scheduleId) &&
        !exceptionKeys.has(key) &&
        !holidayDates.has(published.sessionDate);
      if (stillValid) continue;

      await this.client.deleteSlot(
        branch.gymId,
        published.wellhubClassId,
        published.wellhubSlotId,
      );
      await this.db
        .delete(schema.wellhubSlots)
        .where(eq(schema.wellhubSlots.id, published.id));
      slotsDeleted += 1;
      this.log.info(
        {
          branchId: branch.id,
          scheduleId: published.scheduleId,
          sessionDate: published.sessionDate,
        },
        "Slot despublicado de Wellhub",
      );
    }

    return { slotsCreated, slotsPatched, slotsDeleted };
  }

  /**
   * Crea el slot en Wellhub. Un 409 (slot.not.created.already.exists)
   * significa slot huérfano: un sync anterior lo creó en Wellhub pero falló
   * antes de registrarlo en wellhub_slots (crash o error post-create). En
   * vez de fallar en cada sync, se adopta el slot remoto que coincida en
   * occur_date y se lo alinea a nuestra capacidad/ocupación si difiere.
   */
  private async createOrAdoptSlot(
    gymId: number,
    classId: number,
    startsAt: Date,
    payload: WellhubSlotPayload,
  ): Promise<WellhubSlot> {
    try {
      return await this.client.createSlot(gymId, classId, payload);
    } catch (err: unknown) {
      if (!(err instanceof WellhubApiError) || err.status !== 409) throw err;

      // Sin rango el GET solo devuelve los slots de HOY; se pide la ventana
      // exacta del slot conflictivo.
      const remote = await this.client.listSlots(gymId, classId, {
        from: new Date(startsAt.getTime() - 60 * 1000),
        to: new Date(startsAt.getTime() + 60 * 1000),
      });
      const adopted = remote.find(
        (slot) =>
          parseWellhubDate(slot.occur_date).getTime() === startsAt.getTime(),
      );
      if (!adopted) throw err;

      this.log.warn(
        { gymId, classId, wellhubSlotId: adopted.id },
        "Slot ya existía en Wellhub (huérfano de un sync fallido): adoptado",
      );
      if (
        adopted.total_capacity !== payload.total_capacity ||
        adopted.total_booked !== payload.total_booked
      ) {
        await this.client.patchSlot(gymId, classId, adopted.id, {
          total_capacity: payload.total_capacity,
          total_booked: payload.total_booked,
        });
      }
      return adopted;
    }
  }

  // ─── Push puntual de ocupación ─────────────────────────────────────────────

  /**
   * Empuja el total_booked actual de un (schedule, fecha) si está publicado
   * y el número cambió. Llamado por el listener del bus de ocupación y por
   * los handlers de webhooks de reservas.
   */
  async pushSlotOccupancy(scheduleId: number, date: string): Promise<void> {
    const [slot] = await this.db
      .select({
        id: schema.wellhubSlots.id,
        wellhubSlotId: schema.wellhubSlots.wellhubSlotId,
        wellhubClassId: schema.wellhubClasses.wellhubClassId,
        totalBooked: schema.wellhubSlots.totalBooked,
        totalCapacity: schema.wellhubSlots.totalCapacity,
        gymId: schema.branches.wellhubGymId,
      })
      .from(schema.wellhubSlots)
      .innerJoin(
        schema.wellhubClasses,
        eq(schema.wellhubSlots.wellhubClassRowId, schema.wellhubClasses.id),
      )
      .innerJoin(
        schema.branches,
        eq(schema.wellhubClasses.branchId, schema.branches.id),
      )
      .where(
        and(
          eq(schema.wellhubSlots.scheduleId, scheduleId),
          eq(schema.wellhubSlots.sessionDate, date),
        ),
      )
      .limit(1);

    if (!slot || slot.gymId === null) return;

    const booked = await this.bookingService.countActiveBookings(
      scheduleId,
      date,
    );
    if (booked === slot.totalBooked) return;

    await this.client.patchSlot(
      slot.gymId,
      slot.wellhubClassId,
      slot.wellhubSlotId,
      {
        total_capacity: slot.totalCapacity,
        total_booked: booked,
      },
    );
    await this.db
      .update(schema.wellhubSlots)
      .set({ totalBooked: booked })
      .where(eq(schema.wellhubSlots.id, slot.id));

    this.log.info(
      { scheduleId, date, booked },
      "Ocupación de slot empujada a Wellhub",
    );
  }

  // ─── Reconciliación de pendings muertos ────────────────────────────────────

  /**
   * Solicitudes de reserva que quedaron 'pending' (la confirmación a Wellhub
   * nunca salió bien) con más de PENDING_EXPIRY_MINUTES: Wellhub ya las
   * auto-rechazó a los 15 min, así que el booking local libera el cupo.
   */
  private async expireDeadPendings(): Promise<number> {
    const cutoff = new Date(Date.now() - PENDING_EXPIRY_MINUTES * 60 * 1000);
    const dead = await this.db
      .select({
        id: schema.wellhubBookings.id,
        bookingId: schema.wellhubBookings.bookingId,
      })
      .from(schema.wellhubBookings)
      .where(
        and(
          eq(schema.wellhubBookings.status, "pending"),
          sql`${schema.wellhubBookings.createdAt} < ${cutoff}`,
        ),
      );

    let expired = 0;
    for (const row of dead) {
      if (row.bookingId !== null) {
        const [booking] = await this.db
          .select({
            id: schema.bookings.id,
            status: schema.bookings.status,
            scheduleId: schema.bookings.scheduleId,
            bookingDate: schema.bookings.bookingDate,
          })
          .from(schema.bookings)
          .where(eq(schema.bookings.id, row.bookingId))
          .limit(1);

        if (booking && booking.status !== "cancelado") {
          await this.db
            .update(schema.bookings)
            .set({ status: "cancelado", cancelledAt: new Date() })
            .where(eq(schema.bookings.id, booking.id));
          await this.bookingService.promoteWaitlist(
            booking.scheduleId,
            booking.bookingDate,
          );
        }
      }
      await this.db
        .update(schema.wellhubBookings)
        .set({ status: "expired" })
        .where(eq(schema.wellhubBookings.id, row.id));
      expired += 1;
    }

    if (expired > 0) {
      this.log.warn({ expired }, "Solicitudes Wellhub pending expiradas");
    }
    return expired;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /** ISO day-of-week (1=Lun..7=Dom) de un YYYY-MM-DD. */
  private isoDayOfWeek(date: string): number {
    const utcDow = new Date(`${date}T12:00:00Z`).getUTCDay();
    return utcDow === 0 ? 7 : utcDow;
  }

  private lengthInMinutes(startTime: string, endTime: string): number {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const minutes = eh * 60 + em - (sh * 60 + sm);
    // Wellhub exige 1..200 minutos.
    return Math.min(Math.max(minutes, 1), 200);
  }
}
