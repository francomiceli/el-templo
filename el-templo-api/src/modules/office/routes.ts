/**
 * Rutas del módulo Oficina (prefijo `/api/admin/office`), Fase 205.
 *
 * Guard de rol: `OFFICE_ROLES` (owner/admin, D-10: espejo del Tablero). El resto
 * del staff (gestion, coach, recepcion, admin_sede…) recibe 403.
 */
import { FastifyPluginAsync } from "fastify";
import { OfficeService } from "./service";
import {
  getAutoTopicSettings,
  saveAutoTopicSettings,
} from "./auto-topics-settings";
import { handleServiceError } from "../shared/error-handler";
import { OFFICE_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant } from "../shared/tenant";
import {
  officeAddCommentSchema,
  officeAutoSettingsSchema,
  officeBadgeSchema,
  officeCreateTopicSchema,
  officeGetTopicSchema,
  officeListTopicsSchema,
  officePatchTopicSchema,
  officeSaveAutoSettingsSchema,
  officeSeenSchema,
  officeStaffSchema,
  type OfficeCommentBody,
  type OfficeAutoSettingsParams,
  type OfficeCreateBody,
  type OfficeListQuery,
  type OfficePatchBody,
  type OfficeSaveAutoSettingsBody,
  type OfficeTopicParams,
} from "./schemas";

export const officeRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new OfficeService(fastify.db, fastify.log);

  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(OFFICE_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Acceso requerido",
      });
    }
    await attachCountryScope(request, fastify.db);
  });

  // GET /topics — listado (despierta los dormidos vencidos antes de listar).
  fastify.get<{ Querystring: OfficeListQuery }>(
    "/topics",
    { schema: officeListTopicsSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "office.list");
        const topics = await service.listTopics(
          ctx,
          request.user.userId,
          request.query,
        );
        return reply.send({ topics });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "office list topics");
      }
    },
  );

  // POST /topics — crea un tema manual.
  fastify.post<{ Body: OfficeCreateBody }>(
    "/topics",
    { schema: officeCreateTopicSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "office.create");
        const topic = await service.createTopic(
          ctx,
          request.user.userId,
          request.body,
        );
        return reply.code(201).send({ topic });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "office create topic");
      }
    },
  );

  // GET /topics/:id — detalle con el hilo.
  fastify.get<{ Params: OfficeTopicParams }>(
    "/topics/:id",
    { schema: officeGetTopicSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "office.get");
        const topic = await service.getTopic(
          ctx,
          request.user.userId,
          request.params.id,
        );
        return reply.send({ topic });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "office get topic");
      }
    },
  );

  // PATCH /topics/:id — editar, asignar, dormir, cerrar, reabrir.
  fastify.patch<{ Params: OfficeTopicParams; Body: OfficePatchBody }>(
    "/topics/:id",
    { schema: officePatchTopicSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "office.patch");
        const topic = await service.patchTopic(
          ctx,
          request.user.userId,
          request.params.id,
          request.body,
        );
        return reply.send({ topic });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "office patch topic");
      }
    },
  );

  // POST /topics/:id/comments — comentario con menciones.
  fastify.post<{ Params: OfficeTopicParams; Body: OfficeCommentBody }>(
    "/topics/:id/comments",
    { schema: officeAddCommentSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "office.comment");
        const topic = await service.addComment(
          ctx,
          request.user.userId,
          request.params.id,
          request.body.body,
          request.body.mentionUserIds,
        );
        return reply.code(201).send({ topic });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "office add comment");
      }
    },
  );

  // POST /topics/:id/seen — marca visto + lee mis menciones del tema.
  fastify.post<{ Params: OfficeTopicParams }>(
    "/topics/:id/seen",
    { schema: officeSeenSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "office.seen");
        await service.markSeen(ctx, request.user.userId, request.params.id);
        return reply.code(204).send();
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "office mark seen");
      }
    },
  );

  // GET /badge — contador del menú (D-08).
  fastify.get(
    "/badge",
    { schema: officeBadgeSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "office.badge");
        const badge = await service.getBadge(ctx, request.user.userId);
        return reply.send(badge);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "office badge");
      }
    },
  );

  // GET /staff — personas elegibles como responsable o mención.
  fastify.get(
    "/staff",
    { schema: officeStaffSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "office.staff");
        const staff = await service.listStaff(ctx);
        return reply.send({ staff });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "office staff");
      }
    },
  );

  // GET /auto-topics/settings — qué avisos automáticos están activos, por sede.
  fastify.get(
    "/auto-topics/settings",
    { schema: officeAutoSettingsSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "office.autoSettings");
        const detectors = await getAutoTopicSettings(fastify.db, ctx);
        return reply.send({ detectors });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "office auto settings");
      }
    },
  );

  // PUT /auto-topics/settings/:detector — reemplaza los silenciados de un
  // aviso y lo vuelve a correr ya (los temas abiertos de lo apagado se cierran).
  fastify.put<{
    Params: OfficeAutoSettingsParams;
    Body: OfficeSaveAutoSettingsBody;
  }>(
    "/auto-topics/settings/:detector",
    { schema: officeSaveAutoSettingsSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "office.autoSettingsSave");
        const detector = await saveAutoTopicSettings(
          fastify.db,
          service,
          ctx,
          request.user.userId,
          request.params.detector,
          request.body,
          new Date(),
          request.log,
        );
        return reply.send({ detector });
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "office save auto settings",
        );
      }
    },
  );
};
