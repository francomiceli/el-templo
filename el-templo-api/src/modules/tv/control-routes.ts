/**
 * Rutas de staff del TV (prefijo `/api/admin/tv`) — fase 164.
 *
 * El pairing por device token (RFC 8628) se elimino: la pantalla TV ahora es
 * una vista del admin AUTENTICADA (el usuario se loguea y la sede se autoriza
 * por scope, igual que cualquier otra pantalla del admin). Este plugin es hoy
 * la UNICA superficie del modulo — `tv_pairings` y `tv_devices` quedan en el
 * schema sin uso hasta que se decida el DROP.
 *
 * Dos capas de autorizacion, independientes:
 *   1. QUE rol  — `TV_CONTROL_ROLES` (Dueño + coach, D-01) en el hook del plugin.
 *   2. QUE sede — `requireBranchAccess` sobre `request.scope`.
 *      Sin esta segunda capa, un coach de Moreno podria leer o escribir el
 *      estado de clase de Jujuy con solo mandar otro `branchId` (T-164-12).
 */

import { FastifyPluginAsync } from "fastify";
import { TvService } from "./service";
import { handleServiceError } from "../shared/error-handler";
import { TV_CONTROL_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import { requireBranchAccess } from "../shared/branch-access";
import {
  tvControlContextSchema,
  tvControlStateSchema,
  tvControlEndClassSchema,
  tvControlScreenSchema,
  type TvControlContextQuery,
  type TvControlEndClassBody,
} from "./schemas";
import type { TvStateWrite } from "./types";

export const tvControlRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(TV_CONTROL_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Acceso requerido",
      });
    }
    await attachCountryScope(request, fastify.db);
  });

  /**
   * GET /api/admin/tv/control/context?branchId=NN
   *
   * La UNICA lectura del control del profe. El control es ciego (D-13): no
   * espeja la pantalla del TV, asi que de aca saca cuantos bloques hay, que
   * niveles existen hoy, cuantos ejercicios tiene cada (bloque, nivel) y si la
   * sesion del dia esta aprobada (D-10) para poder deshabilitar la botonera con
   * un motivo, en vez de dejar al profe apretando botones sin efecto.
   */
  fastify.get<{ Querystring: TvControlContextQuery }>(
    "/control/context",
    {
      schema: tvControlContextSchema,
      preHandler: [requireBranchAccess({ from: "query.branchId" })],
    },
    async (request, reply) => {
      try {
        const service = new TvService(fastify.db, request.log);
        const context = await service.buildControlContext(
          request.query.branchId,
        );
        return reply.send(context);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "tv control context");
      }
    },
  );

  /**
   * GET /api/admin/tv/control/screen?branchId=NN
   *
   * La proyeccion TV-facing (idle/class/closing) del estado de clase de una
   * sede, AUTENTICADA y scopeada — reemplaza al viejo `GET /api/tv/state`
   * device-authed. La pantalla del televisor ahora es una vista mas del admin:
   * el staff se loguea con su cuenta y `requireBranchAccess` decide, por su
   * scope, que sedes puede mirar.
   */
  fastify.get<{ Querystring: TvControlContextQuery }>(
    "/control/screen",
    {
      schema: tvControlScreenSchema,
      preHandler: [requireBranchAccess({ from: "query.branchId" })],
    },
    async (request, reply) => {
      try {
        const service = new TvService(fastify.db, request.log);
        const payload = await service.buildPollPayload(request.query.branchId);
        // El poll es estado vivo: ningun intermediario puede servir una copia
        // guardada, o la pantalla quedaria congelada en un bloque viejo.
        return reply.header("Cache-Control", "no-store").send(payload);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "tv control screen");
      }
    },
  );

  /**
   * POST /api/admin/tv/control/state
   *
   * Toda accion del profe (bloque, nivel, ejercicio, timer, sonido, cierre)
   * pasa por aca. Devuelve el contexto COMPLETO y clampeado, no un `ok`: el
   * control es ciego (D-13) y necesita que el server le diga como quedo el
   * estado — es tambien lo que hace que el clamp sea visible en la botonera.
   *
   * `request.user.userId` es la unica fuente del autor de la escritura
   * (T-164-44): nunca se lee del body.
   */
  fastify.post<{ Body: TvStateWrite }>(
    "/control/state",
    {
      schema: tvControlStateSchema,
      preHandler: [requireBranchAccess({ from: "body.branchId" })],
    },
    async (request, reply) => {
      try {
        const service = new TvService(fastify.db, request.log);
        const context = await service.writeState(
          request.body,
          request.user.userId,
        );
        return reply.send(context);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "tv control state");
      }
    },
  );

  /**
   * POST /api/admin/tv/control/end-class
   *
   * D-07: deja el televisor en reposo. Idempotente a proposito — el profe puede
   * apretarlo dos veces, o dos profes de la misma sede a la vez, sin error.
   */
  fastify.post<{ Body: TvControlEndClassBody }>(
    "/control/end-class",
    {
      schema: tvControlEndClassSchema,
      preHandler: [requireBranchAccess({ from: "body.branchId" })],
    },
    async (request, reply) => {
      try {
        const service = new TvService(fastify.db, request.log);
        await service.endClass(request.body.branchId);
        return reply.send({ ok: true });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "tv control end class");
      }
    },
  );
};
