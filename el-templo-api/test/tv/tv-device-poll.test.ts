/**
 * GET /api/tv/state y POST /api/tv/client-log — el poll del televisor
 * (fase 164, plan 08).
 *
 * Es el unico endpoint que el kiosco consume en operacion normal: todo lo que
 * este mal aca se ve en la pared de la sede. Por eso las decisiones que sostiene
 * se congelan con integracion real (MySQL + Fastify + el hook de device auth),
 * una por caso:
 *
 *   D-03  token invalido o dispositivo revocado -> 401 (el TV vuelve a pairing)
 *   D-04  dos TVs de la misma sede ven exactamente lo mismo
 *   D-05  cada poll sella `last_seen_at` del dispositivo que llamo
 *   D-07  el estado caduca en la TZ de la SEDE (verificado con Europe/Madrid)
 *   D-09  sin sesion aprobada: reposo SIN un solo campo de error
 *   D-17  pausa acumulativa (`pausedAt` + `pausedAccumMs`)
 *   D-23  sabado ROM: dos tiers rotulados BASICO/AVANZADO y roles por zona
 *
 * El reloj se congela con fake timers porque el handler NO acepta un `now`
 * inyectado (la ruta no recibe parametros a proposito — T-164-31). Sin congelar
 * el reloj, estos tests serian verdes o rojos segun el dia y la hora en que se
 * corren: un domingo no habria clase, y el borde de dia entre Mar del Plata y
 * Barcelona solo existe unas horas por dia.
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
import { createTestApp, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { sanitizeClientLogText } from "../../src/modules/tv/device-routes";

const STATE_URL = "/api/tv/state";
const CLIENT_LOG_URL = "/api/tv/client-log";

const AR_TZ = "America/Argentina/Buenos_Aires";
const ES_TZ = "Europe/Madrid";

// Ancla SPOM: WEEK_ONE_MONDAY = 2026-02-23 (lunes).
const TUESDAY = new Date("2026-02-24T15:00:00Z"); // martes W1, 12:00 en AR
const TUESDAY_DATE = "2026-02-24";
const MONDAY_DATE = "2026-02-23";
const SATURDAY = new Date("2026-02-28T15:00:00Z"); // sabado W1
const SATURDAY_DATE = "2026-02-28";
/**
 * 23:30 UTC del martes: en Mar del Plata (UTC-3) todavia son las 20:30 del
 * martes; en Barcelona (UTC+1) ya es miercoles 00:30. El borde del dia cae en
 * instantes distintos, que es exactamente lo que D-07 exige respetar.
 */
const DAY_BORDER = new Date("2026-02-24T23:30:00Z");

const VIDEO_BASE = "https://videos.test";
const VIDEO_KEY = "exercises/42.mp4";
const ORIGINAL_R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

let app: FastifyInstance;
let branchArId: number;
let branchEsId: number;
let exerciseWithVideoId: number;
let exerciseWithoutVideoId: number;

function uniqueCode(prefix: string): string {
  return `${prefix}${randomBytes(3).toString("hex")}`;
}

/** Vincula un televisor a una sede y devuelve su token en claro. */
async function createDevice(
  branchId: number,
  opts: { name?: string; isActive?: boolean } = {},
): Promise<{ id: number; token: string }> {
  const token = randomBytes(32).toString("base64url");
  const [row] = await app.db
    .insert(schema.tvDevices)
    .values({
      branchId,
      // Igual que el pairing real: solo se persiste el sha256 del token.
      tokenHash: createHash("sha256").update(token).digest("hex"),
      name: opts.name ?? "TV sala",
      isActive: opts.isActive ?? true,
    })
    .$returningId();
  return { id: row.id, token };
}

function poll(token: string, url: string = STATE_URL) {
  return app.inject({
    method: "GET",
    url,
    headers: { authorization: `Device ${token}` },
  });
}

