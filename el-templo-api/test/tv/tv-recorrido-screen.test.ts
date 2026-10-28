/**
 * "El recorrido de hoy" — la pantalla de inicio de la TV con plani aprobada
 * (commit d3f111e93, 2026-10-13), contra MySQL real y las rutas de control
 * existentes (`tv/control-routes.ts`, sin rutas nuevas):
 *
 *   POST /api/admin/tv/control/state       — escritura absoluta
 *   GET  /api/admin/tv/control/screen      — poll TV-facing
 *   POST /api/admin/tv/control/end-class   — reposo, idempotente (D-07)
 *
 * Diseno vigente: `recorrido` YA NO es una pantalla (ni en el poll, ni en el
 * write, ni en el estado persistido). Es un CAMPO del poll de reposo:
 *
 *   - plani aprobada + sin estado de clase -> `screen:'idle'`, `class:null`,
 *     `aviso:null`, `recorrido` del par del nivel de referencia ALFA (alfa +
 *     delta, filtrado por los niveles del dia; sin INITIUM) y
 *     REEMPLAZA al aviso `flex_inicio`. Si no queda ningun bloque, cae al
 *     idle de siempre (aviso de reemplazo si hay, `recorrido:null`).
 *   - sin plani aprobada -> idle de siempre, `recorrido:null`.
 *   - clase en curso (class/closing/aviso) -> `recorrido:null`.
 *
 * Casos:
 *   (1) contenido del payload: bloques, titulos, deuteros separados, zonas
 *       (solo `main`, union de alfa+delta, tolera prescripciones sin
 *       fila en `exercises`), subtitulos, `format` e `intensity` (rango por niveles), tecnica I+II+ALT como UN item y KINESIS
 *       con las zonas de la tecnica (dia tecnica; sin tecnica queda igual),
 *       sabado ROM (fallback por rol, subtitulo null).
 *   (2) reposo sin plani / con plani sin bloques / aviso flex_inicio.
 *   (3) clase en curso, closing y aviso manual: `recorrido:null`; `end-class`
 *       vuelve al recorrido.
 *   (4) `screen:'recorrido'` ya no se acepta (400) y una fila legada con ese
 *       valor se lee como 'class'.
 *   (5) aislamiento de tenant.
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
  afterEach,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, inArray, ne } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";
import {
  ZONAS_ORDEN,
  ZONAS_TV,
  soloTv,
  zonasDeRuta,
} from "../../src/modules/anatomy/projection";
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

const ROM_ROLES = ["INITIUM", "ROM_LOWER", "ROM_CORE", "ROM_UPPER"];

let app: FastifyInstance;
let branchId: number;
let coachToken: string;

/** Ejercicios del catalogo de prueba, por clave. */
const ex: Record<string, number> = {};

/**
 * Fase 200 D20: las zonas de un ejercicio salen de su RUTA del modelo de
 * anatomia (la categoria y la secundaria ya no pintan). Zonas que la TV recibe
 * de uno o mas grupos de una sola prescripcion `main` por ruta: la union de
 * `zonasDeRuta` de cada una, en el orden de la TV y sin `tibialis`. Con una
 * prescripcion por ruta la dominancia (0.4) no recorta nada. Los valores
 * literales de cada ruta los fija test/anatomy/projection-parity.
 */
function zonasTvDeRutas(...codes: string[]): string[] {
  return soloTv(
    ZONAS_ORDEN.filter((z) => codes.some((c) => zonasDeRuta(c).includes(z))),
  );
}

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
  /** % de intensidad del bloque (default 70). */
  intensity?: number;
  /** Nombre del formato (default AMRAP). */
  formatName?: string;
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
        intensity: spec.intensity ?? 70,
        repsBudget: 40,
        formatId: 1,
        formatName: spec.formatName ?? "AMRAP",
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
      format: string | null;
      intensity: { min: number; max: number } | null;
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

