/**
 * Fallback de video entre copias del mismo ejercicio (2026-10-08).
 *
 * El catálogo tiene varias filas con el mismo nombre (variantes por
 * contracción/ruta y re-altas) y el video suele estar cargado en UNA sola.
 * Lo que ve el alumno (plani en la app, TV, ajuste de ejercicio, programas)
 * tiene que mostrar el clip de una copia hermana cuando la fila prescrita no
 * tiene el suyo. Integración contra MySQL: lo que se prueba es el self-join.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import {
  buildVideoResolver,
  findSiblingVideoUrls,
  isMissingVideo,
} from "../../src/modules/shared/exercise-video-fallback";
import { SessionGeneratorService } from "../../src/modules/sessions/service";
import { resolveClassDay } from "../../src/modules/tv/class-day";

/** Gimnasio ajeno propio de este archivo (ids tomados: ver second-tenant.ts). */
const TENANT_AJENO = 90881;

// Semana 1 del ancla SPOM (WEEK_ONE_MONDAY = 2026-02-23, lunes).
const TUESDAY_NOON_UTC = new Date("2026-02-24T15:00:00Z");

let app: FastifyInstance;

async function seedExercise(opts: {
  name: string;
  route?: string;
  videoUrl?: string | null;
  tenantId?: number;
}): Promise<number> {
  const [row] = await app.db
    .insert(schema.exercises)
    .values({
      ...(opts.tenantId !== undefined ? { tenantId: opts.tenantId } : {}),
      pattern: "LOWER",
      category: "KNEE DOMINANT",
      exercise: opts.name,
      effort: "CON",
      route: opts.route ?? "SS",
      videoUrl: opts.videoUrl ?? null,
    })
    .$returningId();
  return row.id;
}

async function limpiarTenantAjeno(): Promise<void> {
  await app.db
    .delete(schema.exercises)
    .where(eq(schema.exercises.tenantId, TENANT_AJENO));
  await app.db.delete(schema.tenants).where(eq(schema.tenants.id, TENANT_AJENO));
}

/** Sesión aprobada con un bloque y una prescripción por ejercicio dado. */
async function seedSession(dayId: string, exerciseIds: number[]) {
  const [session] = await app.db
    .insert(schema.sessions)
    .values({
      dayId,
      week: 1,
      day: "martes",
      levelGroup: "alfa_delta",
      blockCount: 1,
      status: "approved",
    })
    .$returningId();
  const [block] = await app.db
    .insert(schema.sessionBlocks)
    .values({
      sessionId: session.id,
      blockId: `B-${session.id}`,
      role: "INITIUM",
      route: "SS",
      pattern: "LOWER",
      intensity: 70,
      repsBudget: 40,
      formatId: 1,
      formatName: "AMRAP",
      formatParams: { type: "amrap", minutes: 10 },
      exerciseCount: exerciseIds.length,
      sortOrder: 0,
    })
    .$returningId();
  await app.db.insert(schema.sessionPrescriptions).values(
    exerciseIds.map((exerciseId, i) => ({
      blockId: block.id,
      exerciseId,
      exerciseName: `Ejercicio ${i}`,
      contraction: "CON",
      reps: 10,
      seconds: 0,
      rest: 60,
      sortOrder: i,
      exerciseType: "main",
    })),
  );
}

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarTenantAjeno();
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  await limpiarTenantAjeno();
});

describe("isMissingVideo", () => {
  it("NULL, undefined, vacío y solo espacios cuentan como sin video", () => {
    expect(isMissingVideo(null)).toBe(true);
    expect(isMissingVideo(undefined)).toBe(true);
    expect(isMissingVideo("")).toBe(true);
    expect(isMissingVideo("   ")).toBe(true);
    expect(isMissingVideo("exercises/1.mp4")).toBe(false);
  });
});

