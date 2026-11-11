// Module: finance — fase 208: grupo de un traslado (patas + ajustes)
//
// Un traslado entre cajas son DOS filas `cash_transfer` (salida en el origen,
// entrada en el destino) vinculadas ida y vuelta por `transaction_links`, más
// un ajuste de conciliación opcional (`adjustment` vinculado a una pata). Un
// retiro NUEVO tiene el mismo molde (ver withdrawal-marker.ts) y además la
// pata de salida está vinculada a los cobros que el retiro se llevó.
//
// `collectTransferGroupIds` descubre el grupo a anular desde CUALQUIERA de las
// dos patas. 208-06 le suma `createTransferPair` (el armado del par).
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
import { tenantWhere, type TenantContext } from "../shared/tenant";
import type { TxHandle } from "./balance-service";
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
    .select({ id: ft.id, direction: ft.direction, responsibleName: ft.responsibleName })
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
    .select({ id: ft.id, direction: ft.direction, responsibleName: ft.responsibleName })
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