/** Borra TODAS las sesiones sembradas (para armar otro tipo de dia). */
async function cleanSessions(): Promise<void> {
  await app.db.delete(schema.sessionPrescriptions);
  await app.db.delete(schema.sessionBlocks);
  await app.db.delete(schema.sessions);
}

/** Hoy sin plani aprobada (yoga, dia sin clase): las sesiones pasan a draft. */
async function desaprobarSesionesDeHoy(): Promise<void> {
  await app.db
    .update(schema.sessions)
    .set({ status: "draft" })
    .where(eq(schema.sessions.week, 1));
}

/** Deja a las sesiones de hoy SOLO con INITIUM: plani aprobada sin recorrido. */
async function dejarSoloInitium(): Promise<void> {
  const blocks = await app.db
    .select({ id: schema.sessionBlocks.id })
    .from(schema.sessionBlocks)
    .where(ne(schema.sessionBlocks.role, "INITIUM"));
  const ids = blocks.map((b) => b.id);
  expect(ids.length).toBeGreaterThan(0);
  await app.db
    .delete(schema.sessionPrescriptions)
    .where(inArray(schema.sessionPrescriptions.blockId, ids));
  await app.db
    .delete(schema.sessionBlocks)
    .where(inArray(schema.sessionBlocks.id, ids));
}

/**
 * Aviso de TV de prueba. `tv_avisos` NO esta en TABLES_TO_CLEAN: cada test que
 * crea uno lo borra (`borrarTvAvisos`) para no dejar un flex_inicio vivo a los
 * otros archivos de test/tv/ (mismo cuidado que tv-aviso-screen).
 */
const avisosCreados: number[] = [];

async function crearAviso(
  mode: "manual" | "flex_inicio" | "flex_final",
  title: string,
): Promise<number> {
  const [aviso] = await app.db
    .insert(schema.tvAvisos)
    .values({ title, body: `cuerpo ${title}`, mode, isActive: true })
    .$returningId();
  avisosCreados.push(aviso.id);
  return aviso.id;
}

async function borrarTvAvisos(): Promise<void> {
  // Filtro literal por `tenantId` (siempre 1 en este archivo): el sentinel de
  // tenancy exige el filtro y aca no hay `TenantContext` a mano.
  // El estado de clase puede apuntar a un aviso fijado (FK): primero se suelta.
  await app.db
    .delete(schema.tvClassState)
    .where(eq(schema.tvClassState.branchId, branchId));
  while (avisosCreados.length > 0) {
    const id = avisosCreados.pop()!;
    await app.db
      .delete(schema.tvAvisos)
      .where(and(eq(schema.tvAvisos.id, id), eq(schema.tvAvisos.tenantId, 1)));
  }
}

afterEach(async () => {
  await borrarTvAvisos();
});

const ROLES_DEL_MARTES = ["NUCLEUS", "DEUTEROS_1", "DEUTEROS_2", "EPIKOS"];

