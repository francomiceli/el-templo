/**
 * "Planis" — vista previa de la plani para el staff (2026-09):
 *
 *   GET /api/admin/tv/preview/week?date=YYYY-MM-DD
 *   GET /api/admin/tv/preview/day?date=YYYY-MM-DD
 *
 * Reemplaza el PDF que un profe subia al Drive para que los demas revisaran
 * la semana siguiente ANTES de aprobarla. Por eso las dos rutas leen tambien
 * `pending_review` — y por eso este archivo congela, ademas, que el TV de la
 * sede (`/control/screen`) sigue SIN ver esas sesiones (D-09): la vista
 * previa amplia lo que ve el staff, no lo que ve la pared.
 *
 * Integracion contra MySQL real, con la semana 1 del ancla SPOM
 * (WEEK_ONE_MONDAY = 2026-02-23). El reloj se congela para el caso D-09 (el
 * poll real resuelve "hoy" por la TZ de la sede).
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
import { randomBytes } from "node:crypto";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  createTestMember,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";
import type { TvPreviewDay, TvPreviewWeek } from "../../src/modules/tv/types";

const WEEK_URL = "/api/admin/tv/preview/week";
const DAY_URL = "/api/admin/tv/preview/day";
const SCREEN_URL = "/api/admin/tv/control/screen";

const AR_TZ = "America/Argentina/Buenos_Aires";

// Semana 1 del ancla SPOM: lunes 2026-02-23 .. sabado 2026-02-28.
const MONDAY = "2026-02-23";
const TUESDAY = "2026-02-24";
const WEDNESDAY = "2026-02-25";
const THURSDAY = "2026-02-26";
const FRIDAY = "2026-02-27";
const SATURDAY = "2026-02-28";
const SUNDAY = "2026-03-01";
const TUESDAY_NOON_UTC = new Date("2026-02-24T15:00:00Z"); // 12:00 en AR

const REGULAR_ROLES = [
  "INITIUM",
  "NUCLEUS",
  "DEUTEROS_1",
  "DEUTEROS_2",
  "EPIKOS",
];
const ROM_ROLES = ["INITIUM", "ROM_LOWER", "ROM_CORE", "ROM_UPPER"];

let app: FastifyInstance;
let branchId: number;
let coachToken: string;
let memberToken: string;
let exerciseId: number;

function uniqueCode(prefix: string): string {
  return `${prefix}${randomBytes(3).toString("hex")}`;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

async function seedBranchAndExercise(): Promise<void> {
  const [branch] = await app.db
    .insert(schema.branches)
    .values({
      name: "Mogotes",
      code: uniqueCode("TVP"),
      country: "AR",
      timezone: AR_TZ,
    })
    .$returningId();
  branchId = branch.id;

  const [exercise] = await app.db
    .insert(schema.exercises)
    .values({
      pattern: "TRACCION",
      category: "pull",
      exercise: "Dominadas",
      effort: "high",
      route: "OAP",
      videoUrl: null,
    })
    .$returningId();
  exerciseId = exercise.id;
}

/** Una sesion de un nivel del dia, con 2 ejercicios "main" por bloque. */
async function seedSession(opts: {
  day: string;
  level: string;
  roles: string[];
  status: string;
  sessionMode?: string;
  /** Plan por objetivo (curado por socio): NUNCA es "la clase de la sede". */
  goalPlanType?: string;
}): Promise<void> {
  const prefix = opts.goalPlanType ? `GP-${opts.goalPlanType}-` : "";
  const [session] = await app.db
    .insert(schema.sessions)
    .values({
      dayId: `${prefix}W1-${opts.day}-${opts.level}`,
      week: 1,
      day: opts.day,
      levelGroup: opts.level === "sigma" ? "sigma" : "alfa_delta",
      blockCount: opts.roles.length,
      status: opts.status,
      sessionMode: opts.sessionMode ?? "regular",
      goalPlanType: opts.goalPlanType ?? null,
    })
    .$returningId();

  for (let i = 0; i < opts.roles.length; i++) {
    const role = opts.roles[i];
    const [block] = await app.db
      .insert(schema.sessionBlocks)
      .values({
        sessionId: session.id,
        blockId: `B-${session.id}-${i}`,
        role,
        route: "OAP",
        pattern: "TRACCION",
        intensity: 70,
        repsBudget: 40,
        formatId: 1,
        formatName: "AMRAP",
        formatParams: { type: "amrap", minutes: 10 },
        exerciseCount: 2,
        sortOrder: i,
      })
      .$returningId();

    for (let e = 0; e < 2; e++) {
      await app.db.insert(schema.sessionPrescriptions).values({
        blockId: block.id,
        exerciseId,
        exerciseName: `${role}-${opts.level}-${e}`,
        contraction: "CON",
        reps: 8,
        repsMax: 10,
        seconds: 0,
        rest: 60,
        sortOrder: e,
        exerciseType: "main",
      });
    }
  }
}