interface PollBody {
  serverNow: number;
  branch: { name: string; utcOffsetMinutes: number; dateLabel: string };
  screen: string;
  class: {
    mode: string;
    levels: string[];
    level: string;
    levelLabel: string;
    blocks: Array<{ role: string; title: string; shared: boolean }>;
    blockRole: string;
    blockIndex: number;
    title: string;
    listHeader: string;
    mobilityLine: string | null;
    exercises: Array<{ name: string; rx: string; videoUrl: string | null }>;
    exerciseIndex: number;
    timer: {
      spec: Record<string, unknown>;
      status: string;
      startedAt: number | null;
      pausedAt: number | null;
      pausedAccumMs: number;
      soundEnabled: boolean;
    };
  } | null;
}

function parse(body: string): PollBody {
  return JSON.parse(body) as PollBody;
}

/** Todas las claves del body, a cualquier profundidad. */
function collectKeys(value: unknown, acc: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, acc);
    return acc;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      acc.push(key);
      collectKeys(nested, acc);
    }
  }
  return acc;
}

async function seedBranches(): Promise<void> {
  const [ar] = await app.db
    .insert(schema.branches)
    .values({
      name: "Mogotes",
      code: uniqueCode("TVAR"),
      country: "AR",
      timezone: AR_TZ,
    })
    .$returningId();
  const [es] = await app.db
    .insert(schema.branches)
    .values({
      name: "Barcelona",
      code: uniqueCode("TVES"),
      country: "ES",
      timezone: ES_TZ,
    })
    .$returningId();
  branchArId = ar.id;
  branchEsId = es.id;

  const [withVideo] = await app.db
    .insert(schema.exercises)
    .values({
      pattern: "TRACCION",
      category: "pull",
      exercise: "Dominadas",
      effort: "high",
      route: "OAP",
      videoUrl: VIDEO_KEY,
    })
    .$returningId();
  const [withoutVideo] = await app.db
    .insert(schema.exercises)
    .values({
      pattern: "EMPUJE",
      category: "push",
      exercise: "Flexiones",
      effort: "medium",
      route: "OAP",
      videoUrl: null,
    })
    .$returningId();
  exerciseWithVideoId = withVideo.id;
  exerciseWithoutVideoId = withoutVideo.id;
}

/**
 * Sesion del dia con un bloque por rol. El primer ejercicio "main" de cada
 * bloque usa el ejercicio CON video y el segundo el que no lo tiene, para poder
 * afirmar las dos ramas de `assembleVideoUrl` en el mismo payload.
 */
