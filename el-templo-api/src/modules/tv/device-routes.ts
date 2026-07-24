/**
 * Rutas del televisor (prefijo `/api/tv`) — fase 164.
 *
 * Este plugin NO registra el hook de autenticacion JWT ni el de scope de pais
 * (los dos que sí usa `control-routes.ts`): el TV no es un usuario. No tiene
 * JWT, no tiene rol y no tiene scope — solo un token opaco de dispositivo que lo
 * ata a UNA sede. Por eso vive separado de
 * `control-routes.ts` (mismo criterio que coachRoutes / coachLoadRoutes en
 * `app.ts`: guards incompatibles ⇒ dos registros).
 *
 * Hay dos niveles de acceso adentro del plugin:
 *
 *   /pair/*  → PUBLICAS. El TV todavia no tiene token: si estas rutas exigieran
 *              credenciales no habria forma de vincular un televisor nuevo. Su
 *              seguridad no viene de un guard sino del split RFC 8628: sin el
 *              `device_code` secreto no se retira ningun token (Pitfall 10).
 *
 *   el resto → autenticadas por `makeDeviceAuth` en un `register` ANIDADO. La
 *              encapsulacion de Fastify hace que el hook aplique solo adentro de
 *              ese scope, asi que `/pair/*` queda estructuralmente afuera del
 *              guard: no depende de acordarse de excluirla ruta por ruta.
 */

import { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { TvPairingService } from "./pairing";
import { TvService } from "./service";
import { makeDeviceAuth } from "./device-auth";
import { handleServiceError } from "../shared/error-handler";
import {
  tvPairStartSchema,
  tvPairStatusSchema,
  tvStateSchema,
  type TvPairStatusQuery,
} from "./schemas";
import * as schema from "../../db/schema";

export const tvDeviceRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /api/tv/pair/start — publica.
   *
   * Devuelve el par (userCode visible / deviceCode secreto) una sola vez. El
   * `deviceCode` no se loguea ni se muestra: el kiosco lo guarda en localStorage.
   */
  fastify.post(
    "/pair/start",
    { schema: tvPairStartSchema },
    async (request, reply) => {
      try {
        const pairing = new TvPairingService(fastify.db, request.log);
        return reply.code(201).send(await pairing.start());
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "tv pair start");
      }
    },
  );

  /**
   * GET /api/tv/pair/status?deviceCode=... — publica.
   *
   * El poll viaja con el SECRETO, nunca con el `user_code` de la pantalla. Es la
   * unica ruta que emite el device token, y lo emite exactamente una vez.
   * `unknown` responde 404 para que el kiosco distinga "pairing borrado, generá
   * uno nuevo" de "todavía nadie me reclamó".
   */
  fastify.get<{ Querystring: TvPairStatusQuery }>(
    "/pair/status",
    { schema: tvPairStatusSchema },
    async (request, reply) => {
      try {
        const pairing = new TvPairingService(fastify.db, request.log);
        const result = await pairing.consume(request.query.deviceCode);
        if (result.status === "unknown") return reply.code(404).send(result);
        return reply.send(result);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "tv pair status");
      }
    },
  );

  /**
   * Scope autenticado por dispositivo. Los planes siguientes de la fase cuelgan
   * de aca el poll del estado de clase; hoy expone el chequeo de vinculacion que
   * el kiosco hace al arrancar (y que es lo que le devuelve 401 cuando alguien
   * revoco el televisor desde el panel — D-03).
   */
  await fastify.register(async (deviceScope) => {
    deviceScope.addHook("onRequest", makeDeviceAuth(deviceScope.db));

    /**
     * GET /api/tv/me — quien soy y de que sede soy.
     *
     * Sin un solo dato de socio: el TV es una pantalla publica colgada en la
     * sala (T-164-08).
     */
    deviceScope.get("/me", async (request, reply) => {
      try {
        const [branch] = await deviceScope.db
          .select({ name: schema.branches.name })
          .from(schema.branches)
          .where(eq(schema.branches.id, request.tvDevice.branchId))
          .limit(1);

        return reply.send({
          deviceId: request.tvDevice.id,
          branchId: request.tvDevice.branchId,
          branchName: branch?.name ?? null,
        });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "tv device me");
      }
    });

    /**
     * GET /api/tv/state — el poll del televisor (cada 2.5 s).
     *
     * Es la unica ruta que el kiosco consume en operacion normal: todo lo que
     * este mal aca se ve en la pared de la sede.
     *
     * La sede sale de `request.tvDevice.branchId`, es decir de la FILA del
     * dispositivo. La ruta no acepta —ni podria— ningun parametro de sucursal:
     * un televisor comprometido no puede leer la clase de otra sede (T-164-31).
     *
     * D-09: sin sesion aprobada la respuesta es `screen: "idle"` sin un solo
     * campo de error. Un socio parado frente al TV no puede distinguir "no hay
     * clase ahora" de "el profe no aprobo la sesion".
     */
    deviceScope.get(
      "/state",
      { schema: tvStateSchema },
      async (request, reply) => {
        try {
          const service = new TvService(deviceScope.db, request.log);
          const payload = await service.buildPollPayload(request.tvDevice);
          // El poll es estado vivo: ningun intermediario puede servir una copia
          // guardada, o el TV quedaria congelado en un bloque viejo.
          return reply.header("Cache-Control", "no-store").send(payload);
        } catch (err: unknown) {
          handleServiceError(err, reply, request.log, "tv poll state");
        }
      },
    );
  });
};
