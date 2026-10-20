/**
 * Fase 197 Plan 09 (D-14, T-197-25) — aislamiento de tenant de la canasta de
 * bloques libres y de su cierre:
 *
 *   GET  /api/sessions/free-blocks
 *   GET  /api/sessions/free-blocks/:blockId
 *   POST /api/sessions/free-blocks/complete
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * Las tres rutas viven dentro de `sessionRoutes`, o sea detrás del guard de
 * módulo `templo-training` (`moduleScope`), y en `test/tenant-manifest.ts` son
 * `templo-module`. Para ejercer el aislamiento de tenant sobre ellas el
 * gimnasio 2 necesita el módulo PRENDIDO (`setModuleFlag`), igual que
 * `iso-03-programs-modulo.test.ts` hizo con `program-addons`: sin el flag,
 * todo caso pegaría contra el 404 del guard y no probaría nada del filtro por
 * tenant.
 *
 * Qué prueba:
 *   (a) el socio del gimnasio 2 lista la canasta y NO ve ningún bloque de
 *       El Templo (y sí los suyos);
 *   (b) GET de un blockId de El Templo con token del gimnasio 2 da 404;
 *   (c) POST complete de un blockId de El Templo da 404 y no escribe filas;
 *   (d) POST complete de un bloque propio guarda la fila con
 *       `tenant_id = TENANT_DOS`;
 *   (e) control positivo: el socio de El Templo ve y cierra los suyos;
 *   (f) con `templo-training` OFF para el gimnasio 2, las tres rutas dan 404
 *       del guard (se prueba primero que con el flag ON la misma request
 *       anda, para que el 404 sea del guard y no de otra cosa).
 *
 * `sessions.day_id` es UNIQUE global: los bloques del gimnasio 2 salen de otro
 * día de la semana (lunes) que los de El Templo (martes), con el mismo nivel,
 * para que el único filtro que los separe sea el tenant.
 *
 * NO ESTÁ EN NINGÚN `ARCHIVOS_BATERIA`
 * ------------------------------------
 * A propósito, mismo criterio que `iso-03-programs-modulo.test.ts`: esas
 * baterías con su gate de conteo son de rutas `tenant-scoped`; estas tres son
 * `templo-module` y su cobertura de manifiesto la lleva
 * `iso-01-manifiesto.test.ts`. Este archivo prueba el aislamiento como caso
 * independiente, sin inscribirse en ningún gate de conteo.
 *
 * Reloj: "hoy" se fija (solo `Date`) en el último miércoles a las 15:00 UTC,
 * acotado a la semana 51 del plan, DESPUÉS de sembrar el gimnasio 2 y ANTES de
 * loguear a los socios; se restaura en `afterEach`.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-free-blocks.test.ts --hookTimeout=250000
 *
 * @see test/tenancy/iso-03-programs-modulo.test.ts — modelo de este archivo
 * @see test/sessions/_free-blocks-fixtures.ts — fábricas con `ctx`
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
import { and, eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { createTestApp, cleanAllTestData } from "../helpers";
import { todayInTz } from "../../src/modules/shared/date-utils";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { DAY_NAME_TO_NUMBER } from "../../src/modules/shared/training-constants";
import {
  dateToDayName,
  dateToWeekNumber,
  mondayOf,
  shiftDate,
  weekDayToDate,
} from "../../src/modules/shared/week-dates";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import { setModuleFlag, restoreTemploFlags } from "../fixtures/module-flags";
import {
  createPresencialMember,
  dayIdFor,
  seedExercise,
  seedSession,
} from "../sessions/_free-blocks-fixtures";

const AR_TZ = "America/Argentina/Buenos_Aires";
const LEVEL = "sigma";
const MIN = 60_000;
const BASE = "/api/sessions/free-blocks";

const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };
const CTX_DOS: TenantContext = { tenantId: TENANT_DOS };

interface ListPayload {
  items: { blockId: string }[];
  total: number;
}

interface Socio {
  id: number;
  token: string;
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

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let templo: Socio;
let dos: Socio;
let exerciseSeq = 0;
// Bloque de El Templo (martes) y bloque del gimnasio 2 (lunes).
let blockTemplo: string;
let blockDos: string;
let exerciseTemplo: number;
let exerciseDos: number;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);

  // El Templo con los 4 flags ON y el gimnasio 2 con templo-training prendido:
  // sin esto, todo caso pegaría contra el 404 del guard en vez de contra el
  // aislamiento de tenant que este archivo existe para probar.
  await restoreTemploFlags(app);
  await setModuleFlag(app, TENANT_DOS, "templo-training", true);

  // Reloj fijo ANTES de loguear a los socios.
  const wednesday = targetWednesday();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${wednesday}T15:00:00Z`));
  const today = todayInTz(AR_TZ);

  // day_modes no se limpia entre archivos: el miércoles de El Templo tiene que
  // ser regular. El gimnasio 2 no siembra day_modes (sin fila = regular y no
  // deja nada que limpiar contra el FK de tenants).
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

  templo = await createPresencialMember(app, { level: LEVEL });
  // Socio del gimnasio 2 con plan presencial activo de SU tenant y su sede.
  dos = await createPresencialMember(app, {
    level: LEVEL,
    ctx: CTX_DOS,
    branchId: gym2.branchId,
  });

  const martes = shiftDate(mondayOf(today), 1);
  const lunes = mondayOf(today);
  exerciseTemplo = await ex(CTX_TEMPLO);
  exerciseDos = await ex(CTX_DOS);
  [blockTemplo] = await seed(CTX_TEMPLO, martes, exerciseTemplo);
  [blockDos] = await seed(CTX_DOS, lunes, exerciseDos);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  vi.useRealTimers();
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  // No filtrar flags al worker (isolate: false): `limpiarSegundoGimnasio` ya
  // borra los del gimnasio 2; los de El Templo vuelven a su default ON.
  await restoreTemploFlags(app);
  await app.close();
});

// ─── helpers ─────────────────────────────────────────────────────────────

/** Ejercicio nuevo del gimnasio `ctx`, con nombre único. */
async function ex(ctx: TenantContext): Promise<number> {
  exerciseSeq += 1;
  return seedExercise(app, {
    name: `Ejercicio 197-09 ${exerciseSeq}`,
    category: "PECHO",
    ctx,
  });
}