describe("findSiblingVideoUrls — copia hermana con video", () => {
  it("devuelve el video de otra copia con el mismo nombre", async () => {
    const sinVideo = await seedExercise({ name: "CRAB WALK" });
    await seedExercise({ name: "CRAB WALK", videoUrl: "exercises/crab.mp4" });

    const map = await findSiblingVideoUrls(app.db, [sinVideo]);

    expect(map.get(sinVideo)).toBe("exercises/crab.mp4");
  });

  it("matchea el nombre sin importar mayúsculas ni espacios en los bordes", async () => {
    const sinVideo = await seedExercise({ name: "  Crab Walk " });
    await seedExercise({ name: "CRAB WALK", videoUrl: "exercises/crab.mp4" });

    const map = await findSiblingVideoUrls(app.db, [sinVideo]);

    expect(map.get(sinVideo)).toBe("exercises/crab.mp4");
  });

  it("NO matchea nombres distintos aunque uno contenga al otro", async () => {
    const sinVideo = await seedExercise({ name: "SISSY SQ" });
    await seedExercise({ name: "SISSY SQ W", videoUrl: "exercises/w.mp4" });

    const map = await findSiblingVideoUrls(app.db, [sinVideo]);

    expect(map.has(sinVideo)).toBe(false);
  });

  it("ignora copias cuyo video es vacío o solo espacios", async () => {
    const sinVideo = await seedExercise({ name: "BEAST" });
    await seedExercise({ name: "BEAST", videoUrl: "" });
    await seedExercise({ name: "BEAST", videoUrl: "   " });

    const map = await findSiblingVideoUrls(app.db, [sinVideo]);

    expect(map.has(sinVideo)).toBe(false);
  });

  it("prefiere la copia de la MISMA ruta aunque haya otra más nueva", async () => {
    const sinVideo = await seedExercise({ name: "LOW BRIDGE", route: "HT" });
    await seedExercise({
      name: "LOW BRIDGE",
      route: "HT",
      videoUrl: "exercises/ht.mp4",
    });
    // Más nueva (id mayor) pero de otra ruta: pierde.
    await seedExercise({
      name: "LOW BRIDGE",
      route: "BRIDGE",
      videoUrl: "exercises/bridge.mp4",
    });

    const map = await findSiblingVideoUrls(app.db, [sinVideo]);

    expect(map.get(sinVideo)).toBe("exercises/ht.mp4");
  });

  it("si no hay copia de la misma ruta, usa una de otra ruta", async () => {
    const sinVideo = await seedExercise({ name: "LOW BRIDGE", route: "HT" });
    await seedExercise({
      name: "LOW BRIDGE",
      route: "BRIDGE",
      videoUrl: "exercises/bridge.mp4",
    });

    const map = await findSiblingVideoUrls(app.db, [sinVideo]);

    expect(map.get(sinVideo)).toBe("exercises/bridge.mp4");
  });

  it("entre copias de la misma ruta, gana la más nueva (id mayor)", async () => {
    const sinVideo = await seedExercise({ name: "PQ", route: "SU" });
    await seedExercise({ name: "PQ", route: "SU", videoUrl: "exercises/vieja.mp4" });
    await seedExercise({ name: "PQ", route: "SU", videoUrl: "exercises/nueva.mp4" });

    const map = await findSiblingVideoUrls(app.db, [sinVideo]);

    expect(map.get(sinVideo)).toBe("exercises/nueva.mp4");
  });

  it("NO toma el video de una copia de OTRO gimnasio", async () => {
    await app.db.insert(schema.tenants).values({
      id: TENANT_AJENO,
      name: "Gimnasio ajeno video fallback",
      slug: `test-video-fallback-${TENANT_AJENO}`,
      status: "active",
    });
    const sinVideo = await seedExercise({ name: "CRAB WALK" });
    await seedExercise({
      name: "CRAB WALK",
      videoUrl: "exercises/ajeno.mp4",
      tenantId: TENANT_AJENO,
    });

    const map = await findSiblingVideoUrls(app.db, [sinVideo]);

    expect(map.has(sinVideo)).toBe(false);
  });

  it("sin copias, con ids inexistentes o con lista vacía devuelve Map vacío", async () => {
    const solo = await seedExercise({ name: "UNICO" });

    expect((await findSiblingVideoUrls(app.db, [solo])).size).toBe(0);
    expect((await findSiblingVideoUrls(app.db, [999999999])).size).toBe(0);
    expect((await findSiblingVideoUrls(app.db, [])).size).toBe(0);
  });

  it("resuelve varios ids en una sola llamada (ids repetidos incluidos)", async () => {
    const a = await seedExercise({ name: "A" });
    const b = await seedExercise({ name: "B" });
    await seedExercise({ name: "A", videoUrl: "exercises/a.mp4" });
    await seedExercise({ name: "B", videoUrl: "exercises/b.mp4" });

    const map = await findSiblingVideoUrls(app.db, [a, b, a]);

    expect(map.get(a)).toBe("exercises/a.mp4");
    expect(map.get(b)).toBe("exercises/b.mp4");
  });
});

