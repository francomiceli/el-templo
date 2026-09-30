/**
 * Línea del pase especial (2026-09-29, yoga de Moreno) — planes y asignación.
 *
 * `subscription_plans.special_line` (NULL = "Actividades con Aura") define de
 * qué línea es un pase especial. Cubre:
 *   - CRUD de planes: create/update persisten `specialLine` en especiales y la
 *     devuelven; texto vacío → NULL; en un plan NO especial → 400; sacar el
 *     plan de especial limpia la línea sola.
 *   - assignPlan: un pase de Aura y uno de Yoga CONVIVEN en el mismo socio;
 *     dos de la MISMA línea se solapan → 409 con el nombre de la línea.
 *   - pickSubscriptionForActivity rutea por línea (sin caer en otra línea).
 *   - GET /api/members/subscription/me/especial-pass devuelve `passes[]` con
 *     un pase por línea y los campos sueltos legacy del primero.
 *
 * Molde: especial-pass-core.test.ts / especial-pass-member.test.ts /
 * plans-crud.test.ts (bloque "Pase especial").
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import {
  SUBSCRIPTIONS_URL,
  basePlan,
  createPlan,
  createMember,
  assignPlan,
} from "./_helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { SubscriptionService } from "../../src/modules/subscriptions/service";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
const ESPECIAL_PASS_URL = "/api/members/subscription/me/especial-pass";
const MEMBER_PASSWORD = "pass123456";

interface EspecialPassBody {
  hasPass: boolean;
  classesRemaining?: number | null;
  classesBudget?: number | null;
  endDate?: string | null;
  isSocio?: boolean;
  passes?: Array<{
    specialLine: string | null;
    lineLabel: string;
    planName: string;
    classesRemaining: number | null;
    classesBudget: number | null;
    endDate: string | null;
    isSocio: boolean;
  }>;
}

describe("Línea del pase especial — planes y asignación", () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  const especialBase = {
    ...basePlan,
    classesPerWeek: undefined,
    planCategory: "especial",
    monthlyClassBudget: 4,
    durationDays: 30,
  };

  async function createAuraPlan(name = "Pase Aura línea") {
    return createPlan(app, adminToken, { ...especialBase, name });
  }

  async function createYogaPlan(name = "Pase Yoga línea") {
    return createPlan(app, adminToken, {
      ...especialBase,
      name,
      specialLine: "Yoga",
    });
  }

  async function getPlan(planId: number): Promise<Record<string, unknown>> {
    const res = await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/plans/${planId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body) as Record<string, unknown>;
  }

  async function putPlan(planId: number, payload: Record<string, unknown>) {
    return app.inject({
      method: "PUT",
      url: `${SUBSCRIPTIONS_URL}/plans/${planId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload,
    });
  }

  async function dbSpecialLine(planId: number): Promise<string | null> {
    const [row] = await app.db
      .select({ specialLine: schema.subscriptionPlans.specialLine })
      .from(schema.subscriptionPlans)
      .where(
        and(
          tenantWhere(schema.subscriptionPlans, TEMPLO_CTX),
          eq(schema.subscriptionPlans.id, planId),
        ),
      );
    return row?.specialLine ?? null;
  }

  // ── Plans CRUD ──────────────────────────────────────────────────────────
  describe("CRUD de planes", () => {
    it("POST especial con specialLine persiste la línea y la devuelve (create, GET y DB)", async () => {
      const created = await createYogaPlan();
      expect(created.planCategory).toBe("especial");
      expect(created.specialLine).toBe("Yoga");

      expect((await getPlan(created.id)).specialLine).toBe("Yoga");
      expect(await dbSpecialLine(created.id)).toBe("Yoga");
    });

    it("POST especial SIN specialLine queda en NULL (línea Actividades con Aura)", async () => {
      const created = await createAuraPlan();
      expect(created.specialLine).toBeNull();
      expect(await dbSpecialLine(created.id)).toBeNull();
    });

    it("POST especial: la línea se recorta y el texto vacío colapsa a NULL", async () => {
      const trimmed = await createPlan(app, adminToken, {
        ...especialBase,
        name: "Pase línea con espacios",
        specialLine: "  Yoga  ",
      });
      expect(trimmed.specialLine).toBe("Yoga");

      const blank = await createPlan(app, adminToken, {
        ...especialBase,
        name: "Pase línea vacía",
        specialLine: "   ",
      });
      expect(blank.specialLine).toBeNull();
    });

    it("POST presencial con specialLine → 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          ...basePlan,
          name: "Presencial con línea",
          specialLine: "Yoga",
        },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toMatch(/Solo los planes especiales/);
    });

    it("PUT cambia y limpia la línea de un especial", async () => {
      const plan = await createAuraPlan();

      const toYoga = await putPlan(plan.id, { specialLine: "Yoga" });
      expect(toYoga.statusCode).toBe(200);
      expect(await dbSpecialLine(plan.id)).toBe("Yoga");
      expect((await getPlan(plan.id)).specialLine).toBe("Yoga");

      const cleared = await putPlan(plan.id, { specialLine: null });
      expect(cleared.statusCode).toBe(200);
      expect(await dbSpecialLine(plan.id)).toBeNull();
    });

    it("PUT specialLine sobre un presencial → 400 (y no se persiste)", async () => {
      const presencial = await createPlan(app, adminToken, {
        name: "Presencial PUT línea",
      });
      const res = await putPlan(presencial.id, { specialLine: "Yoga" });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toMatch(/Solo los planes especiales/);
      expect(await dbSpecialLine(presencial.id)).toBeNull();
    });

    it("PUT que saca el plan de especial limpia la línea solo", async () => {
      const plan = await createYogaPlan("Pase Yoga que deja de ser pase");
      const res = await putPlan(plan.id, {
        planCategory: "presencial",
        classesPerWeek: 3,
      });
      expect(res.statusCode).toBe(200);
      expect(await dbSpecialLine(plan.id)).toBeNull();
      expect((await getPlan(plan.id)).planCategory).toBe("presencial");
    });
  });

  // ── assignPlan ──────────────────────────────────────────────────────────
  describe("assignPlan — choque de pases por línea", () => {
    it("pase de Aura + pase de Yoga CONVIVEN en el mismo socio (ambos 201, ambos activos)", async () => {
      const aura = await createAuraPlan();
      const yoga = await createYogaPlan();
      const member = await createMember(app);

      const rAura = await assignPlan(app, adminToken, member.id, {
        planId: aura.id,
      });
      expect(rAura.statusCode).toBe(201);
      const rYoga = await assignPlan(app, adminToken, member.id, {
        planId: yoga.id,
      });
      expect(rYoga.statusCode).toBe(201);
      expect(rYoga.body.id).not.toBe(rAura.body.id);

      // Cada sub con el saldo de SU plan y ambas vigentes en DB.
      const subs = await app.db
        .select({
          id: schema.subscriptions.id,
          status: schema.subscriptions.status,
          classesRemaining: schema.subscriptions.classesRemaining,
        })
        .from(schema.subscriptions)
        .where(
          and(
            tenantWhere(schema.subscriptions, TEMPLO_CTX),
            eq(schema.subscriptions.userId, member.id),
          ),
        );
      expect(subs).toHaveLength(2);
      for (const s of subs) {
        expect(s.status).toBe("active");
        expect(s.classesRemaining).toBe(4);
      }
    });

    it("un SEGUNDO pase de Yoga solapado → 409 con la línea en el mensaje", async () => {
      const yoga1 = await createYogaPlan("Yoga — Pack 4");
      const yoga2 = await createYogaPlan("Yoga — 2 x semana");
      const member = await createMember(app);

      expect(
        (await assignPlan(app, adminToken, member.id, { planId: yoga1.id }))
          .statusCode,
      ).toBe(201);

      const dup = await assignPlan(app, adminToken, member.id, {
        planId: yoga2.id,
      });
      expect(dup.statusCode).toBe(409);
      expect(String(dup.body.message)).toBe(
        "El miembro ya tiene un pase de Yoga activo",
      );
    });

    it("un SEGUNDO pase de Aura solapado sigue siendo 409 ('Actividades con Aura')", async () => {
      const aura1 = await createAuraPlan("Aura — Pack A");
      const aura2 = await createAuraPlan("Aura — Pack B");
      const member = await createMember(app);

      expect(
        (await assignPlan(app, adminToken, member.id, { planId: aura1.id }))
          .statusCode,
      ).toBe(201);

      const dup = await assignPlan(app, adminToken, member.id, {
        planId: aura2.id,
      });
      expect(dup.statusCode).toBe(409);
      expect(String(dup.body.message)).toBe(
        "El miembro ya tiene un pase de Actividades con Aura activo",
      );
    });

    it("el choque compara la línea sin distinguir mayúsculas ('yoga' choca con 'Yoga')", async () => {
      const yoga = await createYogaPlan();
      const yogaLower = await createPlan(app, adminToken, {
        ...especialBase,
        name: "Yoga minúscula",
        specialLine: "yoga",
      });
      const member = await createMember(app);

      expect(
        (await assignPlan(app, adminToken, member.id, { planId: yoga.id }))
          .statusCode,
      ).toBe(201);
      expect(
        (await assignPlan(app, adminToken, member.id, { planId: yogaLower.id }))
          .statusCode,
      ).toBe(409);
    });
  });

  // ── pickSubscriptionForActivity ─────────────────────────────────────────
  describe("pickSubscriptionForActivity — ruteo por línea", () => {
    it("devuelve el pase de la línea pedida y null si el socio solo tiene otra línea", async () => {
      const aura = await createAuraPlan();
      const yoga = await createYogaPlan();
      const memberBoth = await createMember(app, { email: "pick-both@test.com" });
      const memberAuraOnly = await createMember(app, {
        email: "pick-aura@test.com",
      });
      await assignPlan(app, adminToken, memberBoth.id, { planId: aura.id });
      await assignPlan(app, adminToken, memberBoth.id, { planId: yoga.id });
      await assignPlan(app, adminToken, memberAuraOnly.id, {
        planId: aura.id,
      });

      const svc = new SubscriptionService(app.db, app.log);

      const yogaSub = await svc.pickSubscriptionForActivity(
        TEMPLO_CTX,
        memberBoth.id,
        true,
        "Yoga",
      );
      expect(yogaSub?.planName).toBe("Pase Yoga línea");
      expect(yogaSub?.specialLine).toBe("Yoga");

      const auraSub = await svc.pickSubscriptionForActivity(
        TEMPLO_CTX,
        memberBoth.id,
        true,
        null,
      );
      expect(auraSub?.planName).toBe("Pase Aura línea");
      expect(auraSub?.specialLine).toBeNull();

      // Socio solo con Aura: Yoga → null (no cae en otra línea).
      expect(
        await svc.pickSubscriptionForActivity(
          TEMPLO_CTX,
          memberAuraOnly.id,
          true,
          "Yoga",
        ),
      ).toBeNull();
    });
  });

  // ── GET /me/especial-pass ───────────────────────────────────────────────
  describe("GET /me/especial-pass — passes[] por línea", () => {
    async function getMyPass(email: string): Promise<EspecialPassBody> {
      const token = await getAuthToken(app, email, MEMBER_PASSWORD);
      const res = await app.inject({
        method: "GET",
        url: ESPECIAL_PASS_URL,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      return JSON.parse(res.body) as EspecialPassBody;
    }

    it("sin pase → { hasPass:false, passes: [] }", async () => {
      await createMember(app, { email: "ep-line-none@test.com" });
      const body = await getMyPass("ep-line-none@test.com");
      expect(body.hasPass).toBe(false);
      expect(body.passes).toEqual([]);
    });

    it("con pase de Aura y de Yoga devuelve los DOS en passes[] (línea, etiqueta, saldo) y legacy = primero", async () => {
      const aura = await createAuraPlan();
      const yoga = await createYogaPlan();
      const member = await createMember(app, { email: "ep-line-both@test.com" });
      await assignPlan(app, adminToken, member.id, { planId: aura.id });
      await assignPlan(app, adminToken, member.id, { planId: yoga.id });

      // Consumo del pase de Yoga: solo ese saldo baja.
      await app.db
        .update(schema.subscriptions)
        .set({ classesRemaining: 3 })
        .where(
          and(
            tenantWhere(schema.subscriptions, TEMPLO_CTX),
            eq(schema.subscriptions.userId, member.id),
            eq(schema.subscriptions.planId, yoga.id),
          ),
        );

      const body = await getMyPass("ep-line-both@test.com");
      expect(body.hasPass).toBe(true);
      expect(body.passes).toHaveLength(2);

      const yogaPass = body.passes?.find((p) => p.specialLine === "Yoga");
      const auraPass = body.passes?.find((p) => p.specialLine === null);
      expect(yogaPass).toMatchObject({
        lineLabel: "Yoga",
        planName: "Pase Yoga línea",
        classesRemaining: 3,
        classesBudget: 4,
        isSocio: false,
      });
      expect(auraPass).toMatchObject({
        lineLabel: "Actividades con Aura",
        planName: "Pase Aura línea",
        classesRemaining: 4,
        classesBudget: 4,
        isSocio: false,
      });

      // Campos sueltos (builds viejos del app) = el primero de passes[].
      const first = body.passes?.[0];
      expect(body.classesRemaining).toBe(first?.classesRemaining);
      expect(body.classesBudget).toBe(first?.classesBudget);
      expect(body.endDate).toBe(first?.endDate);
      expect(body.isSocio).toBe(first?.isSocio);
    });

    it("con un solo pase de Yoga devuelve un único elemento con specialLine 'Yoga'", async () => {
      const yoga = await createYogaPlan();
      const member = await createMember(app, { email: "ep-line-yoga@test.com" });
      await assignPlan(app, adminToken, member.id, { planId: yoga.id });

      const body = await getMyPass("ep-line-yoga@test.com");
      expect(body.hasPass).toBe(true);
      expect(body.passes).toHaveLength(1);
      expect(body.passes?.[0].specialLine).toBe("Yoga");
      expect(body.passes?.[0].lineLabel).toBe("Yoga");
      expect(body.classesRemaining).toBe(4);
    });
  });
});
