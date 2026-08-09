/**
 * Integration tests for streak tracking.
 *
 * Tests the StreakService via the API (session completion + progression stats).
 * Verifies:
 * - Streak increments on session completion
 * - longestStreak tracks maximum
 * - Streak data appears in progression stats
 * - AURA is awarded on session completion
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import * as schema from "../../src/db/schema";
import {
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";

// Archivo single-tenant (solo El Templo): filtro preciso, no exencion.
const CTX_TEMPLO: TenantContext = { tenantId: 1 };

describe("Streak Service Integration", () => {
  let app: FastifyInstance;
  let memberToken: string;
  let memberId: number;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);

    // Clean and re-seed AURA config for this test suite
    await app.db.delete(schema.auraConfig);
    await app.db.insert(schema.auraConfig).values([
      {
        sourceType: "training_completion",
        defaultAmount: 10,
        description: "Completed a training session",
        isActive: true,
      },
      {
        sourceType: "streak_bonus",
        defaultAmount: 20,
        description: "Streak milestone bonus",
        isActive: true,
      },
    ]);

    // Register a member
    const result = await registerUser(app, {
      email: "streak-test@test.com",
      password: "password123",
      branchId: 1,
    });
    memberToken = result.token;
    memberId = (result.user as { id: number }).id;

    // Create onboarding profile (required — streak service only updates existing profiles)
    await app.db.insert(schema.memberProfiles).values({
      userId: memberId,
      goalType: "fitness",
      experienceLevel: "beginner",
      trainingFocus: "full_body",
      motivationStyle: "discipline",
      onboardingCompletedAt: new Date(),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Helper: complete a session with a given dayId and date
   */
  async function completeSession(dayId: string, date: string) {
    return app.inject({
      method: "POST",
      url: "/api/sessions/complete",
      headers: { authorization: `Bearer ${memberToken}` },
      payload: {
        dayId,
        date,
        startedAt: new Date().toISOString(),
        rpe: 7,
        blocksCompleted: ["INITIUM", "NUCLEUS"],
      },
    });
  }

  it("increments streak on session completion", async () => {
    const today = new Date().toISOString().split("T")[0];
    const res = await completeSession("W1-lunes-alfa", today);
    expect(res.statusCode).toBe(200);

    // Check member_profiles has streak = 1
    const [profile] = await app.db
      .select({
        currentStreak: schema.memberProfiles.currentStreak,
        longestStreak: schema.memberProfiles.longestStreak,
      })
      .from(schema.memberProfiles)
      .where(
        and(
          tenantWhere(schema.memberProfiles, CTX_TEMPLO),
          eq(schema.memberProfiles.userId, memberId),
        ),
      );

    expect(profile).toBeDefined();
    expect(profile.currentStreak).toBe(1);
    expect(profile.longestStreak).toBe(1);
  });

  it("longestStreak tracks maximum", async () => {
    const today = new Date().toISOString().split("T")[0];

    // Complete first session
    await completeSession("W1-lunes-alfa", today);

    // Check streak after first session
    const [profile1] = await app.db
      .select({
        currentStreak: schema.memberProfiles.currentStreak,
        longestStreak: schema.memberProfiles.longestStreak,
      })
      .from(schema.memberProfiles)
      .where(
        and(
          tenantWhere(schema.memberProfiles, CTX_TEMPLO),
          eq(schema.memberProfiles.userId, memberId),
        ),
      );

    expect(profile1.currentStreak).toBe(1);
    expect(profile1.longestStreak).toBe(1);

    // Complete second session on same day (different dayId)
    // This should increment streak to 2 (same day re-completion)
    await completeSession("W1-martes-alfa", today);

    const [profile2] = await app.db
      .select({
        currentStreak: schema.memberProfiles.currentStreak,
        longestStreak: schema.memberProfiles.longestStreak,
      })
      .from(schema.memberProfiles)
      .where(
        and(
          tenantWhere(schema.memberProfiles, CTX_TEMPLO),
          eq(schema.memberProfiles.userId, memberId),
        ),
      );

    // Second call increments streak again
    expect(profile2.currentStreak).toBe(2);
    expect(profile2.longestStreak).toBe(2);
  });

  it("progression stats returns both currentStreak and longestStreak", async () => {
    const today = new Date().toISOString().split("T")[0];

    // Complete a session to establish a streak
    await completeSession("W1-lunes-alfa", today);

    // Get progression stats
    const statsRes = await app.inject({
      method: "GET",
      url: "/api/progression/stats",
      headers: { authorization: `Bearer ${memberToken}` },
    });

    expect(statsRes.statusCode).toBe(200);
    const body = JSON.parse(statsRes.body);

    expect(body.stats).toHaveProperty("currentStreak");
    expect(body.stats).toHaveProperty("longestStreak");
    expect(typeof body.stats.currentStreak).toBe("number");
    expect(typeof body.stats.longestStreak).toBe("number");
    expect(body.stats.currentStreak).toBeGreaterThanOrEqual(1);
    expect(body.stats.longestStreak).toBeGreaterThanOrEqual(1);
  });

  it("awards AURA on session completion", async () => {
    const today = new Date().toISOString().split("T")[0];

    // Complete a session
    await completeSession("W1-lunes-alfa", today);

    // Check AURA transaction was created
    const transactions = await app.db
      .select({
        sourceType: schema.auraTransactions.sourceType,
        amount: schema.auraTransactions.amount,
        referenceType: schema.auraTransactions.referenceType,
      })
      .from(schema.auraTransactions)
      .where(eq(schema.auraTransactions.userId, memberId));

    const trainingTx = transactions.find(
      (t) => t.sourceType === "training_completion",
    );
    expect(trainingTx).toBeDefined();
    expect(trainingTx!.amount).toBe(10);
    expect(trainingTx!.referenceType).toBe("completed_session");

    // Check balance
    const [balance] = await app.db
      .select({ balance: schema.auraBalances.balance })
      .from(schema.auraBalances)
      .where(eq(schema.auraBalances.userId, memberId));

    expect(balance).toBeDefined();
    expect(balance.balance).toBeGreaterThanOrEqual(10);
  });
});
