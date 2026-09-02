/**
 * Communications Admin Routes — CRUD de avisos, métricas ("ver socios") y
 * número de WhatsApp de ventas (Fase 193, D-12..D-20).
 *
 * TODAS admin (`ADMIN_ROLES` = owner/admin, D-30). Comunicaciones es CORE
 * para todos los tenants (D-23) — este plugin NO va envuelto en
 * `moduleScope`, a diferencia de las rutas de avisos de TV (plan 07, gateadas
 * por `templo-training`).
 *
 * Patrón T-175-03 (igual que `notifications/routes.ts`): lookup por PK
 * SIEMPRE con `tenantWhere` — un `id` ajeno da 404, nunca 403.
 */
import { FastifyPluginAsync } from "fastify";
import { CommunicationsService } from "./service";
import { ADMIN_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant } from "../shared/tenant";
import { handleServiceError } from "../shared/error-handler";
import { validateDestination } from "./destinations";
import {
  listAvisosQuerySchema,
  createAvisoSchema,
  updateAvisoSchema,
  avisoIdParamsSchema,
  clickersQuerySchema,
  updateSalesNumberSchema,
  listAvisosResponseSchema,
  avisoWriteResponseSchema,
  clickersResponseSchema,
  salesNumberResponseSchema,
  successResponseSchema,
  type CreateAvisoBody,
  type UpdateAvisoBody,
  type UpdateSalesNumberBody,
} from "./schemas";

