/**
 * Intro "el recorrido de hoy" — el estado `screen: 'recorrido'` de
 * `tv_class_state`, contra MySQL real y las rutas de control existentes
 * (`tv/control-routes.ts`, sin rutas nuevas):
 *
 *   POST /api/admin/tv/control/state       — escritura absoluta
 *   GET  /api/admin/tv/control/screen      — poll TV-facing
 *   POST /api/admin/tv/control/end-class   — reposo, idempotente (D-07)
 *
 * Casos:
 *   (1) escribir `{screen:'recorrido'}` -> el poll devuelve `screen:'recorrido'`,
 *       `class:null`, `aviso:null` y `recorrido.bloques` SIN INITIUM, con
 *       DEUTEROS_1+2 agrupados y las zonas esperadas (solo prescripciones `main`,
 *       union de niveles, tolera prescripciones sin fila en `exercises`).
 *   (2) el poll normal (`class`) trae `recorrido:null`; idle tambien.
 *   (3) salida: cambiar `blockRole` (sin `screen`) vuelve a 'class'; escribir
 *       `screen:'class'` tambien; `closing` tambien; `end-class` borra la fila.
 *   (4) el timer NO se toca al entrar ni al salir con `screen:'class'`.
 *   (5) el enum rechaza un valor invalido (400).
 *   (6) sabado ROM: fallback por rol y subtitulo null.
 *   (7) aislamiento de tenant: el recorrido de la sede de un gimnasio nunca
 *       trae datos del otro.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism --hookTimeout=300000 test/tv/tv-recorrido-screen.test.ts
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
import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
} from "../fixtures/second-tenant";

const STATE_URL = "/api/admin/tv/control/state";
const SCREEN_URL = "/api/admin/tv/control/screen";
const END_CLASS_URL = "/api/admin/tv/control/end-class";

const AR_TZ = "America/Argentina/Buenos_Aires";
// Ancla SPOM: WEEK_ONE_MONDAY = 2026-02-23 (lunes). Martes W1, 12:00 en AR.
const TUESDAY = new Date("2026-02-24T15:00:00Z");
const SATURDAY = new Date("2026-02-28T15:00:00Z"); // sabado W1 (ROM)

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

/** Ejercicios del catalogo de prueba, por clave. */
const ex: Record<string, number> = {};

