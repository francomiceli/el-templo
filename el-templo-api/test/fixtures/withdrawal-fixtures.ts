/**
 * Fase 208 Plan 05: siembra de retiros en sus DOS formatos, tal cual los deja
 * el sistema (ver el contrato en `src/modules/finance/withdrawal-marker.ts`).
 *
 * - `seedLegacyWithdrawal`: formato VIEJO (los 48 de prod): una fila `expense`
 *   saliente con centro "Retiros" y responsable; links expense -> cobros y
 *   ajuste por conteo -> expense.
 * - `seedTransferWithdrawal`: formato NUEVO: par `cash_transfer` (salida en la
 *   caja de origen = el retiro, entrada en el destino), ambas con el mismo
 *   responsable; links salida <-> entrada, salida -> cobros y ajuste -> salida.
 *   El ajuste se inserta ANTES que las patas (id menor), igual que el alta.
 *
 * El formato nuevo lo produce `WithdrawalService.registerWithdrawal` desde
 * 208-06: si ese alta cambia, este fixture y el test de 208-06 que lo compara
 * tienen que cambiar juntos.
 */
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";

export interface SeededPayment {
  id: number;
  amount: number;
}

export interface SeedWithdrawalOpts {
  /** Caja de origen (la de la sede). */
  cashRegisterId: number;
  /** Sede de la caja de origen (NULL si no tiene). */
  branchId: number | null;
  amount: number;
  responsibleName: string;
  recordedBy: number;
  /** YYYY-MM-DD. */
  transactionDate: string;
  notes?: string | null;
  currency?: string;
  /** Cobros que el retiro se llevó (link retiro -> cobro, monto del cobro). */
  payments?: SeededPayment[];
  /** Ajuste por conteo (faltante = outflow, sobrante = inflow). */
  adjustment?: { direction: "inflow" | "outflow"; amount: number };
}

export interface SeedTransferWithdrawalOpts extends SeedWithdrawalOpts {
  /** Caja destino (Central o Tesoro). */
  destinationCashRegisterId: number;
}

export interface SeededLegacyWithdrawal {
  /** id del expense = id del retiro. */
  withdrawalId: number;
  adjustmentId: number | null;
}

export interface SeededTransferWithdrawal {
  /** id de la pata de salida = id del retiro. */
  withdrawalId: number;
  /** id de la pata de entrada (nunca es un retiro por sí misma). */
  inflowId: number;
  adjustmentId: number | null;
}

/** Centro de costo "Retiros" del tenant (AR); si no existe lo crea. */
async function ensureRetirosCostCenter(
  app: FastifyInstance,
  ctx: TenantContext,
): Promise<number> {
  const [existing] = await app.db
    .select({ id: schema.costCenters.id })
    .from(schema.costCenters)
    .where(
      and(
        tenantWhere(schema.costCenters, ctx),
        eq(schema.costCenters.name, "Retiros"),
        eq(schema.costCenters.country, "AR"),
      ),
    )
    .limit(1);
  if (existing) return existing.id;
  const [ins] = await app.db
    .insert(schema.costCenters)
    .values(
      tenantValues(ctx, { name: "Retiros", country: "AR", isActive: true }),
    )
    .$returningId();
  return ins.id;
}

async function insertAdjustment(
  app: FastifyInstance,
  ctx: TenantContext,
  opts: SeedWithdrawalOpts,
): Promise<number | null> {
  if (!opts.adjustment) return null;
  const [res] = await app.db
    .insert(schema.financialTransactions)
    .values(
      tenantValues(ctx, {
        memberId: null,
        kind: "adjustment" as const,
        direction: opts.adjustment.direction,
        amount: opts.adjustment.amount,
        currency: opts.currency ?? "ARS",
        paymentMethod: "internal" as const,
        transactionDate: opts.transactionDate,
        effectiveDate: opts.transactionDate,
        branchId: opts.branchId,
        cashRegisterId: opts.cashRegisterId,
        recordedBy: opts.recordedBy,
        notes: `Ajuste por conteo de retiro (${opts.adjustment.direction})`,
      }),
    )
    .$returningId();
  return res.id;
}

