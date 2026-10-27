// Módulo: conquer — rutas de correcciones con video, lado del alumno (Fase 202)
//
// Se registran SOBRE la instancia del plugin del alumno (`conquerMemberRoutes`),
// así heredan `moduleScope(app, "templo-training", ...)` y el prefijo
// `/api/members/conquer`. El `userId` sale SIEMPRE de `request.user`.
// Las claves de storage y las URLs firmadas no se loguean (D-27).
//
// Fase 202 D-26/D-28: `registerCorrectionAdminRoutes` registra las del coach
// sobre la instancia de `conquerAdminRoutes` (prefijo `/api/admin/conquer`).
import type { FastifyInstance } from "fastify";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant } from "../shared/tenant";
import {
  countPendingCorrections,
  deleteCorrectionVideo,
  getAdminCorrectionVideoUrl,
  listCorrectionsForAdmin,
} from "./correction-admin-service";
import {
  createCorrection,
  getMemberCorrectionVideoUrl,
  getMemberCorrections,
  markRepliesSeen,
  requestCorrectionUpload,
  type CreateCorrectionBody,
} from "./correction-service";
import {
  adminCorrectionsCountSchema,
  adminCorrectionsSchema,
  adminCorrectionVideoUrlSchema,
  correctionUploadUrlSchema,
  correctionVideoUrlSchema,
  correctionsSeenSchema,
  createCorrectionSchema,
  deleteCorrectionVideoSchema,
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

/**
 * Bandeja del coach (D-26, D-28, DA-44..46). Se llama DESPUÉS del `addHook` de
 * `conquerAdminRoutes`: el guard `canManageConquer` es de plugin y corre en
 * `onRequest` (un `coach` recibe 403 antes de validar nada) y deja el
 * `request.scope` listo.
 */
export function registerCorrectionAdminRoutes(fastify: FastifyInstance): void {
  // GET /corrections?status=pendiente|respondida — la bandeja (DA-46).
  fastify.get<{ Querystring: { status?: string } }>(
    "/corrections",
    { schema: adminCorrectionsSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "conquer.admin.corrections");
        return await listCorrectionsForAdmin(
          fastify.db,
          ctx,
          request.query.status,
        );
      } catch (err: unknown) {
        sendConquerError(err, reply, request.log, "conquer.admin.corrections");
      }
    },
  );

  // GET /corrections/count — pendientes, para el badge del menú (DA-46).
  fastify.get(
    "/corrections/count",
    { schema: adminCorrectionsCountSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(
          request.scope,
          "conquer.admin.corrections.count",
        );
        return { count: await countPendingCorrections(fastify.db, ctx) };
      } catch (err: unknown) {
        sendConquerError(
          err,
          reply,
          request.log,
          "conquer.admin.corrections.count",
        );
      }
    },
  );

  // GET /corrections/:id/video-url?who=alumno|coach — URL firmada o "no disponible".
  fastify.get<{ Params: { id: number }; Querystring: { who: string } }>(
    "/corrections/:id/video-url",
    { schema: adminCorrectionVideoUrlSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(
          request.scope,
          "conquer.admin.corrections.video",
        );
        return await getAdminCorrectionVideoUrl(
          fastify,
          ctx,
          request.params.id,
          request.query.who,
        );
      } catch (err: unknown) {
        sendConquerError(
          err,
          reply,
          request.log,
          "conquer.admin.corrections.video",
        );
      }
    },
  );

  // DELETE /corrections/:id/video — borra el video del ALUMNO (D-28, DA-45).
  fastify.delete<{ Params: { id: number } }>(
    "/corrections/:id/video",
    { schema: deleteCorrectionVideoSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(
          request.scope,
          "conquer.admin.corrections.delete-video",
        );
        const view = await deleteCorrectionVideo(
          fastify,
          ctx,
          request.user.userId,
          request.params.id,
        );
        request.log.info(
          { correctionId: request.params.id },
          "conquer correction video deleted",
        );
        return view;
      } catch (err: unknown) {
        sendConquerError(
          err,
          reply,
          request.log,
          "conquer.admin.corrections.delete-video",
        );
      }
    },
  );
}
