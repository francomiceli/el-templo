import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { subscriptions } from "../../src/db/schema/subscriptions";
import {
  SUBSCRIPTIONS_URL,
  basePlan,
  createPlan,
  createMember,
  assignPlan,
  seedAuraBalance,
  todayStr,
  dateOffsetStr,
} from "./_helpers";

describe("Subscriptions API — Lifecycle", () => {
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

  describe("Assign", () => {
    it("assigns plan to member with correct dates and pricing", async () => {
      const plan = await createPlan(app, adminToken);
      const member = await createMember(app);

      const { statusCode, body } = await assignPlan(
        app,
        adminToken,
        member.id,
        {
          planId: plan.id,
          priceTypeApplied: "regular",
          startDate: todayStr(),
        },
      );

      expect(statusCode).toBe(201);
      expect(body.userId).toBe(member.id);
      expect(body.planId).toBe(plan.id);
      expect(body.planName).toBe(basePlan.name);
      expect(body.status).toBe("active");
      expect(body.startDate).toBe(todayStr());
      expect(body.endDate).toBe(dateOffsetStr(30));
      expect(body.pricePaid).toBe(basePlan.priceRegular);
      expect(body.priceTypeApplied).toBe("regular");
      expect(body.branchName).toBeTruthy();
    });

    it("uses priceZero when boardingPass=true", async () => {
      const plan = await createPlan(app, adminToken);
      const member = await createMember(app);

      const { statusCode, body } = await assignPlan(
        app,
        adminToken,
        member.id,
        {
          planId: plan.id,
          boardingPass: true,
          startDate: todayStr(),
          priceTypeApplied: "regular",
        },
      );

      expect(statusCode).toBe(201);
      expect(body.pricePaid).toBe(basePlan.priceZero);
      expect(body.boardingPassUsed).toBe(true);
      expect(body.priceTypeApplied).toBe("zero");
    });

    it("returns 409 when boardingPass already used", async () => {
      const plan = await createPlan(app, adminToken);
      const member = await createMember(app);

      const first = await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        boardingPass: true,
        startDate: todayStr(),
      });
      expect(first.statusCode).toBe(201);

      // Cancel so we can attempt another assign
      await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/cancel`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      const second = await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        boardingPass: true,
        startDate: dateOffsetStr(5),
      });
      expect(second.statusCode).toBe(409);
      expect(second.body.message).toContain("boarding pass");
    });

    it("applies AURA discount and deducts balance", async () => {
      const plan = await createPlan(app, adminToken);
      const member = await createMember(app);
      await seedAuraBalance(app, member.id, 1000);

      const { statusCode, body } = await assignPlan(
        app,
        adminToken,
        member.id,
        {
          planId: plan.id,
          priceTypeApplied: "regular",
          auraSpend: 1000,
        },
      );

      expect(statusCode).toBe(201);
      expect(body.auraDiscount).toBe(1000);
      expect(body.auraDiscountPercent).toBe(10);
      expect(body.pricePaid).toBe(13500);
    });

    it("returns 400 when AURA balance is insufficient", async () => {
      const plan = await createPlan(app, adminToken);
      const member = await createMember(app);

      const { statusCode, body } = await assignPlan(
        app,
        adminToken,
        member.id,
        {
          planId: plan.id,
          priceTypeApplied: "regular",
          auraSpend: 1000,
        },
      );

      expect(statusCode).toBe(400);
      expect(body.message).toContain("Insufficient");
    });

    it("uses priceOverrideAmount when provided with reason", async () => {
      const plan = await createPlan(app, adminToken);
      const member = await createMember(app);

      const { statusCode, body } = await assignPlan(
        app,
        adminToken,
        member.id,
        {
          planId: plan.id,
          priceOverrideAmount: 5000,
          priceOverrideReason: "Descuento familiar",
        },
      );

      expect(statusCode).toBe(201);
      expect(body.pricePaid).toBe(5000);
      expect(body.priceOverrideAmount).toBe(5000);
      expect(body.priceOverrideReason).toBe("Descuento familiar");
    });

    it("returns 400 when priceOverrideAmount is provided without reason", async () => {
      const plan = await createPlan(app, adminToken);
      const member = await createMember(app);

      const { statusCode, body } = await assignPlan(
        app,
        adminToken,
        member.id,
        {
          planId: plan.id,
          priceOverrideAmount: 5000,
        },
      );

      expect(statusCode).toBe(400);
      expect(body.message).toContain("razon");
    });
  });

  describe("Get + auto-expire", () => {
    it("GET /subscription returns active subscription", async () => {
      const plan = await createPlan(app, adminToken);
      const member = await createMember(app);
      await assignPlan(app, adminToken, member.id, { planId: plan.id });

      const res = await app.inject({
        method: "GET",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("active");
      expect(body.planName).toBe(basePlan.name);
      expect(body.branchName).toBeTruthy();
    });

    it("GET auto-expires subscription when endDate is in the past", async () => {
      const plan = await createPlan(app, adminToken, { durationDays: 1 });
      const member = await createMember(app);

      // Assign within validation window, then force endDate into the past so
      // auto-expire kicks in. The validation window blocks "2025-01-01"-style
      // historical fixtures.
      await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        startDate: dateOffsetStr(-2),
      });
      await app.db
        .update(subscriptions)
        .set({ startDate: dateOffsetStr(-10), endDate: dateOffsetStr(-5) })
        .where(eq(subscriptions.userId, member.id));

      const res = await app.inject({
        method: "GET",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(404);

      const historyRes = await app.inject({
        method: "GET",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/history`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(historyRes.statusCode).toBe(200);
      const historyBody = JSON.parse(historyRes.body);
      expect(historyBody.subscriptions).toHaveLength(1);
      expect(historyBody.subscriptions[0].status).toBe("expired");
    });
  });

  describe("Pause / resume / cancel", () => {
    it("POST pause changes status to paused", async () => {
      const plan = await createPlan(app, adminToken);
      const member = await createMember(app);
      await assignPlan(app, adminToken, member.id, { planId: plan.id });

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/pause`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("paused");
      expect(body.pausedAt).toBeTruthy();
    });

    it("pause with pauseEndDate stores value and auto-resume reactivates", async () => {
      const plan = await createPlan(app, adminToken, { durationDays: 30 });
      const member = await createMember(app);
      await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        startDate: todayStr(),
      });

      const tomorrow = dateOffsetStr(1);

      const pauseRes = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/pause`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { pauseEndDate: tomorrow },
      });
      expect(pauseRes.statusCode).toBe(200);
      const pauseBody = JSON.parse(pauseRes.body);
      expect(pauseBody.status).toBe("paused");
      expect(pauseBody.pauseEndDate).toBe(tomorrow);

      // Fast-forward: move pauseEndDate into the past so it's due
      await app.db
        .update(subscriptions)
        .set({ pauseEndDate: dateOffsetStr(-1) })
        .where(eq(subscriptions.userId, member.id));

      // Run auto-resume directly via the service
      const { SubscriptionService } =
        await import("../../src/modules/subscriptions/service");
      const { AuraService } = await import("../../src/modules/aura");
      const { TransactionService, BalanceService } =
        await import("../../src/modules/finance");
      const aura = new AuraService(app.db);
      const balances = new BalanceService(app.db, app.log);
      const txns = new TransactionService(app.db, app.log, balances);
      const svc = new SubscriptionService(app.db, app.log, aura, txns);
      const resumed = await svc.autoResumeDuePauses();
      expect(resumed).toBe(1);

      const [sub] = await app.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, member.id));
      expect(sub.status).toBe("active");
      expect(sub.pauseEndDate).toBeNull();
      expect(sub.pausedAt).toBeNull();
    });

    it("pause rejects pauseEndDate in the past", async () => {
      const plan = await createPlan(app, adminToken);
      const member = await createMember(app);
      await assignPlan(app, adminToken, member.id, { planId: plan.id });

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/pause`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { pauseEndDate: dateOffsetStr(-1) },
      });

      expect(res.statusCode).toBe(400);
    });

    it("manual resume clears pauseEndDate", async () => {
      const plan = await createPlan(app, adminToken, { durationDays: 30 });
      const member = await createMember(app);
      await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        startDate: todayStr(),
      });

      await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/pause`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { pauseEndDate: dateOffsetStr(1) },
      });

      const resumeRes = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/resume`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(resumeRes.statusCode).toBe(200);
      const body = JSON.parse(resumeRes.body);
      expect(body.status).toBe("active");
      expect(body.pauseEndDate).toBeNull();
    });

    it("resume extends endDate", async () => {
      const plan = await createPlan(app, adminToken, { durationDays: 30 });
      const member = await createMember(app);
      await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        startDate: todayStr(),
      });

      await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/pause`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/resume`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("active");
      expect(body.resumedAt).toBeTruthy();
      expect(body.endDate >= todayStr()).toBe(true);
    });

    it("cancel sets status and stores notes", async () => {
      const plan = await createPlan(app, adminToken);
      const member = await createMember(app);
      await assignPlan(app, adminToken, member.id, { planId: plan.id });

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/cancel`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { notes: "Solicitud del alumno" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("cancelled");
      expect(body.cancelledAt).toBeTruthy();
      expect(body.notes).toBe("Solicitud del alumno");
    });

    it("cancel works on a paused subscription", async () => {
      const plan = await createPlan(app, adminToken);
      const member = await createMember(app);
      await assignPlan(app, adminToken, member.id, { planId: plan.id });

      await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/pause`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/cancel`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).status).toBe("cancelled");
    });
  });

  describe("Pricing preview", () => {
    it("returns base price and boarding pass eligibility", async () => {
      const plan = await createPlan(app, adminToken);
      const member = await createMember(app);

      const res = await app.inject({
        method: "GET",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/pricing-preview?planId=${plan.id}&priceType=regular`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.basePrice).toBe(basePlan.priceRegular);
      expect(body.finalPrice).toBe(basePlan.priceRegular);
      expect(body.boardingPassEligible).toBe(true);
      expect(body.auraBalance).toBe(0);
      expect(body.discountType).toBe("none");
      expect(body.availableTiers).toHaveLength(0);
    });

    it("shows AURA tiers when member has balance", async () => {
      const plan = await createPlan(app, adminToken);
      const member = await createMember(app);
      await seedAuraBalance(app, member.id, 2500);

      const res = await app.inject({
        method: "GET",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/pricing-preview?planId=${plan.id}&priceType=regular&auraSpend=2000`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.auraBalance).toBe(2500);
      expect(body.discountType).toBe("aura");
      expect(body.auraToSpend).toBe(2000);
      expect(body.discountAmount).toBe(3000);
      expect(body.finalPrice).toBe(12000);
      expect(body.availableTiers).toHaveLength(3);
    });
  });

  describe("History", () => {
    it("returns all subscriptions including cancelled and scheduled", async () => {
      const plan = await createPlan(app, adminToken);
      const member = await createMember(app);

      const firstStart = dateOffsetStr(5);
      const secondStart = dateOffsetStr(40);

      await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        startDate: firstStart,
      });
      await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/cancel`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        startDate: secondStart,
      });

      const res = await app.inject({
        method: "GET",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/history`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.subscriptions).toHaveLength(2);

      const cancelledSub = body.subscriptions.find(
        (s: Record<string, unknown>) => s.startDate === firstStart,
      );
      expect(cancelledSub.status).toBe("cancelled");

      const futureSub = body.subscriptions.find(
        (s: Record<string, unknown>) => s.startDate === secondStart,
      );
      expect(futureSub.status).toBe("scheduled");
    });
  });
});
