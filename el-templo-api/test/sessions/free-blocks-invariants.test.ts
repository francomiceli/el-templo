/**
 * Fase 197 Plan 09 (D-13): invariante de aislamiento de contadores.
 *
 * Hacer bloques libres (con y sin AURA) NO puede tocar nada del entrenamiento
 * regular. riesgos.md §1 ("el bloque libre no debe contar como sesión") y D-13
 * lo prometen; este archivo lo prueba con un SNAPSHOT antes/después:
 *
 *   - filas de `completed_sessions` del socio,
 *   - racha (`member_profiles.current_streak` / `longest_streak`),
 *   - programa (`program_enrollments.sessions_completed_this_week` / `current_week`),
 *   - notificaciones post-sesión (`pending_notifications`, template
 *     `post_session_soreness`) y cualquier otra notificación encolada,
 *   - `/api/progression/stats`: `totalDaysTrained`, `currentStreak`,
 *     `todaySession`, `sessionsThisWeek` (y el resto de `stats`),
 *   - `completedDates` de `/api/sessions/weekly`,
 *   - `aura_transactions` agrupadas por `source_type`.
 *
 * Lo ÚNICO que puede cambiar: `aura_transactions.extra_block` (+1, con el
 * primer bloque de >= 10') y `extra_blocks_completed` (+1 por cierre). Nada de
 * `training_completion`, `streak_bonus` ni `program_*`.
 *
 * Reloj: "hoy" se fija (solo `Date`) en el último miércoles a las 15:00 UTC,
 * acotado a la semana 51 del plan, ANTES de loguear, y se restaura en
 * `afterEach`. `aura_config.extra_block` se re-siembra en cada `beforeEach`
 * (otros archivos la borran) y la sede 1 se fuerza a Buenos Aires.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { createTestApp, cleanAllTestData } from "../helpers";
import { todayInTz } from "../../src/modules/shared/date-utils";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { DAY_NAME_TO_NUMBER } from "../../src/modules/shared/training-constants";
import {
  dateToDayName,
  dateToWeekNumber,
  mondayOf,
  shiftDate,
  weekDayToDate,
} from "../../src/modules/shared/week-dates";
import {
  CTX_TEMPLO,
  createPresencialMember,
  dayIdFor,
  seedExercise,
  seedSession,
} from "./_free-blocks-fixtures";

const AR_TZ = "America/Argentina/Buenos_Aires";
const LEVEL = "sigma";
const MIN = 60_000;

interface StatsPayload {
  stats: {
    totalSessions: number;
    totalDaysTrained: number;
    sessionsThisWeek: number;
    currentStreak: number;
    longestStreak: number;
  };
  todaySession: unknown;
}

interface WeeklyPayload {
  completedDates: string[];
}

interface Snapshot {
  completedSessions: { id: number; date: string; dayId: string }[];
  streak: { current: number | null; longest: number | null };
  enrollment: { sessionsCompletedThisWeek: number; currentWeek: number };
  notifications: { id: number; templateKey: string | null }[];
  sorenessCount: number;
  stats: StatsPayload["stats"];
  todaySession: unknown;
  completedDates: string[];
  /** aura_transactions por source_type SIN la fuente extra_block. */
  auraSinExtraBlock: Record<string, number>;
  /** Las dos cosas que SÍ pueden moverse. */
  auraExtraBlock: number;
  extraBlocksCompleted: number;
}

/** Último miércoles (hoy si lo es), acotado a la semana 51 del plan. */
function targetWednesday(): string {
  const realToday = todayInTz(AR_TZ);
  const dow = new Date(`${realToday}T00:00:00`).getDay();
  const back = (dow + 7 - 3) % 7;
  const wed = shiftDate(realToday, -back);
  const cap = weekDayToDate(51, "miercoles");
  return cap !== null && wed > cap ? cap : wed;
}

