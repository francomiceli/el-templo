/**
 * Cron de recategorización multisucursal (src/jobs/reassign-multibranch.ts).
 *
 * Testea la lógica pura runReassignMultibranch contra MySQL real: candidatos
 * (solo members con sub activa multi_branch), señal por ASISTENCIAS de los
 * últimos 30 días, margen de dominancia, guardrail de país, ventana de
 * protección manual (45d), y que la reasignación sincroniza subscriptions.
 *
 * Reloj pinneado (fake timers) para controlar la ventana de 30d y la de 45d.
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
import { runReassignMultibranch } from "../../src/jobs/reassign-multibranch";
import {
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";

// Archivo single-tenant (solo El Templo, sin segundo gimnasio): filtro
// preciso, no exencion.
const CTX_TEMPLO: TenantContext = { tenantId: 1 };

// "Ahora" pinneado. Ventana de asistencias = [NOW-30d, NOW].
const NOW = new Date("2026-06-15T12:00:00Z");
const inWindow = "2026-06-10"; // dentro de los 30 días
const outWindow = "2026-04-01"; // fuera de los 30 días

let seq = 0;

describe("cron recategorización multisucursal", () => {
  let app: FastifyInstance;
  let branchA: number; // AR (home por defecto)
  let branchB: number; // AR
  let branchC: number; // ES (otro país)
  let branchD: number; // AR (para empates sin la home involucrada)
  let multiPlanId: number;
  let singlePlanId: number;

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

    branchA = await insertBranch("AR", `RMB-A-${seq}`);
    branchB = await insertBranch("AR", `RMB-B-${seq}`);
    branchC = await insertBranch("ES", `RMB-C-${seq}`);
    branchD = await insertBranch("AR", `RMB-D-${seq}`);

    multiPlanId = await insertPlan(true, `RMB Multi ${seq}`);
    singlePlanId = await insertPlan(false, `RMB Single ${seq}`);
  });

  async function insertBranch(country: string, code: string): Promise<number> {
    const res = await app.db.insert(schema.branches).values({
      name: code,
      code,
      country,
      timezone: "America/Argentina/Buenos_Aires",
    });
    return Number(res[0].insertId);
  }

  async function insertPlan(
    multiBranch: boolean,
    name: string,
  ): Promise<number> {
    const res = await app.db.insert(schema.subscriptionPlans).values({
      name,
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 15000,
      priceZero: 10000,
      priceCreditCard: 15000,
      durationDays: 30,
      multiBranch,
    });
    return Number(res[0].insertId);
  }

  /** Inserta un member con sede home + tracking opcional. Devuelve su id. */
  async function insertMember(opts: {
    branchId: number;
    branchSource?: "manual" | "auto";
    branchUpdatedAt?: Date;
  }): Promise<number> {
    seq += 1;
    const res = await app.db.insert(schema.users).values({
      email: `rmb-${seq}-${Date.now()}@test.com`,
      passwordHash: "x",
      firstName: "Test",
      lastName: `Member ${seq}`,
      role: "member",
      branchId: opts.branchId,
      branchSource: opts.branchSource ?? null,
      branchUpdatedAt: opts.branchUpdatedAt ?? null,
    });
    return Number(res[0].insertId);
  }

  async function insertSub(
    userId: number,
    planId: number,
    branchId: number,
    status: "active" | "paused" = "active",
  ): Promise<void> {
    await app.db.insert(schema.subscriptions).values({
      userId,
      planId,
      branchId,
      status,
      startDate: "2026-05-01",
      endDate: "2026-07-01",
      pricePaid: 15000,
      priceTypeApplied: "regular",
    });
  }

  async function addAttendance(
    memberId: number,
    branchId: number,
    n: number,
    sessionDate = inWindow,
  ): Promise<void> {
    for (let i = 0; i < n; i += 1) {
      await app.db.insert(schema.attendance).values({
        memberId,
        branchId,
        sessionDate,
      });
    }
  }

  async function homeBranchOf(userId: number): Promise<number> {
    const [row] = await app.db
      .select({ branchId: schema.users.branchId })
      .from(schema.users)
      .where(
        and(tenantWhere(schema.users, CTX_TEMPLO), eq(schema.users.id, userId)),
      );
    return row.branchId;
  }

  it("reasigna a la sede dominante y sincroniza subscriptions.branch_id", async () => {
    const m = await insertMember({ branchId: branchA });
    await insertSub(m, multiPlanId, branchA);
    await addAttendance(m, branchB, 5); // 5 en B
    await addAttendance(m, branchA, 1); // 1 en A → B domina (5/6)

    const res = await runReassignMultibranch(app.db);

    expect(res.changes).toHaveLength(1);
    expect(res.changes[0]).toMatchObject({
      memberId: m,
      fromBranchId: branchA,
      toBranchId: branchB,
    });
    expect(await homeBranchOf(m)).toBe(branchB);

    // La sub viva también migró de sede.
    const [sub] = await app.db
      .select({ branchId: schema.subscriptions.branchId })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, m));
    expect(sub.branchId).toBe(branchB);
  });

  it("dry-run NO escribe (reporta el cambio pero deja la sede intacta)", async () => {
    const m = await insertMember({ branchId: branchA });
    await insertSub(m, multiPlanId, branchA);
    await addAttendance(m, branchB, 5);

    const res = await runReassignMultibranch(app.db, { dryRun: true });

    expect(res.dryRun).toBe(true);
    expect(res.changes).toHaveLength(1);
    expect(await homeBranchOf(m)).toBe(branchA); // sin tocar
  });

  it("no reasigna sin dominancia (empate 3-3 entre dos sedes no-home)", async () => {
    // Home = D (sin asistencias); empate 3-3 entre A y B (ninguna es la home),
    // así el top no es la home y se evalúa la dominancia.
    const m = await insertMember({ branchId: branchD });
    await insertSub(m, multiPlanId, branchD);
    await addAttendance(m, branchA, 3);
    await addAttendance(m, branchB, 3); // ratio 0.5, margen 0 → no domina

    const res = await runReassignMultibranch(app.db);
    expect(res.changes).toHaveLength(0);
    expect(res.skipped).toContainEqual({ memberId: m, reason: "no_dominance" });
    expect(await homeBranchOf(m)).toBe(branchD);
  });

  it("no reasigna con pocas asistencias (< 4 en la ventana)", async () => {
    const m = await insertMember({ branchId: branchA });
    await insertSub(m, multiPlanId, branchA);
    await addAttendance(m, branchB, 3); // total 3 < 4

    const res = await runReassignMultibranch(app.db);
    expect(res.skipped).toContainEqual({
      memberId: m,
      reason: "few_attendances",
    });
    expect(await homeBranchOf(m)).toBe(branchA);
  });

  it("respeta una reasignación manual reciente (< 45 días)", async () => {
    const tenDaysAgo = new Date(NOW.getTime() - 10 * 86400000);
    const m = await insertMember({
      branchId: branchA,
      branchSource: "manual",
      branchUpdatedAt: tenDaysAgo,
    });
    await insertSub(m, multiPlanId, branchA);
    await addAttendance(m, branchB, 6); // dominaría B, pero está protegido

    const res = await runReassignMultibranch(app.db);
    expect(res.skipped).toContainEqual({
      memberId: m,
      reason: "manual_recent",
    });
    expect(await homeBranchOf(m)).toBe(branchA);
  });

  it("SÍ reasigna si el cambio manual es viejo (> 45 días)", async () => {
    const sixtyDaysAgo = new Date(NOW.getTime() - 60 * 86400000);
    const m = await insertMember({
      branchId: branchA,
      branchSource: "manual",
      branchUpdatedAt: sixtyDaysAgo,
    });
    await insertSub(m, multiPlanId, branchA);
    await addAttendance(m, branchB, 6);

    const res = await runReassignMultibranch(app.db);
    expect(res.changes).toHaveLength(1);
    expect(await homeBranchOf(m)).toBe(branchB);
  });

  it("no reasigna a una sede de otro país (guardrail cross-country)", async () => {
    const m = await insertMember({ branchId: branchA }); // AR
    await insertSub(m, multiPlanId, branchA);
    await addAttendance(m, branchC, 6); // C es ES

    const res = await runReassignMultibranch(app.db);
    expect(res.skipped).toContainEqual({
      memberId: m,
      reason: "cross_country",
    });
    expect(await homeBranchOf(m)).toBe(branchA);
  });

  it("no reasigna si ya está en su sede más frecuentada", async () => {
    const m = await insertMember({ branchId: branchB });
    await insertSub(m, multiPlanId, branchB);
    await addAttendance(m, branchB, 6);

    const res = await runReassignMultibranch(app.db);
    expect(res.skipped).toContainEqual({ memberId: m, reason: "already_top" });
    expect(await homeBranchOf(m)).toBe(branchB);
  });

  it("ignora a los members SIN plan multisucursal", async () => {
    const m = await insertMember({ branchId: branchA });
    await insertSub(m, singlePlanId, branchA); // plan single-branch
    await addAttendance(m, branchB, 6);

    const res = await runReassignMultibranch(app.db);
    expect(res.candidates).toBe(0);
    expect(await homeBranchOf(m)).toBe(branchA);
  });

  it("solo cuenta asistencias dentro de la ventana de 30 días", async () => {
    const m = await insertMember({ branchId: branchA });
    await insertSub(m, multiPlanId, branchA);
    await addAttendance(m, branchB, 6, outWindow); // viejas, no cuentan
    await addAttendance(m, branchA, 1, inWindow); // solo 1 dentro

    const res = await runReassignMultibranch(app.db);
    // Total en ventana = 1 (< 4) → pocas asistencias, no reasigna a B.
    expect(res.changes).toHaveLength(0);
    expect(await homeBranchOf(m)).toBe(branchA);
  });
});
