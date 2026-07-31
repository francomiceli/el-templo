import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { financialTransactions } from "../../src/db/schema/financial-transactions";
import { transactionLinks } from "../../src/db/schema/transaction-links";
import { programs } from "../../src/db/schema/micro-programs";
import { programEnrollments } from "../../src/db/schema/program-enrollments";
import {
  SUBSCRIPTIONS_URL,
  createPlan,
  createMember,
  assignPlan,
  todayStr,
  dateOffsetStr,
} from "./_helpers";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

/**
 * 172-15: `TEMPLO_CTX` es el gimnasio de este archivo. Las queries directas de
 * los tests pasan por `app.dbPool` igual que las de la app, asi que con
 * `finance` en `TENANT_STRICT_MODULES` una lectura o una siembra sobre las
 * tablas strict sin gimnasio hace throw antes de llegar a MySQL.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

describe("Subscriptions API — Change plan", () => {
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

  describe("Proration", () => {
    it("upgrade allowed — unlimited plan prorates by remaining days", async () => {
      const planA = await createPlan(app, adminToken, {
        name: "Plan A Unlimited",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      const planB = await createPlan(app, adminToken, {
        name: "Plan B Premium",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 15000,
        priceZero: 10000,
      });
      const member = await createMember(app);

      await assignPlan(app, adminToken, member.id, {
        planId: planA.id,
        startDate: dateOffsetStr(-15),
      });

      const previewRes = await app.inject({
        method: "GET",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan-preview?targetPlanId=${planB.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(previewRes.statusCode).toBe(200);
      const preview = JSON.parse(previewRes.body);
      expect(preview.allowed).toBe(true);
      expect(preview.currentPlan.id).toBe(planA.id);
      expect(preview.targetPlan.id).toBe(planB.id);
      expect(preview.proration.remainingValue).toBeGreaterThan(0);
      expect(preview.proration.remainingDetail).toContain("dias");
      expect(preview.netAmount).toBeLessThan(15000);
      expect(preview.netAmount).toBeGreaterThanOrEqual(0);
    });

    it("upgrade allowed — class-based plan prorates by remaining classes", async () => {
      const planA = await createPlan(app, adminToken, {
        name: "Plan A Classes",
        classesPerWeek: 3,
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
      });
      const planB = await createPlan(app, adminToken, {
        name: "Plan B Classes Premium",
        classesPerWeek: 5,
        durationDays: 30,
        priceRegular: 12000,
        priceZero: 8000,
      });
      const member = await createMember(app);

      await assignPlan(app, adminToken, member.id, {
        planId: planA.id,
        startDate: todayStr(),
      });

      // budget is 15, remaining 6 → credit = round((6/15)*8000) = 3200
      await app.db
        .update(subscriptions)
        .set({ classesRemaining: 6 })
        .where(eq(subscriptions.userId, member.id));

      const previewRes = await app.inject({
        method: "GET",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan-preview?targetPlanId=${planB.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(previewRes.statusCode).toBe(200);
      const preview = JSON.parse(previewRes.body);
      expect(preview.allowed).toBe(true);
      expect(preview.proration.remainingValue).toBe(3200);
      expect(preview.proration.remainingDetail).toBe("6/15 clases");
      expect(preview.netAmount).toBe(8800);
    });

    it("downgrade blocked — returns allowed=false with expiry date", async () => {
      const planA = await createPlan(app, adminToken, {
        name: "Plan A Expensive",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 15000,
        priceZero: 10000,
      });
      const planB = await createPlan(app, adminToken, {
        name: "Plan B Cheap",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      const member = await createMember(app);

      await assignPlan(app, adminToken, member.id, {
        planId: planA.id,
        startDate: todayStr(),
      });

      const previewRes = await app.inject({
        method: "GET",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan-preview?targetPlanId=${planB.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(previewRes.statusCode).toBe(200);
      const preview = JSON.parse(previewRes.body);
      expect(preview.allowed).toBe(false);
      expect(preview.reason).toContain("menor precio");
      expect(preview.expiryDate).toBe(dateOffsetStr(30));
      expect(preview.proration).toBeNull();
      expect(preview.netAmount).toBeNull();
    });

    it("same price allowed — calculates proration normally", async () => {
      const planA = await createPlan(app, adminToken, {
        name: "Plan A Same",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      const planC = await createPlan(app, adminToken, {
        name: "Plan C Same Price",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      const member = await createMember(app);

      await assignPlan(app, adminToken, member.id, {
        planId: planA.id,
        startDate: todayStr(),
      });

      const previewRes = await app.inject({
        method: "GET",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan-preview?targetPlanId=${planC.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(previewRes.statusCode).toBe(200);
      const preview = JSON.parse(previewRes.body);
      expect(preview.allowed).toBe(true);
      expect(preview.proration).toBeTruthy();
      expect(preview.netAmount).toBeGreaterThanOrEqual(0);
    });

    it("POST change-plan blocks downgrade with 400", async () => {
      const planA = await createPlan(app, adminToken, {
        name: "Plan Expensive Post",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 15000,
        priceZero: 10000,
      });
      const planB = await createPlan(app, adminToken, {
        name: "Plan Cheap Post",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      const member = await createMember(app);

      await assignPlan(app, adminToken, member.id, {
        planId: planA.id,
        startDate: todayStr(),
      });

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: planB.id,
          branchId: 1,
          startDate: todayStr(),
          priceTypeApplied: "regular",
          paymentMethod: "cash",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain("menor precio");
    });

    it("POST change-plan upgrade records payment for net amount", async () => {
      const planA = await createPlan(app, adminToken, {
        name: "Plan A Payment",
        classesPerWeek: 3,
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
      });
      const planB = await createPlan(app, adminToken, {
        name: "Plan B Payment",
        classesPerWeek: 5,
        durationDays: 30,
        priceRegular: 12000,
        priceZero: 8000,
      });
      const member = await createMember(app);

      const assignResult = await assignPlan(app, adminToken, member.id, {
        planId: planA.id,
        startDate: todayStr(),
      });
      const oldSubId = assignResult.body.id;

      await app.db
        .update(subscriptions)
        .set({ classesRemaining: 6 })
        .where(eq(subscriptions.userId, member.id));

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: planB.id,
          branchId: 1,
          startDate: todayStr(),
          priceTypeApplied: "regular",
          paymentMethod: "cash",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.planId).toBe(planB.id);
      expect(body.previousSubscriptionId).toBe(oldSubId);

      const oldSubRows = await app.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, oldSubId as number));
      expect(oldSubRows[0].status).toBe("changed");

      // Plan 105-06: payments table dropped — verify against
      // financial_transactions joined via transaction_links pivot.
      const txnRows = await app.db
        .select({
          id: financialTransactions.id,
          amount: financialTransactions.amount,
          paymentMethod: financialTransactions.paymentMethod,
          targetId: transactionLinks.targetId,
        })
        .from(financialTransactions)
        .leftJoin(
          transactionLinks,
          and(
            tenantWhere(transactionLinks, TEMPLO_CTX),
            eq(transactionLinks.transactionId, financialTransactions.id),
          ),
        )
        .where(
          and(
            tenantWhere(financialTransactions, TEMPLO_CTX),
            eq(financialTransactions.memberId, member.id),
          ),
        );
      const upgradePmt = txnRows.find((p) => p.amount === 8800);
      expect(upgradePmt).toBeTruthy();
      expect(upgradePmt!.paymentMethod).toBe("cash");
      expect(upgradePmt!.targetId).toBe(body.id);
    });
  });

  describe("endDateOverride (mantener vencimiento)", () => {
    it("inherits current expiry, prorates class budget, charges the difference", async () => {
      // Flex → Flex+ (the real Mica case): same 30-day duration, more
      // classes/week and a higher price. Member is 15 days into Flex.
      const flex = await createPlan(app, adminToken, {
        name: "Flex",
        classesPerWeek: 2,
        durationDays: 30,
        priceRegular: 80000,
        priceZero: 65000,
      });
      const flexPlus = await createPlan(app, adminToken, {
        name: "Flex+",
        classesPerWeek: 6,
        durationDays: 30,
        priceRegular: 100000,
        priceZero: 80000,
      });
      const member = await createMember(app);

      // Started 15 days ago → expiry is 15 days from today.
      await assignPlan(app, adminToken, member.id, {
        planId: flex.id,
        startDate: dateOffsetStr(-15),
      });
      const inheritedExpiry = dateOffsetStr(15);

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: flexPlus.id,
          branchId: 1,
          startDate: todayStr(),
          priceTypeApplied: "zero",
          paymentMethod: "cash",
          endDateOverride: inheritedExpiry,
          priceOverrideAmount: 15000,
          priceOverrideReason: "Cambio de plan manteniendo vencimiento",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.planId).toBe(flexPlus.id);
      // Expiry is inherited, not reset to today + 30.
      expect(body.endDate).toBe(inheritedExpiry);
      // Charges the manual difference, not the prorated price.
      expect(body.pricePaid).toBe(15000);

      // Class budget is prorated to the inherited window:
      // ceil(15 / 7) = 3 weeks × 6 classes = 18.
      const newSubRows = await app.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, body.id as number));
      expect(newSubRows[0].classesRemaining).toBe(18);
      expect(newSubRows[0].classesBudget).toBe(18);

      // The difference is recorded as a payment.
      const txnRows = await app.db
        .select({ amount: financialTransactions.amount })
        .from(financialTransactions)
        .where(
          and(
            tenantWhere(financialTransactions, TEMPLO_CTX),
            eq(financialTransactions.memberId, member.id),
          ),
        );
      expect(txnRows.some((t) => t.amount === 15000)).toBe(true);
    });

    it("rejects an endDateOverride that is not after the start date", async () => {
      const flex = await createPlan(app, adminToken, {
        name: "Flex Reject",
        classesPerWeek: 2,
        durationDays: 30,
        priceRegular: 80000,
        priceZero: 65000,
      });
      const flexPlus = await createPlan(app, adminToken, {
        name: "Flex+ Reject",
        classesPerWeek: 6,
        durationDays: 30,
        priceRegular: 100000,
        priceZero: 80000,
      });
      const member = await createMember(app);
      await assignPlan(app, adminToken, member.id, {
        planId: flex.id,
        startDate: dateOffsetStr(-15),
      });

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: flexPlus.id,
          branchId: 1,
          startDate: todayStr(),
          priceTypeApplied: "zero",
          paymentMethod: "cash",
          // Equal to startDate → invalid (must be strictly after).
          endDateOverride: todayStr(),
          priceOverrideAmount: 15000,
          priceOverrideReason: "Cambio de plan manteniendo vencimiento",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain("posterior");
    });

    it("without endDateOverride still resets to a full period (regression)", async () => {
      const flex = await createPlan(app, adminToken, {
        name: "Flex Reset",
        classesPerWeek: 2,
        durationDays: 30,
        priceRegular: 80000,
        priceZero: 65000,
      });
      const flexPlus = await createPlan(app, adminToken, {
        name: "Flex+ Reset",
        classesPerWeek: 6,
        durationDays: 30,
        priceRegular: 100000,
        priceZero: 80000,
      });
      const member = await createMember(app);
      await assignPlan(app, adminToken, member.id, {
        planId: flex.id,
        startDate: dateOffsetStr(-15),
      });

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: flexPlus.id,
          branchId: 1,
          startDate: todayStr(),
          priceTypeApplied: "zero",
          paymentMethod: "cash",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      // Fresh full period from today, not the old 15-day-remaining expiry.
      expect(body.endDate).toBe(dateOffsetStr(30));
    });
  });

  describe("startMode=after_current (scheduled change)", () => {
    it("creates scheduled sub starting on current.endDate, full price charged", async () => {
      const planA = await createPlan(app, adminToken, {
        name: "Sched Plan A",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
      });
      const planB = await createPlan(app, adminToken, {
        name: "Sched Plan B",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 12000,
        priceZero: 8000,
      });
      const member = await createMember(app);

      const assignResult = await assignPlan(app, adminToken, member.id, {
        planId: planA.id,
        startDate: todayStr(),
      });
      const oldSubId = assignResult.body.id as number;
      const oldEndDate = assignResult.body.endDate as string;

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: planB.id,
          branchId: 1,
          startDate: todayStr(),
          priceTypeApplied: "regular",
          paymentMethod: "cash",
          startMode: "after_current",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("scheduled");
      expect(body.previousSubscriptionId).toBe(oldSubId);
      expect(body.startDate).toBe(oldEndDate);
      expect(body.pricePaid).toBe(12000);

      const [oldSub] = await app.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, oldSubId));
      expect(oldSub.status).toBe("active");

      // Plan 105-06: payments table dropped — query financial_transactions joined via links.
      const pmts = await app.db
        .select({
          amount: financialTransactions.amount,
          targetId: transactionLinks.targetId,
        })
        .from(financialTransactions)
        .leftJoin(
          transactionLinks,
          and(
            tenantWhere(transactionLinks, TEMPLO_CTX),
            eq(transactionLinks.transactionId, financialTransactions.id),
          ),
        )
        .where(
          and(
            tenantWhere(financialTransactions, TEMPLO_CTX),
            eq(financialTransactions.memberId, member.id),
          ),
        );
      const scheduledPmt = pmts.find((p) => p.targetId === (body.id as number));
      expect(scheduledPmt!.amount).toBe(12000);
    });

    it("blocks when a scheduled sub already exists (409)", async () => {
      const planA = await createPlan(app, adminToken, {
        name: "Dupe Sched A",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
      });
      const planB = await createPlan(app, adminToken, {
        name: "Dupe Sched B",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 12000,
        priceZero: 8000,
      });
      const member = await createMember(app);

      await assignPlan(app, adminToken, member.id, {
        planId: planA.id,
        startDate: todayStr(),
      });

      const first = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: planB.id,
          branchId: 1,
          startDate: todayStr(),
          priceTypeApplied: "regular",
          paymentMethod: "cash",
          startMode: "after_current",
        },
      });
      expect(first.statusCode).toBe(201);

      const second = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: planB.id,
          branchId: 1,
          startDate: todayStr(),
          priceTypeApplied: "regular",
          paymentMethod: "cash",
          startMode: "after_current",
        },
      });
      expect(second.statusCode).toBe(409);
    });

    it("rejects when current sub is paused (400)", async () => {
      const planA = await createPlan(app, adminToken, {
        name: "Paused Sched A",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
      });
      const planB = await createPlan(app, adminToken, {
        name: "Paused Sched B",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 12000,
        priceZero: 8000,
      });
      const member = await createMember(app);

      const assignResult = await assignPlan(app, adminToken, member.id, {
        planId: planA.id,
        startDate: todayStr(),
      });
      const subId = assignResult.body.id as number;

      await app.db
        .update(subscriptions)
        .set({ status: "paused" })
        .where(eq(subscriptions.id, subId));

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: planB.id,
          branchId: 1,
          startDate: todayStr(),
          priceTypeApplied: "regular",
          paymentMethod: "cash",
          startMode: "after_current",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("auto-expire activates scheduled change with program enrollment transition", async () => {
      const progAResult = await app.db.insert(programs).values({
        name: "Programa A",
        description: "Test A",
        durationWeeks: 4,
        sessionsPerWeekToAdvance: 3,
      });
      const progA = { id: Number(progAResult[0].insertId) };

      const progBResult = await app.db.insert(programs).values({
        name: "Programa B",
        description: "Test B",
        durationWeeks: 4,
        sessionsPerWeekToAdvance: 3,
      });
      const progB = { id: Number(progBResult[0].insertId) };

      const planA = await createPlan(app, adminToken, {
        name: "Prog Sched A",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
        linkedProgramId: progA.id,
      });
      const planB = await createPlan(app, adminToken, {
        name: "Prog Sched B",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 12000,
        priceZero: 8000,
        linkedProgramId: progB.id,
      });
      const member = await createMember(app);

      const assignResult = await assignPlan(app, adminToken, member.id, {
        planId: planA.id,
        startDate: todayStr(),
      });
      const oldSubId = assignResult.body.id as number;

      const schedRes = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: planB.id,
          branchId: 1,
          startDate: todayStr(),
          priceTypeApplied: "regular",
          paymentMethod: "cash",
          startMode: "after_current",
        },
      });
      expect(schedRes.statusCode).toBe(201);
      const scheduledSub = JSON.parse(schedRes.body);

      // Force old sub to expire. after_current fija el startDate del cambio
      // programado = endDate de la sub actual, así que al vencer la anterior su
      // fecha de inicio también llegó — backdateamos AMBOS para simular el paso
      // del tiempo de forma realista. Sin mover el startDate del successor, el
      // guard de activación (startDate <= hoy) lo mantendría encolado.
      await app.db
        .update(subscriptions)
        .set({ endDate: dateOffsetStr(-1) })
        .where(eq(subscriptions.id, oldSubId));
      await app.db
        .update(subscriptions)
        .set({ startDate: dateOffsetStr(-1) })
        .where(eq(subscriptions.id, scheduledSub.id));

      // Trigger auto-expire
      await app.inject({
        method: "GET",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const [activatedSub] = await app.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, scheduledSub.id));
      expect(activatedSub.status).toBe("active");

      const enrollmentsA = await app.db
        .select()
        .from(programEnrollments)
        .where(eq(programEnrollments.programId, progA.id));
      const memberEnrA = enrollmentsA.find((e) => e.userId === member.id);
      expect(memberEnrA?.status).toBe("cancelled");

      const enrollmentsB = await app.db
        .select()
        .from(programEnrollments)
        .where(eq(programEnrollments.programId, progB.id));
      const memberEnrB = enrollmentsB.find((e) => e.userId === member.id);
      expect(memberEnrB?.status).toBe("active");
    });
  });

  // ── Fecha de inicio custom en el cambio programado (hotfix 2026-07-07) ──────
  // El staff pidió poder cobrar una promo ahora pero arrancar el nuevo plan más
  // adelante (socios que viajan). El modo 'después' permite empujar el inicio
  // por encima del vencimiento actual; el backend crea la sub 'scheduled' en esa
  // fecha y el cron la activa. Espeja al feature de renovar.
  describe("startMode=after_current con fecha de inicio custom", () => {
    async function setupActiveMember(durationDays = 30) {
      const planA = await createPlan(app, adminToken, {
        name: `Custom Start A ${durationDays}`,
        classesPerWeek: undefined,
        durationDays,
        priceRegular: 8000,
        priceZero: 4000,
      });
      const planB = await createPlan(app, adminToken, {
        name: `Custom Start B ${durationDays}`,
        classesPerWeek: undefined,
        durationDays,
        priceRegular: 12000,
        priceZero: 8000,
      });
      const member = await createMember(app);
      const assignResult = await assignPlan(app, adminToken, member.id, {
        planId: planA.id,
        startDate: todayStr(),
      });
      return { planB, member, oldSubId: assignResult.body.id as number };
    }

    it("fecha custom posterior al vencimiento programa el cambio en esa fecha (gap)", async () => {
      const { planB, member, oldSubId } = await setupActiveMember(30);

      // Vencimiento actual = +30; el admin pide arrancar en +45 (gap de 15 días).
      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: planB.id,
          branchId: 1,
          startDate: dateOffsetStr(45),
          priceTypeApplied: "regular",
          paymentMethod: "cash",
          startMode: "after_current",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("scheduled");
      expect(body.startDate).toBe(dateOffsetStr(45));
      expect(body.endDate).toBe(dateOffsetStr(75));
      expect(body.previousSubscriptionId).toBe(oldSubId);

      // La sub actual sigue activa hasta su vencimiento natural (no se toca).
      const [oldSub] = await app.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, oldSubId));
      expect(oldSub.status).toBe("active");
    });

    it("fecha custom = vencimiento actual encadena sin gap (comportamiento default)", async () => {
      const { planB, member } = await setupActiveMember(30);

      // +30 = vencimiento actual: no hay gap, arranca justo al vencer.
      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: planB.id,
          branchId: 1,
          startDate: dateOffsetStr(30),
          priceTypeApplied: "regular",
          paymentMethod: "cash",
          startMode: "after_current",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("scheduled");
      expect(body.startDate).toBe(dateOffsetStr(30));
      expect(body.endDate).toBe(dateOffsetStr(60));
    });

    it("fecha custom más allá de +60 días devuelve 400", async () => {
      const { planB, member } = await setupActiveMember(30);

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: planB.id,
          branchId: 1,
          startDate: dateOffsetStr(70),
          priceTypeApplied: "regular",
          paymentMethod: "cash",
          startMode: "after_current",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("successor con fecha custom futura NO se activa al vencer la anterior (respeta el gap)", async () => {
      const { planB, member, oldSubId } = await setupActiveMember(30);

      const schedRes = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: planB.id,
          branchId: 1,
          startDate: dateOffsetStr(45),
          priceTypeApplied: "regular",
          paymentMethod: "cash",
          startMode: "after_current",
        },
      });
      const successorId = JSON.parse(schedRes.body).id as number;

      // La anterior vence (endDate en el pasado) pero el successor conserva su
      // startDate futuro (+45): el guard `startDate <= today` debe mantenerlo
      // encolado en vez de activarlo apenas expira la predecesora.
      await app.db
        .update(subscriptions)
        .set({ endDate: dateOffsetStr(-1) })
        .where(eq(subscriptions.id, oldSubId));

      await app.inject({
        method: "GET",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const [successor] = await app.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, successorId));
      expect(successor.status).toBe("scheduled");
      expect(successor.startDate).toBe(dateOffsetStr(45));
    });
  });
});
