/**
 * Fase 204 D-19 + D-18 #5/#6 — presente a mano en reservas Wellhub.
 *
 * El staff puede marcar presente a mano a alguien que reservó por Wellhub:
 *   - queda como visita Wellhub "a mano" (`attendance.source = 'wellhub_manual'`),
 *   - la reserva pasa a 'confirmado' (el job de no-show no la toca),
 *   - NO toca el plan: sin AURA, sin descuento de clases, sin completed_sessions.
 * Deshacerla borra la fila y devuelve la reserva a 'reservado' sin tocar el plan.
 * Una visita ya validada por Wellhub ('wellhub') no se deshace (409).
 * Si el usuario después valida en la app de Wellhub el mismo día, la fila a mano
 * se promueve a 'wellhub' (no se duplica).
 *
 * Fechas siempre relativas a "hoy" en la tz de la sede; el job de no-show usa
 * una reserva de hace dos días (retroactivo, igual que el resto de la fase).
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { runMarkNoShows } from "../../src/jobs/mark-no-shows";
import {
  createTestApp,
  createTestPlan,
  cleanAllTestData,
  dateOffsetStr,
  getAuthToken,
} from "../helpers";
import {
  TEMPLO_CTX,
  WELLHUB_TEST_SECRET,
  branchToday,
  checkinPayload,
  createWellhubSocioActivo,
  createWellhubVisitor,
  insertActivityWithSchedule,
  insertAttendance,
  insertBooking,
  postWellhubWebhook,
  signWellhub,
  stubValidateFetch,
  uniqueGymId,
} from "../fixtures/wellhub-personas";

const BRANCH_ID = 1;

interface CheckInBody {
  attendance: { id: number; source: string };
  warnings: string[];
}

interface RemoveBody {
  removed?: boolean;
  error?: string;
  message?: string;
}

describe("Fase 204 D-19: presente a mano en reservas Wellhub", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let today: string;
  let planId: number;
  let gymId: number;
  let originalGymId: number | null;

  beforeAll(async () => {
    process.env.WELLHUB_API_KEY = "test-api-key";
    process.env.WELLHUB_WEBHOOK_SECRET = WELLHUB_TEST_SECRET;

    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    // La sede 1 se mapea a un gym id de Wellhub único para el test del webhook.
    const [branch] = await app.db
      .select({ wellhubGymId: schema.branches.wellhubGymId })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, TEMPLO_CTX),
          eq(schema.branches.id, BRANCH_ID),
        ),
      );
    originalGymId = branch?.wellhubGymId ?? null;
    gymId = uniqueGymId();
    await app.db
      .update(schema.branches)
      .set({ wellhubGymId: gymId })
      .where(
        and(
          tenantWhere(schema.branches, TEMPLO_CTX),
          eq(schema.branches.id, BRANCH_ID),
        ),
      );
  });

  afterAll(async () => {
    delete process.env.WELLHUB_API_KEY;
    delete process.env.WELLHUB_WEBHOOK_SECRET;
    vi.unstubAllGlobals();
    await cleanAllTestData(app);
    await app.db
      .update(schema.branches)
      .set({ wellhubGymId: originalGymId })
      .where(
        and(
          tenantWhere(schema.branches, TEMPLO_CTX),
          eq(schema.branches.id, BRANCH_ID),
        ),
      );
    await app.close();
  });

  beforeEach(async () => {
    vi.unstubAllGlobals();
    await cleanAllTestData(app);
    today = await branchToday(app, BRANCH_ID);
    const plan = await createTestPlan(app, adminToken, {
      name: `Plan 204-04 ${Date.now().toString(36)}`,
      classesPerWeek: 3,
      durationDays: 30,
    });
    planId = plan.id;
  });

  // ─── Helpers ───────────────────────────────────────────────────────────────

  async function coachCheckIn(
    scheduleId: number,
    memberId: number,
    date: string = today,
  ) {
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/attendance/slot/${scheduleId}/${date}/check-in`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { memberId },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) as CheckInBody };
  }

  async function removeCheckIn(attendanceId: number) {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/admin/attendance/${attendanceId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) as RemoveBody };
  }

  async function attendanceRows(memberId: number) {
    return app.db
      .select({
        id: schema.attendance.id,
        source: schema.attendance.source,
        scheduleId: schema.attendance.scheduleId,
        checkedInAt: schema.attendance.checkedInAt,
      })
      .from(schema.attendance)
      .where(
        and(
          tenantWhere(schema.attendance, TEMPLO_CTX),
          eq(schema.attendance.memberId, memberId),
        ),
      );
  }

  async function bookingStatus(bookingId: number): Promise<string | undefined> {
    const [row] = await app.db
      .select({ status: schema.bookings.status })
      .from(schema.bookings)
      .where(
        and(
          tenantWhere(schema.bookings, TEMPLO_CTX),
          eq(schema.bookings.id, bookingId),
        ),
      );
    return row?.status;
  }

  async function remaining(subId: number): Promise<number | null> {
    const [row] = await app.db
      .select({ cr: schema.subscriptions.classesRemaining })
      .from(schema.subscriptions)
      .where(
        and(
          tenantWhere(schema.subscriptions, TEMPLO_CTX),
          eq(schema.subscriptions.id, subId),
        ),
      );
    return row?.cr ?? null;
  }

  async function auraAttendanceRows(memberId: number): Promise<number> {
    const rows = await app.db
      .select({ id: schema.auraTransactions.id })
      .from(schema.auraTransactions)
      .where(
        and(
          tenantWhere(schema.auraTransactions, TEMPLO_CTX),
          eq(schema.auraTransactions.userId, memberId),
        ),
      );
    return rows.length;
  }

  async function completedSessionsCount(memberId: number): Promise<number> {
    const rows = await app.db
      .select({ id: schema.completedSessions.id })
      .from(schema.completedSessions)
      .where(
        and(
          tenantWhere(schema.completedSessions, TEMPLO_CTX),
          eq(schema.completedSessions.userId, memberId),
        ),
      );
    return rows.length;
  }

  // ─── Tests ─────────────────────────────────────────────────────────────────

  it("staff marca presente a un visitante Wellhub: queda wellhub_manual y la reserva confirmada", async () => {
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const bookingId = await insertBooking(app, {
      memberId: visitor.id,
      scheduleId,
      bookingDate: today,
      status: "reservado",
      source: "wellhub",
    });

    const res = await coachCheckIn(scheduleId, visitor.id);
    expect(res.statusCode).toBe(201);
    expect(res.body.attendance.source).toBe("wellhub_manual");

    const rows = await attendanceRows(visitor.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("wellhub_manual");
    expect(rows[0].scheduleId).toBe(scheduleId);
    expect(await bookingStatus(bookingId)).toBe("confirmado");
    expect(await auraAttendanceRows(visitor.id)).toBe(0);
  });

  it("presente a mano de un socio en reserva Wellhub: no descuenta clases, no da AURA ni completed_sessions", async () => {
    const socio = await createWellhubSocioActivo(app, adminToken, { planId });
    const antes = await remaining(socio.subscriptionId);
    expect(antes).not.toBeNull();

    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const bookingId = await insertBooking(app, {
      memberId: socio.id,
      scheduleId,
      bookingDate: today,
      status: "reservado",
      source: "wellhub",
    });

    const res = await coachCheckIn(scheduleId, socio.id);
    expect(res.statusCode).toBe(201);

    const rows = await attendanceRows(socio.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("wellhub_manual");
    expect(await bookingStatus(bookingId)).toBe("confirmado");

    expect(await remaining(socio.subscriptionId)).toBe(antes);
    expect(await auraAttendanceRows(socio.id)).toBe(0);
    expect(await completedSessionsCount(socio.id)).toBe(0);
  });

  it("la reserva Wellhub marcada a mano no pasa a no_show", async () => {
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const pastDate = dateOffsetStr(-2);
    const marcada = await insertBooking(app, {
      memberId: visitor.id,
      scheduleId,
      bookingDate: pastDate,
      status: "reservado",
      source: "wellhub",
    });
    // Control: una reserva Wellhub sin marcar del mismo día SÍ pasa a no_show,
    // así el test no pasa porque el job no corrió.
    const otroVisitor = await createWellhubVisitor(app, {
      branchId: BRANCH_ID,
    });
    const sinMarcar = await insertBooking(app, {
      memberId: otroVisitor.id,
      scheduleId,
      bookingDate: pastDate,
      status: "reservado",
      source: "wellhub",
    });

    const res = await coachCheckIn(scheduleId, visitor.id, pastDate);
    expect(res.statusCode).toBe(201);
    expect(await bookingStatus(marcada)).toBe("confirmado");

    await runMarkNoShows(app.db);

    expect(await bookingStatus(marcada)).toBe("confirmado");
    expect(await bookingStatus(sinMarcar)).toBe("no_show");
  });

  it("asistencia propia del día no bloquea el presente a mano Wellhub", async () => {
    const socio = await createWellhubSocioActivo(app, adminToken, { planId });
    // Asistencia propia (QR) de hoy, sin horario => cuenta como regular.
    await insertAttendance(app, {
      memberId: socio.id,
      branchId: BRANCH_ID,
      sessionDate: today,
      source: "qr",
    });
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const bookingId = await insertBooking(app, {
      memberId: socio.id,
      scheduleId,
      bookingDate: today,
      status: "reservado",
      source: "wellhub",
    });

    const res = await coachCheckIn(scheduleId, socio.id);
    expect(res.statusCode).toBe(201);

    const rows = await attendanceRows(socio.id);
    expect(rows.map((r) => r.source).sort()).toEqual(["qr", "wellhub_manual"]);
    expect(await bookingStatus(bookingId)).toBe("confirmado");
  });

  it("deshacer un wellhub_manual borra la fila y vuelve la reserva a reservado sin tocar el plan", async () => {
    const socio = await createWellhubSocioActivo(app, adminToken, { planId });
    const antes = await remaining(socio.subscriptionId);
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const bookingId = await insertBooking(app, {
      memberId: socio.id,
      scheduleId,
      bookingDate: today,
      status: "reservado",
      source: "wellhub",
    });

    const marcado = await coachCheckIn(scheduleId, socio.id);
    expect(marcado.statusCode).toBe(201);
    expect(await bookingStatus(bookingId)).toBe("confirmado");

    const undo = await removeCheckIn(marcado.body.attendance.id);
    expect(undo.statusCode).toBe(200);
    expect(undo.body.removed).toBe(true);

    expect(await attendanceRows(socio.id)).toHaveLength(0);
    expect(await bookingStatus(bookingId)).toBe("reservado");
    expect(await remaining(socio.subscriptionId)).toBe(antes);
    expect(await auraAttendanceRows(socio.id)).toBe(0);
  });

  it("deshacer una visita validada por Wellhub responde 409", async () => {
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const bookingId = await insertBooking(app, {
      memberId: visitor.id,
      scheduleId,
      bookingDate: today,
      status: "confirmado",
      source: "wellhub",
    });
    const attendanceId = await insertAttendance(app, {
      memberId: visitor.id,
      branchId: BRANCH_ID,
      scheduleId,
      sessionDate: today,
      source: "wellhub",
    });

    const undo = await removeCheckIn(attendanceId);
    expect(undo.statusCode).toBe(409);
    expect(JSON.stringify(undo.body)).toContain(
      "Esta visita la validó Wellhub y no se puede deshacer desde acá",
    );

    const rows = await attendanceRows(visitor.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("wellhub");
    expect(await bookingStatus(bookingId)).toBe("confirmado");
  });

  it("si después valida en Wellhub, la visita a mano pasa a validada sin duplicarse", async () => {
    const visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    const { scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    });
    const bookingId = await insertBooking(app, {
      memberId: visitor.id,
      scheduleId,
      bookingDate: today,
      status: "reservado",
      source: "wellhub",
    });

    const marcado = await coachCheckIn(scheduleId, visitor.id);
    expect(marcado.statusCode).toBe(201);
    const [antes] = await attendanceRows(visitor.id);
    expect(antes.source).toBe("wellhub_manual");

    const fetchStub = stubValidateFetch();
    const raw = checkinPayload({ token: visitor.gympassId, gymId });
    const res = await postWellhubWebhook(app, raw, signWellhub(raw));
    expect(res.statusCode).toBe(200);
    // Se llamó a la validación facturable de Wellhub.
    expect(fetchStub.calls.length).toBeGreaterThanOrEqual(1);

    const rows = await attendanceRows(visitor.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(antes.id);
    expect(rows[0].source).toBe("wellhub");
    expect(rows[0].checkedInAt.getTime()).toBe(antes.checkedInAt.getTime());
    expect(await bookingStatus(bookingId)).toBe("confirmado");
  });
});
