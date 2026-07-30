/**
 * Phase 117-02 (D-10): user_status_history forward-only hook
 *
 * The SubscriptionService.recomputeUserStatus hook records a row in
 * user_status_history whenever it effectively changes users.status. This
 * suite covers, against real MySQL (eltemplo_test):
 *
 *   (a) Assigning a plan that activates the member inserts a single
 *       freemium → activo row (source='recompute').
 *   (b) Re-running recomputeUserStatus with NO status change inserts NO
 *       duplicate row (forward-only — never insert when from == to).
 *   (c) When the surrounding subscription transaction rolls back, the history
 *       row vanishes with it (atomicity, T-117-04).
 *
 * Uses a directly-instantiated SubscriptionService (mirrors
 * user-status-transitions.test.ts) so the rollback test can spy on a private
 * method. Real clock — vi.useFakeTimers desyncs from MySQL CURDATE() in
 * recomputeUserStatus (Phase 103-03 lesson).
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import argon2 from "argon2";
import * as schema from "../../src/db/schema";
import { createTestApp, cleanAllTestData } from "../helpers";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { SubscriptionService } from "../../src/modules/subscriptions/service";
import { AuraService } from "../../src/modules/aura";
import {
  TransactionService,
  BalanceService,
  CashRegisterService,
} from "../../src/modules/finance";
import { BookingService } from "../../src/modules/scheduling/booking-service";
import { NotificationService } from "../../src/modules/notifications/service";
import { EnrollmentService } from "../../src/modules/programs/enrollment-service";

describe("Phase 117-02 — user_status_history forward-only hook", () => {
  let app: FastifyInstance;
  let presentialBranchId: number;
  let testPlanId: number;
  let svc: SubscriptionService;

  function todayStr(): string {
    return new Date().toISOString().split("T")[0];
  }

  function buildService(): SubscriptionService {
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
    const subs = new SubscriptionService(
      app.db,
      app.log,
      aura,
      txns,
      enrollments,
    );
    const notifs = new NotificationService(app.db, app.log);
    const bookings = new BookingService(app.db, app.log, subs, notifs);
    subs.setBookingService(bookings);
    return subs;
  }

  async function insertMember(
    status: "freemium" | "prueba" | "activo" | "inactivo" | null,
    branchId: number,
  ): Promise<number> {
    const passwordHash = await argon2.hash("x");
    const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const [{ id }] = await app.db
      .insert(schema.users)
      .values({
        email: `ush-${unique}@test.com`,
        passwordHash,
        firstName: "Status",
        lastName: "Hist",
        dni: `H${unique}`,
        branchId,
        role: "member",
        level: "alfa",
        status,
      })
      .$returningId();
    return id;
  }

  async function assignDefaultPlan(userId: number): Promise<void> {
    await svc.assignPlan(
      { tenantId: TENANT_TEMPLO },
      userId,
      {
        planId: testPlanId,
        branchId: presentialBranchId,
        startDate: todayStr(),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
        priceOverrideAmount: 0,
        priceOverrideReason: "test (no charge — isolation)",
      },
      /* adminId */ 2,
    );
  }

  async function getHistory(
    userId: number,
  ): Promise<(typeof schema.userStatusHistory.$inferSelect)[]> {
    return app.db
      .select()
      .from(schema.userStatusHistory)
      .where(eq(schema.userStatusHistory.userId, userId));
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);

    const branches = await app.db.select().from(schema.branches);
    const presential = branches.find((b) => b.code !== "ONLINE");
    if (!presential) {
      throw new Error("Test seed missing presential branch");
    }
    presentialBranchId = presential.id;

    const [planA] = await app.db
      .insert(schema.subscriptionPlans)
      .values({
        name: "Test Plan Presencial",
        planTier: "flex",
        bookingMode: "flexible",
        planCategory: "presencial",
        priceRegular: 10000,
        priceZero: 8000,
        durationDays: 30,
        classesPerWeek: 3,
        country: "AR",
        currency: "ARS",
      })
      .$returningId();
    testPlanId = planA.id;

    svc = buildService();
  });

  it("(a) records a freemium → activo row on assignPlan", async () => {
    const userId = await insertMember("freemium", presentialBranchId);
    await assignDefaultPlan(userId);

    const rows = await getHistory(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].fromStatus).toBe("freemium");
    expect(rows[0].toStatus).toBe("activo");
    expect(rows[0].source).toBe("recompute");
    expect(rows[0].changedAt).toBeInstanceOf(Date);
  });

  it("(b) does NOT insert a duplicate when status is unchanged", async () => {
    const userId = await insertMember("freemium", presentialBranchId);
    await assignDefaultPlan(userId);
    expect(await getHistory(userId)).toHaveLength(1);

    // The member is already 'activo'. Re-running recomputeUserStatus must be a
    // forward-only no-op (from == to) → no second row.
    await (
      svc as unknown as {
        recomputeUserStatus: (uid: number, tx: typeof app.db) => Promise<void>;
      }
    ).recomputeUserStatus(userId, app.db);

    expect(await getHistory(userId)).toHaveLength(1);
  });

  it("(c) rolls back the history row when the surrounding tx fails", async () => {
    const userId = await insertMember("freemium", presentialBranchId);

    // recordAssignmentCharge runs AFTER recomputeUserStatus inside the same
    // assignPlan tx. Forcing it to throw rolls back the whole tx, including
    // the history row inserted by the hook (T-117-04).
    const spy = vi
      .spyOn(
        svc as unknown as {
          recordAssignmentCharge: (...args: unknown[]) => Promise<void>;
        },
        "recordAssignmentCharge",
      )
      .mockRejectedValueOnce(new Error("forced failure"));

    await expect(assignDefaultPlan(userId)).rejects.toThrow("forced failure");

    // Subscription INSERT rolled back …
    const subs = await app.db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId));
    expect(subs).toHaveLength(0);

    // … and so did the history row.
    expect(await getHistory(userId)).toHaveLength(0);

    // Status unchanged.
    const [u] = await app.db
      .select({ status: schema.users.status })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    expect(u?.status).toBe("freemium");

    spy.mockRestore();
  });
});
