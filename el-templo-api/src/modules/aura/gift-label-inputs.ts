// Module: aura — gift-label-inputs (fase 215)
//
// Datos para redactar los regalos RECIBIDOS por un usuario (detalle de Aura y
// celebración de Aura). Es la única consulta que arma el `GiftLabelInput` con la
// regla de anonimato de ME-01 y #38: el nombre de quien dio solo sale si hoy
// no está oculto de las listas y tiene nombre (`isAnonymousGiver`).
import type { FastifyInstance } from "fastify";
import { and, eq, inArray, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { hiddenCommunityUserIds } from "../scheduling/community-service";
import type { GiftLabelInput } from "./gift-rules";

type Db = FastifyInstance["db"];

/**
 * Datos para redactar los regalos recibidos de una página, por id de regalo.
 * Una sola consulta con el dador unido; vacía si la página no trae regalos.
 * Del dador solo salen el nombre de pila y la inicial del apellido (el del
 * profe no se usa: la frase lleva solo su nombre).
 */
export async function giftLabelInputs(
  db: Db,
  ctx: TenantContext,
  userId: number,
  giftIds: readonly number[],
): Promise<Map<number, GiftLabelInput>> {
  const result = new Map<number, GiftLabelInput>();
  if (giftIds.length === 0) return result;

  const rows = await db
    .select({
      id: schema.auraGifts.id,
      giverKind: schema.auraGifts.giverKind,
      reason: schema.auraGifts.reason,
      amount: schema.auraGifts.amount,
      voidCause: schema.auraGifts.voidCause,
      giverUserId: schema.auraGifts.giverUserId,
      giverFirstName: schema.users.firstName,
      giverLastInitial: sql<string | null>`LEFT(${schema.users.lastName}, 1)`,
    })
    .from(schema.auraGifts)
    .innerJoin(
      schema.users,
      and(
        tenantWhere(schema.users, ctx),
        eq(schema.users.id, schema.auraGifts.giverUserId),
      ),
    )
    .where(
      and(
        tenantWhere(schema.auraGifts, ctx),
        eq(schema.auraGifts.receiverUserId, userId),
        inArray(schema.auraGifts.id, [...giftIds]),
      ),
    );

  // ME-01: quien dio y hoy esta oculto no se nombra (una consulta por pagina).
  const hidden = await hiddenCommunityUserIds(
    db,
    ctx,
    rows.filter((row) => row.giverKind === "alumno").map((r) => r.giverUserId),
  );

  for (const row of rows) {
    result.set(row.id, {
      giverKind: row.giverKind,
      giverFirstName: row.giverFirstName,
      giverLastInitial: row.giverKind === "profe" ? null : row.giverLastInitial,
      reason: row.reason,
      amount: row.amount,
      giverHidden: hidden.has(row.giverUserId),
      voidCause: row.voidCause,
    });
  }
  return result;
}
