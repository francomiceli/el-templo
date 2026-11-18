// Module: aura — celebration-service (fase 215, #33)
//
// Celebración chica de Aura al abrir Mi Templo: "qué se sumó desde la última
// vez" sin repetir lo que ya tiene su propia celebración. La marca de lo ya
// celebrado vive en el servidor (`member_profiles.aura_celebrated_until_id`) y no
// en el teléfono, así la celebración sale una sola vez por movimiento aunque el
// alumno use dos teléfonos.
//
// Reglas:
//  - Primera vez (marca NULL): no devuelve nada y fija la marca en el máximo
//    actual, para no celebrar todo el historial.
//  - Cuenta solo movimientos propios con `id` mayor a la marca, monto positivo y
//    que sean Aura ganada (`earnedRowsFilter`).
//  - Excluye las fuentes con celebración propia (asistencia, estiramiento y
//    bloque libre) y los regalos anulados.
//  - Los regalos se redactan con la regla de anonimato de ME-01 y #38 (la misma
//    consulta del detalle de Aura, `giftLabelInputs`): sin nombre no se nombra a
//    nadie ni se dice "Alguien".
//  - La marca nunca retrocede y `ack` no la pasa del último movimiento propio.
import type { FastifyInstance } from "fastify";
import {
  and,
  desc,
  eq,
  gt,
  isNull,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import * as schema from "../../db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import { earnedAuraForUser, earnedRowsFilter } from "./earned";
import { giftLabelInputs } from "./gift-label-inputs";
import {
  GIFT_REFERENCE,
  giftGiverDisplay,
  giftReasonLabel,
  type GiftGiverDisplay,
} from "./gift-rules";
import { auraMovementLabel } from "./movement-labels";
import type { AuraSourceType } from "./types";

type Db = FastifyInstance["db"];

/** Tope de movimientos que devuelve una consulta (los más nuevos primero). */
export const CELEBRATION_LIMIT = 20;

/** Fuentes que ya tienen su propia celebración y no se repiten acá. */
export const CELEBRATION_EXCLUDED_SOURCES: readonly AuraSourceType[] = [
  "attendance",
  "stretch",
  "extra_block",
];

export interface CelebrationGift extends GiftGiverDisplay {
  /** Motivo ya con su texto ("Buena energía"). */
  reason: string;
}

export interface CelebrationMovement {
  id: number;
  amount: number;
  /** El mismo texto del detalle de Aura (`movement-labels.ts`). */
  label: string;
  /** Solo si el movimiento es un regalo recibido y se lo encuentra. */
  gift: CelebrationGift | null;
}

export interface CelebrationResult {
  /** Los más nuevos primero, hasta `CELEBRATION_LIMIT`. */
  movements: CelebrationMovement[];
  /** Cuántos movimientos hay para celebrar en total (puede pasar el tope de la lista). */
  count: number;
  /** Suma de sus montos: es el "Sumaste N de Aura". */
  sum: number;
  /** Aura ganada actual: el número del encabezado. */
  total: number;
  /** Último id del ledger propio al consultar: es el `upToId` del `ack`. */
  maxId: number;
}

function toInt(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** Último id del ledger propio (cualquier movimiento), 0 si no hay. */
async function maxLedgerId(
  db: Db,
  ctx: TenantContext,
  userId: number,
): Promise<number> {
  const rows = await db
    .select({
      maxId: sql<number>`COALESCE(MAX(${schema.auraTransactions.id}), 0)`,
    })
    .from(schema.auraTransactions)
    .where(
      and(
        tenantWhere(schema.auraTransactions, ctx),
        eq(schema.auraTransactions.userId, userId),
      ),
    );
  return toInt(rows[0]?.maxId);
}

/** Marca actual; null si nunca se fijó (o no hay fila de perfil). */
async function readMark(
  db: Db,
  ctx: TenantContext,
  userId: number,
): Promise<number | null> {
  const rows = await db
    .select({ mark: schema.memberProfiles.auraCelebratedUntilId })
    .from(schema.memberProfiles)
    .where(
      and(
        tenantWhere(schema.memberProfiles, ctx),
        eq(schema.memberProfiles.userId, userId),
      ),
    )
    .limit(1);
  return rows[0]?.mark ?? null;
}

/**
 * Celebración pendiente del usuario. Con la marca en NULL fija la marca en el
 * máximo actual y devuelve vacío (no se celebra el historial). Dos llamadas
 * seguidas devuelven lo mismo hasta que llegue el `ack`.
 */
export async function getCelebration(
  db: Db,
  ctx: TenantContext,
  userId: number,
): Promise<CelebrationResult> {
  // Se lee primero el máximo: todo lo que entre después queda para la próxima.
  const maxId = await maxLedgerId(db, ctx, userId);
  const mark = await readMark(db, ctx, userId);

  if (mark === null) {
    // Upsert sin mirar `affectedRows` (mysql2 usa FOUND_ROWS): un socio freemium
    // puede no tener fila de `member_profiles`. Si otra llamada ya fijó la
    // marca, esta no la pisa.
    await db
      .insert(schema.memberProfiles)
      .values(tenantValues(ctx, { userId, auraCelebratedUntilId: maxId }))
      .onDuplicateKeyUpdate({
        set: {
          auraCelebratedUntilId: sql`IF(aura_celebrated_until_id IS NULL, VALUES(aura_celebrated_until_id), aura_celebrated_until_id)`,
        },
      });
    const total = await earnedAuraForUser(db, ctx, userId);
    return { movements: [], count: 0, sum: 0, total, maxId };
  }

  const pending = [
    eq(schema.auraTransactions.userId, userId),
    gt(schema.auraTransactions.id, mark),
    lte(schema.auraTransactions.id, maxId),
    gt(schema.auraTransactions.amount, 0),
    earnedRowsFilter(),
    notInArray(schema.auraTransactions.sourceType, [
      ...CELEBRATION_EXCLUDED_SOURCES,
    ]),
    // Un regalo anulado no se celebra (sin regalo unido, `status` es NULL y pasa).
    or(isNull(schema.auraGifts.status), ne(schema.auraGifts.status, "anulado")),
  ];
  const giftJoin = and(
    tenantWhere(schema.auraGifts, ctx),
    eq(schema.auraGifts.id, schema.auraTransactions.referenceId),
    eq(schema.auraGifts.receiverUserId, userId),
    eq(schema.auraTransactions.referenceType, GIFT_REFERENCE.gift),
  );

  const totals = await db
    .select({
      count: sql<number>`COUNT(*)`,
      sum: sql<number>`COALESCE(SUM(${schema.auraTransactions.amount}), 0)`,
    })
    .from(schema.auraTransactions)
    .leftJoin(schema.auraGifts, giftJoin)
    .where(and(tenantWhere(schema.auraTransactions, ctx), ...pending));
  const count = toInt(totals[0]?.count);

  if (count === 0) {
    const total = await earnedAuraForUser(db, ctx, userId);
    return { movements: [], count: 0, sum: 0, total, maxId };
  }

  const rows = await db
    .select({
      id: schema.auraTransactions.id,
      amount: schema.auraTransactions.amount,
      sourceType: schema.auraTransactions.sourceType,
      referenceType: schema.auraTransactions.referenceType,
      referenceId: schema.auraTransactions.referenceId,
    })
    .from(schema.auraTransactions)
    .leftJoin(schema.auraGifts, giftJoin)
    .where(and(tenantWhere(schema.auraTransactions, ctx), ...pending))
    .orderBy(desc(schema.auraTransactions.id))
    .limit(CELEBRATION_LIMIT);

  const giftIds = rows.flatMap((row) =>
    row.sourceType === "social" &&
    row.referenceType === GIFT_REFERENCE.gift &&
    row.referenceId !== null
      ? [row.referenceId]
      : [],
  );
  const gifts = await giftLabelInputs(db, ctx, userId, giftIds);
  const total = await earnedAuraForUser(db, ctx, userId);

  const movements = rows.map((row): CelebrationMovement => {
    const input =
      row.referenceType === GIFT_REFERENCE.gift && row.referenceId !== null
        ? (gifts.get(row.referenceId) ?? null)
        : null;
    return {
      id: row.id,
      amount: row.amount,
      label: auraMovementLabel(
        row.sourceType,
        row.referenceType,
        row.referenceId,
        input,
      ),
      gift:
        input === null
          ? null
          : {
              ...giftGiverDisplay(input),
              reason: giftReasonLabel(input.reason),
            },
    };
  });

  return {
    movements,
    count,
    sum: toInt(totals[0]?.sum),
    total,
    maxId,
  };
}

/**
 * Mueve la marca hasta `upToId`. Nunca la hace retroceder y no la pasa del
 * último movimiento propio (un id inventado no puede silenciar lo que llegue
 * después). Idempotente.
 */
export async function ackCelebration(
  db: Db,
  ctx: TenantContext,
  userId: number,
  upToId: number,
): Promise<void> {
  const target = Math.min(upToId, await maxLedgerId(db, ctx, userId));
  await db
    .insert(schema.memberProfiles)
    .values(tenantValues(ctx, { userId, auraCelebratedUntilId: target }))
    .onDuplicateKeyUpdate({
      set: {
        auraCelebratedUntilId: sql`GREATEST(COALESCE(aura_celebrated_until_id, 0), VALUES(aura_celebrated_until_id))`,
      },
    });
}
