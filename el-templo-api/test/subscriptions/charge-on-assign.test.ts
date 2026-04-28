/**
 * Phase 107 — Charge on assign / change / renew (D-17 matrix + D-11 atomicity)
 *
 * Integration tests against the per-worker test MySQL DB
 * (`eltemplo_test_<POOL_ID>`). Validates CHARGE-03 at the HTTP boundary and
 * the contract that `recordAssignmentCharge` lives INSIDE the same
 * `db.transaction` as the subscription INSERT (Plan 02 refactor).
 *
 * Coverage matrix (D-17):
 *   - assignPlan: Happy {amount=cap, omitted, partial, zero} + Sad {>cap, <0}
 *   - Atomicity: mocked BalanceService.applyDelta throws → no orphans persisted
 *   - changePlan/now (proration / netAmount cap): Happy partial + Sad >cap
 *   - changePlan/after_current (pricePaid cap): Happy partial + Sad >cap
 *   - renewSubscription (renewalPrice cap): Happy partial + Sad >cap
 *
 * The atomicity test uses direct service instantiation (not HTTP) so it can
 * inject a failing BalanceService. `app.balanceService` is NOT decorated on
 * the FastifyInstance (verified — no `decorate` call in `src/app.ts`); the
 * canonical pattern is the one in `test/users/user-status-transitions.test.ts`
 * (svc = new SubscriptionService(app.db, app.log, aura, txns); +
 * subs.setBookingService(bookings)).
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import { createTestApp, cleanAllTestData, getAuthToken } from "../helpers";
import {
  SUBSCRIPTIONS_URL,
  assignPlan,
  createMember,
  createPlan,
  todayStr,
} from "./_helpers";
import * as schema from "../../src/db/schema";
import { SubscriptionService } from "../../src/modules/subscriptions/service";
import { AuraService } from "../../src/modules/aura";
import { BalanceService, TransactionService } from "../../src/modules/finance";
import { BookingService } from "../../src/modules/scheduling/booking-service";

describe("Phase 107 — Charge on assign / change / renew", () => {
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

  // ─── assignPlan ────────────────────────────────────────────────────────────
  describe("assignPlan", () => {
    it("Happy 1 — amountReceived === pricePaid → balance row = 0 + notes 'Cobro al asignar'", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Assign Happy 1 Plan",
        priceRegular: 100000,
      });
      const member = await createMember(app);

      const res = await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        amountReceived: 100000,
      });
      expect(res.statusCode).toBe(201);
      const subId = res.body.id as number;

      const [bal] = await app.db
        .select()
        .from(schema.balances)
        .where(
          and(
            eq(schema.balances.memberId, member.id),
            eq(schema.balances.targetKind, "subscription"),
            eq(schema.balances.targetId, subId),
          ),
        )
        .limit(1);
      expect(bal?.amount ?? 0).toBe(0);

      const [tx] = await app.db
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.memberId, member.id))
        .limit(1);
      expect(tx?.notes ?? "").toMatch(/Cobro al asignar plan/);
      expect(tx?.amount).toBe(100000);
    });

    it("Happy 2 — amountReceived omitido → backward compat (default = pricePaid) → balance = 0", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Assign Happy 2 Plan",
        priceRegular: 100000,
      });
      const member = await createMember(app);

      const res = await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        // amountReceived omitido → service defaults a pricePaid
      });
      expect(res.statusCode).toBe(201);
      const subId = res.body.id as number;

      const [bal] = await app.db
        .select()
        .from(schema.balances)
        .where(
          and(
            eq(schema.balances.memberId, member.id),
            eq(schema.balances.targetKind, "subscription"),
            eq(schema.balances.targetId, subId),
          ),
        )
        .limit(1);
      expect(bal?.amount ?? 0).toBe(0);

      const [tx] = await app.db
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.memberId, member.id))
        .limit(1);
      expect(tx?.amount).toBe(100000);
    });

    it("Happy 3 — cobro parcial pricePaid - 10000 → balance row = 10000 (deudor)", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Assign Happy 3 Plan",
        priceRegular: 100000,
      });
      const member = await createMember(app);

      const res = await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        amountReceived: 90000,
      });
      expect(res.statusCode).toBe(201);
      const subId = res.body.id as number;

      const [bal] = await app.db
        .select()
        .from(schema.balances)
        .where(
          and(
            eq(schema.balances.memberId, member.id),
            eq(schema.balances.targetKind, "subscription"),
            eq(schema.balances.targetId, subId),
          ),
        )
        .limit(1);
      expect(bal?.amount).toBe(10000);

      const [tx] = await app.db
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.memberId, member.id))
        .limit(1);
      expect(tx?.amount).toBe(90000);
      expect(tx?.notes ?? "").toMatch(/Cobro al asignar plan/);
    });

    it("Happy 4 — pricePaid = 0 (priceOverride 0) → no transaction, no balance row", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Assign Happy 4 Plan",
        priceRegular: 100000,
      });
      const member = await createMember(app);

      // priceOverrideAmount=0 fuerza pricePaid=0 sin tocar la config del plan.
      // El service guard `amountReceived > 0` evita crear transaction y balance.
      const res = await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        priceOverrideAmount: 0,
        priceOverrideReason: "Plan gratuito (test)",
      });
      expect(res.statusCode).toBe(201);

      const txs = await app.db
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.memberId, member.id));
      expect(txs).toHaveLength(0);

      const balances = await app.db
        .select()
        .from(schema.balances)
        .where(eq(schema.balances.memberId, member.id));
      expect(balances).toHaveLength(0);
    });

    it("Sad 1 — amountReceived > pricePaid → 400 'no puede exceder' + rollback (sin subscription)", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Assign Sad 1 Plan",
        priceRegular: 100000,
      });
      const member = await createMember(app);

      const res = await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        amountReceived: 100001, // pricePaid + 1
      });
      expect(res.statusCode).toBe(400);
      const body = res.body as { message?: string };
      expect(body.message ?? "").toMatch(/no puede exceder/i);

      // Rollback: el throw del service ocurre dentro del db.transaction
      // (después del INSERT subscription pero antes del commit) → no
      // subscription persistida.
      const subs = await app.db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, member.id));
      expect(subs).toHaveLength(0);

      const txs = await app.db
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.memberId, member.id));
      expect(txs).toHaveLength(0);
    });

    it("Sad 2 — amountReceived < 0 → 400 (rechazado por JSON Schema layer)", async () => {
      // NOTE (defense-in-depth): el JSON Schema (`minimum: 0`) en
      // assignPlanSchema rechaza amountReceived negativo en el route boundary,
      // ANTES de invocar SubscriptionService.assignPlan. El guard service-layer
      // `if (amountReceived < 0) throw BadRequestError("...")` dentro del helper
      // recordAssignmentCharge queda UNREACHABLE desde HTTP cuando el schema
      // está montado — es defense-in-depth puro (cubierto por typecheck +
      // revisión manual, NO por este test runtime). El cap superior (Sad 1)
      // ya prueba que el helper sí valida y rollbackea correctamente.
      const plan = await createPlan(app, adminToken, {
        name: "Assign Sad 2 Plan",
        priceRegular: 100000,
      });
      const member = await createMember(app);

      const res = await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        amountReceived: -100,
      });
      expect(res.statusCode).toBe(400);

      // Postcondición trivial pero importante: el schema rechazó el body
      // antes de invocar el service, por lo que NO se intentó crear la
      // subscription (no orphans).
      const subs = await app.db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, member.id));
      expect(subs).toHaveLength(0);
    });
  });

  // ─── Atomicity (D-11 / CHARGE-03) ──────────────────────────────────────────
  describe("Atomicity (D-11)", () => {
    it("BalanceService.applyDelta throws → subscription + transaction + balance rollback", async () => {
      // Setup fixtures via API (más simple que insertar directo).
      const plan = await createPlan(app, adminToken, {
        name: "Atomicity Plan",
        priceRegular: 100000,
      });
      const member = await createMember(app);

      // Pre-condition: el member no tiene subscription todavía.
      const preSubs = await app.db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, member.id));
      expect(preSubs).toHaveLength(0);

      // Estrategia B: instanciamos SubscriptionService directamente con un
      // BalanceService mockeado (app.balanceService NO está decorado en la
      // FastifyInstance — verificado en src/app.ts). Pattern canónico copiado
      // de test/users/user-status-transitions.test.ts:44-52.
      const failingBalance = new BalanceService(app.db, app.log);
      failingBalance.applyDelta = async () => {
        throw new Error("simulated balance failure");
      };
      const txSvc = new TransactionService(app.db, app.log, failingBalance);
      const auraSvc = new AuraService(app.db);
      const subSvc = new SubscriptionService(app.db, app.log, auraSvc, txSvc);
      const bookings = new BookingService(app.db, app.log, subSvc);
      subSvc.setBookingService(bookings);

      // Resolve admin id (recordedBy) — usa el seed admin@test.com.
      const [admin] = await app.db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, "admin@test.com"))
        .limit(1);
      if (!admin) throw new Error("admin@test.com seed missing");

      await expect(
        subSvc.assignPlan(
          member.id,
          {
            planId: plan.id,
            branchId: 1,
            startDate: todayStr(),
            priceTypeApplied: "regular",
            paymentMethod: "cash",
            amountReceived: 50000,
          },
          admin.id,
        ),
      ).rejects.toThrow(/simulated balance failure/);

      // Invariante 1: NO hay subscription persistida (rollback del INSERT
      // que ocurrió dentro del mismo db.transaction).
      const subs = await app.db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, member.id));
      expect(subs).toHaveLength(0);

      // Invariante 2: NO hay financial_transaction persistida.
      const txs = await app.db
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.memberId, member.id));
      expect(txs).toHaveLength(0);

      // Invariante 3: NO hay balance row persistido. Si applyDelta hubiera
      // corrido fuera del outer tx, la subscription se commitearía y este
      // test fallaría correctamente (catch del CHARGE-03 bug).
      const balances = await app.db
        .select()
        .from(schema.balances)
        .where(eq(schema.balances.memberId, member.id));
      expect(balances).toHaveLength(0);
    });
  });

  // ─── changePlan (now / proration) ──────────────────────────────────────────
  describe("changePlan (now / proration)", () => {
    it("Happy — amountReceived parcial → balance row = (netAmount - amountReceived) + notes 'cambiar a'", async () => {
      // Plan A: 8000, classesPerWeek=3, durationDays=30 → budget=15
      const planA = await createPlan(app, adminToken, {
        name: "ChangeNow A",
        classesPerWeek: 3,
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
      });
      // Plan B: 12000, classesPerWeek=5
      const planB = await createPlan(app, adminToken, {
        name: "ChangeNow B",
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

      // Forzar classesRemaining=6 → proration credit = round((6/15)*8000) = 3200
      // → netAmount = 12000 - 3200 = 8800 (matches existing change-plan.test.ts L113-115).
      await app.db
        .update(schema.subscriptions)
        .set({ classesRemaining: 6 })
        .where(eq(schema.subscriptions.userId, member.id));

      const netAmount = 8800;
      const partial = netAmount - 5000; // 3800

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
          amountReceived: partial,
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body) as { id: number; planId: number };
      expect(body.planId).toBe(planB.id);
      const newSubId = body.id;

      const [bal] = await app.db
        .select()
        .from(schema.balances)
        .where(
          and(
            eq(schema.balances.memberId, member.id),
            eq(schema.balances.targetKind, "subscription"),
            eq(schema.balances.targetId, newSubId),
          ),
        )
        .limit(1);
      expect(bal?.amount).toBe(netAmount - partial);

      // Notes flow-aware: el último financial_transaction (más reciente)
      // corresponde al cambio de plan.
      const txs = await app.db
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.memberId, member.id))
        .orderBy(desc(schema.financialTransactions.id));
      const changeTx = txs.find((t) => t.amount === partial);
      expect(changeTx).toBeTruthy();
      expect(changeTx?.notes ?? "").toMatch(/Cobro al cambiar a plan/);
    });

    it("Sad — amountReceived > netAmount → 400 + rollback (plan original sigue activo)", async () => {
      const planA = await createPlan(app, adminToken, {
        name: "ChangeNow Sad A",
        classesPerWeek: 3,
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
      });
      const planB = await createPlan(app, adminToken, {
        name: "ChangeNow Sad B",
        classesPerWeek: 5,
        durationDays: 30,
        priceRegular: 12000,
        priceZero: 8000,
      });
      const member = await createMember(app);

      const assignRes = await assignPlan(app, adminToken, member.id, {
        planId: planA.id,
        startDate: todayStr(),
      });
      const oldSubId = assignRes.body.id as number;

      await app.db
        .update(schema.subscriptions)
        .set({ classesRemaining: 6 })
        .where(eq(schema.subscriptions.userId, member.id));

      const netAmount = 8800;

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
          amountReceived: netAmount + 1, // 8801 > netAmount=8800
        },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body) as { message?: string };
      expect(body.message ?? "").toMatch(/no puede exceder/i);

      // Rollback: el plan original sigue activo, NO se creó la nueva sub.
      const subs = await app.db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, member.id));
      expect(subs).toHaveLength(1);
      expect(subs[0].id).toBe(oldSubId);
      expect(subs[0].planId).toBe(planA.id);
      expect(subs[0].status).toBe("active");

      // No se creó financial_transaction nueva por el cambio.
      const txs = await app.db
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.memberId, member.id));
      // Solo el cobro original del assignPlan (8000) — ninguno por 8801.
      expect(txs.find((t) => t.amount === 8801)).toBeUndefined();
    });
  });

  // ─── changePlan (after_current / sin proration) ────────────────────────────
  describe("changePlan (after_current / sin proration)", () => {
    it("Happy — startMode='after_current' parcial → balance row positivo + notes 'cambio programado a'", async () => {
      const planA = await createPlan(app, adminToken, {
        name: "AfterCurrent A",
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
      });
      const planB = await createPlan(app, adminToken, {
        name: "AfterCurrent B",
        durationDays: 30,
        priceRegular: 12000,
        priceZero: 8000,
      });
      const member = await createMember(app);

      await assignPlan(app, adminToken, member.id, {
        planId: planA.id,
        startDate: todayStr(),
      });

      const partial = 7000; // priceB=12000 → balance pendiente 5000

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
          amountReceived: partial,
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body) as {
        id: number;
        status: string;
        pricePaid: number;
      };
      expect(body.status).toBe("scheduled");
      expect(body.pricePaid).toBe(12000);

      const newSubId = body.id;

      const [bal] = await app.db
        .select()
        .from(schema.balances)
        .where(
          and(
            eq(schema.balances.memberId, member.id),
            eq(schema.balances.targetKind, "subscription"),
            eq(schema.balances.targetId, newSubId),
          ),
        )
        .limit(1);
      expect(bal?.amount).toBe(12000 - partial);

      const txs = await app.db
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.memberId, member.id));
      const scheduledTx = txs.find((t) => t.amount === partial);
      expect(scheduledTx).toBeTruthy();
      expect(scheduledTx?.notes ?? "").toMatch(
        /Cobro al cambio programado a plan/,
      );
    });

    it("Sad — startMode='after_current' con amountReceived > pricePaid → 400 + rollback", async () => {
      const planA = await createPlan(app, adminToken, {
        name: "AfterCurrent Sad A",
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
      });
      const planB = await createPlan(app, adminToken, {
        name: "AfterCurrent Sad B",
        durationDays: 30,
        priceRegular: 12000,
        priceZero: 8000,
      });
      const member = await createMember(app);

      const assignRes = await assignPlan(app, adminToken, member.id, {
        planId: planA.id,
        startDate: todayStr(),
      });
      const oldSubId = assignRes.body.id as number;

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
          amountReceived: 12001, // pricePaid (12000) + 1
        },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body) as { message?: string };
      expect(body.message ?? "").toMatch(/no puede exceder/i);

      // Rollback: NO se creó la nueva subscription scheduled. El plan original
      // sigue activo, sin financial_transaction nueva por 12001.
      const subs = await app.db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, member.id));
      expect(subs).toHaveLength(1);
      expect(subs[0].id).toBe(oldSubId);
      expect(subs[0].status).toBe("active");

      const txs = await app.db
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.memberId, member.id));
      expect(txs.find((t) => t.amount === 12001)).toBeUndefined();
    });
  });

  // ─── renewSubscription ─────────────────────────────────────────────────────
  describe("renewSubscription", () => {
    it("Happy — amountReceived parcial → balance row positivo + notes 'renovar'", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Renew Happy Plan",
        classesPerWeek: 3,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      const member = await createMember(app);

      await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        startDate: todayStr(),
      });

      const partial = 3000; // renewalPrice=10000 → balance pendiente 7000

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          paymentMethod: "cash",
          amountReceived: partial,
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body) as { id: number; pricePaid: number };
      expect(body.pricePaid).toBe(10000);

      const newSubId = body.id;

      const [bal] = await app.db
        .select()
        .from(schema.balances)
        .where(
          and(
            eq(schema.balances.memberId, member.id),
            eq(schema.balances.targetKind, "subscription"),
            eq(schema.balances.targetId, newSubId),
          ),
        )
        .limit(1);
      expect(bal?.amount).toBe(10000 - partial);

      const txs = await app.db
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.memberId, member.id));
      const renewTx = txs.find((t) => t.amount === partial);
      expect(renewTx).toBeTruthy();
      expect(renewTx?.notes ?? "").toMatch(/Cobro al renovar plan/);
    });

    it("Sad — amountReceived > renewalPrice → 400 + rollback (sub original intacta)", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Renew Sad Plan",
        classesPerWeek: 3,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      const member = await createMember(app);

      const assignRes = await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        startDate: todayStr(),
      });
      const oldSubId = assignRes.body.id as number;

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          paymentMethod: "cash",
          amountReceived: 10001, // renewalPrice + 1
        },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body) as { message?: string };
      expect(body.message ?? "").toMatch(/no puede exceder/i);

      // Rollback: la sub original sigue activa, NO se creó la nueva
      // (scheduled) por la renovación. NO hay financial_transaction de
      // monto 10001.
      const subs = await app.db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, member.id));
      expect(subs).toHaveLength(1);
      expect(subs[0].id).toBe(oldSubId);
      expect(subs[0].status).toBe("active");

      const txs = await app.db
        .select()
        .from(schema.financialTransactions)
        .where(eq(schema.financialTransactions.memberId, member.id));
      expect(txs.find((t) => t.amount === 10001)).toBeUndefined();
    });
  });
});
