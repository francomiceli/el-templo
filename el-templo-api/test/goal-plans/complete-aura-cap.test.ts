/**
 * Tanda 2 seguridad (hallazgo #4): POST /api/goal-plans/complete.
 *
 * Mismo cierre que /sessions/complete, mas el contraste con el plan activo:
 *   - el dayId tiene que existir en `sessions` y estar `approved` (400);
 *   - el dayId tiene que empezar con `GP-<goalPlanType del plan activo>-` (400);
 *   - la AURA es UN premio por dia local (tope diario);
 *   - UNIQUE (user_id, day_id) en completed_sessions (mig 0322): dos POST
 *     concurrentes del mismo dayId no duplican la fila ni rompen con 500.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import {
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  dateOffsetStr,
  todayStr,
  seedApprovedSession,
} from "../helpers";

const SUBSCRIPTIONS_URL = "/api/admin/subscriptions";
const CTX_TEMPLO: TenantContext = { tenantId: 1 };

const GP_LUNES = "GP-tren_superior-W1-lunes-alfa";
const GP_MARTES = "GP-tren_superior-W1-martes-alfa";
const GP_PENDING = "GP-tren_superior-W1-miercoles-alfa";
const GP_CONCURRENT = "GP-tren_superior-W2-lunes-alfa";
const GP_OTRO_TIPO = "GP-empuje-W1-lunes-alfa";
const GP_INEXISTENTE = "GP-tren_superior-W999-lunes-alfa";
const REGULAR_APROBADA = "W1-viernes-alfa";
const SEEDED = [
  GP_LUNES,
  GP_MARTES,
  GP_PENDING,
  GP_CONCURRENT,
  GP_OTRO_TIPO,
  REGULAR_APROBADA,
];

describe("POST /api/goal-plans/complete — dayId aprobado, plan activo y tope diario de AURA", () => {
  let app: FastifyInstance;
  let token: string;
  let memberId: number;

  async function complete(dayId: string, extra: Record<string, unknown> = {}) {
    return app.inject({
      method: "POST",
      url: "/api/goal-plans/complete",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        dayId,
        date: todayStr(),
        startedAt: new Date().toISOString(),
        blocksCompleted: ["INITIUM", "NUCLEUS"],
        ...extra,
      },
    });
  }

  async function completedRows(dayId?: string) {
    return app.db
      .select({
        id: schema.completedSessions.id,
        tenantId: schema.completedSessions.tenantId,
        rpe: schema.completedSessions.rpe,
      })
      .from(schema.completedSessions)
      .where(
        and(
          tenantWhere(schema.completedSessions, CTX_TEMPLO),
          eq(schema.completedSessions.userId, memberId),
          ...(dayId ? [eq(schema.completedSessions.dayId, dayId)] : []),
        ),
      );
  }

  async function auraBalance(): Promise<number> {
    const [row] = await app.db
      .select({ balance: schema.auraBalances.balance })
      .from(schema.auraBalances)
      .where(eq(schema.auraBalances.userId, memberId));
    return row?.balance ?? 0;
  }

  async function goalPlanTxs() {
    return app.db
      .select({
        amount: schema.auraTransactions.amount,
        referenceType: schema.auraTransactions.referenceType,
      })
      .from(schema.auraTransactions)
      .where(
        and(
          eq(schema.auraTransactions.userId, memberId),
          eq(schema.auraTransactions.sourceType, "goal_plan_completion"),
        ),
      );
  }

  beforeAll(async () => {
    app = await createTestApp();
    const adminToken = await getAuthToken(
      app,
      "admin@test.com",
      "adminpass123",
    );

    await app.db
      .delete(schema.auraConfig)
      .where(eq(schema.auraConfig.sourceType, "goal_plan_completion"));
    await app.db.insert(schema.auraConfig).values({
      sourceType: "goal_plan_completion",
      defaultAmount: 10,
      description: "Completed a goal plan session",
      isActive: true,
    });

    const reg = await registerUser(app, {
      email: "gp-complete-aura-cap@test.com",
      password: "password123",
      branchId: 1,
    });
    token = reg.token;
    memberId = (reg.user as { id: number }).id;

    // Plan de objetivos activo (tren_superior), igual que goal-plans.test.ts.
    const programRes = await app.inject({
      method: "POST",
      url: "/api/admin/programs",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "Tren Superior Program (aura cap)",
        description: null,
        durationWeeks: 4,
        sessionsPerWeekToAdvance: 3,
        goalPlanType: "tren_superior",
        auraWeeklyBonus: 15,
        auraCompletionBonus: 100,
        contentBlocks: [],
      },
    });
    expect(programRes.statusCode).toBe(201);
    const program = JSON.parse(programRes.body);

    const planRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "Plan Goal Plan Aura Cap",
        planTier: "other",
        bookingMode: "flexible",
        priceRegular: 20000,
        priceZero: 15000,
        durationDays: 30,
        planCategory: "online_goal",
        linkedProgramId: program.id,
      },
    });
    expect(planRes.statusCode).toBe(201);
    const plan = JSON.parse(planRes.body);

    const assignRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/assign`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId: plan.id,
        branchId: 1,
        startDate: dateOffsetStr(-25),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
      },
    });
    expect(assignRes.statusCode).toBe(201);

    await seedApprovedSession(app, GP_LUNES, { goalPlanType: "tren_superior" });
    await seedApprovedSession(app, GP_MARTES, {
      goalPlanType: "tren_superior",
    });
    await seedApprovedSession(app, GP_PENDING, {
      status: "pending_review",
      goalPlanType: "tren_superior",
    });
    await seedApprovedSession(app, GP_CONCURRENT, {
      goalPlanType: "tren_superior",
    });
    await seedApprovedSession(app, GP_OTRO_TIPO, { goalPlanType: "empuje" });
    await seedApprovedSession(app, REGULAR_APROBADA);
  });

  afterAll(async () => {
    await app.db
      .delete(schema.sessions)
      .where(
        and(
          tenantWhere(schema.sessions, CTX_TEMPLO),
          inArray(schema.sessions.dayId, SEEDED),
        ),
      );
    await app.close();
  });

  it("rechaza con 400 un dayId que no existe en sessions (sin fila ni AURA)", async () => {
    const res = await complete(GP_INEXISTENTE);

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("Solicitud invalida");
    expect(body.message).toBe(
      "dayId invalido: la sesion no existe o no esta aprobada",
    );
    expect(await completedRows()).toHaveLength(0);
    expect(await auraBalance()).toBe(0);
  });

  it("rechaza con 400 una sesion pending_review", async () => {
    const res = await complete(GP_PENDING);

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("Solicitud invalida");
    expect(body.message).toBe(
      "dayId invalido: la sesion no existe o no esta aprobada",
    );
    expect(await completedRows(GP_PENDING)).toHaveLength(0);
    expect(await auraBalance()).toBe(0);
  });

  it("rechaza con 400 un dayId aprobado de OTRO goalPlanType (no es del plan activo)", async () => {
    const res = await complete(GP_OTRO_TIPO);

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("Solicitud invalida");
    expect(body.message).toBe(
      "dayId invalido: no corresponde a tu plan por objetivos",
    );
    expect(await completedRows(GP_OTRO_TIPO)).toHaveLength(0);
    expect(await auraBalance()).toBe(0);
  });

  it("rechaza con 400 una sesion regular (sin prefijo GP-) aunque este aprobada", async () => {
    const res = await complete(REGULAR_APROBADA);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe(
      "dayId invalido: no corresponde a tu plan por objetivos",
    );
    expect(await completedRows(REGULAR_APROBADA)).toHaveLength(0);
    expect(await auraBalance()).toBe(0);
  });

  it("limites del schema: dayId > 50 y notes > 2000 dan 400", async () => {
    const largo = await complete(`GP-tren_superior-W1-lunes-${"a".repeat(60)}`);
    expect(largo.statusCode).toBe(400);

    const notasLargas = await complete(GP_LUNES, { notes: "x".repeat(2001) });
    expect(notasLargas.statusCode).toBe(400);

    expect(await completedRows()).toHaveLength(0);
    expect(await auraBalance()).toBe(0);
  });

  it("completar una sesion del plan activo da 200 y 10 AURA, con la fila en el tenant del socio", async () => {
    const res = await complete(GP_LUNES);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
    const rows = await completedRows(GP_LUNES);
    expect(rows).toHaveLength(1);
    expect(rows[0].tenantId).toBe(CTX_TEMPLO.tenantId);
    expect(await auraBalance()).toBe(10);

    const txs = await goalPlanTxs();
    expect(txs).toHaveLength(1);
    expect(txs[0].referenceType).toBe("goal_plan_day");
  });

  it("una segunda sesion el mismo dia da 200 pero NO suma AURA (tope diario)", async () => {
    const res = await complete(GP_MARTES);

    expect(res.statusCode).toBe(200);
    expect(await completedRows()).toHaveLength(2);
    expect(await auraBalance()).toBe(10);
    expect(await goalPlanTxs()).toHaveLength(1);
  });

  it("repetir el mismo dayId actualiza la fila (upsert): una sola fila y el saldo no cambia", async () => {
    const res = await complete(GP_LUNES, { rpe: 9 });

    expect(res.statusCode).toBe(200);
    const rows = await completedRows(GP_LUNES);
    expect(rows).toHaveLength(1);
    expect(rows[0].rpe).toBe(9);
    expect(await completedRows()).toHaveLength(2);
    expect(await auraBalance()).toBe(10);
  });

  it("dos POST concurrentes con un dayId nuevo: sin 500, una sola fila y sin AURA extra", async () => {
    const antes = await completedRows();
    const saldoAntes = await auraBalance();

    const [a, b] = await Promise.all([
      complete(GP_CONCURRENT, { rpe: 5 }),
      complete(GP_CONCURRENT, { rpe: 6 }),
    ]);

    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(await completedRows(GP_CONCURRENT)).toHaveLength(1);
    expect(await completedRows()).toHaveLength(antes.length + 1);
    expect(await auraBalance()).toBe(saldoAntes);
  });
});
