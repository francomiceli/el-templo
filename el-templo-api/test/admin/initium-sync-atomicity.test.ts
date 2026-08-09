import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp } from "../helpers";
import { and, eq, inArray, asc } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import {
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";

// Archivo single-tenant (solo El Templo): filtro preciso, no exencion.
const CTX_TEMPLO: TenantContext = { tenantId: 1 };

/**
 * Atomicidad del INITIUM sync (NODE-4V).
 *
 * `syncInitiumAcrossDay` hace DELETE + INSERT de las prescripciones de cada
 * sesión hermana. Antes del fix el loop corría sin transacción: un fallo a
 * mitad dejaba a la hermana ya procesada con el bloque actualizado y CERO
 * prescripciones — un INITIUM vacío, silencioso y sin rollback.
 *
 * El fallo se inyecta en `logEdit`, que es la última escritura de cada
 * iteración: así la hermana #1 ya completó UPDATE+DELETE+INSERT cuando revienta
 * la #2, que es exactamente el estado que la transacción tiene que deshacer.
 *
 * El mock vive en su propio archivo (no en initium-sync.test.ts) para no
 * interponerse en los tests que ejercitan el sync por HTTP.
 */

const mockState = vi.hoisted(() => ({ failOnCall: 0, calls: 0 }));

vi.mock(
  "../../src/modules/admin/session-edit-helpers",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../src/modules/admin/session-edit-helpers")
      >();
    return {
      ...actual,
      logEdit: async (...args: Parameters<typeof actual.logEdit>) => {
        mockState.calls++;
        if (
          mockState.failOnCall > 0 &&
          mockState.calls === mockState.failOnCall
        ) {
          throw new Error("fallo inyectado en logEdit");
        }
        return actual.logEdit(...args);
      },
    };
  },
);

// Import después del mock para que el helper reciba el logEdit interceptado.
const { syncInitiumAcrossDay } =
  await import("../../src/modules/admin/initium-sync");

describe("INITIUM sync atomicity", () => {
  let app: FastifyInstance;
  let formatId: number;
  // `session_edit_logs.user_id` tiene FK a `users`: el id no se puede hardcodear
  // (la base de CI arranca sin el id 1). admin@test.com es el único usuario que
  // cleanAllTestData preserva, así que es el editor estable para el fixture.
  let editorUserId: number;

  beforeAll(async () => {
    app = await createTestApp();

    const [editor] = await app.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, CTX_TEMPLO),
          eq(schema.users.email, "admin@test.com"),
        ),
      );
    if (!editor) throw new Error("Falta el usuario seed admin@test.com");
    editorUserId = editor.id;

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
    mockState.failOnCall = 0;
    await app.close();
  });

  // Semana propia por test para que el lookup de hermanas nunca cruce fixtures.
  let weekCounter = 900;

  interface DaySetup {
    sessionIds: number[];
    initiumBlockIds: Map<string, number>;
  }

  /** N sesiones hermanas (mismo week/day), cada una con su INITIUM aprobado y
   *  una prescripción propia identificable por nivel. */
  async function createApprovedDay(levels: string[]): Promise<DaySetup> {
    const week = weekCounter++;
    const sessionIds: number[] = [];
    const initiumBlockIds = new Map<string, number>();

    for (const [i, level] of levels.entries()) {
      const [sessionResult] = await app.db.insert(schema.sessions).values({
        dayId: `W${week}-lunes-${level}`,
        week,
        day: "lunes",
        levelGroup: "alfa_delta",
        blockCount: 1,
        status: "approved" as const,
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
        customTitle: `Titulo ${level}`,
      });
      const blockId = Number(blockResult.insertId);
      initiumBlockIds.set(level, blockId);

      await app.db.insert(schema.sessionPrescriptions).values({
        blockId,
        exerciseId: 2000 + i,
        exerciseName: `Warmup ${level}`,
        contraction: "CON",
        reps: 10,
        seconds: 0,
        rest: 30,
        sortOrder: 0,
      });
    }

    return { sessionIds, initiumBlockIds };
  }

  async function cleanupDay(setup: DaySetup): Promise<void> {
    await app.db
      .delete(schema.sessions)
      .where(inArray(schema.sessions.id, setup.sessionIds));
  }

  it("rolls back every sibling when the sync fails midway", async () => {
    const setup = await createApprovedDay(["alfa", "kairos", "sigma"]);
    mockState.calls = 0;
    // Revienta en la segunda hermana: la primera ya está escrita en la tx.
    mockState.failOnCall = 2;

    try {
      await expect(
        syncInitiumAcrossDay(
          app.db,
          setup.initiumBlockIds.get("alfa")!,
          editorUserId,
        ),
      ).rejects.toThrow("fallo inyectado en logEdit");

      for (const level of ["kairos", "sigma"]) {
        const blockId = setup.initiumBlockIds.get(level)!;

        // La prescripción propia sigue ahí — NO quedó un INITIUM vacío ni una
        // copia a medias del bloque origen.
        const prescriptions = await app.db
          .select()
          .from(schema.sessionPrescriptions)
          .where(eq(schema.sessionPrescriptions.blockId, blockId))
          .orderBy(asc(schema.sessionPrescriptions.sortOrder));

        expect(prescriptions).toHaveLength(1);
        expect(prescriptions[0].exerciseName).toBe(`Warmup ${level}`);

        // El bloque conserva su propio título (el sync lo habría pisado con
        // "Titulo alfa").
        const [block] = await app.db
          .select()
          .from(schema.sessionBlocks)
          .where(eq(schema.sessionBlocks.id, blockId));
        expect(block.customTitle).toBe(`Titulo ${level}`);
      }

      // El revert a pending_review también se deshace: nadie perdió su
      // aprobación por un sync que nunca se completó.
      const sessions = await app.db
        .select({ id: schema.sessions.id, status: schema.sessions.status })
        .from(schema.sessions)
        .where(inArray(schema.sessions.id, setup.sessionIds));
      for (const session of sessions) {
        expect(session.status).toBe("approved");
      }
    } finally {
      mockState.failOnCall = 0;
      await cleanupDay(setup);
    }
  });

  it("commits all siblings when the sync completes", async () => {
    const setup = await createApprovedDay(["alfa", "kairos", "sigma"]);
    mockState.calls = 0;
    mockState.failOnCall = 0;

    try {
      const updated = await syncInitiumAcrossDay(
        app.db,
        setup.initiumBlockIds.get("alfa")!,
        editorUserId,
      );
      expect(updated).toBe(2);

      for (const level of ["kairos", "sigma"]) {
        const blockId = setup.initiumBlockIds.get(level)!;

        const prescriptions = await app.db
          .select()
          .from(schema.sessionPrescriptions)
          .where(eq(schema.sessionPrescriptions.blockId, blockId));

        expect(prescriptions).toHaveLength(1);
        expect(prescriptions[0].exerciseName).toBe("Warmup alfa");

        const [block] = await app.db
          .select()
          .from(schema.sessionBlocks)
          .where(eq(schema.sessionBlocks.id, blockId));
        expect(block.customTitle).toBe("Titulo alfa");
      }
    } finally {
      await cleanupDay(setup);
    }
  });
});
