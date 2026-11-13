// Module: finance — fase 208: grupo de un traslado (patas + ajustes)
//
// Un traslado entre cajas son DOS filas `cash_transfer` (salida en el origen,
// entrada en el destino) vinculadas ida y vuelta por `transaction_links`, más
// un ajuste de conciliación opcional (`adjustment` vinculado a una pata). Un
// retiro NUEVO tiene el mismo molde (ver withdrawal-marker.ts) y además la
// pata de salida está vinculada a los cobros que el retiro se llevó.
//
// `collectTransferGroupIds` descubre el grupo a anular desde CUALQUIERA de las
// dos patas. `createTransferPair` (208-06) es el ÚNICO lugar donde se arma el
// par: lo usan el traslado común (`MovementService.registerMovement`) y el
// retiro con destino (`WithdrawalService.registerWithdrawal`).
//
// TRAMPA que este helper cierra: la anulación vieja caminaba TODOS los links de
// la fila (como origen y como destino) sin mirar el kind. En un retiro nuevo la
// salida está vinculada a sus cobros: anular el retiro habría anulado los
// cobros. Acá la recolección es filtrada por kind: la hermana es SOLO una fila
// `cash_transfer` y los ajustes SOLO filas `adjustment`. Nunca devuelve
// cobros ni ningún otro kind, aunque estén vinculados.
//
// No importa services (los services lo importan a él).

import { and, eq, inArray, isNull } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BadRequestError, NotFoundError } from "../shared/errors";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import type { TxHandle } from "./balance-service";
import type { TransactionService } from "./transaction-service";
import { withdrawalFormatOf } from "./withdrawal-marker";

type DbInstance = MySql2Database<typeof schema>;

export interface TransferGroup {
  outflowId: number;
  inflowId: number;
  /** Ajustes de conciliación NO anulados vinculados a alguna de las patas. */
  adjustmentIds: number[];
  /** true si la pata de salida es un retiro nuevo (traslado con responsable). */
  isWithdrawal: boolean;
}

/**
 * Grupo de un traslado a partir de cualquiera de sus dos patas.
 *
 * @throws NotFoundError si la fila no existe en el gimnasio.
 * @throws BadRequestError si la fila no es un `cash_transfer`.
 * @throws Error si el par está corrupto (no hay exactamente una hermana
 *         `cash_transfer`, o las dos patas tienen la misma dirección).
 */
export async function collectTransferGroupIds(
  ctx: TenantContext,
  db: TxHandle | DbInstance,
  rowId: number,
  log?: FastifyBaseLogger,
): Promise<TransferGroup> {
  const ft = schema.financialTransactions;
  const tl = schema.transactionLinks;

  const [row] = await db
    .select({
      id: ft.id,
      kind: ft.kind,
      direction: ft.direction,
      responsibleName: ft.responsibleName,
    })
    .from(ft)
    .where(and(tenantWhere(ft, ctx), eq(ft.id, rowId)))
    .limit(1);
  if (!row) throw new NotFoundError("Transaccion no encontrada");
  if (row.kind !== "cash_transfer") {
    throw new BadRequestError("No es un traslado");
  }

  // Hermana: la otra fila `cash_transfer` vinculada, en cualquier sentido.
  const asSource = await db
    .select({
      id: ft.id,
      direction: ft.direction,
      responsibleName: ft.responsibleName,
    })
    .from(tl)
    .innerJoin(ft, and(tenantWhere(ft, ctx), eq(ft.id, tl.targetId)))
    .where(
      and(
        tenantWhere(tl, ctx),
        eq(tl.transactionId, rowId),
        eq(tl.targetKind, "transaction"),
        eq(ft.kind, "cash_transfer"),
      ),
    );
  const asTarget = await db
    .select({
      id: ft.id,
      direction: ft.direction,
      responsibleName: ft.responsibleName,
    })
    .from(tl)
    .innerJoin(ft, and(tenantWhere(ft, ctx), eq(ft.id, tl.transactionId)))
    .where(
      and(
        tenantWhere(tl, ctx),
        eq(tl.targetId, rowId),
        eq(tl.targetKind, "transaction"),
        eq(ft.kind, "cash_transfer"),
      ),
    );
  const siblings = new Map<
    number,
    { direction: "inflow" | "outflow"; responsibleName: string | null }
  >();
  for (const s of [...asSource, ...asTarget]) {
    if (s.id !== rowId) {
      siblings.set(s.id, {
        direction: s.direction,
        responsibleName: s.responsibleName,
      });
    }
  }
  if (siblings.size !== 1) {
    log?.error(
      { rowId, siblingIds: [...siblings.keys()] },
      "Traslado con pata hermana inconsistente",
    );
    throw new Error(
      `Traslado #${rowId} corrupto: se esperaba una pata hermana y hay ${siblings.size}`,
    );
  }
  const [[siblingId, sibling]] = [...siblings.entries()];
  if (sibling.direction === row.direction) {
    log?.error(
      { rowId, siblingId, direction: row.direction },
      "Traslado con patas de la misma direccion",
    );
    throw new Error(
      `Traslado #${rowId} corrupto: las dos patas son ${row.direction}`,
    );
  }
  const outflow =
    row.direction === "outflow"
      ? { id: row.id, responsibleName: row.responsibleName }
      : { id: siblingId, responsibleName: sibling.responsibleName };
  const inflowId = row.direction === "outflow" ? siblingId : row.id;

  // Ajustes: filas `adjustment` vivas vinculadas a cualquiera de las patas.
  const adjustments = await db
    .select({ id: ft.id })
    .from(tl)
    .innerJoin(ft, and(tenantWhere(ft, ctx), eq(ft.id, tl.transactionId)))
    .where(
      and(
        tenantWhere(tl, ctx),
        eq(tl.targetKind, "transaction"),
        inArray(tl.targetId, [outflow.id, inflowId]),
        eq(ft.kind, "adjustment"),
        isNull(ft.voidedAt),
      ),
    );
  const adjustmentIds = [...new Set(adjustments.map((a) => a.id))].sort(
    (a, b) => a - b,
  );

  return {
    outflowId: outflow.id,
    inflowId,
    adjustmentIds,
    isWithdrawal:
      withdrawalFormatOf({
        kind: "cash_transfer",
        direction: "outflow",
        responsibleName: outflow.responsibleName,
      }) === "transfer",
  };
}

