/**
 * Fase 204 (D-05/D-21) — "Unir con alumno existente".
 *
 *   POST /api/admin/members/:userId/wellhub-merge   body { targetUserId }
 *
 * `:userId` es el duplicado Wellhub (ficha pura) que se absorbe; `targetUserId`
 * es el alumno que lo recibe. Las personas son las de `wellhub-personas.ts`.
 * Fechas relativas a "hoy" en la tz de la sede, ningun id de `users`
 * hardcodeado. El aislamiento entre gimnasios vive en
 * `tenancy/iso-03-members-ficha.test.ts`; los rechazos por rol y por regla de
 * negocio, solo aca.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { addDays } from "../../src/modules/shared/date-utils";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import {
  cleanAllTestData,
  createStaffUser,
  createTestApp,
  createTestPlan,
  dateOffsetStr,
  getAuthToken,
} from "../helpers";
import {
  TEMPLO_CTX,
  branchToday,
  createWellhubExAlumno,
  createWellhubSocioActivo,
  createWellhubVisitor,
  insertActivityWithSchedule,
  insertAttendance,
  insertBooking,
  insertWellhubBookingRow,
  insertWellhubSlot,
  uniqueGympassId,
} from "../fixtures/wellhub-personas";

const BRANCH_ID = 1;

interface MergeBody {
  ok: boolean;
  targetUserId: number;
  moved: {
    bookings: number;
    attendance: number;
    wellhubBookings: number;
    notes: number;
  };
}

interface ErrorBody {
  error: string;
  message: string;
}

describe("Fase 204 D-05/D-21: unir duplicado Wellhub con alumno existente", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let planId: number;
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
    const plan = await createTestPlan(app, adminToken, {
      name: `Plan 204-10 ${Date.now().toString(36)}`,
      classesPerWeek: 3,
      durationDays: 30,
    });
    planId = plan.id;
  });

  // ─── Helpers ───────────────────────────────────────────────────────────────

  async function postMerge(
    sourceUserId: number,
    targetUserId: number,
    token: string = adminToken,
  ) {
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/members/${sourceUserId}/wellhub-merge`,
      headers: { authorization: `Bearer ${token}` },
      payload: { targetUserId },
    });
    return { statusCode: res.statusCode, body: res.json() as unknown };
  }

  async function getUser(id: number) {
    const [row] = await app.db
      .select({
        gympassId: schema.users.gympassId,
        deletedAt: schema.users.deletedAt,
        email: schema.users.email,
      })
      .from(schema.users)
      .where(
        and(tenantWhere(schema.users, TEMPLO_CTX), eq(schema.users.id, id)),
      );
    return row;
  }

  async function bookingsOf(memberId: number) {
    return app.db
      .select({
        id: schema.bookings.id,
        scheduleId: schema.bookings.scheduleId,
        bookingDate: schema.bookings.bookingDate,
        status: schema.bookings.status,
        cancelledAt: schema.bookings.cancelledAt,
      })
      .from(schema.bookings)
      .where(
        and(
          tenantWhere(schema.bookings, TEMPLO_CTX),
          eq(schema.bookings.memberId, memberId),
        ),
      );
  }

  async function auditRowsFor(targetId: number) {
    return app.db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          tenantWhere(schema.auditLog, TEMPLO_CTX),
          eq(schema.auditLog.action, "wellhub_member_merged"),
          eq(schema.auditLog.targetKind, "member"),
          eq(schema.auditLog.targetId, targetId),
        ),
      );
  }

  /** Ex-alumno sin Wellhub: el destino tipico de la union (el duplicado se creo por el webhook). */
  async function createExAlumnoSinWellhub(): Promise<number> {
    const ex = await createWellhubExAlumno(app, adminToken, {
      branchId: BRANCH_ID,
      planId,
    });
    await app.db
      .update(schema.users)
      .set({ gympassId: null })
      .where(
        and(tenantWhere(schema.users, TEMPLO_CTX), eq(schema.users.id, ex.id)),
      );
    return ex.id;
  }

  // ─── Tests ─────────────────────────────────────────────────────────────────

  it("une el duplicado: mueve gympass, reservas, visitas y notas, da de baja y audita", async () => {
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    const targetId = await createExAlumnoSinWellhub();
    const { activityId, scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const bookingDate = addDays(today, 2);

    const bookingId = await insertBooking(app, {
      memberId: visitor.id,
      scheduleId,
      bookingDate,
      source: "wellhub",
    });
    const attendanceId = await insertAttendance(app, {
      memberId: visitor.id,
      branchId: BRANCH_ID,
      sessionDate: today,
      source: "wellhub",
    });
    const slotRowId = await insertWellhubSlot(app, {
      branchId: BRANCH_ID,
      activityId,
      scheduleId,
      sessionDate: bookingDate,
    });
    const whBookingId = await insertWellhubBookingRow(app, {
      userId: visitor.id,
      bookingId,
      wellhubSlotRowId: slotRowId,
    });
    const [note] = await app.db
      .insert(schema.memberNotes)
      .values(
        tenantValues(TEMPLO_CTX, {
          userId: visitor.id,
          authorId: visitor.id,
          content: "Nota del duplicado 204-10",
        }),
      )
      .$returningId();

    const { statusCode, body } = await postMerge(visitor.id, targetId);

    expect(statusCode).toBe(200);
    const result = body as MergeBody;
    expect(result.ok).toBe(true);
    expect(result.targetUserId).toBe(targetId);
    expect(result.moved).toEqual({
      bookings: 1,
      attendance: 1,
      wellhubBookings: 1,
      notes: 1,
    });

    // El destino tiene el ID de Wellhub; el duplicado, no, y esta dado de baja.
    const target = await getUser(targetId);
    expect(target?.gympassId).toBe(visitor.gympassId);
    const source = await getUser(visitor.id);
    expect(source?.gympassId).toBeNull();
    expect(source?.deletedAt).not.toBeNull();
    expect(source?.email).toMatch(
      new RegExp(`^deleted-${visitor.id}-\\d+@deleted\\.local$`),
    );

    // Las filas apuntan al destino.
    const [booking] = await app.db
      .select({ memberId: schema.bookings.memberId })
      .from(schema.bookings)
      .where(
        and(
          tenantWhere(schema.bookings, TEMPLO_CTX),
          eq(schema.bookings.id, bookingId),
        ),
      );
    expect(booking?.memberId).toBe(targetId);
    const [visit] = await app.db
      .select({ memberId: schema.attendance.memberId })
      .from(schema.attendance)
      .where(
        and(
          tenantWhere(schema.attendance, TEMPLO_CTX),
          eq(schema.attendance.id, attendanceId),
        ),
      );
    expect(visit?.memberId).toBe(targetId);
    const [whBooking] = await app.db
      .select({ userId: schema.wellhubBookings.userId })
      .from(schema.wellhubBookings)
      .where(
        and(
          tenantWhere(schema.wellhubBookings, TEMPLO_CTX),
          eq(schema.wellhubBookings.id, whBookingId),
        ),
      );
    expect(whBooking?.userId).toBe(targetId);
    const [movedNote] = await app.db
      .select({ userId: schema.memberNotes.userId })
      .from(schema.memberNotes)
      .where(
        and(
          tenantWhere(schema.memberNotes, TEMPLO_CTX),
          eq(schema.memberNotes.id, note.id),
        ),
      );
    expect(movedNote?.userId).toBe(targetId);

    // Una fila de auditoria con el duplicado absorbido.
    const audit = await auditRowsFor(targetId);
    expect(audit).toHaveLength(1);
    const payload = audit[0].payloadJson as Record<string, unknown>;
    expect(payload.absorbedUserId).toBe(visitor.id);
    expect(payload.gympassId).toBe(visitor.gympassId);
    expect(payload.absorbedEmail).toBe(visitor.email);
  });

  it("solo admin u owner puede unir", async () => {
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    const targetId = await createExAlumnoSinWellhub();
    const gestionEmail = `gestion-204-10-${Date.now().toString(36)}@test.com`;
    await createStaffUser(app, {
      email: gestionEmail,
      password: "gestionpass123",
      firstName: "Gestion",
      lastName: "Wellhub",
      role: "gestion",
      branchId: BRANCH_ID,
    });
    const gestionToken = await getAuthToken(
      app,
      gestionEmail,
      "gestionpass123",
    );

    const { statusCode, body } = await postMerge(
      visitor.id,
      targetId,
      gestionToken,
    );

    expect(statusCode).toBe(403);
    expect((body as ErrorBody).message).toBe(
      "Solo admin u owner puede unir fichas",
    );
    // Nada cambio.
    expect((await getUser(visitor.id))?.gympassId).toBe(visitor.gympassId);
    expect((await getUser(visitor.id))?.deletedAt).toBeNull();
    expect((await getUser(targetId))?.gympassId).toBeNull();
    expect(await auditRowsFor(targetId)).toHaveLength(0);
  });

  it("rechaza si la ficha a absorber tiene plan o pagos", async () => {
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    const targetId = await createExAlumnoSinWellhub();
    // Suscripcion directa: el estado sigue siendo 'wellhub' pero ya tiene plan.
    await app.db.insert(schema.subscriptions).values(
      tenantValues(TEMPLO_CTX, {
        userId: visitor.id,
        planId,
        branchId: BRANCH_ID,
        status: "active" as const,
        startDate: dateOffsetStr(-5),
        endDate: dateOffsetStr(25),
        pricePaid: 15000,
        priceTypeApplied: "regular" as const,
      }),
    );

    const { statusCode, body } = await postMerge(visitor.id, targetId);

    expect(statusCode).toBe(409);
    expect((body as ErrorBody).message).toBe(
      "Solo se puede unir una ficha Wellhub sin planes ni pagos",
    );
    expect((await getUser(visitor.id))?.gympassId).toBe(visitor.gympassId);
    expect((await getUser(visitor.id))?.deletedAt).toBeNull();
    expect((await getUser(targetId))?.gympassId).toBeNull();
  });

  it("rechaza si el destino ya tiene otro ID de Wellhub", async () => {
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    const otherGympassId = uniqueGympassId();
    const socio = await createWellhubSocioActivo(app, adminToken, {
      planId,
      branchId: BRANCH_ID,
      gympassId: otherGympassId,
    });

    const { statusCode, body } = await postMerge(visitor.id, socio.id);

    expect(statusCode).toBe(409);
    expect((body as ErrorBody).message).toBe(
      "Ese alumno ya tiene otro ID de Wellhub",
    );
    expect((await getUser(visitor.id))?.gympassId).toBe(visitor.gympassId);
    expect((await getUser(socio.id))?.gympassId).toBe(otherGympassId);
    expect(await auditRowsFor(socio.id)).toHaveLength(0);
  });

  it("rechaza si ambos tienen reserva viva para la misma clase y no cambia nada", async () => {
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    const targetId = await createExAlumnoSinWellhub();
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const bookingDate = addDays(today, 3);
    const sourceBookingId = await insertBooking(app, {
      memberId: visitor.id,
      scheduleId,
      bookingDate,
      source: "wellhub",
    });
    const targetBookingId = await insertBooking(app, {
      memberId: targetId,
      scheduleId,
      bookingDate,
      source: "admin",
    });
    await insertAttendance(app, {
      memberId: visitor.id,
      branchId: BRANCH_ID,
      sessionDate: today,
      source: "wellhub",
    });

    const { statusCode, body } = await postMerge(visitor.id, targetId);

    expect(statusCode).toBe(409);
    expect((body as ErrorBody).message).toBe(
      "Las dos fichas tienen reserva para la misma clase el mismo día",
    );
    // Atomico: ni el gympass_id, ni las reservas, ni las visitas se movieron.
    expect((await getUser(visitor.id))?.gympassId).toBe(visitor.gympassId);
    expect((await getUser(visitor.id))?.deletedAt).toBeNull();
    expect((await getUser(targetId))?.gympassId).toBeNull();
    expect((await bookingsOf(visitor.id)).map((b) => b.id)).toEqual([
      sourceBookingId,
    ]);
    expect((await bookingsOf(targetId)).map((b) => b.id)).toEqual([
      targetBookingId,
    ]);
    const visits = await app.db
      .select({ id: schema.attendance.id })
      .from(schema.attendance)
      .where(
        and(
          tenantWhere(schema.attendance, TEMPLO_CTX),
          eq(schema.attendance.memberId, visitor.id),
        ),
      );
    expect(visits).toHaveLength(1);
    expect(await auditRowsFor(targetId)).toHaveLength(0);
  });

  it("una reserva muerta del destino no bloquea la unión", async () => {
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    const targetId = await createExAlumnoSinWellhub();
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const bookingDate = addDays(today, 3);
    const sourceBookingId = await insertBooking(app, {
      memberId: visitor.id,
      scheduleId,
      bookingDate,
      source: "wellhub",
    });
    await insertBooking(app, {
      memberId: targetId,
      scheduleId,
      bookingDate,
      status: "cancelado",
      source: "admin",
    });

    const { statusCode, body } = await postMerge(visitor.id, targetId);

    expect(statusCode).toBe(200);
    expect((body as MergeBody).ok).toBe(true);
    // La reserva viva del duplicado termino en el destino, sola para esa clase.
    const targetBookings = await bookingsOf(targetId);
    expect(targetBookings).toHaveLength(1);
    expect(targetBookings[0].id).toBe(sourceBookingId);
    expect(targetBookings[0].status).toBe("reservado");
    expect((await getUser(targetId))?.gympassId).toBe(visitor.gympassId);
  });

  it("la reserva Wellhub viva se mueve sin cancelarse", async () => {
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    const targetId = await createExAlumnoSinWellhub();
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const bookingId = await insertBooking(app, {
      memberId: visitor.id,
      scheduleId,
      bookingDate: addDays(today, 1),
      status: "reservado",
      source: "wellhub",
    });

    const { statusCode } = await postMerge(visitor.id, targetId);

    expect(statusCode).toBe(200);
    const moved = (await bookingsOf(targetId)).find((b) => b.id === bookingId);
    expect(moved).toBeDefined();
    expect(moved?.status).toBe("reservado");
    expect(moved?.cancelledAt).toBeNull();
    expect(await bookingsOf(visitor.id)).toHaveLength(0);
  });
});
