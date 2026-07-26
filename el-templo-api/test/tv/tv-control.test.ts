/**
 * Rutas de control del profe (fase 164, plan 10):
 *
 *   GET  /api/admin/tv/control/context?branchId=NN
 *   POST /api/admin/tv/control/state
 *   POST /api/admin/tv/control/end-class
 *
 * Es la UNICA superficie de escritura de la fase, y lo que escribe termina
 * proyectado en la pared de la sala. Por eso cada regla de estado del CONTEXT
 * queda congelada aca contra MySQL real, una por caso:
 *
 *   D-10  el control SI avisa que la sesion no esta aprobada (el TV no)
 *   D-11  la sede se autoriza en cada llamada (coach ajeno 403, owner 200)
 *   D-12  ultima escritura gana, sin locks ni avisos
 *   D-15  el nivel persiste al cambiar de bloque; el bloque resetea ejercicio
 *         y timer; la clase arranca en alfa
 *   D-16  iniciar el timer arranca al instante, sin cuenta previa
 *   D-17  pausar y reanudar conserva el elapsed exacto
 *   D-18  solo cuatro comandos de timer, todos idempotentes
 *   D-19  los beeps arrancan apagados y se encienden desde el celular
 *   D-07  terminar la clase deja el televisor en reposo
 *   D-08  la pantalla de cierre no muestra bloque
 *   D-23  el sabado ROM solo tiene dos tiers
 *
 * Varios casos cruzan el control con el poll del TV (`GET /api/tv/state`): lo
 * que importa no es que la fila quede escrita, sino que el televisor lo vea.
 *
 * El reloj se congela con fake timers: sin eso el archivo entero seria rojo un
 * domingo (no hay clase) y el sabado ROM solo se podria probar los sabados.
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
import { eq } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";

const CONTEXT_URL = "/api/admin/tv/control/context";
const STATE_URL = "/api/admin/tv/control/state";
const END_CLASS_URL = "/api/admin/tv/control/end-class";
const TV_STATE_URL = "/api/tv/state";

const AR_TZ = "America/Argentina/Buenos_Aires";

// Ancla SPOM: WEEK_ONE_MONDAY = 2026-02-23 (lunes).
const TUESDAY = new Date("2026-02-24T15:00:00Z"); // martes W1, 12:00 en AR
const TUESDAY_DATE = "2026-02-24";
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
let branchAId: number;
let branchBId: number;
let coachAToken: string;
let ownerToken: string;
let coachAId: number;
let ownerId: number;
let exerciseId: number;

function uniqueCode(prefix: string): string {
  return `${prefix}${randomBytes(3).toString("hex")}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Tipos del contrato (lo que el control recibe)
// ---------------------------------------------------------------------------

interface ControlState {
  screen: string;
  blockRole: string;
  level: string;
  exerciseIndex: number;
  timerStatus: string;
  timerStartedAt: number | null;
  pausedAt: number | null;
  pausedAccumMs: number;
  soundEnabled: boolean;
}

interface ControlContext {
  branch: { id: number; name: string };
  sessionApproved: boolean;
  mode: string;
  levels: string[];
  blocks: Array<{
    role: string;
    title: string;
    shared: boolean;
    exerciseCountByLevel: Record<string, number>;
  }>;
  state: ControlState | null;
}

interface TvPollBody {
  screen: string;
  class: {
    level: string;
    blockRole: string;
    blockIndex: number;
    exerciseIndex: number;
    timer: {
      status: string;
      startedAt: number | null;
      pausedAt: number | null;
      pausedAccumMs: number;
      soundEnabled: boolean;
    };
  } | null;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

async function seedBranches(): Promise<void> {
  const [a] = await app.db
    .insert(schema.branches)
    .values({
      name: "Mogotes",
      code: uniqueCode("TVC"),
      country: "AR",
      timezone: AR_TZ,
    })
    .$returningId();
  const [b] = await app.db
    .insert(schema.branches)
    .values({
      name: "Jujuy",
      code: uniqueCode("TVD"),
      country: "AR",
      timezone: AR_TZ,
    })
    .$returningId();
  branchAId = a.id;
  branchBId = b.id;

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

/**
 * Sesion de un nivel del dia. `mainsByRole` permite darle a un mismo rol listas
 * de largo DISTINTO segun el nivel, que es la unica forma de probar de verdad
 * el clamp del indice al cambiar de nivel (Pitfall 1).
 */