/** Sesión aprobada de `date` con un bloque NUCLEUS del gimnasio `ctx`. */
async function seed(
  ctx: TenantContext,
  date: string,
  exerciseId: number,
): Promise<string[]> {
  const { blockIds } = await seedSession(app, {
    dayId: dayIdFor(date, LEVEL),
    week: dateToWeekNumber(date),
    day: dateToDayName(date),
    levelGroup: "sigma",
    ctx,
    blocks: [{ role: "NUCLEUS", route: "OAP", exerciseIds: [exerciseId] }],
  });
  return blockIds;
}

async function list(socio: Socio) {
  const res = await app.inject({
    method: "GET",
    url: BASE,
    headers: { authorization: `Bearer ${socio.token}` },
  });
  return { status: res.statusCode, raw: res.body };
}

async function getOne(socio: Socio, blockId: string) {
  const res = await app.inject({
    method: "GET",
    url: `${BASE}/${blockId}`,
    headers: { authorization: `Bearer ${socio.token}` },
  });
  return {
    status: res.statusCode,
    body: JSON.parse(res.body) as { error?: string },
  };
}

async function complete(socio: Socio, blockId: string, minutes: number) {
  const res = await app.inject({
    method: "POST",
    url: `${BASE}/complete`,
    headers: { authorization: `Bearer ${socio.token}` },
    payload: {
      blockId,
      startedAt: new Date(Date.now() - minutes * MIN).toISOString(),
      exercisesCompleted: [],
    },
  });
  return {
    status: res.statusCode,
    body: JSON.parse(res.body) as { error?: string; completionId?: number },
  };
}

function blockIdsOf(raw: string): string[] {
  return (JSON.parse(raw) as ListPayload).items.map((i) => i.blockId);
}

/** Filas de extra_blocks_completed de un gimnasio, filtradas por su tenant. */
async function filas(ctx: TenantContext) {
  return app.db
    .select({
      id: schema.extraBlocksCompleted.id,
      tenantId: schema.extraBlocksCompleted.tenantId,
      userId: schema.extraBlocksCompleted.userId,
      sourceBlockId: schema.extraBlocksCompleted.sourceBlockId,
    })
    .from(schema.extraBlocksCompleted)
    .where(tenantWhere(schema.extraBlocksCompleted, ctx));
}

/** Apaga templo-training para el gimnasio 2 durante `fn` y lo restaura. */
async function conModuloApagado(fn: () => Promise<void>): Promise<void> {
  await setModuleFlag(app, TENANT_DOS, "templo-training", false);
  try {
    await fn();
  } finally {
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);
  }
}

// ─── casos ───────────────────────────────────────────────────────────────