/**
 * La semana tipo del caso de uso: el generador ya corrio y el coach exclusivo
 * aprobo solo algunos dias.
 *
 *   lunes      sin sesiones
 *   martes     alfa + sigma, las dos PENDIENTES  (lo que el profe quiere ver)
 *   miercoles  alfa aprobada
 *   jueves     alfa aprobada + delta pendiente   (a medio aprobar)
 *   viernes    sin sesiones
 *   sabado     ROM alfa pendiente
 */
async function seedWeek(): Promise<void> {
  await seedSession({
    day: "martes",
    level: "alfa",
    roles: REGULAR_ROLES,
    status: "pending_review",
  });
  await seedSession({
    day: "martes",
    level: "sigma",
    roles: REGULAR_ROLES,
    status: "pending_review",
  });
  await seedSession({
    day: "miercoles",
    level: "alfa",
    roles: REGULAR_ROLES,
    status: "approved",
  });
  await seedSession({
    day: "jueves",
    level: "alfa",
    roles: REGULAR_ROLES,
    status: "approved",
  });
  await seedSession({
    day: "jueves",
    level: "delta",
    roles: REGULAR_ROLES,
    status: "pending_review",
  });
  await seedSession({
    day: "sabado",
    level: "alfa",
    roles: ROM_ROLES,
    status: "pending_review",
    sessionMode: "rom",
  });
}

// ---------------------------------------------------------------------------
// Llamadas
// ---------------------------------------------------------------------------

function getWeek(token: string | null, date: string) {
  return app.inject({
    method: "GET",
    url: `${WEEK_URL}?date=${date}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function getDay(token: string | null, date: string) {
  return app.inject({
    method: "GET",
    url: `${DAY_URL}?date=${date}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function week(date: string): Promise<TvPreviewWeek> {
  const res = await getWeek(coachToken, date);
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body) as TvPreviewWeek;
}

async function day(date: string): Promise<TvPreviewDay> {
  const res = await getDay(coachToken, date);
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body) as TvPreviewDay;
}

// ---------------------------------------------------------------------------

beforeAll(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(TUESDAY_NOON_UTC);
  app = await createTestApp();
});

afterAll(async () => {
  vi.useRealTimers();
  await app.close();
});

beforeEach(async () => {
  vi.setSystemTime(TUESDAY_NOON_UTC);
  await cleanAllTestData(app);
  await seedBranchAndExercise();

  // Un coach COMUN (no el exclusivo de Entrenamiento): hoy no tiene ningun
  // acceso a contenido sin aprobar — la vista previa existe para el.
  await createStaffUser(app, {
    email: "tv-preview-coach@test.com",
    password: "coach-pass-123",
    firstName: "Coach",
    lastName: "Preview",
    role: "coach",
    branchId,
  });
  coachToken = await getAuthToken(
    app,
    "tv-preview-coach@test.com",
    "coach-pass-123",
  );
  const member = await createTestMember(app, { branchId });
  memberToken = member.token;
});

