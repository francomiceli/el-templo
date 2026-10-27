// Módulo: conquer — rutas de correcciones con video, lado del alumno (Fase 202)
//
// Se registran SOBRE la instancia del plugin del alumno (`conquerMemberRoutes`),
// así heredan `moduleScope(app, "templo-training", ...)` y el prefijo
// `/api/members/conquer`. El `userId` sale SIEMPRE de `request.user`.
// Las claves de storage y las URLs firmadas no se loguean (D-27).
import type { FastifyInstance } from "fastify";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant } from "../shared/tenant";
import {
  createCorrection,
  getMemberCorrectionVideoUrl,
  getMemberCorrections,
  markRepliesSeen,
  requestCorrectionUpload,
  type CreateCorrectionBody,
} from "./correction-service";
import {
  correctionUploadUrlSchema,
  correctionVideoUrlSchema,
  correctionsSeenSchema,
  createCorrectionSchema,
  memberCorrectionsSchema,
} from "./correction-schemas";
import { sendConquerError } from "./errors";

export function registerCorrectionMemberRoutes(fastify: FastifyInstance): void {
  // GET /corrections — las 50 más nuevas + lo que puede mandar + topes (DA-47).
  fastify.get(
    "/corrections",
    { onRequest: [fastify.authenticate], schema: memberCorrectionsSchema },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(request.scope, "conquer.member.corrections");
        return await getMemberCorrections(fastify.db, ctx, request.user.userId);
      } catch (err: unknown) {
        sendConquerError(err, reply, request.log, "conquer.member.corrections");
      }
    },
  );

  // POST /corrections/upload-url — URL firmada al bucket privado (DA-39, DA-42).
  fastify.post<{ Body: { contentType: string } }>(
    "/corrections/upload-url",
    { onRequest: [fastify.authenticate], schema: correctionUploadUrlSchema },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(
          request.scope,
          "conquer.member.corrections.upload",
        );
        return await requestCorrectionUpload(
          fastify,
          ctx,
          request.user.userId,
          request.body.contentType,
        );
      } catch (err: unknown) {
        sendConquerError(
          err,
          reply,
          request.log,
          "conquer.member.corrections.upload",
        );
      }
    },
  );

  // POST /corrections — confirma el video (HEAD) y crea la corrección (D-26).
  fastify.post<{ Body: CreateCorrectionBody }>(
    "/corrections",
    { onRequest: [fastify.authenticate], schema: createCorrectionSchema },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(
          request.scope,
          "conquer.member.corrections.create",
        );
        const created = await createCorrection(
          fastify,
          ctx,
          request.user.userId,
          request.body,
        );
        reply.code(201);
        return created;
      } catch (err: unknown) {
        sendConquerError(
          err,
          reply,
          request.log,
          "conquer.member.corrections.create",
        );
      }
    },
  );

  // GET /corrections/:id/video-url — URL firmada de UN video de una corrección
  // propia (DA-44). Video borrado o vencido = 200 `{ available: false }`.
  fastify.get<{ Params: { id: number }; Querystring: { who: string } }>(
    "/corrections/:id/video-url",
    { onRequest: [fastify.authenticate], schema: correctionVideoUrlSchema },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(
          request.scope,
          "conquer.member.corrections.video",
        );
        return await getMemberCorrectionVideoUrl(
          fastify,
          ctx,
          request.user.userId,
          request.params.id,
          request.query.who,
        );
      } catch (err: unknown) {
        sendConquerError(
          err,
          reply,
          request.log,
          "conquer.member.corrections.video",
        );
      }
    },
  );

  // POST /corrections/seen — marca vistas las respuestas del alumno (DA-46).
  // No choca con `POST /corrections`: el path es otro.
  fastify.post(
    "/corrections/seen",
    { onRequest: [fastify.authenticate], schema: correctionsSeenSchema },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(
          request.scope,
          "conquer.member.corrections.seen",
        );
        return await markRepliesSeen(fastify.db, ctx, request.user.userId);
      } catch (err: unknown) {
        sendConquerError(
          err,
          reply,
          request.log,
          "conquer.member.corrections.seen",
        );
      }
    },
  );
}