export const communicationsRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new CommunicationsService(fastify.db, fastify.log);

  /** D-30: gate compartido por las 7 rutas — solo owner/admin. */
  function isAdmin(role: string): boolean {
    return (ADMIN_ROLES as readonly string[]).includes(role);
  }

  // =========================================================================
  // GET /admin/avisos — listar (D-17: con métricas de socios únicos)
  // =========================================================================

  fastify.get<{ Querystring: { placement?: "popup" | "tarjeta" } }>(
    "/admin/avisos",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...listAvisosQuerySchema,
        response: listAvisosResponseSchema,
      },
    },
    async (request, reply) => {
      if (!isAdmin(request.user.role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "communications.listAvisos");

      try {
        const avisos = await service.listAvisos(
          ctx,
          request.query.placement,
        );
        return { avisos };
      } catch (err: unknown) {
        handleServiceError(err, reply, fastify.log, "communications.listAvisos");
      }
    },
  );

  // =========================================================================
  // POST /admin/avisos — crear (D-12..D-15, siempre kind: 'custom')
  // =========================================================================

  fastify.post<{ Body: CreateAvisoBody }>(
    "/admin/avisos",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...createAvisoSchema,
        response: avisoWriteResponseSchema,
      },
    },
    async (request, reply) => {
      if (!isAdmin(request.user.role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      // T-193-11: el JSON Schema valida FORMA (enum, maxLength); acá se
      // valida CONTENIDO contra la lista curada de D-01 — el enum del schema
      // no alcanza (`destinationSection` solo lo conoce `destinations.ts`).
      const destResult = validateDestination({
        type: request.body.destinationType,
        section: request.body.destinationSection ?? null,
        whatsappText: request.body.whatsappText ?? null,
      });
      if (!destResult.ok) {
        return reply.code(400).send({ error: destResult.reason });
      }

      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "communications.createAviso");

      try {
        const aviso = await service.createAviso(ctx, {
          placement: request.body.placement,
          title: request.body.title,
          body: request.body.body,
          buttonText: request.body.buttonText,
          destinationType: destResult.value.type,
          destinationSection: destResult.value.section,
          whatsappText: destResult.value.whatsappText,
          frequencyType: request.body.frequencyType,
          frequencyDays: request.body.frequencyDays ?? null,
          status: request.body.status,
          startsOn: request.body.startsOn ?? null,
          endsOn: request.body.endsOn ?? null,
          scopeBranchIds: request.body.scopeBranchIds ?? null,
          scopeCountries: request.body.scopeCountries ?? null,
          scopeSegments: request.body.scopeSegments ?? null,
          sortOrder: request.body.sortOrder,
        });
        reply.code(201);
        return aviso;
      } catch (err: unknown) {
        handleServiceError(err, reply, fastify.log, "communications.createAviso");
      }
    },
  );

  // =========================================================================
  // PUT /admin/avisos/:id — actualizar (D-08..D-11, subset por kind/code)
  // =========================================================================

  fastify.put<{ Params: { id: number }; Body: UpdateAvisoBody }>(
    "/admin/avisos/:id",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...avisoIdParamsSchema,
        ...updateAvisoSchema,
        response: avisoWriteResponseSchema,
      },
    },
    async (request, reply) => {
      if (!isAdmin(request.user.role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "communications.updateAviso");

      try {
        const aviso = await service.updateAviso(ctx, request.params.id, {
          placement: request.body.placement,
          title: request.body.title,
          body: request.body.body,
          buttonText: request.body.buttonText,
          destinationType: request.body.destinationType,
          destinationSection: request.body.destinationSection,
          whatsappText: request.body.whatsappText,
          frequencyType: request.body.frequencyType,
          frequencyDays: request.body.frequencyDays,
          status: request.body.status,
          startsOn: request.body.startsOn,
          endsOn: request.body.endsOn,
          scopeBranchIds: request.body.scopeBranchIds,
          scopeCountries: request.body.scopeCountries,
          scopeSegments: request.body.scopeSegments,
          sortOrder: request.body.sortOrder,
        });
        return aviso;
      } catch (err: unknown) {
        handleServiceError(err, reply, fastify.log, "communications.updateAviso");
      }
    },
  );

  // =========================================================================
  // DELETE /admin/avisos/:id — borrar (D-11: solo custom)
  // =========================================================================

  fastify.delete<{ Params: { id: number } }>(
    "/admin/avisos/:id",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...avisoIdParamsSchema,
        response: successResponseSchema,
      },
    },
    async (request, reply) => {
      if (!isAdmin(request.user.role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "communications.deleteAviso");

      try {
        await service.deleteAviso(ctx, request.params.id);
        return { success: true };
      } catch (err: unknown) {
        handleServiceError(err, reply, fastify.log, "communications.deleteAviso");
      }
    },
  );

  // =========================================================================
  // GET /admin/avisos/:id/clickers — "ver socios" (D-18)
  // =========================================================================

  fastify.get<{ Params: { id: number }; Querystring: { limit?: number } }>(
    "/admin/avisos/:id/clickers",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...avisoIdParamsSchema,
        ...clickersQuerySchema,
        response: clickersResponseSchema,
      },
    },
    async (request, reply) => {
      if (!isAdmin(request.user.role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "communications.listAvisoClickers");

      try {
        const clickers = await service.listAvisoClickers(
          ctx,
          request.params.id,
          request.query.limit,
        );
        return { clickers };
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          fastify.log,
          "communications.listAvisoClickers",
        );
      }
    },
  );

  // =========================================================================
  // GET /admin/sales-number — leer número de WhatsApp de ventas (D-20)
  // =========================================================================

  fastify.get<{ Querystring: Record<string, never> }>(
    "/admin/sales-number",
    {
      onRequest: [fastify.authenticate],
      schema: { response: salesNumberResponseSchema },
    },
    async (request, reply) => {
      if (!isAdmin(request.user.role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "communications.getSalesNumbers");

      try {
        return await service.getSalesNumbers(ctx);
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          fastify.log,
          "communications.getSalesNumbers",
        );
      }
    },
  );

  // =========================================================================
  // PUT /admin/sales-number — escribir número de WhatsApp de ventas (D-20)
  // =========================================================================

  fastify.put<{ Body: UpdateSalesNumberBody }>(
    "/admin/sales-number",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...updateSalesNumberSchema,
        response: successResponseSchema,
      },
    },
    async (request, reply) => {
      if (!isAdmin(request.user.role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "communications.setSalesNumbers");

      try {
        await service.setSalesNumbers(ctx, request.body);
        return { success: true };
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          fastify.log,
          "communications.setSalesNumbers",
        );
      }
    },
  );
};
