/**
 * Novedades de Mi Templo — CRUD admin + lectura y eventos del socio.
 *
 * Se registra DENTRO de `communicationsRoutes` (sin prefijo propio), así que
 * hereda `/api/communications` y comparte su criterio: Comunicaciones es CORE
 * para todos los tenants (D-23), sin `moduleScope`.
 *
 * ADMIN (`ADMIN_ROLES` = owner/admin, mismos guards que `/admin/avisos`):
 *   GET/POST /admin/novedades, PUT/DELETE /admin/novedades/:id
 * SOCIO (cualquier usuario autenticado; el `userId` sale SIEMPRE del token,
 * nunca de params/body, igual que `/me/tarjetas`):
 *   GET /me/novedades, POST /me/novedades/:id/event
 *
 * Patrón T-175-03: lookup por PK SIEMPRE con `tenantWhere` en el service — un
 * `id` ajeno da 404, nunca 403.
 */
import { FastifyPluginAsync } from "fastify";
import { NovedadesService } from "./novedades-service";
import { ADMIN_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant } from "../shared/tenant";
import { handleServiceError } from "../shared/error-handler";
import {
  createNovedadSchema,
  updateNovedadSchema,
  novedadIdParamsSchema,
  novedadEventSchema,
  listNovedadesResponseSchema,
  novedadWriteResponseSchema,
  memberNovedadesResponseSchema,
  successResponseSchema,
  type CreateNovedadBody,
  type UpdateNovedadBody,
  type NovedadEventBody,
} from "./schemas";

export const novedadesRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new NovedadesService(fastify.db, fastify.log);

  function isAdmin(role: string): boolean {
    return (ADMIN_ROLES as readonly string[]).includes(role);
  }

  // =========================================================================
  // GET /admin/novedades — listar (incluye pausadas y programadas, con métricas)
  // =========================================================================

  fastify.get<{ Querystring: Record<string, never> }>(
    "/admin/novedades",
    {
      onRequest: [fastify.authenticate],
      schema: { response: listNovedadesResponseSchema },
    },
    async (request, reply) => {
      if (!isAdmin(request.user.role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "novedades.list");

      try {
        const novedades = await service.list(ctx);
        return { novedades };
      } catch (err: unknown) {
        handleServiceError(err, reply, fastify.log, "novedades.list");
      }
    },
  );

  // =========================================================================
  // POST /admin/novedades — crear (`publishAt` opcional, default ahora)
  // =========================================================================

  fastify.post<{ Body: CreateNovedadBody }>(
    "/admin/novedades",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...createNovedadSchema,
        response: novedadWriteResponseSchema,
      },
    },
    async (request, reply) => {
      if (!isAdmin(request.user.role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "novedades.create");

      try {
        const novedad = await service.create(ctx, {
          text: request.body.text,
          scopeBranchIds: request.body.scopeBranchIds ?? null,
          destinationType: request.body.destinationType ?? null,
          destinationSection: request.body.destinationSection ?? null,
          whatsappText: request.body.whatsappText ?? null,
          publishAt: request.body.publishAt
            ? new Date(request.body.publishAt)
            : undefined,
          status: request.body.status,
          sendPush: request.body.sendPush,
          pushTitle: request.body.pushTitle,
          createdBy: request.user.userId,
        });
        reply.code(201);
        return novedad;
      } catch (err: unknown) {
        handleServiceError(err, reply, fastify.log, "novedades.create");
      }
    },
  );

  // =========================================================================
  // PUT /admin/novedades/:id — editar
  // =========================================================================

  fastify.put<{ Params: { id: number }; Body: UpdateNovedadBody }>(
    "/admin/novedades/:id",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...novedadIdParamsSchema,
        ...updateNovedadSchema,
        response: novedadWriteResponseSchema,
      },
    },
    async (request, reply) => {
      if (!isAdmin(request.user.role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "novedades.update");

      try {
        return await service.update(ctx, request.params.id, {
          text: request.body.text,
          scopeBranchIds: request.body.scopeBranchIds,
          destinationType: request.body.destinationType,
          destinationSection: request.body.destinationSection,
          whatsappText: request.body.whatsappText,
          publishAt: request.body.publishAt
            ? new Date(request.body.publishAt)
            : undefined,
          status: request.body.status,
          sendPush: request.body.sendPush,
          pushTitle: request.body.pushTitle,
        });
      } catch (err: unknown) {
        handleServiceError(err, reply, fastify.log, "novedades.update");
      }
    },
  );

  // =========================================================================
  // DELETE /admin/novedades/:id — borrar (las vistas caen en cascada)
  // =========================================================================

  fastify.delete<{ Params: { id: number } }>(
    "/admin/novedades/:id",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...novedadIdParamsSchema,
        response: successResponseSchema,
      },
    },
    async (request, reply) => {
      if (!isAdmin(request.user.role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "novedades.remove");

      try {
        await service.remove(ctx, request.params.id);
        return { success: true };
      } catch (err: unknown) {
        handleServiceError(err, reply, fastify.log, "novedades.remove");
      }
    },
  );

  // =========================================================================
  // GET /me/novedades — hasta 3 novedades visibles para la sede del socio
  // =========================================================================

  fastify.get(
    "/me/novedades",
    {
      onRequest: [fastify.authenticate],
      schema: { response: memberNovedadesResponseSchema },
    },
    async (request, reply) => {
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "novedades.listForMember");

      try {
        const novedades = await service.listForMember(ctx, request.user.userId);
        return { novedades };
      } catch (err: unknown) {
        handleServiceError(err, reply, fastify.log, "novedades.listForMember");
      }
    },
  );

  // =========================================================================
  // POST /me/novedades/:id/event — "la vi" / "la toqué" (idempotente)
  // =========================================================================

  fastify.post<{ Params: { id: number }; Body: NovedadEventBody }>(
    "/me/novedades/:id/event",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...novedadIdParamsSchema,
        ...novedadEventSchema,
        response: successResponseSchema,
      },
    },
    async (request, reply) => {
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "novedades.recordEvent");

      try {
        await service.recordEvent(
          ctx,
          request.user.userId,
          request.params.id,
          request.body.type,
        );
        return { success: true };
      } catch (err: unknown) {
        handleServiceError(err, reply, fastify.log, "novedades.recordEvent");
      }
    },
  );
};
