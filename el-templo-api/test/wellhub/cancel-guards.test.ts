/**
 * Fase 204 D-11 / D-24 / D-25 (+ D-18 en los cancelados masivos): las reservas
 * Wellhub se gestionan desde la app de Wellhub.
 *
 *   - El staff no puede borrar una reserva Wellhub (409) y el socio tampoco la
 *     cancela desde la app (409). Las reservas propias siguen cancelandose igual.
 *   - Ciclo de vida del plan (cancelar), compensar dias, cambio de sede y baja
 *     del socio NO cancelan las reservas Wellhub vivas.
 *   - El cierre de clase si cancela la reserva Wellhub (hueco diferido) pero NO le
 *     da credito de recupero (`replacementCredits`) al plan fijo del socio.
 *
 * Fechas siempre relativas a "hoy" en la tz de la sede. Las reservas Wellhub de
 * socios con plan fijo se siembran convirtiendo una reserva ya generada por el
 * plan (UPDATE de `source`): el unico indice (socio, horario, fecha) no deja
 * insertar una segunda fila sobre el mismo turno anclado.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq, gt } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { addDays } from "../../src/modules/shared/date-utils";
import { WELLHUB_BOOKING_MANAGED_MSG } from "../../src/modules/scheduling/booking-service";
import {
  assignTestPlan,
  cleanAllTestData,
  createTestApp,
  createTestMember,
  createTestPlan,
  getAuthToken,
} from "../helpers";
import {
  TEMPLO_CTX,
  branchToday,
  insertActivityWithSchedule,
  insertBooking,
} from "../fixtures/wellhub-personas";

const BRANCH_ID = 1;

/** Dia de la semana de la tabla `schedules` (1=lunes..6=sabado) para una fecha. */
function scheduleDow(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** Primer offset >= `from` cuya fecha no cae domingo (evita ambiguedad 0/7 del dayOfWeek). */
function nonSundayOffset(today: string, from: number): number {
  let offset = from;
  while (scheduleDow(addDays(today, offset)) === 0) offset += 1;
  return offset;
}

describe("Fase 204 D-11/D-24/D-25: las reservas Wellhub se gestionan desde Wellhub", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let today: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    today = await branchToday(app, BRANCH_ID);
  });

  // ─── Helpers ───────────────────────────────────────────────────────────────

  async function bookingStatus(bookingId: number): Promise<string> {
    const [row] = await app.db
      .select({ status: schema.bookings.status })
      .from(schema.bookings)
      .where(
        and(
          tenantWhere(schema.bookings, TEMPLO_CTX),
          eq(schema.bookings.id, bookingId),
        ),
      );
    if (!row) throw new Error(`bookingStatus: reserva ${bookingId} inexistente`);
    return row.status;
  }

  async function replacementCreditsOf(subscriptionId: number): Promise<number> {
    const [row] = await app.db
      .select({ credits: schema.subscriptions.replacementCredits })
      .from(schema.subscriptions)
      .where(
        and(
          tenantWhere(schema.subscriptions, TEMPLO_CTX),
          eq(schema.subscriptions.id, subscriptionId),
        ),
      );
    if (!row) {
      throw new Error(`replacementCredits: suscripcion ${subscriptionId} inexistente`);
    }
    return row.credits;
  }

  /** Convierte una reserva ya generada en reserva Wellhub. */
  async function markAsWellhub(bookingId: number): Promise<void> {
    await app.db
      .update(schema.bookings)
      .set({ source: "wellhub" })
      .where(
        and(
          tenantWhere(schema.bookings, TEMPLO_CTX),
          eq(schema.bookings.id, bookingId),
        ),
      );
  }

  /** Reservas de un socio sobre un horario, de hoy en adelante, ordenadas por fecha. */
  async function bookingsOnSchedule(
    memberId: number,
    scheduleId: number,
  ): Promise<Array<{ id: number; bookingDate: string; status: string }>> {
    const rows = await app.db
      .select({
        id: schema.bookings.id,
        bookingDate: schema.bookings.bookingDate,
        status: schema.bookings.status,
      })
      .from(schema.bookings)
      .where(
        and(
          tenantWhere(schema.bookings, TEMPLO_CTX),
          eq(schema.bookings.memberId, memberId),
          eq(schema.bookings.scheduleId, scheduleId),
          gt(schema.bookings.bookingDate, today),
        ),
      );
    return rows.sort((a, b) => a.bookingDate.localeCompare(b.bookingDate));
  }

  /** Socio con plan fijo anclado a `scheduleIds` (sin cobro, arranca hace 25 dias). */
  async function createFixedSocio(
    planId: number,
    scheduleIds: number[],
    startDate: string = addDays(today, -25),
  ): Promise<{ id: number; token: string; subscriptionId: number }> {
    const member = await createTestMember(app, { branchId: BRANCH_ID });
    const assigned = await assignTestPlan(app, adminToken, member.id, planId, {
      branchId: BRANCH_ID,
      startDate,
      scheduleIds,
      priceOverrideAmount: 0,
      priceOverrideReason: "test no-charge",
    });
    expect(assigned.statusCode).toBe(201);
    return {
      id: member.id,
      token: member.token,
      subscriptionId: (assigned.body as { id: number }).id,
    };
  }

  async function createFixedPlan(classesPerWeek: number): Promise<number> {
    const plan = await createTestPlan(app, adminToken, {
      name: `Plan fijo 204-05 ${Date.now().toString(36)}`,
      bookingMode: "fixed",
      classesPerWeek,
      durationDays: 60,
    });
    return plan.id;
  }

  // ─── D-11 / D-24: cancelaciones individuales ───────────────────────────────

  it("el staff no puede borrar una reserva Wellhub: 409 y la reserva sigue igual", async () => {
    const member = await createTestMember(app, { branchId: BRANCH_ID });
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const bookingId = await insertBooking(app, {
      memberId: member.id,
      scheduleId,
      bookingDate: addDays(today, 2),
      source: "wellhub",
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/admin/scheduling/bookings/${bookingId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(409);
    expect((JSON.parse(res.body) as { message: string }).message).toBe(
      WELLHUB_BOOKING_MANAGED_MSG,
    );
    expect(await bookingStatus(bookingId)).toBe("reservado");
  });

  it("control: el staff sí puede borrar una reserva propia", async () => {
    const member = await createTestMember(app, { branchId: BRANCH_ID });
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    // source NULL = reserva propia/legacy (el caso NULL-safe).
    const bookingId = await insertBooking(app, {
      memberId: member.id,
      scheduleId,
      bookingDate: addDays(today, 2),
      source: null,
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/admin/scheduling/bookings/${bookingId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(await bookingStatus(bookingId)).toBe("cancelado");
  });

  it("el socio no puede cancelar su reserva Wellhub desde la app: 409", async () => {
    const member = await createTestMember(app, { branchId: BRANCH_ID });
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const wellhubBookingId = await insertBooking(app, {
      memberId: member.id,
      scheduleId,
      bookingDate: addDays(today, 2),
      source: "wellhub",
    });
    const ownBookingId = await insertBooking(app, {
      memberId: member.id,
      scheduleId,
      bookingDate: addDays(today, 3),
      source: null,
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/members/scheduling/bookings/${wellhubBookingId}`,
      headers: { authorization: `Bearer ${member.token}` },
    });
    expect(res.statusCode).toBe(409);
    expect((JSON.parse(res.body) as { message: string }).message).toBe(
      WELLHUB_BOOKING_MANAGED_MSG,
    );
    expect(await bookingStatus(wellhubBookingId)).toBe("reservado");

    // Control: la reserva propia del mismo socio se cancela normalmente.
    const own = await app.inject({
      method: "DELETE",
      url: `/api/members/scheduling/bookings/${ownBookingId}`,
      headers: { authorization: `Bearer ${member.token}` },
    });
    expect(own.statusCode).toBe(200);
    expect(await bookingStatus(ownBookingId)).toBe("cancelado");
  });

  // ─── D-18/D-25: cancelados masivos ─────────────────────────────────────────

  it("cancelar el plan no cancela las reservas Wellhub futuras", async () => {
    const planId = await createFixedPlan(1);
    const offset = nonSundayOffset(today, 1);
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
      dayOfWeek: scheduleDow(addDays(today, offset)),
    });
    const socio = await createFixedSocio(planId, [scheduleId]);

    const generated = await bookingsOnSchedule(socio.id, scheduleId);
    expect(generated.length).toBeGreaterThanOrEqual(2);
    const wellhub = generated[1];
    const own = generated[0];
    await markAsWellhub(wellhub.id);

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/subscriptions/members/${socio.id}/subscription/cancel`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);

    expect(await bookingStatus(own.id)).toBe("cancelado");
    expect(await bookingStatus(wellhub.id)).toBe("reservado");
  });

  it("dar de baja al socio no cancela sus reservas Wellhub futuras", async () => {
    const member = await createTestMember(app, { branchId: BRANCH_ID });
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const wellhubId = await insertBooking(app, {
      memberId: member.id,
      scheduleId,
      bookingDate: addDays(today, 2),
      source: "wellhub",
    });
    const ownId = await insertBooking(app, {
      memberId: member.id,
      scheduleId,
      bookingDate: addDays(today, 3),
      source: null,
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/admin/members/${member.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(204);

    expect(await bookingStatus(ownId)).toBe("cancelado");
    expect(await bookingStatus(wellhubId)).toBe("reservado");
  });

  it("compensar días no cancela las reservas Wellhub del rango", async () => {
    // Dos turnos anclados en dias distintos de la ventana today+1..today+7:
    // cada uno aparece exactamente una vez. En uno queda la reserva propia y el
    // otro se convierte en Wellhub.
    const offsetA = nonSundayOffset(today, 1);
    const offsetB = nonSundayOffset(today, offsetA + 1);
    expect(offsetB).toBeLessThanOrEqual(7);
    const { scheduleId: scheduleA } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
      dayOfWeek: scheduleDow(addDays(today, offsetA)),
    });
    const { scheduleId: scheduleB } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
      dayOfWeek: scheduleDow(addDays(today, offsetB)),
    });
    const planId = await createFixedPlan(2);
    const socio = await createFixedSocio(
      planId,
      [scheduleA, scheduleB],
      addDays(today, -20),
    );

    const fromDate = addDays(today, 1);
    const toDate = addDays(today, 7);
    const inRange = (b: { bookingDate: string }) =>
      b.bookingDate >= fromDate && b.bookingDate <= toDate;
    const ownBooking = (await bookingsOnSchedule(socio.id, scheduleA)).find(
      inRange,
    );
    const wellhubBooking = (await bookingsOnSchedule(socio.id, scheduleB)).find(
      inRange,
    );
    expect(ownBooking).toBeDefined();
    expect(wellhubBooking).toBeDefined();
    if (!ownBooking || !wellhubBooking) return;
    await markAsWellhub(wellhubBooking.id);

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/subscriptions/subscriptions/${socio.subscriptionId}/compensate-days`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { fromDate, toDate, reason: "Viaje avisado con anticipación" },
    });
    expect(res.statusCode).toBe(200);

    expect(await bookingStatus(ownBooking.id)).toBe("cancelado");
    expect(await bookingStatus(wellhubBooking.id)).toBe("reservado");
  });

  it("cambiar de sede al socio no cancela sus reservas Wellhub futuras", async () => {
    const suffix = Date.now().toString(36);
    const [otherBranch] = await app.db
      .insert(schema.branches)
      .values(
        tenantValues(TEMPLO_CTX, {
          name: `Sede 204-05 ${suffix}`,
          code: `W5-${suffix}`.slice(0, 20),
          country: "AR",
          isActive: true,
          timezone: "America/Argentina/Buenos_Aires",
          isVirtual: false,
        }),
      )
      .$returningId();

    const member = await createTestMember(app, { branchId: BRANCH_ID });
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const wellhubId = await insertBooking(app, {
      memberId: member.id,
      scheduleId,
      bookingDate: addDays(today, 2),
      source: "wellhub",
    });
    const ownId = await insertBooking(app, {
      memberId: member.id,
      scheduleId,
      bookingDate: addDays(today, 3),
      source: null,
    });

    // Sin suscripcion viva no hay plan multisede: corre la limpieza destructiva.
    const res = await app.inject({
      method: "PUT",
      url: `/api/admin/members/${member.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { branchId: otherBranch.id },
    });
    expect(res.statusCode).toBe(200);

    expect(await bookingStatus(ownId)).toBe("cancelado");
    expect(await bookingStatus(wellhubId)).toBe("reservado");
  });

  // ─── Cierre de clase: cancela, pero sin crédito de recupero ────────────────

  it("cerrar la clase cancela la reserva Wellhub pero no da crédito de recupero", async () => {
    const closeOffset = nonSundayOffset(today, 3);
    const closeDate = addDays(today, closeOffset);
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
      dayOfWeek: scheduleDow(closeDate),
    });
    const planId = await createFixedPlan(1);
    const ownSocio = await createFixedSocio(planId, [scheduleId]);
    const wellhubSocio = await createFixedSocio(planId, [scheduleId]);

    const ownOnDate = (await bookingsOnSchedule(ownSocio.id, scheduleId)).find(
      (b) => b.bookingDate === closeDate,
    );
    const wellhubOnDate = (
      await bookingsOnSchedule(wellhubSocio.id, scheduleId)
    ).find((b) => b.bookingDate === closeDate);
    expect(ownOnDate).toBeDefined();
    expect(wellhubOnDate).toBeDefined();
    if (!ownOnDate || !wellhubOnDate) return;
    await markAsWellhub(wellhubOnDate.id);

    const creditsBefore = await replacementCreditsOf(wellhubSocio.subscriptionId);
    const ownCreditsBefore = await replacementCreditsOf(ownSocio.subscriptionId);

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/scheduling/schedules/${scheduleId}/cancel-date`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { date: closeDate, reason: "Cerrado" },
    });
    expect(res.statusCode).toBe(200);

    // Hueco diferido (documentado): el cierre cancela tambien la reserva Wellhub.
    expect(await bookingStatus(wellhubOnDate.id)).toBe("cancelado");
    expect(await bookingStatus(ownOnDate.id)).toBe("cancelado");

    // La reserva Wellhub nunca se resuelve a credito del plan fijo del socio.
    expect(await replacementCreditsOf(wellhubSocio.subscriptionId)).toBe(
      creditsBefore,
    );
    // Control: la reserva propia en la misma situacion otorga +1.
    expect(await replacementCreditsOf(ownSocio.subscriptionId)).toBe(
      ownCreditsBefore + 1,
    );
  });
});