async function seedSession(opts: {
  week: number;
  day: string;
  level: string;
  roles: string[];
  status?: string;
  sessionMode?: string;
  mainExercises?: number;
}): Promise<void> {
  const [session] = await app.db
    .insert(schema.sessions)
    .values({
      dayId: `W${opts.week}-${opts.day}-${opts.level}`,
      week: opts.week,
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
        // INITIUM en tabata (formato que dicta las reps) y el resto en AMRAP:
        // deja las dos ramas del `rx` cubiertas.
        formatParams:
          role === "INITIUM"
            ? { type: "tabata", workSeconds: 20, restSeconds: 10, rounds: 8 }
            : { type: "amrap", minutes: 10 },
        exerciseCount: 1,
        sortOrder: i,
      })
      .$returningId();

    const mains = role === "INITIUM" ? 1 : (opts.mainExercises ?? 2);
    for (let e = 0; e < mains; e++) {
      await app.db.insert(schema.sessionPrescriptions).values({
        blockId: block.id,
        exerciseId: e === 0 ? exerciseWithVideoId : exerciseWithoutVideoId,
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
    await app.db.insert(schema.sessionPrescriptions).values({
      blockId: block.id,
      exerciseId: exerciseWithVideoId,
      exerciseName: "Movilidad de hombro",
      contraction: "ISO",
      reps: 0,
      seconds: 20,
      rest: 0,
      sortOrder: 999,
      exerciseType: "mobility",
    });
  }
}

async function writeState(opts: {
  branchId: number;
  classDate: string;
  blockRole: string;
  level: string;
  exerciseIndex?: number;
  screen?: string;
  timerStatus?: string;
  timerStartedAt?: Date | null;
  pausedAt?: Date | null;
  pausedAccumMs?: number;
}): Promise<void> {
  await app.db.insert(schema.tvClassState).values({
    branchId: opts.branchId,
    classDate: opts.classDate,
    blockRole: opts.blockRole,
    level: opts.level,
    exerciseIndex: opts.exerciseIndex ?? 0,
    screen: opts.screen ?? "class",
    timerStatus: opts.timerStatus ?? "idle",
    timerStartedAt: opts.timerStartedAt ?? null,
    pausedAt: opts.pausedAt ?? null,
    pausedAccumMs: opts.pausedAccumMs ?? 0,
  });
}

async function setDayMode(dayOfWeek: number, mode: string): Promise<void> {
  await app.db
    .delete(schema.dayModes)
    .where(eq(schema.dayModes.dayOfWeek, dayOfWeek));
  await app.db.insert(schema.dayModes).values({ dayOfWeek, sessionMode: mode });
}

async function readLastSeen(deviceId: number): Promise<Date | null> {
  const [row] = await app.db
    .select({ lastSeenAt: schema.tvDevices.lastSeenAt })
    .from(schema.tvDevices)
    .where(eq(schema.tvDevices.id, deviceId));
  return row?.lastSeenAt ?? null;
}

/**
 * El sello de `last_seen_at` es fire-and-forget (no le cobra latencia al poll),
 * asi que puede aterrizar despues de la respuesta: se espera con reintentos en
 * vez de asumir que ya esta escrito.
 */
async function waitForLastSeen(deviceId: number): Promise<Date | null> {
  for (let i = 0; i < 40; i++) {
    const value = await readLastSeen(deviceId);
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return null;
}

beforeAll(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(TUESDAY);
  process.env.R2_PUBLIC_URL = VIDEO_BASE;
  app = await createTestApp();
});

afterAll(async () => {
  vi.useRealTimers();
  if (ORIGINAL_R2_PUBLIC_URL === undefined) {
    delete process.env.R2_PUBLIC_URL;
  } else {
    process.env.R2_PUBLIC_URL = ORIGINAL_R2_PUBLIC_URL;
  }
  await app.close();
});

beforeEach(async () => {
  vi.setSystemTime(TUESDAY);
  await cleanAllTestData(app);
  await seedBranches();
  await setDayMode(2, "regular");
  await setDayMode(6, "rom");
});

describe("GET /api/tv/state — autenticacion del dispositivo (D-03)", () => {
  it("sin header Device, o con un token inventado, responde 401", async () => {
    const sinHeader = await app.inject({ method: "GET", url: STATE_URL });
    expect(sinHeader.statusCode).toBe(401);

    const inventado = await poll("token-que-no-existe-1234567890");
    expect(inventado.statusCode).toBe(401);
    expect(inventado.body).not.toContain("serverNow");
  });

  it("un dispositivo revocado (is_active = false) pierde el poll: 401", async () => {
    const device = await createDevice(branchArId);

    // Con el dispositivo activo el poll anda.
    expect((await poll(device.token)).statusCode).toBe(200);

    await app.db
      .update(schema.tvDevices)
      .set({ isActive: false, revokedAt: new Date() })
      .where(eq(schema.tvDevices.id, device.id));

    // El token no expira nunca: lo unico que lo corta es la revocacion, y el
    // 401 es la señal de "volve a la pantalla de vinculacion".
    const res = await poll(device.token);
    expect(res.statusCode).toBe(401);
    expect(res.body).not.toContain("serverNow");
  });
});

describe("GET /api/tv/state — reposo silencioso (D-09)", () => {
  it("sin fila de estado devuelve idle y NINGUNA clave de error o mensaje", async () => {
    const device = await createDevice(branchArId);

    const res = await poll(device.token);
    expect(res.statusCode).toBe(200);

    const body = parse(res.body);
    expect(body.screen).toBe("idle");
    expect(body.class).toBeNull();
    // El conjunto de claves es exacto: no alcanza con que no haya un campo
    // `error` puntual, no puede haber NADA que le cuente a un socio parado
    // frente al televisor la cocina interna del gimnasio.
    expect(Object.keys(body).sort()).toEqual([
      "branch",
      "class",
      "screen",
      "serverNow",
    ]);
    expect(
      collectKeys(body).filter((key) => /error|message/i.test(key)),
    ).toEqual([]);
    // El reloj de la sede sigue viajando: el TV muestra hora y fecha.
    expect(body.branch.name).toBe("MOGOTES");
    expect(body.branch.dateLabel).toBe("MARTES · SEMANA 1");
    expect(body.branch.utcOffsetMinutes).toBe(-180);
  });

  it("una sesion en draft es indistinguible de no tener clase", async () => {
    await seedSession({
      week: 1,
      day: "martes",
      level: "alfa",
      roles: ["INITIUM", "NUCLEUS"],
      status: "draft",
    });
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "NUCLEUS",
      level: "alfa",
    });
    const device = await createDevice(branchArId);

    const body = parse((await poll(device.token)).body);
    expect(body.screen).toBe("idle");
    expect(body.class).toBeNull();
    expect(
      collectKeys(body).filter((key) => /error|message/i.test(key)),
    ).toEqual([]);
  });
});

