/**
 * Regression coverage for the "stale cancelado blocks new booking" bug.
 *
 * Symptom (Pia/Mica, 2026-05): admin asigna o renueva un plan fixed con los
 * mismos scheduleIds que ya estaban en la sub anterior. cancelFutureBookings
 * marca las futuras como cancelado (no las borra) y al re-generar las nuevas
 * el unique index (member_id, schedule_id, booking_date) colisiona. Antes del
 * fix: INSERT IGNORE en populateBookings + chequeo de existencia sin status
 * en generateFixedBookings → silenciosamente abandonan, alumno queda sin
 * bookings reservado. Después del fix: la fila cancelado se reactiva a
 * reservado.
 *
 * Estos tests son end-to-end vía la API real (change-plan + renew) más una
 * prueba directa de la migración 0122 que limpia el estado heredado en prod.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { activities } from "../../src/db/schema/activities";
import { schedules } from "../../src/db/schema/schedules";
import { bookings } from "../../src/db/schema/bookings";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionSchedules } from "../../src/db/schema/subscription-schedules";
import {
  SUBSCRIPTIONS_URL,
  createPlan,
  createMember,
  assignPlan,
  todayStr,
  dateOffsetStr,
} from "./_helpers";

describe("Subscriptions API — bookings reactivation (cancelado → reservado)", () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  // Helper local — los offset/horario no chocan con tests vecinos porque
  // cleanAllTestData corre entre cada test.
  async function createScheduleSlots(
    branchId: number,
    count: number,
    offset = 0,
  ): Promise<number[]> {
    await app.db.insert(activities).values({
      name: `Calistenia Reactivation ${offset}`,
      isActive: true,
    });
    const actRows = await app.db.select({ id: activities.id }).from(activities);
    const activityId = actRows[actRows.length - 1].id;
    const ids: number[] = [];
    for (let i = 0; i < count; i++) {
      const dayOfWeek = ((offset + i) % 5) + 1;
      const startHour = 8 + offset + i;
      const startTime = `${String(startHour).padStart(2, "0")}:00`;
      const endTime = `${String(startHour + 1).padStart(2, "0")}:00`;
      const result = await app.db.insert(schedules).values({
        branchId,
        activityId,
        dayOfWeek,
        startTime,
        endTime,
        isActive: true,
      });
      ids.push(Number(result[0].insertId));
    }
    return ids;
  }

  async function futureBookingCount(
    memberId: number,
    scheduleIds: number[],
    status: "reservado" | "cancelado",
  ): Promise<number> {
    const rows = await app.db
      .select({ c: sql<number>`COUNT(*)` })
      .from(bookings)
      .where(
        sql`${bookings.memberId} = ${memberId}
            AND ${bookings.scheduleId} IN (${sql.join(
              scheduleIds.map((id) => sql`${id}`),
              sql`, `,
            )})
            AND ${bookings.status} = ${status}
            AND ${bookings.bookingDate} > CURDATE()`,
      );
    return Number(rows[0].c);
  }

  it("change-plan a fixed más caro con mismos scheduleIds reactiva los cancelados", async () => {
    // Bug exacto reportado: el admin cambia el plan reutilizando los turnos
    // ya asignados. Antes del fix las nuevas bookings se perdían silenciosamente.
    const planA = await createPlan(app, adminToken, {
      name: "Plan A Fixed 2x",
      bookingMode: "fixed",
      classesPerWeek: 2,
      durationDays: 30,
      priceRegular: 8000,
      priceZero: 4000,
    });
    const planB = await createPlan(app, adminToken, {
      name: "Plan B Fixed 2x Premium",
      bookingMode: "fixed",
      classesPerWeek: 2,
      durationDays: 30,
      priceRegular: 12000,
      priceZero: 8000,
    });

    const member = await createMember(app);
    const slots = await createScheduleSlots(1, 2, 0);

    const assignResult = await assignPlan(app, adminToken, member.id, {
      planId: planA.id,
      startDate: todayStr(),
      scheduleIds: slots,
    });
    expect(assignResult.statusCode).toBe(201);

    const reservedBefore = await futureBookingCount(
      member.id,
      slots,
      "reservado",
    );
    expect(reservedBefore).toBeGreaterThan(0);

    const changeRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId: planB.id,
        branchId: 1,
        startDate: todayStr(),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
        scheduleIds: slots,
      },
    });
    expect(changeRes.statusCode).toBe(201);

    // Después del cambio: las mismas (member, schedule, fecha) futuras deben
    // estar reservado, NO cancelado (la fila se reactivó in-place gracias al
    // ON DUPLICATE KEY UPDATE en populateBookings y al ramo cancelado→reservado
    // en generateFixedBookings).
    const reservedAfter = await futureBookingCount(
      member.id,
      slots,
      "reservado",
    );
    const cancelledAfter = await futureBookingCount(
      member.id,
      slots,
      "cancelado",
    );

    expect(reservedAfter).toBeGreaterThan(0);
    expect(cancelledAfter).toBe(0);
    // El unique index garantiza una fila por (member, schedule, date).
    // Si el reactivation falla quedaría cancelado, no reservado.
    expect(reservedAfter).toBe(reservedBefore);
  });

  it("renew con plan fixed reactiva los cancelados al expirar la sub vieja", async () => {
    // Renew "now" (sin scheduled): la sub vieja queda expired, cancelFuture
    // cancela las bookings futuras y la nueva sub re-genera contra los mismos
    // slots. Es el otro flow donde el bug aparecía.
    const plan = await createPlan(app, adminToken, {
      name: "Plan Renewal Fixed 2x",
      bookingMode: "fixed",
      classesPerWeek: 2,
      durationDays: 30,
      priceRegular: 8000,
      priceZero: 4000,
    });

    const member = await createMember(app);
    const slots = await createScheduleSlots(1, 2, 10);

    // startDate ayer → endDate hoy. Auto-expira al consultar y permite renew
    // "now" (no scheduled), que es el flujo donde el bug pegaba más fuerte
    // porque cancela + re-genera en el mismo ciclo.
    const assignResult = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: dateOffsetStr(-29),
      scheduleIds: slots,
    });
    expect(assignResult.statusCode).toBe(201);
    const oldSubId = assignResult.body.id as number;

    // Forzar el end_date a hoy para que renew NO sea early (sino "now").
    await app.db
      .update(subscriptions)
      .set({ endDate: todayStr() })
      .where(eq(subscriptions.id, oldSubId));

    const renewRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash" },
    });
    expect(renewRes.statusCode).toBe(201);
    const newSub = JSON.parse(renewRes.body);
    expect(newSub.previousSubscriptionId).toBe(oldSubId);

    const reservedAfter = await futureBookingCount(
      member.id,
      slots,
      "reservado",
    );
    const cancelledAfter = await futureBookingCount(
      member.id,
      slots,
      "cancelado",
    );

    expect(reservedAfter).toBeGreaterThan(0);
    expect(cancelledAfter).toBe(0);
  });

  it("change-plan no toca bookings reservado activos de OTRO alumno en el mismo slot", async () => {
    // Regression: el ON DUPLICATE KEY UPDATE solo dispara para el (member,
    // schedule, date) propio; otros alumnos en el mismo slot no se ven
    // afectados.
    const planA = await createPlan(app, adminToken, {
      name: "Plan Shared Slot A",
      bookingMode: "fixed",
      classesPerWeek: 2,
      durationDays: 30,
      priceRegular: 8000,
      priceZero: 4000,
    });
    const planB = await createPlan(app, adminToken, {
      name: "Plan Shared Slot B",
      bookingMode: "fixed",
      classesPerWeek: 2,
      durationDays: 30,
      priceRegular: 12000,
      priceZero: 8000,
    });

    const slots = await createScheduleSlots(1, 2, 20);
    const memberA = await createMember(app, { email: "shared-a@test.com" });
    const memberB = await createMember(app, { email: "shared-b@test.com" });

    await assignPlan(app, adminToken, memberA.id, {
      planId: planA.id,
      startDate: todayStr(),
      scheduleIds: slots,
    });
    await assignPlan(app, adminToken, memberB.id, {
      planId: planA.id,
      startDate: todayStr(),
      scheduleIds: slots,
    });

    const bReservedBefore = await futureBookingCount(
      memberB.id,
      slots,
      "reservado",
    );
    expect(bReservedBefore).toBeGreaterThan(0);

    const changeRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${memberA.id}/subscription/change-plan`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId: planB.id,
        branchId: 1,
        startDate: todayStr(),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
        scheduleIds: slots,
      },
    });
    expect(changeRes.statusCode).toBe(201);

    const bReservedAfter = await futureBookingCount(
      memberB.id,
      slots,
      "reservado",
    );
    const bCancelledAfter = await futureBookingCount(
      memberB.id,
      slots,
      "cancelado",
    );
    expect(bReservedAfter).toBe(bReservedBefore);
    expect(bCancelledAfter).toBe(0);
  });

  describe("Migration 0122 backfill", () => {
    // Cargamos la SQL del archivo real para asegurar que cualquier cambio
    // futuro de la migración mantenga el contrato cubierto por estos asserts.
    const migrationSql = readFileSync(
      resolve(
        __dirname,
        "../../src/db/migrations/0122_reactivate_stale_cancelled_bookings.sql",
      ),
      "utf8",
    );

    async function runMigration() {
      await app.db.execute(sql.raw(migrationSql));
    }

    it("reactiva cancelado futuro cuando subscription_schedules y sub activa lo respaldan", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Migration Backfill Fixed 2x",
        bookingMode: "fixed",
        classesPerWeek: 2,
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
      });
      const member = await createMember(app);
      const slots = await createScheduleSlots(1, 2, 30);
      const { body } = await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        startDate: todayStr(),
        scheduleIds: slots,
      });
      expect(body.id).toBeTruthy();

      // Forzar estado heredado: marcar las bookings reservado futuras como
      // cancelado (sin tocar subscription_schedules ni la sub). Esto reproduce
      // exactamente el estado en prod previo al fix.
      await app.db
        .update(bookings)
        .set({ status: "cancelado", cancelledAt: new Date() })
        .where(
          sql`${bookings.memberId} = ${member.id}
              AND ${bookings.scheduleId} IN (${sql.join(
                slots.map((id) => sql`${id}`),
                sql`, `,
              )})
              AND ${bookings.bookingDate} > CURDATE()
              AND ${bookings.status} = 'reservado'`,
        );

      const cancelledBefore = await futureBookingCount(
        member.id,
        slots,
        "cancelado",
      );
      expect(cancelledBefore).toBeGreaterThan(0);

      await runMigration();

      const reservedAfter = await futureBookingCount(
        member.id,
        slots,
        "reservado",
      );
      const cancelledAfter = await futureBookingCount(
        member.id,
        slots,
        "cancelado",
      );
      expect(reservedAfter).toBe(cancelledBefore);
      expect(cancelledAfter).toBe(0);
    });

    it("NO toca cancelado cuyo subscription_schedules ya no incluye el slot", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Migration Skip Detached 2x",
        bookingMode: "fixed",
        classesPerWeek: 2,
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
      });
      const member = await createMember(app);
      const originalSlots = await createScheduleSlots(1, 2, 40);
      const { body } = await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        startDate: todayStr(),
        scheduleIds: originalSlots,
      });
      const subId = body.id as number;

      // Cancelo las bookings y desasocio el primer slot de subscription_schedules:
      // este slot ya NO es parte del plan vigente, así que la migración debe
      // dejarlo cancelado.
      await app.db
        .update(bookings)
        .set({ status: "cancelado", cancelledAt: new Date() })
        .where(
          sql`${bookings.memberId} = ${member.id}
              AND ${bookings.scheduleId} = ${originalSlots[0]}
              AND ${bookings.bookingDate} > CURDATE()
              AND ${bookings.status} = 'reservado'`,
        );
      await app.db.delete(subscriptionSchedules).where(
        sql`${subscriptionSchedules.subscriptionId} = ${subId}
              AND ${subscriptionSchedules.scheduleId} = ${originalSlots[0]}`,
      );

      const cancelledBefore = await futureBookingCount(
        member.id,
        [originalSlots[0]],
        "cancelado",
      );
      expect(cancelledBefore).toBeGreaterThan(0);

      await runMigration();

      const cancelledAfter = await futureBookingCount(
        member.id,
        [originalSlots[0]],
        "cancelado",
      );
      const reservedAfter = await futureBookingCount(
        member.id,
        [originalSlots[0]],
        "reservado",
      );
      expect(cancelledAfter).toBe(cancelledBefore);
      expect(reservedAfter).toBe(0);
    });

    it("NO toca cancelado de una sub paused/expired/cancelled", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Migration Skip Paused 2x",
        bookingMode: "fixed",
        classesPerWeek: 2,
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
      });
      const member = await createMember(app);
      const slots = await createScheduleSlots(1, 2, 50);
      const { body } = await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        startDate: todayStr(),
        scheduleIds: slots,
      });
      const subId = body.id as number;

      await app.db
        .update(bookings)
        .set({ status: "cancelado", cancelledAt: new Date() })
        .where(
          sql`${bookings.memberId} = ${member.id}
              AND ${bookings.scheduleId} IN (${sql.join(
                slots.map((id) => sql`${id}`),
                sql`, `,
              )})
              AND ${bookings.bookingDate} > CURDATE()
              AND ${bookings.status} = 'reservado'`,
        );

      // Llevar la sub a paused — la migración solo reactiva para active/scheduled.
      await app.db
        .update(subscriptions)
        .set({ status: "paused" })
        .where(eq(subscriptions.id, subId));

      const cancelledBefore = await futureBookingCount(
        member.id,
        slots,
        "cancelado",
      );
      expect(cancelledBefore).toBeGreaterThan(0);

      await runMigration();

      const cancelledAfter = await futureBookingCount(
        member.id,
        slots,
        "cancelado",
      );
      const reservedAfter = await futureBookingCount(
        member.id,
        slots,
        "reservado",
      );
      expect(cancelledAfter).toBe(cancelledBefore);
      expect(reservedAfter).toBe(0);
    });

    it("NO toca cancelado cuyo schedule está desactivado", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Migration Skip Inactive Slot 2x",
        bookingMode: "fixed",
        classesPerWeek: 2,
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
      });
      const member = await createMember(app);
      const slots = await createScheduleSlots(1, 2, 60);
      await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        startDate: todayStr(),
        scheduleIds: slots,
      });

      await app.db
        .update(bookings)
        .set({ status: "cancelado", cancelledAt: new Date() })
        .where(
          sql`${bookings.memberId} = ${member.id}
              AND ${bookings.scheduleId} IN (${sql.join(
                slots.map((id) => sql`${id}`),
                sql`, `,
              )})
              AND ${bookings.bookingDate} > CURDATE()
              AND ${bookings.status} = 'reservado'`,
        );

      // Desactivar uno de los slots. La migración requiere sch.is_active = 1.
      await app.db
        .update(schedules)
        .set({ isActive: false })
        .where(eq(schedules.id, slots[0]));

      await runMigration();

      const reservedOnDisabled = await futureBookingCount(
        member.id,
        [slots[0]],
        "reservado",
      );
      expect(reservedOnDisabled).toBe(0);
    });

    it("NO toca cancelado pasado (booking_date < hoy)", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Migration Skip Past 2x",
        bookingMode: "fixed",
        classesPerWeek: 2,
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
      });
      const member = await createMember(app);
      const slots = await createScheduleSlots(1, 2, 70);
      await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        startDate: todayStr(),
        scheduleIds: slots,
      });

      // Insertar una booking pasada cancelado para el mismo (member, schedule)
      // — usa primer slot, hace dos días atrás para evitar colisión de UNIQUE
      // con cualquier fila ya generada.
      await app.db.insert(bookings).values({
        memberId: member.id,
        scheduleId: slots[0],
        bookingDate: dateOffsetStr(-2),
        status: "cancelado",
        cancelledAt: new Date(),
      });

      await runMigration();

      const pastRows = await app.db
        .select({ id: bookings.id, status: bookings.status })
        .from(bookings)
        .where(
          sql`${bookings.memberId} = ${member.id}
              AND ${bookings.scheduleId} = ${slots[0]}
              AND ${bookings.bookingDate} = ${dateOffsetStr(-2)}`,
        );
      expect(pastRows).toHaveLength(1);
      expect(pastRows[0].status).toBe("cancelado");
    });

    it("es idempotente: re-correr sobre estado limpio no cambia nada", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Migration Idempotent 2x",
        bookingMode: "fixed",
        classesPerWeek: 2,
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
      });
      const member = await createMember(app);
      const slots = await createScheduleSlots(1, 2, 80);
      await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        startDate: todayStr(),
        scheduleIds: slots,
      });

      const reservedBefore = await futureBookingCount(
        member.id,
        slots,
        "reservado",
      );

      // Estado limpio (no hay cancelados que reactivar). Doble-corrida no
      // debe modificar nada.
      await runMigration();
      await runMigration();

      const reservedAfter = await futureBookingCount(
        member.id,
        slots,
        "reservado",
      );
      const cancelledAfter = await futureBookingCount(
        member.id,
        slots,
        "cancelado",
      );
      expect(reservedAfter).toBe(reservedBefore);
      expect(cancelledAfter).toBe(0);
    });
  });
});