describe("GET /preview/week — la grilla semanal del profe", () => {
  it("lista lunes a sabado con el estado de aprobacion de cada dia", async () => {
    await seedWeek();

    const body = await week(THURSDAY);
    expect(body.week).toBe(1);
    expect(body.weekStart).toBe(MONDAY);
    expect(body.weekEnd).toBe(SATURDAY);
    expect(body.days.map((d) => d.date)).toEqual([
      MONDAY,
      TUESDAY,
      WEDNESDAY,
      THURSDAY,
      FRIDAY,
      SATURDAY,
    ]);
    expect(body.days.map((d) => d.dayName)).toEqual([
      "lunes",
      "martes",
      "miercoles",
      "jueves",
      "viernes",
      "sabado",
    ]);
    // Un dia a medio aprobar (jueves) es "pending": mientras falte una sesion
    // el TV no lo va a mostrar completo, y el profe tiene que saberlo.
    expect(body.days.map((d) => d.status)).toEqual([
      "none",
      "pending",
      "approved",
      "pending",
      "none",
      "pending",
    ]);
  });

  it("trae niveles y modo por dia (ROM el sabado), en orden canonico", async () => {
    await seedWeek();

    const body = await week(TUESDAY);
    const byName = Object.fromEntries(body.days.map((d) => [d.dayName, d]));
    expect(byName.martes.levels).toEqual(["alfa", "sigma"]);
    expect(byName.martes.mode).toBe("regular");
    expect(byName.jueves.levels).toEqual(["alfa", "delta"]);
    expect(byName.sabado.mode).toBe("rom");
    expect(byName.sabado.levels).toEqual(["alfa"]);
    expect(byName.lunes.levels).toEqual([]);
    expect(byName.lunes.mode).toBe("regular");
  });

  it("cualquier dia de la semana (incluido el domingo que la cierra) resuelve la misma semana", async () => {
    await seedWeek();

    for (const date of [MONDAY, SATURDAY, SUNDAY]) {
      const body = await week(date);
      expect(body.week).toBe(1);
      expect(body.weekStart).toBe(MONDAY);
    }
    // La semana siguiente, sin sesiones: seis dias "none", no un error.
    const next = await week("2026-03-04");
    expect(next.week).toBe(2);
    expect(next.weekStart).toBe("2026-03-02");
    expect(next.days.every((d) => d.status === "none")).toBe(true);
  });

  it("ignora los planes por objetivo (goal plans): no son la clase de la sede", async () => {
    await seedSession({
      day: "lunes",
      level: "alfa",
      roles: REGULAR_ROLES,
      status: "pending_review",
      goalPlanType: "fuerza",
    });

    const body = await week(MONDAY);
    expect(body.days[0].status).toBe("none");
    expect(body.days[0].levels).toEqual([]);
  });
});

