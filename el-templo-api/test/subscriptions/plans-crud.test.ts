import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import { SUBSCRIPTIONS_URL, basePlan, createPlan } from "./_helpers";
import { programs } from "../../src/db/schema/micro-programs";

describe("Subscriptions API — Plans CRUD", () => {
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

  it("POST /plans creates and PUT updates a plan; defaults are applied", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: basePlan,
    });
    expect(res.statusCode).toBe(201);
    const created = JSON.parse(res.body);
    expect(created).toHaveProperty("id");
    expect(created.name).toBe(basePlan.name);
    expect(created.priceRegular).toBe(basePlan.priceRegular);
    expect(created.isActive).toBe(true);
    expect(created.multiBranch).toBe(false);
    expect(created.isTrial).toBe(false);

    const updated = await app.inject({
      method: "PUT",
      url: `${SUBSCRIPTIONS_URL}/plans/${created.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Updated Plan", priceRegular: 20000 },
    });
    expect(updated.statusCode).toBe(200);
    const body = JSON.parse(updated.body);
    expect(body.name).toBe("Updated Plan");
    expect(body.priceRegular).toBe(20000);
    // Unchanged fields preserved
    expect(body.priceZero).toBe(basePlan.priceZero);
  });

  it("POST /plans persists country=ES with currency=EUR; defaults to AR/ARS", async () => {
    const esRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...basePlan, name: "ES Plan", country: "ES" },
    });
    expect(esRes.statusCode).toBe(201);
    const esPlan = JSON.parse(esRes.body);
    expect(esPlan.country).toBe("ES");
    expect(esPlan.currency).toBe("EUR");

    const arRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...basePlan, name: "AR Plan (default country)" },
    });
    expect(arRes.statusCode).toBe(201);
    const arPlan = JSON.parse(arRes.body);
    expect(arPlan.country).toBe("AR");
    expect(arPlan.currency).toBe("ARS");
  });

  it("POST /plans con nombre duplicado (mismo país) → 409, no 500", async () => {
    const first = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...basePlan, name: "Membresía Anual" },
    });
    expect(first.statusCode).toBe(201);

    // Segundo con el mismo nombre + país → conflicto manejado (UNIQUE
    // ux_subscription_plans_name_country), NO un 500 crudo.
    const dup = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...basePlan, name: "Membresía Anual", priceRegular: 99999 },
    });
    expect(dup.statusCode).toBe(409);
    expect(JSON.parse(dup.body).message).toMatch(/ya existe un plan/i);
  });

  it("POST /plans con nombre duplicado pero desactivado (archivable) → 409", async () => {
    const first = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...basePlan, name: "Plan Repetido" },
    });
    expect(first.statusCode).toBe(201);
    const created = JSON.parse(first.body);

    // Desactivar no libera el nombre (el UNIQUE ignora is_active/is_archived).
    const deact = await app.inject({
      method: "PATCH",
      url: `${SUBSCRIPTIONS_URL}/plans/${created.id}/deactivate`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(deact.statusCode).toBe(200);

    const dup = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...basePlan, name: "Plan Repetido" },
    });
    expect(dup.statusCode).toBe(409);
  });

  it("POST /plans mismo nombre en distinto país → permitido (201)", async () => {
    const ar = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...basePlan, name: "Membresía Global", country: "AR" },
    });
    expect(ar.statusCode).toBe(201);

    const es = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...basePlan, name: "Membresía Global", country: "ES" },
    });
    expect(es.statusCode).toBe(201);
  });

  it("PUT /plans/:id renombrando a un nombre ya existente → 409, no 500", async () => {
    const a = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...basePlan, name: "Plan A" },
    });
    expect(a.statusCode).toBe(201);
    const b = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...basePlan, name: "Plan B" },
    });
    expect(b.statusCode).toBe(201);
    const planB = JSON.parse(b.body);

    const rename = await app.inject({
      method: "PUT",
      url: `${SUBSCRIPTIONS_URL}/plans/${planB.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Plan A" },
    });
    expect(rename.statusCode).toBe(409);
  });

  it("POST /plans validates required fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Missing fields" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /plans?isActive=true filters out deactivated plans", async () => {
    const active = await createPlan(app, adminToken, { name: "Active Plan" });
    const toDeactivate = await createPlan(app, adminToken, {
      name: "Deactivated Plan",
    });

    const deactivateRes = await app.inject({
      method: "PATCH",
      url: `${SUBSCRIPTIONS_URL}/plans/${toDeactivate.id}/deactivate`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(deactivateRes.statusCode).toBe(200);
    expect(JSON.parse(deactivateRes.body).isActive).toBe(false);

    const filtered = await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/plans?isActive=true`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(filtered.statusCode).toBe(200);
    const plans = JSON.parse(filtered.body).plans;
    expect(plans).toHaveLength(1);
    expect(plans[0].id).toBe(active.id);
  });

  it("GET /plans/:planId returns 404 for non-existent plan", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/plans/99999`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  describe("Plan invariant: online plans must link a program or grant all", () => {
    it("presencial plan without linkedProgramId is allowed", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          ...basePlan,
          name: "Presencial OK",
          planCategory: "presencial",
        },
      });
      expect(res.statusCode).toBe(201);
    });

    it("online plan without linkedProgramId and without grantsAllPrograms is rejected with 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          ...basePlan,
          name: "Online sin nada",
          planCategory: "online_regular",
        },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toMatch(
        /Planes online deben vincular un programa.*o dar acceso a todos los programas/,
      );
    });

    it("online plan with linkedProgramId is allowed", async () => {
      const inserted = await app.db.insert(programs).values({
        name: "Programa de prueba",
        description: "Programa creado por el test",
        durationWeeks: 4,
        sessionsPerWeekToAdvance: 3,
        goalPlanType: null,
        isActive: true,
      });
      const programId = Number(inserted[0].insertId);

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          ...basePlan,
          name: "Online con programa",
          planCategory: "online_regular",
          linkedProgramId: programId,
        },
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).linkedProgramId).toBe(programId);
    });

    it("online plan with grantsAllPrograms=true is allowed without linkedProgramId", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          ...basePlan,
          name: "Bundle nuevo",
          planCategory: "online_regular",
          grantsAllPrograms: true,
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.grantsAllPrograms).toBe(true);
      expect(body.linkedProgramId).toBeNull();
    });

    it("PUT cannot strip both linkedProgramId and grantsAllPrograms from an online plan", async () => {
      const created = await createPlan(app, adminToken, {
        name: "Bundle a quebrar",
        planCategory: "online_regular",
        grantsAllPrograms: true,
      });
      const res = await app.inject({
        method: "PUT",
        url: `${SUBSCRIPTIONS_URL}/plans/${created.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { grantsAllPrograms: false },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toMatch(
        /Planes online deben vincular un programa.*o dar acceso a todos los programas/,
      );
    });
  });

  it("non-admin user gets 403 on plan and subscription routes", async () => {
    const { token: memberToken } = await registerUser(app, {
      email: "regular-sub-auth@test.com",
      password: "pass123456",
      branchId: 1,
      firstName: "Regular",
      lastName: "Member",
    });

    const endpoints = [
      { method: "GET" as const, url: `${SUBSCRIPTIONS_URL}/plans` },
      {
        method: "POST" as const,
        url: `${SUBSCRIPTIONS_URL}/plans`,
        payload: basePlan,
      },
      {
        method: "GET" as const,
        url: `${SUBSCRIPTIONS_URL}/members/1/subscription`,
      },
    ];

    for (const ep of endpoints) {
      const res = await app.inject({
        method: ep.method,
        url: ep.url,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: "payload" in ep ? ep.payload : undefined,
      });
      expect(
        res.statusCode,
        `Expected 403 for ${ep.method} ${ep.url}, got ${res.statusCode}`,
      ).toBe(403);
    }
  });
});
