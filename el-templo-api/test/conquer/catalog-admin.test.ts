/**
 * Fase 201 Plan 14 (D-14, D-20, §8.1, T-201-49..52): edición del catálogo de
 * Conquer desde el admin.
 *
 *   - GET  /api/admin/conquer/catalog
 *   - POST /api/admin/conquer/ladders/:ladderId/rungs
 *   - PUT  /api/admin/conquer/rungs/:rungId
 *   - PUT  /api/admin/conquer/ladders/:ladderId/order
 *   - PUT  /api/admin/conquer/exercises/:exerciseId
 *   - PUT  /api/admin/conquer/template-days/:id
 *
 * El catálogo (escaleras, peldaños, ejercicios, plantillas) lo siembra la
 * migración 0292 y `cleanAllTestData` NO lo limpia: se guarda una foto en
 * `beforeAll` y `afterEach` la restaura (filas editadas y filas de más). Las
 * escaleras "de prueba" (`test_<sufijo>`) se insertan en cada test.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, asc, eq, inArray } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { cleanAllTestData, createTestApp } from "../helpers";
import { clearModuleFlags, setModuleFlag } from "../fixtures/module-flags";
import {
  limpiarSegundoGimnasio,
  seedSecondTenant,
  TENANT_DOS,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import {
  createActiveConquerMember,
  createConquerStaff,
  fetchToday,
  readConquerSteps,
  TEMPLO_CTX,
} from "./_helpers";

const BASE = "/api/admin/conquer";
const GYM2_CTX = { tenantId: TENANT_DOS };

interface RungBody {
  id: number;
  code: string;
  name: string;
  position: number;
  unilateral: boolean;
  isActive: boolean;
  inUse: boolean;
}

interface LadderBody {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  rungs: RungBody[];
}

interface StartStepBody {
  step: string;
  rung: string;
  mode: string;
}

interface ExerciseBody {
  id: number;
  code: string;
  name: string;
  ladderId: number;
  ladderCode: string;
  holdLadderId: number | null;
  holdLadderCode: string | null;
  brazosRectos: boolean;
  unit: string;
  muscles: { zone: string; role: string }[];
  startSteps: StartStepBody[];
  startStepsNovillo: StartStepBody[];
  startStepsTernero: StartStepBody[];
  isActive: boolean;
}

interface TemplateDayBody {
  id: number;
  daysCount: number;
  dayKey: string;
  label: string;
  finisherText: string;
  exerciseCodes: string[];
  openingComboKey: string | null;
}

interface CatalogBody {
  ladders: LadderBody[];
  exercises: ExerciseBody[];
  templateDays: TemplateDayBody[];
  zones: { slug: string; label: string }[];
}

interface ErrorBody {
  error: string;
  code?: string;
}

type SeedRung = typeof schema.conquerRungs.$inferSelect;
type SeedExercise = typeof schema.conquerExercises.$inferSelect;
type SeedDay = typeof schema.conquerTemplateDays.$inferSelect;

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let adminToken: string;
let seed: {
  ladderIds: number[];
  rungs: SeedRung[];
  exercises: SeedExercise[];
  days: SeedDay[];
};

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function call(
  method: "GET" | "POST" | "PUT",
  url: string,
  token: string,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method,
    url: `${BASE}${url}`,
    headers: auth(token),
    payload,
  });
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

// ── Foto y restauración del catálogo sembrado ───────────────────────

async function snapshotCatalog(): Promise<void> {
  const [ladders, rungs, exercises, days] = await Promise.all([
    app.db
      .select({ id: schema.conquerLadders.id })
      .from(schema.conquerLadders)
      .where(tenantWhere(schema.conquerLadders, TEMPLO_CTX)),
    app.db
      .select()
      .from(schema.conquerRungs)
      .where(tenantWhere(schema.conquerRungs, TEMPLO_CTX)),
    app.db
      .select()
      .from(schema.conquerExercises)
      .where(tenantWhere(schema.conquerExercises, TEMPLO_CTX)),
    app.db
      .select()
      .from(schema.conquerTemplateDays)
      .where(tenantWhere(schema.conquerTemplateDays, TEMPLO_CTX)),
  ]);
  seed = { ladderIds: ladders.map((l) => l.id), rungs, exercises, days };
}

async function restoreRungs(): Promise<void> {
  const now = await app.db
    .select()
    .from(schema.conquerRungs)
    .where(tenantWhere(schema.conquerRungs, TEMPLO_CTX));
  const seedIds = new Set(seed.rungs.map((r) => r.id));
  const extra = now.filter((r) => !seedIds.has(r.id)).map((r) => r.id);
  if (extra.length > 0) {
    await app.db
      .delete(schema.conquerRungs)
      .where(
        and(
          tenantWhere(schema.conquerRungs, TEMPLO_CTX),
          inArray(schema.conquerRungs.id, extra),
        ),
      );
  }
  for (const original of seed.rungs) {
    const current = now.find((r) => r.id === original.id);
    if (
      current &&
      current.name === original.name &&
      current.unilateral === original.unilateral &&
      current.isActive === original.isActive
    ) {
      continue;
    }
    await app.db
      .update(schema.conquerRungs)
      .set({
        name: original.name,
        unilateral: original.unilateral,
        isActive: original.isActive,
      })
      .where(
        and(
          tenantWhere(schema.conquerRungs, TEMPLO_CTX),
          eq(schema.conquerRungs.id, original.id),
        ),
      );
  }
}

async function restoreExercisesAndDays(): Promise<void> {
  for (const original of seed.exercises) {
    await app.db
      .update(schema.conquerExercises)
      .set({
        name: original.name,
        // 201-26: el editor ahora toca la marca y las 3 tablas de arranque.
        brazosRectos: original.brazosRectos,
        holdLadderId: original.holdLadderId,
        startSteps: original.startSteps,
        startStepsNovillo: original.startStepsNovillo,
        startStepsTernero: original.startStepsTernero,
        muscles: original.muscles,
      })
      .where(
        and(
          tenantWhere(schema.conquerExercises, TEMPLO_CTX),
          eq(schema.conquerExercises.id, original.id),
        ),
      );
  }
  for (const original of seed.days) {
    await app.db
      .update(schema.conquerTemplateDays)
      .set({
        label: original.label,
        finisherText: original.finisherText,
        exerciseCodes: original.exerciseCodes,
      })
      .where(
        and(
          tenantWhere(schema.conquerTemplateDays, TEMPLO_CTX),
          eq(schema.conquerTemplateDays.id, original.id),
        ),
      );
  }
}

async function restoreCatalog(): Promise<void> {
  await restoreRungs();
  await restoreExercisesAndDays();
  const ladders = await app.db
    .select({ id: schema.conquerLadders.id })
    .from(schema.conquerLadders)
    .where(tenantWhere(schema.conquerLadders, TEMPLO_CTX));
  const extra = ladders
    .map((l) => l.id)
    .filter((id) => !seed.ladderIds.includes(id));
  if (extra.length > 0) {
    await app.db
      .delete(schema.conquerLadders)
      .where(
        and(
          tenantWhere(schema.conquerLadders, TEMPLO_CTX),
          inArray(schema.conquerLadders.id, extra),
        ),
      );
  }
}

// ── Fábricas de datos de prueba ─────────────────────────────────────

async function insertTestLadder(): Promise<number> {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const [row] = await app.db
    .insert(schema.conquerLadders)
    .values(
      tenantValues(TEMPLO_CTX, {
        code: `test_${suffix}`,
        name: "Escalera de prueba",
        sortOrder: 99,
      }),
    )
    .$returningId();
  return row.id;
}

async function addRung(
  ladderId: number,
  name: string,
  extra: { unilateral?: boolean } = {},
) {
  return call("POST", `/ladders/${ladderId}/rungs`, adminToken, {
    name,
    unilateral: extra.unilateral ?? false,
  });
}

/** Escalera de prueba con 3 peldaños creados por la API: a, b, c (posiciones 0, 1, 2). */
async function ladderWithThreeRungs(): Promise<{
  ladderId: number;
  a: number;
  b: number;
  c: number;
}> {
  const ladderId = await insertTestLadder();
  await addRung(ladderId, "Alfa");
  await addRung(ladderId, "Beta");
  const res = await addRung(ladderId, "Gamma");
  const [a, b, c] = res.json<LadderBody>().rungs.map((r) => r.id);
  return { ladderId, a, b, c };
}

