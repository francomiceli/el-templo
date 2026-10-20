/**
 * Fase 197 Plan 04 (D-03, D-10): cada bloque de /api/sessions/weekly y
 * /api/sessions/daily trae `zones` (unión de las zonas de sus ejercicios main)
 * y `groups` (grupos de chip de la tab Libre).
 *
 * - La movilidad pegada al bloque NO aporta zonas (igual que la TV).
 * - Un bloque ROM sin categorías cae al fallback por rol.
 * - Un bloque sin categorías trae `zones: []` y `groups: []` (las claves
 *   nunca faltan).
 *
 * Todas las fechas salen de `todayInTz` + `mondayOf`; los ids, de las fábricas.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData } from "../helpers";
import { todayInTz } from "../../src/modules/shared/date-utils";
import {
  dateToDayName,
  dateToWeekNumber,
  mondayOf,
} from "../../src/modules/shared/week-dates";
import {
  createPresencialMember,
  dayIdFor,
  seedExercise,
  seedSession,
} from "./_free-blocks-fixtures";

const AR_TZ = "America/Argentina/Buenos_Aires";
const LEVEL = "sigma";

interface BlockZonesPayload {
  role: string;
  zones: string[];
  groups: string[];
}

interface SessionPayload {
  blocks: BlockZonesPayload[];
}

function blockOf(session: SessionPayload, role: string): BlockZonesPayload {
  const block = session.blocks.find((b) => b.role === role);
  if (!block) throw new Error(`Falta el bloque ${role} en la respuesta`);
  return block;
}

describe("zones/groups por bloque en /weekly y /daily (197-04)", () => {
  let app: FastifyInstance;
  let token: string;
  let monday: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    monday = mondayOf(todayInTz(AR_TZ));

    const member = await createPresencialMember(app, { level: LEVEL });
    token = member.token;

    const pullV = await seedExercise(app, {
      name: "Dominada 197-04",
      category: "PULL VERTICAL",
      route: "OAP",
    });
    const kneeD = await seedExercise(app, {
      name: "Sentadilla 197-04",
      category: "KNEE DOMINANT",
      route: "SS",
    });
    // Movilidad con categoría de empuje: NO debe encender pecho/hombros/tríceps.
    const mobilityPush = await seedExercise(app, {
      name: "Movilidad empuje 197-04",
      category: "PUSH HORIZONTAL",
      route: "AF",
    });
    const sinCategoriaA = await seedExercise(app, {
      name: "Coordinativo A 197-04",
    });
    const sinCategoriaB = await seedExercise(app, {
      name: "Coordinativo B 197-04",
    });
    const romA = await seedExercise(app, {
      name: "ROM core A 197-04",
      category: "MOVILIDAD",
    });
    const romB = await seedExercise(app, {
      name: "ROM core B 197-04",
      category: "MOVILIDAD",
    });

    await seedSession(app, {
      dayId: dayIdFor(monday, LEVEL),
      week: dateToWeekNumber(monday),
      day: dateToDayName(monday),
      levelGroup: LEVEL,
      blocks: [
        {
          role: "NUCLEUS",
          route: "OAP",
          exerciseIds: [pullV, kneeD],
          mobilityExerciseId: mobilityPush,
        },
        {
          role: "DEUTEROS_1",
          route: "AF",
          exerciseIds: [sinCategoriaA, sinCategoriaB],
        },
        {
          role: "ROM_CORE",
          route: "AF",
          exerciseIds: [romA, romB],
        },
      ],
    });
  });

  it("/weekly: NUCLEUS trae la unión ordenada de sus main, sin la movilidad", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/sessions/weekly?weekStart=${monday}&view=templo`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      sessions: Record<string, SessionPayload | null>;
    };
    const session = body.sessions[monday];
    expect(session).not.toBeNull();

    const nucleus = blockOf(session as SessionPayload, "NUCLEUS");
    // PULL VERTICAL + KNEE DOMINANT, en el orden de ZONAS_ORDEN.
    expect(nucleus.zones).toEqual([
      "biceps",
      "forearm",
      "upper-back",
      "gluteal",
      "quadriceps",
      "adductors",
    ]);
    expect(nucleus.zones).not.toContain("chest");
    expect(nucleus.zones).not.toContain("deltoids");
    expect(nucleus.zones).not.toContain("triceps");
    // Orden de GRUPOS_ORDEN: espalda, piernas, brazos.
    expect(nucleus.groups).toEqual(["espalda", "piernas", "brazos"]);
  });

  it("/weekly: bloque sin categorías -> zones y groups vacíos (las claves existen)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/sessions/weekly?weekStart=${monday}&view=templo`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      sessions: Record<string, SessionPayload | null>;
    };
    const deuteros = blockOf(
      body.sessions[monday] as SessionPayload,
      "DEUTEROS_1",
    );
    expect(deuteros.zones).toEqual([]);
    expect(deuteros.groups).toEqual([]);
  });

  it("/weekly: ROM_CORE sin categorías de fuerza cae al fallback por rol", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/sessions/weekly?weekStart=${monday}&view=templo`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      sessions: Record<string, SessionPayload | null>;
    };
    const rom = blockOf(body.sessions[monday] as SessionPayload, "ROM_CORE");
    expect(rom.zones).toEqual(["lower-back", "abs", "obliques"]);
    expect(rom.groups).toEqual(["espalda", "core"]);
  });

  it("/daily: mismos zones y groups por bloque que /weekly", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/sessions/daily?date=${monday}&view=templo`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const session = JSON.parse(res.body) as SessionPayload;

    const nucleus = blockOf(session, "NUCLEUS");
    expect(nucleus.zones).toEqual([
      "biceps",
      "forearm",
      "upper-back",
      "gluteal",
      "quadriceps",
      "adductors",
    ]);
    expect(nucleus.zones).not.toContain("chest");
    expect(nucleus.groups).toEqual(["espalda", "piernas", "brazos"]);

    const deuteros = blockOf(session, "DEUTEROS_1");
    expect(deuteros.zones).toEqual([]);
    expect(deuteros.groups).toEqual([]);

    const rom = blockOf(session, "ROM_CORE");
    expect(rom.zones).toEqual(["lower-back", "abs", "obliques"]);
    expect(rom.groups).toEqual(["espalda", "core"]);
  });
});