describe("GET /api/tv/state — el bloque en vivo", () => {
  beforeEach(async () => {
    await seedSession({
      week: 1,
      day: "martes",
      level: "alfa",
      roles: ["INITIUM", "NUCLEUS", "EPIKOS"],
      mainExercises: 2,
    });
    await seedSession({
      week: 1,
      day: "martes",
      level: "delta",
      roles: ["INITIUM", "NUCLEUS"],
    });
  });

  it("devuelve roster canonico, prescripciones con rx y videoUrl, y timer", async () => {
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "NUCLEUS",
      level: "alfa",
      exerciseIndex: 1,
      timerStatus: "running",
      timerStartedAt: new Date("2026-02-24T14:58:00.000Z"),
    });
    const device = await createDevice(branchArId);

    const res = await poll(device.token);
    expect(res.statusCode).toBe(200);
    // El poll es estado vivo: nadie puede servir una copia guardada.
    expect(res.headers["cache-control"]).toBe("no-store");

    const body = parse(res.body);
    expect(body.screen).toBe("class");
    const cls = body.class!;
    expect(cls.mode).toBe("regular");
    expect(cls.levels).toEqual(["alfa", "delta"]);
    expect(cls.level).toBe("alfa");
    expect(cls.levelLabel).toBe("NIVEL α");
    // Orden canonico por ROL, y `blockIndex` derivado de ese roster.
    expect(cls.blocks.map((b) => b.role)).toEqual([
      "INITIUM",
      "NUCLEUS",
      "EPIKOS",
    ]);
    expect(cls.blocks[0].shared).toBe(true);
    expect(cls.blockRole).toBe("NUCLEUS");
    expect(cls.blockIndex).toBe(1);
    expect(cls.title).toBe("NUCLEUS · AMRAP - 10 min");
    expect(cls.listHeader).toBe("NIVEL α | OAP 70%");
    expect(cls.mobilityLine).toBe('MOVILIDAD · Movilidad de hombro 20"');
    expect(cls.exerciseIndex).toBe(1);

    expect(cls.exercises).toHaveLength(2);
    expect(cls.exercises[0].rx).toBe("8-10 CON.");
    expect(cls.exercises[0].videoUrl).toBe(`${VIDEO_BASE}/${VIDEO_KEY}`);
    // Un ejercicio sin video no rompe la lista: el kiosco pinta el placeholder.
    expect(cls.exercises[1].videoUrl).toBeNull();

    // El timer viaja como spec + sello de arranque, jamas como segundos
    // restantes: el transcurrido lo calcula cada TV contra su reloj corregido.
    expect(cls.timer.spec).toEqual({ kind: "countdown", totalMs: 600_000 });
    expect(cls.timer.status).toBe("running");
    expect(cls.timer.soundEnabled).toBe(false);
  });

  it("Pitfall 9: el sello de arranque conserva los milisegundos", async () => {
    const startedAt = new Date("2026-02-24T14:58:12.345Z");
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "NUCLEUS",
      level: "alfa",
      timerStatus: "running",
      timerStartedAt: startedAt,
    });
    const device = await createDevice(branchArId);

    const cls = parse((await poll(device.token)).body).class!;
    // Con un timestamp a segundos MySQL redondearia y el timer arrancaria hasta
    // 1s corrido — sobre un tabata de 20s es 5% de error, visible contra el
    // cronometro del profe.
    expect(cls.timer.startedAt).toBe(startedAt.getTime());
    expect(cls.timer.startedAt! % 1000).toBe(345);
  });

  it("D-17: la pausa viaja como pausedAt + pausedAccumMs, sin reescribir el arranque", async () => {
    const startedAt = new Date("2026-02-24T14:50:00.000Z");
    const pausedAt = new Date("2026-02-24T14:55:30.500Z");
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "NUCLEUS",
      level: "alfa",
      timerStatus: "paused",
      timerStartedAt: startedAt,
      pausedAt,
      pausedAccumMs: 4321,
    });
    const device = await createDevice(branchArId);

    const timer = parse((await poll(device.token)).body).class!.timer;
    expect(timer.status).toBe("paused");
    expect(timer.startedAt).toBe(startedAt.getTime());
    expect(timer.pausedAt).toBe(pausedAt.getTime());
    // El acumulado de pausas anteriores sobrevive: reanudar varias veces no
    // puede hacer derivar el reloj.
    expect(timer.pausedAccumMs).toBe(4321);
  });

  it("Pattern 6: serverNow viaja en todos los polls y es el reloj del server", async () => {
    const device = await createDevice(branchArId);

    const before = Date.now();
    const body = parse((await poll(device.token)).body);
    const after = Date.now();

    expect(body.serverNow).toBeGreaterThanOrEqual(before);
    expect(body.serverNow).toBeLessThanOrEqual(after);
    expect(Math.abs(body.serverNow - Date.now())).toBeLessThan(5000);
  });

  it("D-04: dos televisores de la misma sede ven exactamente el mismo estado", async () => {
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "NUCLEUS",
      level: "alfa",
      exerciseIndex: 1,
    });
    const salaGrande = await createDevice(branchArId, { name: "TV sala" });
    const vestuario = await createDevice(branchArId, { name: "TV vestuario" });

    const uno = parse((await poll(salaGrande.token)).body);
    const otro = parse((await poll(vestuario.token)).body);

    // Lo unico que puede diferir es el sello del server (son dos requests).
    const { serverNow: _uno, ...restoUno } = uno;
    const { serverNow: _otro, ...restoOtro } = otro;
    expect(restoOtro).toEqual(restoUno);
  });

  it("T-164-31: un branchId en la query NO cambia la sede que se lee", async () => {
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "NUCLEUS",
      level: "alfa",
    });
    // Clase distinta iniciada en Barcelona.
    await writeState({
      branchId: branchEsId,
      classDate: TUESDAY_DATE,
      blockRole: "EPIKOS",
      level: "alfa",
    });
    const device = await createDevice(branchArId);

    const body = parse(
      (await poll(device.token, `${STATE_URL}?branchId=${branchEsId}`)).body,
    );

    // La sede sale de la FILA del dispositivo: el parametro es ruido.
    expect(body.branch.name).toBe("MOGOTES");
    expect(body.class!.blockRole).toBe("NUCLEUS");
  });
});

