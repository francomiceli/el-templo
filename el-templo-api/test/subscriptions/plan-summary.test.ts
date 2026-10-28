/**
 * Planes — GET /api/members/subscription/me/plan-summary y
 *          POST /api/members/subscription/me/plan-summary/seen
 *
 * La tab Planes de la app muestra: plan actual -> (hueco) -> próxima, y los
 * planes anteriores. Los socios pagan antes del vencimiento y no sabían si la
 * renovación quedó cargada: una renovación anticipada crea una sub `scheduled`
 * encadenada por `previousSubscriptionId`.
 *
 * Fechas: relativas a hoy y SIEMPRE con margen de varios días respecto de los
 * bordes (la ruta compara contra la fecha de Argentina, el test arma las fechas
 * en UTC: difieren a lo sumo un día). Nada de años fijos.
 *
 * Cobertura:
 *  - activa + programada; hueco (anterior vencida + programada futura);
 *    programada que ya empezó; pausada con pauseEndDate;
 *  - pase especial + regular (gana la regular), solo especial, `next` prefiere
 *    la regular;
 *  - historial: completed/expired/changed + active vencida sin barrer, SIN
 *    cancelled, orden por fin desc, todas las categorías;
 *  - SIN montos: claves exactas y ni rastro del precio pagado;
 *  - nunca tuvo plan; aislamiento entre socios (userId del token); 401;
 *  - isNew / hasUnseen y el POST seen (+ `hasUnseenPlanUpdate` de plan-status).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import {
  createTestApp,
  cleanAllTestData,
  createTestMember,
  todayStr,
} from "../helpers";

const SUMMARY_URL = "/api/members/subscription/me/plan-summary";
const SEEN_URL = "/api/members/subscription/me/plan-summary/seen";
const PLAN_STATUS_URL = "/api/members/subscription/me/plan-status";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

/** Importe distintivo: si aparece en una respuesta, se filtró plata al socio. */
const PRICE_SENTINEL = 987654;

type SubStatus = (typeof schema.subscriptions.$inferInsert)["status"];
type PlanCategory = NonNullable<
  (typeof schema.subscriptionPlans.$inferInsert)["planCategory"]
>;

interface SummaryItem {
  id: number;
  planId: number;
  planName: string;
  planCategory: string;
  status: string;
  startDate: string;
  endDate: string | null;
  pauseEndDate: string | null;
  classesPerWeek: number | null;
  classesRemaining: number | null;
  classesBudget: number | null;
  isNew: boolean;
}

interface SummaryBody {
  current: SummaryItem | null;
  next: SummaryItem | null;
  history: Array<{
    id: number;
    planName: string;
    startDate: string;
    endDate: string | null;
  }>;
  hasUnseen: boolean;
}

