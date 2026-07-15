/**
 * Phase 162-02 (APP-02) — member-facing GET
 * /api/members/subscription/me/especial-pass.
 *
 * The endpoint exposes the authenticated member's "Actividades con Aura" pass
 * with its monthly balance (classesRemaining / classesBudget / endDate) plus the
 * Socio↔Externo discriminator, feeding the in-app x/2 counter WITHOUT touching
 * the singular /me/subscription surface.
 *
 * Coverage:
 *  - sin pase → { hasPass: false }.
 *  - pase Socio (plan requires_presencial=1, monthly_class_budget=2) → hasPass:true,
 *    isSocio:true, classesRemaining/classesBudget correctos.
 *  - pase Externo (requires_presencial=0) → isSocio:false.
 *  - IDOR (T-162-02-01): the member id is server-derived from request.user — a
 *    member only ever reads their OWN pass, never another member's.
 *  - requires authentication (401 without a token).
 *
 * Los planes especiales reales entran a prod por migración (INSERT directo). Acá
 * se seedean vía Drizzle (mismo shape que la migración) porque la ruta admin
 * create-plan todavía no persiste monthly_class_budget / requires_presencial —
 * mismo patrón que test/subscriptions/especial-pass.test.ts (161-02).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { todayInTz } from "../../src/modules/shared/date-utils";
import { createMember } from "./_helpers";

const ESPECIAL_PASS_URL = "/api/members/subscription/me/especial-pass";
const AR_TZ = "America/Argentina/Buenos_Aires";
const MEMBER_PASSWORD = "pass123456";

interface EspecialPassBody {
  hasPass: boolean;
  classesRemaining?: number;
  classesBudget?: number;
  endDate?: string | null;
  isSocio?: boolean;
}

function arDateOffset(days: number): string {
  const today = todayInTz(AR_TZ);
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

describe("Subscriptions — GET /me/especial-pass (member especial pass endpoint)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  /**
   * Seed an especial plan via Drizzle (same shape as the prod migration):
   * classes_per_week NULL + explicit monthly_class_budget + requires_presencial
   * per Socio/Externo.
   */
  async function seedEspecialPlan(
    name: string,
    requiresPresencial: boolean,
  ): Promise<number> {
    const res = await app.db.insert(schema.subscriptionPlans).values({
      name,
      planTier: "other",
      bookingMode: "flexible",
      planCategory: "especial",
      priceRegular: requiresPresencial ? 10000 : 20000,
      priceZero: requiresPresencial ? 10000 : 20000,
      durationDays: 30,
      classesPerWeek: null,
      monthlyClassBudget: 2,
      requiresPresencial,
      country: "AR",
      currency: "ARS",
    });
    return Number(res[0].insertId);
  }

  /** Insert an active especial subscription with an explicit class balance. */
  async function insertEspecialSub(
    userId: number,
    planId: number,
    classesRemaining: number,
    classesBudget: number,
    endDate: string,
  ): Promise<void> {
    await app.db.insert(schema.subscriptions).values({
      userId,
      planId,
      branchId: 1,
      status: "active",
      startDate: arDateOffset(-1),
      endDate,
      pricePaid: 20000,
      priceTypeApplied: "regular",
      classesRemaining,
      classesBudget,
    });
  }

  it("returns { hasPass: false } for a member with no especial pass", async () => {
    await createMember(app, { email: "ep-none@test.com" });
    const token = await getAuthToken(app, "ep-none@test.com", MEMBER_PASSWORD);

    const res = await app.inject({
      method: "GET",
      url: ESPECIAL_PASS_URL,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as EspecialPassBody;
    expect(body.hasPass).toBe(false);
    expect(body.classesRemaining).toBeUndefined();
    expect(body.isSocio).toBeUndefined();
  });

  it("returns the pass with isSocio:true + balance for a Socio pass", async () => {
    const member = await createMember(app, { email: "ep-socio@test.com" });
    const planId = await seedEspecialPlan("Pase Socio member", true);
    const endDate = arDateOffset(20);
    await insertEspecialSub(member.id, planId, 1, 2, endDate);
    const token = await getAuthToken(app, "ep-socio@test.com", MEMBER_PASSWORD);

    const res = await app.inject({
      method: "GET",
      url: ESPECIAL_PASS_URL,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as EspecialPassBody;
    expect(body.hasPass).toBe(true);
    expect(body.isSocio).toBe(true);
    expect(body.classesRemaining).toBe(1);
    expect(body.classesBudget).toBe(2);
    expect(body.endDate).toBe(endDate);
  });

  it("returns isSocio:false for an Externo pass", async () => {
    const member = await createMember(app, { email: "ep-externo@test.com" });
    const planId = await seedEspecialPlan("Pase Externo member", false);
    await insertEspecialSub(member.id, planId, 2, 2, arDateOffset(20));
    const token = await getAuthToken(
      app,
      "ep-externo@test.com",
      MEMBER_PASSWORD,
    );

    const res = await app.inject({
      method: "GET",
      url: ESPECIAL_PASS_URL,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as EspecialPassBody;
    expect(body.hasPass).toBe(true);
    expect(body.isSocio).toBe(false);
    expect(body.classesRemaining).toBe(2);
    expect(body.classesBudget).toBe(2);
  });

  it("is server-derived: a member only ever reads their OWN pass (IDOR)", async () => {
    // Member B has a pass; member A has none. A's token must return A's
    // (hasPass:false) — there is no way to query B's id through this route.
    const memberB = await createMember(app, { email: "ep-idor-b@test.com" });
    const planId = await seedEspecialPlan("Pase IDOR B", false);
    await insertEspecialSub(memberB.id, planId, 2, 2, arDateOffset(20));
    await createMember(app, { email: "ep-idor-a@test.com" });

    const tokenA = await getAuthToken(
      app,
      "ep-idor-a@test.com",
      MEMBER_PASSWORD,
    );
    const res = await app.inject({
      method: "GET",
      url: ESPECIAL_PASS_URL,
      headers: { authorization: `Bearer ${tokenA}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as EspecialPassBody;
    // A's own pass — NOT B's.
    expect(body.hasPass).toBe(false);
  });

  it("requires authentication (401 without a token)", async () => {
    const res = await app.inject({ method: "GET", url: ESPECIAL_PASS_URL });
    expect(res.statusCode).toBe(401);
  });
});