async function seedSession(opts: {
  day: string;
  level: string;
  roles: string[];
  status?: string;
  sessionMode?: string;
  mainsByRole?: Record<string, number>;
}): Promise<void> {
  const [session] = await app.db
    .insert(schema.sessions)
    .values({
      dayId: `W1-${opts.day}-${opts.level}`,
      week: 1,
      day: opts.day,
      levelGroup: opts.level === "sigma" ? "sigma" : "alfa_delta",
      blockCount: opts.roles.length,
      status: opts.status ?? "approved",
      sessionMode: opts.sessionMode ?? "regular",
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
        exerciseCount: 1,
        sortOrder: i,
      })
      .$returningId();

    const mains = opts.mainsByRole?.[role] ?? 2;
    for (let e = 0; e < mains; e++) {
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

/** El dia habil completo: alfa (listas largas) y sigma (listas cortas). */
async function seedTuesday(): Promise<void> {
  await seedSession({
    day: "martes",
    level: "alfa",
    roles: REGULAR_ROLES,
    mainsByRole: { INITIUM: 1, NUCLEUS: 2, DEUTEROS_2: 5, EPIKOS: 3 },
  });
  await seedSession({
    day: "martes",
    level: "sigma",
    roles: REGULAR_ROLES,
    mainsByRole: { INITIUM: 1, NUCLEUS: 2, DEUTEROS_2: 2, EPIKOS: 3 },
  });
}

async function setDayMode(dayOfWeek: number, mode: string): Promise<void> {
  await app.db
    .delete(schema.dayModes)
    .where(eq(schema.dayModes.dayOfWeek, dayOfWeek));
  await app.db.insert(schema.dayModes).values({ dayOfWeek, sessionMode: mode });
}

/** Un televisor vinculado, para cruzar el control con el poll del TV. */
async function createDevice(
  branchId: number,
): Promise<{ id: number; token: string }> {
  const token = randomBytes(32).toString("base64url");
  const [row] = await app.db
    .insert(schema.tvDevices)
    .values({
      branchId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      name: "TV sala",
      isActive: true,
    })
    .$returningId();
  return { id: row.id, token };
}

// ---------------------------------------------------------------------------
// Llamadas
// ---------------------------------------------------------------------------

function getContext(token: string, branchId: number) {
  return app.inject({
    method: "GET",
    url: `${CONTEXT_URL}?branchId=${branchId}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

function postState(token: string, payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: STATE_URL,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}

function postEndClass(token: string, branchId: number) {
  return app.inject({
    method: "POST",
    url: END_CLASS_URL,
    headers: { authorization: `Bearer ${token}` },
    payload: { branchId },
  });
}

function pollTv(token: string) {
  return app.inject({
    method: "GET",
    url: TV_STATE_URL,
    headers: { authorization: `Device ${token}` },
  });
}

/** Escritura que DEBE salir 200; devuelve el estado nuevo ya deserializado. */
async function write(
  payload: Record<string, unknown>,
  token: string = coachAToken,
): Promise<ControlState> {
  const res = await postState(token, { branchId: branchAId, ...payload });
  expect(res.statusCode).toBe(200);
  const context = JSON.parse(res.body) as ControlContext;
  expect(context.state).not.toBeNull();
  return context.state!;
}

async function readRow(branchId: number) {
  const [row] = await app.db
    .select()
    .from(schema.tvClassState)
    .where(eq(schema.tvClassState.branchId, branchId));
  return row;
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
  await seedBranches();
  await setDayMode(2, "regular");
  await setDayMode(6, "rom");

  coachAId = await createStaffUser(app, {
    email: "tv-ctrl-coach-a@test.com",
    password: "coach-pass-123",
    firstName: "Coach",
    lastName: "A",
    role: "coach",
    branchId: branchAId,
  });
  ownerId = await createStaffUser(app, {
    email: "tv-ctrl-owner@test.com",
    password: "owner-pass-123",
    firstName: "Owner",
    lastName: "TV",
    role: "owner",
    branchId: branchAId,
  });
  coachAToken = await getAuthToken(
    app,
    "tv-ctrl-coach-a@test.com",
    "coach-pass-123",
  );
  ownerToken = await getAuthToken(
    app,
    "tv-ctrl-owner@test.com",
    "owner-pass-123",
  );
});

describe("GET /control/context — lo que el control ciego necesita (D-13)", () => {
  it("con sesion aprobada trae bloques, niveles y cuantos ejercicios tiene cada uno", async () => {
    await seedTuesday();

    const res = await getContext(coachAToken, branchAId);
    expect(res.statusCode).toBe(200);

    const context = JSON.parse(res.body) as ControlContext;
    expect(context.branch).toEqual({ id: branchAId, name: "Mogotes" });
    expect(context.sessionApproved).toBe(true);
    expect(context.mode).toBe("regular");
    expect(context.levels).toEqual(["alfa", "sigma"]);
    expect(context.blocks.map((b) => b.role)).toEqual(REGULAR_ROLES);

    // Sin esto el control no puede saber cuando deshabilitar "ejercicio
    // siguiente": el largo de la lista depende del (bloque, nivel).
    const deuteros2 = context.blocks.find((b) => b.role === "DEUTEROS_2")!;
    expect(deuteros2.exerciseCountByLevel).toEqual({ alfa: 5, sigma: 2 });

    // El INITIUM es la lista compartida del dia: mismo largo en todo nivel.
    const initium = context.blocks.find((b) => b.role === "INITIUM")!;
    expect(initium.shared).toBe(true);
    expect(initium.exerciseCountByLevel).toEqual({ alfa: 1, sigma: 1 });

    // La clase todavia no arranco.
    expect(context.state).toBeNull();
  });

  it("D-10: si la sesion del dia no esta aprobada lo dice EXPLICITAMENTE", async () => {
    await seedSession({
      day: "martes",
      level: "alfa",
      roles: REGULAR_ROLES,
      status: "draft",
    });

    const context = JSON.parse(
      (await getContext(coachAToken, branchAId)).body,
    ) as ControlContext;

    // Al reves que el TV, que se queda en reposo mudo (D-09) porque cuelga de
    // una pared publica: el celular del profe TIENE que poder explicar por que
    // la botonera esta deshabilitada.
    expect(context.sessionApproved).toBe(false);
    expect(context.blocks).toEqual([]);
    expect(context.levels).toEqual([]);
    expect(context.state).toBeNull();
  });

  it("D-11: un coach de otra sede recibe 403, el owner entra a cualquiera", async () => {
    await seedTuesday();
    await createStaffUser(app, {
      email: "tv-ctrl-coach-b@test.com",
      password: "coach-pass-123",
      firstName: "Coach",
      lastName: "B",
      role: "coach",
      branchId: branchBId,
    });
    const coachBToken = await getAuthToken(
      app,
      "tv-ctrl-coach-b@test.com",
      "coach-pass-123",
    );

    const ajena = await getContext(coachBToken, branchAId);
    expect(ajena.statusCode).toBe(403);
    expect(JSON.parse(ajena.body).code).toBe("BRANCH_OUT_OF_SCOPE");

    // Y tampoco puede ESCRIBIR sobre la sede de otro (T-164-40).
    const escritura = await postState(coachBToken, {
      branchId: branchAId,
      timer: "start",
    });
    expect(escritura.statusCode).toBe(403);
    expect(await readRow(branchAId)).toBeUndefined();

    // Su propia sede si, y el owner entra a las dos.
    expect((await getContext(coachBToken, branchBId)).statusCode).toBe(200);
    expect((await getContext(ownerToken, branchAId)).statusCode).toBe(200);
    expect((await getContext(ownerToken, branchBId)).statusCode).toBe(200);
  });

  it("un rol fuera de TV_CONTROL_ROLES no llega ni a la capa de sede", async () => {
    await seedTuesday();
    await createStaffUser(app, {
      email: "tv-ctrl-recepcion@test.com",
      password: "recep-pass-123",
      firstName: "Recep",
      lastName: "A",
      role: "recepcion",
      branchId: branchAId,
    });
    const recepcionToken = await getAuthToken(
      app,
      "tv-ctrl-recepcion@test.com",
      "recep-pass-123",
    );

    // Su propia sede, pero el rol no controla televisores (D-01).
    const res = await getContext(recepcionToken, branchAId);
    expect(res.statusCode).toBe(403);
    expect(res.body).not.toContain("BRANCH_OUT_OF_SCOPE");
  });
});

describe("POST /control/state — bloque, nivel y ejercicio (D-15)", () => {
  beforeEach(async () => {
    await seedTuesday();
  });

  it("la primera escritura del dia INICIA la clase con los defaults", async () => {
    const state = await write({});

    // D-15: arranca en alfa, en el primer bloque del roster, sin timer.
    expect(state.level).toBe("alfa");
    expect(state.blockRole).toBe("INITIUM");
    expect(state.exerciseIndex).toBe(0);
    expect(state.timerStatus).toBe("idle");
    expect(state.timerStartedAt).toBeNull();
    expect(state.pausedAccumMs).toBe(0);
    expect(state.screen).toBe("class");
    // D-19: los beeps arrancan apagados.
    expect(state.soundEnabled).toBe(false);

    // La fila nace con la fecha de HOY en la TZ de la sede (D-07) y con autor.
    const row = await readRow(branchAId);
    expect(row.classDate).toBe(TUESDAY_DATE);
    expect(row.updatedBy).toBe(coachAId);
  });

  it("cambiar de NIVEL no mueve el bloque ni reinicia el timer", async () => {
    await write({ blockRole: "DEUTEROS_2" });
    const arrancado = await write({ timer: "start" });
    await sleep(40);

    const state = await write({ level: "sigma" });

    // Pitfall 1: el bloque se identifica por rol, no por indice — cambiar de
    // nivel no puede saltar a otro bloque.
    expect(state.blockRole).toBe("DEUTEROS_2");
    expect(state.level).toBe("sigma");
    // Y el cronometro sigue corriendo: el profe cambia de nivel en el medio de
    // un bloque para mostrar la variante, no para volver a empezar.
    expect(state.timerStatus).toBe("running");
    expect(state.timerStartedAt).toBe(arrancado.timerStartedAt);
  });

  it("cambiar de nivel clampea el ejercicio al largo del nivel nuevo", async () => {
    await write({ blockRole: "DEUTEROS_2", exerciseIndex: 4 });

    // alfa tiene 5 ejercicios en DEUTEROS_2 y sigma solo 2.
    const state = await write({ level: "sigma" });
    expect(state.exerciseIndex).toBe(1);
  });

  it("cambiar de BLOQUE resetea ejercicio y timer, pero conserva el nivel", async () => {
    await write({ level: "sigma" });
    await write({ blockRole: "NUCLEUS", exerciseIndex: 1 });
    await write({ timer: "start" });

    const state = await write({ blockRole: "EPIKOS" });

    expect(state.blockRole).toBe("EPIKOS");
    expect(state.exerciseIndex).toBe(0);
    expect(state.timerStatus).toBe("idle");
    expect(state.timerStartedAt).toBeNull();
    expect(state.pausedAccumMs).toBe(0);
    // D-15: el nivel elegido persiste entre bloques — el profe lo elige una vez
    // al principio de la clase, no en cada bloque.
    expect(state.level).toBe("sigma");
  });

  it("reescribir el bloque en el que ya estas no reinicia nada (doble tap)", async () => {
    await write({ blockRole: "NUCLEUS", exerciseIndex: 1 });
    const arrancado = await write({ timer: "start" });
    await sleep(40);

    const state = await write({ blockRole: "NUCLEUS" });

    expect(state.exerciseIndex).toBe(1);
    expect(state.timerStatus).toBe("running");
    expect(state.timerStartedAt).toBe(arrancado.timerStartedAt);
  });

  it("un exerciseIndex fuera de rango se clampea al ultimo del (rol, nivel)", async () => {
    const state = await write({ blockRole: "NUCLEUS", exerciseIndex: 99 });
    // NUCLEUS en alfa tiene 2 ejercicios.
    expect(state.exerciseIndex).toBe(1);
  });

  it("un bloque que no existe en el roster de hoy se descarta, no mueve al profe", async () => {
    await write({ blockRole: "DEUTEROS_2", exerciseIndex: 3 });
    const arrancado = await write({ timer: "start" });
    await sleep(40);

    const state = await write({ blockRole: "ROM_LOWER" });

    // Aplicarlo habria caido en el primer bloque del dia por el clamp: un valor
    // invalido no puede sacar al profe del bloque en curso ni matarle el timer.
    expect(state.blockRole).toBe("DEUTEROS_2");
    expect(state.exerciseIndex).toBe(3);
    expect(state.timerStatus).toBe("running");
    expect(state.timerStartedAt).toBe(arrancado.timerStartedAt);
  });

  it("sin sesion aprobada la escritura se rechaza con 409 y no crea estado", async () => {
    await app.db
      .update(schema.sessions)
      .set({ status: "draft" })
      .where(eq(schema.sessions.week, 1));

    const res = await postState(coachAToken, {
      branchId: branchAId,
      timer: "start",
    });

    expect(res.statusCode).toBe(409);
    expect(await readRow(branchAId)).toBeUndefined();
  });
});

describe("POST /control/state — el timer (D-16/17/18)", () => {
  beforeEach(async () => {
    await seedTuesday();
  });

  it("iniciar programa el arranque 3 s adelante, no al instante", async () => {
    const antes = Date.now();
    const state = await write({ timer: "start" });

    expect(state.timerStatus).toBe("running");
    expect(state.timerStartedAt).not.toBeNull();
    // El sello del server queda en el FUTURO. Revisa D-16 ("arranca al instante"), que
    // ignoraba el poll de 2,5 s del televisor: para cuando la pantalla se enteraba, el
    // cronometro ya iba en ~3 s y saltaba de 00:00 a 00:03 (visto en sede). Con el
    // arranque programado, todos los televisores de la sala entran en cero juntos.
    expect(state.timerStartedAt!).toBeGreaterThanOrEqual(antes + 3000);
    expect(state.timerStartedAt!).toBeLessThanOrEqual(Date.now() + 3000);
    expect(state.pausedAt).toBeNull();
    expect(state.pausedAccumMs).toBe(0);
  });

  it("dos 'start' seguidos NO reinician el bloque (idempotencia del doble tap)", async () => {
    const primero = await write({ timer: "start" });
    await sleep(60);
    const segundo = await write({ timer: "start" });

    // Es la razon de ser de los comandos absolutos: con red mala el profe
    // aprieta dos veces, o el cliente reintenta, y el bloque no puede volver a
    // cero a mitad de una serie.
    expect(segundo.timerStartedAt).toBe(primero.timerStartedAt);
    expect(segundo.timerStatus).toBe("running");
  });

  it("D-17: pausar y reanudar conserva el elapsed exacto", async () => {
    const arrancado = await write({ timer: "start" });
    await sleep(50);

    const pausado = await write({ timer: "pause" });
    expect(pausado.timerStatus).toBe("paused");
    expect(pausado.pausedAt).not.toBeNull();
    expect(pausado.timerStartedAt).toBe(arrancado.timerStartedAt);

    await sleep(60);
    const reanudado = await write({ timer: "resume" });

    expect(reanudado.timerStatus).toBe("running");
    expect(reanudado.pausedAt).toBeNull();
    // El sello de arranque NO se reescribe: el tramo pausado se acumula, asi
    // que pausar N veces no puede hacer derivar el reloj del televisor.
    expect(reanudado.timerStartedAt).toBe(arrancado.timerStartedAt);
    expect(reanudado.pausedAccumMs).toBeGreaterThan(0);

    // El elapsed efectivo (now - startedAt - pausado) no supera el tiempo de pared: el
    // bloque no se comio los 60 ms de la pausa. Los `Math.max` son el mismo criterio que
    // aplica el kiosco (`elapsedFrom`): con el arranque diferido, durante los primeros
    // 3 s el sello esta en el futuro y el elapsed es 0, nunca negativo.
    const pared = Math.max(0, Date.now() - reanudado.timerStartedAt!);
    const efectivo = Math.max(0, pared - reanudado.pausedAccumMs);
    expect(efectivo).toBeLessThanOrEqual(pared);
    expect(efectivo).toBeGreaterThanOrEqual(0);
  });

  it("pausar dos veces o reanudar sin pausa son NO-OP", async () => {
    await write({ timer: "start" });
    await sleep(40);
    const pausado = await write({ timer: "pause" });

    await sleep(40);
    const doblePausa = await write({ timer: "pause" });
    // Si la segunda pausa reescribiera `pausedAt`, al reanudar se perderian los
    // 40ms del medio.
    expect(doblePausa.pausedAt).toBe(pausado.pausedAt);

    const reanudado = await write({ timer: "resume" });
    const dobleResume = await write({ timer: "resume" });
    expect(dobleResume.pausedAccumMs).toBe(reanudado.pausedAccumMs);
    expect(dobleResume.timerStatus).toBe("running");
  });

  it("'reset' deja los tres campos de tiempo en cero", async () => {
    await write({ timer: "start" });
    await sleep(40);
    await write({ timer: "pause" });
    await write({ timer: "resume" });

    const state = await write({ timer: "reset" });

    expect(state.timerStatus).toBe("idle");
    expect(state.timerStartedAt).toBeNull();
    expect(state.pausedAt).toBeNull();
    expect(state.pausedAccumMs).toBe(0);
  });

  it("D-18: no existe ningun comando de timer fuera de los cuatro", async () => {
    const res = await postState(coachAToken, {
      branchId: branchAId,
      timer: "skip-round",
    });
    expect(res.statusCode).toBe(400);
  });

  it("T-164-43: un sello de tiempo mandado por el cliente se descarta", async () => {
    const state = await write({
      timer: "start",
      timerStartedAt: 0,
      pausedAccumMs: 999_999,
    });

    // El schema no declara esos campos, asi que ajv los borra antes del
    // handler: un celular con el reloj corrido no puede mover el arranque de un
    // timer que se proyecta en una pared.
    expect(state.timerStartedAt).toBeGreaterThan(0);
    expect(state.pausedAccumMs).toBe(0);
  });
});

describe("POST /control/state — lo que ve el televisor", () => {
  beforeEach(async () => {
    await seedTuesday();
  });

  it("D-19: el sonido se enciende desde el celular y llega al TV", async () => {
    const device = await createDevice(branchAId);
    await write({ blockRole: "NUCLEUS" });

    const apagado = JSON.parse((await pollTv(device.token)).body) as TvPollBody;
    expect(apagado.class!.timer.soundEnabled).toBe(false);

    const state = await write({ soundEnabled: true });
    expect(state.soundEnabled).toBe(true);

    const encendido = JSON.parse(
      (await pollTv(device.token)).body,
    ) as TvPollBody;
    expect(encendido.class!.timer.soundEnabled).toBe(true);
  });

  it("lo que escribe el profe es lo que pinta el televisor", async () => {
    const device = await createDevice(branchAId);

    await write({ blockRole: "DEUTEROS_2", level: "sigma", exerciseIndex: 1 });
    const arrancado = await write({ timer: "start" });

    const body = JSON.parse((await pollTv(device.token)).body) as TvPollBody;
    expect(body.screen).toBe("class");
    expect(body.class!.blockRole).toBe("DEUTEROS_2");
    // `blockIndex` es derivado del roster, nunca persistido.
    expect(body.class!.blockIndex).toBe(3);
    expect(body.class!.level).toBe("sigma");
    expect(body.class!.exerciseIndex).toBe(1);
    expect(body.class!.timer.status).toBe("running");
    // Los milisegundos del sello sobreviven el viaje completo (Pitfall 9).
    expect(body.class!.timer.startedAt).toBe(arrancado.timerStartedAt);
  });

  it("D-08: la pantalla de cierre deja el televisor sin bloque", async () => {
    const device = await createDevice(branchAId);
    await write({ blockRole: "EPIKOS" });

    const state = await write({ screen: "closing" });
    expect(state.screen).toBe("closing");

    const body = JSON.parse((await pollTv(device.token)).body) as TvPollBody;
    expect(body.screen).toBe("closing");
    expect(body.class).toBeNull();
  });

  it("D-07: terminar la clase devuelve el TV a reposo, y es idempotente", async () => {
    const device = await createDevice(branchAId);
    await write({ blockRole: "NUCLEUS", timer: "start" });
    expect(
      (JSON.parse((await pollTv(device.token)).body) as TvPollBody).screen,
    ).toBe("class");

    const primera = await postEndClass(coachAToken, branchAId);
    expect(primera.statusCode).toBe(200);

    const body = JSON.parse((await pollTv(device.token)).body) as TvPollBody;
    expect(body.screen).toBe("idle");
    expect(body.class).toBeNull();

    // Dos profes apretando "terminar clase" a la vez no puede ser un error.
    const segunda = await postEndClass(coachAToken, branchAId);
    expect(segunda.statusCode).toBe(200);
    expect(await readRow(branchAId)).toBeUndefined();

    // Y despues se puede volver a iniciar sin arrastrar nada.
    const reiniciado = await write({});
    expect(reiniciado.blockRole).toBe("INITIUM");
    expect(reiniciado.timerStatus).toBe("idle");
  });

  it("D-12: dos profes escribiendo a la vez — gana la ultima, sin error", async () => {
    await write({ blockRole: "NUCLEUS", exerciseIndex: 1 });

    // El owner escribe encima del coach: no hay lock, ni version, ni 409.
    const ultima = await write({ blockRole: "EPIKOS" }, ownerToken);
    expect(ultima.blockRole).toBe("EPIKOS");

    const row = await readRow(branchAId);
    expect(row.blockRole).toBe("EPIKOS");
    // T-164-44: queda registrado QUIEN dejo el estado como esta.
    expect(row.updatedBy).toBe(ownerId);
  });
});

describe("POST /control/state — sabado ROM (D-23)", () => {
  beforeEach(async () => {
    vi.setSystemTime(SATURDAY);
    for (const level of ["alfa", "delta"]) {
      await seedSession({
        day: "sabado",
        level,
        roles: ROM_ROLES,
        sessionMode: "rom",
      });
    }
  });

  it("el contexto solo ofrece dos tiers y un nivel inexistente se descarta", async () => {
    const context = JSON.parse(
      (await getContext(coachAToken, branchAId)).body,
    ) as ControlContext;

    // El sabado no existe la escalera alfa/delta/sigma/kairos.
    expect(context.mode).toBe("rom");
    expect(context.levels).toEqual(["alfa", "delta"]);
    expect(context.blocks.map((b) => b.role)).toEqual(ROM_ROLES);

    const iniciado = await write({ blockRole: "ROM_CORE" });
    expect(iniciado.level).toBe("alfa");

    // Un control desactualizado (o un cliente viejo cacheado) mandando sigma no
    // puede dejar el estado apuntando a un nivel que hoy no se planifico.
    const state = await write({ level: "sigma" });
    expect(state.level).toBe("alfa");
    expect(state.blockRole).toBe("ROM_CORE");

    // El tier avanzado del dia si se aplica.
    const avanzado = await write({ level: "delta" });
    expect(avanzado.level).toBe("delta");
  });
});