describe("recorrido de hoy — pantalla de inicio con plani aprobada", () => {
  it("(1) plani aprobada + sin clase: idle con el recorrido del par alfa/delta (nivel de referencia), sin INITIUM y con los DEUTEROS separados", async () => {
    const body = await poll();
    expect(body.screen).toBe("idle");
    expect(body.class).toBeNull();
    expect(body.aviso).toBeNull();
    expect(body.recorrido).not.toBeNull();

    const bloques = body.recorrido!.bloques;
    // INITIUM fuera; los deuteros van SIEMPRE separados (dos items).
    expect(bloques.map((b) => b.role)).toEqual(ROLES_DEL_MARTES);
    expect(bloques.map((b) => b.title)).toEqual([
      "NUCLEUS",
      "DEUTEROS I",
      "DEUTEROS II",
      "EPIKOS",
    ]);

    // Solo el par alfa/delta (delta no tiene sesion hoy): NUCLEUS = alfa
    // pushH (ruta HSPU). El NUCLEUS de sigma (pullV, ruta "Remos") NO aparece
    // en zonas ni subtitulo, y la movilidad (ruta AF) tampoco suma.
    expect(bloques[0].zonas).toEqual(zonasTvDeRutas("HSPU"));
    expect(bloques[0].zonas).toContain("chest");
    expect(bloques[0].zonas).not.toContain("upper-back");
    expect(bloques[0].subtitle).toBe("Handstand Push Up");
    expect(bloques[0].subtitle).not.toContain("Remos");

    // DEUTEROS I: pullV (ruta OAP) en ambos niveles. DEUTEROS II: kneeD (ruta
    // SS) en ambos; la categoria secundaria ISQUIOS ya no suma hamstring.
    expect(bloques[1].zonas).toEqual(zonasTvDeRutas("OAP"));
    expect(bloques[1].zonas).toContain("upper-back");
    expect(bloques[1].subtitle).toBe("Dominadas");
    expect(bloques[2].zonas).toEqual(zonasTvDeRutas("SS"));
    expect(bloques[2].zonas).toContain("quadriceps");
    expect(bloques[2].zonas).not.toContain("hamstring");
    expect(bloques[2].subtitle).toBe("Sissy Squat");

    // EPIKOS: ruta TTB; la prescripcion huerfana no rompe nada ni suma zonas.
    expect(bloques[3].zonas).toEqual(zonasTvDeRutas("TTB"));
    expect(bloques[3].zonas).toContain("abs");
    expect(bloques[3].subtitle).toBe("Toe to Bar");

    // Es solo un campo del poll: no se escribio ningun estado de clase.
    expect(await readRow(branchId)).toBeUndefined();
  });

  it("(1b) el recorrido NO depende del nivel que haya en pantalla: tras una clase en sigma, al terminar vuelve el par alfa/delta", async () => {
    // Antes (diseno viejo) el recorrido seguia al par de `state.level`. Ahora
    // es siempre el del nivel de referencia (alfa).
    await postState(coachToken, { branchId, blockRole: "NUCLEUS" });
    await postState(coachToken, { branchId, level: "sigma" });
    await postEndClass(coachToken, branchId);

    const bloques = (await poll()).recorrido!.bloques;
    expect(bloques[0].subtitle).toBe("Handstand Push Up");
    expect(bloques[0].zonas).toContain("chest");
    expect(bloques[0].zonas).not.toContain("upper-back");
  });

  it("(1a) cada item trae format e intensity: valor unico cuando los niveles coinciden", async () => {
    // El fixture planifica AMRAP al 70 % en todos los bloques y niveles.
    const bloques = (await poll()).recorrido!.bloques;
    for (const b of bloques) {
      expect(b.format, b.role).toBe("AMRAP");
      expect(b.intensity, b.role).toEqual({ min: 70, max: 70 });
    }
  });

  it("(1a-bis) format e intensity: rango y formatos distintos entre alfa y delta; sigma queda fuera; unico donde coinciden", async () => {
    await cleanSessions();
    const bloquesDe = (nucleus: {
      intensity: number;
      formatName: string;
      route?: string;
    }): BlockSpec[] => [
      {
        role: "INITIUM",
        route: "OAP",
        prescriptions: [{ exerciseId: ex.hip }],
        intensity: 10,
      },
      {
        role: "NUCLEUS",
        route: "HSPU",
        prescriptions: [{ exerciseId: ex.pushH }],
        ...nucleus,
      },
      {
        role: "DEUTEROS_1",
        route: "OAP",
        prescriptions: [{ exerciseId: ex.pullV }],
      },
    ];
    await seedSession({
      day: "martes",
      level: "alfa",
      blocks: bloquesDe({ intensity: 60, formatName: "AMRAP" }),
    });
    await seedSession({
      day: "martes",
      level: "delta",
      blocks: bloquesDe({ intensity: 80, formatName: "EMOM", route: "SS" }),
    });
    await seedSession({
      day: "martes",
      level: "sigma",
      blocks: bloquesDe({ intensity: 95, formatName: "TABATA", route: "OAR" }),
    });

    const bloques = (await poll()).recorrido!.bloques;
    expect(bloques.map((b) => b.role)).toEqual(["NUCLEUS", "DEUTEROS_1"]);
    // NUCLEUS difiere entre alfa y delta: rango min/max y formatos distintos,
    // en orden de nivel. El 95 % / TABATA / "Remos" de sigma NO entran.
    expect(bloques[0].intensity).toEqual({ min: 60, max: 80 });
    expect(bloques[0].format).toBe("AMRAP / EMOM");
    expect(bloques[0].subtitle).toBe("Handstand Push Up · Sissy Squat");
    // DEUTEROS I coincide: valor unico (min == max), un solo formato. El
    // INITIUM (intensidad 10) no entra en ningun item.
    expect(bloques[1].intensity).toEqual({ min: 70, max: 70 });
    expect(bloques[1].format).toBe("AMRAP");
  });

  it("(1a-ter) solo hay sesiones fuera del par alfa/delta: cae a todos los niveles (nunca vacio)", async () => {
    await cleanSessions();
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
          intensity: 95,
        },
      ],
    });

    const body = await poll();
    expect(body.screen).toBe("idle");
    const [nucleus] = body.recorrido!.bloques;
    expect(nucleus.subtitle).toBe("Remos");
    expect(nucleus.intensity).toEqual({ min: 95, max: 95 });
  });

  it("(1c) un grupo sin zonas igual viaja (el front no lo pinta)", async () => {
    // Todas las prescripciones pasan a ejercicios huerfanos: sin zonas, pero
    // los items existen.
    await app.db
      .update(schema.sessionPrescriptions)
      .set({ exerciseId: 999999999 });

    const body = await poll();
    expect(body.screen).toBe("idle");
    const bloques = body.recorrido!.bloques;
    expect(bloques.map((b) => b.role)).toEqual(ROLES_DEL_MARTES);
    for (const b of bloques) expect(b.zonas).toEqual([]);
  });

  /** Dia de tecnica de un solo nivel (alfa), con los bloques pedidos. */
  async function armarDia(
    mode: "tecnica" | "combos",
    blocks: BlockSpec[],
  ): Promise<void> {
    await cleanSessions();
    await setDayMode(2, mode);
    await seedSession({ day: "martes", level: "alfa", mode, blocks });
  }

  const INITIUM_BLOCK: BlockSpec = {
    role: "INITIUM",
    route: "OAP",
    prescriptions: [{ exerciseId: 0 }],
  };

  it("(1d) dia tecnica: TECNICA_I + TECNICA_II van como UN item 'TÉCNICA I Y II' (el ALT no entra), y KINESIS copia sus zonas", async () => {
    await armarDia("tecnica", [
      { ...INITIUM_BLOCK, prescriptions: [{ exerciseId: ex.hip }] },
      {
        role: "TECNICA_I",
        route: "HSPU",
        prescriptions: [{ exerciseId: ex.pushH }],
      },
      {
        role: "TECNICA_II",
        route: "OAP",
        prescriptions: [{ exerciseId: ex.pullV }],
      },
      {
        role: "TECNICA_II_ALT",
        route: "SS",
        prescriptions: [{ exerciseId: ex.kneeD }],
      },
      // El stretching tiene SU propia zona (core): la copia la pisa.
      {
        role: "STRETCHING",
        route: "AF",
        prescriptions: [{ exerciseId: ex.core }],
      },
    ]);

    const body = await poll();
    expect(body.screen).toBe("idle");
    const bloques = body.recorrido!.bloques;
    // El grupo va con el primer rol; TECNICA_II no es item aparte y el ALT
    // (otro camino del bloque, UAT 2026-10-13) no aporta ruta ni zonas.
    expect(bloques.map((b) => b.role)).toEqual(["TECNICA_I", "STRETCHING"]);
    const [tecnica, kinesis] = bloques;

    expect(tecnica.title).toBe("TÉCNICA I Y II");
    expect(tecnica.subtitle).toBe("Handstand Push Up · Dominadas");
    expect(tecnica.zonas).toEqual(zonasTvDeRutas("HSPU", "OAP"));
    // Las del ALT (ruta SS) no aparecen.
    expect(tecnica.zonas).not.toContain("quadriceps");
    expect(tecnica.zonas).not.toContain("hamstring");

    // KINESIS: subtitulo "Stretching" y las zonas de la tecnica (no las suyas).
    expect(kinesis.title).toBe("KINESIS");
    expect(kinesis.subtitle).toBe("Stretching");
    expect(kinesis.zonas).toEqual(tecnica.zonas);
    // TTB (la ruta del ejercicio de KINESIS) trabaja abs: no se copia.
    expect(zonasDeRuta("TTB")).toContain("abs");
    expect(kinesis.zonas).not.toContain("abs");
  });

  it("(1e) dia tecnica sin ALT: TECNICA_I y TECNICA_II igual son UN item", async () => {
    await armarDia("tecnica", [
      { ...INITIUM_BLOCK, prescriptions: [{ exerciseId: ex.hip }] },
      {
        role: "TECNICA_I",
        route: "HSPU",
        prescriptions: [{ exerciseId: ex.pushH }],
      },
      {
        role: "TECNICA_II",
        route: "OAP",
        prescriptions: [{ exerciseId: ex.pullV }],
      },
    ]);

    const bloques = (await poll()).recorrido!.bloques;
    expect(bloques).toHaveLength(1);
    expect(bloques[0].role).toBe("TECNICA_I");
    expect(bloques[0].title).toBe("TÉCNICA I Y II");
    expect(bloques[0].subtitle).toBe("Handstand Push Up · Dominadas");
  });

  it("(1f) tecnica con UN solo rol: queda el titulo de siempre", async () => {
    await armarDia("tecnica", [
      { ...INITIUM_BLOCK, prescriptions: [{ exerciseId: ex.hip }] },
      {
        role: "TECNICA_I",
        route: "HSPU",
        prescriptions: [{ exerciseId: ex.pushH }],
      },
    ]);

    const bloques = (await poll()).recorrido!.bloques;
    expect(bloques.map((b) => b.title)).toEqual(["TÉCNICA I"]);
    expect(bloques[0].zonas).toEqual(zonasTvDeRutas("HSPU"));
  });

  it("(1g) STRETCHING sin grupo de tecnica (dia combos): queda como antes — sin subtitulo ni zonas copiadas", async () => {
    await armarDia("combos", [
      { ...INITIUM_BLOCK, prescriptions: [{ exerciseId: ex.hip }] },
      {
        role: "COMBOS_I",
        route: "HSPU",
        prescriptions: [{ exerciseId: ex.pushH }],
      },
      {
        role: "COMBOS_II",
        route: "OAP",
        prescriptions: [{ exerciseId: ex.pullV }],
        intensity: 60,
      },
      // El ALT (otro camino de COMBOS II) no entra: ni ruta, ni %, ni zonas.
      {
        role: "COMBOS_II_ALT",
        route: "SS",
        prescriptions: [{ exerciseId: ex.kneeD }],
        intensity: 65,
      },
      {
        role: "STRETCHING",
        route: "AF",
        prescriptions: [{ exerciseId: ex.core }],
      },
    ]);

    const bloques = (await poll()).recorrido!.bloques;
    expect(bloques.map((b) => b.role)).toEqual([
      "COMBOS_I",
      "COMBOS_II",
      "STRETCHING",
    ]);
    const kinesis = bloques[2];
    expect(kinesis.title).toBe("KINESIS");
    expect(kinesis.subtitle).toBeNull();
    // Sus propias zonas (las de su ejercicio, ruta TTB), no las de COMBOS
    // (HSPU: chest, deltoids, triceps / OAP: chest, biceps...).
    expect(kinesis.zonas).toEqual(zonasTvDeRutas("TTB"));
    expect(kinesis.zonas).toContain("abs");
    expect(kinesis.zonas).not.toContain("chest");
    expect(kinesis.zonas).not.toContain("deltoids");
    expect(kinesis.zonas).not.toContain("biceps");
    // Y COMBOS_I / COMBOS_II siguen siendo items separados.
    expect(bloques[0].title).toBe("COMBOS I");
    expect(bloques[1].title).toBe("COMBOS II");
    // COMBOS II: solo el principal (UAT 2026-10-13).
    expect(bloques[1].subtitle).toBe("Dominadas");
    expect(bloques[1].intensity).toEqual({ min: 60, max: 60 });
    expect(bloques[1].zonas).toEqual(zonasTvDeRutas("OAP"));
  });

  it("(1g-bis) ruta Full Body (FB): marca el cuerpo entero, no solo las zonas de sus ejercicios", async () => {
    await armarDia("combos", [
      { ...INITIUM_BLOCK, prescriptions: [{ exerciseId: ex.hip }] },
      {
        role: "COMBOS_I",
        route: "HSPU",
        prescriptions: [{ exerciseId: ex.pushH }],
      },
      // EPIKOS Full Body con un solo ejercicio de empuje: igual pinta todo.
      {
        role: "EPIKOS",
        route: "FB",
        prescriptions: [{ exerciseId: ex.pushH }],
      },
    ]);

    const bloques = (await poll()).recorrido!.bloques;
    const [combos, fullBody] = bloques;
    expect(fullBody.subtitle).toBe("Full Body");
    expect(fullBody.zonas).toHaveLength(15);
    // Las 15 zonas de la TV en su orden (sin tibialis).
    expect(fullBody.zonas).toEqual([...ZONAS_TV]);
    expect(fullBody.zonas).toEqual(
      expect.arrayContaining(["calves", "hamstring", "abs", "upper-back"]),
    );
    // El resto de los bloques sigue con sus zonas por ruta (HSPU).
    expect(combos.zonas).toEqual(zonasTvDeRutas("HSPU"));
  });

  it("(1h) sabado ROM: sin ejercicios con zonas cae al fallback por rol y el subtitulo es null", async () => {
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

    const body = await poll();
    expect(body.screen).toBe("idle");
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

describe("recorrido de hoy — reposo sin recorrido", () => {
  it("(2a) sin plani aprobada: idle de siempre, recorrido:null", async () => {
    await desaprobarSesionesDeHoy();
    const body = await poll();
    expect(body.screen).toBe("idle");
    expect(body.class).toBeNull();
    expect(body.aviso).toBeNull();
    expect(body.recorrido).toBeNull();
  });

  it("(2b) plani aprobada pero solo con INITIUM: no hay bloques, recorrido:null (idle de siempre)", async () => {
    await dejarSoloInitium();
    const body = await poll();
    expect(body.screen).toBe("idle");
    expect(body.class).toBeNull();
    expect(body.aviso).toBeNull();
    expect(body.recorrido).toBeNull();
  });

  it("(2c) plani aprobada + aviso flex_inicio activo: gana el recorrido y el aviso NO se muestra", async () => {
    await crearAviso("flex_inicio", "Flexibilidad libre");
    const body = await poll();
    expect(body.screen).toBe("idle");
    expect(body.class).toBeNull();
    expect(body.aviso).toBeNull();
    expect(body.recorrido).not.toBeNull();
    expect(body.recorrido!.bloques.map((b) => b.role)).toEqual(
      ROLES_DEL_MARTES,
    );
  });

  it("(2d) sin plani + aviso flex_inicio: se muestra el aviso, recorrido:null", async () => {
    await desaprobarSesionesDeHoy();
    const avisoId = await crearAviso("flex_inicio", "Flexibilidad libre");
    const body = await poll();
    expect(body.screen).toBe("idle");
    expect(body.class).toBeNull();
    expect(body.aviso).toMatchObject({
      id: avisoId,
      title: "Flexibilidad libre",
    });
    expect(body.recorrido).toBeNull();
  });

  it("(2e) plani aprobada sin bloques + aviso flex_inicio: cae al aviso de reemplazo, recorrido:null", async () => {
    await dejarSoloInitium();
    const avisoId = await crearAviso("flex_inicio", "Flexibilidad libre");
    const body = await poll();
    expect(body.screen).toBe("idle");
    expect(body.aviso).toMatchObject({ id: avisoId });
    expect(body.recorrido).toBeNull();
  });

  it("(2f) un aviso manual o flex_final no reemplaza al recorrido ni aparece en idle", async () => {
    await crearAviso("manual", "Manual");
    await crearAviso("flex_final", "Final");
    const body = await poll();
    expect(body.screen).toBe("idle");
    expect(body.aviso).toBeNull();
    expect(body.recorrido).not.toBeNull();
  });
});

describe("recorrido de hoy — con clase en curso", () => {
  it("(3a) clase en curso (tocar un bloque): screen 'class' con recorrido:null; end-class vuelve a idle con recorrido", async () => {
    await postState(coachToken, { branchId, blockRole: "NUCLEUS" });
    const enClase = await poll();
    expect(enClase.screen).toBe("class");
    expect(enClase.class).not.toBeNull();
    expect(enClase.aviso).toBeNull();
    expect(enClase.recorrido).toBeNull();

    const first = await postEndClass(coachToken, branchId);
    expect(first.statusCode, first.body).toBe(200);
    expect(await readRow(branchId)).toBeUndefined();
    // Idempotente (D-07).
    const second = await postEndClass(coachToken, branchId);
    expect(second.statusCode, second.body).toBe(200);

    const idle = await poll();
    expect(idle.screen).toBe("idle");
    expect(idle.class).toBeNull();
    expect(idle.recorrido).not.toBeNull();
    expect(idle.recorrido!.bloques.map((b) => b.role)).toEqual(
      ROLES_DEL_MARTES,
    );
  });

  it("(3b) la clase en curso con un flex_inicio activo sigue sin recorrido ni aviso", async () => {
    await crearAviso("flex_inicio", "Flexibilidad libre");
    await postState(coachToken, { branchId, blockRole: "INITIUM" });
    const body = await poll();
    expect(body.screen).toBe("class");
    expect(body.aviso).toBeNull();
    expect(body.recorrido).toBeNull();
  });

  it("(3c) closing trae recorrido:null", async () => {
    await postState(coachToken, { branchId, blockRole: "EPIKOS" });
    await postState(coachToken, { branchId, screen: "closing" });
    const body = await poll();
    expect(body.screen).toBe("closing");
    expect(body.class).toBeNull();
    expect(body.recorrido).toBeNull();
  });

  it("(3d) closing con un flex_final activo: el aviso viaja, recorrido:null", async () => {
    const avisoId = await crearAviso("flex_final", "Antes de irte");
    await postState(coachToken, { branchId, screen: "closing" });
    const body = await poll();
    expect(body.screen).toBe("closing");
    expect(body.aviso).toMatchObject({ id: avisoId });
    expect(body.recorrido).toBeNull();
  });

  it("(3e) aviso manual fijado por el profe con plani aprobada: screen 'aviso', recorrido:null", async () => {
    const avisoId = await crearAviso("manual", "Cambio de rutina");
    const res = await postState(coachToken, {
      branchId,
      screen: "aviso",
      tvAvisoId: avisoId,
    });
    expect(res.statusCode, res.body).toBe(200);

    const body = await poll();
    expect(body.screen).toBe("aviso");
    expect(body.class).toBeNull();
    expect(body.aviso).toMatchObject({
      id: avisoId,
      title: "Cambio de rutina",
    });
    expect(body.recorrido).toBeNull();
  });

  it("(3f) aviso manual sin plani (yoga): screen 'aviso', recorrido:null", async () => {
    await desaprobarSesionesDeHoy();
    const avisoId = await crearAviso("manual", "Yoga regenerativo");
    const res = await postState(coachToken, {
      branchId,
      screen: "aviso",
      tvAvisoId: avisoId,
    });
    expect(res.statusCode, res.body).toBe(200);

    const body = await poll();
    expect(body.screen).toBe("aviso");
    expect(body.class).toBeNull();
    expect(body.aviso).toMatchObject({ id: avisoId });
    expect(body.recorrido).toBeNull();
  });

  it("(3g) el aviso fijado se desactiva con plani aprobada: degrada a 'class', recorrido:null (no vuelve al recorrido mientras haya clase)", async () => {
    const avisoId = await crearAviso("manual", "Se apaga");
    await postState(coachToken, { branchId, blockRole: "INITIUM" });
    await postState(coachToken, {
      branchId,
      screen: "aviso",
      tvAvisoId: avisoId,
    });
    await app.db
      .update(schema.tvAvisos)
      .set({ isActive: false })
      .where(
        and(eq(schema.tvAvisos.id, avisoId), eq(schema.tvAvisos.tenantId, 1)),
      );

    const body = await poll();
    expect(body.screen).toBe("class");
    expect(body.recorrido).toBeNull();
  });
});

describe("recorrido de hoy — ya no es una pantalla", () => {
  it("(4a) escribir screen:'recorrido' responde 400 y el estado no cambia", async () => {
    await postState(coachToken, { branchId, blockRole: "INITIUM" });
    const before = await readRow(branchId);

    const res = await postState(coachToken, { branchId, screen: "recorrido" });
    expect(res.statusCode, res.body).toBe(400);

    const after = await readRow(branchId);
    expect(after.screen).toBe(before.screen);
    expect(after.blockRole).toBe(before.blockRole);
  });

  it("(4b) screen:'recorrido' sin ninguna fila previa tambien es 400 y no crea estado", async () => {
    const res = await postState(coachToken, { branchId, screen: "recorrido" });
    expect(res.statusCode, res.body).toBe(400);
    expect(await readRow(branchId)).toBeUndefined();
  });

  it("(4c) el enum rechaza valores invalidos (y 'idle', que se vuelve con end-class)", async () => {
    await postState(coachToken, { branchId, blockRole: "INITIUM" });
    const before = await readRow(branchId);

    for (const screen of ["recorridos", "RECORRIDO", "idle", ""]) {
      const res = await postState(coachToken, { branchId, screen });
      expect(res.statusCode, `${screen}: ${res.body}`).toBe(400);
    }

    expect((await readRow(branchId)).screen).toBe(before.screen);
  });

  it("(4d) una fila legada con screen='recorrido' (guardada antes del cambio) se lee como 'class', nunca como pantalla fantasma", async () => {
    await postState(coachToken, { branchId, blockRole: "NUCLEUS" });
    await app.db
      .update(schema.tvClassState)
      .set({ screen: "recorrido" })
      .where(eq(schema.tvClassState.branchId, branchId));

    const body = await poll();
    expect(body.screen).toBe("class");
    expect(body.class).not.toBeNull();
    expect(body.recorrido).toBeNull();
  });

  it("(4e) el contexto de control tampoco expone 'recorrido' como pantalla", async () => {
    const res = await postState(coachToken, { branchId, blockRole: "NUCLEUS" });
    expect(res.statusCode, res.body).toBe(200);
    const context = JSON.parse(res.body) as { state: ControlStateBody };
    expect(context.state.screen).toBe("class");
  });
});

describe("recorrido de hoy — tenant", () => {
  it("(5) el poll propio trae solo el recorrido de su sede y la sede de otro gimnasio es inaccesible", async () => {
    const gym2 = await seedSecondTenant(app);
    try {
      // Un coach de la sede propia NO puede consultar la sede del otro
      // gimnasio (`requireBranchAccess`), ni siquiera para ver su recorrido.
      const foreign = await getScreen(coachToken, gym2.branchId);
      expect(foreign.statusCode, foreign.body).toBe(403);

      // El poll propio sigue intacto.
      const body = await poll();
      expect(body.screen).toBe("idle");
      expect(body.recorrido!.bloques).toHaveLength(4);
      expect(await readRow(gym2.branchId)).toBeUndefined();
    } finally {
      await limpiarSegundoGimnasio(app);
    }
  });
});