export interface TransferPairCaja {
  id: number;
  currency: string;
  /** Sede de la caja (NULL para Central, Tesoro o banco). */
  branchId: number | null;
}

export interface CreateTransferPairInput {
  origen: TransferPairCaja;
  destino: TransferPairCaja;
  amount: number;
  /** YYYY-MM-DD: fecha de la transacción y fecha efectiva de las dos patas. */
  transactionDate: string;
  notes: string | null;
  /**
   * Responsable. Si viene (retiro) se graba en las DOS patas: es lo que hace
   * que el marcador vea la salida como retiro y que la entrada se lea sola
   * ("Retiro desde ..."). El traslado común no lo manda.
   */
  responsibleName?: string | null;
  /**
   * Clave de idempotencia opcional, SOLO en la pata de salida (la entrada
   * nunca la lleva: el UNIQUE es global). Todavía sin uso: deja trivial el
   * merge de la rama T0 (`fix/traslados-idempotencia`).
   */
  idempotencyKey?: string | null;
}

/**
 * Arma el par de un traslado entre cajas: pata de SALIDA en el origen, pata de
 * ENTRADA en el destino (`kind 'cash_transfer'`, `payment_method 'internal'`,
 * mismo monto, fecha y notas) y los dos links ida y vuelta con
 * `allocated_amount` 0. El orden de inserts es salida, entrada, links, y es
 * parte del contrato (el id de la salida es menor que el de la entrada).
 *
 * Corre dentro de la transacción del caller (`tx`): este helper no abre la
 * suya. Los callers validan con mensajes de usuario (moneda, misma caja,
 * activa, etc.) ANTES; los guards de acá son de programación.
 *
 * Contrato del formato (traslado común y retiro nuevo): ver el docblock de
 * `withdrawal-marker.ts`. Lo propio del retiro (ajuste por conteo, links a los
 * cobros, arqueo) lo agrega el caller sobre el `outflowId` que devuelve.
 */
export async function createTransferPair(
  ctx: TenantContext,
  tx: TxHandle,
  txnService: TransactionService,
  input: CreateTransferPairInput,
  adminId: number,
): Promise<{ outflowId: number; inflowId: number }> {
  const { origen, destino, amount, transactionDate, notes } = input;
  if (origen.id === destino.id) {
    throw new Error("createTransferPair: origen y destino son la misma caja");
  }
  if (origen.currency !== destino.currency) {
    throw new Error(
      `createTransferPair: monedas distintas (${origen.currency} -> ${destino.currency})`,
    );
  }
  const responsibleName = input.responsibleName ?? null;

  // Pata A: salida en el origen. `cashRegisterId` explícito (no se resuelve por
  // medio de pago) y `branchId` = sede de la caja.
  const outflow = await txnService.create(
    ctx,
    {
      memberId: null,
      kind: "cash_transfer",
      direction: "outflow",
      amount,
      currency: origen.currency,
      paymentMethod: "internal",
      transactionDate,
      effectiveDate: transactionDate,
      branchId: origen.branchId,
      cashRegisterId: origen.id,
      notes,
      responsibleName,
      idempotencyKey: input.idempotencyKey ?? null,
      links: [],
    },
    adminId,
    tx,
  );

  // Pata B: entrada en el destino (sin idempotencyKey).
  const inflow = await txnService.create(
    ctx,
    {
      memberId: null,
      kind: "cash_transfer",
      direction: "inflow",
      amount,
      currency: destino.currency,
      paymentMethod: "internal",
      transactionDate,
      effectiveDate: transactionDate,
      branchId: destino.branchId,
      cashRegisterId: destino.id,
      notes,
      responsibleName,
      links: [],
    },
    adminId,
    tx,
  );

  // Links ida y vuelta (`allocated_amount` 0: vínculo de procedencia, no una
  // asignación de plata). La anulación los camina para hallar la pata hermana.
  await tx.insert(schema.transactionLinks).values([
    // `as const` SOLO acá: dentro de un array literal el elemento pierde el
    // tipo contextual de `.values()` y el enum de Drizzle deja de compilar.
    tenantValues(ctx, {
      transactionId: outflow.id,
      targetKind: "transaction" as const,
      targetId: inflow.id,
      allocatedAmount: 0,
    }),
    tenantValues(ctx, {
      transactionId: inflow.id,
      targetKind: "transaction" as const,
      targetId: outflow.id,
      allocatedAmount: 0,
    }),
  ]);

  return { outflowId: outflow.id, inflowId: inflow.id };
}