function uniqueCode(prefix: string): string {
  return `${prefix}${randomBytes(3).toString("hex")}`;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

async function insertExercise(
  key: string,
  values: {
    category: string;
    categorySecondary?: string | null;
    route: string;
  },
): Promise<void> {
  const [row] = await app.db
    .insert(schema.exercises)
    .values({
      pattern: "TRACCION",
      category: values.category,
      categorySecondary: values.categorySecondary ?? null,
      exercise: `Ejercicio ${key}`,
      effort: "high",
      route: values.route,
      videoUrl: null,
    })
    .$returningId();
  ex[key] = row.id;
}

async function seedBranchAndExercises(): Promise<void> {
  const [b] = await app.db
    .insert(schema.branches)
    .values({
      name: "Mogotes",
      code: uniqueCode("REC"),
      country: "AR",
      timezone: AR_TZ,
    })
    .$returningId();
  branchId = b.id;

  // Categoria con espacio final a proposito: el CSV real los trae.
  await insertExercise("pushH", {
    category: "PUSH HORIZONTAL ",
    route: "HSPU",
  });
  await insertExercise("pullV", { category: "PULL VERTICAL", route: "OAP" });
  await insertExercise("kneeD", {
    category: "KNEE DOMINANT",
    categorySecondary: "ISQUIOS",
    route: "SS",
  });
  await insertExercise("core", { category: "CORE ANTERIOR", route: "TTB" });
  // Solo de INITIUM y de movilidad: NO deben aparecer en ningun grupo.
  await insertExercise("hip", { category: "HIP DOMINANT", route: "HT" });
  await insertExercise("mob", { category: "CORE POSTERIOR", route: "AF" });
}

interface PrescriptionSpec {
  /** Clave de `ex`, o un id inexistente (prescripcion sin fila en `exercises`). */
  exerciseId: number;
  type?: "main" | "mobility";
}

interface BlockSpec {
  role: string;
  route: string;
  prescriptions: PrescriptionSpec[];
}

async function seedSession(opts: {
  day: string;
  level: string;
  mode?: string;
  blocks: BlockSpec[];
}): Promise<void> {
  const [session] = await app.db
    .insert(schema.sessions)
    .values({
      dayId: `W1-${opts.day}-${opts.level}`,
      week: 1,
      day: opts.day,
      levelGroup: opts.level === "sigma" ? "sigma" : "alfa_delta",
      blockCount: opts.blocks.length,
      status: "approved",
      sessionMode: opts.mode ?? "regular",
    })
    .$returningId();

  for (let i = 0; i < opts.blocks.length; i++) {
    const spec = opts.blocks[i];
    const [block] = await app.db
      .insert(schema.sessionBlocks)
      .values({
        sessionId: session.id,
        blockId: `B-${session.id}-${i}`,
        role: spec.role,
        route: spec.route,
        pattern: "TRACCION",
        intensity: 70,
        repsBudget: 40,
        formatId: 1,
        formatName: "AMRAP",
        formatParams: { type: "amrap", minutes: 10 },
        exerciseCount: spec.prescriptions.length,
        sortOrder: i,
      })
      .$returningId();

    for (let e = 0; e < spec.prescriptions.length; e++) {
      await app.db.insert(schema.sessionPrescriptions).values({
        blockId: block.id,
        exerciseId: spec.prescriptions[e].exerciseId,
        exerciseName: `${spec.role}-${opts.level}-${e}`,
        contraction: "CON",
        reps: 8,
        repsMax: 10,
        seconds: 0,
        rest: 60,
        sortOrder: e,
        exerciseType: spec.prescriptions[e].type ?? "main",
      });
    }
  }
}

/** Martes: alfa y sigma. NUCLEUS cambia de ejercicio/ruta por nivel. */
async function seedTuesday(): Promise<void> {
  await seedSession({
    day: "martes",
    level: "alfa",
    blocks: [
      {
        role: "INITIUM",
        route: "OAP",
        prescriptions: [{ exerciseId: ex.hip }],
      },
      {
        role: "NUCLEUS",
        route: "HSPU",
        prescriptions: [
          { exerciseId: ex.pushH },
          // La movilidad NO cuenta para las zonas del bloque.
          { exerciseId: ex.mob, type: "mobility" },
        ],
      },
      {
        role: "DEUTEROS_1",
        route: "OAP",
        prescriptions: [{ exerciseId: ex.pullV }],
      },
      {
        role: "DEUTEROS_2",
        route: "SS",
        prescriptions: [{ exerciseId: ex.kneeD }],
      },
      {
        role: "EPIKOS",
        route: "TTB",
        // Una prescripcion sin fila en `exercises` (id huerfano): se tolera.
        prescriptions: [{ exerciseId: ex.core }, { exerciseId: 999999999 }],
      },
    ],
  });
  await seedSession({
    day: "martes",
    level: "sigma",
    blocks: [
      {
        role: "INITIUM",
        route: "OAP",
        prescriptions: [{ exerciseId: ex.hip }],
      },
      {
        role: "NUCLEUS",
        route: "OAR",
        prescriptions: [{ exerciseId: ex.pullV }],
      },
      {
        role: "DEUTEROS_1",
        route: "OAP",
        prescriptions: [{ exerciseId: ex.pullV }],
      },
      {
        role: "DEUTEROS_2",
        route: "SS",
        prescriptions: [{ exerciseId: ex.kneeD }],
      },
      {
        role: "EPIKOS",
        route: "TTB",
        prescriptions: [{ exerciseId: ex.core }],
      },
    ],
  });
}

async function setDayMode(dayOfWeek: number, mode: string): Promise<void> {
  await app.db
    .delete(schema.dayModes)
    .where(eq(schema.dayModes.dayOfWeek, dayOfWeek));
  await app.db.insert(schema.dayModes).values({ dayOfWeek, sessionMode: mode });
}

// ---------------------------------------------------------------------------
// Llamadas
// ---------------------------------------------------------------------------

function postState(token: string, payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: STATE_URL,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}

function getScreen(token: string, bId: number) {
  return app.inject({
    method: "GET",
    url: `${SCREEN_URL}?branchId=${bId}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

function postEndClass(token: string, bId: number) {
  return app.inject({
    method: "POST",
    url: END_CLASS_URL,
    headers: { authorization: `Bearer ${token}` },
    payload: { branchId: bId },
  });
}

async function readRow(bId: number) {
  const [row] = await app.db
    .select()
    .from(schema.tvClassState)
    .where(eq(schema.tvClassState.branchId, bId));
  return row;
}

interface ControlStateBody {
  screen: string;
  blockRole: string;
  timerStatus: string;
  timerStartedAt: number | null;
}

interface PollBody {
  screen: string;
  class: { timer: { status: string; startedAt: number | null } } | null;
  aviso: unknown;
  recorrido: {
    bloques: {
      role: string;
      title: string;
      subtitle: string | null;
      zonas: string[];
    }[];
  } | null;
}

async function poll(): Promise<PollBody> {
  const res = await getScreen(coachToken, branchId);
  expect(res.statusCode, res.body).toBe(200);
  return JSON.parse(res.body) as PollBody;
}

// ---------------------------------------------------------------------------

beforeAll(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(TUESDAY);
  app = await createTestApp();
});

afterAll(async () => {
  vi.useRealTimers();
  await app.close();
});

beforeEach(async () => {
  vi.setSystemTime(TUESDAY);
  await cleanAllTestData(app);
  await setDayMode(2, "regular");
  await setDayMode(6, "rom");
  await seedBranchAndExercises();
  await seedTuesday();

  await createStaffUser(app, {
    email: "tv-recorrido-coach@test.com",
    password: "coach-pass-123",
    firstName: "Coach",
    lastName: "Recorrido",
    role: "coach",
    branchId,
  });
  coachToken = await getAuthToken(
    app,
    "tv-recorrido-coach@test.com",
    "coach-pass-123",
  );
});

describe("screen 'recorrido' — escritura y poll", () => {
  it("(1) escribir screen:'recorrido' deja la fila lista y el poll trae los bloques sin INITIUM, con DEUTEROS agrupado", async () => {
    await postState(coachToken, { branchId, blockRole: "INITIUM" });

    const writeRes = await postState(coachToken, {
      branchId,
      screen: "recorrido",
    });
    expect(writeRes.statusCode, writeRes.body).toBe(200);
    const context = JSON.parse(writeRes.body) as { state: ControlStateBody };
    expect(context.state.screen).toBe("recorrido");
    expect(context.state.blockRole).toBe("INITIUM");

    const row = await readRow(branchId);
    expect(row.screen).toBe("recorrido");
    expect(row.tvAvisoId).toBeNull();

    const body = await poll();
    expect(body.screen).toBe("recorrido");
    expect(body.class).toBeNull();
    expect(body.aviso).toBeNull();
    expect(body.recorrido).not.toBeNull();

    const bloques = body.recorrido!.bloques;
    // INITIUM fuera; DEUTEROS_1+DEUTEROS_2 = UN item.
    expect(bloques.map((b) => b.role)).toEqual([
      "NUCLEUS",
      "DEUTEROS_1",
      "EPIKOS",
    ]);
    expect(bloques.map((b) => b.title)).toEqual([
      "NUCLEUS",
      "DEUTEROS",
      "EPIKOS",
    ]);

    // Solo el par de niveles que muestra la TV (alfa/delta; delta no tiene
    // sesion): NUCLEUS = alfa pushH (chest, deltoids, triceps). El pullV de
    // sigma NO entra, y la movilidad (CORE POSTERIOR) tampoco suma.
    expect(bloques[0].zonas).toEqual(["chest", "deltoids", "triceps"]);
    expect(bloques[0].subtitle).toBe("Handstand Push Up");

    // DEUTEROS: pullV + kneeD (+ ISQUIOS secundaria -> hamstring).
    expect(bloques[1].zonas).toEqual([
      "biceps",
      "forearm",
      "upper-back",
      "gluteal",
      "quadriceps",
      "hamstring",
      "adductors",
    ]);
    expect(bloques[1].subtitle).toBe("Dominadas · Sissy Squat");

    // EPIKOS: core + ruta TTB; la prescripcion huerfana no rompe nada.
    expect(bloques[2].zonas).toEqual(["abs", "obliques"]);
    expect(bloques[2].subtitle).toBe("Toe to Bar");
  });

  it("(1c) el recorrido sigue al par de niveles en pantalla (sigma/kairos)", async () => {
    await postState(coachToken, { branchId, blockRole: "INITIUM" });
    await postState(coachToken, { branchId, level: "sigma" });
    await postState(coachToken, { branchId, screen: "recorrido" });

    const bloques = (await poll()).recorrido!.bloques;
    // NUCLEUS de sigma = pullV: la traccion, sin el empuje de alfa.
    expect(bloques[0].zonas).toEqual(["biceps", "forearm", "upper-back"]);
    expect(bloques[0].subtitle).toBe("Remos");
  });

  it("(1b) un grupo sin zonas igual viaja (el front no lo pinta)", async () => {
    // Todo el EPIKOS pasa a ejercicios huerfanos: sin zonas, pero el item existe.
    await app.db
      .update(schema.sessionPrescriptions)
      .set({ exerciseId: 999999999 });
    await postState(coachToken, { branchId, screen: "recorrido" });

    const body = await poll();
    const bloques = body.recorrido!.bloques;
    expect(bloques.map((b) => b.role)).toEqual([
      "NUCLEUS",
      "DEUTEROS_1",
      "EPIKOS",
    ]);
    for (const b of bloques) expect(b.zonas).toEqual([]);
  });

  it("(2) el poll normal (class) y el idle traen recorrido:null", async () => {
    // Sin clase iniciada: idle.
    const idle = await poll();
    expect(idle.screen).toBe("idle");
    expect(idle.recorrido).toBeNull();

    await postState(coachToken, { branchId, blockRole: "NUCLEUS" });
    const enClase = await poll();
    expect(enClase.screen).toBe("class");
    expect(enClase.class).not.toBeNull();
    expect(enClase.recorrido).toBeNull();
  });

  it("(2b) closing trae recorrido:null", async () => {
    await postState(coachToken, { branchId, blockRole: "EPIKOS" });
    await postState(coachToken, { branchId, screen: "closing" });
    const body = await poll();
    expect(body.screen).toBe("closing");
    expect(body.recorrido).toBeNull();
  });
});

describe("screen 'recorrido' — salida", () => {
  async function entrarEnRecorrido(): Promise<void> {
    await postState(coachToken, { branchId, blockRole: "INITIUM" });
    const res = await postState(coachToken, { branchId, screen: "recorrido" });
    expect(res.statusCode, res.body).toBe(200);
  }

  it("(3a) cambiar blockRole SIN screen vuelve a 'class'", async () => {
    await entrarEnRecorrido();

    const res = await postState(coachToken, { branchId, blockRole: "NUCLEUS" });
    expect(res.statusCode, res.body).toBe(200);
    const context = JSON.parse(res.body) as { state: ControlStateBody };
    expect(context.state.screen).toBe("class");
    expect(context.state.blockRole).toBe("NUCLEUS");

    const row = await readRow(branchId);
    expect(row.screen).toBe("class");

    const body = await poll();
    expect(body.screen).toBe("class");
    expect(body.recorrido).toBeNull();
    expect(body.class).not.toBeNull();
  });

  it("(3b) escribir screen:'class' tambien sale, y conserva el bloque", async () => {
    await entrarEnRecorrido();

    const res = await postState(coachToken, { branchId, screen: "class" });
    expect(res.statusCode, res.body).toBe(200);
    const context = JSON.parse(res.body) as { state: ControlStateBody };
    expect(context.state.screen).toBe("class");
    expect(context.state.blockRole).toBe("INITIUM");

    const body = await poll();
    expect(body.screen).toBe("class");
    expect(body.recorrido).toBeNull();
  });

  it("(3c) escribir screen:'closing' desde el recorrido tambien sale", async () => {
    await entrarEnRecorrido();
    const res = await postState(coachToken, { branchId, screen: "closing" });
    expect(res.statusCode, res.body).toBe(200);
    expect((await readRow(branchId)).screen).toBe("closing");
  });

  it("(3d) una escritura que NO toca bloque ni pantalla (sonido) no saca del recorrido", async () => {
    await entrarEnRecorrido();
    const res = await postState(coachToken, { branchId, soundEnabled: true });
    expect(res.statusCode, res.body).toBe(200);
    const body = await poll();
    expect(body.screen).toBe("recorrido");
  });

  it("(3e) re-escribir screen:'recorrido' es idempotente", async () => {
    await entrarEnRecorrido();
    const res = await postState(coachToken, { branchId, screen: "recorrido" });
    expect(res.statusCode, res.body).toBe(200);
    const body = await poll();
    expect(body.screen).toBe("recorrido");
    expect(body.recorrido!.bloques).toHaveLength(3);
  });

  it("(3f) end-class borra la fila (idempotente) tambien estando en 'recorrido'", async () => {
    await entrarEnRecorrido();
    expect(await readRow(branchId)).toBeDefined();

    const first = await postEndClass(coachToken, branchId);
    expect(first.statusCode, first.body).toBe(200);
    expect(await readRow(branchId)).toBeUndefined();
    const second = await postEndClass(coachToken, branchId);
    expect(second.statusCode, second.body).toBe(200);

    const body = await poll();
    expect(body.screen).toBe("idle");
    expect(body.recorrido).toBeNull();
  });

  it("(3g) pasar de 'aviso' a 'recorrido' limpia el aviso", async () => {
    const [aviso] = await app.db
      .insert(schema.tvAvisos)
      .values({ title: "t", body: "b", mode: "manual", isActive: true })
      .$returningId();
    try {
      await postState(coachToken, { branchId, blockRole: "INITIUM" });
      await postState(coachToken, {
        branchId,
        screen: "aviso",
        tvAvisoId: aviso.id,
      });
      const res = await postState(coachToken, {
        branchId,
        screen: "recorrido",
      });
      expect(res.statusCode, res.body).toBe(200);

      const row = await readRow(branchId);
      expect(row.screen).toBe("recorrido");
      expect(row.tvAvisoId).toBeNull();
    } finally {
      // `tv_avisos` NO esta en TABLES_TO_CLEAN: no dejar un aviso vivo para
      // los otros archivos de test/tv/ (mismo cuidado que tv-aviso-screen).
      // Filtro literal por `tenantId` (siempre 1 en este archivo): el sentinel
      // de tenancy exige el filtro y aca no hay `TenantContext` a mano.
      await app.db
        .delete(schema.tvAvisos)
        .where(
          and(
            eq(schema.tvAvisos.id, aviso.id),
            eq(schema.tvAvisos.tenantId, 1),
          ),
        );
    }
  });
});

describe("screen 'recorrido' — el timer NO se toca", () => {
  it("(4) entrar y salir con screen:'class' conserva el timer en curso", async () => {
    await postState(coachToken, { branchId, blockRole: "NUCLEUS" });
    const started = await postState(coachToken, { branchId, timer: "start" });
    const startedCtx = JSON.parse(started.body) as { state: ControlStateBody };
    expect(startedCtx.state.timerStatus).toBe("running");
    const startedAt = startedCtx.state.timerStartedAt;
    expect(startedAt).not.toBeNull();

    // Pasa un rato de pared, para que un reset se note.
    vi.setSystemTime(new Date(TUESDAY.getTime() + 30_000));

    const enter = await postState(coachToken, {
      branchId,
      screen: "recorrido",
    });
    const enterCtx = JSON.parse(enter.body) as { state: ControlStateBody };
    expect(enterCtx.state.screen).toBe("recorrido");
    expect(enterCtx.state.timerStatus).toBe("running");
    expect(enterCtx.state.timerStartedAt).toBe(startedAt);

    const exit = await postState(coachToken, { branchId, screen: "class" });
    const exitCtx = JSON.parse(exit.body) as { state: ControlStateBody };
    expect(exitCtx.state.screen).toBe("class");
    expect(exitCtx.state.timerStatus).toBe("running");
    expect(exitCtx.state.timerStartedAt).toBe(startedAt);

    const body = await poll();
    expect(body.class!.timer.status).toBe("running");
    expect(body.class!.timer.startedAt).toBe(startedAt);
  });
});

describe("screen 'recorrido' — validacion del enum", () => {
  it("(5) un valor de pantalla invalido responde 400 y el estado no cambia", async () => {
    await postState(coachToken, { branchId, blockRole: "INITIUM" });
    const before = await readRow(branchId);

    for (const screen of ["recorridos", "RECORRIDO", "idle", ""]) {
      const res = await postState(coachToken, { branchId, screen });
      expect(res.statusCode, `${screen}: ${res.body}`).toBe(400);
    }

    const after = await readRow(branchId);
    expect(after.screen).toBe(before.screen);
  });
});

describe("screen 'recorrido' — sabado ROM", () => {
  it("(6) sin ejercicios con zonas, cae al fallback por rol y el subtitulo es null", async () => {
    vi.setSystemTime(SATURDAY);
    // Prescripciones ROM sin fila en `exercises` -> union vacia -> fallback.
    for (const level of ["alfa", "delta"]) {
      await seedSession({
        day: "sabado",
        level,
        mode: "rom",
        blocks: ROM_ROLES.map((role) => ({
          role,
          route: role,
          prescriptions: [{ exerciseId: 999999999 }],
        })),
      });
    }

    await postState(coachToken, { branchId, blockRole: "INITIUM" });
    await postState(coachToken, { branchId, screen: "recorrido" });

    const body = await poll();
    expect(body.screen).toBe("recorrido");
    const bloques = body.recorrido!.bloques;
    expect(bloques.map((b) => b.role)).toEqual([
      "ROM_LOWER",
      "ROM_CORE",
      "ROM_UPPER",
    ]);
    expect(bloques.map((b) => b.title)).toEqual([
      "TREN INFERIOR",
      "ZONA MEDIA",
      "TREN SUPERIOR",
    ]);
    for (const b of bloques) expect(b.subtitle).toBeNull();
    expect(bloques[0].zonas).toEqual([
      "gluteal",
      "quadriceps",
      "hamstring",
      "adductors",
      "calves",
    ]);
    expect(bloques[1].zonas).toEqual(["lower-back", "abs", "obliques"]);
    expect(bloques[2].zonas).toEqual(["chest", "deltoids", "upper-back"]);
  });
});

describe("screen 'recorrido' — tenant", () => {
  it("(7) el recorrido de la sede propia no trae datos de otro gimnasio, y la sede ajena es inaccesible", async () => {
    const gym2 = await seedSecondTenant(app);
    try {
      await postState(coachToken, { branchId, screen: "recorrido" });

      // Un coach de la sede propia NO puede consultar ni escribir la sede del
      // otro gimnasio (`requireBranchAccess`).
      const foreign = await getScreen(coachToken, gym2.branchId);
      expect(foreign.statusCode, foreign.body).toBe(403);
      const write = await postState(coachToken, {
        branchId: gym2.branchId,
        screen: "recorrido",
      });
      expect(write.statusCode, write.body).toBe(403);
      expect(await readRow(gym2.branchId)).toBeUndefined();

      // Y el poll propio sigue intacto.
      const body = await poll();
      expect(body.screen).toBe("recorrido");
      expect(body.recorrido!.bloques).toHaveLength(3);
    } finally {
      await limpiarSegundoGimnasio(app);
    }
  });
});
