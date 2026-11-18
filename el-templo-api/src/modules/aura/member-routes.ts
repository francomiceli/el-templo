// Module: aura — member-routes (fase 214, plan 18, D-13)
//
// Detalle PRIVADO de la Aura propia: de dónde sumó sus puntos el usuario
// autenticado, de a 20 movimientos con "ver más". Staff y alumnos lo reciben por
// igual (D-15 revocada, sin condición por rol).
//
// Privacidad (D-37): la ruta NO acepta ningún id de usuario. El `userId` sale
// SIEMPRE del token, así que es imposible leer el detalle de otra persona.
//
// Coherencia (D-38): la lista usa la MISMA condición que la Aura ganada
// (`earnedRowsFilter()`), así que la suma de todos los movimientos es el número
// que ve la persona. Por eso los canjes no aparecen, las filas de monto 0 se
// descartan y las reversas salen en negativo.
//
// Regalos (fase 215, D-13, D-19): las filas `social` con `aura_gift` se leen con
// quien dio y el motivo. Si quien dio hoy esta oculto o no tiene nombre, el texto
// solo dice cuantos puntos y por que (ME-01, #38). Los datos salen de UNA consulta por página (no una por
// fila) y solo de los regalos recibidos por el propio usuario. Quien da no ve
// nada nuevo (D-09): el regalo solo mueve el ledger del que recibe.
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { and, desc, eq, inArray, lt, ne, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import { attachCountryScope } from "../shared/country-scope";
import { handleServiceError } from "../shared/error-handler";
import {
  assertTenant,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import { hiddenCommunityUserIds } from "../scheduling/community-service";
import { GIFT_REFERENCE, type GiftLabelInput } from "./gift-rules";
import { earnedAuraForUser, earnedRowsFilter } from "./earned";
import { auraMovementLabel } from "./movement-labels";
import { auraMovementsSchema, type AuraMovementsQuery } from "./member-schemas";

const DEFAULT_LIMIT = 20;

type Db = FastifyInstance["db"];

/**
 * Datos para redactar los regalos recibidos de una página, por id de regalo.
 * Una sola consulta con el dador unido; vacía si la página no trae regalos.
 * Del dador solo salen el nombre de pila y la inicial del apellido (el del
 * profe no se usa: la frase lleva solo su nombre).
 */
async function giftLabelInputs(
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
    });
  }
  return result;
}

export const auraMemberRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (reply.sent) return;
    await attachCountryScope(request, fastify.db);
  });

  // GET /movements — keyset por `id` descendente: `before` es el `nextBefore`
  // de la página anterior.
  fastify.get<{ Querystring: AuraMovementsQuery }>(
    "/movements",
    { schema: auraMovementsSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "aura.member.movements");
        const userId = request.user.userId;
        const limit = request.query.limit ?? DEFAULT_LIMIT;
        const before = request.query.before;

        const rows = await fastify.db
          .select({
            id: schema.auraTransactions.id,
            amount: schema.auraTransactions.amount,
            sourceType: schema.auraTransactions.sourceType,
            referenceType: schema.auraTransactions.referenceType,
            referenceId: schema.auraTransactions.referenceId,
            createdAt: schema.auraTransactions.createdAt,
          })
          .from(schema.auraTransactions)
          .where(
            and(
              tenantWhere(schema.auraTransactions, ctx),
              eq(schema.auraTransactions.userId, userId),
              ne(schema.auraTransactions.amount, 0),
              earnedRowsFilter(),
              before !== undefined
                ? lt(schema.auraTransactions.id, before)
                : undefined,
            ),
          )
          .orderBy(desc(schema.auraTransactions.id))
          .limit(limit + 1);

        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const earned = await earnedAuraForUser(fastify.db, ctx, userId);
        const giftIds = page.flatMap((row) =>
          row.sourceType === "social" &&
          row.referenceType === GIFT_REFERENCE.gift &&
          row.referenceId !== null
            ? [row.referenceId]
            : [],
        );
        const gifts = await giftLabelInputs(fastify.db, ctx, userId, giftIds);

        return {
          earned,
          movements: page.map((row) => ({
            id: row.id,
            amount: row.amount,
            label: auraMovementLabel(
              row.sourceType,
              row.referenceType,
              row.referenceId,
              row.referenceId === null
                ? null
                : (gifts.get(row.referenceId) ?? null),
            ),
            createdAt: row.createdAt.toISOString(),
          })),
          nextBefore: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "aura.member.movements");
      }
    },
  );
};

export default auraMemberRoutes;