async function getCatalog(): Promise<CatalogBody> {
  const res = await call("GET", "/catalog", adminToken);
  expect(res.statusCode).toBe(200);
  return res.json<CatalogBody>();
}

/** Peldaño del catálogo por código de escalera y de peldaño. */
async function rungOf(ladderCode: string, rungCode: string): Promise<RungBody> {
  const rung = (await getCatalog()).ladders
    .find((l) => l.code === ladderCode)
    ?.rungs.find((r) => r.code === rungCode);
  if (!rung) throw new Error(`peldaño sin sembrar: ${ladderCode}/${rungCode}`);
  return rung;
}

async function exerciseByCode(code: string): Promise<ExerciseBody> {
  const found = (await getCatalog()).exercises.find((e) => e.code === code);
  if (!found) throw new Error(`ejercicio sin sembrar: ${code}`);
  return found;
}

async function dayByKey(
  daysCount: number,
  dayKey: string,
): Promise<TemplateDayBody> {
  const found = (await getCatalog()).templateDays.find(
    (d) => d.daysCount === daysCount && d.dayKey === dayKey,
  );
  if (!found) throw new Error(`día sin sembrar: ${daysCount}/${dayKey}`);
  return found;
}

async function rungRows(ladderId: number) {
  return app.db
    .select()
    .from(schema.conquerRungs)
    .where(
      and(
        tenantWhere(schema.conquerRungs, TEMPLO_CTX),
        eq(schema.conquerRungs.ladderId, ladderId),
      ),
    )
    .orderBy(asc(schema.conquerRungs.position));
}

// Catálogo del gimnasio 2 (para los 404 cruzados).
interface Gym2Catalog {
  ladderId: number;
  rungId: number;
  exerciseId: number;
  dayId: number;
}

async function insertGym2Catalog(): Promise<Gym2Catalog> {
  const [ladder] = await app.db
    .insert(schema.conquerLadders)
    .values(
      tenantValues(GYM2_CTX, { code: "g2_ladder", name: "Escalera del gym 2" }),
    )
    .$returningId();
  const [rung] = await app.db
    .insert(schema.conquerRungs)
    .values(
      tenantValues(GYM2_CTX, {
        ladderId: ladder.id,
        code: "g2_rung",
        name: "Peldaño del gym 2",
        position: 0,
      }),
    )
    .$returningId();
  const [exercise] = await app.db
    .insert(schema.conquerExercises)
    .values(
      tenantValues(GYM2_CTX, {
        code: "g2_exercise",
        name: "Ejercicio del gym 2",
        ladderId: ladder.id,
        unit: "reps" as const,
        muscles: [{ zone: "chest", role: "principal" as const }],
        startSteps: [],
      }),
    )
    .$returningId();
  const [day] = await app.db
    .insert(schema.conquerTemplateDays)
    .values(
      tenantValues(GYM2_CTX, {
        daysCount: 3,
        dayKey: "g2_day",
        label: "Día del gym 2",
        finisherText: "Finisher del gym 2",
        exerciseCodes: ["g2_exercise"],
      }),
    )
    .$returningId();
  return {
    ladderId: ladder.id,
    rungId: rung.id,
    exerciseId: exercise.id,
    dayId: day.id,
  };
}

async function purgeGym2Catalog(): Promise<void> {
  await app.db
    .delete(schema.conquerExercises)
    .where(tenantWhere(schema.conquerExercises, GYM2_CTX));
  await app.db
    .delete(schema.conquerRungs)
    .where(tenantWhere(schema.conquerRungs, GYM2_CTX));
  await app.db
    .delete(schema.conquerTemplateDays)
    .where(tenantWhere(schema.conquerTemplateDays, GYM2_CTX));
  await app.db
    .delete(schema.conquerLadders)
    .where(tenantWhere(schema.conquerLadders, GYM2_CTX));
}

/** `startSteps` válido de Planche press (escalera `planche_press`), con el e1 en `tuck`. */
const VALID_START_STEPS = [
  { step: "e1", rung: "tuck", mode: "completa" },
  { step: "e2", rung: "adv_tuck", mode: "negativa" },
  { step: "e3", rung: "lean", mode: "completa" },
  { step: "hold", rung: "lean", mode: "hold" },
];

beforeAll(async () => {
  app = await createTestApp();
  await snapshotCatalog();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
  adminToken = (await createConquerStaff(app, "admin")).token;
});

afterEach(async () => {
  await purgeGym2Catalog();
  await restoreCatalog();
  await clearModuleFlags(app, TENANT_DOS);
});

