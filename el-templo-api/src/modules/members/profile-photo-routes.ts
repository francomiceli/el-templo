// Module: members (fase 214, foto propia)
//
// Rutas del alumno para su foto de perfil (D-30, D-34, D-45, D-50), registradas
// en `app.ts` bajo `/api/members`:
//   POST   /profile-photo/upload-url        pide la URL de subida (acepta normas)
//   POST   /profile-photo/confirm           confirma la subida: queda pendiente
//   DELETE /profile-photo                   quita la foto propia y la de ficha
//   POST   /profile-photos/:photoId/report  reporta la foto de otro socio
// El `userId` sale SIEMPRE de `request.user`: ninguna ruta acepta un id de usuario.
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { FastifyBaseLogger } from "fastify";
import { attachCountryScope } from "../shared/country-scope";
import { handleServiceError } from "../shared/error-handler";
import { AppError } from "../shared/errors";
import { RATE_LIMITS } from "../shared/rate-limits";
import { assertTenant } from "../shared/tenant";
import {
  profilePhotoConfirmSchema,
  profilePhotoDeleteSchema,
  profilePhotoReportSchema,
  profilePhotoUploadUrlSchema,
} from "./profile-photo-schemas";
import {
  confirmProfilePhoto,
  removeCommunityPhoto,
  reportProfilePhoto,
  requestProfilePhotoUpload,
} from "./profile-photo-service";

/** Errores con código (503 de storage, 400/409 de la foto): `{ error, code }`. */
export function sendPhotoError(
  err: unknown,
  reply: FastifyReply,
  log: FastifyBaseLogger,
  context: string,
): void {
  if (reply.sent) return;
  if (err instanceof AppError && err.code) {
    reply.code(err.statusCode).send({ error: err.message, code: err.code });
    return;
  }
  handleServiceError(err, reply, log, context);
}

export const profilePhotoMemberRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    await attachCountryScope(request, fastify.db);
  });

  fastify.post<{ Body: { contentType: string; acceptedRules: true } }>(
    "/profile-photo/upload-url",
    {
      schema: profilePhotoUploadUrlSchema,
      config: { rateLimit: RATE_LIMITS.photoUpload },
      preHandler: fastify.rateLimit({
        ...RATE_LIMITS.photoUploadPerUser,
        keyGenerator: (request) => `photo-upload:${request.user.userId}`,
      }),
    },
    async (request, reply) => {
      try {
        const ctx = assertTenant(
          request.scope,
          "members.profile_photo.upload_url",
        );
        return await requestProfilePhotoUpload(
          fastify,
          ctx,
          request.user.userId,
          request.body.contentType,
        );
      } catch (err: unknown) {
        sendPhotoError(
          err,
          reply,
          request.log,
          "members.profile_photo.upload_url",
        );
      }
    },
  );

  fastify.post<{ Body: { key: string } }>(
    "/profile-photo/confirm",
    {
      schema: profilePhotoConfirmSchema,
      config: { rateLimit: RATE_LIMITS.photoUpload },
      preHandler: fastify.rateLimit({
        ...RATE_LIMITS.photoUploadPerUser,
        keyGenerator: (request) => `photo-confirm:${request.user.userId}`,
      }),
    },
    async (request, reply) => {
      try {
        const ctx = assertTenant(
          request.scope,
          "members.profile_photo.confirm",
        );
        const result = await confirmProfilePhoto(
          fastify,
          ctx,
          request.user.userId,
          request.body.key,
        );
        return reply.code(201).send(result);
      } catch (err: unknown) {
        sendPhotoError(
          err,
          reply,
          request.log,
          "members.profile_photo.confirm",
        );
      }
    },
  );

  fastify.delete(
    "/profile-photo",
    { schema: profilePhotoDeleteSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "members.profile_photo.remove");
        await removeCommunityPhoto(fastify, ctx, request.user.userId, null);
        return reply.code(204).send();
      } catch (err: unknown) {
        sendPhotoError(err, reply, request.log, "members.profile_photo.remove");
      }
    },
  );

  fastify.post<{ Params: { photoId: number } }>(
    "/profile-photos/:photoId/report",
    {
      schema: profilePhotoReportSchema,
      // Fase 214 D-45: el tope por IP frena el abuso del contador de reportes.
      config: { rateLimit: RATE_LIMITS.photoReport },
    },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "members.profile_photo.report");
        await reportProfilePhoto(
          fastify,
          ctx,
          request.user.userId,
          request.params.photoId,
        );
        return reply.code(204).send();
      } catch (err: unknown) {
        sendPhotoError(err, reply, request.log, "members.profile_photo.report");
      }
    },
  );
};