describe("GET /api/sessions/free-blocks", () => {
  it("aislamiento: el socio del gimnasio 2 lista sus bloques y NINGUNO de El Templo", async () => {
    const res = await list(dos);
    expect(res.status, res.raw).toBe(200);
    const ids = blockIdsOf(res.raw);
    expect(
      ids,
      `GET ${BASE}: el gimnasio ${TENANT_DOS} ve un bloque de El Templo (${TENANT_TEMPLO}).`,
    ).not.toContain(blockTemplo);
    expect(ids).toEqual([blockDos]);
  });

  it("control positivo: el socio de El Templo ve sus bloques y ninguno del gimnasio 2", async () => {
    const res = await list(templo);
    expect(res.status, res.raw).toBe(200);
    const ids = blockIdsOf(res.raw);
    expect(ids).toEqual([blockTemplo]);
    expect(ids).not.toContain(blockDos);
  });

  it("guard: con templo-training OFF para el gimnasio 2 da 404 del guard", async () => {
    // Con el flag ON la misma request anda: el 404 de abajo es del guard.
    expect((await list(dos)).status).toBe(200);
    await conModuloApagado(async () => {
      const res = await list(dos);
      expect(
        res.status,
        `GET ${BASE}: con el módulo OFF el guard tiene que cortar. ${res.raw}`,
      ).toBe(404);
    });
  });
});

describe("GET /api/sessions/free-blocks/:blockId", () => {
  it("aislamiento: un blockId de El Templo con token del gimnasio 2 da 404", async () => {
    const res = await getOne(dos, blockTemplo);
    expect(
      res.status,
      `GET ${BASE}/:blockId: el gimnasio ${TENANT_DOS} abrió un bloque de El Templo.`,
    ).toBe(404);
    expect(res.body.error).toBe("Bloque no disponible");
  });

  it("control positivo: cada socio abre su propio bloque", async () => {
    expect((await getOne(dos, blockDos)).status).toBe(200);
    expect((await getOne(templo, blockTemplo)).status).toBe(200);
    // Y el cruce inverso también es 404.
    expect((await getOne(templo, blockDos)).status).toBe(404);
  });

  it("guard: con templo-training OFF para el gimnasio 2, incluso su propio bloque da 404", async () => {
    expect((await getOne(dos, blockDos)).status).toBe(200);
    await conModuloApagado(async () => {
      const res = await getOne(dos, blockDos);
      expect(
        res.status,
        `GET ${BASE}/:blockId: con el módulo OFF el guard tiene que cortar.`,
      ).toBe(404);
    });
  });
});

describe("POST /api/sessions/free-blocks/complete", () => {
  it("aislamiento: cerrar un blockId de El Templo con token del gimnasio 2 da 404 y no escribe filas", async () => {
    const res = await complete(dos, blockTemplo, 5);
    expect(
      res.status,
      `POST ${BASE}/complete: el gimnasio ${TENANT_DOS} cerró un bloque de El Templo.`,
    ).toBe(404);
    expect(await filas(CTX_TEMPLO)).toHaveLength(0);
    expect(await filas(CTX_DOS)).toHaveLength(0);
  });

  it("un bloque propio se guarda con el tenant_id del gimnasio 2", async () => {
    const res = await complete(dos, blockDos, 5);
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const propias = await filas(CTX_DOS);
    expect(propias).toHaveLength(1);
    expect(propias[0].tenantId).toBe(TENANT_DOS);
    expect(propias[0].userId).toBe(dos.id);
    expect(propias[0].sourceBlockId).toBe(blockDos);
    expect(await filas(CTX_TEMPLO)).toHaveLength(0);
  });

  it("control positivo: el socio de El Templo cierra el suyo y la fila queda en El Templo", async () => {
    const res = await complete(templo, blockTemplo, 5);
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const propias = await filas(CTX_TEMPLO);
    expect(propias).toHaveLength(1);
    expect(propias[0].tenantId).toBe(TENANT_TEMPLO);
    expect(propias[0].userId).toBe(templo.id);
    expect(await filas(CTX_DOS)).toHaveLength(0);
  });

  it("guard: con templo-training OFF para el gimnasio 2, cerrar su propio bloque da 404 y no escribe", async () => {
    // Con el flag ON el mismo cierre anda (y se limpia para medir el OFF).
    expect((await complete(dos, blockDos, 5)).status).toBe(200);
    await app.db
      .delete(schema.extraBlocksCompleted)
      .where(tenantWhere(schema.extraBlocksCompleted, CTX_DOS));

    await conModuloApagado(async () => {
      const res = await complete(dos, blockDos, 5);
      expect(
        res.status,
        `POST ${BASE}/complete: con el módulo OFF el guard tiene que cortar antes del service.`,
      ).toBe(404);
    });
    expect(await filas(CTX_DOS)).toHaveLength(0);
  });
});
