/**
 * Fase 197 Plan 07 (D-04, D-08, D-09, D-10, D-14): integración de la canasta de
 * bloques libres.
 *
 *   GET /api/sessions/free-blocks            lista paginada, filtro por grupo
 *   GET /api/sessions/free-blocks/:blockId   un bloque suelto
 *
 * Reloj: "hoy" se fija (solo `Date`) en el último miércoles a las 12:00 de
 * Buenos Aires, calculado desde el `Date.now()` real, así siempre es día de
 * semana y quedan lunes/martes anteriores en la misma semana. Si ese miércoles
 * ya pasó la semana 52 del plan (el calendario SPOM se clampa a 1-52), se usa
 * el miércoles de la semana 51. El reloj se fija ANTES de loguear (tokens y
 * suscripción ven el mismo "ahora") y se restaura en `afterEach`.
 *
 * `aura_config` no hace falta: la lista solo lee el flag `aura_awarded` de
 * `extra_blocks_completed`.
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
import { createTestApp, createTestMember, cleanAllTestData } from "../helpers";
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
  gruposDeZonas,
  zonasDeRuta,
} from "../../src/modules/anatomy/projection";
import { getRouteLabel } from "../../src/modules/tv/route-labels";
import {
  CTX_TEMPLO,
  createPresencialMember,
  dayIdFor,
  seedExercise,
  seedSession,
  type SeedBlock,
} from "./_free-blocks-fixtures";

const AR_TZ = "America/Argentina/Buenos_Aires";
const LEVEL = "sigma";

// Fase 200 D20: las zonas de un ejercicio salen de su RUTA del modelo, no de la
// categoría. Rutas elegidas para los casos de zonas (sus zonas se calculan con
// `zonasDeRuta`, el valor literal lo fija test/anatomy/projection-parity):
//  - EMPUJE "HD/ID": trabaja pecho (y hombros, tríceps, espalda alta).
//  - TRACCION "OAR": trabaja espalda, hombros y brazos, SIN pecho ni piernas.
//  - PIERNA "L": cuádriceps, glúteos, isquios y aductores (todo piernas).
const RUTA_EMPUJE = "HD/ID";
const RUTA_TRACCION = "OAR";
const RUTA_PIERNA = "L";

const LEVEL_GROUP: Record<string, string> = {
  kairos: "alfa_delta",
  alfa: "alfa_delta",
  delta: "alfa_delta",
  sigma: "sigma",
  omega: "omega",
  spartan: "omega",
};

interface ItemPayload {
  blockId: string;
  role: string;
  title: string;
  lastDate: string;
  sourceDayId: string;
  level: string;
  workedToday: boolean;
  zones: string[];
  exercises: { exerciseId: number }[];
}

interface ListPayload {
  items: ItemPayload[];
  total: number;
  page: number;
  limit: number;
  auraAvailableToday: boolean;
  todayZones: string[] | null;
  weekWorkedZones: string[];
}

interface OnePayload {
  item: ItemPayload;
  auraAvailableToday: boolean;
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

describe("canasta de bloques libres: GET /api/sessions/free-blocks (197-07)", () => {
  let app: FastifyInstance;
  let token: string;
  let userId: number;
  let today: string;
  let monday: string;
  let exerciseSeq = 0;

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
    const wed = targetWednesday();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${wed}T15:00:00Z`));
    today = todayInTz(AR_TZ);
    monday = mondayOf(today);

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
    await app.db.insert(schema.dayModes).values(
      tenantValues(CTX_TEMPLO, {
        dayOfWeek: dayNumber,
        sessionMode: "regular",
      }),
    );

    const member = await createPresencialMember(app, { level: LEVEL });
    token = member.token;
    userId = member.id;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── helpers ───────────────────────────────────────────────────────────

  /** Ejercicio nuevo con nombre único; sin ruta (ni categoría con fallback) no aporta zonas. */
  async function ex(
    opts: { route?: string; category?: string } = {},
  ): Promise<number> {
    exerciseSeq += 1;
    return seedExercise(app, {
      name: `Ejercicio 197-07 ${exerciseSeq}`,
      route: opts.route,
      category: opts.category,
    });
  }

  /** Sesión aprobada (por defecto) de `date` para `level`. */
  async function seed(
    date: string,
    level: string,
    blocks: SeedBlock[],
    opts: {
      status?: "approved" | "pending_review";
      sessionMode?: "regular" | "rom";
      dayId?: string;
    } = {},
  ): Promise<string[]> {
    const { blockIds } = await seedSession(app, {
      dayId: opts.dayId ?? dayIdFor(date, level),
      week: dateToWeekNumber(date),
      day: dateToDayName(date),
      levelGroup: LEVEL_GROUP[level] ?? level,
      status: opts.status,
      sessionMode: opts.sessionMode,
      blocks,
    });
    return blockIds;
  }

  async function getList(
    query = "",
    authToken: string = token,
  ): Promise<{ status: number; body: ListPayload }> {
    const res = await app.inject({
      method: "GET",
      url: `/api/sessions/free-blocks${query}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    return {
      status: res.statusCode,
      body: JSON.parse(res.body) as ListPayload,
    };
  }

  async function getOne(
    blockId: string,
  ): Promise<{ status: number; body: OnePayload & { error?: string } }> {
    const res = await app.inject({
      method: "GET",
      url: `/api/sessions/free-blocks/${blockId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    return {
      status: res.statusCode,
      body: JSON.parse(res.body) as OnePayload & { error?: string },
    };
  }

  function blockIdsOf(items: ItemPayload[]): string[] {
    return items.map((i) => i.blockId);
  }

  // ─── casos ─────────────────────────────────────────────────────────────

  it("subnivel: el socio sigma ve los -sigma y no los -omega ni -spartan ni -delta; kairos ve los -alfa (D-08)", async () => {
    const [sigmaId] = await seed(monday, "sigma", [
      { role: "NUCLEUS", route: "OAP", exerciseIds: [await ex()] },
    ]);
    await seed(monday, "omega", [
      { role: "NUCLEUS", route: "OAP", exerciseIds: [await ex()] },
    ]);
    await seed(monday, "spartan", [
      { role: "NUCLEUS", route: "OAP", exerciseIds: [await ex()] },
    ]);
    await seed(monday, "delta", [
      { role: "NUCLEUS", route: "OAP", exerciseIds: [await ex()] },
    ]);
    const [alfaId] = await seed(monday, "alfa", [
      { role: "NUCLEUS", route: "OAP", exerciseIds: [await ex()] },
    ]);

    const sigma = await getList();
    expect(sigma.status).toBe(200);
    expect(blockIdsOf(sigma.body.items)).toEqual([sigmaId]);
    expect(sigma.body.items[0].level).toBe("sigma");

    const kairos = await createPresencialMember(app, { level: "kairos" });
    const kairosList = await getList("", kairos.token);
    expect(kairosList.status).toBe(200);
    expect(blockIdsOf(kairosList.body.items)).toEqual([alfaId]);
    expect(kairosList.body.items[0].level).toBe("alfa");
  });

  it("<= hoy: una sesión de mañana o de la semana próxima no aparece, una de hoy sí", async () => {
    const [todayId] = await seed(today, LEVEL, [
      { role: "NUCLEUS", route: "OAP", exerciseIds: [await ex()] },
    ]);
    await seed(shiftDate(today, 1), LEVEL, [
      { role: "NUCLEUS", route: "OAP", exerciseIds: [await ex()] },
    ]);
    await seed(shiftDate(monday, 7), LEVEL, [
      { role: "NUCLEUS", route: "OAP", exerciseIds: [await ex()] },
    ]);

    const { status, body } = await getList();
    expect(status).toBe(200);
    expect(blockIdsOf(body.items)).toEqual([todayId]);
    expect(body.items[0].lastDate).toBe(today);
  });

  it("sin GP: un plan de objetivo aprobado y una plani pending_review no aparecen", async () => {
    const [okId] = await seed(monday, LEVEL, [
      { role: "NUCLEUS", route: "OAP", exerciseIds: [await ex()] },
    ]);
    await seed(
      shiftDate(today, -1),
      LEVEL,
      [{ role: "NUCLEUS", route: "OAP", exerciseIds: [await ex()] }],
      {
        dayId: `GP-tren_inferior-W${dateToWeekNumber(today)}-${dateToDayName(shiftDate(today, -1))}-${LEVEL}`,
      },
    );
    await seed(
      today,
      LEVEL,
      [{ role: "NUCLEUS", route: "OAP", exerciseIds: [await ex()] }],
      { status: "pending_review" },
    );

    const { status, body } = await getList();
    expect(status).toBe(200);
    expect(blockIdsOf(body.items)).toEqual([okId]);
    for (const item of body.items) {
      expect(item.sourceDayId.startsWith("GP-")).toBe(false);
    }
  });

  it("roles: entran NUCLEUS/DEUTEROS/ATHLOS/EPIKOS y ROM_LOWER (-delta); no INITIUM, TECNICA_I, STRETCHING ni COMBOS", async () => {
    const roles = [
      "INITIUM",
      "TECNICA_I",
      "NUCLEUS",
      "DEUTEROS_1",
      "DEUTEROS_2",
      "STRETCHING",
      "COMBOS_I",
      "COMBOS_II_ALT",
      "ATHLOS",
      "EPIKOS",
    ];
    const blocks: SeedBlock[] = [];
    for (const role of roles) {
      blocks.push({ role, route: "OAP", exerciseIds: [await ex()] });
    }
    await seed(monday, LEVEL, blocks);

    // ROM: el socio sigma lee la variante delta (mapeo de día ROM de /weekly).
    const [romId] = await seed(
      shiftDate(today, -1),
      "delta",
      [{ role: "ROM_LOWER", route: "AF", exerciseIds: [await ex()] }],
      { sessionMode: "rom" },
    );

    const { status, body } = await getList();
    expect(status).toBe(200);
    expect(body.items.map((i) => i.role).sort()).toEqual(
      [
        "ATHLOS",
        "DEUTEROS_1",
        "DEUTEROS_2",
        "EPIKOS",
        "NUCLEUS",
        "ROM_LOWER",
      ].sort(),
    );
    expect(blockIdsOf(body.items)).toContain(romId);
  });

  it("duplicados: el mismo bloque en dos semanas queda una vez con la fecha más reciente; otro orden de ids es otro bloque", async () => {
    const a = await ex();
    const b = await ex();
    await seed(shiftDate(monday, -7), LEVEL, [
      { role: "NUCLEUS", route: "OAP", exerciseIds: [a, b] },
    ]);
    const [recentId] = await seed(monday, LEVEL, [
      { role: "NUCLEUS", route: "OAP", exerciseIds: [a, b] },
    ]);
    const [swappedId] = await seed(shiftDate(today, -1), LEVEL, [
      { role: "NUCLEUS", route: "OAP", exerciseIds: [b, a] },
    ]);

    const { status, body } = await getList();
    expect(status).toBe(200);
    expect(body.total).toBe(2);
    expect(blockIdsOf(body.items).sort()).toEqual([recentId, swappedId].sort());
    const kept = body.items.find((i) => i.blockId === recentId);
    expect(kept?.lastDate).toBe(monday);
  });

  it("orden: sin filtro la aparición más reciente primero; con group=pecho primero el de más ejercicios de pecho", async () => {
    // Las rutas elegidas separan los grupos: empuje toca pecho, tracción no.
    expect(gruposDeZonas(zonasDeRuta(RUTA_EMPUJE))).toContain("pecho");
    expect(gruposDeZonas(zonasDeRuta(RUTA_TRACCION))).not.toContain("pecho");

    const pushA = await ex({ route: RUTA_EMPUJE });
    const pushB = await ex({ route: RUTA_EMPUJE });
    const pushC = await ex({ route: RUTA_EMPUJE });
    const pullA = await ex({ route: RUTA_TRACCION });
    const pullB = await ex({ route: RUTA_TRACCION });
    const pullC = await ex({ route: RUTA_TRACCION });

    const [oldId] = await seed(shiftDate(monday, -7), LEVEL, [
      { role: "NUCLEUS", route: "OAP", exerciseIds: [pushA, pushB] },
    ]);
    const [midId] = await seed(monday, LEVEL, [
      { role: "NUCLEUS", route: "OAP", exerciseIds: [pullB, pullC] },
    ]);
    const [newId] = await seed(shiftDate(today, -1), LEVEL, [
      { role: "NUCLEUS", route: "OAP", exerciseIds: [pushC, pullA] },
    ]);

    const all = await getList();
    expect(all.status).toBe(200);
    expect(blockIdsOf(all.body.items)).toEqual([newId, midId, oldId]);

    const pecho = await getList("?group=pecho");
    expect(pecho.status).toBe(200);
    // 2 ejercicios de pecho (viejo) antes que 1 (nuevo); el de pura espalda queda afuera.
    expect(blockIdsOf(pecho.body.items)).toEqual([oldId, newId]);
    expect(pecho.body.total).toBe(2);
  });

  it("ya lo trabajaste hoy: el bloque que cruza 2 o más zonas con la sesión de hoy va al final con workedToday", async () => {
    // La ruta de pierna comparte 4 zonas con la sesión de hoy, la de tracción ninguna.
    const zonasPierna = zonasDeRuta(RUTA_PIERNA);
    expect(zonasPierna.length).toBeGreaterThanOrEqual(2);
    expect(
      zonasDeRuta(RUTA_TRACCION).filter((z) => zonasPierna.includes(z)),
    ).toEqual([]);

    const kneeToday = await ex({ route: RUTA_PIERNA });
    const kneePast = await ex({ route: RUTA_PIERNA });
    const pull = await ex({ route: RUTA_TRACCION });

    const [todayId] = await seed(today, LEVEL, [
      { role: "NUCLEUS", route: RUTA_PIERNA, exerciseIds: [kneeToday] },
    ]);
    const [pullId] = await seed(shiftDate(today, -1), LEVEL, [
      { role: "NUCLEUS", route: RUTA_TRACCION, exerciseIds: [pull] },
    ]);
    const [kneePastId] = await seed(monday, LEVEL, [
      { role: "DEUTEROS_1", route: RUTA_PIERNA, exerciseIds: [kneePast] },
    ]);

    const { status, body } = await getList();
    expect(status).toBe(200);
    expect(body.todayZones).not.toBeNull();
    // Invariante literal (L trabaja cuádriceps y glúteos) + cableado al modelo.
    expect(body.todayZones).toContain("quadriceps");
    expect(body.todayZones).toContain("gluteal");
    expect(body.todayZones).toEqual(zonasPierna);
    expect(Array.isArray(body.weekWorkedZones)).toBe(true);

    // Los de cuádriceps/glúteos al final (más reciente primero); la espalda arriba.
    expect(blockIdsOf(body.items)).toEqual([pullId, todayId, kneePastId]);
    expect(body.items.map((i) => i.workedToday)).toEqual([false, true, true]);
  });

  it("paginación: 23 bloques distintos -> 20 en la página 1 y 3 en la 2; limit=101 y page=0 dan 400", async () => {
    const roles = ["NUCLEUS", "DEUTEROS_1", "DEUTEROS_2", "ATHLOS", "EPIKOS"];
    const prevMonday = shiftDate(monday, -7);
    let created = 0;
    for (let d = 0; d < 5 && created < 23; d++) {
      const blocks: SeedBlock[] = [];
      for (const role of roles) {
        if (created >= 23) break;
        blocks.push({ role, route: "OAP", exerciseIds: [await ex()] });
        created += 1;
      }
      await seed(shiftDate(prevMonday, d), LEVEL, blocks);
    }
    expect(created).toBe(23);

    const first = await getList();
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(20);
    expect(first.body.total).toBe(23);
    expect(first.body.page).toBe(1);
    expect(first.body.limit).toBe(20);

    const second = await getList("?page=2");
    expect(second.status).toBe(200);
    expect(second.body.items).toHaveLength(3);
    expect(second.body.total).toBe(23);
    expect(second.body.page).toBe(2);

    // Sin repetidos entre páginas.
    const ids = new Set([
      ...blockIdsOf(first.body.items),
      ...blockIdsOf(second.body.items),
    ]);
    expect(ids.size).toBe(23);

    const tooMany = await app.inject({
      method: "GET",
      url: "/api/sessions/free-blocks?limit=101",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(tooMany.statusCode).toBe(400);

    const pageZero = await app.inject({
      method: "GET",
      url: "/api/sessions/free-blocks?page=0",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(pageZero.statusCode).toBe(400);
  });

  it("filtro: group=core sin bloques de core da items vacío; group=gemelos da 400", async () => {
    expect(gruposDeZonas(zonasDeRuta(RUTA_TRACCION))).not.toContain("core");
    await seed(monday, LEVEL, [
      {
        role: "NUCLEUS",
        route: "OAP",
        // Tracción: espalda/hombros/brazos, sin core.
        exerciseIds: [await ex({ route: RUTA_TRACCION })],
      },
    ]);

    const core = await getList("?group=core");
    expect(core.status).toBe(200);
    expect(core.body.items).toEqual([]);
    expect(core.body.total).toBe(0);

    const gemelos = await app.inject({
      method: "GET",
      url: "/api/sessions/free-blocks?group=gemelos",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(gemelos.statusCode).toBe(400);
  });

  it("gate: sin plan ni programa responde igual que /sessions/weekly; el socio online con programa activo pasa", async () => {
    await seed(monday, LEVEL, [
      { role: "NUCLEUS", route: "OAP", exerciseIds: [await ex()] },
    ]);

    const sinPlan = await createTestMember(app);
    const weekly = await app.inject({
      method: "GET",
      url: `/api/sessions/weekly?weekStart=${monday}`,
      headers: { authorization: `Bearer ${sinPlan.token}` },
    });
    const libre = await getList("", sinPlan.token);
    expect([403, 404]).toContain(weekly.statusCode);
    expect(libre.status).toBe(weekly.statusCode);
    const weeklyBody = JSON.parse(weekly.body) as { error: string };
    expect(typeof (libre.body as unknown as { error: string }).error).toBe(
      "string",
    );
    expect((libre.body as unknown as { error: string }).error).toBe(
      weeklyBody.error,
    );

    // Sin token: 401, no se resuelve ningún socio.
    const anon = await app.inject({
      method: "GET",
      url: "/api/sessions/free-blocks",
    });
    expect(anon.statusCode).toBe(401);

    // Online con programa activo (sin suscripción presencial).
    const online = await createTestMember(app);
    await app.db
      .update(schema.users)
      .set({ level: LEVEL })
      .where(
        and(
          tenantWhere(schema.users, CTX_TEMPLO),
          eq(schema.users.id, online.id),
        ),
      );
    const [program] = await app.db
      .insert(schema.programs)
      .values(
        tenantValues(CTX_TEMPLO, {
          name: `Programa online 197-07 ${online.id}`,
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
          userId: online.id,
          programId: program.id,
          status: "active" as const,
          // source es NOT NULL sin default (fase 112).
          source: "plan_linked" as const,
          currentWeek: 1,
          sessionsCompletedThisWeek: 0,
        }),
      )
      .$returningId();
    await app.db
      .update(schema.users)
      .set({ currentProgramEnrollmentId: enrollment.id })
      .where(
        and(
          tenantWhere(schema.users, CTX_TEMPLO),
          eq(schema.users.id, online.id),
        ),
      );

    const conPrograma = await getList("", online.token);
    expect(conPrograma.status).toBe(200);
    expect(conPrograma.body.total).toBe(1);
  });

  it("AURA: auraAvailableToday es true sin filas, sigue true con una de ayer o sin cobrar, y pasa a false con una cobrada hoy", async () => {
    const [blockId] = await seed(monday, LEVEL, [
      { role: "NUCLEUS", route: "OAP", exerciseIds: [await ex()] },
    ]);

    async function insertRow(
      localDate: string,
      auraAwarded: boolean,
    ): Promise<void> {
      await app.db.insert(schema.extraBlocksCompleted).values(
        tenantValues(CTX_TEMPLO, {
          userId,
          sourceBlockId: blockId,
          sourceDayId: dayIdFor(monday, LEVEL),
          blockRole: "NUCLEUS",
          localDate,
          startedAt: new Date(),
          endedAt: new Date(),
          durationSeconds: 600,
          exercisesCompleted: [],
          auraAwarded,
        }),
      );
    }

    expect((await getList()).body.auraAvailableToday).toBe(true);

    // Ayer cobrada: no cuenta para hoy.
    await insertRow(shiftDate(today, -1), true);
    expect((await getList()).body.auraAvailableToday).toBe(true);

    // Hoy sin AURA (menos de 10'): no consume el cupo.
    await insertRow(today, false);
    expect((await getList()).body.auraAvailableToday).toBe(true);

    // Hoy cobrada: se acabó.
    await insertRow(today, true);
    const list = await getList();
    expect(list.body.auraAvailableToday).toBe(false);

    const one = await getOne(blockId);
    expect(one.status).toBe(200);
    expect(one.body.auraAvailableToday).toBe(false);

    // Otro socio no ve el cupo del primero.
    const other = await createPresencialMember(app, { level: LEVEL });
    const otherList = await getList("", other.token);
    expect(otherList.body.auraAvailableToday).toBe(true);
  });

  it("GET uno: un bloque válido da 200 con título 'Ruta · Formato'; GP, de mañana, INITIUM e inexistente dan 404", async () => {
    const [nucleusId, initiumId] = await seed(monday, LEVEL, [
      { role: "NUCLEUS", route: "OAP", exerciseIds: [await ex()] },
      { role: "INITIUM", route: "AF", exerciseIds: [await ex()] },
    ]);
    const [tomorrowId] = await seed(shiftDate(today, 1), LEVEL, [
      { role: "NUCLEUS", route: "OAP", exerciseIds: [await ex()] },
    ]);
    const yesterday = shiftDate(today, -1);
    const gpDayId = `GP-tren_inferior-W${dateToWeekNumber(yesterday)}-${dateToDayName(yesterday)}-${LEVEL}`;
    const [gpId] = await seed(
      yesterday,
      LEVEL,
      [{ role: "NUCLEUS", route: "OAP", exerciseIds: [await ex()] }],
      { dayId: gpDayId },
    );

    const ok = await getOne(nucleusId);
    expect(ok.status).toBe(200);
    expect(ok.body.item.blockId).toBe(nucleusId);
    expect(ok.body.item.title).toBe(`${getRouteLabel("OAP")} · AMRAP`);
    expect(ok.body.item.lastDate).toBe(monday);
    expect(ok.body.auraAvailableToday).toBe(true);

    for (const blockId of [
      gpId,
      tomorrowId,
      initiumId,
      "W1-lunes-sigma-NO_EXISTE",
    ]) {
      const res = await getOne(blockId);
      expect(res.status).toBe(404);
      expect(typeof res.body.error).toBe("string");
    }

    // El param no confiable se rechaza en el schema.
    const malformed = await app.inject({
      method: "GET",
      url: "/api/sessions/free-blocks/bloque%20con%20espacios",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(malformed.statusCode).toBe(400);
  });
});
