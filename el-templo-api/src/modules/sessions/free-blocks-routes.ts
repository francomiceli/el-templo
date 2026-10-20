/**
 * Rutas de la canasta de bloques libres (Fase 197 D-14).
 *
 * Se registran dentro de `sessionRoutes` SIN prefix, con el path completo
 * relativo a `/api/sessions`, para heredar el guard de `moduleScope`
 * ("templo-training") y no generar la variante con barra final.
 */
import type { FastifyPluginAsync } from "fastify";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant } from "../shared/tenant";
import { FreeBlocksService } from "./free-blocks-service";
import {
  freeBlockResponse,
  freeBlocksListResponse,
  getFreeBlockSchema,
  getFreeBlocksSchema,
  type GetFreeBlockParams,
  type GetFreeBlockQuery,
  type GetFreeBlocksInput,
} from "./schemas";
import type { SessionGeneratorService } from "./service";

export interface FreeBlocksRoutesOptions {
  sessionService: SessionGeneratorService;
  formatDescriptions: Map<string, string>;
}

export const freeBlocksRoutes: FastifyPluginAsync<
  FreeBlocksRoutesOptions
> = async (fastify, opts) => {
  const service = new FreeBlocksService(
    fastify.db,
    opts.sessionService,
    opts.formatDescriptions,
  );

  // GET /sessions/free-blocks - Canasta paginada, con filtro por grupo
  fastify.get<{ Querystring: GetFreeBlocksInput }>(
    "/free-blocks",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...getFreeBlocksSchema,
        response: freeBlocksListResponse,
      },
    },
    async (request, reply) => {
      const { userId } = request.user;
      const { group, page, limit, level } = request.query;

      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "sessions.free-blocks");

      const resolved = await service.resolveMember(ctx, userId, level);
      if (resolved.kind === "deny") {
        return reply.status(resolved.status).send({ error: resolved.message });
      }

      return service.list(ctx, resolved.member, {
        group: group ?? null,
        page: page ?? 1,
        limit: limit ?? 20,
      });
    },
  );

  // GET /sessions/free-blocks/:blockId - Un bloque suelto para abrir el player
  fastify.get<{
    Params: GetFreeBlockParams;
    Querystring: GetFreeBlockQuery;
  }>(
    "/free-blocks/:blockId",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...getFreeBlockSchema,
        response: freeBlockResponse,
      },
    },
    async (request, reply) => {
      const { userId } = request.user;
      const { blockId } = request.params;
      const { level } = request.query;

      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "sessions.free-blocks");

      const resolved = await service.resolveMember(ctx, userId, level);
      if (resolved.kind === "deny") {
        return reply.status(resolved.status).send({ error: resolved.message });
      }

      const item = await service.getOne(ctx, resolved.member, blockId);
      if (!item) {
        return reply.status(404).send({ error: "Bloque no disponible" });
      }

      const auraAvailableToday = await service.isAuraAvailableToday(
        ctx,
        resolved.member,
      );
      return { item, auraAvailableToday };
    },
  );
};