describe("GET /api/tv/state — caducidad del estado en la TZ de la sede (D-07)", () => {
  beforeEach(async () => {
    await seedSession({
      week: 1,
      day: "martes",
      level: "alfa",
      roles: ["INITIUM", "NUCLEUS"],
    });
    await seedSession({
      week: 1,
      day: "miercoles",
      level: "alfa",
      roles: ["INITIUM", "EPIKOS"],
    });
    await setDayMode(3, "regular");
  });

  it("un estado con class_date de ayer amanece en reposo, sin cron que lo borre", async () => {
    await writeState({
      branchId: branchArId,
      classDate: MONDAY_DATE,
      blockRole: "NUCLEUS",
      level: "alfa",
    });
    const device = await createDevice(branchArId);

    const body = parse((await poll(device.token)).body);
    expect(body.screen).toBe("idle");
    expect(body.class).toBeNull();

    // La fila sigue en la DB: caduca al LEER, se sobreescribe al iniciar clase.
    const rows = await app.db
      .select()
      .from(schema.tvClassState)
      .where(eq(schema.tvClassState.branchId, branchArId));
    expect(rows).toHaveLength(1);
  });

  it("el borde del dia cae en otro instante en Europe/Madrid que en Argentina", async () => {
    // Mismo estado del martes en las dos sedes, y el MISMO instante para las
    // dos: 23:30 UTC. En Barcelona ya es miercoles, asi que ese estado vencio.
    await writeState({
      branchId: branchArId,
      classDate: TUESDAY_DATE,
      blockRole: "NUCLEUS",
      level: "alfa",
    });
    await writeState({
      branchId: branchEsId,
      classDate: TUESDAY_DATE,
      blockRole: "NUCLEUS",
      level: "alfa",
    });
    const tvMogotes = await createDevice(branchArId);
    const tvBarcelona = await createDevice(branchEsId);

    vi.setSystemTime(DAY_BORDER);

    const argentina = parse((await poll(tvMogotes.token)).body);
    const espana = parse((await poll(tvBarcelona.token)).body);

    // En Mar del Plata todavia son las 20:30 del martes: la clase sigue viva.
    expect(argentina.screen).toBe("class");
    expect(argentina.branch.dateLabel).toBe("MARTES · SEMANA 1");
    expect(argentina.branch.utcOffsetMinutes).toBe(-180);

    // En Barcelona ya es miercoles 00:30: el estado del martes esta vencido y
    // el televisor amanece en reposo. Si la fecha se calculara en UTC o con la
    // TZ del server, las dos sedes verian lo mismo — y una estaria equivocada.
    expect(espana.screen).toBe("idle");
    expect(espana.class).toBeNull();
    expect(espana.branch.dateLabel).toBe("MIÉRCOLES · SEMANA 1");
    expect(espana.branch.utcOffsetMinutes).toBe(60);
  });
});