afterAll(async () => {
  await purgeGym2Catalog();
  await restoreCatalog();
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

describe("GET /api/admin/conquer/catalog — catálogo completo para el editor (§8.1)", () => {
  // 201-26: la 0293 manda. 12 de ejercicios y de hold, 1 de combos y la vieja `lsit` inactiva.
  it("trae las 20 escaleras, 12 ejercicios, 9 plantillas y las 15 zonas con su nombre", async () => {
    const catalog = await getCatalog();

    expect(catalog.ladders).toHaveLength(20);
    expect(catalog.exercises).toHaveLength(12);
    expect(catalog.templateDays).toHaveLength(9);
    expect(catalog.zones).toHaveLength(15);
    expect(catalog.zones).toContainEqual({ slug: "chest", label: "Pecho" });
    const palanca = catalog.ladders.find((l) => l.code === "palanca");
    expect(palanca?.rungs.map((r) => r.code)).toEqual([
      "full",
      "half_lay",
      "straddle",
      "super_adv_tuck",
      "adv_tuck",
      "tuck",
      "lean",
    ]);
    const press = catalog.exercises.find((e) => e.code === "planche_press");
    expect(press?.ladderCode).toBe("planche_press");
    expect(press?.startSteps).toHaveLength(4);
  });

  it("cada ejercicio trae la escalera de hold, la marca de brazos rectos y las 3 tablas de arranque", async () => {
    const catalog = await getCatalog();

    const hspu = catalog.exercises.find((e) => e.code === "hspu");
    expect(hspu?.holdLadderCode).toBe("hspu_hold");
    expect(hspu?.holdLadderId).toBe(
      catalog.ladders.find((l) => l.code === "hspu_hold")?.id,
    );
    const press = catalog.exercises.find((e) => e.code === "planche_press");
    expect(press?.holdLadderId).toBeNull();
    expect(press?.holdLadderCode).toBeNull();
    expect(press?.brazosRectos).toBe(true);
    expect(
      catalog.exercises.find((e) => e.code === "front_pullups")?.brazosRectos,
    ).toBe(false);
    for (const exercise of catalog.exercises) {
      expect(exercise.startSteps, exercise.code).toHaveLength(4);
      expect(exercise.startStepsNovillo, exercise.code).toHaveLength(4);
      expect(exercise.startStepsTernero, exercise.code).toHaveLength(4);
    }
    expect(
      catalog.exercises.find((e) => e.code === "planche_hold")
        ?.startStepsTernero,
    ).toEqual([
      { step: "e1", rung: "straddle", mode: "hold" },
      { step: "e2", rung: "adv_tuck", mode: "hold" },
      { step: "e3", rung: "lean", mode: "hold" },
      { step: "hold", rung: "lean", mode: "hold" },
    ]);
    // 201-26: el peldaño ya no trae brazosRectos en ninguna escalera.
    for (const ladder of catalog.ladders) {
      for (const rung of ladder.rungs) {
        expect(rung).not.toHaveProperty("brazosRectos");
      }
    }
  });

  // 201-26: la 0293 manda. `palanca` ya solo la usan los combos: el escalón de un
  // Toro vive en la escalera de su ejercicio (Planche hold: hold final en `tuck`).
  it("inUse es true en los peldaños que usa algún alumno, y false mientras nadie los usa", async () => {
    const tuck = async () =>
      (await getCatalog()).ladders
        .find((l) => l.code === "planche_hold")
        ?.rungs.find((r) => r.code === "tuck");
    expect((await tuck())?.inUse).toBe(false);

    await createActiveConquerMember(app, { level: "toro", daysCount: 4 });

    expect((await tuck())?.inUse).toBe(true);
    const halfLay = (await getCatalog()).ladders
      .find((l) => l.code === "planche_hold")
      ?.rungs.find((r) => r.code === "half_lay");
    expect(halfLay?.inUse).toBe(false);
  });
});

describe("POST /ladders/:ladderId/rungs y PUT /ladders/:ladderId/order — peldaños (D-04)", () => {
  it("agrega peldaños al final: posiciones 0, 1, 2 y code con sufijo si el nombre choca", async () => {
    const ladderId = await insertTestLadder();

    const first = await addRung(ladderId, "Beta");
    const second = await addRung(ladderId, "Beta");
    const third = await addRung(ladderId, "Árbol  rojo", { unilateral: true });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(third.statusCode).toBe(201);
    const rungs = third.json<LadderBody>().rungs;
    expect(rungs.map((r) => [r.code, r.position, r.name])).toEqual([
      ["beta", 0, "Beta"],
      ["beta_2", 1, "Beta"],
      ["arbol_rojo", 2, "Árbol  rojo"],
    ]);
    expect(rungs[2].unilateral).toBe(true);
    expect(rungs.every((r) => r.isActive && !r.inUse)).toBe(true);
    const rows = await rungRows(ladderId);
    expect(rows.map((r) => r.code)).toEqual(["beta", "beta_2", "arbol_rojo"]);
  });

  it("un peldaño nuevo va después del último, aunque el último esté desactivado", async () => {
    const ladderId = await insertTestLadder();
    await addRung(ladderId, "Uno");
    const two = await addRung(ladderId, "Dos");
    const dosId = two.json<LadderBody>().rungs[1].id;
    await call("PUT", `/rungs/${dosId}`, adminToken, { isActive: false });

    const res = await addRung(ladderId, "Tres");

    expect(res.json<LadderBody>().rungs.map((r) => r.position)).toEqual([
      0, 1, 2,
    ]);
  });

  it("reordena [c, a, b]: las posiciones nuevas quedan en la base sin chocar con el UNIQUE", async () => {
    const { ladderId, a, b, c } = await ladderWithThreeRungs();

    const res = await call("PUT", `/ladders/${ladderId}/order`, adminToken, {
      rungIds: [c, a, b],
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<LadderBody>().rungs.map((r) => [r.id, r.position])).toEqual(
      [
        [c, 0],
        [a, 1],
        [b, 2],
      ],
    );
    const rows = await rungRows(ladderId);
    expect(rows.map((r) => [r.id, r.position])).toEqual([
      [c, 0],
      [a, 1],
      [b, 2],
    ]);
  });

  it.each([
    ["incompleta", (x: { a: number; b: number; c: number }) => [x.a, x.b]],
    [
      "con un id repetido",
      (x: { a: number; b: number; c: number }) => [x.a, x.a, x.b],
    ],
    [
      "con un id de más",
      (x: { a: number; b: number; c: number }) => [x.a, x.b, x.c, 999999999],
    ],
    [
      "con un id que no es de la escalera",
      (x: { a: number; b: number; c: number }) => [x.a, x.b, 999999999],
    ],
  ])("la lista %s: 400 y las posiciones no cambian", async (_caso, build) => {
    const ladder = await ladderWithThreeRungs();

    const res = await call(
      "PUT",
      `/ladders/${ladder.ladderId}/order`,
      adminToken,
      {
        rungIds: build(ladder),
      },
    );

    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().code).toBe("CONQUER_CATALOGO_INVALIDO");
    const rows = await rungRows(ladder.ladderId);
    expect(rows.map((r) => [r.id, r.position])).toEqual([
      [ladder.a, 0],
      [ladder.b, 1],
      [ladder.c, 2],
    ]);
  });

  it("un id de peldaño de OTRA escalera del mismo gimnasio en la lista: 400 (cross-ID)", async () => {
    const one = await ladderWithThreeRungs();
    const other = await ladderWithThreeRungs();

    const res = await call(
      "PUT",
      `/ladders/${one.ladderId}/order`,
      adminToken,
      {
        rungIds: [one.a, one.b, other.c],
      },
    );

    expect(res.statusCode).toBe(400);
    const rows = await rungRows(other.ladderId);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
  });

  it.each([
    ["nombre vacío", { name: "   ", unilateral: false }],
    ["nombre de 61 caracteres", { name: "x".repeat(61), unilateral: false }],
    ["sin unilateral", { name: "Ok" }],
    ["sin nombre", { unilateral: false }],
  ])("crear con %s: 400 y no escribe nada", async (_caso, payload) => {
    const ladderId = await insertTestLadder();

    const res = await call(
      "POST",
      `/ladders/${ladderId}/rungs`,
      adminToken,
      payload,
    );

    expect(res.statusCode).toBe(400);
    expect(await rungRows(ladderId)).toHaveLength(0);
  });
});

describe("PUT /rungs/:rungId — renombrar, marcar y desactivar (D-04, T-201-51)", () => {
  it("renombra y marca unilateral; el code no cambia", async () => {
    const { a } = await ladderWithThreeRungs();

    const res = await call("PUT", `/rungs/${a}`, adminToken, {
      name: "  Alfa renombrado ",
      unilateral: true,
    });

    expect(res.statusCode).toBe(200);
    const rung = res.json<LadderBody>().rungs.find((r) => r.id === a);
    expect(rung).toMatchObject({
      code: "alfa",
      name: "Alfa renombrado",
      unilateral: true,
      isActive: true,
    });
    // 201-26 DA-4: la marca de brazos rectos ya no es del peldaño.
    expect(rung).not.toHaveProperty("brazosRectos");
  });

  it("un admin viejo que manda solo brazosRectos: la clave se descarta y queda un body vacío (400)", async () => {
    const { a } = await ladderWithThreeRungs();

    const res = await call("PUT", `/rungs/${a}`, adminToken, {
      brazosRectos: true,
    });

    expect(res.statusCode).toBe(400);
  });

  it("desactiva y reactiva un peldaño que no usa la tabla de arranque; nunca se borra", async () => {
    const { ladderId, a } = await ladderWithThreeRungs();

    const off = await call("PUT", `/rungs/${a}`, adminToken, {
      isActive: false,
    });
    expect(off.statusCode).toBe(200);
    expect(off.json<LadderBody>().rungs.find((r) => r.id === a)?.isActive).toBe(
      false,
    );
    expect(await rungRows(ladderId)).toHaveLength(3);

    const on = await call("PUT", `/rungs/${a}`, adminToken, { isActive: true });
    expect(on.json<LadderBody>().rungs.find((r) => r.id === a)?.isActive).toBe(
      true,
    );
  });

  // 201-26: la 0293 manda. El `straddle` de Palanca ya es solo de los combos; el
  // de la tabla de arranque de Toro es el de Planche hold (E2).
  it("desactivar un peldaño usado en la tabla de arranque (straddle de Planche hold): 409 CONQUER_PELDANO_EN_ARRANQUE", async () => {
    const straddle = await rungOf("planche_hold", "straddle");

    const res = await call("PUT", `/rungs/${straddle.id}`, adminToken, {
      isActive: false,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().code).toBe("CONQUER_PELDANO_EN_ARRANQUE");
    expect(res.json<ErrorBody>().error).toContain("Espartano");
    expect((await rungOf("planche_hold", "straddle")).isActive).toBe(true);
  });

  // Anexo 3: el peldaño que solo usa la tabla de Novillo o la de Ternero también
  // está protegido (antes solo se miraba la de Toro).
  it.each([
    ["Centurión", "planche_hold", "super_adv_tuck"],
    ["Centurión", "hspu", "pared"],
    ["Legionario", "trac", "al_pecho"],
  ])(
    "desactivar un peldaño que solo usa la tabla de %s (escalera %s, peldaño %s): 409",
    async (level, ladderCode, rungCode) => {
      const rung = await rungOf(ladderCode, rungCode);

      const res = await call("PUT", `/rungs/${rung.id}`, adminToken, {
        isActive: false,
      });

      expect(res.statusCode).toBe(409);
      expect(res.json<ErrorBody>().code).toBe("CONQUER_PELDANO_EN_ARRANQUE");
      expect(res.json<ErrorBody>().error).toContain(level);
      expect((await rungOf(ladderCode, rungCode)).isActive).toBe(true);
    },
  );

  // DA-3: el hold de HSPU se elige en su escalera de hold. `pike` está en la
  // tabla de arranque de los tres niveles como hold final.
  it("desactivar el pike de la escalera de HOLD de HSPU (hold final de los 3 niveles): 409", async () => {
    const pike = await rungOf("hspu_hold", "pike");

    const res = await call("PUT", `/rungs/${pike.id}`, adminToken, {
      isActive: false,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().code).toBe("CONQUER_PELDANO_EN_ARRANQUE");
    expect((await rungOf("hspu_hold", "pike")).isActive).toBe(true);
  });

  // `pike elevado` solo está en la escalera de E1-E3 de HSPU (E3 de Novillo) y
  // `pike` de esa escalera es E3 de Ternero: el de la de hold no se mezcla.
  it("desactivar un peldaño de la escalera de hold que NINGUNA tabla usa: 200 (no se confunde con la de E1-E3)", async () => {
    const libre = await rungOf("hspu_hold", "vertical_libre");
    const res = await call("PUT", `/rungs/${libre.id}`, adminToken, {
      isActive: false,
    });

    expect(res.statusCode).toBe(200);
  });

  // Anexo 6 / T-201-98: los combos arrancan en `straddle` de la palanca.
  it("desactivar el straddle de Palanca (arranque de los combos): 409 y el mensaje lo dice", async () => {
    const straddle = await rungOf("palanca", "straddle");

    const res = await call("PUT", `/rungs/${straddle.id}`, adminToken, {
      isActive: false,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().code).toBe("CONQUER_PELDANO_EN_ARRANQUE");
    expect(res.json<ErrorBody>().error).toContain("arranque de los combos");
    expect((await rungOf("palanca", "straddle")).isActive).toBe(true);
  });

  it("los otros peldaños de Palanca sí se desactivan (lean) y se reactivan", async () => {
    const lean = await rungOf("palanca", "lean");

    const off = await call("PUT", `/rungs/${lean.id}`, adminToken, {
      isActive: false,
    });
    const on = await call("PUT", `/rungs/${lean.id}`, adminToken, {
      isActive: true,
    });

    expect(off.statusCode).toBe(200);
    expect(on.statusCode).toBe(200);
    expect((await rungOf("palanca", "lean")).isActive).toBe(true);
  });

  it("desactivar el último peldaño activo de la escalera: 409 CONQUER_ESCALERA_VACIA", async () => {
    const ladderId = await insertTestLadder();
    const created = await addRung(ladderId, "Uno");
    const second = await addRung(ladderId, "Dos");
    const [uno, dos] = second.json<LadderBody>().rungs.map((r) => r.id);
    expect(created.statusCode).toBe(201);

    const first = await call("PUT", `/rungs/${uno}`, adminToken, {
      isActive: false,
    });
    const last = await call("PUT", `/rungs/${dos}`, adminToken, {
      isActive: false,
    });

    expect(first.statusCode).toBe(200);
    expect(last.statusCode).toBe(409);
    expect(last.json<ErrorBody>().code).toBe("CONQUER_ESCALERA_VACIA");
    expect((await rungRows(ladderId)).filter((r) => r.isActive)).toHaveLength(
      1,
    );
  });

  it.each([
    ["body vacío", {}],
    ["nombre en blanco", { name: "   " }],
    ["nombre de 61 caracteres", { name: "y".repeat(61) }],
    ["isActive que no es booleano", { isActive: "quizas" }],
  ])("%s: 400", async (_caso, payload) => {
    const { a } = await ladderWithThreeRungs();

    const res = await call("PUT", `/rungs/${a}`, adminToken, payload);

    expect(res.statusCode).toBe(400);
  });

  it("peldaño inexistente: 404 CONQUER_PELDANO_NO_ENCONTRADO", async () => {
    const res = await call("PUT", "/rungs/999999999", adminToken, {
      name: "Nada",
    });

    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorBody>().code).toBe("CONQUER_PELDANO_NO_ENCONTRADO");
  });
});

describe("PUT /exercises/:exerciseId — tabla de arranque y zonas (D-14, D-20)", () => {
  it("guarda una tabla de arranque válida (ordenada e1, e2, e3, hold) y las zonas nuevas", async () => {
    const press = await exerciseByCode("planche_press");
    const reversed = [...VALID_START_STEPS].reverse();
    const muscles = [
      { zone: "chest", role: "principal" },
      { zone: "abs", role: "secundario" },
    ];

    const res = await call("PUT", `/exercises/${press.id}`, adminToken, {
      name: "Planche press (prueba)",
      startSteps: reversed,
      muscles,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<ExerciseBody>();
    expect(body.name).toBe("Planche press (prueba)");
    expect(body.startSteps).toEqual(VALID_START_STEPS);
    expect(body.muscles).toEqual(muscles);
    const [row] = await app.db
      .select()
      .from(schema.conquerExercises)
      .where(
        and(
          tenantWhere(schema.conquerExercises, TEMPLO_CTX),
          eq(schema.conquerExercises.id, press.id),
        ),
      );
    expect(row.startSteps).toEqual(VALID_START_STEPS);
    expect(row.unit).toBe("reps");
    expect(row.ladderId).toBe(press.ladderId);
  });

  it("el unit y la escalera no se editan: se descartan del body", async () => {
    const press = await exerciseByCode("planche_press");

    const res = await call("PUT", `/exercises/${press.id}`, adminToken, {
      name: "Otro nombre",
      unit: "s",
      ladderId: 1,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<ExerciseBody>();
    expect(body.unit).toBe("reps");
    expect(body.ladderId).toBe(press.ladderId);
  });

  it.each([
    [
      "un peldaño de otra escalera",
      VALID_START_STEPS.map((s) =>
        s.step === "e1" ? { ...s, rung: "pike" } : s,
      ),
    ],
    [
      "un peldaño que no existe",
      VALID_START_STEPS.map((s) =>
        s.step === "e2" ? { ...s, rung: "nada" } : s,
      ),
    ],
    [
      "el hold con modo completa",
      VALID_START_STEPS.map((s) =>
        s.step === "hold" ? { ...s, mode: "completa" } : s,
      ),
    ],
    [
      "un modo inválido",
      VALID_START_STEPS.map((s) =>
        s.step === "e3" ? { ...s, mode: "rapida" } : s,
      ),
    ],
    [
      "un escalón repetido",
      VALID_START_STEPS.map((s) =>
        s.step === "e2" ? { ...s, step: "e1" } : s,
      ),
    ],
    [
      "un escalón que no existe",
      VALID_START_STEPS.map((s) =>
        s.step === "e3" ? { ...s, step: "e9" } : s,
      ),
    ],
    ["solo 3 escalones", VALID_START_STEPS.slice(0, 3)],
    [
      "5 escalones",
      [...VALID_START_STEPS, { step: "e1", rung: "tuck", mode: "completa" }],
    ],
  ])(
    "tabla de arranque con %s: 400 CONQUER_CATALOGO_INVALIDO y no cambia nada",
    async (_caso, startSteps) => {
      const press = await exerciseByCode("planche_press");

      const res = await call("PUT", `/exercises/${press.id}`, adminToken, {
        startSteps,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json<ErrorBody>().code).toBe("CONQUER_CATALOGO_INVALIDO");
      expect((await exerciseByCode("planche_press")).startSteps).toEqual(
        press.startSteps,
      );
    },
  );

  it("un peldaño desactivado no sirve para la tabla de arranque: 400", async () => {
    const press = await exerciseByCode("planche_press");
    const halfLay = await rungOf("planche_press", "half_lay");
    const off = await call("PUT", `/rungs/${halfLay.id}`, adminToken, {
      isActive: false,
    });
    expect(off.statusCode).toBe(200);

    const res = await call("PUT", `/exercises/${press.id}`, adminToken, {
      startSteps: VALID_START_STEPS.map((s) =>
        s.step === "e1" ? { ...s, rung: "half_lay" } : s,
      ),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().code).toBe("CONQUER_CATALOGO_INVALIDO");
  });

  // ── 201-26: marca de brazos rectos, 3 tablas, hold en su escalera, modos (§1, §3) ──

  const NOVILLO_PRESS = [
    { step: "e1", rung: "lean", mode: "completa" },
    { step: "e2", rung: "lean", mode: "negativa" },
    { step: "e3", rung: "lean", mode: "completa" },
    { step: "hold", rung: "lean", mode: "hold" },
  ];

  it("guarda cada tabla por separado: Novillo y Ternero no pisan la de Toro", async () => {
    const press = await exerciseByCode("planche_press");
    const novillo = [
      { step: "e1", rung: "tuck", mode: "completa" },
      { step: "e2", rung: "lean", mode: "negativa" },
      { step: "e3", rung: "lean", mode: "completa" },
      { step: "hold", rung: "lean", mode: "hold" },
    ];

    const res = await call("PUT", `/exercises/${press.id}`, adminToken, {
      startStepsNovillo: novillo,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<ExerciseBody>();
    expect(body.startStepsNovillo).toEqual(novillo);
    expect(body.startSteps).toEqual(press.startSteps);
    expect(body.startStepsTernero).toEqual(press.startStepsTernero);
  });

  it("editar startStepsTernero de Pull-ups en front lever (válido): 200 y un Ternero activado después lo usa", async () => {
    const pullups = await exerciseByCode("front_pullups");
    const ternero = [
      { step: "e1", rung: "adv_tuck", mode: "completa" },
      { step: "e2", rung: "tuck", mode: "negativa" },
      { step: "e3", rung: "tuck", mode: "completa" },
      { step: "hold", rung: "tuck", mode: "hold" },
    ];

    const res = await call("PUT", `/exercises/${pullups.id}`, adminToken, {
      startStepsTernero: ternero,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<ExerciseBody>().startStepsTernero).toEqual(ternero);
    // Ternero de 3 días: el día "traccion" trae front_hold, front_pullups y muscle_up.
    const member = await createActiveConquerMember(app, {
      level: "ternero",
      daysCount: 3,
    });
    const steps = await readConquerSteps(app, member.userId);
    expect(steps.get("front_pullups:e1")?.rungCode).toBe("adv_tuck");
    expect(steps.get("front_pullups:e2")?.mode).toBe("negativa");
    expect(steps.get("front_pullups:e3")?.rungCode).toBe("tuck");
  });

  it("el hold de HSPU se valida contra su escalera de hold: vertical_en_pared es válido y pike_elevado (de la de E1-E3) es 400", async () => {
    const hspu = await exerciseByCode("hspu");
    const withHold = (rung: string) =>
      hspu.startStepsNovillo.map((s) =>
        s.step === "hold" ? { ...s, rung } : s,
      );

    const bad = await call("PUT", `/exercises/${hspu.id}`, adminToken, {
      startStepsNovillo: withHold("pike_elevado"),
    });
    const ok = await call("PUT", `/exercises/${hspu.id}`, adminToken, {
      startStepsNovillo: withHold("vertical_en_pared"),
    });

    expect(bad.statusCode).toBe(400);
    expect(bad.json<ErrorBody>().code).toBe("CONQUER_CATALOGO_INVALIDO");
    expect(ok.statusCode).toBe(200);
    expect(
      ok.json<ExerciseBody>().startStepsNovillo.find((s) => s.step === "hold")
        ?.rung,
    ).toBe("vertical_en_pared");
  });

  it("E1-E3 de HSPU no aceptan un peldaño de la escalera de hold (vertical_libre): 400", async () => {
    const hspu = await exerciseByCode("hspu");

    const res = await call("PUT", `/exercises/${hspu.id}`, adminToken, {
      startStepsTernero: hspu.startStepsTernero.map((s) =>
        s.step === "e1" ? { ...s, rung: "vertical_libre" } : s,
      ),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().code).toBe("CONQUER_CATALOGO_INVALIDO");
  });

  // Anexo 1: los isométricos solo hold y los dinámicos completa o negativa.
  it.each([
    ["planche_hold", "startSteps", "e1", "completa"],
    ["planche_hold", "startStepsNovillo", "e2", "negativa"],
    ["front_hold", "startStepsTernero", "e3", "completa"],
    ["hspu", "startSteps", "e1", "hold"],
    ["hspu", "startStepsTernero", "e3", "hold"],
    ["planche_press", "startSteps", "hold", "completa"],
  ])(
    "%s %s: el escalón %s con modo %s no corresponde: 400 y no cambia nada",
    async (code, field, step, mode) => {
      const exercise = await exerciseByCode(code);
      const table = (exercise as unknown as Record<string, StartStepBody[]>)[
        field
      ];

      const res = await call("PUT", `/exercises/${exercise.id}`, adminToken, {
        [field]: table.map((s) => (s.step === step ? { ...s, mode } : s)),
      });

      expect(res.statusCode).toBe(400);
      expect(res.json<ErrorBody>().code).toBe("CONQUER_CATALOGO_INVALIDO");
      expect(await exerciseByCode(code)).toEqual(exercise);
    },
  );

  it("una de las tres tablas inválida: 400 y NINGUNA de las tres cambia (todo o nada)", async () => {
    const press = await exerciseByCode("planche_press");

    const res = await call("PUT", `/exercises/${press.id}`, adminToken, {
      startStepsNovillo: NOVILLO_PRESS,
      startStepsTernero: [{ step: "e1", rung: "lean", mode: "completa" }],
    });

    expect(res.statusCode).toBe(400);
    expect(await exerciseByCode("planche_press")).toEqual(press);
  });

  it("brazosRectos: true en Pull-ups en front lever: Hoy del alumno lo manda en sus 4 escalones", async () => {
    const pullups = await exerciseByCode("front_pullups");
    expect(pullups.brazosRectos).toBe(false);
    const member = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });

    const res = await call("PUT", `/exercises/${pullups.id}`, adminToken, {
      brazosRectos: true,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<ExerciseBody>().brazosRectos).toBe(true);
    const front = await fetchToday(app, member.token, "front");
    const exercise = front.exercises.find((e) => e.code === "front_pullups");
    expect(exercise?.steps.map((s) => s.brazosRectos)).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it("brazosRectos que no es booleano: 400", async () => {
    const pullups = await exerciseByCode("front_pullups");

    const res = await call("PUT", `/exercises/${pullups.id}`, adminToken, {
      brazosRectos: "si",
    });

    expect(res.statusCode).toBe(400);
  });

  it.each([
    [
      "una zona que no existe en el mapa (pierna)",
      [{ zone: "pierna", role: "principal" }],
    ],
    [
      "la zona tibialis de la fase 200",
      [{ zone: "tibialis", role: "principal" }],
    ],
    ["sin ninguna principal", [{ zone: "chest", role: "secundario" }]],
    ["una lista vacía", []],
    ["un rol inválido", [{ zone: "chest", role: "mayor" }]],
    [
      "un par repetido",
      [
        { zone: "chest", role: "principal" },
        { zone: "chest", role: "principal" },
      ],
    ],
  ])("zonas con %s: 400 y no cambia nada", async (_caso, muscles) => {
    const press = await exerciseByCode("planche_press");

    const res = await call("PUT", `/exercises/${press.id}`, adminToken, {
      muscles,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().code).toBe("CONQUER_CATALOGO_INVALIDO");
    expect((await exerciseByCode("planche_press")).muscles).toEqual(
      press.muscles,
    );
  });

  it("la misma zona como principal y como secundaria es válida (no es un par repetido)", async () => {
    const press = await exerciseByCode("planche_press");

    const res = await call("PUT", `/exercises/${press.id}`, adminToken, {
      muscles: [
        { zone: "chest", role: "principal" },
        { zone: "chest", role: "secundario" },
      ],
    });

    expect(res.statusCode).toBe(200);
  });

  it.each([
    ["body vacío", {}],
    ["nombre en blanco", { name: "  " }],
    ["nombre de 81 caracteres", { name: "z".repeat(81) }],
  ])("%s: 400", async (_caso, payload) => {
    const press = await exerciseByCode("planche_press");

    const res = await call(
      "PUT",
      `/exercises/${press.id}`,
      adminToken,
      payload,
    );

    expect(res.statusCode).toBe(400);
  });
});

describe("PUT /template-days/:id — plantillas de 2, 3 y 4 días (D-14, D-20)", () => {
  it("guarda nombre y finisher nuevos sin tocar los ejercicios", async () => {
    const mixto = await dayByKey(3, "mixto");

    const res = await call("PUT", `/template-days/${mixto.id}`, adminToken, {
      label: " Mixto nuevo ",
      finisherText: "Finisher de prueba",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<TemplateDayBody>()).toMatchObject({
      id: mixto.id,
      label: "Mixto nuevo",
      finisherText: "Finisher de prueba",
      exerciseCodes: mixto.exerciseCodes,
    });
    expect((await dayByKey(3, "mixto")).label).toBe("Mixto nuevo");
  });

  it("un ejercicio que ya está en otro día de la misma plantilla: 409 CONQUER_EJERCICIO_REPETIDO", async () => {
    const mixto = await dayByKey(3, "mixto");

    // planche_hold ya está en el día "empuje" de la plantilla de 3 días.
    const res = await call("PUT", `/template-days/${mixto.id}`, adminToken, {
      exerciseCodes: ["planche_hold", "one_arm_archer", "press_90"],
    });

    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().code).toBe("CONQUER_EJERCICIO_REPETIDO");
    expect((await dayByKey(3, "mixto")).exerciseCodes).toEqual(
      mixto.exerciseCodes,
    );
  });

  it("el repetido solo cuenta dentro de la misma cantidad de días: front_raises (solo en 4 días) entra en la de 3", async () => {
    const mixto = await dayByKey(3, "mixto");

    const res = await call("PUT", `/template-days/${mixto.id}`, adminToken, {
      exerciseCodes: ["planche_press", "one_arm_archer", "front_raises"],
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<TemplateDayBody>().exerciseCodes).toEqual([
      "planche_press",
      "one_arm_archer",
      "front_raises",
    ]);
  });

  it("reordenar los mismos 3 ejercicios dentro del propio día es válido (no choca consigo mismo)", async () => {
    const mixto = await dayByKey(3, "mixto");

    const res = await call("PUT", `/template-days/${mixto.id}`, adminToken, {
      exerciseCodes: [...mixto.exerciseCodes].reverse(),
    });

    expect(res.statusCode).toBe(200);
  });

  it.each([
    ["2 códigos", ["planche_press", "one_arm_archer"]],
    [
      "4 códigos",
      ["planche_press", "one_arm_archer", "press_90", "front_raises"],
    ],
    [
      "un código repetido dentro del día",
      ["planche_press", "planche_press", "press_90"],
    ],
    [
      "un código que no existe",
      ["planche_press", "one_arm_archer", "inventado"],
    ],
  ])("%s: 400 CONQUER_CATALOGO_INVALIDO", async (_caso, exerciseCodes) => {
    const mixto = await dayByKey(3, "mixto");

    const res = await call("PUT", `/template-days/${mixto.id}`, adminToken, {
      exerciseCodes,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().code).toBe("CONQUER_CATALOGO_INVALIDO");
    expect((await dayByKey(3, "mixto")).exerciseCodes).toEqual(
      mixto.exerciseCodes,
    );
  });

  it.each([
    ["body vacío", {}],
    ["nombre en blanco", { label: "  " }],
    ["nombre de 41 caracteres", { label: "n".repeat(41) }],
    ["finisher en blanco", { finisherText: "   " }],
  ])("%s: 400", async (_caso, payload) => {
    const mixto = await dayByKey(3, "mixto");

    const res = await call(
      "PUT",
      `/template-days/${mixto.id}`,
      adminToken,
      payload,
    );

    expect(res.statusCode).toBe(400);
  });

  it("los alumnos reciben los escalones del ejercicio nuevo de forma perezosa (GET /today)", async () => {
    const member = await createActiveConquerMember(app, {
      level: "novillo",
      daysCount: 3,
    });
    const before = await readConquerSteps(app, member.userId);
    expect(before.size).toBe(36);
    expect(before.has("lsit_plancha:e1")).toBe(false);
    const mixto = await dayByKey(3, "mixto");

    const put = await call("PUT", `/template-days/${mixto.id}`, adminToken, {
      exerciseCodes: ["planche_press", "one_arm_archer", "lsit_plancha"],
    });
    expect(put.statusCode).toBe(200);
    const today = await fetchToday(app, member.token, "mixto");

    expect(today.exercises.map((e) => e.code)).toEqual([
      "planche_press",
      "one_arm_archer",
      "lsit_plancha",
    ]);
    const lsit = today.exercises.find((e) => e.code === "lsit_plancha");
    expect(lsit?.steps.map((s) => s.step)).toEqual(["e1", "e2", "e3", "hold"]);
    const after = await readConquerSteps(app, member.userId);
    expect(after.size).toBe(40);
    for (const step of ["e1", "e2", "e3", "hold"]) {
      expect(after.get(`lsit_plancha:${step}`)?.calibration).toBe("pendiente");
    }
  });
});

describe("aislamiento entre gimnasios y roles (T-201-49, T-201-50)", () => {
  type Target = (ids: Gym2Catalog) => {
    method: "POST" | "PUT";
    url: string;
    payload: Record<string, unknown>;
  };

  const targets: [string, Target][] = [
    [
      "crear un peldaño",
      (ids) => ({
        method: "POST",
        url: `/ladders/${ids.ladderId}/rungs`,
        payload: { name: "Intruso", unilateral: false },
      }),
    ],
    [
      "editar un peldaño",
      (ids) => ({
        method: "PUT",
        url: `/rungs/${ids.rungId}`,
        payload: { name: "Intruso" },
      }),
    ],
    [
      "reordenar una escalera",
      (ids) => ({
        method: "PUT",
        url: `/ladders/${ids.ladderId}/order`,
        payload: { rungIds: [ids.rungId] },
      }),
    ],
    [
      "editar un ejercicio",
      (ids) => ({
        method: "PUT",
        url: `/exercises/${ids.exerciseId}`,
        payload: { name: "Intruso" },
      }),
    ],
    [
      "editar un día de la plantilla",
      (ids) => ({
        method: "PUT",
        url: `/template-days/${ids.dayId}`,
        payload: { label: "Intruso" },
      }),
    ],
  ];

  async function gym1Ids(): Promise<Gym2Catalog> {
    const catalog = await getCatalog();
    const ladder = catalog.ladders.find((l) => l.code === "palanca");
    const exercise = catalog.exercises.find((e) => e.code === "planche_press");
    const day = catalog.templateDays.find(
      (d) => d.daysCount === 3 && d.dayKey === "mixto",
    );
    if (!ladder || !exercise || !day) throw new Error("catálogo sin sembrar");
    return {
      ladderId: ladder.id,
      rungId: ladder.rungs[0].id,
      exerciseId: exercise.id,
      dayId: day.id,
    };
  }

  it.each(targets)(
    "el gimnasio 1 no puede %s del gimnasio 2: 404 y no cambia nada",
    async (_caso, build) => {
      const ids2 = await insertGym2Catalog();
      await setModuleFlag(app, TENANT_DOS, "templo-training", true);
      const { method, url, payload } = build(ids2);

      const res = await call(method, url, adminToken, payload);

      expect(res.statusCode).toBe(404);
      const [rung] = await app.db
        .select({ name: schema.conquerRungs.name })
        .from(schema.conquerRungs)
        .where(
          and(
            tenantWhere(schema.conquerRungs, GYM2_CTX),
            eq(schema.conquerRungs.id, ids2.rungId),
          ),
        );
      expect(rung.name).toBe("Peldaño del gym 2");
      const created = await app.db
        .select({ id: schema.conquerRungs.id })
        .from(schema.conquerRungs)
        .where(tenantWhere(schema.conquerRungs, GYM2_CTX));
      expect(created).toHaveLength(1);
    },
  );

  it.each(targets)(
    "el gimnasio 2 no puede %s del gimnasio 1: 404 y el catálogo queda igual",
    async (_caso, build) => {
      await setModuleFlag(app, TENANT_DOS, "templo-training", true);
      const ids1 = await gym1Ids();
      const before = await getCatalog();
      const { method, url, payload } = build(ids1);

      const res = await call(method, url, gym2.adminToken, payload);

      expect(res.statusCode).toBe(404);
      expect(await getCatalog()).toEqual(before);
    },
  );

  it("el gimnasio 2 ve su propio catálogo, vacío del de El Templo", async () => {
    await insertGym2Catalog();
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);

    const res = await call("GET", "/catalog", gym2.adminToken);

    expect(res.statusCode).toBe(200);
    const body = res.json<CatalogBody>();
    expect(body.ladders.map((l) => l.code)).toEqual(["g2_ladder"]);
    expect(body.exercises.map((e) => e.code)).toEqual(["g2_exercise"]);
    expect(body.templateDays.map((d) => d.dayKey)).toEqual(["g2_day"]);
  });

  const endpoints: [
    string,
    "GET" | "POST" | "PUT",
    string,
    Record<string, unknown> | undefined,
  ][] = [
    ["GET /catalog", "GET", "/catalog", undefined],
    [
      "POST /ladders/:ladderId/rungs",
      "POST",
      "/ladders/1/rungs",
      { name: "X", unilateral: false },
    ],
    ["PUT /rungs/:rungId", "PUT", "/rungs/1", { name: "X" }],
    [
      "PUT /ladders/:ladderId/order",
      "PUT",
      "/ladders/1/order",
      { rungIds: [1] },
    ],
    ["PUT /exercises/:exerciseId", "PUT", "/exercises/1", { name: "X" }],
    ["PUT /template-days/:id", "PUT", "/template-days/1", { label: "X" }],
  ];

  describe.each(["coach", "recepcion", "gestion"])("rol %s", (rol) => {
    it.each(endpoints)("%s: 403", async (_nombre, method, url, payload) => {
      const staff = await createConquerStaff(app, rol);
      const before = await getCatalog();

      const res = await call(method, url, staff.token, payload);

      expect(res.statusCode).toBe(403);
      expect(await getCatalog()).toEqual(before);
    });
  });

  it("un socio no puede editar el catálogo: 403", async () => {
    const member = await createActiveConquerMember(app, {
      level: "toro",
      daysCount: 4,
    });

    const res = await call("PUT", "/rungs/1", member.token, { name: "X" });

    expect(res.statusCode).toBe(403);
  });

  it("sin token: 401", async () => {
    const res = await app.inject({ method: "GET", url: `${BASE}/catalog` });

    expect(res.statusCode).toBe(401);
  });

  it("el owner también puede editar", async () => {
    const owner = await createConquerStaff(app, "owner");
    const ladderId = await insertTestLadder();

    const res = await call("POST", `/ladders/${ladderId}/rungs`, owner.token, {
      name: "Del owner",
      unilateral: false,
    });

    expect(res.statusCode).toBe(201);
  });
});
