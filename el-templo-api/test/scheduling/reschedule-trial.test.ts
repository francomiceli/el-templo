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
import { trialFollowups } from "../../src/db/schema/trial-followups";
import { tenantWhere, tenantValues } from "../../src/modules/shared/tenant";
import { systemSettings } from "../../src/db/schema/system-settings";

// El gimnasio de los fixtures (El Templo = tenant 1).
const CTX = { tenantId: 1 };

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
        tenantId: CTX.tenantId,
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
      .where(and(tenantWhere(bookings, CTX), eq(bookings.id, bookingId)));
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
      .where(and(tenantWhere(users, CTX), eq(users.id, userId)));
    return {
      leadStatus: row.leadStatus,
      leadStatusSource: row.leadStatusSource,
    };
  }

  async function setLead(
    userId: number,
    leadStatus: "en_seguimiento" | "perdido" | "ganado",
    leadStatusSource: "auto" | "manual" | null,
  ): Promise<void> {
    await app.db
      .update(users)
      .set({ leadStatus, leadStatusSource })
      .where(and(tenantWhere(users, CTX), eq(users.id, userId)));
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

  // ─── Case 5 (WR-02/CR-01): un member convertido NO se pisa a 'en_seguimiento' ─

  it("rechaza (409) reprogramar la prueba de un convertido y deja 'ganado' intacto", async () => {
    const activity = await createActivity();
    const slotA = await createScheduleSlot(activity.id, 4, "10:00", "11:00");
    const slotB = await createScheduleSlot(activity.id, 4, "12:00", "13:00");
    const date = futureDate();

    const userId = await createPruebaUser();
    const oldBookingId = await seedTrialBooking(userId, slotA.id, date);
    // El lead ya convirtió: status='activo' + leadStatus='ganado'. Un convertido
    // sigue apareciendo en el diálogo de trials (listTrials no filtra por status
    // del user), así que reprogramarlo por UI llegaría al reset y pisaría su
    // 'ganado'. El guard de CR-01 debe rechazar ANTES de mutar nada.
    await app.db
      .update(users)
      .set({
        status: "activo",
        leadStatus: "ganado",
        leadStatusSource: "manual",
      })
      .where(and(tenantWhere(users, CTX), eq(users.id, userId)));

    const res = await app.inject({
      method: "POST",
      url: rescheduleUrl(oldBookingId),
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { scheduleId: slotB.id, date, branchId: testBranchId },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).message).toContain("prueba");

    // El lead sigue 'ganado' (no lo pisó a 'en_seguimiento'/'auto') y la booking
    // vieja NO se canceló (el guard corta antes de la transacción).
    const lead = await leadStatusOf(userId);
    expect(lead.leadStatus).toBe("ganado");
    expect(lead.leadStatusSource).toBe("manual");
    const oldRow = await bookingById(oldBookingId);
    expect(oldRow.status).toBe("reservado");
  });

  // ─── Cadencia de mensajes en Sesiones de Prueba (brief Nacho, 2026-09-26) ─

  async function followupOf(bookingId: number): Promise<{
    m1SentAt: Date | null;
    rescheduledFromBookingId: number | null;
  } | null> {
    const [row] = await app.db
      .select({
        m1SentAt: trialFollowups.m1SentAt,
        rescheduledFromBookingId: trialFollowups.rescheduledFromBookingId,
      })
      .from(trialFollowups)
      .where(
        and(
          tenantWhere(trialFollowups, CTX),
          eq(trialFollowups.bookingId, bookingId),
        ),
      );
    return row ?? null;
  }

  async function setMaxReschedules(n: number): Promise<void> {
    await app.db
      .insert(systemSettings)
      .values({
        settingKey: "trials.max_reschedules",
        settingValue: String(n),
      })
      .onDuplicateKeyUpdate({ set: { settingValue: String(n) } });
  }

  it("escribe el vínculo de reagenda en trial_followups en la MISMA tx (rescheduled_from_booking_id)", async () => {
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
    const newBookingId = JSON.parse(res.body).bookingId;

    const followup = await followupOf(newBookingId);
    expect(followup).not.toBeNull();
    expect(followup!.rescheduledFromBookingId).toBe(oldBookingId);
    expect(followup!.m1SentAt).toBeNull(); // arranca el ciclo desde cero.
  });

  it("respeta el límite de reagendas (trials.max_reschedules, default 2): la 3ra reagenda es 409", async () => {
    const activity = await createActivity();
    const slotA = await createScheduleSlot(activity.id, 4, "10:00", "11:00");
    const slotB = await createScheduleSlot(activity.id, 4, "12:00", "13:00");
    const slotC = await createScheduleSlot(activity.id, 4, "14:00", "15:00");
    const slotD = await createScheduleSlot(activity.id, 4, "16:00", "17:00");
    const date = futureDate();

    const userId = await createPruebaUser();
    const original = await seedTrialBooking(userId, slotA.id, date);

    // original → r1 (depth 1, permitido).
    const r1res = await app.inject({
      method: "POST",
      url: rescheduleUrl(original),
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { scheduleId: slotB.id, date, branchId: testBranchId },
    });
    expect(r1res.statusCode).toBe(200);
    const r1 = JSON.parse(r1res.body).bookingId;

    // r1 → r2 (depth 2, permitido: llega exactamente al límite default 2).
    const r2res = await app.inject({
      method: "POST",
      url: rescheduleUrl(r1),
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { scheduleId: slotC.id, date, branchId: testBranchId },
    });
    expect(r2res.statusCode).toBe(200);
    const r2 = JSON.parse(r2res.body).bookingId;

    // r2 → r3 (depth 3, EXCEDE el límite) → 409, sin mutar nada.
    const r3res = await app.inject({
      method: "POST",
      url: rescheduleUrl(r2),
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { scheduleId: slotD.id, date, branchId: testBranchId },
    });
    expect(r3res.statusCode).toBe(409);
    expect(JSON.parse(r3res.body).message).toContain("límite");

    // r2 sigue activa (el guard corta antes de la tx).
    const r2Row = await bookingById(r2);
    expect(r2Row.status).toBe("reservado");
  });

  it("el límite es parametrizable (trials.max_reschedules=1): la 2da reagenda ya es 409", async () => {
    await setMaxReschedules(1);
    const activity = await createActivity();
    const slotA = await createScheduleSlot(activity.id, 4, "10:00", "11:00");
    const slotB = await createScheduleSlot(activity.id, 4, "12:00", "13:00");
    const slotC = await createScheduleSlot(activity.id, 4, "14:00", "15:00");
    const date = futureDate();

    const userId = await createPruebaUser();
    const original = await seedTrialBooking(userId, slotA.id, date);

    const r1res = await app.inject({
      method: "POST",
      url: rescheduleUrl(original),
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { scheduleId: slotB.id, date, branchId: testBranchId },
    });
    expect(r1res.statusCode).toBe(200);
    const r1 = JSON.parse(r1res.body).bookingId;

    const r2res = await app.inject({
      method: "POST",
      url: rescheduleUrl(r1),
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { scheduleId: slotC.id, date, branchId: testBranchId },
    });
    expect(r2res.statusCode).toBe(409);

    await setMaxReschedules(2); // restaura el default para el resto de la suite.
  });

  it("anti-ciclo: reagendar de vuelta a una sesión ANCESTRA de la misma cadena es 409", async () => {
    const activity = await createActivity();
    const slotA = await createScheduleSlot(activity.id, 4, "10:00", "11:00");
    const slotB = await createScheduleSlot(activity.id, 4, "12:00", "13:00");
    const date = futureDate();

    const userId = await createPruebaUser();
    const original = await seedTrialBooking(userId, slotA.id, date);

    const r1res = await app.inject({
      method: "POST",
      url: rescheduleUrl(original),
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { scheduleId: slotB.id, date, branchId: testBranchId },
    });
    expect(r1res.statusCode).toBe(200);
    const r1 = JSON.parse(r1res.body).bookingId;

    // Reagendar r1 de vuelta al slot+fecha de `original` reactivaría ese mismo
    // booking (UNIQUE member+schedule+date) — pero `original` es ANCESTRO de la
    // cadena de r1, así que debe rechazarse (evita el ciclo original ⇄ r1).
    const cycleRes = await app.inject({
      method: "POST",
      url: rescheduleUrl(r1),
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { scheduleId: slotA.id, date, branchId: testBranchId },
    });
    expect(cycleRes.statusCode).toBe(409);
    expect(JSON.parse(cycleRes.body).message).toContain("cadena");

    // r1 sigue activa; `original` sigue cancelada (nada se mutó).
    expect((await bookingById(r1)).status).toBe("reservado");
    expect((await bookingById(original)).status).toBe("cancelado");
  });

  it("reactiva un booking cancelado NO relacionado, resetea su followup viejo y lo vincula a la cadena nueva", async () => {
    const activity = await createActivity();
    const slotX = await createScheduleSlot(activity.id, 4, "08:00", "09:00");
    const slotY = await createScheduleSlot(activity.id, 4, "12:00", "13:00");
    const date = futureDate();

    const userId = await createPruebaUser();
    // bookingX: sesión vieja y ajena, ya cancelada por otra vía, con mensajes
    // de un ciclo de vida anterior (nunca vinculada a ninguna reagenda).
    const bookingX = await seedTrialBooking(userId, slotX.id, date, "cancelado");
    await app.db.insert(trialFollowups).values(
      tenantValues(CTX, {
        bookingId: bookingX,
        m1SentAt: new Date(),
      }),
    );

    // bookingY: la sesión ACTUAL del alumno (otro turno).
    const bookingY = await seedTrialBooking(userId, slotY.id, date, "reservado");

    // Reagendar Y hacia el slot+fecha de X reactiva X (mismo member+schedule+
    // date+is_trial) — X NO es ancestro de la cadena de Y, así que no es un
    // ciclo: se reactiva, se resetean sus mensajes y se vincula a Y.
    const res = await app.inject({
      method: "POST",
      url: rescheduleUrl(bookingY),
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { scheduleId: slotX.id, date, branchId: testBranchId },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).bookingId).toBe(bookingX);

    const reactivated = await bookingById(bookingX);
    expect(reactivated.status).toBe("reservado");

    const followup = await followupOf(bookingX);
    expect(followup!.m1SentAt).toBeNull(); // reseteado.
    expect(followup!.rescheduledFromBookingId).toBe(bookingY);
  });
});