describe("GET /api/tv/state — sabado ROM (D-23)", () => {
  it("dos tiers rotulados BASICO/AVANZADO y roles por zona del cuerpo", async () => {
    vi.setSystemTime(SATURDAY);
    for (const level of ["alfa", "delta"]) {
      await seedSession({
        week: 1,
        day: "sabado",
        level,
        roles: ["INITIUM", "ROM_LOWER", "ROM_CORE", "ROM_UPPER"],
        sessionMode: "rom",
      });
    }
    await writeState({
      branchId: branchArId,
      classDate: SATURDAY_DATE,
      blockRole: "ROM_LOWER",
      level: "alfa",
    });
    const device = await createDevice(branchArId);

    const cls = parse((await poll(device.token)).body).class!;
    expect(cls.mode).toBe("rom");
    // El sabado NO existe la escalera alfa/delta/sigma/kairos.
    expect(cls.levels).toEqual(["alfa", "delta"]);
    expect(cls.levelLabel).toBe("BÁSICO");
    expect(cls.blocks.map((b) => b.role)).toEqual([
      "INITIUM",
      "ROM_LOWER",
      "ROM_CORE",
      "ROM_UPPER",
    ]);
    expect(cls.blocks[1].title).toContain("TREN INFERIOR");

    // El tier avanzado se rotula AVANZADO, no con un simbolo de nivel.
    await app.db
      .update(schema.tvClassState)
      .set({ level: "delta" })
      .where(eq(schema.tvClassState.branchId, branchArId));
    const avanzado = parse((await poll(device.token)).body).class!;
    expect(avanzado.levelLabel).toBe("AVANZADO");
  });
});

