/**
 * Fase 215 (#33) — celebración de Aura: `GET /api/members/aura/celebration` y
 * `POST /api/members/aura/celebration/ack`.
 *
 * La marca de lo ya celebrado vive en `member_profiles.aura_celebrated_until_id`
 * (mig 0353). Primera vez: no devuelve nada y fija la marca en el máximo del
 * ledger. Después devuelve los movimientos propios con id mayor a la marca, de
 * monto positivo, sin las fuentes con celebración propia (asistencia,
 * estiramiento, bloque libre), sin canjes y sin regalos anulados. Los regalos
 * siguen la regla de anonimato de ME-01 y #38.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createTestMember,
  createStaffUser,
} from "../helpers";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import { setModuleFlag, restoreTemploFlags } from "../fixtures/module-flags";
import { auraTransactions } from "../../src/db/schema/aura-transactions";
import { memberProfiles } from "../../src/db/schema/member-profiles";
import { tenantValues } from "../../src/modules/shared/tenant";
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
  referenceType?: string | null;
  referenceId?: number | null;
}

interface CelebrationGift {
  kind: "alumno" | "profe";
  anonymous: boolean;
  name: string | null;
  reason: string;
}

interface CelebrationMovement {
  id: number;
  amount: number;
  source: string;
  label: string;
  gift: CelebrationGift | null;
}

interface CelebrationBody {
  movements: CelebrationMovement[];
  count: number;
  sum: number;
  total: number;
  maxId: number;
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

/** Inserta filas en el ledger y devuelve sus ids en el orden de inserción. */
async function seedLedger(
  userId: number,
  rows: LedgerRow[],
  tenantId: number = TENANT_TEMPLO,
): Promise<number[]> {
  const ids: number[] = [];
  for (const row of rows) {
    const [inserted] = await app.db
      .insert(auraTransactions)
      .values(
        tenantValues(
          { tenantId },
          {
            userId,
            sourceType: row.sourceType,
            amount: row.amount,
            referenceType: row.referenceType ?? null,
            referenceId: row.referenceId ?? null,
          },
        ),
      )
      .$returningId();
    ids.push(inserted.id);
  }
  return ids;
}

