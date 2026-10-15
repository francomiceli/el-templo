// Module: sponsors — admin-routes (fase 199, plan 03).
//
// Administración de patrocinadores de PLATAFORMA (D-18/D-26): solo owner/admin
// del tenant El Templo. Un único guard de plugin (`onRequest`) con
// `isTemploPlatformAdmin` cubre las 7 rutas (T-199-10): cualquier otro rol u
// otro gimnasio recibe 403 antes de llegar a un handler.
//
// Orden de guards (lección 173): primero auth/tenancy/plataforma, DESPUÉS la
// infraestructura (R2 -> 503) en `/logo-upload-url`.
//
// Las reglas de negocio (contraste, límite por país, fechas, prefijo del logo)
// viven en `SponsorsService`; las rutas dejan que tire y `handleServiceError`
// mapea.

import { FastifyPluginAsync } from "fastify";
import { SponsorsService } from "./service";
import { SettingsService } from "../settings/service";
import { BlogImageService } from "../blog/image-service";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant } from "../shared/tenant";
import { handleServiceError } from "../shared/error-handler";
import { isTemploPlatformAdmin } from "../shared/platform";
import {
  SPONSOR_LOGO_PREFIX,
  createSponsorSchema,
  updateSponsorSchema,
  sponsorIdParamsSchema,
  sponsorsSettingsSchema,
  logoUploadSchema,
  listSponsorsResponseSchema,
  sponsorWriteResponseSchema,
  sponsorsSettingsResponseSchema,
  logoUploadResponseSchema,
  successResponseSchema,
  type CreateSponsorBody,
  type UpdateSponsorBody,
  type SponsorsSettingsBody,
  type LogoUploadBody,
} from "./schemas";

export const sponsorsAdminRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new SponsorsService(
    fastify.db,
    fastify.log,
    new SettingsService(fastify.db, fastify.log),
  );

  // Guard único "solo El Templo" (D-26).
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (reply.sent) return;
    await attachCountryScope(request, fastify.db);
    const ctx = assertTenant(request.scope, "sponsors.admin");
    if (!isTemploPlatformAdmin(request.user.role, ctx)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Solo el equipo de El Templo administra patrocinadores",
      });
    }
  });

  // GET / — catálogo completo con métricas + límite vigente
  fastify.get(
    "/",
    { schema: { response: listSponsorsResponseSchema } },
    async (request, reply) => {
      const ctx = assertTenant(request.scope, "sponsors.list");
      try {
        return {
          sponsors: await service.listAdmin(ctx),
          maxActivePerCountry: await service.getMaxActivePerCountry(),
        };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "sponsors.list");
      }
    },
  );

  // POST / — alta
  fastify.post<{ Body: CreateSponsorBody }>(
    "/",
    {
      schema: { ...createSponsorSchema, response: sponsorWriteResponseSchema },
    },
    async (request, reply) => {
      const ctx = assertTenant(request.scope, "sponsors.create");
      try {
        const sponsor = await service.create(
          ctx,
          request.body,
          request.user.userId,
        );
        reply.code(201);
        return { sponsor };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "sponsors.create");
      }
    },
  );

  // GET /settings — límite de activas por país (D-24)
  fastify.get(
    "/settings",
    { schema: { response: sponsorsSettingsResponseSchema } },
    async (request, reply) => {
      assertTenant(request.scope, "sponsors.settings.get");
      try {
        return { maxActivePerCountry: await service.getMaxActivePerCountry() };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "sponsors.settings.get");
      }
    },
  );

  // PUT /settings — guardar el límite
  fastify.put<{ Body: SponsorsSettingsBody }>(
    "/settings",
    {
      schema: {
        ...sponsorsSettingsSchema,
        response: sponsorsSettingsResponseSchema,
      },
    },
    async (request, reply) => {
      assertTenant(request.scope, "sponsors.settings.set");
      try {
        await service.setMaxActivePerCountry(request.body.maxActivePerCountry);
        return { maxActivePerCountry: await service.getMaxActivePerCountry() };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "sponsors.settings.set");
      }
    },
  );

  // POST /logo-upload-url — URL prefirmada de R2 bajo `sponsors/logos/`
  fastify.post<{ Body: LogoUploadBody }>(
    "/logo-upload-url",
    {
      schema: { ...logoUploadSchema, response: logoUploadResponseSchema },
    },
    async (request, reply) => {
      assertTenant(request.scope, "sponsors.logoUploadUrl");
      if (!fastify.r2) {
        return reply
          .code(503)
          .send({ error: "Almacenamiento de imagenes no configurado" });
      }
      try {
        const imageService = new BlogImageService(
          fastify.r2,
          fastify.r2Bucket,
          request.log,
        );
        return await imageService.generateUploadUrl(
          request.body.filename,
          SPONSOR_LOGO_PREFIX,
        );
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "sponsors.logoUploadUrl");
      }
    },
  );

  // PUT /:id — edición parcial
  fastify.put<{ Params: { id: number }; Body: UpdateSponsorBody }>(
    "/:id",
    {
      schema: {
        ...sponsorIdParamsSchema,
        ...updateSponsorSchema,
        response: sponsorWriteResponseSchema,
      },
    },
    async (request, reply) => {
      const ctx = assertTenant(request.scope, "sponsors.update");
      try {
        const sponsor = await service.update(
          ctx,
          request.params.id,
          request.body,
        );
        return { sponsor };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "sponsors.update");
      }
    },
  );

  // DELETE /:id — baja (las vistas caen por cascade)
  fastify.delete<{ Params: { id: number } }>(
    "/:id",
    {
      schema: { ...sponsorIdParamsSchema, response: successResponseSchema },
    },
    async (request, reply) => {
      const ctx = assertTenant(request.scope, "sponsors.remove");
      try {
        await service.remove(ctx, request.params.id);
        return { success: true };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "sponsors.remove");
      }
    },
  );
};
