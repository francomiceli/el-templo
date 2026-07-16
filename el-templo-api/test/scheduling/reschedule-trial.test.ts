/**
 * Fase 164-01 (REPRO-01, D-01/D-02) — tests de integración de la acción
 * admin "Reprogramar" de una sesión de prueba.
 *
 *   POST /api/admin/scheduling/trials/:bookingId/reschedule
 *   body { scheduleId, date, branchId } → { bookingId }
 *
 * Corre contra la DB real eltemplo_test. Cubre los 4 casos del plan:
 *   1. Reprograma en una tx: la booking vieja queda cancelada y la nueva
 *      activa (ambas is_trial).
 *   2. Dispara el reset Perdido → En seguimiento con source 'auto' (se siembra
 *      el lead como perdido/manual — el caso más exigente, como 163-03).
 *   3. Respeta las validaciones de slot: slot inexistente → 404, cross-branch
 *      (schedule de otra sede) → 409.
 *   4. NO tropieza con la regla una-prueba-por-vida: reprogramar dos veces
 *      seguidas funciona (la vieja se cancela dentro de la misma tx).
 *
 * Estructura tomada de trials.test.ts (setup app + adminToken + helpers de
 * slot/prueba) y de expire-lost-leads.test.ts (seed directo de booking + lead,
 * leadStatusOf). El suite completo NO se corre localmente (regla del repo):
 *   pnpm vitest run test/scheduling/reschedule-trial.test.ts
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
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { bookings } from "../../src/db/schema/bookings";
import { users } from "../../src/db/schema/users";
import { branches } from "../../src/db/schema/branches";

const ADMIN_URL = "/api/admin/scheduling";
const TRIALS_URL = `${ADMIN_URL}/trials`;
const ADMIN_MEMBERS_URL = "/api/admin/members";

const rescheduleUrl = (bookingId: number): string =>
  `${TRIALS_URL}/${bookingId}/reschedule`;

describe("Reschedule Trial API (Fase 164-01, REPRO-01)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let testBranchId: number;

  beforeAll(async () => {
    // Wednesday 10:00 UTC — mid-week so the future-Thursday slots land on valid
    // future dates (mirrors trials.test.ts).
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-03-11T10:00:00Z"));

    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    const [branch] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.isVirtual, false));
    testBranchId = branch.id;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  // ─── Helpers ────────────────────────────────────────────────────────────

  async function createActivity(name = "Calistenia"): Promise<{ id: number }> {
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name, description: "Clase grupal" },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  }

  async function createScheduleSlot(
    activityId: number,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    branchId?: number,
  ): Promise<{ id: number }> {
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/schedules`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        branchId: branchId ?? testBranchId,
        activityId,
        dayOfWeek,
        startTime,
        endTime,
      },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  }

  function getDateForDayOfWeek(dayOfWeek: number): string {
    const now = new Date();
    const currentDay = now.getDay();
    const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    const target = new Date(monday);
    target.setDate(monday.getDate() + (dayOfWeek - 1));
    return target.toISOString().split("T")[0];
  }

  /** Thursday of the pinned week — a reliably valid future date. */
  function futureDate(): string {
    return getDateForDayOfWeek(4);
  }

  let pruebaCounter = 0;
  async function createPruebaUser(
    overrides: Partial<{ branchId: number }> = {},
  ): Promise<number> {
    pruebaCounter += 1;
    const seq = String(pruebaCounter).padStart(4, "0");
    const stamp = `${Date.now() % 100000}${seq}`;
    const res = await app.inject({
      method: "POST",
      url: ADMIN_MEMBERS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        email: `prueba${stamp}@test.com`,
        firstName: "Trial",
        lastName: `User${seq}`,
        phone: `+549115555${seq}`,
        dni: `TR${stamp}`,
        branchId: overrides.branchId ?? testBranchId,
      },
    });
    if (res.statusCode !== 201) {
      throw new Error(`createPruebaUser failed: ${res.statusCode} ${res.body}`);
    }
    const body = JSON.parse(res.body) as { id: number; status: string };
    expect(body.status).toBe("prueba");
    return body.id;
  }

  /** Seed the OLD trial booking directly (like expire-lost-leads seedTrialBooking). */
  async function seedTrialBooking(
    userId: number,
    scheduleId: number,
    date: string,
    status: "reservado" | "confirmado" | "cancelado" | "no_show" = "reservado",
  ): Promise<number> {
    const [row] = await app.db
      .insert(bookings)
      .values({
        memberId: userId,
        scheduleId,
        bookingDate: date,
        status,
        isTrial: true,
      })
      .$returningId();
    return row.id;
  }

  async function bookingById(bookingId: number): Promise<{
    status: string;
    isTrial: boolean;
    scheduleId: number;
    bookingDate: string;
  }> {
    const [row] = await app.db
      .select({
        status: bookings.status,
        isTrial: bookings.isTrial,
        scheduleId: bookings.scheduleId,
        bookingDate: bookings.bookingDate,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId));
    return { ...row, isTrial: Boolean(row.isTrial) };
  }

  async function leadStatusOf(
    userId: number,
  ): Promise<{ leadStatus: string | null; leadStatusSource: string | null }> {
    const [row] = await app.db
      .select({
        leadStatus: users.leadStatus,
        leadStatusSource: users.leadStatusSource,
      })
      .from(users)
      .where(eq(users.id, userId));
    return { leadStatus: row.leadStatus, leadStatusSource: row.leadStatusSource };
  }

  async function setLead(
    userId: number,
    leadStatus: "en_seguimiento" | "perdido" | "ganado",
    leadStatusSource: "auto" | "manual" | null,
  ): Promise<void> {
    await app.db
      .update(users)
      .set({ leadStatus, leadStatusSource })
      .where(eq(users.id, userId));
  }

  // ─── Case 1: atomic move (old cancelled + new active) ────────────────────

  it("reprograma en una tx: la booking vieja queda cancelada y la nueva activa", async () => {
    const activity = await createActivity();
    const slotA = await createScheduleSlot(activity.id, 4, "10:00", "11:00");
    const slotB = await createScheduleSlot(activity.id, 4, "12:00", "13:00");
    const date = futureDate();

    const userId = await createPruebaUser();
    const oldBookingId = await seedTrialBooking(userId, slotA.id, date);

    const res = await app.inject({
      method: "POST",
      url: rescheduleUrl(oldBookingId),
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { scheduleId: slotB.id, date, branchId: testBranchId },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.bookingId).toBeTruthy();
    expect(body.bookingId).not.toBe(oldBookingId);

    const oldRow = await bookingById(oldBookingId);
    expect(oldRow.status).toBe("cancelado");
    expect(oldRow.isTrial).toBe(true);

    const newRow = await bookingById(body.bookingId);
    expect(newRow.status).toBe("reservado");
    expect(newRow.isTrial).toBe(true);
    expect(newRow.scheduleId).toBe(slotB.id);
    expect(newRow.bookingDate).toBe(date);
  });

  // ─── Case 2: fires the Perdido → En seguimiento reset (source auto) ───────

  it("dispara el reset Perdido → En seguimiento con source 'auto' (pisa un manual)", async () => {
    const activity = await createActivity();
    const slotA = await createScheduleSlot(activity.id, 4, "10:00", "11:00");
    const slotB = await createScheduleSlot(activity.id, 4, "12:00", "13:00");
    const date = futureDate();

    const userId = await createPruebaUser();
    const oldBookingId = await seedTrialBooking(userId, slotA.id, date);
    // Caso más exigente: el lead está Perdido y fue puesto a mano.
    await setLead(userId, "perdido", "manual");

    const res = await app.inject({
      method: "POST",
      url: rescheduleUrl(oldBookingId),
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { scheduleId: slotB.id, date, branchId: testBranchId },
    });
    expect(res.statusCode).toBe(200);

    const lead = await leadStatusOf(userId);
    expect(lead.leadStatus).toBe("en_seguimiento");
    expect(lead.leadStatusSource).toBe("auto");
  });

  // ─── Case 3a: slot inexistente → 404 ─────────────────────────────────────

  it("devuelve 404 si el horario nuevo no existe", async () => {
    const activity = await createActivity();
    const slotA = await createScheduleSlot(activity.id, 4, "10:00", "11:00");
    const date = futureDate();

    const userId = await createPruebaUser();
    const oldBookingId = await seedTrialBooking(userId, slotA.id, date);

    const res = await app.inject({
      method: "POST",
      url: rescheduleUrl(oldBookingId),
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { scheduleId: 999999, date, branchId: testBranchId },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).message).toContain("Horario");
  });

  // ─── Case 3b: schedule de otra sede → 409 ────────────────────────────────

  it("devuelve 409 si el horario nuevo es de otra sede (cross-branch)", async () => {
    const [otherBranch] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.isVirtual, false), sql`id != ${testBranchId}`))
      .limit(1);
    expect(otherBranch).toBeTruthy();

    const activity = await createActivity();
    const slotA = await createScheduleSlot(activity.id, 4, "10:00", "11:00");
    const slotOther = await createScheduleSlot(
      activity.id,
      4,
      "12:00",
      "13:00",
      otherBranch.id,
    );
    const date = futureDate();

    // El alumno vive en testBranch; el slot nuevo está en otherBranch.
    const userId = await createPruebaUser();
    const oldBookingId = await seedTrialBooking(userId, slotA.id, date);

    const res = await app.inject({
      method: "POST",
      url: rescheduleUrl(oldBookingId),
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { scheduleId: slotOther.id, date, branchId: otherBranch.id },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).message).toContain("sede");
  });

  // ─── Case 4: no tropieza con la regla una-prueba-por-vida ────────────────

  it("permite reprogramar dos veces seguidas (la vieja se cancela in-tx)", async () => {
    const activity = await createActivity();
    const slotA = await createScheduleSlot(activity.id, 4, "10:00", "11:00");
    const slotB = await createScheduleSlot(activity.id, 4, "12:00", "13:00");
    const slotC = await createScheduleSlot(activity.id, 4, "14:00", "15:00");
    const date = futureDate();

    const userId = await createPruebaUser();
    const oldBookingId = await seedTrialBooking(userId, slotA.id, date);

    const first = await app.inject({
      method: "POST",
      url: rescheduleUrl(oldBookingId),
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { scheduleId: slotB.id, date, branchId: testBranchId },
    });
    expect(first.statusCode).toBe(200);
    const firstBookingId = JSON.parse(first.body).bookingId;

    const second = await app.inject({
      method: "POST",
      url: rescheduleUrl(firstBookingId),
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { scheduleId: slotC.id, date, branchId: testBranchId },
    });
    expect(second.statusCode).toBe(200);
    const secondBookingId = JSON.parse(second.body).bookingId;

    // El de la primera reprogramación quedó cancelado; el de la segunda, activo.
    expect((await bookingById(firstBookingId)).status).toBe("cancelado");
    const finalRow = await bookingById(secondBookingId);
    expect(finalRow.status).toBe("reservado");
    expect(finalRow.scheduleId).toBe(slotC.id);
  });
});
