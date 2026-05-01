/**
 * Phase 103-02: users.status Auto-Transition Integration Tests
 *
 * Covers SPEC R5/R6 + decision D-04 (cancellation never goes back to
 * freemium/prueba) + decision D-16 (atomic rollback when
 * recomputeUserStatus throws inside a subscription mutation).
 *
 * Runs against real MySQL (eltemplo_test). Uses a directly-instantiated
 * SubscriptionService so the atomic-rollback test can vi.spyOn() the
 * private recomputeUserStatus method without going through HTTP.
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
import { eq, and } from "drizzle-orm";
import argon2 from "argon2";
import * as schema from "../../src/db/schema";
import { createTestApp, cleanAllTestData } from "../helpers";
import { SubscriptionService } from "../../src/modules/subscriptions/service";
import { AuraService } from "../../src/modules/aura";
import { TransactionService, BalanceService } from "../../src/modules/finance";
import { BookingService } from "../../src/modules/scheduling/booking-service";
import { NotificationService } from "../../src/modules/notifications/service";

describe("Phase 103 — User status auto-transitions", () => {
  let app: FastifyInstance;
  let onlineBranchId: number;
  let presentialBranchId: number;
  let testPlanId: number;
  let secondPlanId: number;
  let svc: SubscriptionService;

  function todayStr(): string {
    return new Date().toISOString().split("T")[0];
  }

  function buildService(): SubscriptionService {
    const aura = new AuraService(app.db);
    const balances = new BalanceService(app.db, app.log);
    const txns = new TransactionService(app.db, app.log, balances);
    const subs = new SubscriptionService(app.db, app.log, aura, txns);
    const notifs = new NotificationService(app.db, app.log);
    const bookings = new BookingService(app.db, app.log, subs, notifs);
    subs.setBookingService(bookings);
    return subs;
  }

  /** Helper: insert a member row directly with explicit status. */
  async function insertMember(
    status: "freemium" | "prueba" | "activo" | "inactivo" | null,
    branchId: number,
  ): Promise<number> {
    const passwordHash = await argon2.hash("x");
    // Keep DNI ≤ 20 chars (schema cap). Base36 of (Date.now() + random short
    // suffix) gives a compact unique key while preserving collision safety
    // across parallel workers.
    const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const [{ id }] = await app.db
      .insert(schema.users)
      .values({
        email: `status-tx-${unique}@test.com`,
        passwordHash,
        firstName: "Status",
        lastName: "Tx",
        dni: `T${unique}`,
        branchId,
        role: "member",
        level: "alfa",
        status,
      })
      .$returningId();
    return id;
  }

  /** Helper: assign the canonical test plan via the service (default branch=presential).
   *
   * Phase 111 REQ-3: uses priceOverrideAmount=0 so assignPlan does NOT
   * record a charge tx. Without this, cancelSubscription would refuse to
   * cancel (active charge tx blocks it) — these tests are about user.status
   * transitions, not the financial guard.
   */
  async function assignDefaultPlan(
    userId: number,
    overrides: Partial<{
      planId: number;
      branchId: number;
      startDate: string;
    }> = {},
  ): Promise<void> {
    await svc.assignPlan(
      userId,
      {
        planId: overrides.planId ?? testPlanId,
        branchId: overrides.branchId ?? presentialBranchId,
        startDate: overrides.startDate ?? todayStr(),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
        priceOverrideAmount: 0,
        priceOverrideReason: "test (no charge — REQ-3 isolation)",
      },
      /* adminId */ 2,
    );
  }

  async function getStatus(userId: number): Promise<string | null> {
    const [u] = await app.db
      .select({ status: schema.users.status })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    return u?.status ?? null;
  }

  async function getConvertedAt(userId: number): Promise<Date | null> {
    const [u] = await app.db
      .select({ convertedAt: schema.users.convertedAt })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    return u?.convertedAt ?? null;
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
    const online = branches.find((b) => b.code === "ONLINE");
    const presential = branches.find((b) => b.code !== "ONLINE");
    if (!online || !presential) {
      throw new Error("Test seed missing ONLINE / presential branch");
    }
    onlineBranchId = online.id;
    presentialBranchId = presential.id;

    // Seed two distinct plans for multi-sub scenarios. Plan 1 is presencial,
    // plan 2 is online so a user can hold both simultaneously (D-35).
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

    const [planB] = await app.db
      .insert(schema.subscriptionPlans)
      .values({
        name: "Test Plan Online",
        planTier: "flex",
        bookingMode: "flexible",
        planCategory: "online_regular",
        priceRegular: 5000,
        priceZero: 4000,
        durationDays: 30,
        classesPerWeek: null,
        country: "AR",
        currency: "ARS",
      })
      .$returningId();
    secondPlanId = planB.id;

    svc = buildService();
  });

  // =========================================================================
  // R5 — create subscription transitions to 'activo'
  // =========================================================================
  describe("R5 — create subscription transitions to 'activo'", () => {
    it("freemium → activo on assignPlan", async () => {
      // Phase 111 REQ-1: presencial plan on virtual branch is now rejected.
      // The intent here is the freemium → activo status transition; branch
      // choice is incidental, so use the presential branch.
      const userId = await insertMember("freemium", presentialBranchId);
      await assignDefaultPlan(userId);
      expect(await getStatus(userId)).toBe("activo");
    });

    it("prueba → activo on assignPlan", async () => {
      const userId = await insertMember("prueba", presentialBranchId);
      await assignDefaultPlan(userId);
      expect(await getStatus(userId)).toBe("activo");
    });

    it("inactivo → activo on assignPlan", async () => {
      const userId = await insertMember("inactivo", presentialBranchId);
      await assignDefaultPlan(userId);
      expect(await getStatus(userId)).toBe("activo");
    });
  });

  // =========================================================================
  // R6 — cancel subscription transitions to 'inactivo'
  // =========================================================================
  describe("R6 — cancel subscription transitions to 'inactivo'", () => {
    it("activo → inactivo when last active sub cancelled", async () => {
      const userId = await insertMember("inactivo", presentialBranchId);
      await assignDefaultPlan(userId);
      expect(await getStatus(userId)).toBe("activo");

      await svc.cancelSubscription(userId, /* actorId */ 2);
      expect(await getStatus(userId)).toBe("inactivo");
    });

    it("cancelling one of two active subs leaves status='activo'", async () => {
      const userId = await insertMember("inactivo", presentialBranchId);
      // Sub 1: presencial
      await assignDefaultPlan(userId, { planId: testPlanId });
      // Sub 2: online (D-35: presencial + online allowed simultaneously)
      await assignDefaultPlan(userId, {
        planId: secondPlanId,
        branchId: onlineBranchId,
      });
      expect(await getStatus(userId)).toBe("activo");

      // cancelSubscription cancels the user's single "active" sub; with two
      // active, getMemberSubscription returns the most recent one. Cancel
      // it manually via direct DB write (the service path picks the newest
      // automatically) then call recompute via cancel on the other one.
      // Simpler path: explicitly cancel ONE sub directly via DB to leave the
      // other active, then run recompute via a no-op cancel-of-the-cancelled.
      const subs = await app.db
        .select({ id: schema.subscriptions.id })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, userId));
      expect(subs).toHaveLength(2);

      // Cancel one through the service (it cancels the latest active sub).
      await svc.cancelSubscription(userId, /* actorId */ 2);
      // One sub remains active → status stays 'activo'
      expect(await getStatus(userId)).toBe("activo");
    });

    it("previously-freemium user who buys and cancels lands in inactivo (D-04)", async () => {
      const userId = await insertMember("freemium", onlineBranchId);
      // Buy → activo
      await assignDefaultPlan(userId, {
        planId: secondPlanId,
        branchId: onlineBranchId,
      });
      expect(await getStatus(userId)).toBe("activo");

      // Cancel → inactivo (NOT back to freemium, per D-04 — paying history)
      await svc.cancelSubscription(userId, /* actorId */ 2);
      expect(await getStatus(userId)).toBe("inactivo");
    });
  });

  // =========================================================================
  // converted_at absorption (markConvertedIfLead replacement)
  // =========================================================================
  describe("converted_at absorption (replaces markConvertedIfLead)", () => {
    it("sets converted_at on first activo transition if user had a trial booking", async () => {
      const userId = await insertMember("prueba", presentialBranchId);
      // Seed a real schedule + trial booking. recomputeUserStatus reads
      // EXISTS on member_id + is_trial=1, so the booking just needs to exist.
      // Seed an activity (FK from schedules.activity_id)
      const [activity] = await app.db
        .insert(schema.activities)
        .values({ name: "Test Activity" })
        .$returningId();
      const [sched] = await app.db
        .insert(schema.schedules)
        .values({
          branchId: presentialBranchId,
          activityId: activity.id,
          dayOfWeek: 1,
          startTime: "10:00",
          endTime: "11:00",
          isActive: true,
        })
        .$returningId();
      await app.db.insert(schema.bookings).values({
        memberId: userId,
        scheduleId: sched.id,
        bookingDate: todayStr(),
        status: "confirmado",
        isTrial: true,
      });

      expect(await getConvertedAt(userId)).toBeNull();

      await assignDefaultPlan(userId);
      expect(await getStatus(userId)).toBe("activo");
      const convertedAt = await getConvertedAt(userId);
      expect(convertedAt).not.toBeNull();
      expect(convertedAt).toBeInstanceOf(Date);

      // Idempotency: a second sub mutation does NOT overwrite convertedAt
      const firstConvertedAtMs = (convertedAt as Date).getTime();
      await svc.cancelSubscription(userId, /* actorId */ 2);
      // Re-buy the same plan path
      await assignDefaultPlan(userId);
      const second = await getConvertedAt(userId);
      expect(second).not.toBeNull();
      expect((second as Date).getTime()).toBe(firstConvertedAtMs);
    });

    it("does NOT set converted_at if user never had a trial booking", async () => {
      const userId = await insertMember("freemium", onlineBranchId);
      expect(await getConvertedAt(userId)).toBeNull();

      await assignDefaultPlan(userId, {
        planId: secondPlanId,
        branchId: onlineBranchId,
      });
      expect(await getStatus(userId)).toBe("activo");
      expect(await getConvertedAt(userId)).toBeNull();
    });
  });

  // =========================================================================
  // D-16 atomic rollback
  // =========================================================================
  describe("D-16 atomic rollback", () => {
    it("rolls back the subscription INSERT if recomputeUserStatus throws", async () => {
      const userId = await insertMember("freemium", onlineBranchId);

      // Cast through unknown to access the private method via spyOn.
      // vitest spy on a private method is the standard pattern for testing
      // transactional rollback when the side-effect helper fails.
      const spy = vi
        .spyOn(
          svc as unknown as {
            recomputeUserStatus: (uid: number, tx: unknown) => Promise<void>;
          },
          "recomputeUserStatus",
        )
        .mockRejectedValueOnce(new Error("forced failure"));

      await expect(
        assignDefaultPlan(userId, {
          planId: secondPlanId,
          branchId: onlineBranchId,
        }),
      ).rejects.toThrow("forced failure");

      // Subscription INSERT must have rolled back
      const subs = await app.db
        .select({ id: schema.subscriptions.id })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, userId));
      expect(subs).toHaveLength(0);

      // user.status must remain unchanged
      expect(await getStatus(userId)).toBe("freemium");

      spy.mockRestore();
    });
  });

  // Suppress unused import warning for `and` (kept for potential future filters)
  void and;
});
