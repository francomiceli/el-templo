import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken } from "../helpers";
import { eq, inArray, asc } from "drizzle-orm";
import * as schema from "../../src/db/schema";

/**
 * Intercambio de bloque (swap) contra el pool de sesiones aprobadas.
 *
 * El swap trae los EJERCICIOS del bloque origen (mas ruta/intensidad/reps) y
 * CONSERVA el formato del bloque destino. El coach intercambia cuando encuentra
 * un bloque con la misma intensidad y ruta de trabajo: el formato ya lo eligio
 * el y el swap no lo pisa.
 *
 * Adoptar el formato del origen ademas desincronizaba los niveles entre si (el
 * formato se edita en cascada a todos los niveles, pero el swap toca un solo
 * bloque), con lo cual el editor mostraba un formato y el PDF/la app otro.
 */
describe("Block swap", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let clusterFormatId: number;
  let amrapFormatId: number;

  async function ensureFormat(name: string): Promise<number> {
    const existing = await app.db
      .select()
      .from(schema.formats)
      .where(eq(schema.formats.name, name));
    if (existing.length > 0) return existing[0].id;

    await app.db.insert(schema.formats).values({
      name,
      type: "technical",
      description: `${name} test format`,
    });
    const [fmt] = await app.db
      .select()
      .from(schema.formats)
      .where(eq(schema.formats.name, name));
    return fmt.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    clusterFormatId = await ensureFormat("Cluster");
    amrapFormatId = await ensureFormat("AMRAP");
  });

  afterAll(async () => {
    await app.close();
  });

  // Unique week per call so pool lookups never cross test boundaries.
  let weekCounter = 900;

  interface SwapSetup {
    sessionIds: number[];
    targetSessionId: number;
    targetBlockId: number;
    sourceBlockId: number;
  }

  /**
   * Destino: DEUTEROS_2 en Cluster (pendiente de revision).
   * Origen: DEUTEROS_2 en AMRAP dentro de una sesion aprobada (el pool).
   */
  async function createSwapPair(): Promise<SwapSetup> {
    const week = weekCounter++;
    const sessionIds: number[] = [];

    async function createSession(
      level: string,
      approved: boolean,
    ): Promise<number> {
      const [result] = await app.db.insert(schema.sessions).values({
        dayId: `W${week}-lunes-${level}`,
        week,
        day: "lunes",
        levelGroup: "alfa_delta",
        blockCount: 1,
        ...(approved ? { status: "approved" as const } : {}),
      });
      const id = Number(result.insertId);
      sessionIds.push(id);
      return id;
    }

    const targetSessionId = await createSession("alfa", false);
    const [targetResult] = await app.db.insert(schema.sessionBlocks).values({
      sessionId: targetSessionId,
      blockId: `W${week}-lunes-alfa-DEUTEROS_2`,
      role: "DEUTEROS_2",
      route: "PL",
      pattern: "PUSH",
      intensity: 60,
      repsBudget: 80,
      formatId: clusterFormatId,
      formatName: "Cluster",
      formatParams: {
        type: "cluster",
        clusterSize: 3,
        restBetweenClusters: 15,
      },
      exerciseCount: 1,
      sortOrder: 0,
    });
    const targetBlockId = Number(targetResult.insertId);

    await app.db.insert(schema.sessionPrescriptions).values({
      blockId: targetBlockId,
      exerciseName: "Ejercicio viejo del destino",
      exerciseId: 2000,
      contraction: "CON",
      reps: 5,
      seconds: 0,
      rest: 60,
      sortOrder: 0,
    });

    const sourceSessionId = await createSession("delta", true);
    const [sourceResult] = await app.db.insert(schema.sessionBlocks).values({
      sessionId: sourceSessionId,
      blockId: `W${week}-lunes-delta-DEUTEROS_2`,
      role: "DEUTEROS_2",
      route: "PL",
      pattern: "PULL",
      intensity: 75,
      repsBudget: 120,
      formatId: amrapFormatId,
      formatName: "AMRAP",
      formatParams: { type: "amrap", minutes: 10 },
      exerciseCount: 2,
      sortOrder: 0,
    });
    const sourceBlockId = Number(sourceResult.insertId);

    // Un ejercicio principal con rangos/incremento y uno de movilidad: cubre los
    // campos que el copiado omitia.
    await app.db.insert(schema.sessionPrescriptions).values([
      {
        blockId: sourceBlockId,
        exerciseId: 3000,
        exerciseName: "Principal del origen",
        contraction: "CON",
        reps: 8,
        repsMax: 12,
        seconds: 20,
        secondsMax: 40,
        increment: 2,
        rest: 45,
        notes: "nota del origen",
        difficulty: 6,
        sortOrder: 0,
        exerciseType: "main",
        weighted: true,
      },
      {
        blockId: sourceBlockId,
        exerciseId: 3001,
        exerciseName: "Movilidad del origen",
        contraction: "ISO",
        reps: 0,
        seconds: 30,
        rest: 0,
        sortOrder: 1,
        exerciseType: "mobility",
        weighted: false,
      },
    ]);

    return { sessionIds, targetSessionId, targetBlockId, sourceBlockId };
  }

  async function cleanup(setup: SwapSetup): Promise<void> {
    await app.db
      .delete(schema.sessions)
      .where(inArray(schema.sessions.id, setup.sessionIds));
  }

  async function swap(setup: SwapSetup) {
    return app.inject({
      method: "POST",
      url: `/api/admin/sessions/${setup.targetSessionId}/blocks/${setup.targetBlockId}/swap`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { sourceBlockId: setup.sourceBlockId },
    });
  }

  it("conserva el formato del bloque destino en vez de adoptar el del origen", async () => {
    const setup = await createSwapPair();
    try {
      const res = await swap(setup);
      expect(res.statusCode).toBe(200);

      const [block] = await app.db
        .select()
        .from(schema.sessionBlocks)
        .where(eq(schema.sessionBlocks.id, setup.targetBlockId));

      expect(block.formatName).toBe("Cluster");
      expect(block.formatId).toBe(clusterFormatId);
      // El bug: formatName pasaba a AMRAP pero formatParams quedaba en cluster.
      // Nombre y params tienen que seguir siendo coherentes entre si.
      expect(block.formatParams).toEqual({
        type: "cluster",
        clusterSize: 3,
        restBetweenClusters: 15,
      });
    } finally {
      await cleanup(setup);
    }
  });

  it("trae ruta, patron, intensidad, reps y cantidad de ejercicios del origen", async () => {
    const setup = await createSwapPair();
    try {
      const res = await swap(setup);
      expect(res.statusCode).toBe(200);

      const [block] = await app.db
        .select()
        .from(schema.sessionBlocks)
        .where(eq(schema.sessionBlocks.id, setup.targetBlockId));

      expect(block.pattern).toBe("PULL");
      expect(block.intensity).toBe(75);
      expect(block.repsBudget).toBe(120);
      expect(block.exerciseCount).toBe(2);
    } finally {
      await cleanup(setup);
    }
  });

  it("reemplaza los ejercicios del destino por los del origen sin perder campos", async () => {
    const setup = await createSwapPair();
    try {
      const res = await swap(setup);
      expect(res.statusCode).toBe(200);

      const prescriptions = await app.db
        .select()
        .from(schema.sessionPrescriptions)
        .where(eq(schema.sessionPrescriptions.blockId, setup.targetBlockId))
        .orderBy(asc(schema.sessionPrescriptions.sortOrder));

      expect(prescriptions).toHaveLength(2);
      expect(
        prescriptions.some(
          (p) => p.exerciseName === "Ejercicio viejo del destino",
        ),
      ).toBe(false);

      const [main, mobility] = prescriptions;

      expect(main.exerciseName).toBe("Principal del origen");
      expect(main.repsMax).toBe(12);
      expect(main.secondsMax).toBe(40);
      expect(main.increment).toBe(2);
      expect(main.weighted).toBe(true);
      expect(main.difficulty).toBe(6);
      expect(main.notes).toBe("nota del origen");

      // exerciseType es NOT NULL DEFAULT 'main': omitirlo al copiar convertia un
      // ejercicio de movilidad en un ejercicio principal.
      expect(mobility.exerciseName).toBe("Movilidad del origen");
      expect(mobility.exerciseType).toBe("mobility");
    } finally {
      await cleanup(setup);
    }
  });

  it("rechaza un origen que no pertenece a una sesion aprobada", async () => {
    const setup = await createSwapPair();
    try {
      // El bloque destino vive en una sesion pending_review: no es pool valido.
      const res = await app.inject({
        method: "POST",
        url: `/api/admin/sessions/${setup.targetSessionId}/blocks/${setup.targetBlockId}/swap`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { sourceBlockId: setup.targetBlockId },
      });

      expect(res.statusCode).toBe(404);
    } finally {
      await cleanup(setup);
    }
  });
});
