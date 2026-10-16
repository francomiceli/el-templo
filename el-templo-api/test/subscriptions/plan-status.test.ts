/**
 * Fase 199 / D-05 — GET /api/members/subscription/me/plan-status
 *
 * La card "sin plan" de la app muestra "Arrancá tu plan" (nunca tuvo plan) o
 * "Renová tu plan" (tuvo y venció). `/me/subscription` devuelve 204 en los dos
 * casos y ese 204 es contrato de apps viejas, así que el estado vive en una
 * ruta nueva, de lectura pura.
 *
 * Fechas: A PROPÓSITO en UTC (`todayStr` + aritmética UTC). La ruta compara
 * `end_date` contra la fecha UTC, igual que `autoExpireSubscriptions` y
 * `SponsorsService.hasActivePlan`; usar `todayInTz` acá desalinearía el test
 * de la regla real de noche.
 *
 * Cobertura:
 *  - nunca tuvo plan, vencida, activa vigente, active vencida SIN barrer,
 *    borde (end_date = hoy), end_date nulo, paused, scheduled;
 *  - lastPlan = la de endDate más reciente (independiente del orden de alta);
 *  - cancelled / completed / changed cuentan como "tuvo plan";
 *  - membership_kind staff y bonificada cuentan como plan;
 *  - lectura pura: la ruta no escribe, y el resultado no cambia después de que
 *    `/me/subscription` barre la sub vencida (que sigue dando 204);
 *  - aislamiento entre socios; 401 sin token.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import {
  createTestApp,
  cleanAllTestData,
  createTestMember,
  todayStr,
} from "../helpers";

const URL = "/api/members/subscription/me/plan-status";
const ME_SUBSCRIPTION_URL = "/api/members/subscription/me/subscription";

type SubStatus = (typeof schema.subscriptions.$inferInsert)["status"];
type MembershipKind =
  (typeof schema.subscriptions.$inferInsert)["membershipKind"];

interface PlanStatusBody {
  hasActivePlan: boolean;
  hasScheduledPlan: boolean;
  scheduledStartDate: string | null;
  hadPlan: boolean;
  lastPlan: {
    planName: string;
    endDate: string | null;
    status: string;
  } | null;
}

/** Fecha UTC relativa a hoy (UTC): misma base que la regla del servidor. */
function utcOffset(days: number): string {
  const d = new Date(`${todayStr()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

describe("GET /me/plan-status — nunca tuvo plan vs. tuvo y venció (D-05)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  async function insertPlan(name: string): Promise<number> {
    const res = await app.db.insert(schema.subscriptionPlans).values({
      name,
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 5600,
      priceZero: 5600,
      durationDays: 30,
      classesPerWeek: 3,
      country: "AR",
      currency: "ARS",
      isActive: true,
      isArchived: false,
    });
    return Number(res[0].insertId);
  }

  async function insertSub(opts: {
    userId: number;
    planId: number;
    status: SubStatus;
    startDate: string;
    endDate: string | null;
    membershipKind?: MembershipKind;
  }): Promise<number> {
    const res = await app.db.insert(schema.subscriptions).values({
      userId: opts.userId,
      planId: opts.planId,
      branchId: 1,
      status: opts.status,
      startDate: opts.startDate,
      endDate: opts.endDate,
      pricePaid: 5600,
      priceTypeApplied: "regular",
      ...(opts.membershipKind ? { membershipKind: opts.membershipKind } : {}),
    });
    return Number(res[0].insertId);
  }

  async function fetchPlanStatus(
    token: string,
  ): Promise<{ statusCode: number; body: PlanStatusBody }> {
    const res = await app.inject({
      method: "GET",
      url: URL,
      headers: { authorization: `Bearer ${token}` },
    });
    return {
      statusCode: res.statusCode,
      body: JSON.parse(res.body) as PlanStatusBody,
    };
  }

  async function fetchMeSubscription(token: string): Promise<number> {
    const res = await app.inject({
      method: "GET",
      url: ME_SUBSCRIPTION_URL,
      headers: { authorization: `Bearer ${token}` },
    });
    return res.statusCode;
  }

  it("socio nuevo sin filas → hadPlan false, lastPlan null, sin plan activo ni programado", async () => {
    const member = await createTestMember(app);

    const { statusCode, body } = await fetchPlanStatus(member.token);

    expect(statusCode).toBe(200);
    expect(body).toEqual({
      hasActivePlan: false,
      hasScheduledPlan: false,
      scheduledStartDate: null,
      hadPlan: false,
      lastPlan: null,
    });
  });

  it("sub expired → hadPlan true con el nombre del plan y su fecha de fin", async () => {
    const member = await createTestMember(app);
    const planId = await insertPlan("Plan Vencido 3/sem");
    const endDate = utcOffset(-10);
    await insertSub({
      userId: member.id,
      planId,
      status: "expired",
      startDate: utcOffset(-40),
      endDate,
    });

    const { statusCode, body } = await fetchPlanStatus(member.token);

    expect(statusCode).toBe(200);
    expect(body.hasActivePlan).toBe(false);
    expect(body.hasScheduledPlan).toBe(false);
    expect(body.hadPlan).toBe(true);
    expect(body.lastPlan).toEqual({
      planName: "Plan Vencido 3/sem",
      endDate,
      status: "expired",
    });
  });

  it("sub active vigente → hasActivePlan true, hadPlan false, y /me/subscription sigue 200", async () => {
    const member = await createTestMember(app);
    const planId = await insertPlan("Plan Vigente");
    const subId = await insertSub({
      userId: member.id,
      planId,
      status: "active",
      startDate: utcOffset(-5),
      endDate: utcOffset(10),
    });

    const { body } = await fetchPlanStatus(member.token);

    expect(body.hasActivePlan).toBe(true);
    expect(body.hadPlan).toBe(false);
    expect(body.lastPlan).toBeNull();

    const meRes = await app.inject({
      method: "GET",
      url: ME_SUBSCRIPTION_URL,
      headers: { authorization: `Bearer ${member.token}` },
    });
    expect(meRes.statusCode).toBe(200);
    expect((JSON.parse(meRes.body) as { id: number }).id).toBe(subId);
  });

  it("sub active con endDate ya pasado y sin barrer → vencida: hasActivePlan false, hadPlan true, status expired", async () => {
    const member = await createTestMember(app);
    const planId = await insertPlan("Plan Que Venció Ayer");
    const endDate = utcOffset(-1);
    const subId = await insertSub({
      userId: member.id,
      planId,
      status: "active",
      startDate: utcOffset(-31),
      endDate,
    });

    const { body } = await fetchPlanStatus(member.token);

    expect(body.hasActivePlan).toBe(false);
    expect(body.hadPlan).toBe(true);
    expect(body.lastPlan).toEqual({
      planName: "Plan Que Venció Ayer",
      endDate,
      status: "expired",
    });

    // L10: lectura pura. La ruta NO barrió: la fila sigue 'active' en la base.
    const [row] = await app.db
      .select({ status: schema.subscriptions.status })
      .from(schema.subscriptions)
      .where(
        sql`/* tenant-safe: lectura por PK propia (subId), fila creada por este mismo test */ ${eq(schema.subscriptions.id, subId)}`,
      );
    expect(row.status).toBe("active");
  });

  it("borde: active con endDate = hoy (UTC) todavía es plan activo", async () => {
    const member = await createTestMember(app);
    const planId = await insertPlan("Plan Vence Hoy");
    await insertSub({
      userId: member.id,
      planId,
      status: "active",
      startDate: utcOffset(-30),
      endDate: todayStr(),
    });

    const { body } = await fetchPlanStatus(member.token);

    expect(body.hasActivePlan).toBe(true);
    expect(body.hadPlan).toBe(false);
  });

  it("active con endDate null (sin vencimiento) → plan activo", async () => {
    const member = await createTestMember(app);
    const planId = await insertPlan("Plan Sin Fin");
    await insertSub({
      userId: member.id,
      planId,
      status: "active",
      startDate: utcOffset(-60),
      endDate: null,
    });

    const { body } = await fetchPlanStatus(member.token);

    expect(body.hasActivePlan).toBe(true);
    expect(body.hadPlan).toBe(false);
  });

  it("paused cuenta como plan activo aunque su endDate sea pasado", async () => {
    const member = await createTestMember(app);
    const planId = await insertPlan("Plan Pausado");
    await insertSub({
      userId: member.id,
      planId,
      status: "paused",
      startDate: utcOffset(-40),
      endDate: utcOffset(-3),
    });

    const { body } = await fetchPlanStatus(member.token);

    expect(body.hasActivePlan).toBe(true);
    expect(body.hadPlan).toBe(false);
    expect(body.lastPlan).toBeNull();
  });

  it("dos vencidas → lastPlan es la de endDate más reciente, aunque se haya cargado primero", async () => {
    const member = await createTestMember(app);
    const planReciente = await insertPlan("Plan Reciente");
    const planViejo = await insertPlan("Plan Viejo");
    const endReciente = utcOffset(-5);
    // Primero la más reciente: el id mayor es la VIEJA, así que ordenar por id
    // daría el plan equivocado.
    await insertSub({
      userId: member.id,
      planId: planReciente,
      status: "expired",
      startDate: utcOffset(-35),
      endDate: endReciente,
    });
    await insertSub({
      userId: member.id,
      planId: planViejo,
      status: "expired",
      startDate: utcOffset(-100),
      endDate: utcOffset(-70),
    });

    const { body } = await fetchPlanStatus(member.token);

    expect(body.hadPlan).toBe(true);
    expect(body.lastPlan?.planName).toBe("Plan Reciente");
    expect(body.lastPlan?.endDate).toBe(endReciente);
  });

  it("vigente + una vencida anterior → hasActivePlan true y también hadPlan true con la anterior como lastPlan", async () => {
    const member = await createTestMember(app);
    const planViejo = await insertPlan("Plan Anterior");
    const planActual = await insertPlan("Plan Actual");
    const endViejo = utcOffset(-20);
    await insertSub({
      userId: member.id,
      planId: planViejo,
      status: "expired",
      startDate: utcOffset(-50),
      endDate: endViejo,
    });
    await insertSub({
      userId: member.id,
      planId: planActual,
      status: "active",
      startDate: utcOffset(-19),
      endDate: utcOffset(11),
    });

    const { body } = await fetchPlanStatus(member.token);

    expect(body.hasActivePlan).toBe(true);
    expect(body.hadPlan).toBe(true);
    expect(body.lastPlan).toEqual({
      planName: "Plan Anterior",
      endDate: endViejo,
      status: "expired",
    });
  });

  it("sub scheduled (programada) → hasScheduledPlan true con su fecha de inicio; no cuenta como plan activo ni como 'tuvo plan'", async () => {
    const member = await createTestMember(app);
    const planId = await insertPlan("Plan Programado");
    const startDate = utcOffset(5);
    await insertSub({
      userId: member.id,
      planId,
      status: "scheduled",
      startDate,
      endDate: utcOffset(35),
    });

    const { body } = await fetchPlanStatus(member.token);

    expect(body.hasScheduledPlan).toBe(true);
    expect(body.scheduledStartDate).toBe(startDate);
    expect(body.hasActivePlan).toBe(false);
    expect(body.hadPlan).toBe(false);
    expect(body.lastPlan).toBeNull();
  });

  it("dos scheduled → scheduledStartDate es la más próxima", async () => {
    const member = await createTestMember(app);
    const planId = await insertPlan("Plan Programado");
    await insertSub({
      userId: member.id,
      planId,
      status: "scheduled",
      startDate: utcOffset(40),
      endDate: utcOffset(70),
    });
    await insertSub({
      userId: member.id,
      planId,
      status: "scheduled",
      startDate: utcOffset(8),
      endDate: utcOffset(38),
    });

    const { body } = await fetchPlanStatus(member.token);

    expect(body.hasScheduledPlan).toBe(true);
    expect(body.scheduledStartDate).toBe(utcOffset(8));
  });

  it("vencida + programada (renovación con hueco) → tuvo plan Y tiene uno programado", async () => {
    const member = await createTestMember(app);
    const planId = await insertPlan("Plan Con Hueco");
    await insertSub({
      userId: member.id,
      planId,
      status: "expired",
      startDate: utcOffset(-35),
      endDate: utcOffset(-5),
    });
    await insertSub({
      userId: member.id,
      planId,
      status: "scheduled",
      startDate: utcOffset(3),
      endDate: utcOffset(33),
    });

    const { body } = await fetchPlanStatus(member.token);

    expect(body.hasActivePlan).toBe(false);
    expect(body.hadPlan).toBe(true);
    expect(body.hasScheduledPlan).toBe(true);
    expect(body.scheduledStartDate).toBe(utcOffset(3));
  });

  it.each(["cancelled", "completed", "changed"] as const)(
    "sub %s → cuenta como 'tuvo plan' y se informa con ese status",
    async (status) => {
      const member = await createTestMember(app);
      const planId = await insertPlan(`Plan ${status}`);
      const endDate = utcOffset(-8);
      await insertSub({
        userId: member.id,
        planId,
        status,
        startDate: utcOffset(-38),
        endDate,
      });

      const { body } = await fetchPlanStatus(member.token);

      expect(body.hasActivePlan).toBe(false);
      expect(body.hadPlan).toBe(true);
      expect(body.lastPlan).toEqual({
        planName: `Plan ${status}`,
        endDate,
        status,
      });
    },
  );

  it.each(["staff", "bonificada"] as const)(
    "membership_kind %s vigente cuenta como plan activo",
    async (membershipKind) => {
      const member = await createTestMember(app);
      const planId = await insertPlan(`Plan ${membershipKind}`);
      await insertSub({
        userId: member.id,
        planId,
        status: "active",
        startDate: utcOffset(-5),
        endDate: utcOffset(25),
        membershipKind,
      });

      const { body } = await fetchPlanStatus(member.token);

      expect(body.hasActivePlan).toBe(true);
      expect(body.hadPlan).toBe(false);
    },
  );

  it("socio venció: /me/subscription sigue devolviendo 204 y plan-status no cambia después del barrido", async () => {
    const member = await createTestMember(app);
    const planId = await insertPlan("Plan Que Venció");
    const endDate = utcOffset(-2);
    const subId = await insertSub({
      userId: member.id,
      planId,
      status: "active",
      startDate: utcOffset(-32),
      endDate,
    });

    const antes = await fetchPlanStatus(member.token);

    // Regresión del contrato de apps viejas: sin plan vigente, 204 vacío.
    expect(await fetchMeSubscription(member.token)).toBe(204);

    // /me/subscription barrió la sub vencida a 'expired'.
    const [row] = await app.db
      .select({ status: schema.subscriptions.status })
      .from(schema.subscriptions)
      .where(
        sql`/* tenant-safe: lectura por PK propia (subId), fila creada por este mismo test */ ${eq(schema.subscriptions.id, subId)}`,
      );
    expect(row.status).toBe("expired");

    const despues = await fetchPlanStatus(member.token);
    expect(despues.body).toEqual(antes.body);
    expect(despues.body.hadPlan).toBe(true);
    expect(despues.body.hasActivePlan).toBe(false);
  });

  it("socio nunca tuvo plan: /me/subscription también 204 (los dos casos se distinguen solo por plan-status)", async () => {
    const member = await createTestMember(app);

    expect(await fetchMeSubscription(member.token)).toBe(204);
    expect((await fetchPlanStatus(member.token)).body.hadPlan).toBe(false);
  });

  it("aislamiento entre socios: el historial de uno nunca aparece en el otro", async () => {
    const conPlan = await createTestMember(app);
    const sinPlan = await createTestMember(app);
    const planId = await insertPlan("Plan Ajeno");
    await insertSub({
      userId: conPlan.id,
      planId,
      status: "active",
      startDate: utcOffset(-5),
      endDate: utcOffset(25),
    });
    await insertSub({
      userId: conPlan.id,
      planId,
      status: "expired",
      startDate: utcOffset(-60),
      endDate: utcOffset(-30),
    });

    const ajeno = await fetchPlanStatus(sinPlan.token);
    expect(ajeno.body).toEqual({
      hasActivePlan: false,
      hasScheduledPlan: false,
      scheduledStartDate: null,
      hadPlan: false,
      lastPlan: null,
    });

    const propio = await fetchPlanStatus(conPlan.token);
    expect(propio.body.hasActivePlan).toBe(true);
    expect(propio.body.hadPlan).toBe(true);
  });

  it("no acepta userId de la query: se responde por el token (mass assignment descartado)", async () => {
    const conPlan = await createTestMember(app);
    const solicitante = await createTestMember(app);
    const planId = await insertPlan("Plan Ajeno");
    await insertSub({
      userId: conPlan.id,
      planId,
      status: "active",
      startDate: utcOffset(-5),
      endDate: utcOffset(25),
    });

    const res = await app.inject({
      method: "GET",
      url: `${URL}?userId=${conPlan.id}`,
      headers: { authorization: `Bearer ${solicitante.token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as PlanStatusBody;
    expect(body.hasActivePlan).toBe(false);
    expect(body.hadPlan).toBe(false);
  });

  it("sin token → 401", async () => {
    const res = await app.inject({ method: "GET", url: URL });
    expect(res.statusCode).toBe(401);
  });
});
