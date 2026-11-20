/**
 * Fase 214 (plan 11, D-02, D-12, D-37, D-38) — `auraEarned` en `GET /api/auth/me`.
 *
 * "Aura ganada" = todo lo que el ledger acreditó, neto de reversas y ajustes, SIN
 * restar los canjes (`manual_adjustment` con `reference_type = 'subscription'`).
 * Sale del JWT: nadie puede pedir el de otro. Alumnos y staff ven su número por
 * igual (D-15 revocada). Con `templo-gamification` apagado viene en null.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createTestMember,
  createStaffUser,
  getAuthToken,
} from "../helpers";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import { setModuleFlag, restoreTemploFlags } from "../fixtures/module-flags";
import { auraTransactions } from "../../src/db/schema/aura-transactions";
import { auraBalances } from "../../src/db/schema/aura-balances";
import { tenantValues } from "../../src/modules/shared/tenant";
import { AuraService } from "../../src/modules/aura/service";
import { AURA_AMOUNTS } from "../../src/modules/aura/amounts";

type SourceType = typeof auraTransactions.$inferInsert.sourceType;

interface LedgerRow {
  sourceType: SourceType;
  amount: number;
  referenceType: string | null;
  referenceId: number | null;
}

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let auraService: AuraService;

beforeAll(async () => {
  app = await createTestApp();
  auraService = new AuraService(app.db);
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
});

afterAll(async () => {
  await restoreTemploFlags(app);
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

async function seedLedger(
  userId: number,
  rows: LedgerRow[],
  tenantId: number = TENANT_TEMPLO,
): Promise<void> {
  for (const row of rows) {
    await app.db.insert(auraTransactions).values(
      tenantValues(
        { tenantId },
        {
          userId,
          sourceType: row.sourceType,
          amount: row.amount,
          referenceType: row.referenceType,
          referenceId: row.referenceId,
        },
      ),
    );
  }
}

function attendanceRows(count: number, firstRef: number): LedgerRow[] {
  return Array.from({ length: count }, (_, i) => ({
    sourceType: "attendance" as const,
    amount: AURA_AMOUNTS.attendance,
    referenceType: "attendance",
    referenceId: firstRef + i,
  }));
}

async function getMe(token: string): Promise<{
  statusCode: number;
  body: { auraEarned?: number | null };
}> {
  const res = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: { authorization: `Bearer ${token}` },
  });
  return { statusCode: res.statusCode, body: res.json() };
}

function sum(rows: LedgerRow[]): number {
  return rows.reduce((acc, r) => acc + r.amount, 0);
}

describe("GET /api/auth/me — auraEarned (fase 214, D-02, D-12)", () => {
  it("devuelve la Aura ganada propia: suma del ledger sin el canje (D-02)", async () => {
    const a = await createTestMember(app);
    const ledger: LedgerRow[] = [
      ...attendanceRows(3, 710001),
      {
        sourceType: "manual_adjustment",
        amount: -AURA_AMOUNTS.attendance,
        referenceType: "attendance_reversal",
        referenceId: null,
      },
      {
        sourceType: "referral",
        amount: 0,
        referenceType: "referral",
        referenceId: 710010,
      },
      {
        sourceType: "onboarding_completion",
        amount: 5,
        referenceType: null,
        referenceId: null,
      },
      {
        sourceType: "tenure_milestone",
        amount: 50,
        referenceType: "tenure",
        referenceId: 12,
      },
    ];
    const canje: LedgerRow = {
      sourceType: "manual_adjustment",
      amount: -100,
      referenceType: "subscription",
      referenceId: null,
    };
    await seedLedger(a.id, [...ledger, canje]);

    const res = await getMe(a.token);

    expect(res.statusCode).toBe(200);
    // Con la reversa y el onboarding sin referencia adentro, sin el canje.
    expect(res.body.auraEarned).toBe(sum(ledger));
    expect(res.body.auraEarned).toBe(65);
  });

  it("cada usuario recibe el suyo, nunca el de otro (D-37)", async () => {
    const a = await createTestMember(app);
    const b = await createTestMember(app);
    await seedLedger(a.id, attendanceRows(4, 720001));
    await seedLedger(b.id, attendanceRows(2, 720101));

    const resA = await getMe(a.token);
    const resB = await getMe(b.token);

    expect(resA.body.auraEarned).toBe(4 * AURA_AMOUNTS.attendance);
    expect(resB.body.auraEarned).toBe(2 * AURA_AMOUNTS.attendance);
    expect(resA.body.auraEarned).not.toBe(resB.body.auraEarned);
  });

  it("un socio sin movimientos recibe 0, no null", async () => {
    const a = await createTestMember(app);

    const res = await getMe(a.token);

    expect(res.statusCode).toBe(200);
    expect(res.body.auraEarned).toBe(0);
  });

  it("el staff (coach) recibe su número igual que un alumno (D-15 revocada)", async () => {
    const email = `coach-earned-${Date.now().toString(36)}@test.com`;
    const coachId = await createStaffUser(app, {
      email,
      password: "coach-pass-123",
      firstName: "Coach",
      lastName: "Ganada",
      role: "coach",
      branchId: 1,
    });
    await seedLedger(coachId, attendanceRows(1, 730001));
    const coachToken = await getAuthToken(app, email, "coach-pass-123");

    const res = await getMe(coachToken);

    expect(res.statusCode).toBe(200);
    expect(res.body.auraEarned).toBe(AURA_AMOUNTS.attendance);
  });

  it("conciliación (D-38): sin canjes, la ganada es igual al saldo guardado", async () => {
    const c = await createTestMember(app);
    await auraService.award({
      userId: c.id,
      sourceType: "attendance",
      referenceType: "attendance",
      referenceId: 740001,
      amount: AURA_AMOUNTS.attendance,
    });
    await auraService.award({
      userId: c.id,
      sourceType: "training_completion",
      referenceType: "training_day",
      referenceId: 20260310,
      amount: AURA_AMOUNTS.training,
    });
    await auraService.award({
      userId: c.id,
      sourceType: "onboarding_completion",
      referenceType: "onboarding",
      referenceId: 1,
      amount: 5,
    });

    const res = await getMe(c.token);
    const [balance] = await app.db
      .select({ balance: auraBalances.balance })
      .from(auraBalances)
      .where(eq(auraBalances.userId, c.id));

    expect(res.body.auraEarned).toBe(AURA_AMOUNTS.attendance + 3 + 5);
    expect(res.body.auraEarned).toBe(balance.balance);
  });

  it("un canje real (spend por suscripción) baja el saldo pero no la ganada", async () => {
    const c = await createTestMember(app);
    await auraService.award({
      userId: c.id,
      sourceType: "attendance",
      referenceType: "attendance",
      referenceId: 750001,
      amount: 20,
    });
    await auraService.spend({
      userId: c.id,
      amount: 10,
      description: "Descuento de suscripcion",
      referenceType: "subscription",
    });

    const res = await getMe(c.token);
    const [balance] = await app.db
      .select({ balance: auraBalances.balance })
      .from(auraBalances)
      .where(eq(auraBalances.userId, c.id));

    expect(balance.balance).toBe(10);
    expect(res.body.auraEarned).toBe(20);
  });

  it("módulo templo-gamification apagado: auraEarned es null (gimnasio 2)", async () => {
    const socio = gym2.socios[0];
    await seedLedger(socio.id, attendanceRows(2, 760001), gym2.tenantId);
    await setModuleFlag(app, gym2.tenantId, "templo-gamification", false);

    const off = await getMe(socio.token);

    expect(off.statusCode).toBe(200);
    expect(off.body.auraEarned).toBeNull();

    // Prendido, el mismo socio ve su número: lo que lo apagaba era el módulo.
    await setModuleFlag(app, gym2.tenantId, "templo-gamification", true);
    try {
      const on = await getMe(socio.token);
      expect(on.body.auraEarned).toBe(2 * AURA_AMOUNTS.attendance);
    } finally {
      await setModuleFlag(app, gym2.tenantId, "templo-gamification", false);
    }
  });
});
