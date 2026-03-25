/**
 * End-to-end test: session completion + AURA + streak flow.
 *
 * Verifies the full pipeline:
 * 1. POST /sessions/complete returns success
 * 2. training_completion AURA transaction is created
 * 3. member_profiles.currentStreak is updated
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import * as schema from "../../src/db/schema";

describe("Session Complete → AURA + Streak E2E", () => {
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

    // Register test member
    const result = await registerUser(app, {
      email: "e2e-streak@test.com",
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

  it("session completion creates AURA transaction and updates streak", async () => {
    const today = new Date().toISOString().split("T")[0];

    // Step 1: Complete a session
    const completeRes = await app.inject({
      method: "POST",
      url: "/api/sessions/complete",
      headers: { authorization: `Bearer ${memberToken}` },
      payload: {
        dayId: "W1-lunes-alfa",
        date: today,
        startedAt: new Date().toISOString(),
        rpe: 6,
        blocksCompleted: ["INITIUM", "NUCLEUS", "ATHLOS"],
      },
    });

    expect(completeRes.statusCode).toBe(200);
    const completeBody = JSON.parse(completeRes.body);
    expect(completeBody.success).toBe(true);
    expect(completeBody.completedSessionId).toBeGreaterThan(0);

    // Step 2: Verify training_completion AURA transaction
    const txRows = await app.db
      .select({
        sourceType: schema.auraTransactions.sourceType,
        amount: schema.auraTransactions.amount,
        referenceType: schema.auraTransactions.referenceType,
        referenceId: schema.auraTransactions.referenceId,
      })
      .from(schema.auraTransactions)
      .where(eq(schema.auraTransactions.userId, memberId));

    const trainingTx = txRows.find(
      (t) => t.sourceType === "training_completion",
    );
    expect(trainingTx).toBeDefined();
    expect(trainingTx!.amount).toBe(10);
    expect(trainingTx!.referenceType).toBe("completed_session");
    expect(trainingTx!.referenceId).toBe(completeBody.completedSessionId);

    // Step 3: Verify member_profiles.currentStreak was updated
    const [profile] = await app.db
      .select({
        currentStreak: schema.memberProfiles.currentStreak,
        longestStreak: schema.memberProfiles.longestStreak,
        streakUpdatedAt: schema.memberProfiles.streakUpdatedAt,
      })
      .from(schema.memberProfiles)
      .where(eq(schema.memberProfiles.userId, memberId));

    expect(profile).toBeDefined();
    expect(profile.currentStreak).toBeGreaterThanOrEqual(1);
    expect(profile.longestStreak).toBeGreaterThanOrEqual(1);
    expect(profile.streakUpdatedAt).not.toBeNull();
  });

  it("session completion succeeds even without AURA config (graceful degradation)", async () => {
    // Clean AURA config to test graceful degradation
    await app.db.delete(schema.auraConfig);

    const today = new Date().toISOString().split("T")[0];

    const completeRes = await app.inject({
      method: "POST",
      url: "/api/sessions/complete",
      headers: { authorization: `Bearer ${memberToken}` },
      payload: {
        dayId: "W1-martes-alfa",
        date: today,
        startedAt: new Date().toISOString(),
        rpe: 5,
        blocksCompleted: ["INITIUM", "NUCLEUS"],
      },
    });

    // Session completion itself succeeds
    expect(completeRes.statusCode).toBe(200);
    const body = JSON.parse(completeRes.body);
    expect(body.success).toBe(true);

    // Streak should still be updated (AURA failure doesn't block streak)
    const [profile] = await app.db
      .select({ currentStreak: schema.memberProfiles.currentStreak })
      .from(schema.memberProfiles)
      .where(eq(schema.memberProfiles.userId, memberId));

    expect(profile).toBeDefined();
    expect(profile.currentStreak).toBeGreaterThanOrEqual(1);
  });
});
