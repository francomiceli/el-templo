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

import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
} from "vitest";
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
import { hookRegistry } from "../../src/modules/shared/hooks";
import { streakMilestoneRewardHandler } from "../../src/modules/aura/streak-reward";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { setModuleFlag, restoreTemploFlags } from "../fixtures/module-flags";

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

  /**
   * Fase 176 Plan 07 (MOD-02): prueba end-to-end, sobre el camino real
   * (POST /api/sessions/complete -> StreakService.updateStreak ->
   * hookRegistry.emit("streak.milestone", ...) -> streakMilestoneRewardHandler),
   * las dos semanticas que `test/tenancy/mod-02-hooks.test.ts` ya prueba en
   * aislamiento contra un HookRegistry de prueba: best-effort (un handler
   * que explota no rompe el registro de la sesion) y gating por modulo (con
   * `templo-gamification` apagado no se otorga AURA por racha).
   */
  describe("streak.milestone — event del módulo", () => {
    // 7 dayIds distintos (mismo nivel "alfa", parseDayId no valida que el
    // dia/semana existan de verdad) para completar 7 sesiones el mismo dia
    // y llegar al milestone de racha 7 sin depender del calendario real.
    const SEVEN_DAY_IDS = [
      "W1-lunes-alfa",
      "W1-martes-alfa",
      "W1-miercoles-alfa",
      "W1-jueves-alfa",
      "W1-viernes-alfa",
      "W1-sabado-alfa",
      "W2-lunes-alfa",
    ];

    afterEach(async () => {
      // Idempotente por (modulo, key): esto deja el registry de proceso
      // exactamente como estaba antes del test (critico: `isolate: false`
      // comparte el singleton entre archivos de test del mismo worker).
      hookRegistry.setEvent(
        "templo-gamification",
        "streak.milestone",
        streakMilestoneRewardHandler,
      );
      await restoreTemploFlags(app);
    });

    it("best-effort: un handler que explota no rompe el registro de la sesión ni otorga AURA", async () => {
      hookRegistry.setEvent(
        "templo-gamification",
        "streak.milestone",
        async () => {
          throw new Error("boom");
        },
      );

      const today = new Date().toISOString().split("T")[0];
      let lastRes;
      for (const dayId of SEVEN_DAY_IDS) {
        lastRes = await completeSession(dayId, today);
      }

      // La operacion principal (registro de sesion + update de racha) sucede
      // igual, aunque el handler de la recompensa haya explotado.
      expect(lastRes!.statusCode).toBe(200);

      const [profile] = await app.db
        .select({ currentStreak: schema.memberProfiles.currentStreak })
        .from(schema.memberProfiles)
        .where(
          and(
            tenantWhere(schema.memberProfiles, CTX_TEMPLO),
            eq(schema.memberProfiles.userId, memberId),
          ),
        );
      expect(profile.currentStreak).toBe(7);

      const bonusTxs = await app.db
        .select({ id: schema.auraTransactions.id })
        .from(schema.auraTransactions)
        .where(
          and(
            eq(schema.auraTransactions.userId, memberId),
            eq(schema.auraTransactions.sourceType, "streak_bonus"),
          ),
        );
      expect(bonusTxs).toHaveLength(0);
    });

    it("módulo apagado: no se otorga AURA por racha, pero la racha se actualiza igual", async () => {
      await setModuleFlag(app, TENANT_TEMPLO, "templo-gamification", false);

      const today = new Date().toISOString().split("T")[0];
      let lastRes;
      for (const dayId of SEVEN_DAY_IDS) {
        lastRes = await completeSession(dayId, today);
      }

      expect(lastRes!.statusCode).toBe(200);

      const [profile] = await app.db
        .select({ currentStreak: schema.memberProfiles.currentStreak })
        .from(schema.memberProfiles)
        .where(
          and(
            tenantWhere(schema.memberProfiles, CTX_TEMPLO),
            eq(schema.memberProfiles.userId, memberId),
          ),
        );
      expect(profile.currentStreak).toBe(7);

      const bonusTxs = await app.db
        .select({ id: schema.auraTransactions.id })
        .from(schema.auraTransactions)
        .where(
          and(
            eq(schema.auraTransactions.userId, memberId),
            eq(schema.auraTransactions.sourceType, "streak_bonus"),
          ),
        );
      expect(bonusTxs).toHaveLength(0);
    });
  });
});
