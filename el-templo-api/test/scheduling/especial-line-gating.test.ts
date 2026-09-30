/**
 * Línea del pase especial (2026-09-29, yoga de Moreno) — enforcement por línea
 * en BookingService.reserve().
 *
 * Regla: un pase `especial` solo habilita las actividades especiales de SU
 * línea (`special_line`). NULL = "Actividades con Aura" (todo lo anterior a la
 * columna). Casos cubiertos:
 *
 *  (1) pase de Aura (línea NULL) reserva una clase de Yoga → 400 PASS_REQUIRED
 *      con el mensaje de la línea de la clase ("pase de Yoga").
 *  (2) pase de Yoga reserva una clase de Yoga → 201.
 *  (3) pase de Yoga reserva una clase de Aura → 400 PASS_REQUIRED
 *      ("pase de Actividades con Aura").
 *  (4) socio con AMBOS pases reserva Yoga y Aura el MISMO día → ambas 201
 *      (la regla diaria es por línea).
 *  (5) dos Yoga el mismo día → la segunda 409 (intra-línea se mantiene).
 *  (6) reservas pendientes: solo cuentan contra el saldo del pase de la MISMA
 *      línea (en ambos sentidos), y el tope de la propia línea sigue mordiendo.
 *  (7) la línea se compara sin distinguir mayúsculas ni espacios de borde
 *      ("yoga" / " Yoga " / "Yoga" son la misma línea).
 *  (8) la grilla semanal del member y el listado de mis reservas exponen
 *      `specialLine`.
 *
 * Molde: test/scheduling/especial-gating.test.ts (reloj fijo a un miércoles,
 * actividades/horarios por la API admin, planes/subs por inserción directa
 * para tunear budget/estado).
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
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

// `bookings`/`schedules`/`activities` son tablas strict del sentinel de
// tenancy: toda lectura directa de este archivo pasa por `tenantWhere`.
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

const ADMIN_URL = "/api/admin/scheduling";
const RESERVE_URL = "/api/members/scheduling/reserve";
const MEMBER_WEEKLY_URL = "/api/members/scheduling/weekly";
const MY_BOOKINGS_URL = "/api/members/scheduling/my-bookings";

// Semana pinneada (lunes) que contiene SAT_1.
const WEEK_START = "2026-03-09";

// "Ahora" = miércoles 2026-03-11. Todas las clases son sábados: la ventana
// extendida de los pases (D-06) las alcanza aunque estén a más de 2 días.
const SAT_1 = "2026-03-14";
const SAT_2 = "2026-03-21";
const SAT_3 = "2026-03-28";

describe("Línea del pase especial — gating por línea en reserve()", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let testBranchId: number;

  let auraPlanId: number;
  let yogaPlanId: number;
  let auraScheduleId: number;
  let yogaScheduleId: number;
  let yoga2ScheduleId: number;

  beforeAll(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-03-11T10:00:00Z")); // miércoles

    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    const [branch] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.isVirtual, false))
      .limit(1);
    testBranchId = branch.id;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);

    auraPlanId = await insertEspecialPlan("Aura — Externo", null);
    yogaPlanId = await insertEspecialPlan("Yoga — Clase suelta", "Yoga");

    // Actividades por la API admin (ejercita el wiring de specialLine).
    auraScheduleId = await createActivityAndSchedule(
      "Verticales",
      { isSpecial: true },
      "10:00",
      "11:00",
    );
    yogaScheduleId = await createActivityAndSchedule(
      "Yoga regenerativo",
      { isSpecial: true, specialLine: "Yoga" },
      "12:00",
      "13:00",
    );
    yoga2ScheduleId = await createActivityAndSchedule(
      "Yoga para calisténicos",
      { isSpecial: true, specialLine: "Yoga" },
      "16:00",
      "17:00",
    );
  });

  /** Plan especial por DB (bypass de assertPlanInvariants), con línea y budget. */
  async function insertEspecialPlan(
    name: string,
    specialLine: string | null,
  ): Promise<number> {
    const res = await app.db.insert(schema.subscriptionPlans).values({
      name,
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "especial",
      priceRegular: 20000,
      priceZero: 20000,
      durationDays: 30,
      classesPerWeek: null,
      monthlyClassBudget: 2,
      specialLine,
    });
    return Number(res[0].insertId);
  }

  /** Crea una actividad (con flags) + un horario de sábado y devuelve el scheduleId. */
  async function createActivityAndSchedule(
    name: string,
    activity: { isSpecial: boolean; specialLine?: string | null },
    startTime: string,
    endTime: string,
  ): Promise<number> {
    const actRes = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name, ...activity },
    });
    expect(actRes.statusCode).toBe(201);
    const activityId = JSON.parse(actRes.body).id as number;

    const schRes = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/schedules`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        branchId: testBranchId,
        activityId,
        dayOfWeek: 6, // sábado
        startTime,
        endTime,
      },
    });
    expect(schRes.statusCode).toBe(201);
    return JSON.parse(schRes.body).id as number;
  }

  async function createMemberToken(
    email: string,
  ): Promise<{ id: number; token: string }> {
    const result = await registerUser(app, {
      email,
      password: "pass123456",
      branchId: testBranchId,
    });
    const id = (result.user as { id: number }).id;
    const token = await getAuthToken(app, email, "pass123456");
    return { id, token };
  }

  /** Inserta una sub activa del pase indicado con el saldo dado. */
  async function insertSub(
    userId: number,
    planId: number,
    classesRemaining: number | null,
  ): Promise<void> {
    await app.db.insert(schema.subscriptions).values({
      userId,
      planId,
      branchId: testBranchId,
      status: "active",
      startDate: "2026-02-14",
      endDate: "2026-04-15",
      pricePaid: 20000,
      priceTypeApplied: "regular",
      classesRemaining,
    });
  }

  async function reserve(
    token: string,
    scheduleId: number,
    date: string,
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const res = await app.inject({
      method: "POST",
      url: RESERVE_URL,
      headers: { authorization: `Bearer ${token}` },
      payload: { scheduleId, date },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  // ── (1) pase de Aura NO habilita Yoga ───────────────────────────────────
  it("(1) socio con SOLO pase de Aura reserva una clase de Yoga → 400 PASS_REQUIRED (pase de Yoga)", async () => {
    const { id, token } = await createMemberToken("line-1@test.com");
    await insertSub(id, auraPlanId, 2);

    const { statusCode, body } = await reserve(token, yogaScheduleId, SAT_1);
    expect(statusCode).toBe(400);
    expect(body.code).toBe("PASS_REQUIRED");
    expect(String(body.message)).toMatch(/pase de Yoga/);

    // Nada quedó reservado.
    const rows = await app.db
      .select({ id: schema.bookings.id })
      .from(schema.bookings)
      .where(
        and(
          tenantWhere(schema.bookings, TEMPLO_CTX),
          eq(schema.bookings.memberId, id),
        ),
      );
    expect(rows).toHaveLength(0);
  });

  // ── (2) pase de Yoga habilita Yoga ──────────────────────────────────────
  it("(2) socio con pase de Yoga reserva una clase de Yoga → 201", async () => {
    const { id, token } = await createMemberToken("line-2@test.com");
    await insertSub(id, yogaPlanId, 2);

    const { statusCode, body } = await reserve(token, yogaScheduleId, SAT_1);
    expect(statusCode).toBe(201);
    expect(body.status).toBe("reservado");
    expect(body.code).toBeUndefined();
  });

  // ── (3) pase de Yoga NO habilita Aura ───────────────────────────────────
  it("(3) socio con SOLO pase de Yoga reserva una clase de Aura → 400 PASS_REQUIRED (pase de Actividades con Aura)", async () => {
    const { id, token } = await createMemberToken("line-3@test.com");
    await insertSub(id, yogaPlanId, 2);

    const { statusCode, body } = await reserve(token, auraScheduleId, SAT_1);
    expect(statusCode).toBe(400);
    expect(body.code).toBe("PASS_REQUIRED");
    expect(String(body.message)).toMatch(/pase de Actividades con Aura/);
  });

  // ── (4) ambos pases: Yoga y Aura el mismo día ───────────────────────────
  it("(4) socio con AMBOS pases reserva Yoga y Aura el MISMO día → ambas 201", async () => {
    const { id, token } = await createMemberToken("line-4@test.com");
    await insertSub(id, auraPlanId, 2);
    await insertSub(id, yogaPlanId, 2);

    const rAura = await reserve(token, auraScheduleId, SAT_1);
    expect(rAura.statusCode).toBe(201);
    const rYoga = await reserve(token, yogaScheduleId, SAT_1);
    expect(rYoga.statusCode).toBe(201);

    // Y en orden inverso, otro sábado.
    const rYoga2 = await reserve(token, yogaScheduleId, SAT_2);
    expect(rYoga2.statusCode).toBe(201);
    const rAura2 = await reserve(token, auraScheduleId, SAT_2);
    expect(rAura2.statusCode).toBe(201);
  });

  // ── (5) intra-línea: dos Yoga el mismo día ──────────────────────────────
  it("(5) dos clases de Yoga el mismo día → la segunda 409", async () => {
    const { id, token } = await createMemberToken("line-5@test.com");
    await insertSub(id, yogaPlanId, 2);

    const r1 = await reserve(token, yogaScheduleId, SAT_1);
    expect(r1.statusCode).toBe(201);
    const r2 = await reserve(token, yoga2ScheduleId, SAT_1);
    expect(r2.statusCode).toBe(409);
  });

  it("(5b) dos clases de Aura el mismo día siguen bloqueadas (409) aunque tenga pase de Yoga", async () => {
    const auraSecondId = await createActivityAndSchedule(
      "Acrobacias",
      { isSpecial: true },
      "14:00",
      "15:00",
    );
    const { id, token } = await createMemberToken("line-5b@test.com");
    await insertSub(id, auraPlanId, 2);
    await insertSub(id, yogaPlanId, 2);

    expect((await reserve(token, auraScheduleId, SAT_1)).statusCode).toBe(201);
    expect((await reserve(token, auraSecondId, SAT_1)).statusCode).toBe(409);
  });

  // ── (6) reservas pendientes: solo la misma línea compromete el saldo ────
  it("(6a) pase de Yoga con saldo 1 y una reserva pendiente de AURA → todavía permite reservar Yoga", async () => {
    const { id, token } = await createMemberToken("line-6a@test.com");
    await insertSub(id, auraPlanId, 2);
    await insertSub(id, yogaPlanId, 1);

    // Reserva pendiente de Aura (no compromete el saldo del pase de Yoga).
    expect((await reserve(token, auraScheduleId, SAT_1)).statusCode).toBe(201);

    const rYoga = await reserve(token, yogaScheduleId, SAT_2);
    expect(rYoga.statusCode).toBe(201);

    // Ahora sí: 1 Yoga pendiente >= saldo 1 → la siguiente Yoga queda bloqueada
    // por saldo comprometido (la regla sigue mordiendo dentro de la línea).
    const rYoga2 = await reserve(token, yogaScheduleId, SAT_3);
    expect(rYoga2.statusCode).toBe(400);
    expect(String(rYoga2.body.message)).toMatch(/comprometidas|liberar cupo/i);
  });

  it("(6b) pase de Aura con saldo 1 y una reserva pendiente de YOGA → todavía permite reservar Aura", async () => {
    const { id, token } = await createMemberToken("line-6b@test.com");
    await insertSub(id, auraPlanId, 1);
    await insertSub(id, yogaPlanId, 2);

    expect((await reserve(token, yogaScheduleId, SAT_1)).statusCode).toBe(201);

    const rAura = await reserve(token, auraScheduleId, SAT_2);
    expect(rAura.statusCode).toBe(201);

    const rAura2 = await reserve(token, auraScheduleId, SAT_3);
    expect(rAura2.statusCode).toBe(400);
    expect(String(rAura2.body.message)).toMatch(/comprometidas|liberar cupo/i);
  });

  // ── (7) comparación de la línea: sin mayúsculas ni espacios de borde ────
  it("(7) la línea se compara sin distinguir mayúsculas/espacios: actividad ' yoga ' con pase 'Yoga' → 201", async () => {
    const sloppyId = await createActivityAndSchedule(
      "Yoga suave",
      { isSpecial: true, specialLine: "  yoga " },
      "18:00",
      "19:00",
    );
    // La API recorta el texto al persistir.
    const [act] = await app.db
      .select({ specialLine: schema.activities.specialLine })
      .from(schema.schedules)
      .innerJoin(
        schema.activities,
        eq(schema.activities.id, schema.schedules.activityId),
      )
      .where(
        and(
          tenantWhere(schema.schedules, TEMPLO_CTX),
          eq(schema.schedules.id, sloppyId),
        ),
      );
    expect(act.specialLine).toBe("yoga");

    const { id, token } = await createMemberToken("line-7@test.com");
    await insertSub(id, yogaPlanId, 2); // línea "Yoga"

    const { statusCode } = await reserve(token, sloppyId, SAT_1);
    expect(statusCode).toBe(201);
  });

  // ── (8) la línea viaja en la grilla y en mis reservas ───────────────────
  it("(8) grilla semanal y /my-bookings exponen specialLine (Yoga → 'Yoga', Aura → null)", async () => {
    const { id, token } = await createMemberToken("line-8@test.com");
    await insertSub(id, auraPlanId, 2);
    await insertSub(id, yogaPlanId, 2);

    const grid = await app.inject({
      method: "GET",
      url: `${MEMBER_WEEKLY_URL}?weekStart=${WEEK_START}&branchId=${testBranchId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(grid.statusCode).toBe(200);
    const slots = (
      JSON.parse(grid.body) as {
        slots: Array<{
          id: number;
          isSpecial: boolean;
          specialLine: string | null;
        }>;
      }
    ).slots;
    const yogaSlot = slots.find((s) => s.id === yogaScheduleId);
    const auraSlot = slots.find((s) => s.id === auraScheduleId);
    expect(yogaSlot?.isSpecial).toBe(true);
    expect(yogaSlot?.specialLine).toBe("Yoga");
    expect(auraSlot?.isSpecial).toBe(true);
    expect(auraSlot?.specialLine).toBeNull();

    expect((await reserve(token, yogaScheduleId, SAT_1)).statusCode).toBe(201);
    expect((await reserve(token, auraScheduleId, SAT_1)).statusCode).toBe(201);

    const mine = await app.inject({
      method: "GET",
      url: `${MY_BOOKINGS_URL}?weekStart=${WEEK_START}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(mine.statusCode).toBe(200);
    const bookings = (
      JSON.parse(mine.body) as {
        bookings: Array<{ scheduleId: number; specialLine: string | null }>;
      }
    ).bookings;
    expect(
      bookings.find((b) => b.scheduleId === yogaScheduleId)?.specialLine,
    ).toBe("Yoga");
    expect(
      bookings.find((b) => b.scheduleId === auraScheduleId)?.specialLine,
    ).toBeNull();
  });
});
