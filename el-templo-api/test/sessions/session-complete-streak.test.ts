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
import { and, eq } from "drizzle-orm";
import {
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import { AURA_AMOUNTS } from "../../src/modules/aura/amounts";
import { AURA_TIME_RATIO } from "../../src/modules/sessions/proposed-time";
import {
  STANDARD_BLOCKS,
  cleanupFixtureExercises,
  rolesOf,
  seedSessionWithBlocks,
  startedAtForRatio,
} from "./_aura-session-fixtures";
import { todayInTz } from "../../src/modules/shared/date-utils";
import * as schema from "../../src/db/schema";

// Archivo single-tenant (solo El Templo): filtro preciso, no exencion.
const CTX_TEMPLO: TenantContext = { tenantId: 1 };

describe("Session Complete → AURA + Streak E2E", () => {
  let app: FastifyInstance;
  let memberToken: string;
  let memberId: number;
  // Tiempo propuesto de W1-lunes-alfa (D-20: el cierre valido manda un inicio que
  // alcanza el 80 % del tiempo propuesto y todos los bloques).
  let proposedSecLunes: number;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);

    // Tanda 2 / #4: completar exige un dayId aprobado (cleanAllTestData vacia
    // `sessions`, se siembra por test).
    const lunes = await seedSessionWithBlocks(
      app,
      "W1-lunes-alfa",
      STANDARD_BLOCKS,
    );
    proposedSecLunes = lunes.proposedSec;
    await seedSessionWithBlocks(app, "W1-martes-alfa", STANDARD_BLOCKS);

    // Clean and re-seed AURA config for this test suite
    await app.db.delete(schema.auraConfig);
    await app.db.insert(schema.auraConfig).values([
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
    await cleanupFixtureExercises(app);
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
        startedAt: startedAtForRatio(proposedSecLunes, AURA_TIME_RATIO),
        rpe: 6,
        blocksCompleted: rolesOf(STANDARD_BLOCKS),
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
    expect(trainingTx!.amount).toBe(AURA_AMOUNTS.training);
    // Tanda 2 / #4: premio por dia local de la sede (tope diario), ya no por
    // fila de completed_sessions.
    expect(trainingTx!.referenceType).toBe("training_day");
    const [branch] = await app.db
      .select({ timezone: schema.branches.timezone })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, CTX_TEMPLO),
          eq(schema.branches.id, 1),
        ),
      );
    expect(trainingTx!.referenceId).toBe(
      Number(todayInTz(branch!.timezone).replace(/-/g, "")),
    );

    // Step 3: Verify member_profiles.currentStreak was updated
    const [profile] = await app.db
      .select({
        currentStreak: schema.memberProfiles.currentStreak,
        longestStreak: schema.memberProfiles.longestStreak,
        streakUpdatedAt: schema.memberProfiles.streakUpdatedAt,
      })
      .from(schema.memberProfiles)
      .where(
        and(
          tenantWhere(schema.memberProfiles, CTX_TEMPLO),
          eq(schema.memberProfiles.userId, memberId),
        ),
      );

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
      .where(
        and(
          tenantWhere(schema.memberProfiles, CTX_TEMPLO),
          eq(schema.memberProfiles.userId, memberId),
        ),
      );

    expect(profile).toBeDefined();
    expect(profile.currentStreak).toBeGreaterThanOrEqual(1);
  });
});