/** Fecha UTC relativa a hoy (UTC). */
function utcOffset(days: number): string {
  const d = new Date(`${todayStr()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

describe("GET /me/plan-summary — plan actual, próxima y anteriores", () => {
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

  async function insertPlan(
    name: string,
    planCategory: PlanCategory = "presencial",
  ): Promise<number> {
    const res = await app.db.insert(schema.subscriptionPlans).values(
      tenantValues(TEMPLO_CTX, {
        name,
        planTier: "flex" as const,
        bookingMode: "flexible" as const,
        planCategory,
        priceRegular: PRICE_SENTINEL,
        priceZero: PRICE_SENTINEL,
        durationDays: 30,
        classesPerWeek: 3,
        country: "AR" as const,
        currency: "ARS" as const,
        isActive: true,
        isArchived: false,
      }),
    );
    return Number(res[0].insertId);
  }

  async function insertSub(opts: {
    userId: number;
    planId: number;
    status: SubStatus;
    startDate: string;
    endDate: string | null;
    pauseEndDate?: string;
    classesRemaining?: number;
    classesBudget?: number;
    notified?: boolean;
    seen?: boolean;
  }): Promise<number> {
    const res = await app.db.insert(schema.subscriptions).values(
      tenantValues(TEMPLO_CTX, {
        userId: opts.userId,
        planId: opts.planId,
        branchId: 1,
        status: opts.status,
        startDate: opts.startDate,
        endDate: opts.endDate,
        pauseEndDate: opts.pauseEndDate ?? null,
        classesRemaining: opts.classesRemaining ?? null,
        classesBudget: opts.classesBudget ?? null,
        pricePaid: PRICE_SENTINEL,
        priceTypeApplied: "regular" as const,
        memberNotifiedAt: opts.notified ? new Date() : null,
        memberSeenAt: opts.seen ? new Date() : null,
      }),
    );
    return Number(res[0].insertId);
  }

  async function getSummary(
    token: string,
  ): Promise<{ statusCode: number; raw: string; body: SummaryBody }> {
    const res = await app.inject({
      method: "GET",
      url: SUMMARY_URL,
      headers: { authorization: `Bearer ${token}` },
    });
    return {
      statusCode: res.statusCode,
      raw: res.body,
      body: JSON.parse(res.body) as SummaryBody,
    };
  }

  async function postSeen(token: string): Promise<{ updated: number }> {
    const res = await app.inject({
      method: "POST",
      url: SEEN_URL,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body) as { updated: number };
  }

  async function getHasUnseenPlanUpdate(token: string): Promise<boolean> {
    const res = await app.inject({
      method: "GET",
      url: PLAN_STATUS_URL,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    return (JSON.parse(res.body) as { hasUnseenPlanUpdate: boolean })
      .hasUnseenPlanUpdate;
  }

  it("activa + programada → current la activa, next la programada (con los datos del plan)", async () => {
    const member = await createTestMember(app);
    const planId = await insertPlan("Plan Mensual 3/sem");
    const activeId = await insertSub({
      userId: member.id,
      planId,
      status: "active",
      startDate: utcOffset(-10),
      endDate: utcOffset(20),
      classesRemaining: 7,
      classesBudget: 12,
    });
    const scheduledId = await insertSub({
      userId: member.id,
      planId,
      status: "scheduled",
      startDate: utcOffset(21),
      endDate: utcOffset(51),
    });

    const { statusCode, body } = await getSummary(member.token);

    expect(statusCode).toBe(200);
    expect(body.current).toEqual({
      id: activeId,
      planId,
      planName: "Plan Mensual 3/sem",
      planCategory: "presencial",
      status: "active",
      startDate: utcOffset(-10),
      endDate: utcOffset(20),
      pauseEndDate: null,
      classesPerWeek: 3,
      classesRemaining: 7,
      classesBudget: 12,
      isNew: false,
    });
    expect(body.next?.id).toBe(scheduledId);
    expect(body.next?.status).toBe("scheduled");
    expect(body.next?.startDate).toBe(utcOffset(21));
    expect(body.history).toEqual([]);
    expect(body.hasUnseen).toBe(false);
  });

  it("hueco: anterior vencida + programada futura → current null, next la programada, history la anterior", async () => {
    const member = await createTestMember(app);
    const planId = await insertPlan("Plan Hueco");
    const completedId = await insertSub({
      userId: member.id,
      planId,
      status: "completed",
      startDate: utcOffset(-40),
      endDate: utcOffset(-10),
    });
    const scheduledId = await insertSub({
      userId: member.id,
      planId,
      status: "scheduled",
      startDate: utcOffset(10),
      endDate: utcOffset(40),
    });

    const { body } = await getSummary(member.token);

    expect(body.current).toBeNull();
    expect(body.next?.id).toBe(scheduledId);
    expect(body.history).toEqual([
      {
        id: completedId,
        planName: "Plan Hueco",
        startDate: utcOffset(-40),
        endDate: utcOffset(-10),
      },
    ]);
  });

  it("programada que YA empezó (startDate pasado, todavía sin activar) → es current, no next", async () => {
    const member = await createTestMember(app);
    const planId = await insertPlan("Plan Arrancó");
    const scheduledId = await insertSub({
      userId: member.id,
      planId,
      status: "scheduled",
      startDate: utcOffset(-3),
      endDate: utcOffset(27),
    });

    const { body } = await getSummary(member.token);

    expect(body.current?.id).toBe(scheduledId);
    expect(body.current?.status).toBe("scheduled");
    expect(body.next).toBeNull();
  });

  it("pausada con pauseEndDate → current paused y devuelve pauseEndDate", async () => {
    const member = await createTestMember(app);
    const planId = await insertPlan("Plan Pausado");
    const pausedId = await insertSub({
      userId: member.id,
      planId,
      status: "paused",
      startDate: utcOffset(-10),
      endDate: utcOffset(20),
      pauseEndDate: utcOffset(7),
    });

    const { body } = await getSummary(member.token);

    expect(body.current?.id).toBe(pausedId);
    expect(body.current?.status).toBe("paused");
    expect(body.current?.pauseEndDate).toBe(utcOffset(7));
  });

  it("pase especial + regular activos → current es la regular (aunque el pase empezó antes)", async () => {
    const member = await createTestMember(app);
    const especialPlan = await insertPlan("Pase Yoga", "especial");
    const regularPlan = await insertPlan("Plan Regular");
    await insertSub({
      userId: member.id,
      planId: especialPlan,
      status: "active",
      startDate: utcOffset(-20),
      endDate: utcOffset(10),
    });
    const regularId = await insertSub({
      userId: member.id,
      planId: regularPlan,
      status: "active",
      startDate: utcOffset(-5),
      endDate: utcOffset(25),
    });

    const { body } = await getSummary(member.token);

    expect(body.current?.id).toBe(regularId);
    expect(body.current?.planCategory).toBe("presencial");
  });

  it("solo pase especial → current es el pase", async () => {
    const member = await createTestMember(app);
    const especialPlan = await insertPlan("Pase Solo", "especial");
    const especialId = await insertSub({
      userId: member.id,
      planId: especialPlan,
      status: "active",
      startDate: utcOffset(-5),
      endDate: utcOffset(25),
    });

    const { body } = await getSummary(member.token);

    expect(body.current?.id).toBe(especialId);
    expect(body.current?.planCategory).toBe("especial");
  });

  it("next prefiere la regular sobre un pase especial, aunque el pase empiece antes", async () => {
    const member = await createTestMember(app);
    const especialPlan = await insertPlan("Pase Futuro", "especial");
    const regularPlan = await insertPlan("Regular Futura");
    await insertSub({
      userId: member.id,
      planId: especialPlan,
      status: "scheduled",
      startDate: utcOffset(5),
      endDate: utcOffset(35),
    });
    const regularId = await insertSub({
      userId: member.id,
      planId: regularPlan,
      status: "scheduled",
      startDate: utcOffset(15),
      endDate: utcOffset(45),
    });

    const { body } = await getSummary(member.token);

    expect(body.current).toBeNull();
    expect(body.next?.id).toBe(regularId);
  });

  it("history: sin cancelled, con completed/expired/changed y la active vencida sin barrer, la más reciente primero", async () => {
    const member = await createTestMember(app);
    const planId = await insertPlan("Plan Historial");
    const especialPlan = await insertPlan("Pase Viejo", "especial");

    const currentId = await insertSub({
      userId: member.id,
      planId,
      status: "active",
      startDate: utcOffset(-5),
      endDate: utcOffset(25),
    });
    await insertSub({
      userId: member.id,
      planId,
      status: "cancelled",
      startDate: utcOffset(-100),
      endDate: utcOffset(-70),
    });
    const changedId = await insertSub({
      userId: member.id,
      planId,
      status: "changed",
      startDate: utcOffset(-90),
      endDate: utcOffset(-60),
    });
    const expiredId = await insertSub({
      userId: member.id,
      planId,
      status: "expired",
      startDate: utcOffset(-60),
      endDate: utcOffset(-30),
    });
    const completedEspecialId = await insertSub({
      userId: member.id,
      planId: especialPlan,
      status: "completed",
      startDate: utcOffset(-40),
      endDate: utcOffset(-20),
    });
    // `active` con fin pasado y todavía sin barrer: vencida, no es el plan actual.
    const staleActiveId = await insertSub({
      userId: member.id,
      planId,
      status: "active",
      startDate: utcOffset(-30),
      endDate: utcOffset(-8),
    });

    const { body } = await getSummary(member.token);

    expect(body.current?.id).toBe(currentId);
    expect(body.history.map((h) => h.id)).toEqual([
      staleActiveId,
      completedEspecialId,
      expiredId,
      changedId,
    ]);
  });

  it("active vencida sin barrer y nada más → no hay current, aparece en history", async () => {
    const member = await createTestMember(app);
    const planId = await insertPlan("Plan Vencido Sin Barrer");
    const staleId = await insertSub({
      userId: member.id,
      planId,
      status: "active",
      startDate: utcOffset(-40),
      endDate: utcOffset(-10),
    });

    const { body } = await getSummary(member.token);

    expect(body.current).toBeNull();
    expect(body.next).toBeNull();
    expect(body.history.map((h) => h.id)).toEqual([staleId]);
  });

  it("no expone montos: claves exactas y ni rastro del importe pagado", async () => {
    const member = await createTestMember(app);
    const planId = await insertPlan("Plan Sin Plata");
    await insertSub({
      userId: member.id,
      planId,
      status: "active",
      startDate: utcOffset(-5),
      endDate: utcOffset(25),
    });
    await insertSub({
      userId: member.id,
      planId,
      status: "scheduled",
      startDate: utcOffset(26),
      endDate: utcOffset(56),
    });
    await insertSub({
      userId: member.id,
      planId,
      status: "completed",
      startDate: utcOffset(-40),
      endDate: utcOffset(-10),
    });

    const { raw, body } = await getSummary(member.token);

    const itemKeys = [
      "classesBudget",
      "classesPerWeek",
      "classesRemaining",
      "endDate",
      "id",
      "isNew",
      "pauseEndDate",
      "planCategory",
      "planId",
      "planName",
      "startDate",
      "status",
    ];
    expect(Object.keys(body).sort()).toEqual([
      "current",
      "hasUnseen",
      "history",
      "next",
    ]);
    expect(Object.keys(body.current ?? {}).sort()).toEqual(itemKeys);
    expect(Object.keys(body.next ?? {}).sort()).toEqual(itemKeys);
    expect(body.history).toHaveLength(1);
    expect(Object.keys(body.history[0]).sort()).toEqual([
      "endDate",
      "id",
      "planName",
      "startDate",
    ]);
    expect(raw).not.toContain(String(PRICE_SENTINEL));
    expect(raw.toLowerCase()).not.toContain("price");
  });

  it("nunca tuvo plan → current y next null, history vacío, sin novedades", async () => {
    const member = await createTestMember(app);

    const { statusCode, body } = await getSummary(member.token);

    expect(statusCode).toBe(200);
    expect(body).toEqual({
      current: null,
      next: null,
      history: [],
      hasUnseen: false,
    });
  });

  it("el socio B no ve las suscripciones del socio A (el userId sale del token)", async () => {
    const socioA = await createTestMember(app);
    const socioB = await createTestMember(app);
    const planId = await insertPlan("Plan Del Socio A");
    await insertSub({
      userId: socioA.id,
      planId,
      status: "active",
      startDate: utcOffset(-5),
      endDate: utcOffset(25),
      notified: true,
    });
    await insertSub({
      userId: socioA.id,
      planId,
      status: "completed",
      startDate: utcOffset(-40),
      endDate: utcOffset(-10),
    });

    const ajeno = await getSummary(socioB.token);
    expect(ajeno.body).toEqual({
      current: null,
      next: null,
      history: [],
      hasUnseen: false,
    });

    const propio = await getSummary(socioA.token);
    expect(propio.body.current).not.toBeNull();
    expect(propio.body.history).toHaveLength(1);
    expect(propio.body.hasUnseen).toBe(true);
  });

  it("no acepta userId de la query: responde por el token", async () => {
    const socioA = await createTestMember(app);
    const socioB = await createTestMember(app);
    const planId = await insertPlan("Plan Query");
    await insertSub({
      userId: socioA.id,
      planId,
      status: "active",
      startDate: utcOffset(-5),
      endDate: utcOffset(25),
    });

    const res = await app.inject({
      method: "GET",
      url: `${SUMMARY_URL}?userId=${socioA.id}`,
      headers: { authorization: `Bearer ${socioB.token}` },
    });

    expect(res.statusCode).toBe(200);
    expect((JSON.parse(res.body) as SummaryBody).current).toBeNull();
  });

  it("sin token → 401 en el GET y en el POST seen", async () => {
    const get = await app.inject({ method: "GET", url: SUMMARY_URL });
    expect(get.statusCode).toBe(401);
    const post = await app.inject({ method: "POST", url: SEEN_URL });
    expect(post.statusCode).toBe(401);
  });

  it("isNew / hasUnseen: avisada y sin ver → isNew; POST seen las apaga y devuelve cuántas marcó", async () => {
    const member = await createTestMember(app);
    const planId = await insertPlan("Plan Novedad");
    const activeId = await insertSub({
      userId: member.id,
      planId,
      status: "active",
      startDate: utcOffset(-5),
      endDate: utcOffset(25),
    });
    const scheduledId = await insertSub({
      userId: member.id,
      planId,
      status: "scheduled",
      startDate: utcOffset(26),
      endDate: utcOffset(56),
      notified: true,
    });

    const antes = await getSummary(member.token);
    expect(antes.body.current?.id).toBe(activeId);
    expect(antes.body.current?.isNew).toBe(false);
    expect(antes.body.next?.id).toBe(scheduledId);
    expect(antes.body.next?.isNew).toBe(true);
    expect(antes.body.hasUnseen).toBe(true);
    expect(await getHasUnseenPlanUpdate(member.token)).toBe(true);

    expect(await postSeen(member.token)).toEqual({ updated: 1 });

    const despues = await getSummary(member.token);
    expect(despues.body.next?.isNew).toBe(false);
    expect(despues.body.hasUnseen).toBe(false);
    expect(await getHasUnseenPlanUpdate(member.token)).toBe(false);

    // Idempotente: una segunda vez ya no marca nada.
    expect(await postSeen(member.token)).toEqual({ updated: 0 });
  });

  it("una sub cancelada avisada NO prende la pelotita, y seen no la toca", async () => {
    const member = await createTestMember(app);
    const planId = await insertPlan("Plan Cancelado Avisado");
    const cancelledId = await insertSub({
      userId: member.id,
      planId,
      status: "cancelled",
      startDate: utcOffset(-10),
      endDate: utcOffset(20),
      notified: true,
    });

    const { body } = await getSummary(member.token);
    expect(body.hasUnseen).toBe(false);
    expect(await getHasUnseenPlanUpdate(member.token)).toBe(false);

    // `seen` marca por (notificada y sin ver): incluye la cancelada, que es
    // inofensiva (no se muestra), pero nunca toca filas de otro socio.
    await postSeen(member.token);
    const [row] = await app.db
      .select({ seenAt: schema.subscriptions.memberSeenAt })
      .from(schema.subscriptions)
      .where(
        and(
          tenantWhere(schema.subscriptions, TEMPLO_CTX),
          eq(schema.subscriptions.id, cancelledId),
        ),
      );
    expect(row?.seenAt).not.toBeNull();
  });

  it("POST seen solo marca las filas del socio del token, no las de otro", async () => {
    const socioA = await createTestMember(app);
    const socioB = await createTestMember(app);
    const planId = await insertPlan("Plan Seen Aislado");
    const subA = await insertSub({
      userId: socioA.id,
      planId,
      status: "active",
      startDate: utcOffset(-5),
      endDate: utcOffset(25),
      notified: true,
    });
    const subB = await insertSub({
      userId: socioB.id,
      planId,
      status: "active",
      startDate: utcOffset(-5),
      endDate: utcOffset(25),
      notified: true,
    });

    expect(await postSeen(socioA.token)).toEqual({ updated: 1 });

    const seenOf = async (id: number): Promise<Date | null | undefined> => {
      const [row] = await app.db
        .select({ seenAt: schema.subscriptions.memberSeenAt })
        .from(schema.subscriptions)
        .where(
          and(
            tenantWhere(schema.subscriptions, TEMPLO_CTX),
            eq(schema.subscriptions.id, id),
          ),
        );
      return row?.seenAt;
    };
    expect(await seenOf(subA)).not.toBeNull();
    expect(await seenOf(subB)).toBeNull();
  });
});
