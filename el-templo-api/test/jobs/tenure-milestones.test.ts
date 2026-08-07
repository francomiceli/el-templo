/**
 * Job de aniversarios de permanencia (src/jobs/tenure-milestones.ts).
 *
 * Testea runTenureMilestones contra MySQL real: detecta a los alumnos ACTIVOS
 * que cumplen un hito HOY, les otorga Aura con el monto correcto, encola el push
 * (cuando tienen device token) y es idempotente (una sola vez por hito). Verifica
 * también que no toca a inactivos ni a quien no cumple hito hoy.
 *
 * Reloj pinneado (fake timers): "hoy" en AR se deriva de NOW.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { runTenureMilestones } from "../../src/jobs/tenure-milestones";

// "Ahora" pinneado → hoy en AR (UTC-3) = 2026-06-15.
const NOW = new Date("2026-06-15T15:00:00Z");

let seq = 0;

describe("job aniversarios de permanencia", () => {
  let app: FastifyInstance;
  let branchId: number;

  beforeAll(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    app = await createTestApp();
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    seq += 1;
    const res = await app.db.insert(schema.branches).values({
      name: `TM-${seq}`,
      code: `TM-${seq}`,
      country: "AR",
      timezone: "America/Argentina/Buenos_Aires",
    });
    branchId = Number(res[0].insertId);
  });

  async function insertMember(opts: {
    createdAt: string; // ISO
    status?: "activo" | "inactivo" | "freemium";
  }): Promise<number> {
    seq += 1;
    const res = await app.db.insert(schema.users).values({
      email: `tm-${seq}-${Date.now()}@test.com`,
      passwordHash: "x",
      firstName: "Aniv",
      lastName: `Member ${seq}`,
      role: "member",
      status: opts.status ?? "activo",
      branchId,
      createdAt: new Date(opts.createdAt),
    });
    return Number(res[0].insertId);
  }

  async function addDeviceToken(userId: number): Promise<void> {
    await app.db.insert(schema.deviceTokens).values({
      userId,
      token: `tok-${userId}-${Date.now()}`,
      platform: "android",
    });
  }

  async function auraRowsFor(userId: number) {
    return app.db
      .select({
        amount: schema.auraTransactions.amount,
        referenceId: schema.auraTransactions.referenceId,
        referenceType: schema.auraTransactions.referenceType,
        sourceType: schema.auraTransactions.sourceType,
      })
      .from(schema.auraTransactions)
      .where(
        and(
          eq(schema.auraTransactions.userId, userId),
          eq(schema.auraTransactions.sourceType, "tenure_milestone"),
        ),
      );
  }

  it("otorga Aura y encola push a los que cumplen hito hoy", async () => {
    // 6 meses hoy (2025-12-15 → 2026-06-15), con device token.
    const m6 = await insertMember({ createdAt: "2025-12-15T10:00:00Z" });
    await addDeviceToken(m6);
    // 3 meses hoy (2026-03-15 → 2026-06-15), sin device token.
    const m3 = await insertMember({ createdAt: "2026-03-15T10:00:00Z" });
    // No cumple hito hoy (~5 meses).
    const mNone = await insertMember({ createdAt: "2026-01-10T10:00:00Z" });
    // Cumpliría 1 año hoy pero está INACTIVO → no se lo festeja.
    await insertMember({
      createdAt: "2025-06-15T10:00:00Z",
      status: "inactivo",
    });

    const res = await runTenureMilestones(app.db);

    expect(res.candidates).toBe(2);
    expect(res.recognized).toHaveLength(2);
    expect(res.alreadyDone).toBe(0);
    expect(res.failed).toBe(0);

    // Aura correcta por hito.
    const a6 = await auraRowsFor(m6);
    expect(a6).toHaveLength(1);
    expect(a6[0]).toMatchObject({
      amount: 100,
      referenceId: 6,
      referenceType: "tenure_milestone",
    });

    const a3 = await auraRowsFor(m3);
    expect(a3).toHaveLength(1);
    expect(a3[0]).toMatchObject({ amount: 50, referenceId: 3 });

    // El que no cumple hito no recibe nada.
    expect(await auraRowsFor(mNone)).toHaveLength(0);

    // Push encolado solo para el que tiene device token (m6).
    const pushes = await app.db
      .select({ title: schema.pendingNotifications.title })
      .from(schema.pendingNotifications)
      .where(eq(schema.pendingNotifications.userId, m6));
    expect(pushes).toHaveLength(1);
    expect(pushes[0].title).toContain("6 meses");
  });

  it("es idempotente: una segunda corrida no vuelve a otorgar ni notificar", async () => {
    const m = await insertMember({ createdAt: "2025-12-15T10:00:00Z" });
    await addDeviceToken(m);

    const first = await runTenureMilestones(app.db);
    expect(first.recognized).toHaveLength(1);

    const second = await runTenureMilestones(app.db);
    expect(second.recognized).toHaveLength(0);
    expect(second.alreadyDone).toBe(1);
    expect(second.failed).toBe(0);

    // Sigue habiendo un solo asiento de Aura y un solo push.
    expect(await auraRowsFor(m)).toHaveLength(1);
    const pushes = await app.db
      .select({ id: schema.pendingNotifications.id })
      .from(schema.pendingNotifications)
      .where(eq(schema.pendingNotifications.userId, m));
    expect(pushes).toHaveLength(1);
  });

  it("dryRun calcula candidatos pero no otorga Aura ni encola push", async () => {
    const m = await insertMember({ createdAt: "2025-12-15T10:00:00Z" });
    await addDeviceToken(m);

    const res = await runTenureMilestones(app.db, { dryRun: true });
    expect(res.recognized).toHaveLength(1);
    expect(await auraRowsFor(m)).toHaveLength(0);
    const pushes = await app.db
      .select({ id: schema.pendingNotifications.id })
      .from(schema.pendingNotifications)
      .where(eq(schema.pendingNotifications.userId, m));
    expect(pushes).toHaveLength(0);
  });
});
