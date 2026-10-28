/**
 * Fase 197 Plan 04 (D-03, D-10) + fase 200 (D17, D18, D20): cada bloque de
 * /api/sessions/weekly y /api/sessions/daily trae `zones` (unión de las zonas de
 * sus ejercicios main), `groups` (grupos de chip de la tab Libre) y `zoneHits`
 * (por zona, qué músculos trabaja fuerte / sostiene / estira).
 *
 * Fase 200 D20: las zonas salen de la RUTA del ejercicio (modelo de anatomía),
 * no de su categoría. Las expectativas de cableado se calculan con las
 * funciones del modelo (`zonasDeRuta`, `zoneHitsDeRutas`); los valores
 * literales los fija test/anatomy/projection-parity. Acá quedan invariantes
 * literales (OAP+SS incluye quadriceps; dorsal en upper-back).
 *
 * - La movilidad pegada al bloque NO aporta zonas (igual que la TV).
 * - Un bloque ROM sin ruta cae al fallback por rol (`movilidad: true`).
 * - Un bloque sin ruta trae `zones: []`, `groups: []` y `zoneHits: {}` (las
 *   claves nunca faltan). Un ejercicio con ruta AF SÍ trae zonas.
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
  ZONAS_ORDEN,
  gruposDeZonas,
  zonasDeRuta,
} from "../../src/modules/anatomy/projection";
import type { ZonaSlug } from "../../src/modules/anatomy/content/regiones";
import { zoneHitsDeRutas } from "../../src/modules/anatomy/zone-hits";
import { RUTAS_POR_CODIGO } from "../../src/modules/anatomy/content/rutas";
import { GRUPO_DE_ROL, ROLES } from "../../src/modules/anatomy/types";
import {
  createPresencialMember,
  dayIdFor,
  seedExercise,
  seedSession,
} from "./_free-blocks-fixtures";

const AR_TZ = "America/Argentina/Buenos_Aires";
const LEVEL = "sigma";

interface ZoneHitsPayload {
  fuerte: string[];
  sostiene: string[];
  estira: string[];
  rutas: { ruta: string; grupo: "fuerte" | "sostiene" | "estira" }[];
  movilidad?: true;
  sinDetalle?: true;
}

interface BlockZonesPayload {
  role: string;
  zones: ZonaSlug[];
  groups: string[];
  zoneHits: Record<string, ZoneHitsPayload>;
}

interface SessionPayload {
  blocks: BlockZonesPayload[];
}

/** Unión de las zonas de las rutas dadas, en el orden de `ZONAS_ORDEN`. */
function unionDeRutas(...codes: string[]): ZonaSlug[] {
  return ZONAS_ORDEN.filter((z) =>
    codes.some((c) => zonasDeRuta(c).includes(z)),
  );
}