describe("invariante de contadores: el bloque libre no toca el entrenamiento regular (197-09, D-13)", () => {
  let app: FastifyInstance;
  let token: string;
  let userId: number;
  let enrollmentId: number;
  let today: string;
  let wednesday: string;
  let exerciseSeq = 0;
  let blockA: string;
  let blockB: string;
  let idsA: number[];

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    vi.useRealTimers();
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);

    // Reloj fijo ANTES de loguear.
    wednesday = targetWednesday();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${wednesday}T15:00:00Z`));
    today = todayInTz(AR_TZ);

    // aura_config no se da por sembrada: la fuente extra_block se re-siembra.
    await app.db
      .insert(schema.auraConfig)
      .values(
        tenantValues(CTX_TEMPLO, {
          sourceType: "extra_block" as const,
          defaultAmount: 5,
          description: "Bloque libre del día",
          isActive: true,
        }),
      )
      .onDuplicateKeyUpdate({ set: { defaultAmount: 5, isActive: true } });

    // La zona de la sede 1 tiene que ser Buenos Aires.
    await app.db
      .update(schema.branches)
      .set({ timezone: AR_TZ })
      .where(
        and(
          tenantWhere(schema.branches, CTX_TEMPLO),
          eq(schema.branches.id, 1),
        ),
      );

    // day_modes no se limpia entre archivos: el miércoles tiene que ser regular.
    const dayNumber = DAY_NAME_TO_NUMBER[dateToDayName(today)];
    await app.db
      .delete(schema.dayModes)
      .where(
        and(
          tenantWhere(schema.dayModes, CTX_TEMPLO),
          eq(schema.dayModes.dayOfWeek, dayNumber),
        ),
      );
    await app.db
      .insert(schema.dayModes)
      .values(
        tenantValues(CTX_TEMPLO, {
          dayOfWeek: dayNumber,
          sessionMode: "regular",
        }),
      );

    // Template de la notificación post-sesión: sin él, un encolado indebido
    // se perdería en silencio y el invariante no vería nada.
    await app.db.insert(schema.notificationTemplates).values(
      tenantValues(CTX_TEMPLO, {
        templateKey: "post_session_soreness",
        category: "motivacion" as const,
        title: "Cómo te sentís",
        body: "Contanos cómo te sentís después de entrenar",
        isEnabled: true,
      }),
    );

    const member = await createPresencialMember(app, { level: LEVEL });
    token = member.token;
    userId = member.id;

    // Perfil con racha 3 / 5 (el servicio de racha solo actualiza perfiles existentes).
    await app.db.insert(schema.memberProfiles).values(
      tenantValues(CTX_TEMPLO, {
        userId,
        goalType: "fitness" as const,
        experienceLevel: "beginner" as const,
        trainingFocus: "full_body" as const,
        motivationStyle: "discipline" as const,
        onboardingCompletedAt: new Date(),
        currentStreak: 3,
        longestStreak: 5,
      }),
    );

    // Programa con una inscripción activa a mitad de camino. No se apunta
    // `users.current_program_enrollment_id`: el socio sigue en la vista Templo.
    const [program] = await app.db
      .insert(schema.programs)
      .values(
        tenantValues(CTX_TEMPLO, {
          name: `Programa invariantes 197-09 ${userId}`,
          goalPlanType: null,
          durationWeeks: 4,
          isActive: true,
        }),
      )
      .$returningId();
    const [enrollment] = await app.db
      .insert(schema.programEnrollments)
      .values(
        tenantValues(CTX_TEMPLO, {
          userId,
          programId: program.id,
          status: "active" as const,
          currentWeek: 2,
          sessionsCompletedThisWeek: 1,
          source: "plan_linked" as const,
        }),
      )
      .$returningId();
    enrollmentId = enrollment.id;

    // Una sesión regular completada ayer.
    const ayer = shiftDate(today, -1);
    await app.db.insert(schema.completedSessions).values(
      tenantValues(CTX_TEMPLO, {
        userId,
        dayId: dayIdFor(ayer, LEVEL),
        sessionLevel: LEVEL,
        date: ayer,
        branchId: 1,
        startedAt: new Date(Date.now() - 25 * 60 * MIN),
        completedAt: new Date(Date.now() - 24 * 60 * MIN),
        rpe: 6,
        blocksCompleted: ["NUCLEUS"],
      }),
    );

    idsA = [await ex("PECHO"), await ex("PECHO"), await ex("PECHO")];
    const idsB = [await ex("PECHO"), await ex("PECHO")];
    [blockA] = await seed(shiftDate(today, -1), [
      { role: "NUCLEUS", route: "OAP", exerciseIds: idsA },
    ]);
    [blockB] = await seed(shiftDate(today, -2), [
      { role: "DEUTEROS_1", route: "OAP", exerciseIds: idsB },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── helpers ───────────────────────────────────────────────────────────

  /** Ejercicio nuevo con nombre único. */
  async function ex(category?: string): Promise<number> {
    exerciseSeq += 1;
    return seedExercise(app, {
      name: `Ejercicio 197-09 ${exerciseSeq}`,
      category,
    });
  }

  /** Sesión aprobada de `date` para el nivel del socio. */
  async function seed(
    date: string,
    blocks: Parameters<typeof seedSession>[1]["blocks"],
  ): Promise<string[]> {
    const { blockIds } = await seedSession(app, {
      dayId: dayIdFor(date, LEVEL),
      week: dateToWeekNumber(date),
      day: dateToDayName(date),
      levelGroup: "sigma",
      blocks,
    });
    return blockIds;
  }

  /** ISO de "ahora − minutes" con el reloj congelado. */
  function minutesAgo(minutes: number): string {
    return new Date(Date.now() - minutes * MIN).toISOString();
  }

  async function postComplete(body: Record<string, unknown>) {
    const res = await app.inject({
      method: "POST",
      url: "/api/sessions/free-blocks/complete",
      headers: { authorization: `Bearer ${token}` },
      payload: body,
    });
    return { status: res.statusCode, body: JSON.parse(res.body) };
  }

  async function getJson<T>(url: string): Promise<T> {
    const res = await app.inject({
      method: "GET",
      url,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode, `${url}: ${res.body}`).toBe(200);
    return JSON.parse(res.body) as T;
  }

  /** Foto de todos los contadores que D-13 protege. */
  async function snapshot(): Promise<Snapshot> {
    const sessions = await app.db
      .select({
        id: schema.completedSessions.id,
        date: schema.completedSessions.date,
        dayId: schema.completedSessions.dayId,
      })
      .from(schema.completedSessions)
      .where(
        and(
          tenantWhere(schema.completedSessions, CTX_TEMPLO),
          eq(schema.completedSessions.userId, userId),
        ),
      )
      .orderBy(schema.completedSessions.id);

    const [profile] = await app.db
      .select({
        current: schema.memberProfiles.currentStreak,
        longest: schema.memberProfiles.longestStreak,
      })
      .from(schema.memberProfiles)
      .where(
        and(
          tenantWhere(schema.memberProfiles, CTX_TEMPLO),
          eq(schema.memberProfiles.userId, userId),
        ),
      );

    const [enrollment] = await app.db
      .select({
        sessionsCompletedThisWeek:
          schema.programEnrollments.sessionsCompletedThisWeek,
        currentWeek: schema.programEnrollments.currentWeek,
      })
      .from(schema.programEnrollments)
      .where(
        and(
          tenantWhere(schema.programEnrollments, CTX_TEMPLO),
          eq(schema.programEnrollments.id, enrollmentId),
        ),
      );

    const notifications = await app.db
      .select({
        id: schema.pendingNotifications.id,
        templateKey: schema.notificationTemplates.templateKey,
      })
      .from(schema.pendingNotifications)
      .leftJoin(
        schema.notificationTemplates,
        eq(
          schema.notificationTemplates.id,
          schema.pendingNotifications.templateId,
        ),
      )
      .where(
        and(
          tenantWhere(schema.pendingNotifications, CTX_TEMPLO),
          eq(schema.pendingNotifications.userId, userId),
        ),
      )
      .orderBy(schema.pendingNotifications.id);

    const stats = await getJson<StatsPayload>("/api/progression/stats");
    const weekly = await getJson<WeeklyPayload>(
      `/api/sessions/weekly?weekStart=${mondayOf(today)}`,
    );

    const auraRows = await app.db
      .select({
        sourceType: schema.auraTransactions.sourceType,
        total: sql<number>`COUNT(*)`,
      })
      .from(schema.auraTransactions)
      .where(
        and(
          tenantWhere(schema.auraTransactions, CTX_TEMPLO),
          eq(schema.auraTransactions.userId, userId),
        ),
      )
      .groupBy(schema.auraTransactions.sourceType);
    const auraSinExtraBlock: Record<string, number> = {};
    let auraExtraBlock = 0;
    for (const row of auraRows) {
      if (row.sourceType === "extra_block") {
        auraExtraBlock = Number(row.total);
      } else {
        auraSinExtraBlock[row.sourceType] = Number(row.total);
      }
    }

    const [extra] = await app.db
      .select({ total: sql<number>`COUNT(*)` })
      .from(schema.extraBlocksCompleted)
      .where(
        and(
          tenantWhere(schema.extraBlocksCompleted, CTX_TEMPLO),
          eq(schema.extraBlocksCompleted.userId, userId),
        ),
      );

    return {
      completedSessions: sessions,
      streak: { current: profile.current, longest: profile.longest },
      enrollment: {
        sessionsCompletedThisWeek: enrollment.sessionsCompletedThisWeek,
        currentWeek: enrollment.currentWeek,
      },
      notifications,
      sorenessCount: notifications.filter(
        (n) => n.templateKey === "post_session_soreness",
      ).length,
      stats: stats.stats,
      todaySession: stats.todaySession,
      completedDates: [...weekly.completedDates].sort(),
      auraSinExtraBlock,
      auraExtraBlock,
      extraBlocksCompleted: Number(extra?.total ?? 0),
    };
  }

  /** Todo el snapshot menos las dos cosas que SÍ pueden moverse. */
  function inmutable(s: Snapshot) {
    const { auraExtraBlock, extraBlocksCompleted, ...resto } = s;
    void auraExtraBlock;
    void extraBlocksCompleted;
    return resto;
  }

  // ─── casos ─────────────────────────────────────────────────────────────

  it("dos cierres (uno de >= 10' con AURA y uno de < 10') no mueven ningún contador regular", async () => {
    const antes = await snapshot();

    // La foto de partida es la esperada: sin ella el invariante sería vacío.
    expect(antes.completedSessions).toHaveLength(1);
    expect(antes.streak).toEqual({ current: 3, longest: 5 });
    expect(antes.enrollment).toEqual({
      sessionsCompletedThisWeek: 1,
      currentWeek: 2,
    });
    expect(antes.stats.totalDaysTrained).toBe(1);
    expect(antes.stats.currentStreak).toBe(3);
    expect(antes.todaySession).toBeNull();
    expect(antes.completedDates).toEqual([shiftDate(today, -1)]);
    expect(antes.auraExtraBlock).toBe(0);
    expect(antes.extraBlocksCompleted).toBe(0);

    const largo = await postComplete({
      blockId: blockA,
      startedAt: minutesAgo(12),
      exercisesCompleted: idsA,
    });
    expect(largo.status).toBe(200);
    expect(largo.body.auraAwarded).toBe(true);

    const corto = await postComplete({
      blockId: blockB,
      startedAt: minutesAgo(5),
      exercisesCompleted: [],
    });
    expect(corto.status).toBe(200);
    expect(corto.body.auraAwarded).toBe(false);

    const despues = await snapshot();

    // Igualdad estricta de todo lo regular.
    expect(inmutable(despues)).toEqual(inmutable(antes));
    expect(despues.sorenessCount).toBe(0);

    // Lo único que se movió.
    expect(despues.auraExtraBlock).toBe(antes.auraExtraBlock + 1);
    expect(despues.extraBlocksCompleted).toBe(antes.extraBlocksCompleted + 2);
  });

  it("un cierre sin AURA (< 10') no mueve nada salvo extra_blocks_completed", async () => {
    const antes = await snapshot();

    const corto = await postComplete({
      blockId: blockA,
      startedAt: minutesAgo(4),
      exercisesCompleted: [idsA[0]],
    });
    expect(corto.status).toBe(200);
    expect(corto.body.auraAwarded).toBe(false);

    const despues = await snapshot();

    expect(inmutable(despues)).toEqual(inmutable(antes));
    // Sin AURA: ni siquiera la fuente extra_block se mueve.
    expect(despues.auraExtraBlock).toBe(antes.auraExtraBlock);
    expect(despues.extraBlocksCompleted).toBe(antes.extraBlocksCompleted + 1);
  });

  it("Seguir entrenando (misma fila, cruza los 10') tampoco toca racha, programa ni sesiones", async () => {
    const antes = await snapshot();

    const inicial = await postComplete({
      blockId: blockA,
      startedAt: minutesAgo(6),
      exercisesCompleted: [idsA[0]],
    });
    expect(inicial.status).toBe(200);

    // Pasan 5 minutos más: 6' + 5' = 11'.
    vi.setSystemTime(new Date(Date.now() + 5 * MIN));
    const seguir = await postComplete({
      blockId: blockA,
      startedAt: minutesAgo(11),
      exercisesCompleted: [idsA[1]],
      completionId: inicial.body.completionId,
    });
    expect(seguir.status).toBe(200);
    expect(seguir.body.auraAwarded).toBe(true);

    const despues = await snapshot();

    expect(inmutable(despues)).toEqual(inmutable(antes));
    expect(despues.auraExtraBlock).toBe(antes.auraExtraBlock + 1);
    // Misma fila actualizada: un solo registro nuevo.
    expect(despues.extraBlocksCompleted).toBe(antes.extraBlocksCompleted + 1);
  });
});
