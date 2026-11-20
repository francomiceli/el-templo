/**
 * Fase 215 (plan 04, SC-8, D-13) — `AuraService.awardInTransaction`.
 *
 * El regalo y su fila del ledger tienen que nacer juntos: la Aura se escribe en
 * la transacción que abre quien llama. Estos tests afirman el estampado del
 * `tenant_id`, el rollback, el duplicado por UNIQUE, la anulación con monto
 * negativo, la conciliación saldo = ledger y que un regalo NO cuenta para el
 * tope de 5 por día (D-13).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { createTestApp, cleanAllTestData, createTestMember } from "../helpers";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { AuraService } from "../../src/modules/aura/service";
import {
  appAuraOnLocalDay,
  attendanceAuraOnLocalDay,
} from "../../src/modules/aura/day-cap";
import { GIFT_REFERENCE } from "../../src/modules/aura/gift-rules";
import { isDuplicateKeyError } from "../../src/modules/shared/sql-errors";
import {
  DEFAULT_TENANT_TIMEZONE,
  todayInTz,
} from "../../src/modules/shared/date-utils";

const CTX: TenantContext = { tenantId: TENANT_TEMPLO };

class RollbackSentinel extends Error {}

let app: FastifyInstance;
let service: AuraService;
let branchId: number;
let hoyLocal: string;
let giftSeq = 0;

beforeAll(async () => {
  app = await createTestApp();
  service = new AuraService(app.db);
  const [branch] = await app.db
    .select({ id: schema.branches.id, tz: schema.branches.timezone })
    .from(schema.branches)
    .where(eq(schema.branches.isVirtual, false))
    .limit(1);
  branchId = branch.id;
  hoyLocal = todayInTz(branch.tz ?? DEFAULT_TENANT_TIMEZONE);
});

beforeEach(async () => {
  await cleanAllTestData(app);
});

afterAll(async () => {
  await cleanAllTestData(app);
  await app.close();
});

/** Referencia de regalo única por prueba (el UNIQUE del ledger es por usuario). */
function nextGiftRef(): number {
  giftSeq += 1;
  return 900000 + giftSeq;
}

async function saldo(userId: number): Promise<number> {
  const [row] = await app.db
    .select({ balance: schema.auraBalances.balance })
    .from(schema.auraBalances)
    .where(
      and(
        tenantWhere(schema.auraBalances, CTX),
        eq(schema.auraBalances.userId, userId),
      ),
    );
  return row?.balance ?? 0;
}

async function ledger(userId: number) {
  return app.db
    .select({
      tenantId: schema.auraTransactions.tenantId,
      amount: schema.auraTransactions.amount,
      sourceType: schema.auraTransactions.sourceType,
      referenceType: schema.auraTransactions.referenceType,
      referenceId: schema.auraTransactions.referenceId,
    })
    .from(schema.auraTransactions)
    .where(
      and(
        tenantWhere(schema.auraTransactions, CTX),
        eq(schema.auraTransactions.userId, userId),
      ),
    );
}

async function sumaLedger(userId: number): Promise<number> {
  const [row] = await app.db
    .select({
      total: sql<string>`COALESCE(SUM(${schema.auraTransactions.amount}), 0)`,
    })
    .from(schema.auraTransactions)
    .where(
      and(
        tenantWhere(schema.auraTransactions, CTX),
        eq(schema.auraTransactions.userId, userId),
      ),
    );
  return Number(row?.total ?? 0);
}

