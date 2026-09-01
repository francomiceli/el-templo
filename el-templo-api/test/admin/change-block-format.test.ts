import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, asc } from "drizzle-orm";
import { createTestApp, getAuthToken } from "../helpers";
import * as schema from "../../src/db/schema";

/**
 * Higiene de escritura del cambio de formato (regresión del "40-16").
 *
 * `reps_max` / `seconds_max` / `increment` son campos ESPECÍFICOS de formatos de
 * rango/escalera. Al cambiar el formato del bloque deben limpiarse en TODAS las
 * prescripciones del bloque, incluso en las que el nuevo formato no vuelve a
 * prescribir (p.ej. buy-in/cash-out recorta ejercicios). Antes solo se limpiaban
 * las filas que rematcheaban por exerciseId, y una fila huérfana conservaba el
 * `reps_max` viejo → el TV/PDF mostraba "40-16" (16 < 40).
 */
describe("changeBlockFormat — limpia campos de formato stale en TODO el bloque", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let uniq = 700;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  async function makeExercise(name: string): Promise<number> {
    const [row] = await app.db
      .insert(schema.exercises)
      .values({
        pattern: "TRACCION",
        category: "pull",
        exercise: name,
        effort: "high",
        route: "OAP",
      })
      .$returningId();
    return row.id;
  }

  /**
   * Bloque NUCLEUS con 4 ejercicios, cada prescripción con un rango STALE
   * (reps_max/seconds_max/increment con valores basura). Devuelve session/block.
   */
  async function seedBlockWithStaleRanges(): Promise<{
    sessionId: number;
    blockId: number;
  }> {
    const n = uniq++;
    const [session] = await app.db
      .insert(schema.sessions)
      .values({
        dayId: `CBF-${n}-${Date.now().toString(36)}`,
        week: n,
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
        blockId: `B-${session.id}-0`,
        role: "NUCLEUS",
        route: "OAP",
        pattern: "TRACCION",
        intensity: 70,
        repsBudget: 120,
        formatId: 1,
        formatName: "AMRAP",
        formatParams: { type: "amrap", minutes: 10 },
        exerciseCount: 4,
        sortOrder: 0,
      })
      .$returningId();

    for (let i = 0; i < 4; i++) {
      const exId = await makeExercise(`CBF ${n} ejercicio ${i}`);
      await app.db.insert(schema.sessionPrescriptions).values({
        blockId: block.id,
        exerciseId: exId,
        exerciseName: `CBF ${n} ejercicio ${i}`,
        contraction: "CON",
        difficulty: 1,
        reps: 10,
        repsMax: 99, // stale: rango imposible respecto a las reps nuevas
        seconds: 0,
        secondsMax: 88, // stale
        increment: 5, // stale
        rest: 60,
        sortOrder: i,
        exerciseType: "main",
      });
    }

    return { sessionId: session.id, blockId: block.id };
  }

  async function changeFormat(
    sessionId: number,
    blockId: number,
    formatName: string,
  ) {
    return app.inject({
      method: "PATCH",
      url: `/api/admin/sessions/${sessionId}/blocks/${blockId}/format`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { formatId: 42, formatName },
    });
  }

  async function prescriptionsOf(blockId: number) {
    return app.db
      .select()
      .from(schema.sessionPrescriptions)
      .where(eq(schema.sessionPrescriptions.blockId, blockId))
      .orderBy(asc(schema.sessionPrescriptions.sortOrder));
  }

  it("limpia reps_max/seconds_max/increment en las 4 filas al pasar a un formato sin rango (Complex)", async () => {
    const { sessionId, blockId } = await seedBlockWithStaleRanges();

    const res = await changeFormat(sessionId, blockId, "Complex");
    expect(res.statusCode).toBe(200);

    const prescriptions = await prescriptionsOf(blockId);
    expect(prescriptions).toHaveLength(4);
    for (const p of prescriptions) {
      expect(p.repsMax).toBeNull();
      expect(p.secondsMax).toBeNull();
      expect(p.increment).toBeNull();
    }
  });

  it("limpia también la fila HUÉRFANA que el nuevo formato no vuelve a prescribir (buy-in/cash-out recorta a 4→bookend+2)", async () => {
    const { sessionId, blockId } = await seedBlockWithStaleRanges();

    // buy-in / cash-out usa exercises[0] (x2) + slice(1,3): el 4º ejercicio
    // (sortOrder 3) queda sin rematch en `updates`. Antes conservaba repsMax=99.
    const res = await changeFormat(sessionId, blockId, "buy-in / cash-out");
    expect(res.statusCode).toBe(200);

    const prescriptions = await prescriptionsOf(blockId);
    const orphan = prescriptions.find((p) => p.sortOrder === 3);
    expect(orphan).toBeDefined();
    expect(orphan!.repsMax).toBeNull();
    expect(orphan!.secondsMax).toBeNull();
    expect(orphan!.increment).toBeNull();

    // Y ninguna fila del bloque queda con un rango stale.
    for (const p of prescriptions) {
      expect(p.repsMax).toBeNull();
      expect(p.secondsMax).toBeNull();
      expect(p.increment).toBeNull();
    }
  });
});
