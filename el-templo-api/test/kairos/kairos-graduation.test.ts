/**
 * Phase 130 Plan 02 (KAIROS-05, D-02, D-03).
 *
 * Unit/integration suite for the auto-graduation service:
 *   1. Threshold reached: kairos + override=false + THRESHOLD sessions → alfa.
 *   2. Below threshold: kairos + override=false + (THRESHOLD-1) sessions → kairos.
 *   3. Override skips: kairos + override=true + ≥THRESHOLD sessions → kairos.
 *   4. One-way: alfa + ≥THRESHOLD sessions → alfa (never demoted/re-evaluated).
 *   5. Idempotent: a second call on an already-graduated alfa member is a no-op.
 *
 * The service is exercised directly (no HTTP), seeding users.level /
 * level_override and completed_sessions straight through the DB. Runs in CI
 * (project policy: integration suite is not run locally).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, registerUser, cleanAllTestData } from "../helpers";
import { users } from "../../src/db/schema/users";
import { completedSessions } from "../../src/db/schema/completed-sessions";
import { GraduationService } from "../../src/modules/members/graduation-service";
import { KAIROS_GRADUATION_THRESHOLD } from "../../src/modules/shared/training-constants";

describe("Phase 130 - kairos auto-graduation", () => {
  let app: FastifyInstance;
  let service: GraduationService;

  beforeAll(async () => {
    app = await createTestApp();
    service = new GraduationService(app.db, app.log);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  // Create a member (born kairos), then force its level/override to a known
  // baseline for the test scenario.
  async function makeMember(opts: {
    email: string;
    level: "kairos" | "alfa";
    levelOverride: boolean;
  }): Promise<number> {
    const result = await registerUser(app, {
      email: opts.email,
      password: "pass123456",
      firstName: "Grad",
      lastName: "Test",
      branchId: 1,
    });
    const userId = (result.user as { id: number }).id;
    await app.db
      .update(users)
      .set({ level: opts.level, levelOverride: opts.levelOverride })
      .where(eq(users.id, userId));
    return userId;
  }

  // Seed `n` completed_sessions rows for a member. Each gets a distinct dayId so
  // they are independent completion rows.
  async function seedCompletedSessions(
    userId: number,
    n: number,
  ): Promise<void> {
    const now = new Date();
    const rows = Array.from({ length: n }, (_, i) => ({
      userId,
      dayId: `grad-W${i + 1}-lunes-kairos`,
      sessionLevel: "kairos" as const,
      date: "2026-06-01",
      branchId: 1,
      startedAt: now,
      completedAt: now,
      blocksCompleted: ["NUCLEUS"],
    }));
    if (rows.length > 0) {
      await app.db.insert(completedSessions).values(rows);
    }
  }

  async function readLevel(userId: number): Promise<string | undefined> {
    const [row] = await app.db
      .select({ level: users.level })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row?.level;
  }

  // Test 1: kairos, no override, at the threshold → promoted to alfa.
  it("graduates a kairos member to alfa at the threshold", async () => {
    const userId = await makeMember({
      email: "grad-threshold@test.com",
      level: "kairos",
      levelOverride: false,
    });
    await seedCompletedSessions(userId, KAIROS_GRADUATION_THRESHOLD);

    await service.maybeGraduateKairos(userId);

    expect(await readLevel(userId)).toBe("alfa");
  });

  // Test 2: kairos, no override, one below the threshold → stays kairos.
  it("does NOT graduate below the threshold", async () => {
    const userId = await makeMember({
      email: "grad-below@test.com",
      level: "kairos",
      levelOverride: false,
    });
    await seedCompletedSessions(userId, KAIROS_GRADUATION_THRESHOLD - 1);

    await service.maybeGraduateKairos(userId);

    expect(await readLevel(userId)).toBe("kairos");
  });

  // Test 3: kairos, override=true, past the threshold → stays kairos (D-03).
  it("skips a member with level_override=true even past the threshold", async () => {
    const userId = await makeMember({
      email: "grad-override@test.com",
      level: "kairos",
      levelOverride: true,
    });
    await seedCompletedSessions(userId, KAIROS_GRADUATION_THRESHOLD + 3);

    await service.maybeGraduateKairos(userId);

    expect(await readLevel(userId)).toBe("kairos");
  });

  // Test 4: alfa member past the threshold → stays alfa (one-way, never re-evaluated).
  it("never demotes or re-evaluates an alfa member (one-way)", async () => {
    const userId = await makeMember({
      email: "grad-oneway@test.com",
      level: "alfa",
      levelOverride: false,
    });
    await seedCompletedSessions(userId, KAIROS_GRADUATION_THRESHOLD + 5);

    await service.maybeGraduateKairos(userId);

    expect(await readLevel(userId)).toBe("alfa");
  });

  // Test 5: a second call on an already-graduated alfa member is a no-op.
  it("is idempotent on an already-graduated member", async () => {
    const userId = await makeMember({
      email: "grad-idempotent@test.com",
      level: "kairos",
      levelOverride: false,
    });
    await seedCompletedSessions(userId, KAIROS_GRADUATION_THRESHOLD);

    await service.maybeGraduateKairos(userId);
    expect(await readLevel(userId)).toBe("alfa");

    // Second call: still alfa, no error, no change.
    await service.maybeGraduateKairos(userId);
    expect(await readLevel(userId)).toBe("alfa");
  });
});