describe("GET /preview/day — el payload del kiosco, congelado", () => {
  it("un dia PENDIENTE trae el roster completo y una pantalla por (bloque, nivel)", async () => {
    await seedWeek();

    const body = await day(TUESDAY);
    expect(body.date).toBe(TUESDAY);
    expect(body.week).toBe(1);
    expect(body.dayName).toBe("martes");
    expect(body.dateLabel).toBe("MARTES · SEMANA 1");
    expect(body.status).toBe("pending");
    expect(body.mode).toBe("regular");
    expect(body.levels).toEqual(["alfa", "sigma"]);
    expect(body.blocks.map((b) => b.role)).toEqual(REGULAR_ROLES);
    expect(body.blocks.find((b) => b.role === "INITIUM")?.shared).toBe(true);

    // 5 bloques × 2 niveles, sin huecos ni duplicados.
    expect(body.screens).toHaveLength(REGULAR_ROLES.length * 2);
    const keys = new Set(body.screens.map((s) => `${s.blockRole}/${s.level}`));
    expect(keys.size).toBe(body.screens.length);
    for (const role of REGULAR_ROLES) {
      for (const level of ["alfa", "sigma"]) {
        expect(keys.has(`${role}/${level}`)).toBe(true);
      }
    }
  });

  it("cada pantalla es el MISMO contrato del poll real, con el timer en cero", async () => {
    await seedWeek();

    const body = await day(TUESDAY);
    const screen = body.screens.find(
      (s) => s.blockRole === "NUCLEUS" && s.level === "sigma",
    )!;
    const c = screen.class;
    expect(c.blockRole).toBe("NUCLEUS");
    expect(c.level).toBe("sigma");
    expect(c.levels).toEqual(["alfa", "sigma"]);
    expect(c.blocks.map((b) => b.role)).toEqual(REGULAR_ROLES);
    expect(c.blockIndex).toBe(1);
    expect(c.exerciseIndex).toBe(0);
    // Congelado: nadie inicio nada, y el sonido arranca apagado (D-19).
    expect(c.timer.status).toBe("idle");
    expect(c.timer.startedAt).toBeNull();
    expect(c.timer.pausedAt).toBeNull();
    expect(c.timer.pausedAccumMs).toBe(0);
    expect(c.timer.soundEnabled).toBe(false);
    expect(c.timer.spec).toEqual({ kind: "countdown", totalMs: 600000 });
    // La lista es la del nivel pedido: sigma no tiene par presente (kairos
    // no esta), asi que sale UNA columna con sus 2 ejercicios.
    expect(c.columns).toHaveLength(1);
    expect(c.columns[0].exercises.map((e) => e.name)).toEqual([
      "NUCLEUS-sigma-0",
      "NUCLEUS-sigma-1",
    ]);
  });

  it("un dia sin sesiones es 'none' con roster vacio, nunca un error", async () => {
    await seedWeek();

    const monday = await day(MONDAY);
    expect(monday.status).toBe("none");
    expect(monday.levels).toEqual([]);
    expect(monday.blocks).toEqual([]);
    expect(monday.screens).toEqual([]);

    const sunday = await day(SUNDAY);
    expect(sunday.status).toBe("none");
    expect(sunday.dayName).toBe("domingo");
    expect(sunday.screens).toEqual([]);
  });

  it("un dia aprobado y uno a medio aprobar se distinguen por `status`", async () => {
    await seedWeek();

    expect((await day(WEDNESDAY)).status).toBe("approved");
    const thursday = await day(THURSDAY);
    expect(thursday.status).toBe("pending");
    // A medio aprobar se ve COMPLETO (alfa aprobada + delta pendiente): la
    // vista previa es para revisar, no para esconder lo que falta.
    expect(thursday.levels).toEqual(["alfa", "delta"]);
  });

  it("el sabado ROM trae su roster de dos tiers", async () => {
    await seedWeek();

    const saturday = await day(SATURDAY);
    expect(saturday.mode).toBe("rom");
    expect(saturday.blocks.map((b) => b.role)).toEqual(ROM_ROLES);
    expect(saturday.screens).toHaveLength(ROM_ROLES.length);
    expect(saturday.screens[1].class.levelLabel).toBe("BÁSICO");
  });
});

describe("la vista previa NO afecta lo que ve la pared (D-09)", () => {
  it("el poll real del TV sigue en reposo con la sesion de hoy pendiente", async () => {
    await seedWeek(); // hoy = martes W1, pendiente

    const preview = await day(TUESDAY);
    expect(preview.status).toBe("pending");
    expect(preview.screens.length).toBeGreaterThan(0);

    const res = await app.inject({
      method: "GET",
      url: `${SCREEN_URL}?branchId=${branchId}`,
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(res.statusCode).toBe(200);
    const poll = JSON.parse(res.body) as { screen: string; class: unknown };
    expect(poll.screen).toBe("idle");
    expect(poll.class).toBeNull();
  });
});

describe("autorizacion y validacion", () => {
  it("un socio no entra (403) y sin token es 401", async () => {
    expect((await getWeek(memberToken, TUESDAY)).statusCode).toBe(403);
    expect((await getDay(memberToken, TUESDAY)).statusCode).toBe(403);
    expect((await getWeek(null, TUESDAY)).statusCode).toBe(401);
    expect((await getDay(null, TUESDAY)).statusCode).toBe(401);
  });

  it("rechaza fechas con forma invalida o inexistentes (400)", async () => {
    // Forma: la atrapa el JSON schema.
    expect((await getWeek(coachToken, "2026-2-4")).statusCode).toBe(400);
    expect((await getDay(coachToken, "24/02/2026")).statusCode).toBe(400);
    expect((await getDay(coachToken, "")).statusCode).toBe(400);
    // Pasa el pattern pero no existe: la atrapa el servicio (isValidIsoDate).
    expect((await getWeek(coachToken, "2026-02-30")).statusCode).toBe(400);
    expect((await getDay(coachToken, "2026-13-01")).statusCode).toBe(400);
  });

  it("sin `date` es 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: DAY_URL,
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(res.statusCode).toBe(400);
  });
});