async function getCelebration(
  token: string | undefined,
): Promise<{ statusCode: number; body: CelebrationBody }> {
  const res = await app.inject({
    method: "GET",
    url: "/api/members/aura/celebration",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { statusCode: res.statusCode, body: res.json() };
}

async function postAck(
  token: string | undefined,
  payload: unknown,
): Promise<{ statusCode: number; body: unknown }> {
  const res = await app.inject({
    method: "POST",
    url: "/api/members/aura/celebration/ack",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload: payload as Record<string, unknown>,
  });
  return { statusCode: res.statusCode, body: res.body };
}

async function readMark(
  userId: number,
  tenantId: number = TENANT_TEMPLO,
): Promise<number | null | undefined> {
  const rows = await app.db
    .select({ mark: memberProfiles.auraCelebratedUntilId })
    .from(memberProfiles)
    .where(
      and(
        eq(memberProfiles.tenantId, tenantId),
        eq(memberProfiles.userId, userId),
      ),
    );
  return rows.length === 0 ? undefined : rows[0].mark;
}

async function claseDeRegalo(): Promise<GiftClass> {
  const cls = await seedGiftClass(app);
  claseCreadas.push(cls);
  return cls;
}

/** Siembra un regalo vigente (o anulado) y su fila positiva en el ledger. */
async function seedGiftWithLedger(
  cls: GiftClass,
  input: {
    giverUserId: number;
    receiverUserId: number;
    giverKind?: "alumno" | "profe";
    reason?: "tecnica" | "constancia" | "energia" | "ayudo";
    amount?: number;
    status?: "vigente" | "anulado";
  },
): Promise<{ giftId: number; ledgerId: number }> {
  const amount = input.amount ?? (input.giverKind === "profe" ? 2 : 1);
  const giftId = await seedGift(app, {
    giverUserId: input.giverUserId,
    receiverUserId: input.receiverUserId,
    giverKind: input.giverKind,
    branchId: cls.branchId,
    scheduleId: cls.scheduleId,
    sessionDate: cls.sessionDate,
    reason: input.reason ?? "energia",
    amount,
    status: input.status,
  });
  const [ledgerId] = await seedLedger(input.receiverUserId, [
    {
      sourceType: "social",
      amount,
      referenceType: "aura_gift",
      referenceId: giftId,
    },
  ]);
  return { giftId, ledgerId };
}

describe("GET /api/members/aura/celebration — primera vez", () => {
  it("con la marca en NULL no devuelve nada y fija la marca en el máximo del ledger", async () => {
    const socio = await createTestMember(app);
    const ids = await seedLedger(socio.id, [
      { sourceType: "profile_photo", amount: 5 },
      { sourceType: "program_completion", amount: 50 },
    ]);

    const res = await getCelebration(socio.token);

    expect(res.statusCode).toBe(200);
    expect(res.body.movements).toEqual([]);
    expect(res.body.count).toBe(0);
    expect(res.body.sum).toBe(0);
    expect(res.body.total).toBe(55);
    expect(res.body.maxId).toBe(ids[1]);
    expect(await readMark(socio.id)).toBe(ids[1]);
  });

  it("sin movimientos en el ledger fija la marca en 0 y lo que llegue después sí se celebra", async () => {
    const socio = await createTestMember(app);

    const primera = await getCelebration(socio.token);
    expect(primera.body.movements).toEqual([]);
    expect(primera.body.maxId).toBe(0);
    expect(await readMark(socio.id)).toBe(0);

    await seedLedger(socio.id, [{ sourceType: "profile_photo", amount: 5 }]);
    const segunda = await getCelebration(socio.token);

    expect(segunda.body.movements).toHaveLength(1);
    expect(segunda.body.movements[0].label).toBe("Foto de perfil");
  });

  it("un socio sin fila de perfil (freemium) queda con una fila y la marca fijada", async () => {
    const socio = await createTestMember(app);
    expect(await readMark(socio.id)).toBeUndefined();

    await getCelebration(socio.token);

    expect(await readMark(socio.id)).toBe(0);
  });

  it("la primera consulta no celebra el historial, pero lo posterior sí", async () => {
    const socio = await createTestMember(app);
    await seedLedger(socio.id, [
      { sourceType: "program_completion", amount: 50 },
    ]);
    await getCelebration(socio.token);
    await seedLedger(socio.id, [
      { sourceType: "tenure_milestone", amount: 15, referenceId: 3 },
    ]);

    const res = await getCelebration(socio.token);

    expect(res.body.movements.map((m) => m.label)).toEqual([
      "3 meses en El Templo",
    ]);
    expect(res.body.sum).toBe(15);
    expect(res.body.total).toBe(65);
  });
});

describe("GET /api/members/aura/celebration — qué se celebra", () => {
  it("devuelve lo nuevo, del más nuevo al más viejo, con monto, texto, cuenta y suma", async () => {
    const socio = await createTestMember(app);
    await getCelebration(socio.token);
    const ids = await seedLedger(socio.id, [
      { sourceType: "profile_photo", amount: 5 },
      { sourceType: "streak_bonus", amount: 10, referenceId: 14 },
      { sourceType: "program_completion", amount: 50 },
    ]);

    const res = await getCelebration(socio.token);

    expect(res.statusCode).toBe(200);
    expect(res.body.movements.map((m) => m.id)).toEqual([
      ids[2],
      ids[1],
      ids[0],
    ]);
    expect(res.body.movements.map((m) => m.amount)).toEqual([50, 10, 5]);
    expect(res.body.movements.map((m) => m.source)).toEqual([
      "program_completion",
      "streak_bonus",
      "profile_photo",
    ]);
    expect(res.body.movements.map((m) => m.label)).toEqual([
      "Programa completo",
      "14 días seguidos entrenando en la app",
      "Foto de perfil",
    ]);
    expect(res.body.movements.every((m) => m.gift === null)).toBe(true);
    expect(res.body.count).toBe(3);
    expect(res.body.sum).toBe(65);
    expect(res.body.total).toBe(65);
    expect(res.body.maxId).toBe(ids[2]);
  });

  it("excluye asistencia, estiramiento y bloque libre (ya tienen su celebración) pero el total los cuenta", async () => {
    const socio = await createTestMember(app);
    await getCelebration(socio.token);
    await seedLedger(socio.id, [
      {
        sourceType: "attendance",
        amount: 5,
        referenceType: "attendance",
        referenceId: 1,
      },
      { sourceType: "stretch", amount: 3 },
      { sourceType: "extra_block", amount: 2 },
      { sourceType: "profile_photo", amount: 5 },
    ]);

    const res = await getCelebration(socio.token);

    expect(res.body.movements.map((m) => m.label)).toEqual(["Foto de perfil"]);
    expect(res.body.count).toBe(1);
    expect(res.body.sum).toBe(5);
    expect(res.body.total).toBe(15);
  });

  it("excluye montos en cero, negativos (reversas) y los canjes", async () => {
    const socio = await createTestMember(app);
    await getCelebration(socio.token);
    await seedLedger(socio.id, [
      { sourceType: "profile_photo", amount: 0 },
      {
        sourceType: "manual_adjustment",
        amount: -5,
        referenceType: "attendance_reversal",
      },
      { sourceType: "subscription_discount", amount: 20 },
      {
        sourceType: "manual_adjustment",
        amount: 20,
        referenceType: "subscription",
        referenceId: 9,
      },
      { sourceType: "tenure_milestone", amount: 15, referenceId: 6 },
    ]);

    const res = await getCelebration(socio.token);

    expect(res.body.movements.map((m) => m.label)).toEqual([
      "6 meses en El Templo",
    ]);
    expect(res.body.count).toBe(1);
  });

  it("no mezcla movimientos de otra persona", async () => {
    const socio = await createTestMember(app);
    const otro = await createTestMember(app);
    await getCelebration(socio.token);
    await getCelebration(otro.token);
    await seedLedger(otro.id, [
      { sourceType: "program_completion", amount: 50 },
    ]);

    const res = await getCelebration(socio.token);

    expect(res.body.movements).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it("devuelve hasta 20 movimientos pero cuenta y suma todos", async () => {
    const socio = await createTestMember(app);
    await getCelebration(socio.token);
    const rows: LedgerRow[] = Array.from({ length: 23 }, () => ({
      sourceType: "program_week_completion" as const,
      amount: 2,
    }));
    const ids = await seedLedger(socio.id, rows);

    const res = await getCelebration(socio.token);

    expect(res.body.movements).toHaveLength(20);
    expect(res.body.movements[0].id).toBe(ids[22]);
    expect(res.body.movements[19].id).toBe(ids[3]);
    expect(res.body.count).toBe(23);
    expect(res.body.sum).toBe(46);
    expect(res.body.total).toBe(46);
  });

  it("dos llamadas seguidas devuelven lo mismo mientras no llegue el ack", async () => {
    const socio = await createTestMember(app);
    await getCelebration(socio.token);
    await seedLedger(socio.id, [{ sourceType: "profile_photo", amount: 5 }]);

    const primera = await getCelebration(socio.token);
    const segunda = await getCelebration(socio.token);

    expect(primera.body.movements).toHaveLength(1);
    expect(segunda.body).toEqual(primera.body);
  });
});

describe("GET /api/members/aura/celebration — regalos", () => {
  it("regalo de un alumno: nombre con inicial del apellido, motivo y monto", async () => {
    const cls = await claseDeRegalo();
    const dador = await createTestMember(app, {
      firstName: "Juan",
      lastName: "Pérez",
    });
    const receptor = await createTestMember(app);
    await getCelebration(receptor.token);
    const { ledgerId } = await seedGiftWithLedger(cls, {
      giverUserId: dador.id,
      receiverUserId: receptor.id,
    });

    const res = await getCelebration(receptor.token);

    expect(res.body.movements).toHaveLength(1);
    expect(res.body.movements[0]).toEqual({
      id: ledgerId,
      amount: 1,
      source: "social",
      label: "Juan P. te dio Aura · Buena energía",
      gift: {
        kind: "alumno",
        anonymous: false,
        name: "Juan P.",
        reason: "Buena energía",
      },
    });
  });

  it("regalo del profe: nombre de pila, sin apellido y con el monto del profe", async () => {
    const cls = await claseDeRegalo();
    const profeId = await createStaffUser(app, {
      email: `profe-cel-${Date.now().toString(36)}@test.com`,
      password: "profe-pass-123",
      firstName: "Fran",
      lastName: "Gómez",
      role: "coach",
      branchId: cls.branchId,
    });
    const receptor = await createTestMember(app);
    await getCelebration(receptor.token);
    await seedGiftWithLedger(cls, {
      giverUserId: profeId,
      receiverUserId: receptor.id,
      giverKind: "profe",
      reason: "constancia",
      amount: 3,
    });

    const res = await getCelebration(receptor.token);

    expect(res.body.movements[0].amount).toBe(3);
    expect(res.body.movements[0].gift).toEqual({
      kind: "profe",
      anonymous: false,
      name: "Fran",
      reason: "Constancia",
    });
    expect(JSON.stringify(res.body)).not.toContain("Gómez");
  });

  it("ME-01: quien dio y hoy está oculto sale anónimo, sin nombre ni 'Alguien'", async () => {
    const cls = await claseDeRegalo();
    const dador = await createTestMember(app, {
      firstName: "Sofía",
      lastName: "Martínez",
    });
    const receptor = await createTestMember(app);
    await getCelebration(receptor.token);
    await seedGiftWithLedger(cls, {
      giverUserId: dador.id,
      receiverUserId: receptor.id,
    });
    await setCommunityVisible(app, dador.id, false);

    const res = await getCelebration(receptor.token);

    expect(res.body.movements[0].gift).toEqual({
      kind: "alumno",
      anonymous: true,
      name: null,
      reason: "Buena energía",
    });
    expect(res.body.movements[0].label).toBe(
      "Te dieron 1 de Aura por Buena energía",
    );
    expect(JSON.stringify(res.body)).not.toContain("Sofía");
    expect(JSON.stringify(res.body)).not.toContain("Alguien");
  });

  it("#38: quien dio sin nombre cargado también sale anónimo", async () => {
    const cls = await claseDeRegalo();
    const dador = await createTestMember(app, { lastName: "Martínez" });
    await clearFirstName(app, dador.id);
    const receptor = await createTestMember(app);
    await getCelebration(receptor.token);
    await seedGiftWithLedger(cls, {
      giverUserId: dador.id,
      receiverUserId: receptor.id,
      reason: "ayudo",
    });

    const res = await getCelebration(receptor.token);

    expect(res.body.movements[0].gift?.anonymous).toBe(true);
    expect(res.body.movements[0].gift?.name).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain("Alguien");
  });

  it("un regalo anulado no se celebra (ni cuenta ni suma)", async () => {
    const cls = await claseDeRegalo();
    const dador = await createTestMember(app, { firstName: "Juan" });
    const receptor = await createTestMember(app);
    await getCelebration(receptor.token);
    await seedGiftWithLedger(cls, {
      giverUserId: dador.id,
      receiverUserId: receptor.id,
      status: "anulado",
    });
    await seedLedger(receptor.id, [{ sourceType: "profile_photo", amount: 5 }]);

    const res = await getCelebration(receptor.token);

    expect(res.body.movements.map((m) => m.label)).toEqual(["Foto de perfil"]);
    expect(res.body.count).toBe(1);
    expect(res.body.sum).toBe(5);
  });

  it("la anulación (monto negativo) tampoco aparece", async () => {
    const cls = await claseDeRegalo();
    const dador = await createTestMember(app, { firstName: "Juan" });
    const receptor = await createTestMember(app);
    await getCelebration(receptor.token);
    const { giftId } = await seedGiftWithLedger(cls, {
      giverUserId: dador.id,
      receiverUserId: receptor.id,
      status: "anulado",
    });
    await seedLedger(receptor.id, [
      {
        sourceType: "social",
        amount: -1,
        referenceType: "aura_gift_void",
        referenceId: giftId,
      },
    ]);

    const res = await getCelebration(receptor.token);

    expect(res.body.movements).toEqual([]);
    expect(res.body.count).toBe(0);
  });

  it("un regalo ajeno con el mismo id no se usa para redactar (solo regalos propios)", async () => {
    const cls = await claseDeRegalo();
    const dador = await createTestMember(app, {
      firstName: "Juan",
      lastName: "Pérez",
    });
    const otro = await createTestMember(app);
    const receptor = await createTestMember(app);
    await getCelebration(receptor.token);
    const { giftId } = await seedGiftWithLedger(cls, {
      giverUserId: dador.id,
      receiverUserId: otro.id,
    });
    // Fila del receptor que apunta al regalo de otra persona.
    await seedLedger(receptor.id, [
      {
        sourceType: "social",
        amount: 1,
        referenceType: "aura_gift",
        referenceId: giftId,
      },
    ]);

    const res = await getCelebration(receptor.token);

    expect(res.body.movements).toHaveLength(1);
    expect(res.body.movements[0].gift).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain("Juan");
  });
});

describe("POST /api/members/aura/celebration/ack", () => {
  it("mueve la marca y la próxima consulta ya no trae lo celebrado", async () => {
    const socio = await createTestMember(app);
    await getCelebration(socio.token);
    await seedLedger(socio.id, [
      { sourceType: "profile_photo", amount: 5 },
      { sourceType: "program_completion", amount: 50 },
    ]);
    const antes = await getCelebration(socio.token);

    const ack = await postAck(socio.token, { upToId: antes.body.maxId });
    const despues = await getCelebration(socio.token);

    expect(ack.statusCode).toBe(204);
    expect(ack.body).toBe("");
    expect(despues.body.movements).toEqual([]);
    expect(despues.body.count).toBe(0);
    expect(await readMark(socio.id)).toBe(antes.body.maxId);
  });

  it("lo que llega después del ack se celebra de nuevo", async () => {
    const socio = await createTestMember(app);
    await getCelebration(socio.token);
    await seedLedger(socio.id, [{ sourceType: "profile_photo", amount: 5 }]);
    const antes = await getCelebration(socio.token);
    await postAck(socio.token, { upToId: antes.body.maxId });
    await seedLedger(socio.id, [
      { sourceType: "program_completion", amount: 50 },
    ]);

    const res = await getCelebration(socio.token);

    expect(res.body.movements.map((m) => m.label)).toEqual([
      "Programa completo",
    ]);
  });

  it("la marca nunca retrocede", async () => {
    const socio = await createTestMember(app);
    await getCelebration(socio.token);
    const ids = await seedLedger(socio.id, [
      { sourceType: "profile_photo", amount: 5 },
      { sourceType: "program_completion", amount: 50 },
    ]);
    await postAck(socio.token, { upToId: ids[1] });

    const viejo = await postAck(socio.token, { upToId: ids[0] });
    const cero = await postAck(socio.token, { upToId: 0 });

    expect(viejo.statusCode).toBe(204);
    expect(cero.statusCode).toBe(204);
    expect(await readMark(socio.id)).toBe(ids[1]);
    expect((await getCelebration(socio.token)).body.movements).toEqual([]);
  });

  it("un id inventado más allá del último movimiento propio se recorta y no silencia lo que llegue después", async () => {
    const socio = await createTestMember(app);
    await getCelebration(socio.token);
    const ids = await seedLedger(socio.id, [
      { sourceType: "profile_photo", amount: 5 },
    ]);

    const ack = await postAck(socio.token, { upToId: 2_000_000_000 });
    expect(ack.statusCode).toBe(204);
    expect(await readMark(socio.id)).toBe(ids[0]);

    await seedLedger(socio.id, [
      { sourceType: "program_completion", amount: 50 },
    ]);
    const res = await getCelebration(socio.token);
    expect(res.body.movements.map((m) => m.label)).toEqual([
      "Programa completo",
    ]);
  });

  it("no toca la marca de otra persona (el id sale del token, no del cuerpo)", async () => {
    const socio = await createTestMember(app);
    const otro = await createTestMember(app);
    await getCelebration(socio.token);
    await getCelebration(otro.token);
    const ids = await seedLedger(otro.id, [
      { sourceType: "profile_photo", amount: 5 },
    ]);

    // `userId` en el cuerpo se descarta (additionalProperties) y rige el token.
    const ack = await postAck(socio.token, { upToId: ids[0], userId: otro.id });

    expect(ack.statusCode).toBe(204);
    expect(await readMark(otro.id)).toBe(0);
    expect((await getCelebration(otro.token)).body.movements).toHaveLength(1);
  });

  it("valida el cuerpo: sin upToId, negativo, no entero o fuera de rango dan 400", async () => {
    const socio = await createTestMember(app);

    for (const payload of [
      {},
      { upToId: -1 },
      { upToId: 1.5 },
      { upToId: "abc" },
      { upToId: 2147483648 },
    ]) {
      const res = await postAck(socio.token, payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
  });

  it("sin token responde 401 en las dos rutas", async () => {
    expect((await getCelebration(undefined)).statusCode).toBe(401);
    expect((await postAck(undefined, { upToId: 1 })).statusCode).toBe(401);
  });

  it("el ack de una primera vez (sin consulta previa) crea la marca sin pasarse del ledger", async () => {
    const socio = await createTestMember(app);
    const ids = await seedLedger(socio.id, [
      { sourceType: "profile_photo", amount: 5 },
    ]);

    await postAck(socio.token, { upToId: 999_999_999 });

    expect(await readMark(socio.id)).toBe(ids[0]);
  });
});

describe("celebración y tenancy", () => {
  it("un socio del gimnasio 2 solo ve su propio ledger y su propia marca", async () => {
    const templo = await createTestMember(app);
    const socio = gym2.socios[0];
    await setModuleFlag(app, gym2.tenantId, "templo-gamification", true);
    try {
      await getCelebration(templo.token);
      await getCelebration(socio.token);
      await seedLedger(templo.id, [
        { sourceType: "program_completion", amount: 50 },
      ]);
      await seedLedger(
        socio.id,
        [{ sourceType: "profile_photo", amount: 5 }],
        gym2.tenantId,
      );

      const delSocio = await getCelebration(socio.token);
      const delTemplo = await getCelebration(templo.token);

      expect(delSocio.statusCode).toBe(200);
      expect(delSocio.body.movements.map((m) => m.label)).toEqual([
        "Foto de perfil",
      ]);
      expect(delSocio.body.total).toBe(5);
      expect(delTemplo.body.movements.map((m) => m.label)).toEqual([
        "Programa completo",
      ]);
      expect(await readMark(socio.id, gym2.tenantId)).toBe(0);
    } finally {
      await setModuleFlag(app, gym2.tenantId, "templo-gamification", false);
    }
  });
});
