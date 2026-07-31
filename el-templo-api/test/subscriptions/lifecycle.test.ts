import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { sql, eq, and, desc } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { subscriptions } from "../../src/db/schema/subscriptions";
import * as schema from "../../src/db/schema";
import { PRICING_SETTINGS_KEYS } from "../../src/modules/settings/keys";
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
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

/**
 * 172-15: `TEMPLO_CTX` es el gimnasio de este archivo. Las queries directas de
 * los tests pasan por `app.dbPool` igual que las de la app, asi que con
 * `finance` en `TENANT_STRICT_MODULES` una lectura o una siembra sobre las
 * tablas strict sin gimnasio hace throw antes de llegar a MySQL.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

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
      // Fase 156: el boarding pass rutea por resolvePriceType('zero'), que con la
      // regla zero_price_enabled OFF (default en tests) normaliza a 'regular'. Para
      // ejercitar el precio Zero hay que prender la regla (ver zero-price-gate.test.ts).
      await app.db
        .insert(schema.systemSettings)
        .values({
          settingKey: PRICING_SETTINGS_KEYS.zeroPrice,
          settingValue: "on",
        })
        .onDuplicateKeyUpdate({ set: { settingValue: "on" } });

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

      // Phase 111 REQ-3: cancel now refuses when there are non-voided charge
      // transactions on the sub (boarding pass uses priceZero, which still
      // records a charge). Pre-void the auto-created charge tx so the cancel
      // proceeds and the test can attempt the second boarding-pass assign.
      const subId = first.body.id as number;
      const [admin] = await app.db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, "admin@test.com"))
        .limit(1);
      const linkedTxIds = await app.db
        .select({ id: schema.financialTransactions.id })
        .from(schema.transactionLinks)
        .innerJoin(
          schema.financialTransactions,
          and(
            tenantWhere(schema.financialTransactions, TEMPLO_CTX),
            eq(
              schema.transactionLinks.transactionId,
              schema.financialTransactions.id,
            ),
          ),
        )
        .where(
          and(
            tenantWhere(schema.transactionLinks, TEMPLO_CTX),
            eq(schema.transactionLinks.targetKind, "subscription"),
            eq(schema.transactionLinks.targetId, subId),
          ),
        );
      for (const t of linkedTxIds) {
        await app.db
          .update(schema.financialTransactions)
          .set({
            voidedAt: new Date(),
            voidedBy: admin?.id ?? null,
            voidReason: "test setup — pre-void",
          })
          .where(
            and(
              tenantWhere(schema.financialTransactions, TEMPLO_CTX),
              eq(schema.financialTransactions.id, t.id),
            ),
          );
      }

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

    it("autoExpireDueSubscriptions (cron) expires lapsed subs and recomputes users.status without a read", async () => {
      const plan = await createPlan(app, adminToken, { durationDays: 30 });
      const member = await createMember(app);

      // Assign a currently-valid plan so recompute sets users.status='activo'.
      await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        startDate: todayStr(),
      });

      // Force the sub past its end date. The persisted users.status stays the
      // stale 'activo' from the assign — nothing reads this member's detail.
      await app.db
        .update(subscriptions)
        .set({ startDate: dateOffsetStr(-10), endDate: dateOffsetStr(-5) })
        .where(eq(subscriptions.userId, member.id));

      const [before] = await app.db
        .select({ status: schema.users.status })
        .from(schema.users)
        .where(eq(schema.users.id, member.id));
      expect(before.status).toBe("activo");

      // Run the bulk expire the daily cron invokes — no per-member read.
      const { SubscriptionService } =
        await import("../../src/modules/subscriptions/service");
      const { AuraService } = await import("../../src/modules/aura");
      const { TransactionService, BalanceService, CashRegisterService } =
        await import("../../src/modules/finance");
      const { EnrollmentService } =
        await import("../../src/modules/programs/enrollment-service");
      const aura = new AuraService(app.db);
      const balances = new BalanceService(app.db, app.log);
      const cashRegisters = new CashRegisterService(app.db, app.log);
      const txns = new TransactionService(
        app.db,
        app.log,
        balances,
        cashRegisters,
      );
      const enrollments = new EnrollmentService(app.db, app.log);
      const svc = new SubscriptionService(
        app.db,
        app.log,
        aura,
        txns,
        enrollments,
      );

      const processed = await svc.autoExpireDueSubscriptions();
      expect(processed).toBeGreaterThanOrEqual(1);

      const [sub] = await app.db
        .select({ status: subscriptions.status })
        .from(subscriptions)
        .where(eq(subscriptions.userId, member.id));
      expect(sub.status).toBe("expired");

      const [after] = await app.db
        .select({ status: schema.users.status })
        .from(schema.users)
        .where(eq(schema.users.id, member.id));
      expect(after.status).toBe("inactivo");
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
      const { TransactionService, BalanceService, CashRegisterService } =
        await import("../../src/modules/finance");
      const aura = new AuraService(app.db);
      const balances = new BalanceService(app.db, app.log);
      const cashRegisters = new CashRegisterService(app.db, app.log);
      const txns = new TransactionService(
        app.db,
        app.log,
        balances,
        cashRegisters,
      );
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
      // Phase 111 REQ-3: cancel refuses if there are non-voided charge tx;
      // priceOverrideAmount=0 makes assignPlan skip the charge tx so the
      // cancel proceeds without needing to pre-void anything.
      await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        priceOverrideAmount: 0,
        priceOverrideReason: "test (no charge — REQ-3 isolation)",
      });

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
      // See REQ-3 comment in the previous test for why priceOverrideAmount=0.
      await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        priceOverrideAmount: 0,
        priceOverrideReason: "test (no charge — REQ-3 isolation)",
      });

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

    // ─── Phase 111-03 REQ-3 + REQ-7 cancel guards ───────────────────────────

    /**
     * Insert a non-voided financial_transaction + transaction_link targeting
     * the given subscription. Returns the new tx id. Used to seed the
     * "active charge tx" precondition for REQ-3 cancel guard tests.
     */
    async function seedActiveChargeTx(
      memberId: number,
      branchId: number,
      subId: number,
      amount: number,
      voided: boolean = false,
    ): Promise<number> {
      const today = todayStr();
      const [admin] = await app.db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, "admin@test.com"))
        .limit(1);
      if (!admin) throw new Error("admin@test.com seed missing");
      const [txRes] = await app.db
        .insert(schema.financialTransactions)
        .values(
          tenantValues(TEMPLO_CTX, {
            memberId,
            kind: "plan_charge",
            direction: "inflow",
            amount,
            currency: "ARS",
            paymentMethod: "cash",
            transactionDate: today,
            effectiveDate: today,
            branchId,
            recordedBy: admin.id,
            voidedAt: voided ? new Date() : null,
            voidedBy: voided ? admin.id : null,
            voidReason: voided ? "test seed" : null,
          }),
        )
        .$returningId();
      await app.db.insert(schema.transactionLinks).values(
        tenantValues(TEMPLO_CTX, {
          transactionId: txRes.id,
          targetKind: "subscription",
          targetId: subId,
          allocatedAmount: amount,
        }),
      );
      return txRes.id;
    }

    it("REQ-3: cancel returns 400 SUB_HAS_ACTIVE_TRANSACTIONS when a non-voided charge tx exists", async () => {
      await app.db.execute(sql`DELETE FROM audit_log`);
      const plan = await createPlan(app, adminToken);
      const member = await createMember(app);
      const assigned = await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
      });
      expect(assigned.statusCode).toBe(201);
      const subId = assigned.body.id as number;

      // The assignPlan flow already creates a charge tx via
      // recordAssignmentCharge. Seed an additional active charge so we have
      // a deterministic id list to assert against (and confirm the query
      // returns more than one when applicable).
      const extraTxId = await seedActiveChargeTx(
        member.id,
        1,
        subId,
        12345,
        false,
      );

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/cancel`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { notes: "should fail" },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("SUB_HAS_ACTIVE_TRANSACTIONS");
      expect(body.error).toBe("Bad Request");
      expect(body.message).toContain("transacciones de cobro activas");
      expect(body.details).toBeDefined();
      expect(Array.isArray(body.details.transactionIds)).toBe(true);
      expect(body.details.transactionIds).toContain(extraTxId);
      expect(typeof body.details.totalAmount).toBe("number");
      expect(body.details.totalAmount).toBeGreaterThanOrEqual(12345);
      expect(body.details.currency).toBe("ARS");

      // Ensure no audit row was written (guard fires BEFORE the audit write)
      const auditRows = await app.db
        .select()
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.action, "subscription_cancelled"),
            eq(schema.auditLog.targetId, subId),
          ),
        );
      expect(auditRows).toHaveLength(0);
    });

    it("REQ-3: cancel succeeds (200) when all charge tx for the sub are voided", async () => {
      await app.db.execute(sql`DELETE FROM audit_log`);
      const plan = await createPlan(app, adminToken);
      const member = await createMember(app);
      const assigned = await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
      });
      expect(assigned.statusCode).toBe(201);
      const subId = assigned.body.id as number;

      // Void every charge tx pointing to this sub (assignPlan auto-charge +
      // any seed). Mark them as voided directly so we don't depend on the
      // void route.
      const [admin] = await app.db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, "admin@test.com"))
        .limit(1);
      if (!admin) throw new Error("admin@test.com seed missing");
      const linkedTxIds = await app.db
        .select({ id: schema.financialTransactions.id })
        .from(schema.transactionLinks)
        .innerJoin(
          schema.financialTransactions,
          and(
            tenantWhere(schema.financialTransactions, TEMPLO_CTX),
            eq(
              schema.transactionLinks.transactionId,
              schema.financialTransactions.id,
            ),
          ),
        )
        .where(
          and(
            tenantWhere(schema.transactionLinks, TEMPLO_CTX),
            eq(schema.transactionLinks.targetKind, "subscription"),
            eq(schema.transactionLinks.targetId, subId),
          ),
        );
      for (const t of linkedTxIds) {
        await app.db
          .update(schema.financialTransactions)
          .set({
            voidedAt: new Date(),
            voidedBy: admin.id,
            voidReason: "test setup — pre-void",
          })
          .where(
            and(
              tenantWhere(schema.financialTransactions, TEMPLO_CTX),
              eq(schema.financialTransactions.id, t.id),
            ),
          );
      }

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/cancel`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { notes: "cancel after voiding" },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).status).toBe("cancelled");
    });

    it("REQ-7: successful cancelSubscription writes one subscription_cancelled audit row", async () => {
      await app.db.execute(sql`DELETE FROM audit_log`);
      const plan = await createPlan(app, adminToken);
      const member = await createMember(app);
      const assigned = await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        // priceOverrideAmount=0 with reason → no charge tx, so REQ-3 won't trip
        priceOverrideAmount: 0,
        priceOverrideReason: "test (no-charge)",
      });
      expect(assigned.statusCode).toBe(201);
      const subId = assigned.body.id as number;
      const prevStatus = assigned.body.status as string;

      // Resolve admin id for actorId assertion
      const [admin] = await app.db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, "admin@test.com"))
        .limit(1);

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/cancel`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { notes: "alumno solicitó la baja" },
      });
      expect(res.statusCode).toBe(200);

      const rows = await app.db
        .select()
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.action, "subscription_cancelled"),
            eq(schema.auditLog.targetId, subId),
          ),
        )
        .orderBy(desc(schema.auditLog.id));

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row.actorId).toBe(admin?.id);
      expect(row.targetKind).toBe("subscription");
      expect(row.reason).toBe("alumno solicitó la baja");

      const payload = row.payloadJson as Record<string, unknown>;
      expect(payload.subId).toBe(subId);
      expect(payload.prevStatus).toBe(prevStatus);
      expect(payload.newStatus).toBe("cancelled");
      expect(payload.hasActiveTx).toBe(false);
      expect(payload.notes).toBe("alumno solicitó la baja");
      expect(typeof payload.cancelledAt).toBe("string");
    });

    // Phantom-debt regression: when assignPlan seeds a balance row because
    // amountReceived=0 (recordAssignmentCharge:303-314), cancelling the sub
    // must zero that row. Otherwise Finanzas keeps trying to settle the
    // unpaid amount forever — the bug Mati hit with Jacqueline / Adriana /
    // Lucas / Vita (1.13M ARS phantom debt across 4 members).
    it("cancel zeroes out positive balance for sub with seeded debt and no charges", async () => {
      const plan = await createPlan(app, adminToken, {
        priceRegular: 50000,
      });
      const member = await createMember(app);

      // amountReceived=0 → recordAssignmentCharge skips the inflow tx and
      // explicitly seeds balances.amount = chargeBase. Mirrors the prod
      // flow where the admin assigns the plan but the alumno hasn't paid.
      const assigned = await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        amountReceived: 0,
      });
      expect(assigned.statusCode).toBe(201);
      const subId = assigned.body.id as number;

      // Sanity: the seeded balance row exists and is positive.
      const seededBalance = await app.db
        .select({ amount: schema.balances.amount })
        .from(schema.balances)
        .where(
          and(
            tenantWhere(schema.balances, TEMPLO_CTX),
            eq(schema.balances.memberId, member.id),
            eq(schema.balances.targetKind, "subscription"),
            eq(schema.balances.targetId, subId),
          ),
        );
      expect(seededBalance).toHaveLength(1);
      expect(seededBalance[0].amount).toBeGreaterThan(0);

      const cancelRes = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/cancel`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });
      expect(cancelRes.statusCode).toBe(200);

      // Balance row must collapse to 0 after cancel.
      const postBalance = await app.db
        .select({ amount: schema.balances.amount })
        .from(schema.balances)
        .where(
          and(
            tenantWhere(schema.balances, TEMPLO_CTX),
            eq(schema.balances.memberId, member.id),
            eq(schema.balances.targetKind, "subscription"),
            eq(schema.balances.targetId, subId),
          ),
        );
      expect(postBalance).toHaveLength(1);
      expect(postBalance[0].amount).toBe(0);
    });

    // Saldo a favor (negative balance) survives cancellation — only positive
    // outstanding debt is forgiven, not credit the member earned elsewhere.
    it("cancel preserves negative balance (saldo a favor) on the cancelled sub", async () => {
      const plan = await createPlan(app, adminToken, {
        priceRegular: 50000,
      });
      const member = await createMember(app);
      const assigned = await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        amountReceived: 0,
      });
      const subId = assigned.body.id as number;

      // Manually flip the balance to negative (simulates an applied refund or
      // overpayment leaving credit attached to this sub).
      await app.db
        .update(schema.balances)
        .set({ amount: -25000 })
        .where(
          and(
            tenantWhere(schema.balances, TEMPLO_CTX),
            eq(schema.balances.memberId, member.id),
            eq(schema.balances.targetKind, "subscription"),
            eq(schema.balances.targetId, subId),
          ),
        );

      const cancelRes = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/cancel`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });
      expect(cancelRes.statusCode).toBe(200);

      const postBalance = await app.db
        .select({ amount: schema.balances.amount })
        .from(schema.balances)
        .where(
          and(
            tenantWhere(schema.balances, TEMPLO_CTX),
            eq(schema.balances.memberId, member.id),
            eq(schema.balances.targetKind, "subscription"),
            eq(schema.balances.targetId, subId),
          ),
        );
      expect(postBalance[0].amount).toBe(-25000);
    });

    // Caso Pomilio: el admin debe poder cancelar SOLO la renovación
    // programada por id, sin que la membresía vigente se vea afectada.
    it("cancel por subscriptionId cancela solo la scheduled (la activa queda intacta)", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Cancel Scheduled Plan",
        classesPerWeek: 2,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 0,
      });
      const member = await createMember(app);

      // 1. Membresía activa (sin cobro para no chocar con REQ-3).
      const assignRes = await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        startDate: todayStr(),
        priceOverrideAmount: 0,
        priceOverrideReason: "test (no charge — REQ-3 isolation)",
      });
      const activeId = assignRes.body.id as number;

      // 2. Renovación temprana → scheduled (también sin cobro).
      const renewRes = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { paymentMethod: "cash", amountReceived: 0 },
      });
      expect(renewRes.statusCode).toBe(201);
      const scheduledId = (JSON.parse(renewRes.body) as { id: number }).id;
      expect(scheduledId).not.toBe(activeId);

      // 3. Cancelar SOLO la scheduled por subscriptionId.
      const cancelRes = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/cancel`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { subscriptionId: scheduledId, notes: "Renovación errada" },
      });
      expect(cancelRes.statusCode).toBe(200);
      const cancelled = JSON.parse(cancelRes.body);
      expect(cancelled.id).toBe(scheduledId);
      expect(cancelled.status).toBe("cancelled");

      // 4. La membresía activa debe seguir activa (sin cascade).
      const [activeRow] = await app.db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.id, activeId));
      expect(activeRow.status).toBe("active");
    });

    it("cancel por subscriptionId devuelve 404 si la sub no pertenece al alumno", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Guard Cancel Plan",
        classesPerWeek: 2,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 0,
      });
      const member = await createMember(app);
      await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        priceOverrideAmount: 0,
        priceOverrideReason: "test (no charge — REQ-3 isolation)",
      });

      // Id que no existe en absoluto → la guarda lo trata igual que una sub
      // de otro alumno (no aparece en getMemberSubscriptions(userId)).
      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/cancel`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { subscriptionId: 999999 },
      });
      expect(res.statusCode).toBe(404);
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

    // WR-02: el preview debe pasar por resolvePriceType (punto único D-04), así
    // no muestra el precio de tarjeta cuando la regla está OFF y el cobro real
    // caería en priceRegular. cleanAllTestData deja la key ausente = OFF.
    it("con la regla OFF, priceType=credit_card cae a priceRegular", async () => {
      const plan = await createPlan(app, adminToken, {
        priceRegular: 15000,
        priceCreditCard: 20000,
      });
      const member = await createMember(app);

      const res = await app.inject({
        method: "GET",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/pricing-preview?planId=${plan.id}&priceType=credit_card`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      // NO priceCreditCard (20000) — la regla OFF normaliza a regular.
      expect(body.basePrice).toBe(15000);
      expect(body.finalPrice).toBe(15000);
    });

    it("con la regla ON, priceType=credit_card usa priceCreditCard", async () => {
      // Sembrar la regla en ON para este caso (beforeEach limpia settings).
      await app.db.insert(schema.systemSettings).values({
        settingKey: PRICING_SETTINGS_KEYS.cardSurcharge,
        settingValue: "on",
      });

      const plan = await createPlan(app, adminToken, {
        priceRegular: 15000,
        priceCreditCard: 20000,
      });
      const member = await createMember(app);

      const res = await app.inject({
        method: "GET",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/pricing-preview?planId=${plan.id}&priceType=credit_card`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.basePrice).toBe(20000);
      expect(body.finalPrice).toBe(20000);
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
        // Phase 111 REQ-3: skip charge tx so cancel proceeds without anular.
        priceOverrideAmount: 0,
        priceOverrideReason: "test (no charge — REQ-3 isolation)",
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
