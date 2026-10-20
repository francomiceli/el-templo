/**
 * Fase 197 Plan 08 (D-12, D-13, D-14): cierre del bloque libre y AURA del día.
 *
 *   POST /api/sessions/free-blocks/complete
 *
 * Reloj: "hoy" se fija (solo `Date`) en el último miércoles a las 15:00 UTC
 * (12:00 de Buenos Aires), calculado desde el `Date.now()` real y acotado a la
 * semana 51 del plan. El reloj se fija ANTES de loguear y se restaura en
 * `afterEach`. Con el reloj congelado, `startedAt` = reloj − N minutos da una
 * duración exacta.
 *
 * `aura_config` NO se puede dar por sembrada (otros archivos la borran): la
 * fuente `extra_block` se re-siembra en cada `beforeEach`. La sede 1 se fuerza a
 * Buenos Aires (otros archivos le cambian la zona horaria).
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

interface CompletePayload {
  completionId: number;
  durationSeconds: number;
  auraAwarded: boolean;
  auraAvailableToday: boolean;
  error?: string;
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

describe("cierre del bloque libre: POST /api/sessions/free-blocks/complete (197-08)", () => {
  let app: FastifyInstance;
  let token: string;
  let userId: number;
  let today: string;
  let wednesday: string;
  let exerciseSeq = 0;
  // Bloque A (ayer, 3 ejercicios) y bloque B (anteayer, 2 ejercicios).
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

    const member = await createPresencialMember(app, { level: LEVEL });
    token = member.token;
    userId = member.id;

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
      name: `Ejercicio 197-08 ${exerciseSeq}`,
      category,
    });
  }

  /** Sesión aprobada de `date` para el nivel del socio. */
  async function seed(
    date: string,
    blocks: Parameters<typeof seedSession>[1]["blocks"],
    dayId: string = dayIdFor(date, LEVEL),
  ): Promise<string[]> {
    const { blockIds } = await seedSession(app, {
      dayId,
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

  async function postComplete(
    body: Record<string, unknown>,
    authToken: string = token,
  ): Promise<{ status: number; body: CompletePayload }> {
    const res = await app.inject({
      method: "POST",
      url: "/api/sessions/free-blocks/complete",
      headers: { authorization: `Bearer ${authToken}` },
      payload: body,
    });
    return {
      status: res.statusCode,
      body: JSON.parse(res.body) as CompletePayload,
    };
  }

  async function filas(forUser: number = userId) {
    return app.db
      .select()
      .from(schema.extraBlocksCompleted)
      .where(
        and(
          tenantWhere(schema.extraBlocksCompleted, CTX_TEMPLO),
          eq(schema.extraBlocksCompleted.userId, forUser),
        ),
      );
  }

  async function auraTx(forUser: number = userId) {
    return app.db
      .select({
        sourceType: schema.auraTransactions.sourceType,
        amount: schema.auraTransactions.amount,
        referenceType: schema.auraTransactions.referenceType,
        referenceId: schema.auraTransactions.referenceId,
      })
      .from(schema.auraTransactions)
      .where(
        and(
          eq(schema.auraTransactions.userId, forUser),
          eq(schema.auraTransactions.sourceType, "extra_block"),
        ),
      );
  }

  async function balance(forUser: number = userId): Promise<number> {
    const [row] = await app.db
      .select({ balance: schema.auraBalances.balance })
      .from(schema.auraBalances)
      .where(eq(schema.auraBalances.userId, forUser));
    return row?.balance ?? 0;
  }

  function dayKey(localDate: string): number {
    return Number(localDate.replace(/-/g, ""));
  }

  // ─── casos ─────────────────────────────────────────────────────────────

  it("guarda: duración del servidor, fecha local de la sede y solo los ejercicios del bloque", async () => {
    const ajeno = await ex("PECHO");
    const { status, body } = await postComplete({
      blockId: blockA,
      startedAt: minutesAgo(12),
      exercisesCompleted: [idsA[0], idsA[1], ajeno],
    });

    expect(status).toBe(200);
    expect(body.durationSeconds).toBeGreaterThanOrEqual(718);
    expect(body.durationSeconds).toBeLessThanOrEqual(722);

    const rows = await filas();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(body.completionId);
    expect(rows[0].durationSeconds).toBeGreaterThanOrEqual(718);
    expect(rows[0].durationSeconds).toBeLessThanOrEqual(722);
    expect(rows[0].localDate).toBe(todayInTz(AR_TZ));
    expect(rows[0].sourceBlockId).toBe(blockA);
    expect(rows[0].sourceDayId).toBe(dayIdFor(shiftDate(today, -1), LEVEL));
    expect(rows[0].blockRole).toBe("NUCLEUS");
    // El id ajeno al bloque se descarta.
    expect(rows[0].exercisesCompleted).toEqual([idsA[0], idsA[1]]);
  });

  it("10' sí: acredita 5 AURA (extra_block / extra_block_day / YYYYMMDD local) y agota el cupo del día", async () => {
    const before = await balance();
    const { status, body } = await postComplete({
      blockId: blockA,
      startedAt: minutesAgo(12),
      exercisesCompleted: idsA,
    });

    expect(status).toBe(200);
    expect(body.auraAwarded).toBe(true);
    expect(body.auraAvailableToday).toBe(false);

    const tx = await auraTx();
    expect(tx).toHaveLength(1);
    expect(tx[0].amount).toBe(5);
    expect(tx[0].referenceType).toBe("extra_block_day");
    expect(tx[0].referenceId).toBe(dayKey(todayInTz(AR_TZ)));
    expect(await balance()).toBe(before + 5);

    const rows = await filas();
    expect(rows[0].auraAwarded).toBe(true);
  });

  it("menos de 10' no: se guarda sin AURA y el cupo queda intacto para el próximo bloque", async () => {
    const before = await balance();
    const corto = await postComplete({
      blockId: blockA,
      startedAt: minutesAgo(5),
      exercisesCompleted: idsA,
    });
    expect(corto.status).toBe(200);
    expect(corto.body.auraAwarded).toBe(false);
    expect(corto.body.auraAvailableToday).toBe(true);
    expect(await auraTx()).toHaveLength(0);
    expect(await balance()).toBe(before);
    const rows = await filas();
    expect(rows).toHaveLength(1);
    expect(rows[0].auraAwarded).toBe(false);

    // El bloque corto no consumió el cupo: el siguiente de 11' acredita.
    const largo = await postComplete({
      blockId: blockB,
      startedAt: minutesAgo(11),
      exercisesCompleted: [],
    });
    expect(largo.status).toBe(200);
    expect(largo.body.auraAwarded).toBe(true);
    expect(largo.body.auraAvailableToday).toBe(false);
    expect(await auraTx()).toHaveLength(1);
    expect(await balance()).toBe(before + 5);
  });

  it("primero sí, segundo no: dos cierres de >= 10' guardan 2 filas y acreditan una sola vez", async () => {
    const primero = await postComplete({
      blockId: blockA,
      startedAt: minutesAgo(12),
      exercisesCompleted: idsA,
    });
    const segundo = await postComplete({
      blockId: blockB,
      startedAt: minutesAgo(15),
      exercisesCompleted: [],
    });

    expect(primero.body.auraAwarded).toBe(true);
    expect(segundo.status).toBe(200);
    expect(segundo.body.auraAwarded).toBe(false);
    expect(segundo.body.auraAvailableToday).toBe(false);

    const rows = await filas();
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.auraAwarded)).toHaveLength(1);
    expect(await auraTx()).toHaveLength(1);
  });

  it("el candado del unique: con la AURA del día ya en el ledger, el cierre se guarda sin AURA y sin error", async () => {
    // Cobro previo del día fuera de extra_blocks_completed (flag sin marcar):
    // el unique unique_user_source_ref tiene que frenar el segundo award.
    await app.db.insert(schema.auraTransactions).values({
      userId,
      sourceType: "extra_block",
      amount: 5,
      referenceType: "extra_block_day",
      referenceId: dayKey(todayInTz(AR_TZ)),
      description: "cobro previo",
    });

    const { status, body } = await postComplete({
      blockId: blockA,
      startedAt: minutesAgo(12),
      exercisesCompleted: idsA,
    });

    expect(status).toBe(200);
    expect(body.auraAwarded).toBe(false);
    expect(await auraTx()).toHaveLength(1);
    const rows = await filas();
    expect(rows).toHaveLength(1);
    expect(rows[0].auraAwarded).toBe(false);
  });

  it("Seguir entrenando: con completionId actualiza la MISMA fila desde el inicio original y acredita al cruzar 10'", async () => {
    const before = await balance();
    const inicial = await postComplete({
      blockId: blockA,
      startedAt: minutesAgo(6),
      exercisesCompleted: [idsA[0]],
    });
    expect(inicial.body.auraAwarded).toBe(false);
    expect(inicial.body.auraAvailableToday).toBe(true);

    // Pasan 5 minutos más: 6' + 5' = 11'.
    vi.setSystemTime(new Date(Date.now() + 5 * MIN));
    const seguir = await postComplete({
      blockId: blockA,
      startedAt: minutesAgo(11),
      exercisesCompleted: [idsA[1]],
      completionId: inicial.body.completionId,
    });

    expect(seguir.status).toBe(200);
    expect(seguir.body.completionId).toBe(inicial.body.completionId);
    expect(seguir.body.durationSeconds).toBeGreaterThanOrEqual(658);
    expect(seguir.body.durationSeconds).toBeLessThanOrEqual(662);
    expect(seguir.body.auraAwarded).toBe(true);
    expect(seguir.body.auraAvailableToday).toBe(false);

    const rows = await filas();
    expect(rows).toHaveLength(1);
    expect(rows[0].durationSeconds).toBeGreaterThanOrEqual(658);
    expect(rows[0].durationSeconds).toBeLessThanOrEqual(662);
    expect(rows[0].auraAwarded).toBe(true);
    // Unión de los ejercicios de las dos vueltas.
    expect(rows[0].exercisesCompleted).toEqual([idsA[0], idsA[1]]);
    expect(await auraTx()).toHaveLength(1);
    expect(await balance()).toBe(before + 5);
  });

  it("zona de la sede: a las 02:30 UTC (23:30 en Buenos Aires) el día es el de la sede, no el UTC", async () => {
    // Reloj en la madrugada UTC del día siguiente; se loguea un socio nuevo
    // con ese reloj (el token del beforeEach ya venció).
    const nextUtcDay = shiftDate(wednesday, 1);
    vi.setSystemTime(new Date(`${nextUtcDay}T02:30:00Z`));
    const tardio = await createPresencialMember(app, { level: LEVEL });

    const sedeDate = todayInTz(AR_TZ);
    const utcDate = new Date().toISOString().slice(0, 10);
    expect(sedeDate).toBe(wednesday);
    expect(sedeDate).not.toBe(utcDate);

    const { status, body } = await postComplete(
      {
        blockId: blockA,
        startedAt: minutesAgo(12),
        exercisesCompleted: idsA,
      },
      tardio.token,
    );

    expect(status).toBe(200);
    expect(body.auraAwarded).toBe(true);
    const rows = await filas(tardio.id);
    expect(rows[0].localDate).toBe(sedeDate);
    const tx = await auraTx(tardio.id);
    expect(tx).toHaveLength(1);
    expect(tx[0].referenceId).toBe(dayKey(sedeDate));
    expect(tx[0].referenceId).not.toBe(dayKey(utcDate));
  });

  it("validaciones: startedAt futuro o de hace 5 h, bloque inexistente o GP, completionId ajeno y body con campos extra", async () => {
    // startedAt +5 min en el futuro -> 400
    const futuro = await postComplete({
      blockId: blockA,
      startedAt: new Date(Date.now() + 5 * MIN).toISOString(),
      exercisesCompleted: [],
    });
    expect(futuro.status).toBe(400);
    expect(futuro.body.error).toBe("startedAt invalido");

    // hace 5 h -> 400
    const viejo = await postComplete({
      blockId: blockA,
      startedAt: minutesAgo(5 * 60),
      exercisesCompleted: [],
    });
    expect(viejo.status).toBe(400);

    // startedAt que no es una fecha -> 400
    const roto = await postComplete({
      blockId: blockA,
      startedAt: "no-es-una-fecha",
      exercisesCompleted: [],
    });
    expect(roto.status).toBe(400);

    // blockId inexistente -> 404
    const inexistente = await postComplete({
      blockId: "W1-lunes-sigma-NO-EXISTE",
      startedAt: minutesAgo(12),
      exercisesCompleted: [],
    });
    expect(inexistente.status).toBe(404);

    // bloque de un plan de objetivo (GP-) -> 404
    const ayer = shiftDate(today, -1);
    const gpDayId = `GP-tren_inferior-W${dateToWeekNumber(ayer)}-${dateToDayName(ayer)}-${LEVEL}`;
    const [gpBlock] = await seed(
      ayer,
      [{ role: "NUCLEUS", route: "OAP", exerciseIds: [await ex("PECHO")] }],
      gpDayId,
    );
    const gp = await postComplete({
      blockId: gpBlock,
      startedAt: minutesAgo(12),
      exercisesCompleted: [],
    });
    expect(gp.status).toBe(404);

    // completionId de OTRO socio -> 404
    const otro = await createPresencialMember(app, { level: LEVEL });
    const ajena = await postComplete(
      {
        blockId: blockA,
        startedAt: minutesAgo(12),
        exercisesCompleted: [],
      },
      otro.token,
    );
    expect(ajena.status).toBe(200);
    const robo = await postComplete({
      blockId: blockA,
      startedAt: minutesAgo(12),
      exercisesCompleted: [],
      completionId: ajena.body.completionId,
    });
    expect(robo.status).toBe(404);
    // completionId de otro bloque -> 404 (el socio dueño, pero otro sourceBlockId)
    const otroBloque = await postComplete(
      {
        blockId: blockB,
        startedAt: minutesAgo(12),
        exercisesCompleted: [],
        completionId: ajena.body.completionId,
      },
      otro.token,
    );
    expect(otroBloque.status).toBe(404);

    // Ningún rechazo escribió filas ni AURA para el socio original.
    expect(await filas()).toHaveLength(0);
    expect(await auraTx()).toHaveLength(0);
  });

  it("un tenantId en el body se descarta: la fila queda en el gimnasio del token", async () => {
    // Fastify (ajv removeAdditional) saca los campos que el schema no declara:
    // no es un 400, pero el tenant nunca sale del body (D-13, tenancy).
    const res = await postComplete({
      blockId: blockA,
      startedAt: minutesAgo(12),
      exercisesCompleted: [],
      tenantId: 2,
    });
    expect(res.status).toBe(200);
    const rows = await filas();
    expect(rows).toHaveLength(1);
    expect(rows[0].tenantId).toBe(1);
  });

  it("gate: un socio sin plan recibe el mismo status que /weekly y no se escribe nada", async () => {
    const sinPlan = await createTestMember(app, { branchId: 1 });

    // /weekly exige weekStart: sin él respondería 400 de validación y no el gate.
    const monday = new Date(`${wednesday}T12:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - 2);
    const weekStart = monday.toISOString().slice(0, 10);
    const weekly = await app.inject({
      method: "GET",
      url: `/api/sessions/weekly?weekStart=${weekStart}`,
      headers: { authorization: `Bearer ${sinPlan.token}` },
    });
    expect(weekly.statusCode).toBeGreaterThanOrEqual(400);
    expect(weekly.statusCode).toBeLessThan(500);

    const { status } = await postComplete(
      {
        blockId: blockA,
        startedAt: minutesAgo(12),
        exercisesCompleted: idsA,
      },
      sinPlan.token,
    );
    expect(status).toBe(weekly.statusCode);
    expect(await filas(sinPlan.id)).toHaveLength(0);
    expect(await auraTx(sinPlan.id)).toHaveLength(0);
  });
});
