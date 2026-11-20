/**
 * Fase 214 (plan 18, D-13, D-37, D-38) — `GET /api/members/aura/movements`.
 *
 * Detalle PRIVADO de la Aura propia: de a 20 movimientos, más nuevos primero,
 * con un texto por motivo. Las filas de monto 0 y los canjes no salen (no restan
 * de la Aura ganada), las reversas salen en negativo y la suma de todos los
 * movimientos es la Aura ganada. Sin parámetro de usuario: el id sale del token.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { asc, eq } from "drizzle-orm";
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
import { tenantValues } from "../../src/modules/shared/tenant";
import { AURA_AMOUNTS } from "../../src/modules/aura/amounts";
import {
  cleanupGiftClasses,
  clearFirstName,
  seedGift,
  seedGiftClass,
  setCommunityVisible,
  type GiftClass,
} from "./_gift-fixtures";

type SourceType = typeof auraTransactions.$inferInsert.sourceType;

interface LedgerRow {
  sourceType: SourceType;
  amount: number;
  referenceType: string | null;
  referenceId: number | null;
}

interface Movement {
  id: number;
  amount: number;
  label: string;
  createdAt: string;
}

interface MovementsBody {
  earned: number;
  movements: Movement[];
  nextBefore: number | null;
}

let app: FastifyInstance;
let gym2: SegundoGimnasio;
const claseCreadas: GiftClass[] = [];

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
});

afterAll(async () => {
  await cleanupGiftClasses(app, claseCreadas);
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

async function getMovements(
  token: string | undefined,
  query = "",
): Promise<{ statusCode: number; body: MovementsBody }> {
  const res = await app.inject({
    method: "GET",
    url: `/api/members/aura/movements${query}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { statusCode: res.statusCode, body: res.json() };
}

async function getAuraEarnedFromMe(token: string): Promise<number | null> {
  const res = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: { authorization: `Bearer ${token}` },
  });
  return (res.json() as { auraEarned: number | null }).auraEarned;
}

async function ledgerIds(userId: number): Promise<number[]> {
  const rows = await app.db
    .select({ id: auraTransactions.id })
    .from(auraTransactions)
    .where(eq(auraTransactions.userId, userId))
    .orderBy(asc(auraTransactions.id));
  return rows.map((r) => r.id);
}

describe("GET /api/members/aura/movements (fase 214, D-13)", () => {
  it("lista los movimientos propios, nuevos primero, con texto por motivo, sin filas de 0 ni canjes", async () => {
    const a = await createTestMember(app);
    const ledger: LedgerRow[] = [
      ...attendanceRows(2, 810001),
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
        referenceId: 810010,
      },
      {
        sourceType: "tenure_milestone",
        amount: 50,
        referenceType: "tenure_milestone",
        referenceId: 12,
      },
      {
        sourceType: "profile_photo",
        amount: AURA_AMOUNTS.profilePhoto,
        referenceType: "profile_photo",
        referenceId: 810020,
      },
      {
        sourceType: "manual_adjustment",
        amount: -100,
        referenceType: "subscription",
        referenceId: null,
      },
    ];
    await seedLedger(a.id, ledger);

    const res = await getMovements(a.token);

    expect(res.statusCode).toBe(200);
    // Más nuevo primero: foto, hito, reversa, asistencia, asistencia.
    expect(res.body.movements.map((m) => m.label)).toEqual([
      "Foto de perfil",
      "1 año en El Templo",
      "Asistencia anulada",
      "Asistencia a clase",
      "Asistencia a clase",
    ]);
    expect(res.body.movements.map((m) => m.amount)).toEqual([
      AURA_AMOUNTS.profilePhoto,
      50,
      -AURA_AMOUNTS.attendance,
      AURA_AMOUNTS.attendance,
      AURA_AMOUNTS.attendance,
    ]);
    expect(res.body.movements.every((m) => m.amount !== 0)).toBe(true);
    expect(res.body.nextBefore).toBeNull();
    const ids = res.body.movements.map((m) => m.id);
    expect([...ids].sort((x, y) => y - x)).toEqual(ids);
  });

  it("declara todos los campos: earned, id, amount, label, createdAt y nextBefore", async () => {
    const a = await createTestMember(app);
    await seedLedger(a.id, attendanceRows(1, 811001));

    const res = await getMovements(a.token);

    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      "earned",
      "movements",
      "nextBefore",
    ]);
    expect(res.body.earned).toBe(AURA_AMOUNTS.attendance);
    expect(res.body.movements).toHaveLength(1);
    const [movement] = res.body.movements;
    expect(Object.keys(movement).sort()).toEqual([
      "amount",
      "createdAt",
      "id",
      "label",
    ]);
    expect(typeof movement.id).toBe("number");
    expect(movement.amount).toBe(AURA_AMOUNTS.attendance);
    expect(movement.label).toBe("Asistencia a clase");
    expect(Number.isNaN(Date.parse(movement.createdAt))).toBe(false);
    expect(res.body.nextBefore).toBeNull();
  });

  it("pagina de a 20 con cursor: la unión de páginas es exactamente lo sembrado", async () => {
    const a = await createTestMember(app);
    await seedLedger(a.id, attendanceRows(25, 812001));
    const seeded = await ledgerIds(a.id);
    expect(seeded).toHaveLength(25);

    const first = await getMovements(a.token);

    expect(first.statusCode).toBe(200);
    expect(first.body.movements).toHaveLength(20);
    expect(first.body.nextBefore).not.toBeNull();

    const second = await getMovements(
      a.token,
      `?before=${first.body.nextBefore}`,
    );

    expect(second.statusCode).toBe(200);
    expect(second.body.movements).toHaveLength(5);
    expect(second.body.nextBefore).toBeNull();

    const union = [...first.body.movements, ...second.body.movements].map(
      (m) => m.id,
    );
    expect(new Set(union).size).toBe(25);
    expect([...union].sort((x, y) => x - y)).toEqual(seeded);
    expect(first.body.earned).toBe(25 * AURA_AMOUNTS.attendance);
    expect(second.body.earned).toBe(first.body.earned);
  });

  it("respeta un limit propio y el tope de 50", async () => {
    const a = await createTestMember(app);
    await seedLedger(a.id, attendanceRows(7, 813001));

    const chico = await getMovements(a.token, "?limit=3");
    const tope = await getMovements(a.token, "?limit=50");
    const pasado = await getMovements(a.token, "?limit=51");
    const cero = await getMovements(a.token, "?limit=0");

    expect(chico.statusCode).toBe(200);
    expect(chico.body.movements).toHaveLength(3);
    expect(chico.body.nextBefore).toBe(chico.body.movements[2].id);
    expect(tope.statusCode).toBe(200);
    expect(tope.body.movements).toHaveLength(7);
    expect(tope.body.nextBefore).toBeNull();
    expect(pasado.statusCode).toBe(400);
    expect(cero.statusCode).toBe(400);
  });

  it("D-38: earned es la suma de todas las páginas y es igual a auraEarned de /me", async () => {
    const a = await createTestMember(app);
    await seedLedger(a.id, [
      ...attendanceRows(22, 814001),
      {
        sourceType: "manual_adjustment",
        amount: -AURA_AMOUNTS.attendance,
        referenceType: "attendance_reversal",
        referenceId: null,
      },
      {
        sourceType: "onboarding_completion",
        amount: 5,
        referenceType: null,
        referenceId: null,
      },
      {
        sourceType: "manual_adjustment",
        amount: -100,
        referenceType: "subscription",
        referenceId: null,
      },
    ]);

    const first = await getMovements(a.token);
    const second = await getMovements(
      a.token,
      `?before=${first.body.nextBefore}`,
    );
    const total = [...first.body.movements, ...second.body.movements].reduce(
      (acc, m) => acc + m.amount,
      0,
    );

    expect(first.body.nextBefore).not.toBeNull();
    expect(second.body.nextBefore).toBeNull();
    expect(first.body.earned).toBe(total);
    expect(total).toBe(await getAuraEarnedFromMe(a.token));
  });

  it("D-37: cada usuario ve solo lo suyo y el userId del querystring se ignora", async () => {
    const a = await createTestMember(app);
    const b = await createTestMember(app);
    await seedLedger(a.id, attendanceRows(4, 815001));
    await seedLedger(b.id, attendanceRows(2, 815101));

    const resA = await getMovements(a.token);
    const resB = await getMovements(b.token);
    // Fastify descarta el campo extra (`additionalProperties: false` con
    // `removeAdditional`): responde igual, con el detalle del propio token.
    const resBPidiendoA = await getMovements(b.token, `?userId=${a.id}`);

    const idsA = new Set(resA.body.movements.map((m) => m.id));
    const idsB = resB.body.movements.map((m) => m.id);
    expect(resA.body.movements).toHaveLength(4);
    expect(idsB).toHaveLength(2);
    expect(idsB.some((id) => idsA.has(id))).toBe(false);
    expect(resBPidiendoA.statusCode).toBe(200);
    expect(resBPidiendoA.body.movements.map((m) => m.id)).toEqual(idsB);
    expect(resBPidiendoA.body.earned).toBe(2 * AURA_AMOUNTS.attendance);
  });

  it("un cursor `before` de otro usuario no filtra filas ajenas", async () => {
    const a = await createTestMember(app);
    const b = await createTestMember(app);
    await seedLedger(a.id, attendanceRows(3, 816001));
    await seedLedger(b.id, attendanceRows(3, 816101));
    const idsA = new Set(await ledgerIds(a.id));
    const idsB = await ledgerIds(b.id);

    const res = await getMovements(a.token, `?before=${idsB[idsB.length - 1]}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.movements).toHaveLength(3);
    expect(res.body.movements.every((m) => idsA.has(m.id))).toBe(true);
  });

  it("el staff (coach) recibe su detalle igual que un alumno (D-15 revocada)", async () => {
    const email = `coach-mov-${Date.now().toString(36)}@test.com`;
    const coachId = await createStaffUser(app, {
      email,
      password: "coach-pass-123",
      firstName: "Coach",
      lastName: "Detalle",
      role: "coach",
      branchId: 1,
    });
    await seedLedger(coachId, attendanceRows(1, 817001));
    const coachToken = await getAuthToken(app, email, "coach-pass-123");

    const res = await getMovements(coachToken);

    expect(res.statusCode).toBe(200);
    expect(res.body.movements.map((m) => m.label)).toEqual([
      "Asistencia a clase",
    ]);
    expect(res.body.earned).toBe(AURA_AMOUNTS.attendance);
  });

  it("un socio sin movimientos recibe lista vacía y earned 0", async () => {
    const a = await createTestMember(app);

    const res = await getMovements(a.token);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ earned: 0, movements: [], nextBefore: null });
  });

  it("sin token responde 401", async () => {
    const res = await getMovements(undefined);

    expect(res.statusCode).toBe(401);
  });

  it("gimnasio 2 con el módulo prendido: ve solo su ledger, no el de El Templo", async () => {
    const templo = await createTestMember(app);
    await seedLedger(templo.id, attendanceRows(3, 818001));
    const socio = gym2.socios[0];
    await seedLedger(socio.id, attendanceRows(2, 818101), gym2.tenantId);
    await setModuleFlag(app, gym2.tenantId, "templo-gamification", true);

    try {
      const res = await getMovements(socio.token);

      expect(res.statusCode).toBe(200);
      expect(res.body.movements).toHaveLength(2);
      expect(res.body.earned).toBe(2 * AURA_AMOUNTS.attendance);
    } finally {
      await setModuleFlag(app, gym2.tenantId, "templo-gamification", false);
    }
  });
});

describe("GET /api/members/aura/movements con regalos (fase 215, D-13, D-19, D-22)", () => {
  async function claseDeRegalo(): Promise<GiftClass> {
    const cls = await seedGiftClass(app);
    claseCreadas.push(cls);
    return cls;
  }

  it("regalo de un alumno: monto 1 y texto con nombre, inicial del apellido y motivo", async () => {
    const cls = await claseDeRegalo();
    const dador = await createTestMember(app, {
      firstName: "Sofía",
      lastName: "Martínez",
    });
    const receptor = await createTestMember(app);
    const giftId = await seedGift(app, {
      giverUserId: dador.id,
      receiverUserId: receptor.id,
      branchId: cls.branchId,
      scheduleId: cls.scheduleId,
      sessionDate: cls.sessionDate,
      reason: "energia",
      amount: AURA_AMOUNTS.giftMember,
    });
    await seedLedger(receptor.id, [
      {
        sourceType: "social",
        amount: AURA_AMOUNTS.giftMember,
        referenceType: "aura_gift",
        referenceId: giftId,
      },
    ]);

    const res = await getMovements(receptor.token);

    expect(res.statusCode).toBe(200);
    expect(res.body.movements).toHaveLength(1);
    expect(res.body.movements[0].amount).toBe(1);
    expect(res.body.movements[0].label).toBe(
      "Sofía M. te dio Aura · Buena energía",
    );
    expect(res.body.earned).toBe(1);
  });

  it("ME-01: quien dio y hoy está oculto no se nombra: 'Te dieron 1 de Aura por Buena energía'", async () => {
    const cls = await claseDeRegalo();
    const dador = await createTestMember(app, {
      firstName: "Sofía",
      lastName: "Martínez",
    });
    const receptor = await createTestMember(app);
    const giftId = await seedGift(app, {
      giverUserId: dador.id,
      receiverUserId: receptor.id,
      branchId: cls.branchId,
      scheduleId: cls.scheduleId,
      sessionDate: cls.sessionDate,
      reason: "energia",
      amount: AURA_AMOUNTS.giftMember,
    });
    await seedLedger(receptor.id, [
      {
        sourceType: "social",
        amount: AURA_AMOUNTS.giftMember,
        referenceType: "aura_gift",
        referenceId: giftId,
      },
    ]);
    await setCommunityVisible(app, dador.id, false);

    const res = await getMovements(receptor.token);

    expect(res.statusCode).toBe(200);
    expect(res.body.movements[0].label).toBe(
      "Te dieron 1 de Aura por Buena energía",
    );
    expect(JSON.stringify(res.body)).not.toContain("Sofía");
    expect(JSON.stringify(res.body)).not.toContain("Alguien");
  });

  it("#38: quien dio sin nombre cargado tampoco se nombra", async () => {
    const cls = await claseDeRegalo();
    const dador = await createTestMember(app, { lastName: "Martínez" });
    await clearFirstName(app, dador.id);
    const receptor = await createTestMember(app);
    const giftId = await seedGift(app, {
      giverUserId: dador.id,
      receiverUserId: receptor.id,
      branchId: cls.branchId,
      scheduleId: cls.scheduleId,
      sessionDate: cls.sessionDate,
      reason: "constancia",
      amount: AURA_AMOUNTS.giftMember,
    });
    await seedLedger(receptor.id, [
      {
        sourceType: "social",
        amount: AURA_AMOUNTS.giftMember,
        referenceType: "aura_gift",
        referenceId: giftId,
      },
    ]);

    const res = await getMovements(receptor.token);

    expect(res.body.movements[0].label).toBe(
      "Te dieron 1 de Aura por Constancia",
    );
  });

  it("regalo del profe: 'Tu profe Nombre te dio Aura' con el monto del profe y sin apellido", async () => {
    const cls = await claseDeRegalo();
    const profeId = await createStaffUser(app, {
      email: `profe-mov-${Date.now().toString(36)}@test.com`,
      password: "profe-pass-123",
      firstName: "Fran",
      lastName: "Gómez",
      role: "coach",
      branchId: cls.branchId,
    });
    const receptor = await createTestMember(app);
    const giftId = await seedGift(app, {
      giverUserId: profeId,
      receiverUserId: receptor.id,
      giverKind: "profe",
      branchId: cls.branchId,
      scheduleId: cls.scheduleId,
      sessionDate: cls.sessionDate,
      reason: "tecnica",
      amount: 3,
    });
    await seedLedger(receptor.id, [
      {
        sourceType: "social",
        amount: 3,
        referenceType: "aura_gift",
        referenceId: giftId,
      },
    ]);

    const res = await getMovements(receptor.token);

    expect(res.statusCode).toBe(200);
    expect(res.body.movements).toHaveLength(1);
    expect(res.body.movements[0].amount).toBe(3);
    expect(res.body.movements[0].label).toBe(
      "Tu profe Fran te dio Aura · Buena técnica",
    );
    expect(res.body.movements[0].label).not.toContain("Gómez");
  });

  it("regalo anulado: dos filas (+1 y -1 con la causa de la anulación) y earned es la suma de la página", async () => {
    const cls = await claseDeRegalo();
    const dador = await createTestMember(app);
    const receptor = await createTestMember(app);
    const giftId = await seedGift(app, {
      giverUserId: dador.id,
      receiverUserId: receptor.id,
      branchId: cls.branchId,
      scheduleId: cls.scheduleId,
      sessionDate: cls.sessionDate,
      reason: "constancia",
      amount: AURA_AMOUNTS.giftMember,
      status: "anulado",
      voidCause: "asistencia",
    });
    await seedLedger(receptor.id, [
      ...attendanceRows(1, 819001),
      {
        sourceType: "social",
        amount: AURA_AMOUNTS.giftMember,
        referenceType: "aura_gift",
        referenceId: giftId,
      },
      {
        sourceType: "social",
        amount: -AURA_AMOUNTS.giftMember,
        referenceType: "aura_gift_void",
        referenceId: giftId,
      },
    ]);

    const res = await getMovements(receptor.token);

    expect(res.statusCode).toBe(200);
    expect(
      res.body.movements.map((m) => ({ amount: m.amount, label: m.label })),
    ).toEqual([
      {
        amount: -AURA_AMOUNTS.giftMember,
        label: "Regalo anulado: la asistencia se corrigió",
      },
      {
        amount: AURA_AMOUNTS.giftMember,
        label: expect.stringContaining("te dio Aura"),
      },
      { amount: AURA_AMOUNTS.attendance, label: "Asistencia a clase" },
    ]);
    const suma = res.body.movements.reduce((acc, m) => acc + m.amount, 0);
    expect(res.body.earned).toBe(suma);
    expect(res.body.earned).toBe(await getAuraEarnedFromMe(receptor.token));
  });

  it("regalo anulado por el staff: el movimiento dice 'Regalo anulado por el staff' (#37)", async () => {
    const cls = await claseDeRegalo();
    const dador = await createTestMember(app);
    const receptor = await createTestMember(app);
    const giftId = await seedGift(app, {
      giverUserId: dador.id,
      receiverUserId: receptor.id,
      branchId: cls.branchId,
      scheduleId: cls.scheduleId,
      sessionDate: cls.sessionDate,
      status: "anulado",
      voidCause: "staff",
    });
    await seedLedger(receptor.id, [
      {
        sourceType: "social",
        amount: -AURA_AMOUNTS.giftMember,
        referenceType: "aura_gift_void",
        referenceId: giftId,
      },
    ]);

    const res = await getMovements(receptor.token);

    expect(res.statusCode).toBe(200);
    expect(res.body.movements.map((m) => m.label)).toEqual([
      "Regalo anulado por el staff",
    ]);
  });

  it("D-09: quien da no ve nada de regalo en su detalle", async () => {
    const cls = await claseDeRegalo();
    const dador = await createTestMember(app);
    const receptor = await createTestMember(app);
    const giftId = await seedGift(app, {
      giverUserId: dador.id,
      receiverUserId: receptor.id,
      branchId: cls.branchId,
      scheduleId: cls.scheduleId,
      sessionDate: cls.sessionDate,
    });
    await seedLedger(receptor.id, [
      {
        sourceType: "social",
        amount: AURA_AMOUNTS.giftMember,
        referenceType: "aura_gift",
        referenceId: giftId,
      },
    ]);
    await seedLedger(dador.id, attendanceRows(1, 819101));

    const res = await getMovements(dador.token);

    expect(res.statusCode).toBe(200);
    expect(res.body.movements.map((m) => m.label)).toEqual([
      "Asistencia a clase",
    ]);
    expect(res.body.earned).toBe(AURA_AMOUNTS.attendance);
  });

  it("un regalo ajeno con el mismo id de referencia no pone nombre en otra fila", async () => {
    const cls = await claseDeRegalo();
    const dador = await createTestMember(app, { firstName: "Secreta" });
    const receptor = await createTestMember(app);
    const otro = await createTestMember(app);
    const giftId = await seedGift(app, {
      giverUserId: dador.id,
      receiverUserId: receptor.id,
      branchId: cls.branchId,
      scheduleId: cls.scheduleId,
      sessionDate: cls.sessionDate,
    });
    // El ledger de `otro` apunta al regalo de `receptor`: no debe revelar al dador.
    await seedLedger(otro.id, [
      {
        sourceType: "social",
        amount: 1,
        referenceType: "aura_gift",
        referenceId: giftId,
      },
    ]);

    const res = await getMovements(otro.token);

    expect(res.statusCode).toBe(200);
    expect(res.body.movements.map((m) => m.label)).toEqual(["Regalo de Aura"]);
  });

  it("un regalo borrado cae en 'Regalo de Aura' y la respuesta no trae campos nuevos", async () => {
    const receptor = await createTestMember(app);
    await seedLedger(receptor.id, [
      {
        sourceType: "social",
        amount: AURA_AMOUNTS.giftMember,
        referenceType: "aura_gift",
        referenceId: 899999,
      },
    ]);

    const res = await getMovements(receptor.token);

    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      "earned",
      "movements",
      "nextBefore",
    ]);
    expect(res.body.movements).toHaveLength(1);
    expect(Object.keys(res.body.movements[0]).sort()).toEqual([
      "amount",
      "createdAt",
      "id",
      "label",
    ]);
    expect(res.body.movements[0].label).toBe("Regalo de Aura");
  });
});