describe("GET /api/tv/state — heartbeat del dispositivo (D-05)", () => {
  it("el poll sella last_seen_at del televisor que llamo, y solo de ese", async () => {
    const queLlama = await createDevice(branchArId, { name: "TV sala" });
    const queNoLlama = await createDevice(branchArId, { name: "TV vestuario" });

    expect(await readLastSeen(queLlama.id)).toBeNull();
    expect(await readLastSeen(queNoLlama.id)).toBeNull();

    expect((await poll(queLlama.token)).statusCode).toBe(200);

    // Alimenta el "visto hace X" del panel de dispositivos del staff.
    expect(await waitForLastSeen(queLlama.id)).not.toBeNull();
    expect(await readLastSeen(queNoLlama.id)).toBeNull();
  });
});

describe("POST /api/tv/client-log — telemetria del kiosco", () => {
  it("acepta un reporte del televisor y responde 204 sin cuerpo", async () => {
    const device = await createDevice(branchArId);

    const res = await app.inject({
      method: "POST",
      url: CLIENT_LOG_URL,
      headers: { authorization: `Device ${device.token}` },
      payload: {
        level: "error",
        message: "no se pudo cargar el video del ejercicio 3",
        context: "kiosk/video",
      },
    });

    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");
  });

  it("sin device token no se puede escribir en los logs del servidor (401)", async () => {
    const res = await app.inject({
      method: "POST",
      url: CLIENT_LOG_URL,
      payload: { level: "warn", message: "hola" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("un mensaje desmedido lo frena el schema (400), no el handler", async () => {
    const device = await createDevice(branchArId);

    const res = await app.inject({
      method: "POST",
      url: CLIENT_LOG_URL,
      headers: { authorization: `Device ${device.token}` },
      payload: { level: "warn", message: "x".repeat(5000) },
    });

    expect(res.statusCode).toBe(400);
  });

  it("rechaza niveles fuera del enum y descarta los campos no declarados", async () => {
    const device = await createDevice(branchArId);
    const headers = { authorization: `Device ${device.token}` };

    const nivelInventado = await app.inject({
      method: "POST",
      url: CLIENT_LOG_URL,
      headers,
      payload: { level: "fatal", message: "algo" },
    });
    expect(nivelInventado.statusCode).toBe(400);

    // Un kiosco no puede inflar el log con estructuras arbitrarias. Con
    // `additionalProperties: false`, el ajv de Fastify (removeAdditional) BORRA
    // el campo extra antes de que llegue al handler en vez de rechazar el
    // request: la mitigacion se cumple igual (nada no declarado se loguea) y el
    // TV no entra en un loop de reintentos por un campo de mas.
    const campoExtra = await app.inject({
      method: "POST",
      url: CLIENT_LOG_URL,
      headers,
      payload: { level: "warn", message: "algo", stack: "x".repeat(2000) },
    });
    expect(campoExtra.statusCode).toBe(204);
  });

  it("un mensaje con HTML se acepta y no llega crudo al log", async () => {
    const device = await createDevice(branchArId);

    const res = await app.inject({
      method: "POST",
      url: CLIENT_LOG_URL,
      headers: { authorization: `Device ${device.token}` },
      payload: {
        level: "warn",
        message: "<script>alert(1)</script> fallo el poll",
        context: "<b>kiosk</b>",
      },
    });
    expect(res.statusCode).toBe(204);

    // Lo que efectivamente se escribe pasa por el saneo. Se afirma sobre la
    // funcion en vez de sobre el stream de pino: por este canal no viaja NADA
    // que sea HTML, asi que un agregador de logs que renderice sin escapar no
    // puede recibir un tag desde una pantalla colgada en una pared.
    expect(sanitizeClientLogText("<script>alert(1)</script> fallo", 500)).toBe(
      "scriptalert(1)/script fallo",
    );
    expect(sanitizeClientLogText("x".repeat(900), 500)).toHaveLength(500);
  });
});
