/**
 * Tanda 2 seguridad (hallazgo #4): POST /api/sessions/complete.
 *
 * Antes bastaba un string con un nivel valido como `dayId` para fabricar
 * `completed_sessions` y cobrar 10 AURA por cada uno (el premio colgaba del id de
 * la fila). Ahora:
 *   - el dayId tiene que existir en `sessions` y estar `approved` (si no, 400);
 *   - la AURA es UN premio por dia local del socio (tope diario);
 *   - `completed_sessions` tiene UNIQUE (tenant_id, user_id, day_id) (mig 0322): dos POST
 *     concurrentes del mismo dayId no duplican la fila ni rompen con 500.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import {
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import {
  createTestApp,
  registerUser,
  todayStr,
  seedApprovedSession,
} from "../helpers";
import { AURA_AMOUNTS } from "../../src/modules/aura/amounts";
import { AURA_TIME_RATIO } from "../../src/modules/sessions/proposed-time";
import {
  STANDARD_BLOCKS,
  cleanupFixtureExercises,
  rolesOf,
  seedSessionWithBlocks,
  startedAtForRatio,
} from "./_aura-session-fixtures";

const CTX_TEMPLO: TenantContext = { tenantId: 1 };

const DAY_LUNES = "W1-lunes-alfa";
const DAY_MARTES = "W1-martes-alfa";
const DAY_PENDING = "W1-miercoles-alfa";
const DAY_CONCURRENT = "W2-lunes-alfa";
const DAY_INEXISTENTE = "W999-lunes-alfa";
const SEEDED = [DAY_LUNES, DAY_MARTES, DAY_PENDING, DAY_CONCURRENT];

describe("POST /api/sessions/complete — dayId aprobado y tope diario de AURA", () => {
  let app: FastifyInstance;
  let token: string;
  let memberId: number;
  // Tiempo propuesto por dayId sembrado con bloques (D-20: el cierre valido manda
  // un inicio que alcanza el 80 % y todos los bloques).
  const proposedByDay = new Map<string, number>();

  function startedAtFor(dayId: string): string {
    const proposedSec = proposedByDay.get(dayId);
    return proposedSec === undefined
      ? new Date().toISOString()
      : startedAtForRatio(proposedSec, AURA_TIME_RATIO);
  }

  async function complete(
    dayId: string,
    extra: Record<string, unknown> = {},
    authToken: string = token,
  ) {
    return app.inject({
      method: "POST",
      url: "/api/sessions/complete",
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        dayId,
        date: todayStr(),
        startedAt: startedAtFor(dayId),
        blocksCompleted: rolesOf(STANDARD_BLOCKS),
        ...extra,
      },
    });
  }

  async function completedRows(dayId?: string) {
    return app.db
      .select({
        id: schema.completedSessions.id,
        dayId: schema.completedSessions.dayId,
        tenantId: schema.completedSessions.tenantId,
        rpe: schema.completedSessions.rpe,
      })
      .from(schema.completedSessions)
      .where(
        and(
          tenantWhere(schema.completedSessions, CTX_TEMPLO),
          eq(schema.completedSessions.userId, memberId),
          ...(dayId ? [eq(schema.completedSessions.dayId, dayId)] : []),
        ),
      );
  }

  async function auraBalance(): Promise<number> {
    const [row] = await app.db
      .select({ balance: schema.auraBalances.balance })
      .from(schema.auraBalances)
      .where(eq(schema.auraBalances.userId, memberId));
    return row?.balance ?? 0;
  }

  async function trainingTxs() {
    return app.db
      .select({
        amount: schema.auraTransactions.amount,
        referenceType: schema.auraTransactions.referenceType,
        referenceId: schema.auraTransactions.referenceId,
      })
      .from(schema.auraTransactions)
      .where(
        and(
          eq(schema.auraTransactions.userId, memberId),
          eq(schema.auraTransactions.sourceType, "training_completion"),
        ),
      );
  }

  beforeAll(async () => {
    app = await createTestApp();

    const reg = await registerUser(app, {
      email: "complete-aura-cap@test.com",
      password: "password123",
      branchId: 1,
    });
    token = reg.token;
    memberId = (reg.user as { id: number }).id;

    for (const dayId of [DAY_LUNES, DAY_MARTES, DAY_CONCURRENT]) {
      const seeded = await seedSessionWithBlocks(app, dayId, STANDARD_BLOCKS);
      proposedByDay.set(dayId, seeded.proposedSec);
    }
    await seedApprovedSession(app, DAY_PENDING, { status: "pending_review" });
  });

  afterAll(async () => {
    await app.db
      .delete(schema.sessions)
      .where(
        and(
          tenantWhere(schema.sessions, CTX_TEMPLO),
          inArray(schema.sessions.dayId, SEEDED),
        ),
      );
    await cleanupFixtureExercises(app);
    await app.close();
  });

  it("rechaza con 400 un dayId que no existe en sessions (sin fila ni AURA)", async () => {
    const res = await complete(DAY_INEXISTENTE);

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("Solicitud invalida");
    expect(body.message).toBe(
      "dayId invalido: la sesion no existe o no esta aprobada",
    );
    expect(await completedRows()).toHaveLength(0);
    expect(await auraBalance()).toBe(0);
  });

  it("rechaza con 400 una sesion que existe pero no esta aprobada (pending_review)", async () => {
    const res = await complete(DAY_PENDING);

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("Solicitud invalida");
    expect(body.message).toBe(
      "dayId invalido: la sesion no existe o no esta aprobada",
    );
    expect(await completedRows(DAY_PENDING)).toHaveLength(0);
    expect(await auraBalance()).toBe(0);
  });

  it("limites del schema: dayId > 50 caracteres y notes > 2000 dan 400", async () => {
    const largo = await complete(`W1-lunes-${"a".repeat(60)}-alfa`);
    expect(largo.statusCode).toBe(400);

    const notasLargas = await complete(DAY_LUNES, {
      notes: "x".repeat(2001),
    });
    expect(notasLargas.statusCode).toBe(400);

    expect(await completedRows()).toHaveLength(0);
    expect(await auraBalance()).toBe(0);
  });

  it("completar una sesion aprobada da 200 y AURA_AMOUNTS.training, con la fila en el tenant del socio", async () => {
    const res = await complete(DAY_LUNES);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
    const rows = await completedRows(DAY_LUNES);
    expect(rows).toHaveLength(1);
    expect(rows[0].tenantId).toBe(CTX_TEMPLO.tenantId);
    expect(await auraBalance()).toBe(AURA_AMOUNTS.training);

    const txs = await trainingTxs();
    expect(txs).toHaveLength(1);
    expect(txs[0].referenceType).toBe("training_day");
  });

  it("una segunda sesion el mismo dia da 200 pero NO suma AURA (tope diario)", async () => {
    const res = await complete(DAY_MARTES);

    expect(res.statusCode).toBe(200);
    expect(await completedRows()).toHaveLength(2);
    expect(await auraBalance()).toBe(AURA_AMOUNTS.training);
    expect(await trainingTxs()).toHaveLength(1);
  });

  it("repetir el mismo dayId actualiza la fila (upsert): una sola fila y el saldo no cambia", async () => {
    const res = await complete(DAY_LUNES, { rpe: 9 });

    expect(res.statusCode).toBe(200);
    const rows = await completedRows(DAY_LUNES);
    expect(rows).toHaveLength(1);
    expect(rows[0].rpe).toBe(9);
    expect(await completedRows()).toHaveLength(2);
    expect(await auraBalance()).toBe(AURA_AMOUNTS.training);
  });

  it("dos POST concurrentes con un dayId nuevo: sin 500, una sola fila y sin AURA extra", async () => {
    const antes = await completedRows();
    const saldoAntes = await auraBalance();

    const [a, b] = await Promise.all([
      complete(DAY_CONCURRENT, { rpe: 5 }),
      complete(DAY_CONCURRENT, { rpe: 6 }),
    ]);

    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(JSON.parse(a.body).completedSessionId).toBe(
      JSON.parse(b.body).completedSessionId,
    );
    expect(await completedRows(DAY_CONCURRENT)).toHaveLength(1);
    expect(await completedRows()).toHaveLength(antes.length + 1);
    // Ya cobro hoy: el tope diario impide cualquier AURA adicional.
    expect(await auraBalance()).toBe(saldoAntes);
  });

  it("el unique (tenant_id, user_id, day_id) rechaza un INSERT duplicado directo", async () => {
    const [existente] = await app.db
      .select()
      .from(schema.completedSessions)
      .where(
        and(
          tenantWhere(schema.completedSessions, CTX_TEMPLO),
          eq(schema.completedSessions.userId, memberId),
          eq(schema.completedSessions.dayId, DAY_LUNES),
        ),
      );
    const { id: _id, ...sinId } = existente;
    await expect(
      app.db.insert(schema.completedSessions).values(sinId),
    ).rejects.toThrow();
    expect(await completedRows(DAY_LUNES)).toHaveLength(1);
  });
});

describe("GET /api/sessions/:id (removida, hallazgo #19)", () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    const reg = await registerUser(app, {
      email: "session-by-id-removed@test.com",
      password: "password123",
      branchId: 1,
    });
    token = reg.token;
  });

  afterAll(async () => {
    await app.close();
  });

  it("ya no existe: 404 de ruta inexistente aun con un id real y sesion autenticada", async () => {
    const seededId = await seedApprovedSession(app, "W1-jueves-alfa");
    try {
      const res = await app.inject({
        method: "GET",
        url: `/api/sessions/${seededId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("Not Found");
      expect(body.message).toContain("not found");
    } finally {
      await app.db
        .delete(schema.sessions)
        .where(
          and(
            tenantWhere(schema.sessions, CTX_TEMPLO),
            eq(schema.sessions.dayId, "W1-jueves-alfa"),
          ),
        );
    }
  });
});