/** Ids de músculo con un rol dado en una ruta del modelo. */
function musculosDeRol(code: string, rol: (typeof ROLES)[number]): string[] {
  const ruta = RUTAS_POR_CODIGO.get(code);
  if (!ruta) throw new Error(`Falta la ruta ${code} en el modelo`);
  return ruta.relaciones[rol].map((rel) => rel.m);
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

    // Fase 200 D20: las zonas salen de la ruta. NUCLEUS = OAP (tracción) + SS
    // (sentadilla); la categoría queda solo como dato de la columna.
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
    // Movilidad con ruta de empuje (HD/ID): NO debe encender hombros ni tríceps
    // (OAP y SS no los tienen: son las que distinguen que la movilidad no cuenta).
    const mobilityPush = await seedExercise(app, {
      name: "Movilidad empuje 197-04",
      category: "PUSH HORIZONTAL",
      route: "HD/ID",
    });
    // Sin ruta (ni categoría con fallback): no aportan zonas.
    const sinRutaA = await seedExercise(app, {
      name: "Coordinativo A 197-04",
    });
    const sinRutaB = await seedExercise(app, {
      name: "Coordinativo B 197-04",
    });
    // Ruta AF (fase 200): ya NO es "sin zonas", AF tiene zonas en el modelo.
    const conAF = await seedExercise(app, {
      name: "Ejercicio AF 200-08",
      route: "AF",
    });
    // FL tiene antagonistas en el modelo (trap-sup, erectores): no deben viajar.
    const conFL = await seedExercise(app, {
      name: "Ejercicio FL 200-08",
      route: "FL",
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
          role: "INITIUM",
          route: "AF",
          exerciseIds: [sinRutaA],
        },
        {
          role: "DEUTEROS_1",
          route: "AF",
          exerciseIds: [sinRutaA, sinRutaB],
        },
        {
          role: "ATHLOS",
          route: "AF",
          exerciseIds: [conAF],
        },
        {
          role: "EPIKOS",
          route: "FL",
          exerciseIds: [conFL],
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
    // OAP + SS: unión de las zonas de ambas rutas, en el orden de ZONAS_ORDEN.
    expect(nucleus.zones).toEqual(unionDeRutas("OAP", "SS"));
    // Invariantes literales: SS aporta cuádriceps, OAP la espalda alta.
    expect(nucleus.zones).toContain("quadriceps");
    expect(nucleus.zones).toContain("upper-back");
    // La movilidad (HD/ID) no cuenta: hombros y tríceps no son de OAP ni SS.
    expect(nucleus.zones).not.toContain("deltoids");
    expect(nucleus.zones).not.toContain("triceps");
    expect(nucleus.groups).toEqual(gruposDeZonas(nucleus.zones));
  });

  it("/weekly: bloque sin ruta -> zones y groups vacíos (las claves existen)", async () => {
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

  it("/weekly: un ejercicio con ruta AF ya no da zonas vacías (fase 200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/sessions/weekly?weekStart=${monday}&view=templo`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      sessions: Record<string, SessionPayload | null>;
    };
    const athlos = blockOf(body.sessions[monday] as SessionPayload, "ATHLOS");
    expect(athlos.zones).toEqual(zonasDeRuta("AF"));
    expect(athlos.zones.length).toBeGreaterThan(0);
    expect(athlos.groups).toEqual(gruposDeZonas(zonasDeRuta("AF")));
  });

  it("/weekly: ROM_CORE sin ruta cae al fallback por rol", async () => {
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

  it("/weekly: cada bloque trae zoneHits (Hoy en tu clase, D17)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/sessions/weekly?weekStart=${monday}&view=templo`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      sessions: Record<string, SessionPayload | null>;
    };
    const session = body.sessions[monday] as SessionPayload;

    // (1) NUCLEUS = OAP + SS: los hits de ambas rutas, con el dorsal fuerte en
    // la espalda alta (dorsal es motor de OAP).
    const nucleus = blockOf(session, "NUCLEUS");
    expect(nucleus.zoneHits).toEqual(
      JSON.parse(JSON.stringify(zoneHitsDeRutas(["OAP", "SS"]))),
    );
    expect(nucleus.zoneHits["upper-back"].fuerte).toContain("dorsal");
    expect(nucleus.zoneHits.quadriceps.fuerte).toContain("vastos");
    // Rol por ruta (orden de aparición del bloque): OAP trae el dorsal fuerte;
    // SS trae los vastos fuertes; el serrato (profundo) hace que OAP cuente en
    // pecho y el manguito que OAP cuente en hombros aunque solo sostenga.
    expect(nucleus.zoneHits["upper-back"].rutas).toEqual([
      { ruta: "OAP", grupo: "fuerte" },
    ]);
    expect(nucleus.zoneHits.quadriceps.rutas).toEqual([
      { ruta: "SS", grupo: "fuerte" },
    ]);
    expect(nucleus.zoneHits.deltoids.sostiene).toContain("manguito");
    expect(nucleus.zoneHits.deltoids.rutas).toEqual([
      { ruta: "OAP", grupo: "sostiene" },
    ]);
    expect(nucleus.zoneHits.chest.sostiene).toContain("serrato");
    // Cada zona pintada tiene su entrada (chip y hoja coherentes con el cuerpo, D18).
    for (const zona of nucleus.zones) {
      expect(Object.keys(nucleus.zoneHits)).toContain(zona);
    }
    // La movilidad (HD/ID) no suma hits: ninguna zona exclusiva de HD/ID.
    expect(nucleus.zoneHits.triceps).toBeUndefined();

    // (2a) INITIUM sin ruta en sus ejercicios -> {}.
    expect(blockOf(session, "INITIUM").zoneHits).toEqual({});
    expect(blockOf(session, "DEUTEROS_1").zoneHits).toEqual({});

    // (2b) ROM_CORE sin ruta: exactamente las zonas del fallback, con
    // movilidad y sin músculos inventados (D18).
    const rom = blockOf(session, "ROM_CORE");
    expect(Object.keys(rom.zoneHits)).toEqual(rom.zones);
    expect(rom.zones.length).toBeGreaterThan(0);
    for (const hits of Object.values(rom.zoneHits)) {
      expect(hits).toEqual({
        fuerte: [],
        sostiene: [],
        estira: [],
        rutas: [],
        movilidad: true,
      });
    }

    // (3) El antagonista nunca viaja (D14): FL tiene antagonistas en el
    // modelo (trap-sup, erectores) y ninguno aparece en sus hits.
    const antagonistas = musculosDeRol("FL", "antagonista");
    expect(antagonistas.length).toBeGreaterThan(0);
    const delRol = new Set(
      ROLES.filter((rol) => GRUPO_DE_ROL[rol] !== null).flatMap((rol) =>
        musculosDeRol("FL", rol),
      ),
    );
    const epikos = blockOf(session, "EPIKOS");
    const enviados = Object.values(epikos.zoneHits).flatMap((h) => [
      ...h.fuerte,
      ...h.sostiene,
      ...h.estira,
    ]);
    expect(enviados.length).toBeGreaterThan(0);
    for (const id of enviados) {
      expect(antagonistas).not.toContain(id);
      expect(delRol.has(id)).toBe(true);
    }
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
    expect(nucleus.zones).toEqual(unionDeRutas("OAP", "SS"));
    expect(nucleus.zones).toContain("quadriceps");
    expect(nucleus.zones).not.toContain("deltoids");
    expect(nucleus.groups).toEqual(gruposDeZonas(nucleus.zones));
    expect(nucleus.zoneHits).toEqual(
      JSON.parse(JSON.stringify(zoneHitsDeRutas(["OAP", "SS"]))),
    );

    const deuteros = blockOf(session, "DEUTEROS_1");
    expect(deuteros.zones).toEqual([]);
    expect(deuteros.groups).toEqual([]);

    const rom = blockOf(session, "ROM_CORE");
    expect(rom.zones).toEqual(["lower-back", "abs", "obliques"]);
    expect(rom.groups).toEqual(["espalda", "core"]);
  });
});
