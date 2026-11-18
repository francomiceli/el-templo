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
import type { FastifyPluginAsync } from "fastify";
import { and, desc, eq, lt, ne } from "drizzle-orm";
import * as schema from "../../db/schema";
import { attachCountryScope } from "../shared/country-scope";
import { handleServiceError } from "../shared/error-handler";
import { assertTenant, tenantWhere } from "../shared/tenant";
import { earnedAuraForUser, earnedRowsFilter } from "./earned";
import { auraMovementLabel } from "./movement-labels";
import { auraMovementsSchema, type AuraMovementsQuery } from "./member-schemas";

const DEFAULT_LIMIT = 20;

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

        return {
          earned,
          movements: page.map((row) => ({
            id: row.id,
            amount: row.amount,
            label: auraMovementLabel(
              row.sourceType,
              row.referenceType,
              row.referenceId,
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
