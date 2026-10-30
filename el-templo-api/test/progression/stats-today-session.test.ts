/**
 * `GET /api/progression/stats` → `todaySession` y `todayPresencial`.
 *
 * Bug 2026-10-30: el socio que fue a la clase presencial veía "Ver resumen" en
 * Semana (el check-in espeja la clase como fila `goal_plan_type='presencial'`
 * y `/sessions/weekly` la cuenta), pero el resumen decía "No hay sesión
 * completada hoy": `todaySession` solo acepta `goal_plan_type IS NULL` y además
 * calculaba "hoy" en UTC (de noche en Argentina UTC ya es mañana).
 *
 * `todaySession` sigue siendo solo la sesión de la app (la 1.9.2 de las tiendas
 * la usa para la card "completada" de Mi Templo); la clase presencial viaja
 * aparte en `todayPresencial`.
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
import { eq } from "drizzle-orm";
import { createTestApp, registerUser, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { todayInTz } from "../../src/modules/shared/date-utils";

interface TodaySessionPayload {
  completed: boolean;
  rpe: number | null;
  notes: string | null;
  durationMinutes: number | null;
  blocksCompleted: string[];
}

interface TodayPresencialPayload {
  branchName: string | null;
  blocksCompleted: string[];
}

interface TodayPayload {
  todaySession: TodaySessionPayload | null;
  todayPresencial: TodayPresencialPayload | null;
}

const PRESENCIAL_BLOCKS = ["INITIUM", "NUCLEUS", "DEUTEROS_1", "ATHLOS"];

describe("GET /api/progression/stats — todaySession / todayPresencial", () => {
  let app: FastifyInstance;
  let memberToken: string;
  let memberId: number;
  let branchId: number;
  let branchName: string;
  let branchTz: string;

  async function login(): Promise<void> {
    const result = await registerUser(app, {
      email: `stats-today-${Date.now()}@test.com`,
      password: "password123",
      branchId,
    });
    memberToken = result.token;
    memberId = (result.user as { id: number }).id;
  }

  async function getToday(): Promise<TodayPayload> {
    const res = await app.inject({
      method: "GET",
      url: "/api/progression/stats",
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as TodayPayload;
    return {
      todaySession: body.todaySession,
      todayPresencial: body.todayPresencial,
    };
  }

  /** Igual que `recordPresencialSession` del check-in QR. */
  async function insertPresencial(date: string, at: Date): Promise<void> {
    await app.db.insert(schema.completedSessions).values({
      userId: memberId,
      branchId,
      dayId: `presencial-${date}`,
      sessionLevel: "sigma",
      date,
      startedAt: at,
      completedAt: at,
      blocksCompleted: PRESENCIAL_BLOCKS,
      goalPlanType: "presencial",
    });
  }

  async function insertAppSession(
    date: string,
    opts: { goalPlanType?: string; rpe?: number } = {},
  ): Promise<void> {
    const startedAt = new Date(Date.now() - 45 * 60000);
    await app.db.insert(schema.completedSessions).values({
      userId: memberId,
      branchId,
      dayId: `W1-test-${Date.now()}-${Math.random()}`,
      sessionLevel: "sigma",
      date,
      startedAt,
      completedAt: new Date(startedAt.getTime() + 45 * 60000),
      rpe: opts.rpe ?? null,
      blocksCompleted: ["NUCLEUS"],
      goalPlanType: opts.goalPlanType ?? null,
    });
  }

  beforeAll(async () => {
    app = await createTestApp();
    const [branch] = await app.db
      .select({
        id: schema.branches.id,
        name: schema.branches.name,
        timezone: schema.branches.timezone,
      })
      .from(schema.branches)
      .where(eq(schema.branches.id, 1));
    branchId = branch.id;
    branchName = branch.name;
    branchTz = branch.timezone;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ambos son null si hoy no hay ninguna sesión", async () => {
    await login();
    expect(await getToday()).toEqual({
      todaySession: null,
      todayPresencial: null,
    });
  });

  it("la clase presencial va en todayPresencial con la sede, no en todaySession", async () => {
    await login();
    await insertPresencial(todayInTz(branchTz), new Date());

    expect(await getToday()).toEqual({
      todaySession: null,
      todayPresencial: { branchName, blocksCompleted: PRESENCIAL_BLOCKS },
    });
  });

  it("presencial y app el mismo día: cada una en su campo", async () => {
    await login();
    const date = todayInTz(branchTz);
    await insertPresencial(date, new Date());
    await insertAppSession(date, { rpe: 7 });

    const { todaySession, todayPresencial } = await getToday();

    expect(todaySession).toEqual({
      completed: true,
      rpe: 7,
      notes: null,
      durationMinutes: 45,
      blocksCompleted: ["NUCLEUS"],
    });
    expect(todayPresencial).toEqual({
      branchName,
      blocksCompleted: PRESENCIAL_BLOCKS,
    });
  });

  it("ignora las sesiones de planes de objetivo", async () => {
    await login();
    await insertAppSession(todayInTz(branchTz), { goalPlanType: "fuerza" });

    expect(await getToday()).toEqual({
      todaySession: null,
      todayPresencial: null,
    });
  });

  it("no toma la presencial de ayer", async () => {
    await login();
    const yesterday = new Date(Date.now() - 24 * 60 * 60000);
    await insertPresencial(todayInTz(branchTz, yesterday), yesterday);

    expect((await getToday()).todayPresencial).toBeNull();
  });

  it("usa el 'hoy' de la sede, no el de UTC (de noche UTC ya es mañana)", async () => {
    // Antes de loguear: el token se firma con el reloj falso. Ayer a las 02:30
    // UTC (relativo a hoy, sin fecha fija) = 23:30 del día anterior en AR.
    const night = new Date(Date.now() - 24 * 60 * 60000);
    night.setUTCHours(2, 30, 0, 0);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(night);

    const localDate = todayInTz(branchTz, night);
    const utcDate = night.toISOString().split("T")[0];
    // Precondición: la sede de prueba está al oeste de UTC (Argentina).
    expect(localDate).not.toBe(utcDate);

    await login();
    await insertPresencial(localDate, night);
    await insertAppSession(localDate, { rpe: 6 });

    const { todaySession, todayPresencial } = await getToday();
    expect(todaySession).toMatchObject({ completed: true, rpe: 6 });
    expect(todayPresencial).toEqual({
      branchName,
      blocksCompleted: PRESENCIAL_BLOCKS,
    });
  });
});
