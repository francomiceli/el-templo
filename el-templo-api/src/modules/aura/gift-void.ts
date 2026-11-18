// Module: aura — anulación de regalos (fase 215, plan 09)
//
// Dos caminos para anular un regalo vigente:
//   - `voidGift`: el staff lo anula desde el admin (D-20), o lo anula el
//     deshacer de una asistencia (D-08).
//   - `voidGiftsForAttendance`: anula todos los regalos vigentes que una
//     asistencia dio o recibió. Lo llama `removeCheckIn` ANTES de borrar la fila.
//
// Reglas:
// - D-20: el receptor pierde exactamente lo que recibió (`amount` de la fila,
//   que guarda el valor al momento de dar). La reversa es una fila negativa
//   propia del ledger (`aura_gift_void`, id del regalo), nunca un `spend`: el
//   `spend` lanza por saldo insuficiente y escribe sin referencia.
// - SC-8: el regalo y su reversa nacen en la misma transacción, así la Aura
//   ganada de cada persona sigue igual a la suma de su ledger.
// - Sin doble descuento: el cambio de estado es un CAS
//   (`UPDATE ... WHERE id = ? AND status = 'vigente'`); si no encuentra la fila
//   porque otra anulación ganó, responde `REGALO_YA_ANULADO`. Respaldo: el UNIQUE
//   del ledger sobre `(user, source, reference_type, reference_id)`.
// - Un regalo anulado NO devuelve el cupo de quien lo dio: la fila sigue
//   ocupando su UNIQUE de `aura_gifts` y nunca se borra.
// - Sin push al anular (decisión autónoma del plan 09).
// - admin_sede fuera de sus sedes recibe `REGALO_NO_ENCONTRADO` (no se revela
//   que el regalo existe).
// - Al deshacer una asistencia, un error real corta el deshacer entero: solo se
//   ignora `REGALO_YA_ANULADO` (carrera con otra anulación).
//
// Todas las lecturas y escrituras llevan `tenantWhere` literal.

import { and, eq, or, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { readAffectedRows } from "../shared/affected-rows";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { GiftError } from "./gift-errors";
import { GIFT_REFERENCE } from "./gift-rules";
import { AuraService, type AuraTx } from "./service";

type DbInstance = MySql2Database<typeof schema>;

export type GiftVoidCause = "staff" | "asistencia";

export interface VoidGiftInput {
  giftId: number;
  /** Quien anula; null si el camino no conoce al actor. */
  voidedBy: number | null;
  cause: GiftVoidCause;
  /**
   * Sedes que puede tocar quien anula. `null` = sin restricción; un arreglo
   * (aunque vacío) acota por sede.
   */
  allowedBranchIds: readonly number[] | null;
  log?: FastifyBaseLogger;
}

export interface VoidGiftResult {
  receiverUserId: number;
  amount: number;
}

/**
 * Anula un regalo vigente y le descuenta al receptor exactamente lo que recibió.
 *
 * @throws GiftError `REGALO_NO_ENCONTRADO` si no existe, es de otro gimnasio o
 *   está fuera de las sedes permitidas; `REGALO_YA_ANULADO` si ya estaba anulado.
 */
export async function voidGift(
  db: DbInstance,
  ctx: TenantContext,
  input: VoidGiftInput,
  outerTx?: AuraTx,
): Promise<VoidGiftResult> {
  const { giftId, voidedBy, cause, allowedBranchIds, log } = input;
  const aura = new AuraService(db);

  // ME-03: si quien llama ya abrió una transacción (deshacer asistencia), la
  // anulación corre adentro y se confirma o se revierte junto con el borrado.
  const run = async <T>(work: (tx: AuraTx) => Promise<T>): Promise<T> =>
    outerTx ? work(outerTx) : db.transaction(work);

  const result = await run(async (tx) => {
    const [gift] = await tx
      .select({
        id: schema.auraGifts.id,
        receiverUserId: schema.auraGifts.receiverUserId,
        amount: schema.auraGifts.amount,
        branchId: schema.auraGifts.branchId,
      })
      .from(schema.auraGifts)
      .where(
        and(
          tenantWhere(schema.auraGifts, ctx),
          eq(schema.auraGifts.id, giftId),
        ),
      );

    if (
      !gift ||
      (allowedBranchIds !== null && !allowedBranchIds.includes(gift.branchId))
    ) {
      throw new GiftError("REGALO_NO_ENCONTRADO");
    }

    // CAS: solo gana quien encuentra la fila todavía vigente.
    const updated = await tx
      .update(schema.auraGifts)
      .set({
        status: "anulado",
        voidedByUserId: voidedBy,
        voidedAt: sql`NOW()`,
        voidCause: cause,
      })
      .where(
        and(
          tenantWhere(schema.auraGifts, ctx),
          eq(schema.auraGifts.id, giftId),
          eq(schema.auraGifts.status, "vigente"),
        ),
      );

    if (readAffectedRows(updated) === 0) {
      throw new GiftError("REGALO_YA_ANULADO");
    }

    await aura.awardInTransaction(tx, ctx, {
      userId: gift.receiverUserId,
      sourceType: "social",
      referenceType: GIFT_REFERENCE.void,
      referenceId: giftId,
      amount: -gift.amount,
      description: `Regalo anulado #${giftId}`,
    });

    return { receiverUserId: gift.receiverUserId, amount: gift.amount };
  });

  log?.info(
    { giftId, cause, voidedBy, amount: result.amount },
    "Regalo de Aura anulado",
  );

  return result;
}

/**
 * Anula los regalos vigentes que una asistencia dio o recibió (D-08). Se llama
 * antes de borrar la fila de `attendance`; si una anulación falla con algo que
 * no sea "ya anulado", el error sube y el deshacer no se hace.
 *
 * Con `outerTx` (ME-03) todo corre en la transacción de quien llama: así las
 * anulaciones y el borrado de la asistencia se confirman o se revierten juntos.
 *
 * @returns Cuántos regalos anuló esta llamada.
 */
export async function voidGiftsForAttendance(
  db: DbInstance,
  ctx: TenantContext,
  attendanceId: number,
  voidedBy: number | null,
  log?: FastifyBaseLogger,
  outerTx?: AuraTx,
): Promise<number> {
  const rows = await (outerTx ?? db)
    .select({ id: schema.auraGifts.id })
    .from(schema.auraGifts)
    .where(
      and(
        tenantWhere(schema.auraGifts, ctx),
        eq(schema.auraGifts.status, "vigente"),
        or(
          eq(schema.auraGifts.giverAttendanceId, attendanceId),
          eq(schema.auraGifts.receiverAttendanceId, attendanceId),
        ),
      ),
    );

  let voided = 0;
  for (const row of rows) {
    try {
      await voidGift(
        db,
        ctx,
        {
          giftId: row.id,
          voidedBy,
          cause: "asistencia",
          allowedBranchIds: null,
          log,
        },
        outerTx,
      );
      voided += 1;
    } catch (err: unknown) {
      // Otra anulación se adelantó: el descuento ya está hecho, no es un error.
      if (err instanceof GiftError && err.code === "REGALO_YA_ANULADO") {
        continue;
      }
      throw err;
    }
  }

  if (voided > 0) {
    log?.info(
      { attendanceId, voided },
      "Regalos anulados al deshacer la asistencia",
    );
  }

  return voided;
}