describe("Fase 215-04: awardInTransaction", () => {
  it("escribe la fila con el tenant del contexto y sube el saldo en 1", async () => {
    const member = await createTestMember(app);
    const ref = nextGiftRef();

    const nuevoSaldo = await app.db.transaction((tx) =>
      service.awardInTransaction(tx, CTX, {
        userId: member.id,
        sourceType: "social",
        referenceType: GIFT_REFERENCE.gift,
        referenceId: ref,
        amount: 1,
      }),
    );

    expect(nuevoSaldo).toBe(1);
    expect(await saldo(member.id)).toBe(1);
    const rows = await ledger(member.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenantId: TENANT_TEMPLO,
      amount: 1,
      sourceType: "social",
      referenceType: "aura_gift",
      referenceId: ref,
    });
  });

  it("estampa tenant_id también en la fila nueva de aura_balances", async () => {
    const member = await createTestMember(app);

    await app.db.transaction((tx) =>
      service.awardInTransaction(tx, CTX, {
        userId: member.id,
        sourceType: "social",
        referenceType: GIFT_REFERENCE.gift,
        referenceId: nextGiftRef(),
        amount: 2,
      }),
    );

    const [row] = await app.db
      .select({
        tenantId: schema.auraBalances.tenantId,
        balance: schema.auraBalances.balance,
      })
      .from(schema.auraBalances)
      .where(eq(schema.auraBalances.userId, member.id));
    expect(row).toEqual({ tenantId: TENANT_TEMPLO, balance: 2 });
  });

  it("rollback: si la transacción lanza después, no queda fila ni cambia el saldo", async () => {
    const member = await createTestMember(app);

    await expect(
      app.db.transaction(async (tx) => {
        await service.awardInTransaction(tx, CTX, {
          userId: member.id,
          sourceType: "social",
          referenceType: GIFT_REFERENCE.gift,
          referenceId: nextGiftRef(),
          amount: 1,
        });
        throw new RollbackSentinel("falla a mitad del regalo");
      }),
    ).rejects.toBeInstanceOf(RollbackSentinel);

    expect(await ledger(member.id)).toHaveLength(0);
    expect(await saldo(member.id)).toBe(0);
  });

  it("una segunda acreditación con la misma referencia lanza por duplicado", async () => {
    const member = await createTestMember(app);
    const ref = nextGiftRef();
    const input = {
      userId: member.id,
      sourceType: "social" as const,
      referenceType: GIFT_REFERENCE.gift,
      referenceId: ref,
      amount: 1,
    };

    await app.db.transaction((tx) =>
      service.awardInTransaction(tx, CTX, input),
    );

    let error: unknown = null;
    try {
      await app.db.transaction((tx) =>
        service.awardInTransaction(tx, CTX, input),
      );
    } catch (err: unknown) {
      error = err;
    }

    expect(error).not.toBeNull();
    expect(isDuplicateKeyError(error).isDuplicate).toBe(true);
    // El duplicado no tocó el saldo.
    expect(await saldo(member.id)).toBe(1);
    expect(await ledger(member.id)).toHaveLength(1);
  });

  it("un monto negativo con aura_gift_void baja el saldo y el ledger concilia con aura_balances", async () => {
    const member = await createTestMember(app);
    const ref = nextGiftRef();

    await app.db.transaction(async (tx) => {
      await service.awardInTransaction(tx, CTX, {
        userId: member.id,
        sourceType: "social",
        referenceType: GIFT_REFERENCE.gift,
        referenceId: ref,
        amount: 3,
      });
    });
    expect(await saldo(member.id)).toBe(3);

    const despues = await app.db.transaction((tx) =>
      service.awardInTransaction(tx, CTX, {
        userId: member.id,
        sourceType: "social",
        referenceType: GIFT_REFERENCE.void,
        referenceId: ref,
        amount: -3,
      }),
    );

    expect(despues).toBe(0);
    expect(await saldo(member.id)).toBe(0);
    expect(await sumaLedger(member.id)).toBe(0);
    expect(await sumaLedger(member.id)).toBe(await saldo(member.id));
  });

  it("D-13: un regalo no cuenta para el tope del día (asistencia ni app)", async () => {
    const member = await createTestMember(app);

    // Una asistencia de hoy que pagó 5: lo que el tope ya conoce.
    const [att] = await app.db
      .insert(schema.attendance)
      .values(
        tenantValues(CTX, {
          memberId: member.id,
          branchId,
          sessionDate: hoyLocal,
        }),
      )
      .$returningId();
    await app.db.insert(schema.auraTransactions).values(
      tenantValues(CTX, {
        userId: member.id,
        sourceType: "attendance" as const,
        amount: 5,
        referenceType: "attendance",
        referenceId: att.id,
      }),
    );

    const attendanceAntes = await attendanceAuraOnLocalDay(
      app.db,
      CTX,
      member.id,
      hoyLocal,
    );
    const appAntes = await appAuraOnLocalDay(app.db, CTX, member.id, hoyLocal);
    expect(attendanceAntes).toBe(5);

    // El regalo lleva el mismo reference_id que la asistencia y el del día de
    // la app (YYYYMMDD): ni así puede colarse en el tope.
    await app.db.transaction(async (tx) => {
      await service.awardInTransaction(tx, CTX, {
        userId: member.id,
        sourceType: "social",
        referenceType: GIFT_REFERENCE.gift,
        referenceId: att.id,
        amount: 1,
      });
      await service.awardInTransaction(tx, CTX, {
        userId: member.id,
        sourceType: "social",
        referenceType: GIFT_REFERENCE.gift,
        referenceId: Number(hoyLocal.replace(/-/g, "")),
        amount: 1,
      });
    });

    expect(
      await attendanceAuraOnLocalDay(app.db, CTX, member.id, hoyLocal),
    ).toBe(attendanceAntes);
    expect(await appAuraOnLocalDay(app.db, CTX, member.id, hoyLocal)).toBe(
      appAntes,
    );
    // El regalo sí está en el saldo.
    expect(await saldo(member.id)).toBe(2);
  });

  it("award (sin transacción ajena) sigue funcionando igual", async () => {
    const member = await createTestMember(app);

    const nuevoSaldo = await service.award({
      userId: member.id,
      sourceType: "manual_adjustment",
      amount: 4,
      description: "control 215-04",
    });

    expect(nuevoSaldo).toBe(4);
    expect(await saldo(member.id)).toBe(4);
  });
});
