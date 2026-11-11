/**
 * Rutas del estiramiento post-clase (fase 213).
 *
 * Se registran dentro de `sessionRoutes` SIN prefix, con el path relativo a
 * `/api/sessions`, para heredar el guard de `moduleScope("templo-training")`
 * (D-13), igual que `free-blocks-routes.ts`.
 */
import type { FastifyPluginAsync } from "fastify";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant } from "../shared/tenant";
import { StretchService } from "./stretch-service";
import {
  getStretchTodaySchema,
  stretchTodayResponse,
  type StretchTodayResponse,
} from "./stretch-schemas";

export const stretchRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new StretchService(fastify.db, fastify.log);

  // GET /sessions/stretch/today - Oferta de estiramiento del dia del socio.
  // Un error inesperado responde 500 y la app lo trata como "no se" (card
  // como hoy, fase 203).
  fastify.get<{ Reply: StretchTodayResponse }>(
    "/stretch/today",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...getStretchTodaySchema,
        response: stretchTodayResponse,
      },
    },
    async (request) => {
      const { userId } = request.user;

      // T-213-08: el gimnasio sale del scope del servidor, nunca del cliente.
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "sessions.stretch");

      return service.getToday(ctx, userId, new Date());
    },
  );
};
