/**
 * Clase de prueba gratis de un pase especial (2026-09-29, yoga de Moreno).
 *
 *   POST /api/members/scheduling/especial-trial  { scheduleId, date }
 *   GET  /api/members/subscription/me/especial-pass  → trialLines
 *
 * Un alumno con presencial ACTIVO que nunca tuvo un pase de la línea toma UNA
 * clase gratis: el servidor le asigna el pase de prueba ($0, bonificada) y le
 * reserva el turno en el mismo request. El plan de prueba se identifica
 * server-side (`is_trial=1`, misma línea, precio 0).
 *
 * Reloj fijo: miércoles 2026-03-11 (hoy). Horarios de Yoga: jueves (+1),
 * sábado (+3), lunes (+5), martes (+6, último día válido) y miércoles (+7,
 * fuera de la ventana de 7 días).
 *
 * Molde: especial-line-gating.test.ts.
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

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

const ADMIN_URL = "/api/admin/scheduling";
const TRIAL_URL = "/api/members/scheduling/especial-trial";
const ESPECIAL_PASS_URL = "/api/members/subscription/me/especial-pass";
const COVERAGE_URL = "/api/members/subscription/coverage";

// "Ahora" = miércoles 2026-03-11.
const TODAY = "2026-03-11";
const THU = "2026-03-12"; // +1
const SAT = "2026-03-14"; // +3
const MON = "2026-03-16"; // +5
const TUE = "2026-03-17"; // +6 (último día de la ventana)
const NEXT_WED = "2026-03-18"; // +7 (fuera)
const PRESENCIAL_END = "2026-04-10";

interface BookingBody {
  id: number;
  status: string;
  scheduleId: number;
  bookingDate: string;
  code?: string;
  message?: string;
}

interface TrialPassBody {
  hasPass: boolean;
  trialLines: string[];
  passes: Array<{
    specialLine: string | null;
    classesRemaining: number | null;
    classesBudget: number | null;
    endDate: string | null;
  }>;
}

describe("Clase de prueba gratis de Yoga — POST /especial-trial", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let testBranchId: number;

  let presencialPlanId: number;
  let trialPlanId: number;
  let yogaPaidPlanId: number;
  let auraPlanId: number;

  let yogaThuId: number;
  let yogaSatId: number;
  let yogaMonId: number;
  let yogaTueId: number;
  let yogaNextWedId: number;
  let yogaFullThuId: number;
  let auraSatId: number;
  let regularSatId: number;

  let seq = 0;

  beforeAll(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(`${TODAY}T10:00:00Z`));

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

    presencialPlanId = await insertPlan({
      name: "Presencial 3x",
      planCategory: "presencial",
      classesPerWeek: 3,
      durationDays: 30,
      priceRegular: 30000,
    });
    trialPlanId = await insertPlan({
      name: "Yoga — Clase de prueba",
      planCategory: "especial",
      specialLine: "Yoga",
      isTrial: true,
      durationDays: 7,
      monthlyClassBudget: 1,
      requiresPresencial: true,
      priceRegular: 0,
    });
    yogaPaidPlanId = await insertPlan({
      name: "Yoga — Clase suelta · Alumnos",
      planCategory: "especial",
      specialLine: "Yoga",
      durationDays: 30,
      monthlyClassBudget: 1,
      requiresPresencial: true,
      priceRegular: 14400,
    });
    auraPlanId = await insertPlan({
      name: "Aura — Externo",
      planCategory: "especial",
      durationDays: 30,
      monthlyClassBudget: 2,
      priceRegular: 20000,
    });

    const yoga = await createActivity("Yoga regenerativo", {
      isSpecial: true,
      specialLine: "Yoga",
    });
    yogaThuId = await createSchedule(yoga, 4, "12:00", "13:00");
    yogaSatId = await createSchedule(yoga, 6, "12:00", "13:00");
    yogaMonId = await createSchedule(yoga, 1, "12:00", "13:00");
    yogaTueId = await createSchedule(yoga, 2, "12:00", "13:00");
    yogaNextWedId = await createSchedule(yoga, 3, "12:00", "13:00");

    const yogaFull = await createActivity("Yoga cupo 1", {
      isSpecial: true,
      specialLine: "Yoga",
      maxCapacity: 1,
    });
    yogaFullThuId = await createSchedule(yogaFull, 4, "15:00", "16:00");

    const aura = await createActivity("Verticales", { isSpecial: true });
    auraSatId = await createSchedule(aura, 6, "10:00", "11:00");

    const regular = await createActivity("Funcional", { isSpecial: false });
    regularSatId = await createSchedule(regular, 6, "09:00", "10:00");
  });

  // ── Helpers ─────────────────────────────────────────────────────────────

  async function insertPlan(opts: {
    name: string;
    planCategory: "presencial" | "especial";
    specialLine?: string | null;
    isTrial?: boolean;
    durationDays: number;
    classesPerWeek?: number | null;
    monthlyClassBudget?: number | null;
    requiresPresencial?: boolean;
    priceRegular: number;
  }): Promise<number> {
    const res = await app.db.insert(schema.subscriptionPlans).values({
      name: opts.name,
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: opts.planCategory,
      priceRegular: opts.priceRegular,
      priceZero: opts.priceRegular,
      durationDays: opts.durationDays,
      classesPerWeek: opts.classesPerWeek ?? null,
      monthlyClassBudget: opts.monthlyClassBudget ?? null,
      requiresPresencial: opts.requiresPresencial ?? false,
      specialLine: opts.specialLine ?? null,
      isTrial: opts.isTrial ?? false,
      multiBranch: true,
    });
    return Number(res[0].insertId);
  }

  async function createActivity(
    name: string,
    body: { isSpecial: boolean; specialLine?: string; maxCapacity?: number },
  ): Promise<number> {
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name, ...body },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body).id as number;
  }

  async function createSchedule(
    activityId: number,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
  ): Promise<number> {
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/schedules`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        branchId: testBranchId,
        activityId,
        dayOfWeek,
        startTime,
        endTime,
      },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body).id as number;
  }

  async function newMember(): Promise<{ id: number; token: string }> {
    seq += 1;
    const email = `trial-${seq}-${Date.now()}@test.com`;
    const result = await registerUser(app, {
      email,
      password: "pass123456",
      branchId: testBranchId,
    });
    const id = (result.user as { id: number }).id;
    const token = await getAuthToken(app, email, "pass123456");
    return { id, token };
  }

  async function insertSub(opts: {
    userId: number;
    planId: number;
    status?: "active" | "paused" | "expired" | "cancelled";
    startDate?: string;
    endDate: string | null;
    classesRemaining?: number | null;
  }): Promise<number> {
    const res = await app.db.insert(schema.subscriptions).values({
      userId: opts.userId,
      planId: opts.planId,
      branchId: testBranchId,
      status: opts.status ?? "active",
      startDate: opts.startDate ?? "2026-03-01",
      endDate: opts.endDate,
      pricePaid: 0,
      priceTypeApplied: "regular",
      classesRemaining: opts.classesRemaining ?? null,
    });
    return Number(res[0].insertId);
  }

  /** Socio con presencial activo hasta `endDate`. */
  async function memberWithPresencial(
    endDate: string | null = PRESENCIAL_END,
  ): Promise<{ id: number; token: string }> {
    const m = await newMember();
    await insertSub({
      userId: m.id,
      planId: presencialPlanId,
      endDate,
      classesRemaining: 12,
    });
    return m;
  }

  async function takeTrial(
    token: string,
    scheduleId: number,
    date: string,
  ): Promise<{ statusCode: number; body: BookingBody }> {
    const res = await app.inject({
      method: "POST",
      url: TRIAL_URL,
      headers: { authorization: `Bearer ${token}` },
      payload: { scheduleId, date },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  async function especialPass(token: string): Promise<TrialPassBody> {
    const res = await app.inject({
      method: "GET",
      url: ESPECIAL_PASS_URL,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body) as TrialPassBody;
  }

  async function coveredUntil(token: string): Promise<string | null> {
    const res = await app.inject({
      method: "GET",
      url: COVERAGE_URL,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    return (JSON.parse(res.body) as { coveredUntil: string | null })
      .coveredUntil;
  }

  async function especialSubsOf(userId: number) {
    return app.db
      .select({
        id: schema.subscriptions.id,
        planId: schema.subscriptions.planId,
        status: schema.subscriptions.status,
        startDate: schema.subscriptions.startDate,
        endDate: schema.subscriptions.endDate,
        pricePaid: schema.subscriptions.pricePaid,
        membershipKind: schema.subscriptions.membershipKind,
        classesRemaining: schema.subscriptions.classesRemaining,
        classesBudget: schema.subscriptions.classesBudget,
      })
      .from(schema.subscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .where(
        and(
          tenantWhere(schema.subscriptions, TEMPLO_CTX),
          eq(schema.subscriptions.userId, userId),
          eq(schema.subscriptionPlans.planCategory, "especial"),
        ),
      );
  }

  async function bookingsOf(userId: number) {
    return app.db
      .select({
        id: schema.bookings.id,
        status: schema.bookings.status,
        bookingDate: schema.bookings.bookingDate,
      })
      .from(schema.bookings)
      .where(
        and(
          tenantWhere(schema.bookings, TEMPLO_CTX),
          eq(schema.bookings.memberId, userId),
        ),
      );
  }

  async function transactionsOf(userId: number): Promise<number> {
    const rows = await app.db
      .select({ id: schema.financialTransactions.id })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          eq(schema.financialTransactions.memberId, userId),
        ),
      );
    return rows.length;
  }

  // ── Camino feliz ────────────────────────────────────────────────────────

  it("alumno con presencial activo → 201: pase bonificado de $0, sin transacción, vence hoy+6, reserva creada", async () => {
    const { id, token } = await memberWithPresencial();
    const txBefore = await transactionsOf(id);

    const { statusCode, body } = await takeTrial(token, yogaSatId, SAT);
    expect(statusCode).toBe(201);
    expect(body.status).toBe("reservado");
    expect(body.scheduleId).toBe(yogaSatId);
    expect(body.bookingDate).toBe(SAT);

    const subs = await especialSubsOf(id);
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({
      planId: trialPlanId,
      status: "active",
      startDate: TODAY,
      endDate: TUE, // hoy + 6
      pricePaid: 0,
      membershipKind: "bonificada",
    });
    // Sin cobro ni deuda: ninguna transacción nueva.
    expect(await transactionsOf(id)).toBe(txBefore);

    const bookings = await bookingsOf(id);
    expect(bookings).toHaveLength(1);
    expect(bookings[0].id).toBe(body.id);

    // Saldo: el descuento real es al check-in, pero la única clase del pase
    // ya está comprometida por la reserva → no puede reservar otra.
    expect(subs[0].classesRemaining).toBe(1);
    expect(subs[0].classesBudget).toBe(1);
    const second = await takeTrial(token, yogaThuId, THU);
    expect(second.statusCode).toBe(409);
  });

  it("el último día de la ventana (hoy+6) es válido", async () => {
    const { id, token } = await memberWithPresencial();
    const { statusCode } = await takeTrial(token, yogaTueId, TUE);
    expect(statusCode).toBe(201);
    expect((await especialSubsOf(id))[0].endDate).toBe(TUE);
  });

  it("con presencial SIN vencimiento (end_date NULL) el pase vence hoy+6", async () => {
    const { id, token } = await memberWithPresencial(null);
    expect((await takeTrial(token, yogaSatId, SAT)).statusCode).toBe(201);
    expect((await especialSubsOf(id))[0].endDate).toBe(TUE);
  });

  it("después de la prueba el pase es un pase normal: aparece en passes[] y ya no ofrece trialLines", async () => {
    const { token } = await memberWithPresencial();
    expect((await especialPass(token)).trialLines).toEqual(["Yoga"]);

    expect((await takeTrial(token, yogaSatId, SAT)).statusCode).toBe(201);

    const after = await especialPass(token);
    expect(after.hasPass).toBe(true);
    expect(after.trialLines).toEqual([]);
    expect(after.passes).toHaveLength(1);
    expect(after.passes[0]).toMatchObject({
      specialLine: "Yoga",
      classesRemaining: 1,
      classesBudget: 1,
      endDate: TUE,
    });
  });

  // ── Recorte del end_date ────────────────────────────────────────────────

  it("presencial que vence en 3 días → el pase vence con el presencial (no lo extiende) y la cobertura no se mueve", async () => {
    const { id, token } = await memberWithPresencial(SAT); // vence +3
    expect(await coveredUntil(token)).toBe(SAT);

    const { statusCode } = await takeTrial(token, yogaSatId, SAT);
    expect(statusCode).toBe(201);

    const subs = await especialSubsOf(id);
    expect(subs[0].endDate).toBe(SAT);
    expect(await coveredUntil(token)).toBe(SAT);
  });

  it("/coverage del alumno no cambia tras tomar la prueba (presencial hasta +30 días)", async () => {
    const { token } = await memberWithPresencial();
    const antes = await coveredUntil(token);
    expect(antes).toBe(PRESENCIAL_END);

    expect((await takeTrial(token, yogaSatId, SAT)).statusCode).toBe(201);
    expect(await coveredUntil(token)).toBe(antes);
  });

  it("presencial vence en 3 días y la clase cae en el día 5 → 409 'Tu plan vence antes de esa clase', sin sub ni reserva", async () => {
    const { id, token } = await memberWithPresencial(SAT);

    const { statusCode, body } = await takeTrial(token, yogaMonId, MON);
    expect(statusCode).toBe(409);
    expect(String(body.message)).toBe("Tu plan vence antes de esa clase");
    expect(await especialSubsOf(id)).toHaveLength(0);
    expect(await bookingsOf(id)).toHaveLength(0);
  });

  // ── Ventana de fechas ───────────────────────────────────────────────────

  it("clase a hoy+7 → 409 sin sub", async () => {
    const { id, token } = await memberWithPresencial();
    const { statusCode, body } = await takeTrial(
      token,
      yogaNextWedId,
      NEXT_WED,
    );
    expect(statusCode).toBe(409);
    expect(String(body.message)).toMatch(/próximos 7 días/);
    expect(await especialSubsOf(id)).toHaveLength(0);
    expect(await bookingsOf(id)).toHaveLength(0);
  });

  it("clase en el pasado → 409 sin sub", async () => {
    const { id, token } = await memberWithPresencial();
    // Martes 2026-03-10 (ayer).
    const { statusCode } = await takeTrial(token, yogaTueId, "2026-03-10");
    expect(statusCode).toBe(409);
    expect(await especialSubsOf(id)).toHaveLength(0);
  });

  // ── Una vez por persona y por línea ─────────────────────────────────────

  it("segunda vez (ya tomó la prueba, aunque venció) → 409", async () => {
    const { id, token } = await memberWithPresencial();
    expect((await takeTrial(token, yogaSatId, SAT)).statusCode).toBe(201);

    // La prueba vence y la reserva se cancela: sigue habiendo tenido la prueba.
    await app.db
      .update(schema.subscriptions)
      .set({ status: "expired" })
      .where(
        and(
          tenantWhere(schema.subscriptions, TEMPLO_CTX),
          eq(schema.subscriptions.userId, id),
          eq(schema.subscriptions.planId, trialPlanId),
        ),
      );
    await app.db
      .delete(schema.bookings)
      .where(
        and(
          tenantWhere(schema.bookings, TEMPLO_CTX),
          eq(schema.bookings.memberId, id),
        ),
      );

    const again = await takeTrial(token, yogaThuId, THU);
    expect(again.statusCode).toBe(409);
    expect(String(again.body.message)).toMatch(/Ya usaste tu clase de prueba/);
    expect((await especialSubsOf(id)).filter((s) => s.status === "active"))
      .toHaveLength(0);
    expect((await especialPass(token)).trialLines).toEqual([]);
  });

  it("ya tuvo un pase de Yoga pago (aunque vencido) → 409 y trialLines vacío", async () => {
    const { id, token } = await memberWithPresencial();
    await insertSub({
      userId: id,
      planId: yogaPaidPlanId,
      status: "expired",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });

    expect((await especialPass(token)).trialLines).toEqual([]);
    const { statusCode } = await takeTrial(token, yogaSatId, SAT);
    expect(statusCode).toBe(409);
    expect(await bookingsOf(id)).toHaveLength(0);
  });

  it("un pase de Aura (otra línea) no impide la prueba de Yoga", async () => {
    const { id, token } = await memberWithPresencial();
    await insertSub({
      userId: id,
      planId: auraPlanId,
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      classesRemaining: 2,
    });

    expect((await especialPass(token)).trialLines).toEqual(["Yoga"]);
    expect((await takeTrial(token, yogaSatId, SAT)).statusCode).toBe(201);
  });

  // ── Sin presencial activo ───────────────────────────────────────────────

  it("freemium (sin ninguna suscripción) → 409, trialLines vacío", async () => {
    const { id, token } = await newMember();
    expect((await especialPass(token)).trialLines).toEqual([]);
    const { statusCode, body } = await takeTrial(token, yogaSatId, SAT);
    expect(statusCode).toBe(409);
    expect(String(body.message)).toMatch(/plan presencial activo/);
    expect(await especialSubsOf(id)).toHaveLength(0);
  });

  it("presencial PAUSADO → 409, trialLines vacío", async () => {
    const m = await newMember();
    await insertSub({
      userId: m.id,
      planId: presencialPlanId,
      status: "paused",
      endDate: PRESENCIAL_END,
    });
    expect((await especialPass(m.token)).trialLines).toEqual([]);
    expect((await takeTrial(m.token, yogaSatId, SAT)).statusCode).toBe(409);
    expect(await especialSubsOf(m.id)).toHaveLength(0);
  });

  it("presencial vencido → 409", async () => {
    const m = await newMember();
    await insertSub({
      userId: m.id,
      planId: presencialPlanId,
      status: "expired",
      startDate: "2026-01-01",
      endDate: "2026-02-01",
    });
    expect((await especialPass(m.token)).trialLines).toEqual([]);
    expect((await takeTrial(m.token, yogaSatId, SAT)).statusCode).toBe(409);
  });

  it("solo un pase especial (sin presencial) → 409", async () => {
    const m = await newMember();
    await insertSub({
      userId: m.id,
      planId: auraPlanId,
      endDate: "2026-03-31",
      classesRemaining: 2,
    });
    expect((await especialPass(m.token)).trialLines).toEqual([]);
    expect((await takeTrial(m.token, yogaSatId, SAT)).statusCode).toBe(409);
  });

  // ── Horarios que no ofrecen prueba ──────────────────────────────────────

  it("horario de Aura → 409 (la línea Aura no ofrece prueba)", async () => {
    const { id, token } = await memberWithPresencial();
    const { statusCode } = await takeTrial(token, auraSatId, SAT);
    expect(statusCode).toBe(409);
    expect(await especialSubsOf(id)).toHaveLength(0);
  });

  it("horario regular → 409", async () => {
    const { id, token } = await memberWithPresencial();
    const { statusCode } = await takeTrial(token, regularSatId, SAT);
    expect(statusCode).toBe(409);
    expect(await especialSubsOf(id)).toHaveLength(0);
  });

  it("horario inexistente → 404", async () => {
    const { token } = await memberWithPresencial();
    const { statusCode } = await takeTrial(token, 999999, SAT);
    expect(statusCode).toBe(404);
  });

  it("línea sin plan de prueba activo → 409 y trialLines vacío", async () => {
    const { id, token } = await memberWithPresencial();
    await app.db
      .update(schema.subscriptionPlans)
      .set({ isActive: false })
      .where(
        and(
          tenantWhere(schema.subscriptionPlans, TEMPLO_CTX),
          eq(schema.subscriptionPlans.id, trialPlanId),
        ),
      );
    expect((await especialPass(token)).trialLines).toEqual([]);
    expect((await takeTrial(token, yogaSatId, SAT)).statusCode).toBe(409);
    expect(await especialSubsOf(id)).toHaveLength(0);
  });

  // ── Validación del body / auth ──────────────────────────────────────────

  it("un planId en el body se descarta: el plan de prueba sale del servidor (T-179-32)", async () => {
    const { id, token } = await memberWithPresencial();
    const res = await app.inject({
      method: "POST",
      url: TRIAL_URL,
      headers: { authorization: `Bearer ${token}` },
      payload: { scheduleId: yogaSatId, date: SAT, planId: yogaPaidPlanId },
    });
    expect(res.statusCode).toBe(201);
    const subs = await especialSubsOf(id);
    expect(subs).toHaveLength(1);
    expect(subs[0].planId).toBe(trialPlanId);
    expect(subs[0].pricePaid).toBe(0);
  });

  it("body sin date → 400", async () => {
    const { token } = await memberWithPresencial();
    const res = await app.inject({
      method: "POST",
      url: TRIAL_URL,
      headers: { authorization: `Bearer ${token}` },
      payload: { scheduleId: yogaSatId },
    });
    expect(res.statusCode).toBe(400);
  });

  it("sin token → 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: TRIAL_URL,
      payload: { scheduleId: yogaSatId, date: SAT },
    });
    expect(res.statusCode).toBe(401);
  });

  // ── Reserva que falla → no queda la asignación ──────────────────────────

  it("turno lleno (quedaría en lista de espera) → 409, sin sub, sin reserva en lista de espera y puede reintentar", async () => {
    const { id, token } = await memberWithPresencial();
    // Otro socio ocupa el único lugar del jueves.
    const other = await newMember();
    await app.db.insert(schema.bookings).values({
      memberId: other.id,
      scheduleId: yogaFullThuId,
      bookingDate: THU,
      status: "reservado",
    });

    const { statusCode, body } = await takeTrial(token, yogaFullThuId, THU);
    expect(statusCode).toBe(409);
    expect(String(body.message)).toMatch(/completo/);
    expect(await especialSubsOf(id)).toHaveLength(0);
    expect(await bookingsOf(id)).toHaveLength(0);
    expect((await especialPass(token)).trialLines).toEqual(["Yoga"]);

    // La prueba no se quemó: en otro turno anda.
    expect((await takeTrial(token, yogaSatId, SAT)).statusCode).toBe(201);
  });

  it("reserva que falla por fecha que no corresponde al día del horario → error de la reserva y sin sub", async () => {
    const { id, token } = await memberWithPresencial();
    // Horario de sábado con fecha de domingo (hoy+4): reserve() lo rechaza.
    const { statusCode } = await takeTrial(token, yogaSatId, "2026-03-15");
    expect(statusCode).toBeGreaterThanOrEqual(400);
    expect(statusCode).toBeLessThan(500);
    expect(await especialSubsOf(id)).toHaveLength(0);
    expect(await bookingsOf(id)).toHaveLength(0);
    expect((await especialPass(token)).trialLines).toEqual(["Yoga"]);
  });

  it("dos requests seguidos: el segundo es 409 y queda UN solo pase y UNA reserva", async () => {
    const { id, token } = await memberWithPresencial();
    const first = await takeTrial(token, yogaSatId, SAT);
    const second = await takeTrial(token, yogaThuId, THU);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);
    expect(await especialSubsOf(id)).toHaveLength(1);
    expect(await bookingsOf(id)).toHaveLength(1);
  });

  // ── trialLines ──────────────────────────────────────────────────────────

  it("GET /me/especial-pass: sin pase devuelve hasPass:false + trialLines; con presencial y plan de prueba → ['Yoga']", async () => {
    const { token } = await memberWithPresencial();
    const body = await especialPass(token);
    expect(body.hasPass).toBe(false);
    expect(body.passes).toEqual([]);
    expect(body.trialLines).toEqual(["Yoga"]);
  });
});
