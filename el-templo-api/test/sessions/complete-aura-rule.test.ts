/**
 * Fase 214 (D-20, D-64 lado app): regla de Aura de la sesión.
 *
 * La app y el plan a medida acreditan Aura (AURA_AMOUNTS.training / goalPlan) solo si
 * están todos los bloques, la duración medida por el servidor llega al 80 % del
 * tiempo propuesto y ese día local no hubo asistencia con Aura ni la otra fuente de
 * la app. La regla condiciona SOLO el Aura: la sesión se guarda y la racha avanza
 * igual en todos los casos.
 *
 * El tiempo propuesto sale del fixture, que usa el mismo cálculo que producción.
 * Cada caso usa un usuario y un dayId propios para no chocar con el tope diario.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { AURA_AMOUNTS } from "../../src/modules/aura/amounts";
import { AURA_TIME_RATIO } from "../../src/modules/sessions/proposed-time";
import { todayInTz } from "../../src/modules/shared/date-utils";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  dateOffsetStr,
  todayStr,
} from "../helpers";
import {
  STANDARD_BLOCKS,
  cleanupFixtureExercises,
  rolesOf,
  seedSessionWithBlocks,
  startedAtBelowRatio,
  startedAtForRatio,
  type FixtureBlock,
} from "./_aura-session-fixtures";

const CTX_TEMPLO: TenantContext = { tenantId: 1 };
const SUBSCRIPTIONS_URL = "/api/admin/subscriptions";

const DAY_OK = "W41-lunes-alfa";
const DAY_79 = "W41-martes-alfa";
const DAY_FALTA = "W41-miercoles-alfa";
const DAY_ASISTIO = "W41-jueves-alfa";
const DAY_WELLHUB = "W41-viernes-alfa";
const DAY_APP_Y_PLAN = "W42-lunes-alfa";
const DAY_COMBOS = "W42-martes-alfa";
const DAY_13H = "W42-miercoles-alfa";
const DAY_DEUTEROS = "W42-jueves-alfa";
const GP_PLAN_SOLO = "GP-tren_superior-W41-lunes-alfa";
const GP_PLAN_79 = "GP-tren_superior-W41-martes-alfa";
const GP_COMBINADO = "GP-tren_superior-W42-lunes-alfa";
const SEEDED = [
  DAY_OK,
  DAY_79,
  DAY_FALTA,
  DAY_ASISTIO,
  DAY_WELLHUB,
  DAY_APP_Y_PLAN,
  DAY_COMBOS,
  DAY_13H,
  DAY_DEUTEROS,
  GP_PLAN_SOLO,
  GP_PLAN_79,
  GP_COMBINADO,
];

const COMBOS_BLOCKS: readonly FixtureBlock[] = [
  {
    role: "INITIUM",
    formatParams: { type: "amrap", minutes: 2 },
    exercises: [{ reps: 10, seconds: 30, rest: 15 }],
  },
  {
    role: "COMBOS_I",
    formatParams: { type: "standard" },
    exercises: [{ reps: 10, seconds: 30, rest: 15 }],
  },
  {
    role: "COMBOS_II",
    formatParams: { type: "standard" },
    exercises: [{ reps: 10, seconds: 30, rest: 15 }],
  },
  {
    role: "COMBOS_II_ALT",
    formatParams: { type: "standard" },
    exercises: [{ reps: 10, seconds: 600, rest: 15 }],
  },
  {
    role: "STRETCHING",
    formatParams: { type: "standard" },
    exercises: [{ reps: 10, seconds: 30, rest: 15 }],
  },
];

const DEUTEROS_BLOCKS: readonly FixtureBlock[] = [
  {
    role: "INITIUM",
    formatParams: { type: "amrap", minutes: 2 },
    exercises: [{ reps: 10, seconds: 30, rest: 15 }],
  },
  {
    role: "NUCLEUS",
    formatParams: { type: "standard" },
    exercises: [{ reps: 10, seconds: 30, rest: 15 }],
  },
  {
    role: "DEUTEROS_1",
    formatParams: { type: "standard" },
    exercises: [{ reps: 10, seconds: 30, rest: 15 }],
  },
  {
    role: "DEUTEROS_2",
    formatParams: { type: "standard" },
    exercises: [{ reps: 10, seconds: 30, rest: 15 }],
  },
  {
    role: "ATHLOS",
    formatParams: { type: "standard" },
    exercises: [{ reps: 10, seconds: 30, rest: 15 }],
  },
];

describe("Regla de Aura de la sesión (D-20) y tope del día con asistencia y plan a medida (D-64)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let localDate: string;
  let goalPlanId: number;
  let emailSeq = 0;

  async function newMember(withGoalPlan = false) {
    emailSeq += 1;
    const reg = await registerUser(app, {
      email: `aura-rule-${Date.now()}-${emailSeq}@test.com`,
      password: "password123",
      branchId: 1,
    });
    const userId = (reg.user as { id: number }).id;
    // La racha solo actualiza perfiles de onboarding ya creados.
    await app.db.insert(schema.memberProfiles).values({
      userId,
      goalType: "fitness",
      experienceLevel: "beginner",
      trainingFocus: "full_body",
      motivationStyle: "discipline",
      onboardingCompletedAt: new Date(),
    });
    if (withGoalPlan) {
      const assignRes = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${userId}/subscription/assign`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: goalPlanId,
          branchId: 1,
          startDate: dateOffsetStr(-25),
          priceTypeApplied: "regular",
          paymentMethod: "cash",
        },
      });
      expect(assignRes.statusCode).toBe(201);
    }
    return { token: reg.token, userId };
  }

  function post(
    url: string,
    token: string,
    dayId: string,
    startedAt: string,
    blocksCompleted: string[],
  ) {
    return app.inject({
      method: "POST",
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: { dayId, date: todayStr(), startedAt, blocksCompleted },
    });
  }

  const completeApp = (
    token: string,
    dayId: string,
    startedAt: string,
    blocksCompleted: string[],
  ) => post("/api/sessions/complete", token, dayId, startedAt, blocksCompleted);

  const completeGoalPlan = (
    token: string,
    dayId: string,
    startedAt: string,
    blocksCompleted: string[],
  ) =>
    post("/api/goal-plans/complete", token, dayId, startedAt, blocksCompleted);

  async function auraRows(userId: number) {
    return app.db
      .select({
        sourceType: schema.auraTransactions.sourceType,
        amount: schema.auraTransactions.amount,
      })
      .from(schema.auraTransactions)
      .where(
        and(
          tenantWhere(schema.auraTransactions, CTX_TEMPLO),
          eq(schema.auraTransactions.userId, userId),
          inArray(schema.auraTransactions.sourceType, [
            "training_completion",
            "goal_plan_completion",
          ]),
        ),
      );
  }

  async function completedRows(userId: number, dayId: string) {
    return app.db
      .select({
        id: schema.completedSessions.id,
        duration: schema.completedSessions.duration,
      })
      .from(schema.completedSessions)
      .where(
        and(
          tenantWhere(schema.completedSessions, CTX_TEMPLO),
          eq(schema.completedSessions.userId, userId),
          eq(schema.completedSessions.dayId, dayId),
        ),
      );
  }

  async function currentStreak(userId: number): Promise<number> {
    const [profile] = await app.db
      .select({ currentStreak: schema.memberProfiles.currentStreak })
      .from(schema.memberProfiles)
      .where(
        and(
          tenantWhere(schema.memberProfiles, CTX_TEMPLO),
          eq(schema.memberProfiles.userId, userId),
        ),
      );
    return profile?.currentStreak ?? 0;
  }

  /** La sesión se guardó y la racha avanzó: vale con y sin Aura. */
  async function expectSavedAndStreak(userId: number, dayId: string) {
    expect(await completedRows(userId, dayId)).toHaveLength(1);
    expect(await currentStreak(userId)).toBeGreaterThanOrEqual(1);
  }

  /** Asistencia del día local de la sede, con o sin su fila de Aura. */
  async function seedAttendance(
    userId: number,
    opts: { source: "qr" | "wellhub"; credited: boolean },
  ) {
    const [row] = await app.db
      .insert(schema.attendance)
      .values(
        tenantValues(CTX_TEMPLO, {
          memberId: userId,
          branchId: 1,
          sessionDate: localDate,
          source: opts.source,
        }),
      )
      .$returningId();
    if (opts.credited) {
      await app.db.insert(schema.auraTransactions).values(
        tenantValues(CTX_TEMPLO, {
          userId,
          sourceType: "attendance" as const,
          amount: AURA_AMOUNTS.attendance,
          referenceType: "attendance",
          referenceId: row.id,
          description: "Asistencia de prueba",
        }),
      );
    }
    return row.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    const [branch] = await app.db
      .select({ timezone: schema.branches.timezone })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, CTX_TEMPLO),
          eq(schema.branches.id, 1),
        ),
      );
    localDate = todayInTz(branch!.timezone);

    // Catálogo del plan a medida (tren_superior), igual que goal-plans.test.ts.
    const programRes = await app.inject({
      method: "POST",
      url: "/api/admin/programs",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "Tren Superior Program (aura rule)",
        description: null,
        durationWeeks: 4,
        sessionsPerWeekToAdvance: 3,
        goalPlanType: "tren_superior",
        auraWeeklyBonus: 8,
        auraCompletionBonus: 50,
        contentBlocks: [],
      },
    });
    expect(programRes.statusCode).toBe(201);
    const program = JSON.parse(programRes.body);

    const planRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "Plan Goal Plan Aura Rule",
        planTier: "other",
        bookingMode: "flexible",
        priceRegular: 20000,
        priceZero: 15000,
        durationDays: 30,
        planCategory: "online_goal",
        linkedProgramId: program.id,
      },
    });
    expect(planRes.statusCode).toBe(201);
    goalPlanId = JSON.parse(planRes.body).id;
  });

  afterAll(async () => {
    await app.db
      .delete(schema.sessions)
      .where(
        and(
          tenantWhere(schema.sessions, CTX_TEMPLO),
          inArray(schema.sessions.dayId, SEEDED),
        ),
      );
    await cleanupFixtureExercises(app);
    await app.close();
  });

  it("80 % del propuesto y todos los bloques: acredita AURA_AMOUNTS.training", async () => {
    const { proposedSec } = await seedSessionWithBlocks(
      app,
      DAY_OK,
      STANDARD_BLOCKS,
    );
    const { token, userId } = await newMember();

    const res = await completeApp(
      token,
      DAY_OK,
      startedAtForRatio(proposedSec, AURA_TIME_RATIO),
      rolesOf(STANDARD_BLOCKS),
    );

    expect(res.statusCode).toBe(200);
    const rows = await auraRows(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceType).toBe("training_completion");
    expect(rows[0].amount).toBe(AURA_AMOUNTS.training);
    await expectSavedAndStreak(userId, DAY_OK);
  });

  it("79 % del propuesto: sin AURA, pero la sesión se guarda y la racha avanza", async () => {
    const { proposedSec } = await seedSessionWithBlocks(
      app,
      DAY_79,
      STANDARD_BLOCKS,
    );
    const { token, userId } = await newMember();

    const res = await completeApp(
      token,
      DAY_79,
      startedAtBelowRatio(proposedSec, AURA_TIME_RATIO),
      rolesOf(STANDARD_BLOCKS),
    );

    expect(res.statusCode).toBe(200);
    expect(await auraRows(userId)).toHaveLength(0);
    await expectSavedAndStreak(userId, DAY_79);
  });

  it("falta un bloque requerido: sin AURA aunque el tiempo alcance, sesión guardada", async () => {
    const { proposedSec } = await seedSessionWithBlocks(
      app,
      DAY_FALTA,
      STANDARD_BLOCKS,
    );
    const { token, userId } = await newMember();

    const res = await completeApp(
      token,
      DAY_FALTA,
      startedAtForRatio(proposedSec, AURA_TIME_RATIO),
      ["INITIUM"],
    );

    expect(res.statusCode).toBe(200);
    expect(await auraRows(userId)).toHaveLength(0);
    await expectSavedAndStreak(userId, DAY_FALTA);
  });

  it("una asistencia que acreditó el mismo día local: la app no acredita (D-64)", async () => {
    const { proposedSec } = await seedSessionWithBlocks(
      app,
      DAY_ASISTIO,
      STANDARD_BLOCKS,
    );
    const { token, userId } = await newMember();
    await seedAttendance(userId, { source: "qr", credited: true });

    const res = await completeApp(
      token,
      DAY_ASISTIO,
      startedAtForRatio(proposedSec, AURA_TIME_RATIO),
      rolesOf(STANDARD_BLOCKS),
    );

    expect(res.statusCode).toBe(200);
    expect(await auraRows(userId)).toHaveLength(0);
    await expectSavedAndStreak(userId, DAY_ASISTIO);
  });

  it("una visita Wellhub el mismo día no acreditó: la app SÍ acredita (D-64 solo cuenta lo acreditado)", async () => {
    const { proposedSec } = await seedSessionWithBlocks(
      app,
      DAY_WELLHUB,
      STANDARD_BLOCKS,
    );
    const { token, userId } = await newMember();
    await seedAttendance(userId, { source: "wellhub", credited: false });

    const res = await completeApp(
      token,
      DAY_WELLHUB,
      startedAtForRatio(proposedSec, AURA_TIME_RATIO),
      rolesOf(STANDARD_BLOCKS),
    );

    expect(res.statusCode).toBe(200);
    const rows = await auraRows(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(AURA_AMOUNTS.training);
    await expectSavedAndStreak(userId, DAY_WELLHUB);
  });

  it("plan a medida y app el mismo día: paga una sola fuente, el total del día es 3", async () => {
    const planSession = await seedSessionWithBlocks(
      app,
      GP_COMBINADO,
      STANDARD_BLOCKS,
      { goalPlanType: "tren_superior" },
    );
    const appSession = await seedSessionWithBlocks(
      app,
      DAY_APP_Y_PLAN,
      STANDARD_BLOCKS,
    );
    const { token, userId } = await newMember(true);

    const planRes = await completeGoalPlan(
      token,
      GP_COMBINADO,
      startedAtForRatio(planSession.proposedSec, AURA_TIME_RATIO),
      rolesOf(STANDARD_BLOCKS),
    );
    expect(planRes.statusCode).toBe(200);
    const appRes = await completeApp(
      token,
      DAY_APP_Y_PLAN,
      startedAtForRatio(appSession.proposedSec, AURA_TIME_RATIO),
      rolesOf(STANDARD_BLOCKS),
    );
    expect(appRes.statusCode).toBe(200);

    const rows = await auraRows(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceType).toBe("goal_plan_completion");
    expect(rows.reduce((sum, r) => sum + r.amount, 0)).toBe(
      AURA_AMOUNTS.goalPlan,
    );
    // La sesión de la app se guarda igual.
    expect(await completedRows(userId, DAY_APP_Y_PLAN)).toHaveLength(1);
    expect(await currentStreak(userId)).toBeGreaterThanOrEqual(1);
  });

  it("día de combos con bloque ALT: los cuatro roles sin el ALT y 80 % del propuesto acreditan", async () => {
    const { proposedSec } = await seedSessionWithBlocks(
      app,
      DAY_COMBOS,
      COMBOS_BLOCKS,
      { sessionMode: "combos" },
    );
    const { token, userId } = await newMember();

    const res = await completeApp(
      token,
      DAY_COMBOS,
      startedAtForRatio(proposedSec, AURA_TIME_RATIO),
      ["INITIUM", "COMBOS_I", "COMBOS_II", "STRETCHING"],
    );

    expect(res.statusCode).toBe(200);
    const rows = await auraRows(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(AURA_AMOUNTS.training);
    await expectSavedAndStreak(userId, DAY_COMBOS);
  });

  it("inicio de hace 13 h: sin AURA (inicio no creíble), sesión guardada y racha al día", async () => {
    await seedSessionWithBlocks(app, DAY_13H, STANDARD_BLOCKS);
    const { token, userId } = await newMember();

    const res = await completeApp(
      token,
      DAY_13H,
      new Date(Date.now() - 13 * 3600 * 1000).toISOString(),
      rolesOf(STANDARD_BLOCKS),
    );

    expect(res.statusCode).toBe(200);
    expect(await auraRows(userId)).toHaveLength(0);
    await expectSavedAndStreak(userId, DAY_13H);
  });

  it("sesión con Deuteros: completada con DEUTEROS_1 y ATHLOS acredita si alcanza el 80 % de esos bloques", async () => {
    const { proposedSecFor } = await seedSessionWithBlocks(
      app,
      DAY_DEUTEROS,
      DEUTEROS_BLOCKS,
    );
    const { token, userId } = await newMember();
    const completed = ["INITIUM", "NUCLEUS", "DEUTEROS_1", "ATHLOS"];

    const res = await completeApp(
      token,
      DAY_DEUTEROS,
      startedAtForRatio(proposedSecFor(completed), AURA_TIME_RATIO),
      completed,
    );

    expect(res.statusCode).toBe(200);
    const rows = await auraRows(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(AURA_AMOUNTS.training);
    await expectSavedAndStreak(userId, DAY_DEUTEROS);
  });

  it("plan a medida con 80 % y todos los bloques: acredita AURA_AMOUNTS.goalPlan y guarda la duración", async () => {
    const { proposedSec } = await seedSessionWithBlocks(
      app,
      GP_PLAN_SOLO,
      STANDARD_BLOCKS,
      { goalPlanType: "tren_superior" },
    );
    const { token, userId } = await newMember(true);

    const res = await completeGoalPlan(
      token,
      GP_PLAN_SOLO,
      startedAtForRatio(proposedSec, AURA_TIME_RATIO),
      rolesOf(STANDARD_BLOCKS),
    );

    expect(res.statusCode).toBe(200);
    const rows = await auraRows(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceType).toBe("goal_plan_completion");
    expect(rows[0].amount).toBe(AURA_AMOUNTS.goalPlan);
    const completed = await completedRows(userId, GP_PLAN_SOLO);
    expect(completed).toHaveLength(1);
    expect(completed[0].duration).not.toBeNull();
    expect(completed[0].duration).toBeGreaterThanOrEqual(
      Math.ceil(proposedSec * AURA_TIME_RATIO),
    );
  });

  it("plan a medida con 79 %: sin AURA, sesión guardada y racha al día", async () => {
    const { proposedSec } = await seedSessionWithBlocks(
      app,
      GP_PLAN_79,
      STANDARD_BLOCKS,
      { goalPlanType: "tren_superior" },
    );
    const { token, userId } = await newMember(true);

    const res = await completeGoalPlan(
      token,
      GP_PLAN_79,
      startedAtBelowRatio(proposedSec, AURA_TIME_RATIO),
      rolesOf(STANDARD_BLOCKS),
    );

    expect(res.statusCode).toBe(200);
    expect(await auraRows(userId)).toHaveLength(0);
    await expectSavedAndStreak(userId, GP_PLAN_79);
  });
});