async function linkPayments(
  app: FastifyInstance,
  ctx: TenantContext,
  withdrawalId: number,
  payments: SeededPayment[],
): Promise<void> {
  for (const p of payments) {
    await app.db.insert(schema.transactionLinks).values(
      tenantValues(ctx, {
        transactionId: withdrawalId,
        targetKind: "transaction" as const,
        targetId: p.id,
        allocatedAmount: p.amount,
      }),
    );
  }
}

/** Retiro en formato VIEJO: un expense con centro "Retiros" y responsable. */
export async function seedLegacyWithdrawal(
  app: FastifyInstance,
  ctx: TenantContext,
  opts: SeedWithdrawalOpts,
): Promise<SeededLegacyWithdrawal> {
  const costCenterId = await ensureRetirosCostCenter(app, ctx);
  const adjustmentId = await insertAdjustment(app, ctx, opts);
  const [res] = await app.db
    .insert(schema.financialTransactions)
    .values(
      tenantValues(ctx, {
        memberId: null,
        kind: "expense" as const,
        direction: "outflow" as const,
        amount: opts.amount,
        currency: opts.currency ?? "ARS",
        paymentMethod: "internal" as const,
        transactionDate: opts.transactionDate,
        effectiveDate: opts.transactionDate,
        branchId: opts.branchId,
        cashRegisterId: opts.cashRegisterId,
        costCenterId,
        recordedBy: opts.recordedBy,
        responsibleName: opts.responsibleName,
        notes: opts.notes ?? null,
      }),
    )
    .$returningId();
  if (adjustmentId !== null) {
    await app.db.insert(schema.transactionLinks).values(
      tenantValues(ctx, {
        transactionId: adjustmentId,
        targetKind: "transaction" as const,
        targetId: res.id,
        allocatedAmount: 0,
      }),
    );
  }
  await linkPayments(app, ctx, res.id, opts.payments ?? []);
  return { withdrawalId: res.id, adjustmentId };
}

/** Retiro en formato NUEVO: par de traslado con responsable (ver docblock). */
export async function seedTransferWithdrawal(
  app: FastifyInstance,
  ctx: TenantContext,
  opts: SeedTransferWithdrawalOpts,
): Promise<SeededTransferWithdrawal> {
  const adjustmentId = await insertAdjustment(app, ctx, opts);
  const currency = opts.currency ?? "ARS";
  const common = {
    memberId: null,
    kind: "cash_transfer" as const,
    amount: opts.amount,
    currency,
    paymentMethod: "internal" as const,
    transactionDate: opts.transactionDate,
    effectiveDate: opts.transactionDate,
    recordedBy: opts.recordedBy,
    responsibleName: opts.responsibleName,
    notes: opts.notes ?? null,
  };
  const [out] = await app.db
    .insert(schema.financialTransactions)
    .values(
      tenantValues(ctx, {
        ...common,
        direction: "outflow" as const,
        branchId: opts.branchId,
        cashRegisterId: opts.cashRegisterId,
      }),
    )
    .$returningId();
  const [inn] = await app.db
    .insert(schema.financialTransactions)
    .values(
      tenantValues(ctx, {
        ...common,
        direction: "inflow" as const,
        branchId: null,
        cashRegisterId: opts.destinationCashRegisterId,
      }),
    )
    .$returningId();
  await app.db.insert(schema.transactionLinks).values([
    tenantValues(ctx, {
      transactionId: out.id,
      targetKind: "transaction" as const,
      targetId: inn.id,
      allocatedAmount: 0,
    }),
    tenantValues(ctx, {
      transactionId: inn.id,
      targetKind: "transaction" as const,
      targetId: out.id,
      allocatedAmount: 0,
    }),
  ]);
  if (adjustmentId !== null) {
    await app.db.insert(schema.transactionLinks).values(
      tenantValues(ctx, {
        transactionId: adjustmentId,
        targetKind: "transaction" as const,
        targetId: out.id,
        allocatedAmount: 0,
      }),
    );
  }
  await linkPayments(app, ctx, out.id, opts.payments ?? []);
  return { withdrawalId: out.id, inflowId: inn.id, adjustmentId };
}