describe("buildVideoResolver", () => {
  it("video propio > copia hermana > null", async () => {
    const propio = await seedExercise({
      name: "X",
      videoUrl: "exercises/propio.mp4",
    });
    const sinVideo = await seedExercise({ name: "X" });
    const huerfano = await seedExercise({ name: "HUERFANO" });

    const resolve = await buildVideoResolver(app.db, [
      { exerciseId: propio, videoUrl: "exercises/propio.mp4" },
      { exerciseId: sinVideo, videoUrl: null },
      { exerciseId: huerfano, videoUrl: "" },
      { exerciseId: null, videoUrl: null },
    ]);

    expect(resolve(propio, "exercises/propio.mp4")).toBe("exercises/propio.mp4");
    expect(resolve(sinVideo, null)).toBe("exercises/propio.mp4");
    expect(resolve(huerfano, "")).toBeNull();
    expect(resolve(null, null)).toBeNull();
  });
});

describe("call sites — lo que ve el alumno", () => {
  it("SessionGeneratorService.getSessionsByDayIds usa el video de la copia hermana", async () => {
    const sinVideo = await seedExercise({ name: "CRAB WALK" });
    await seedExercise({ name: "CRAB WALK", videoUrl: "exercises/crab.mp4" });
    const conVideo = await seedExercise({
      name: "BEAST",
      videoUrl: "exercises/beast.mp4",
    });
    const huerfano = await seedExercise({ name: "HUERFANO" });
    await seedSession("W1-martes-alfa", [sinVideo, conVideo, huerfano]);

    const service = new SessionGeneratorService(app.db);
    const sessions = await service.getSessionsByDayIds(["W1-martes-alfa"]);
    const exercises = sessions.get("W1-martes-alfa")!.blocks[0].exercises;

    expect(exercises.map((e) => e.videoUrl)).toEqual([
      "exercises/crab.mp4",
      "exercises/beast.mp4",
      undefined,
    ]);
  });

  it("resolveClassDay (TV) usa el video de la copia hermana", async () => {
    const [branch] = await app.db
      .insert(schema.branches)
      .values({
        name: "TV-VIDEO",
        code: `TVV${Date.now().toString(36).slice(-5)}`,
        country: "AR",
        timezone: "America/Argentina/Buenos_Aires",
      })
      .$returningId();
    await app.db.delete(schema.dayModes).where(eq(schema.dayModes.dayOfWeek, 2));
    await app.db.insert(schema.dayModes).values({
      dayOfWeek: 2,
      sessionMode: "regular",
    });
    const sinVideo = await seedExercise({ name: "CRAB WALK" });
    await seedExercise({ name: "CRAB WALK", videoUrl: "exercises/crab.mp4" });
    await seedSession("W1-martes-alfa", [sinVideo]);

    const classDay = await resolveClassDay(
      app.db,
      { id: branch.id, timezone: "America/Argentina/Buenos_Aires" },
      TUESDAY_NOON_UTC,
    );

    const prescription = classDay.sessions[0].blocks[0].prescriptions[0];
    expect(prescription.videoKey).toBe("exercises/crab.mp4");
  });
});
