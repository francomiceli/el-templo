import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken } from "../helpers";
import { eq, inArray, asc } from "drizzle-orm";
import * as schema from "../../src/db/schema";

/**
 * INITIUM cross-day sync (un solo INITIUM por día).
 *
 * Editar el bloque INITIUM de cualquier sesión replica formato, params,
 * título y prescripciones a los INITIUM de las sesiones hermanas del mismo
 * día. Editar bloques no-INITIUM no toca a las hermanas.
 */
describe("INITIUM sync across day sessions", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let formatId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    const existing = await app.db
      .select()
      .from(schema.formats)
      .where(eq(schema.formats.name, "Tabata"));
    if (existing.length === 0) {
      await app.db.insert(schema.formats).values({
        name: "Tabata",
        type: "technical",
        description: "Tabata test format",
      });
    }
    const [fmt] = await app.db
      .select()
      .from(schema.formats)
      .where(eq(schema.formats.name, "Tabata"));
    formatId = fmt.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // Unique week per call so sibling lookups never cross test boundaries.
  let weekCounter = 800;
  interface DaySetup {
    week: number;
    sessionIds: number[];
    initiumBlockIds: Map<string, number>; // level -> block db id
    nucleusBlockId: number; // on the first level, for negative tests
  }

  /** Create N sibling sessions (same week/day) each with an INITIUM block
   *  with one prescription; the first also gets a NUCLEUS block. */
  async function createDay(
    levels: string[],
    opts?: { approved?: boolean },
  ): Promise<DaySetup> {
    const week = weekCounter++;
    const sessionIds: number[] = [];
    const initiumBlockIds = new Map<string, number>();
    let nucleusBlockId = 0;

    for (const [i, level] of levels.entries()) {
      const [sessionResult] = await app.db.insert(schema.sessions).values({
        dayId: `W${week}-lunes-${level}`,
        week,
        day: "lunes",
        levelGroup: "alfa_delta",
        blockCount: i === 0 ? 2 : 1,
        ...(opts?.approved ? { status: "approved" as const } : {}),
      });
      const sessionId = Number(sessionResult.insertId);
      sessionIds.push(sessionId);

      const [blockResult] = await app.db.insert(schema.sessionBlocks).values({
        sessionId,
        blockId: `W${week}-lunes-${level}-INITIUM`,
        role: "INITIUM",
        route: "INITIUM",
        pattern: "FLOW",
        intensity: 30,
        repsBudget: 0,
        formatId,
        formatName: "Tabata",
        exerciseCount: 1,
        sortOrder: 0,
      });
      const blockId = Number(blockResult.insertId);
      initiumBlockIds.set(level, blockId);

      await app.db.insert(schema.sessionPrescriptions).values({
        blockId,
        exerciseId: 1000 + i,
        exerciseName: `Warmup ${level}`,
        contraction: "CON",
        reps: 10,
        seconds: 0,
        rest: 30,
        sortOrder: 0,
      });

      if (i === 0) {
        const [nucleusResult] = await app.db
          .insert(schema.sessionBlocks)
          .values({
            sessionId,
            blockId: `W${week}-lunes-${level}-NUCLEUS`,
            role: "NUCLEUS",
            route: "PL",
            pattern: "PUSH",
            intensity: 70,
            repsBudget: 100,
            formatId,
            formatName: "Tabata",
            exerciseCount: 0,
            sortOrder: 1,
          });
        nucleusBlockId = Number(nucleusResult.insertId);
      }
    }

    return { week, sessionIds, initiumBlockIds, nucleusBlockId };
  }

  async function cleanupDay(setup: DaySetup): Promise<void> {
    await app.db
      .delete(schema.sessions)
      .where(inArray(schema.sessions.id, setup.sessionIds));
  }

  it("custom-title edit on one INITIUM propagates to all sibling INITIUM blocks", async () => {
    const setup = await createDay(["alfa", "kairos", "sigma"]);
    try {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/sessions/${setup.sessionIds[0]}/blocks/${setup.initiumBlockIds.get("alfa")}/custom-title`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { customTitle: "Pyros Compartido" },
      });
      expect(res.statusCode).toBe(200);

      for (const level of ["kairos", "sigma"]) {
        const [row] = await app.db
          .select()
          .from(schema.sessionBlocks)
          .where(
            eq(schema.sessionBlocks.id, setup.initiumBlockIds.get(level)!),
          );
        expect(row.customTitle).toBe("Pyros Compartido");
      }
    } finally {
      await cleanupDay(setup);
    }
  });

  it("prescription edit on one INITIUM replaces sibling prescriptions with copies", async () => {
    const setup = await createDay(["alfa", "kairos"]);
    try {
      const [sourcePrescription] = await app.db
        .select()
        .from(schema.sessionPrescriptions)
        .where(
          eq(
            schema.sessionPrescriptions.blockId,
            setup.initiumBlockIds.get("alfa")!,
          ),
        );

      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/sessions/${setup.sessionIds[0]}/blocks/${setup.initiumBlockIds.get("alfa")}/exercises/${sourcePrescription.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { reps: 25 },
      });
      expect(res.statusCode).toBe(200);

      const siblingPrescriptions = await app.db
        .select()
        .from(schema.sessionPrescriptions)
        .where(
          eq(
            schema.sessionPrescriptions.blockId,
            setup.initiumBlockIds.get("kairos")!,
          ),
        )
        .orderBy(asc(schema.sessionPrescriptions.sortOrder));

      expect(siblingPrescriptions).toHaveLength(1);
      // La copia refleja el contenido del INITIUM editado, no el viejo del hermano
      expect(siblingPrescriptions[0].exerciseName).toBe("Warmup alfa");
      expect(siblingPrescriptions[0].reps).toBe(25);
    } finally {
      await cleanupDay(setup);
    }
  });

  it("editing a non-INITIUM block does NOT touch sibling sessions", async () => {
    const setup = await createDay(["alfa", "kairos"]);
    try {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/sessions/${setup.sessionIds[0]}/blocks/${setup.nucleusBlockId}/custom-title`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { customTitle: "Solo Nucleus" },
      });
      expect(res.statusCode).toBe(200);

      const [siblingInitium] = await app.db
        .select()
        .from(schema.sessionBlocks)
        .where(
          eq(schema.sessionBlocks.id, setup.initiumBlockIds.get("kairos")!),
        );
      expect(siblingInitium.customTitle).toBeNull();

      const siblingPrescriptions = await app.db
        .select()
        .from(schema.sessionPrescriptions)
        .where(
          eq(
            schema.sessionPrescriptions.blockId,
            setup.initiumBlockIds.get("kairos")!,
          ),
        );
      expect(siblingPrescriptions[0].exerciseName).toBe("Warmup kairos");
    } finally {
      await cleanupDay(setup);
    }
  });

  it("sync reverts approved siblings to pending_review and logs initium_sync", async () => {
    const setup = await createDay(["alfa", "kairos"], { approved: true });
    try {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/sessions/${setup.sessionIds[0]}/blocks/${setup.initiumBlockIds.get("alfa")}/custom-title`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { customTitle: "Re-aprobar" },
      });
      expect(res.statusCode).toBe(200);

      const [sibling] = await app.db
        .select({ status: schema.sessions.status })
        .from(schema.sessions)
        .where(eq(schema.sessions.id, setup.sessionIds[1]));
      expect(sibling.status).toBe("pending_review");

      const logs = await app.db
        .select()
        .from(schema.sessionEditLogs)
        .where(eq(schema.sessionEditLogs.sessionId, setup.sessionIds[1]));
      expect(logs.some((l) => l.action === "initium_sync")).toBe(true);
    } finally {
      await cleanupDay(setup);
    }
  });

  it("does not leak across days: a session on another week is untouched", async () => {
    const setupA = await createDay(["alfa", "kairos"]);
    const setupB = await createDay(["alfa"]);
    try {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/sessions/${setupA.sessionIds[0]}/blocks/${setupA.initiumBlockIds.get("alfa")}/custom-title`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { customTitle: "Solo Semana A" },
      });
      expect(res.statusCode).toBe(200);

      const [otherWeek] = await app.db
        .select()
        .from(schema.sessionBlocks)
        .where(
          eq(schema.sessionBlocks.id, setupB.initiumBlockIds.get("alfa")!),
        );
      expect(otherWeek.customTitle).toBeNull();
    } finally {
      await cleanupDay(setupA);
      await cleanupDay(setupB);
    }
  });
});
