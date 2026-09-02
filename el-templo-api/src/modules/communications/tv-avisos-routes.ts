/**
 * Avisos de TV — CRUD admin (D-24) + lectura del activo por sede para el
 * control del profe (D-29). Fase 193 plan 07.
 *
 * Entidad APARTE de `/api/communications/admin/avisos` (avisos de la app,
 * plan 04): sin destino, sin vigencia, sin frecuencia por socio.
 *
 * PERMISOS (D-29): las 4 rutas `/admin/tv-avisos*` son `ADMIN_ROLES` — crear,
 * editar y activar un aviso de TV es del admin, el coach NO. La ruta
 * `/control/tv-aviso-activo` es `TV_CONTROL_ROLES` (dueño + coach, mismo set
 * que gatea el resto del control ciego, `tv/control-routes.ts`) + sede
 * (`requireBranchAccess`): el profe solo consulta las sedes que opera.
 *
 * GATE DE MÓDULO (D-23): a diferencia de `communicationsRoutes` (core, sin
 * `moduleScope`), este plugin SÍ se envuelve con
 * `moduleScope(app, "templo-training", tvAvisosRoutes, ...)` en `app.ts` — es
 * la pestaña Avisos en TV, gateada por el mismo módulo que el resto del TV en
 * vivo. `tvControlRoutes` (el control existente) queda SIN `moduleScope` a
 * propósito, fuera de alcance de este plan.
 *
 * Patrón T-175-03 (igual que `communications/routes.ts`): lookup por PK
 * SIEMPRE con `tenantWhere` en el service — un `id` ajeno da 404, nunca 403.
 */
import { FastifyPluginAsync } from "fastify";
import { TvAvisosService } from "./tv-avisos-service";
import { ADMIN_ROLES, TV_CONTROL_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant } from "../shared/tenant";
import { requireBranchAccess } from "../shared/branch-access";
import { handleServiceError } from "../shared/error-handler";
import {
  createTvAvisoSchema,
  updateTvAvisoSchema,
  tvAvisoIdParamsSchema,
  tvAvisoActivoQuerySchema,
  listTvAvisosResponseSchema,
  tvAvisoWriteResponseSchema,
  tvAvisoActivoResponseSchema,
  type CreateTvAvisoBody,
  type UpdateTvAvisoBody,
  type TvAvisoActivoQuery,
} from "./schemas";

export const tvAvisosRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new TvAvisosService(fastify.db, fastify.log);

  // Compartido por las 5 rutas: autenticar + resolver `request.scope`. El
  // chequeo de ROL se hace por handler (los sets difieren: admin vs
  // dueño+coach) — mismo estilo que `communications/routes.ts` (`isAdmin`).
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    await attachCountryScope(request, fastify.db);
  });

  function isAdmin(role: string): boolean {
    return (ADMIN_ROLES as readonly string[]).includes(role);
  }

  function isTvControl(role: string): boolean {
    return (TV_CONTROL_ROLES as readonly string[]).includes(role);
  }

  // =========================================================================
  // GET /admin/tv-avisos — listar (D-29: admin)
  // =========================================================================

  fastify.get<{ Querystring: Record<string, never> }>(
    "/admin/tv-avisos",
    {
      schema: { response: listTvAvisosResponseSchema },
    },
    async (request, reply) => {
      if (!isAdmin(request.user.role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      const ctx = assertTenant(request.scope, "tvAvisos.list");

      try {
        const avisos = await service.list(ctx);
        return { avisos };
      } catch (err: unknown) {
        handleServiceError(err, reply, fastify.log, "tvAvisos.list");
      }
    },
  );

  // =========================================================================
  // POST /admin/tv-avisos — crear (D-24, D-29: admin)
  // =========================================================================

  fastify.post<{ Body: CreateTvAvisoBody }>(
    "/admin/tv-avisos",
    {
      schema: {
        ...createTvAvisoSchema,
        response: tvAvisoWriteResponseSchema,
      },
    },
    async (request, reply) => {
      if (!isAdmin(request.user.role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      const ctx = assertTenant(request.scope, "tvAvisos.create");

      try {
        const aviso = await service.create(ctx, {
          title: request.body.title,
          body: request.body.body,
          mode: request.body.mode,
          isActive: request.body.isActive,
          scopeBranchIds: request.body.scopeBranchIds ?? null,
        });
        reply.code(201);
        return aviso;
      } catch (err: unknown) {
        handleServiceError(err, reply, fastify.log, "tvAvisos.create");
      }
    },
  );

  // =========================================================================
  // PUT /admin/tv-avisos/:id — actualizar (D-29: admin)
  // =========================================================================

  fastify.put<{ Params: { id: number }; Body: UpdateTvAvisoBody }>(
    "/admin/tv-avisos/:id",
    {
      schema: {
        ...tvAvisoIdParamsSchema,
        ...updateTvAvisoSchema,
        response: tvAvisoWriteResponseSchema,
      },
    },
    async (request, reply) => {
      if (!isAdmin(request.user.role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      const ctx = assertTenant(request.scope, "tvAvisos.update");

      try {
        const aviso = await service.update(ctx, request.params.id, {
          title: request.body.title,
          body: request.body.body,
          mode: request.body.mode,
          isActive: request.body.isActive,
          scopeBranchIds: request.body.scopeBranchIds,
        });
        return aviso;
      } catch (err: unknown) {
        handleServiceError(err, reply, fastify.log, "tvAvisos.update");
      }
    },
  );

  // =========================================================================
  // DELETE /admin/tv-avisos/:id — borrar (D-29: admin; T-193-28: limpia
  // tv_class_state antes del DELETE, ver el service)
  // =========================================================================

  fastify.delete<{ Params: { id: number } }>(
    "/admin/tv-avisos/:id",
    {
      schema: { ...tvAvisoIdParamsSchema },
    },
    async (request, reply) => {
      if (!isAdmin(request.user.role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      const ctx = assertTenant(request.scope, "tvAvisos.remove");

      try {
        await service.remove(ctx, request.params.id);
        return { success: true };
      } catch (err: unknown) {
        handleServiceError(err, reply, fastify.log, "tvAvisos.remove");
      }
    },
  );

  // =========================================================================
  // GET /control/tv-aviso-activo?branchId=NN — el aviso manual activo de la
  // sede (D-29: dueño + coach, MÁS sede — `requireBranchAccess`)
  // =========================================================================

  fastify.get<{ Querystring: TvAvisoActivoQuery }>(
    "/control/tv-aviso-activo",
    {
      schema: {
        ...tvAvisoActivoQuerySchema,
        response: tvAvisoActivoResponseSchema,
      },
      preHandler: [
        async (request, reply) => {
          if (!isTvControl(request.user.role)) {
            return reply.code(403).send({ error: "Acceso denegado" });
          }
        },
        requireBranchAccess({ from: "query.branchId" }),
      ],
    },
    async (request, reply) => {
      const ctx = assertTenant(request.scope, "tvAvisos.getActiveForBranch");

      try {
        const aviso = await service.getActiveForBranch(
          ctx,
          request.query.branchId,
          "manual",
        );
        return {
          aviso: aviso
            ? {
                id: aviso.id,
                title: aviso.title,
                body: aviso.body,
                mode: aviso.mode,
              }
            : null,
        };
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          fastify.log,
          "tvAvisos.getActiveForBranch",
        );
      }
    },
  );
};
